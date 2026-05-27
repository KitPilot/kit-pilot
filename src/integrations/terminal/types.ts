import EventEmitter from "events"

export type KitPilotTerminalProvider = "vscode" | "execa"

export interface KitPilotTerminal {
	provider: KitPilotTerminalProvider
	id: number
	busy: boolean
	running: boolean
	taskId?: string
	process?: KitPilotTerminalProcess
	getCurrentWorkingDirectory(): string
	isClosed: () => boolean
	runCommand: (command: string, callbacks: KitPilotTerminalCallbacks) => KitPilotTerminalProcessResultPromise
	setActiveStream(stream: AsyncIterable<string> | undefined, pid?: number): void
	shellExecutionComplete(exitDetails: ExitCodeDetails): void
	getProcessesWithOutput(): KitPilotTerminalProcess[]
	getUnretrievedOutput(): string
	getLastCommand(): string
	cleanCompletedProcessQueue(): void
}

export interface KitPilotTerminalCallbacks {
	onLine: (line: string, process: KitPilotTerminalProcess) => void
	onCompleted: (output: string | undefined, process: KitPilotTerminalProcess) => void | Promise<void>
	onShellExecutionStarted: (pid: number | undefined, process: KitPilotTerminalProcess) => void
	onShellExecutionComplete: (details: ExitCodeDetails, process: KitPilotTerminalProcess) => void
	onNoShellIntegration?: (message: string, process: KitPilotTerminalProcess) => void
}

export interface KitPilotTerminalProcess extends EventEmitter<KitPilotTerminalProcessEvents> {
	command: string
	isHot: boolean
	run: (command: string) => Promise<void>
	continue: () => void
	abort: () => void
	hasUnretrievedOutput: () => boolean
	getUnretrievedOutput: () => string
	trimRetrievedOutput: () => void
}

export type KitPilotTerminalProcessResultPromise = KitPilotTerminalProcess & Promise<void>

export interface KitPilotTerminalProcessEvents {
	line: [line: string]
	continue: []
	completed: [output?: string]
	stream_available: [stream: AsyncIterable<string>]
	shell_execution_started: [pid: number | undefined]
	shell_execution_complete: [exitDetails: ExitCodeDetails]
	error: [error: Error]
	no_shell_integration: [message: string]
}

export interface ExitCodeDetails {
	exitCode: number | undefined
	signal?: number | undefined
	signalName?: string
	coreDumpPossible?: boolean
}
