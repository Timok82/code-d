import * as vscode from "vscode";
import * as path from "path";
import { ServeD, config } from "./extension";

let dubLoaded = false;

export function setupDub(served: ServeD): vscode.Disposable {
	const subscriptions: vscode.Disposable[] = [
		new vscode.Disposable(() => {
			dubLoaded = false;
		}),
	];

	if (dubLoaded) return new vscode.Disposable(() => {});
	dubLoaded = true;

	subscriptions.push(new ConfigSelector(served));
	subscriptions.push(new ArchSelector(served));
	subscriptions.push(new BuildSelector(served));
	subscriptions.push(new CompilerSelector(served));

	//-- Two new selectors --
	subscriptions.push(new DubCommandSelector(served)); // Added DubCommandSelector
	subscriptions.push(new RunSelector(served)); // Added RunSelector

	return vscode.Disposable.from(...subscriptions);
}

//fixed: added support for di format
export function isStatusbarRelevantDocument(document: vscode.TextDocument): boolean {
	const language = document.languageId;
	//Support d, di, dml, diet formats
	if (language == "d" || language == "di" || language == "dml" || language == "diet") return true;
	const filename = path.basename(document.fileName.toLowerCase());
	if (filename == "dub.json" || filename == "dub.sdl") return true;
	return false;
}

export function checkStatusbarVisibility(overrideConfig: string, editor?: vscode.TextEditor | null): boolean {
	// Always show if override is enabled
	if (config(null).get(overrideConfig, false)) return true;

	if (editor === null) {
		// No active editor - show if there is a DUB project
		const hasDubProject =
			vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0;
		return hasDubProject;
	} else {
		if (!editor) editor = vscode.window.activeTextEditor;
		if (editor) {
			if (config(editor.document.uri).get(overrideConfig, false) || isStatusbarRelevantDocument(editor.document))
				return true;
			else {
				// Even if the file is not relevant, show for DUB projects
				const hasDubProject =
					vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0;
				return hasDubProject;
			}
		} else {
			// No editor - show if there is a DUB project
			const hasDubProject =
				vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0;
			return hasDubProject;
		}
	}
}

class GenericSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	item?: vscode.StatusBarItem;

	constructor(
		public served: ServeD,
		public x: number,
		public command: string,
		public tooltip: string,
		public event: string,
		public method: string,
		public fallback: string,
	) {
		this.create();
	}

	protected create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, this.x);
		this.item.command = this.command;
		this.item.tooltip = this.tooltip;
		this.updateDocumentVisibility();
		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updateDocumentVisibility(editor || null);
			}),
		);
		this.served.on(this.event, (config) => {
			if (this.item) this.item.text = config || this.fallback;
		});
		this.served.on("workspace-change", () => {
			this.update();
		});
		this.update();
	}

	updateDocumentVisibility(editor?: vscode.TextEditor | null) {
		const visible = checkStatusbarVisibility("alwaysShowDubStatusButtons", editor);
		console.log("[code-d statusbar] updateDocumentVisibility:", {
			editor: editor ? editor.document.fileName : editor === null ? "null" : "undefined",
			visible,
			hasWorkspace: vscode.workspace.workspaceFolders !== undefined,
		});
		if (this.item) {
			if (visible) this.item.show();
			else this.item.hide();
		}
	}

	update() {
		this.served.client.sendRequest<string>(this.method).then((config) => {
			if (this.item) this.item.text = config || this.fallback;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class ConfigSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92145,
			"code-d.switchConfiguration",
			"Switch Configuration",
			"config-change",
			"served/getConfig",
			"(config)",
		);
	}
}
class ArchSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92144,
			"code-d.switchArchType",
			"Switch Arch Type",
			"arch-type-change",
			"served/getArchType",
			"(default arch)",
		);
	}
}

class BuildSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92143,
			"code-d.switchBuildType",
			"Switch Build Type",
			"build-type-change",
			"served/getBuildType",
			"(build type)",
		);
	}
}

class CompilerSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92142,
			"code-d.switchCompiler",
			"Switch Compiler",
			"compiler-change",
			"served/getCompiler",
			"(compiler)",
		);
	}
}

//fixed: added "Switch DUB Command" to statusbar
class DubCommandSelector implements vscode.Disposable {
	item?: vscode.StatusBarItem;
	subscriptions: vscode.Disposable[] = [];
	currentCommand: string = "build-run";

	constructor(public served: ServeD) {
		this.create();
	}

