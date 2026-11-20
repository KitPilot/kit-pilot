import { containsDangerousSubstitution, containsEmbeddedAskCommand, getCommandDecision } from "../commands"

describe("containsDangerousSubstitution", () => {
	describe("zsh array assignments (should NOT be flagged)", () => {
		it("should return false for files=(a b c)", () => {
			expect(containsDangerousSubstitution("files=(a b c)")).toBe(false)
		})

		it("should return false for var=(item1 item2)", () => {
			expect(containsDangerousSubstitution("var=(item1 item2)")).toBe(false)
		})

		it("should return false for x=(hello)", () => {
			expect(containsDangerousSubstitution("x=(hello)")).toBe(false)
		})
	})

	describe("zsh process substitution (should be flagged)", () => {
		it("should return true for standalone =(whoami)", () => {
			expect(containsDangerousSubstitution("=(whoami)")).toBe(true)
		})

		it("should return true for =(ls) with leading space", () => {
			expect(containsDangerousSubstitution(" =(ls)")).toBe(true)
		})

		it("should return true for echo =(cat /etc/passwd)", () => {
			expect(containsDangerousSubstitution("echo =(cat /etc/passwd)")).toBe(true)
		})
	})
})

describe("getCommandDecision", () => {
	it("should auto_approve array assignment command with wildcard allowlist", () => {
		const command = 'files=(a.ts b.ts); for f in "${files[@]}"; do echo "$f"; done'
		const result = getCommandDecision(command, ["*"])
		expect(result).toBe("auto_approve")
	})
})

describe("containsDangerousSubstitution — node -e one-liner false positive regression", () => {
	const nodeOneLiner = `node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('prd.json','utf8'));const allowed=new Set(['pending','in-progress','complete','blocked']);const bad=(p.items||[]).filter(i=>!allowed.has(i.status));console.log('meta.status',p.meta?.status);console.log('workstreams', (p.workstreams||[]).length);console.log('items', (p.items||[]).length);console.log('statusCounts', (p.items||[]).reduce((a,i)=>(a[i.status]=(a[i.status]||0)+1,a),{}));console.log('invalidStatuses', bad.length);if(bad.length){console.log(bad.map(i=>i.id+':'+i.status).join('\\\\n'));process.exit(2);} "`

	it("should NOT flag the complex node -e one-liner as dangerous substitution", () => {
		expect(containsDangerousSubstitution(nodeOneLiner)).toBe(false)
	})
})

describe("containsDangerousSubstitution — arrow function patterns (should NOT be flagged)", () => {
	it("should return false for node -e with simple arrow function", () => {
		expect(containsDangerousSubstitution(`node -e "const a=(b)=>b"`)).toBe(false)
	})

	it("should return false for node -e with spaced arrow function", () => {
		expect(containsDangerousSubstitution(`node -e "const fn = (x) => x * 2"`)).toBe(false)
	})

	it("should return false for node -e with arrow function in method chain", () => {
		expect(containsDangerousSubstitution(`node -e "arr.filter(i=>!set.has(i))"`)).toBe(false)
	})
})

describe("containsDangerousSubstitution — true positives still caught", () => {
	it("should flag dangerous parameter expansion ${var@P}", () => {
		expect(containsDangerousSubstitution('echo "${var@P}"')).toBe(true)
	})

	it("should flag here-string with command substitution <<<$(…)", () => {
		expect(containsDangerousSubstitution("cat <<<$(whoami)")).toBe(true)
	})

	it("should flag indirect variable reference ${!var}", () => {
		expect(containsDangerousSubstitution("echo ${!prefix}")).toBe(true)
	})

	it("should flag zsh process substitution =(…) at start of token", () => {
		expect(containsDangerousSubstitution("echo =(cat /etc/passwd)")).toBe(true)
	})

	it("should flag zsh glob qualifier with code execution", () => {
		expect(containsDangerousSubstitution("ls *(e:whoami:)")).toBe(true)
	})
})

