import { EventEmitter } from "events"

import type { ExitCodeDetails, KitPilotTerminal, KitPilotTerminalProcess } from "../../integrations/terminal/types"

/**
 * Registry of commands the agent started with `run_in_background`.
 *
 * Each entry is a live (or recently exited) process addressable by a small
 * integer id that the model holds as a handle (`check_task`, `stop_task`).
 * The registry does NOT subscribe to terminal process events itself — the
 * background path in ExecuteCommandTool wires slim callbacks that feed
 * `appendOutput` / `notifyExit`, because `process.continue()` (the existing
 * backgrounding mechanism) stops "line" emission entirely; keeping the
 * callback wiring in the tool lets output keep streaming here live, which is
 * what makes `notify_on` pattern matching possible.
 *
 * Lifecycle: background processes deliberately SURVIVE the agent task that
 * started them (a dev server should stay up between conversations). They die
 * on explicit `stop_task`, process exit, or extension deactivation
 * (`disposeAll`). Exited entries are pruned once their output has been
 * consumed, keeping the registry small.
 */

export type BackgroundTaskStatus = "running" | "exited" | "killed"

export interface BackgroundTask {
	id: number
	/** Agent Task that started this process (informational; survival is global). */
	agentTaskId: string
	command: string
	cwd: string
	terminal: KitPilotTerminal
	process: KitPilotTerminalProcess
	/** Execution id used by OutputInterceptor artifacts + webview status rows. */
	executionId: string
	startedAt: number
	status: BackgroundTaskStatus
	exitDetails?: ExitCodeDetails
	/** Artifact file (cmd-*.txt) once the interceptor finalizes at exit. */
	artifactId?: string
	notifyOn?: RegExp
	notifyOnMatched: boolean
	/**
	 * True for commands backgrounded via the legacy agent-timeout path, where
	 * `process.continue()` already stopped line events: output is then read
	 * through `process.getUnretrievedOutput()` instead of the rolling buffer,
	 * and notify_on pattern matching is unavailable.
	 */
	detached: boolean
	/** Bounded rolling output buffer; the single model-facing output source. */
	outputBuffer: string
	/** Bytes of buffer already trimmed away (buffer start offset in stream coords). */
	bufferStart: number
	/** Absolute stream position the model has read up to (check_task cursor). */
	cursor: number
}

export interface BackgroundTaskEvents {
	/** Process exited on its own (NOT emitted for stop_task kills). */
	taskExited: [task: BackgroundTask]
	/** notify_on regex matched output for the first time. */
	patternMatched: [task: BackgroundTask, matchedLine: string]
}

/** Cap on the in-memory rolling buffer per task (same bound the foreground path uses for UI). */
const MAX_OUTPUT_BUFFER = 100_000

/** Keep at most this many exited/killed entries around for late check_task calls. */
const MAX_FINISHED_ENTRIES = 20

export class BackgroundTaskRegistry {
	private static tasks = new Map<number, BackgroundTask>()
	private static nextId = 1
	static readonly events = new EventEmitter<BackgroundTaskEvents>()

	static register(entry: {
		agentTaskId: string
		command: string
		cwd: string
		terminal: KitPilotTerminal
		process: KitPilotTerminalProcess
		executionId: string
		notifyOn?: RegExp
		detached?: boolean
		/**
		 * Output produced before registration (the start grace window) that the
		 * caller already delivered to the model inline: seeds the buffer with
		 * the cursor at the end, and silently satisfies notify_on if it already
		 * matches (the caller reports that inline too).
		 */
		seedOutput?: string
	}): BackgroundTask {
		const task: BackgroundTask = {
			id: this.nextId++,
			agentTaskId: entry.agentTaskId,
			command: entry.command,
			cwd: entry.cwd,
			terminal: entry.terminal,
			process: entry.process,
			executionId: entry.executionId,
			startedAt: Date.now(),
			status: "running",
			notifyOn: entry.detached ? undefined : entry.notifyOn,
			notifyOnMatched: false,
			detached: entry.detached ?? false,
			outputBuffer: "",
			bufferStart: 0,
			cursor: 0,
		}
		if (entry.seedOutput && !task.detached) {
			task.outputBuffer = entry.seedOutput.slice(-MAX_OUTPUT_BUFFER)
			task.cursor = task.outputBuffer.length
			if (task.notifyOn?.test(entry.seedOutput)) {
				task.notifyOnMatched = true
			}
		}
		this.tasks.set(task.id, task)
		this.pruneFinished()
		return task
	}

	static get(id: number): BackgroundTask | undefined {
		return this.tasks.get(id)
	}

	static list(): BackgroundTask[] {
		return Array.from(this.tasks.values())
	}

	static running(): BackgroundTask[] {
		return this.list().filter((t) => t.status === "running")
	}

	/** Feed a chunk of process output. Called from the tool's onLine callback. */
	static appendOutput(id: number, text: string): void {
		const task = this.tasks.get(id)
		if (!task || !text) {
			return
		}

		task.outputBuffer += text
		if (task.outputBuffer.length > MAX_OUTPUT_BUFFER) {
			const overflow = task.outputBuffer.length - MAX_OUTPUT_BUFFER
			task.outputBuffer = task.outputBuffer.slice(overflow)
			// The cursor is NOT clamped here: readNewOutput clamps at read time
			// and reports the cursor→bufferStart gap as skippedBytes so the
			// model knows output was evicted between checks.
			task.bufferStart += overflow
		}

		if (task.notifyOn && !task.notifyOnMatched && task.status === "running") {
			const match = task.notifyOn.exec(text)
			if (match) {
				task.notifyOnMatched = true
				const matchedLine = text.split("\n").find((line) => task.notifyOn!.test(line)) ?? match[0]
				this.events.emit("patternMatched", task, matchedLine.trim())
			}
		}
	}