	protected create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92141);
		this.item.command = "code-d.switchDubCommand";
		this.item.tooltip = "Switch DUB Command";
		this.updateDocumentVisibility();

		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updateDocumentVisibility(editor || null);
			}),
		);

		// Listening to command changes
		this.served.on("dub-command-change", (cmd) => {
			this.currentCommand = cmd || "build-run";
			this.update();
		});

		this.served.on("workspace-change", () => {
			this.update();
		});

		this.update();
	}

	updateDocumentVisibility(editor?: vscode.TextEditor | null) {
		const visible = checkStatusbarVisibility("alwaysShowDubStatusButtons", editor);
		console.log("[code-d statusbar] updateDocumentVisibility:", {
			editor: editor ? editor.document.fileName : editor === null ? "null" : "undefined",
			visible,
			hasWorkspace: vscode.workspace.workspaceFolders !== undefined,
		});
		if (this.item) {
			if (visible) this.item.show();
			else this.item.hide();
		}
	}

	update() {
		if (this.item) {
			const labels: Record<string, string> = {
				"build-run": "build & run",
				run: "run",
				build: "build",
				test: "test",
				clean: "clean",
			};
			this.item.text = labels[this.currentCommand] || "$(package)";
		}
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

//fixed: added "Build&Run DUB Project" to statusbar
class RunSelector implements vscode.Disposable {
	item?: vscode.StatusBarItem;
	subscriptions: vscode.Disposable[] = [];
	currentDubCommand: string = "build-run";

	constructor(public served: ServeD) {
		this.create();
	}

	protected create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.9214);
		this.item.command = "code-d.dubBuildRun";
		this.updateTooltip();
		this.updateDocumentVisibility();

		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updateDocumentVisibility(editor || null);
			}),
		);

		// Listen to DUB command changes to update tooltip
		this.served.on("dub-command-change", (cmd) => {
			this.currentDubCommand = cmd || "build-run";
			this.updateTooltip();
		});

		this.served.on("workspace-change", () => {
			this.update();
		});

		this.update();
	}

	updateTooltip() {
		if (this.item) {
			const tooltips: Record<string, string> = {
				"build-run": "Build & Run the DUB Project",
				run: "Run the DUB Project",
				build: "Build the DUB Project",
				test: "Run DUB Tests",
				clean: "Clean DUB Build Artifacts",
			};
			this.item.tooltip = tooltips[this.currentDubCommand] || "Run DUB Project";
		}
	}

	updateDocumentVisibility(editor?: vscode.TextEditor | null) {
		const visible = checkStatusbarVisibility("alwaysShowDubStatusButtons", editor);
		console.log("[code-d statusbar] updateDocumentVisibility:", {
			editor: editor ? editor.document.fileName : editor === null ? "null" : "undefined",
			visible,
			hasWorkspace: vscode.workspace.workspaceFolders !== undefined,
		});
		if (this.item) {
			if (visible) this.item.show();
			else this.item.hide();
		}
	}

	update() {
		if (this.item) this.item.text = "$(play)";
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

export class StartupProgress {
	startedGlobal: boolean = false;
	workspace: string | undefined;

	progress: vscode.Progress<{ message?: string; increment?: number }> | undefined;
	resolve: (() => void) | undefined;
	reject: (() => void) | undefined;

	constructor() {}

	async startGlobal() {
		if (this.startedGlobal) return;

		this.startedGlobal = true;

		vscode.window.withProgress(
			{
				cancellable: false,
				location: vscode.ProgressLocation.Window,
				title: "D",
			},
			(progress) => {
				this.progress = progress;
				return new Promise<void>((resolve, reject) => {
					this.resolve = resolve;
					this.reject = reject;
				});
			},
		);
	}

	finishGlobal() {
		if (!this.startedGlobal) return;

		this.startedGlobal = false;
		if (this.resolve) this.resolve();
		this.progress = undefined;
		this.resolve = undefined;
		this.reject = undefined;
	}

	globalStep(step: number, max: number, title: string, msg: string) {
		if (!this.startedGlobal || !this.progress) return;

		const percent = step / (max || 1);

		this.progress.report({
			message: title + " (" + formatPercent(percent) + "): " + msg,
		});
	}

	setWorkspace(name: string) {
		this.workspace = name;
		this.globalStep(0, 1, "workspace " + name, "starting up...");
	}

	workspaceStep(step: number, max: number, msg: string) {
		this.globalStep(step, max, "workspace " + this.workspace, msg);
	}
}

function formatPercent(p: number) {
	return (p * 100).toFixed(1) + " %";
}
