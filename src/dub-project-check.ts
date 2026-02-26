import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Result of checking for a DUB project
 */
export interface DubProjectCheck {
	/** Whether workspace folder exists */
	hasWorkspace: boolean;
	/** Whether dub.json was found */
	hasDubJson: boolean;
	/** Whether dub.sdl was found */
	hasDubSdl: boolean;
	/** Whether .d or .di files were found */
	hasSourceFiles: boolean;
	/** Whether the current folder is a DUB project */
	isDubProject: boolean;
	/** Path to the DUB configuration file */
	dubConfigPath?: string;
}

/**
 * Check for a DUB project in the workspace folder
 */
export async function checkDubProject(): Promise<DubProjectCheck> {
	const result: DubProjectCheck = {
		hasWorkspace: false,
		hasDubJson: false,
		hasDubSdl: false,
		hasSourceFiles: false,
		isDubProject: false,
	};

	// Check if workspace folder exists
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return result;
	}

	result.hasWorkspace = true;

	const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

	// Check for dub.json
	const dubJsonPath = path.join(workspaceFolder, "dub.json");
	result.hasDubJson = await fileExists(dubJsonPath);

	// Check for dub.sdl
	const dubSdlPath = path.join(workspaceFolder, "dub.sdl");
	result.hasDubSdl = await fileExists(dubSdlPath);

	// Check for .d or .di files
	result.hasSourceFiles = await hasDSourceFiles(workspaceFolder);

	// Determine if it's a DUB project
	result.isDubProject = result.hasDubJson || result.hasDubSdl;

	if (result.hasDubJson) {
		result.dubConfigPath = dubJsonPath;
	} else if (result.hasDubSdl) {
		result.dubConfigPath = dubSdlPath;
	}

	return result;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
	return new Promise((resolve) => {
		fs.access(filePath, fs.constants.F_OK, (err) => {
			resolve(err === null);
		});
	});
}

/**
 * Check for .d or .di files in the workspace folder
 */
async function hasDSourceFiles(workspaceFolder: string): Promise<boolean> {
	return new Promise((resolve) => {
		const pattern = new vscode.RelativePattern(workspaceFolder, "**/*.{d,di}");
		vscode.workspace.findFiles(pattern, "**/node_modules/**", 1).then((files) => {
			resolve(files.length > 0);
		});
	});
}

/**
 * Check if a file is a DUB configuration file
 */
export function isDubConfigFile(fileName: string): boolean {
	return fileName === "dub.json" || fileName === "dub.sdl";
}

/**
 * Check if a file is a D source file
 */
export function isDSourceFile(fileName: string): boolean {
	return fileName.endsWith(".d") || fileName.endsWith(".di");
}
