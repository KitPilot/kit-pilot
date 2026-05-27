# KitPilot API

The KitPilot extension exposes an API that can be used by other extensions.
To use this API in your extension:

1. Install `@kit-pilot/types` with npm, pnpm, or yarn.
2. Import the `KitPilotAPI` type.
3. Load the extension API.

```typescript
import { KitPilotAPI } from "@kit-pilot/types"

const extension = vscode.extensions.getExtension<KitPilotAPI>("KitPilotVeterinaryInc.kit-pilot")

if (!extension?.isActive) {
	throw new Error("Extension is not activated")
}

const api = extension.exports

if (!api) {
	throw new Error("API is not available")
}

// Start a new task with an initial message.
await api.startNewTask("Hello, KitPilot API! Let's make a new project...")

// Start a new task with an initial message and images.
await api.startNewTask("Use this design language", ["data:image/webp;base64,..."])

// Send a message to the current task.
await api.sendMessage("Can you fix the @problems?")

// Simulate pressing the primary button in the chat interface (e.g. 'Save' or 'Proceed While Running').
await api.pressPrimaryButton()

// Simulate pressing the secondary button in the chat interface (e.g. 'Reject').
await api.pressSecondaryButton()
```

**NOTE:** To ensure that the `KitPilotVeterinaryInc.kit-pilot` extension is activated before your extension, add it to the `extensionDependencies` in your `package.json`:

```json
"extensionDependencies": ["KitPilotVeterinaryInc.kit-pilot"]
```

For detailed information on the available methods and their usage, refer to the `kit-pilot.d.ts` file.