describe("getCommandDecision — integration with dangerous substitution checks", () => {
	const allowedCommands = ["node", "echo"]

	it("should auto-approve the complex node -e one-liner when node is allowed", () => {
		const nodeOneLiner = `node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('prd.json','utf8'));const allowed=new Set(['pending','in-progress','complete','blocked']);const bad=(p.items||[]).filter(i=>!allowed.has(i.status));console.log('meta.status',p.meta?.status);console.log('workstreams', (p.workstreams||[]).length);console.log('items', (p.items||[]).length);console.log('statusCounts', (p.items||[]).reduce((a,i)=>(a[i.status]=(a[i.status]||0)+1,a),{}));console.log('invalidStatuses', bad.length);if(bad.length){console.log(bad.map(i=>i.id+':'+i.status).join('\\\\n'));process.exit(2);} "`

		expect(getCommandDecision(nodeOneLiner, allowedCommands)).toBe("auto_approve")
	})

	it("should ask user for echo $(whoami) because subshell whoami is not in the allowlist", () => {
		expect(getCommandDecision("echo $(whoami)", allowedCommands)).toBe("ask_user")
	})

	it("should ask user for dangerous parameter expansion even when command is allowed", () => {
		expect(getCommandDecision('echo "${var@P}"', allowedCommands)).toBe("ask_user")
	})
})

describe("ask commands", () => {
	const all = ["*"]
	const denied = ["git push"]

	it("asks for a command on the ask list even when * allows everything", () => {
		expect(getCommandDecision("git reset --hard HEAD~1", all, [], ["git reset"])).toBe("ask_user")
	})

	it("runs commands that are not on the ask list", () => {
		expect(getCommandDecision("dir /b", all, [], ["git reset"])).toBe("auto_approve")
	})

	it("asks for the whole chain when one part is on the ask list", () => {
		expect(getCommandDecision("dir && copy /Y a b >nul && Remove-Item -Recurse x", all, [], ["Remove-Item"])).toBe(
			"ask_user",
		)
	})

	it("lets a longer allowed prefix win over a shorter ask entry", () => {
		const allowed = ["*", "git status"]
		expect(getCommandDecision("git status", allowed, [], ["git"])).toBe("auto_approve")
		expect(getCommandDecision("git commit -m x", allowed, [], ["git"])).toBe("ask_user")
	})

	it("does not let * win over an ask entry", () => {
		expect(getCommandDecision("del file.txt", all, [], ["del "])).toBe("ask_user")
	})

	it("still refuses a denied command", () => {
		expect(getCommandDecision("git push origin main", all, denied, ["git"])).toBe("auto_deny")
	})

	it("asks for an ask entry inside a wrapper", () => {
		expect(
			getCommandDecision('powershell -NoProfile -Command "Remove-Item -Recurse build"', all, [], ["Remove-Item"]),
		).toBe("ask_user")
		expect(getCommandDecision("cmd /c del /q build", all, [], ["del "])).toBe("ask_user")
	})

	it("does not match an ask entry in the middle of a word", () => {
		// "del " is inside "model ", which is not a command boundary.
		expect(getCommandDecision("python run.py --model large", all, [], ["del "])).toBe("auto_approve")
	})

	it("matches without regard to case", () => {
		expect(getCommandDecision("REMOVE-ITEM x", all, [], ["remove-item"])).toBe("ask_user")
	})

	it("behaves as before when there is no ask list", () => {
		expect(getCommandDecision("git status", ["git"], ["rm"])).toBe("auto_approve")
		expect(getCommandDecision("rm -rf x", ["git"], ["rm"])).toBe("auto_deny")
		expect(getCommandDecision("ls", ["git"], ["rm"])).toBe("ask_user")
	})
})

describe("containsEmbeddedAskCommand", () => {
	it("ignores a match at the start, which the prefix rule handles", () => {
		expect(containsEmbeddedAskCommand("git status", ["git"])).toBe(false)
	})

	it("finds a match after a quote or a space", () => {
		expect(containsEmbeddedAskCommand('powershell -Command "Remove-Item x"', ["Remove-Item"])).toBe(true)
	})

	it("ignores * and empty entries", () => {
		expect(containsEmbeddedAskCommand("anything at all", ["*", "  "])).toBe(false)
	})
})