	/** Record process exit. Called from the tool's onShellExecutionComplete callback. */
	static notifyExit(id: number, exitDetails: ExitCodeDetails): void {
		const task = this.tasks.get(id)
		if (!task || task.status !== "running") {
			return
		}
		task.status = "exited"
		task.exitDetails = exitDetails
		this.events.emit("taskExited", task)
	}

	static setArtifactId(id: number, artifactId: string): void {
		const task = this.tasks.get(id)
		if (task) {
			task.artifactId = artifactId
		}
	}

	/**
	 * New output since the model's last read (check_task). Advances the cursor.
	 * Returns undefined when the id is unknown.
	 */
	static readNewOutput(id: number): { text: string; skippedBytes: number } | undefined {
		const task = this.tasks.get(id)
		if (!task) {
			return undefined
		}
		if (task.detached) {
			// Legacy-backgrounded process: line events are dead, pull from the
			// process's own unretrieved-output tracking instead.
			let text = ""
			try {
				text = task.process.getUnretrievedOutput()
			} catch {
				// Process object may already be torn down; treat as no output.
			}
			this.maybePrune(task)
			return { text, skippedBytes: 0 }
		}
		// Content between cursor and bufferStart was evicted by the rolling cap.
		const skippedBytes = Math.max(0, task.bufferStart - task.cursor)
		const readFrom = Math.max(task.cursor, task.bufferStart)
		const text = task.outputBuffer.slice(readFrom - task.bufferStart)
		task.cursor = task.bufferStart + task.outputBuffer.length
		this.maybePrune(task)
		return { text, skippedBytes }
	}

	/** Peek at the most recent output without moving the model's cursor (for notifications/UI). */
	static peekTail(id: number, maxChars: number): string {
		const task = this.tasks.get(id)
		if (!task) {
			return ""
		}
		return task.outputBuffer.slice(-maxChars)
	}

	/** Whether there is output the model hasn't read via check_task yet. */
	static hasUnreadOutput(id: number): boolean {
		const task = this.tasks.get(id)
		if (!task) {
			return false
		}
		if (task.detached) {
			try {
				return task.process.hasUnretrievedOutput()
			} catch {
				return false
			}
		}
		return task.bufferStart + task.outputBuffer.length > task.cursor
	}

	/**
	 * Mark output up to the current end as delivered (e.g. a notification carried
	 * the tail), so env details / check_task don't re-deliver it.
	 */
	static markDelivered(id: number): void {
		const task = this.tasks.get(id)
		if (!task) {
			return
		}
		if (task.detached) {
			try {
				// Consuming advances the process's own retrieved-output index.
				task.process.getUnretrievedOutput()
			} catch {
				// Torn-down process: nothing to consume.
			}
		} else {
			task.cursor = task.bufferStart + task.outputBuffer.length
		}
		this.maybePrune(task)
	}

	/**
	 * Kill a background task (SIGKILL to the process tree via the terminal
	 * process abort). No taskExited event — the caller asked for the kill and
	 * gets the outcome inline.
	 */
	static stop(id: number): BackgroundTask | undefined {
		const task = this.tasks.get(id)
		if (!task) {
			return undefined
		}
		if (task.status === "running") {
			task.status = "killed"
			try {
				task.process.abort()
			} catch (error) {
				console.error(
					`[BackgroundTaskRegistry] abort failed for task #${id}:`,
					error instanceof Error ? error.message : error,
				)
			}
		}
		return task
	}

	/** Kill everything (extension deactivation). */
	static disposeAll(): void {
		for (const task of this.tasks.values()) {
			if (task.status === "running") {
				task.status = "killed"
				try {
					task.process.abort()
				} catch {
					// Best-effort on shutdown.
				}
			}
		}
		this.tasks.clear()
		this.events.removeAllListeners()
	}

	/** Terminal ids owned by registry tasks (for env-details dedupe). */
	static ownedTerminalIds(): Set<number> {
		return new Set(this.list().map((t) => t.terminal.id))
	}

	/** Drop a finished task once its output has been fully consumed. */
	private static maybePrune(task: BackgroundTask): void {
		if (task.status !== "running" && !this.hasUnreadOutput(task.id)) {
			this.tasks.delete(task.id)
		}
	}

	/** Bound the number of finished entries kept for late reads. */
	private static pruneFinished(): void {
		const finished = this.list().filter((t) => t.status !== "running")
		if (finished.length <= MAX_FINISHED_ENTRIES) {
			return
		}
		finished
			.sort((a, b) => a.startedAt - b.startedAt)
			.slice(0, finished.length - MAX_FINISHED_ENTRIES)
			.forEach((t) => this.tasks.delete(t.id))
	}

	/** Test-only: reset all state. */
	static resetForTests(): void {
		this.tasks.clear()
		this.nextId = 1
		this.events.removeAllListeners()
	}
}
