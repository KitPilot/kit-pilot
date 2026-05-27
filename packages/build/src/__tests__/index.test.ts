// npx vitest run src/__tests__/index.test.ts

import { generatePackageJson } from "../index.js"

describe("generatePackageJson", () => {
	it("should be a test", () => {
		const generatedPackageJson = generatePackageJson({
			packageJson: {
				name: "kit-pilot",
				displayName: "%extension.displayName%",
				description: "%extension.description%",
				publisher: "KitPilotVeterinaryInc",
				version: "3.17.2",
				icon: "assets/icons/icon.png",
				contributes: {
					viewsContainers: {
						activitybar: [
							{
								id: "kit-pilot-ActivityBar",
								title: "%views.activitybar.title%",
								icon: "assets/icons/icon.svg",
							},
						],
					},
					views: {
						"kit-pilot-ActivityBar": [
							{
								type: "webview",
								id: "kit-pilot.SidebarProvider",
								name: "",
							},
						],
					},
					commands: [
						{
							command: "kit-pilot.plusButtonClicked",
							title: "%command.newTask.title%",
							icon: "$(edit)",
						},
						{
							command: "kit-pilot.openInNewTab",
							title: "%command.openInNewTab.title%",
							category: "%configuration.title%",
						},
					],
					menus: {
						"editor/context": [
							{
								submenu: "kit-pilot.contextMenu",
								group: "navigation",
							},
						],
						"kit-pilot.contextMenu": [
							{
								command: "kit-pilot.addToContext",
								group: "1_actions@1",
							},
						],
						"editor/title": [
							{
								command: "kit-pilot.plusButtonClicked",
								group: "navigation@1",
								when: "activeWebviewPanelId == kit-pilot.TabPanelProvider",
							},
							{
								command: "kit-pilot.settingsButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == kit-pilot.TabPanelProvider",
							},
							{
								command: "kit-pilot.accountButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == kit-pilot.TabPanelProvider",
							},
						],
					},
					submenus: [
						{
							id: "kit-pilot.contextMenu",
							label: "%views.contextMenu.label%",
						},
						{
							id: "kit-pilot.terminalMenu",
							label: "%views.terminalMenu.label%",
						},
					],
					configuration: {
						title: "%configuration.title%",
						properties: {
							"kit-pilot.allowedCommands": {
								type: "array",
								items: {
									type: "string",
								},
								default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
								description: "%commands.allowedCommands.description%",
							},
							"kit-pilot.customStoragePath": {
								type: "string",
								default: "",
								description: "%settings.customStoragePath.description%",
							},
						},
					},
				},
				scripts: {
					lint: "eslint **/*.ts",
				},
			},
			overrideJson: {
				name: "kit-pilot-nightly",
				displayName: "KitPilot Nightly",
				publisher: "KitPilotVeterinaryInc",
				version: "0.0.1",
				icon: "assets/icons/icon-nightly.png",
				scripts: {},
			},
			substitution: ["kit-pilot", "kit-pilot-nightly"],
		})

		expect(generatedPackageJson).toStrictEqual({
			name: "kit-pilot-nightly",
			displayName: "KitPilot Nightly",
			description: "%extension.description%",
			publisher: "KitPilotVeterinaryInc",
			version: "0.0.1",
			icon: "assets/icons/icon-nightly.png",
			contributes: {
				viewsContainers: {
					activitybar: [
						{
							id: "kit-pilot-nightly-ActivityBar",
							title: "%views.activitybar.title%",
							icon: "assets/icons/icon.svg",
						},
					],
				},
				views: {
					"kit-pilot-nightly-ActivityBar": [
						{
							type: "webview",
							id: "kit-pilot-nightly.SidebarProvider",
							name: "",
						},
					],
				},
				commands: [
					{
						command: "kit-pilot-nightly.plusButtonClicked",
						title: "%command.newTask.title%",
						icon: "$(edit)",
					},
					{
						command: "kit-pilot-nightly.openInNewTab",
						title: "%command.openInNewTab.title%",
						category: "%configuration.title%",
					},
				],
				menus: {
					"editor/context": [
						{
							submenu: "kit-pilot-nightly.contextMenu",
							group: "navigation",
						},
					],
					"kit-pilot-nightly.contextMenu": [
						{
							command: "kit-pilot-nightly.addToContext",
							group: "1_actions@1",
						},
					],
					"editor/title": [
						{
							command: "kit-pilot-nightly.plusButtonClicked",
							group: "navigation@1",
							when: "activeWebviewPanelId == kit-pilot-nightly.TabPanelProvider",
						},
						{
							command: "kit-pilot-nightly.settingsButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == kit-pilot-nightly.TabPanelProvider",
						},
						{
							command: "kit-pilot-nightly.accountButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == kit-pilot-nightly.TabPanelProvider",
						},
					],
				},
				submenus: [
					{
						id: "kit-pilot-nightly.contextMenu",
						label: "%views.contextMenu.label%",
					},
					{
						id: "kit-pilot-nightly.terminalMenu",
						label: "%views.terminalMenu.label%",
					},
				],
				configuration: {
					title: "%configuration.title%",
					properties: {
						"kit-pilot-nightly.allowedCommands": {
							type: "array",
							items: {
								type: "string",
							},
							default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
							description: "%commands.allowedCommands.description%",
						},
						"kit-pilot-nightly.customStoragePath": {
							type: "string",
							default: "",
							description: "%settings.customStoragePath.description%",
						},
					},
				},
			},
			scripts: {},
		})
	})
})
