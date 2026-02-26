import * as child_process from "child_process";
import { promisify } from "util";

const exec = promisify(child_process.exec);

export interface ProcessInfo {
	name: string;
	pid: number;
	running: boolean;
	command?: string;
}

/**
 * Process manager for managing serve-d, dcd-server, dcd-client
 */
export class ProcessManager {
	/**
	 * Checking the existence of a process by name
	 */
	static async checkProcess(name: string): Promise<ProcessInfo> {
		if (process.platform === "win32") {
			return this.checkProcessWindows(name);
		} else {
			return this.checkProcessUnix(name);
		}
	}

	/**
	 * Checking the process in Windows
	 */
	private static async checkProcessWindows(name: string): Promise<ProcessInfo> {
		try {
			const { stdout } = await exec(`tasklist /FI "IMAGENAME eq ${name}.exe" /FO CSV /NH`);
			const lines = stdout.trim().split("\r\n");
			if (lines.length > 0 && lines[0].includes(name)) {
				const parts = lines[0].replace(/"/g, "").split(",");
				const pid = parseInt(parts[1], 10);
				return {
					name,
					pid,
					running: true,
					command: parts[0],
				};
			}
			return { name, pid: -1, running: false };
		} catch {
			return { name, pid: -1, running: false };
		}
	}

	/**
	 * Checking a process on Unix/Linux/macOS
	 */
	private static async checkProcessUnix(name: string): Promise<ProcessInfo> {
		try {
			// Using pgrep with different patterns for reliability
			const patterns = [`pgrep -f "${name}"`, `pgrep -x "${name}"`, `pgrep -f "/.*${name}"`];

			for (const pattern of patterns) {
				try {
					const { stdout } = await exec(pattern);
					const pids = stdout
						.trim()
						.split("\n")
						.filter((line) => line.length > 0 && !isNaN(parseInt(line, 10)));

					if (pids.length > 0) {
						return {
							name,
							pid: parseInt(pids[0], 10),
							running: true,
						};
					}
				} catch {
					// Let's try the following pattern
				}
			}
			return { name, pid: -1, running: false };
		} catch {
			return { name, pid: -1, running: false };
		}
	}

	/**
	 * Force stop a process by name
	 */
	static async killProcess(name: string, force: boolean = false): Promise<boolean> {
		if (process.platform === "win32") {
			return this.killProcessWindows(name, force);
		} else {
			return this.killProcessUnix(name, force);
		}
	}

	/**
	 * Stopping a process in Windows
	 */
	private static async killProcessWindows(name: string, force: boolean): Promise<boolean> {
		try {
			const flag = force ? "/F" : "";
			await exec(`taskkill ${flag} /IM "${name}.exe"`);
			return true;
		} catch (error) {
			const err = error as { code?: number };
			// Code 128 means process not found - not an error
			if (err.code === 128) return false;
			throw error;
		}
	}

	/**
	 * Stopping a process on Unix/Linux/macOS
	 */
	private static async killProcessUnix(name: string, force: boolean): Promise<boolean> {
		let killed = false;
		console.log(`[code-d ProcessManager] Killing process: ${name} (force=${force})`);

		try {
			// First, let's try killall/pkill to be on the safe side.
			const signal = force ? "-9" : "-15";
			try {
				await exec(`killall ${signal} ${name} 2>/dev/null || pkill ${signal} -f ${name} 2>/dev/null`);
				console.log(`[code-d ProcessManager] Sent kill signal to ${name}`);
				killed = true;
			} catch {
				// Ignore if killall doesn't work
			}

			// Then we kill the remaining processes by PID.
			const { stdout } = await exec(`pgrep -f "${name}"`);
			const pids = stdout
				.trim()
				.split("\n")
				.filter((line) => line.length > 0);

			if (pids.length > 0) {
				console.log(
					`[code-d ProcessManager] Found ${pids.length} remaining ${name} process(es) with PIDs:`,
					pids,
				);
				for (const pid of pids) {
					try {
						await exec(`kill ${signal} ${pid}`);
						killed = true;
					} catch {
						// Ignoring errors for individual PIDs
					}
				}
			}

			// Let's check if the processes have actually stopped
			if (!force) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const stillRunning = await this.checkProcess(name);
				if (stillRunning.running) {
					// Force stop if normal stop didn't work
					console.log(`${name} still running, forcing kill...`);
					return this.killProcessUnix(name, true);
				}
			}

			return killed;
		} catch (error) {
			const err = error as { code?: number };
			if (err.code === 1) return killed; // No processes
			throw error;
		}
	}

	/**
	 * Checking all code-d processes
	 */
	static async checkAllProcesses(): Promise<{
		served: ProcessInfo;
		dcdServer: ProcessInfo;
		dcdClient: ProcessInfo;
	}> {
		const [served, dcdServer, dcdClient] = await Promise.all([
			this.checkProcess("serve-d"),
			this.checkProcess("dcd-server"),
			this.checkProcess("dcd-client"),
		]);

		return { served, dcdServer, dcdClient };
	}

	/**
	 * Stop all code-d processes
	 */
	static async killAllProcesses(force: boolean = false): Promise<{
		served: boolean;
		dcdServer: boolean;
		dcdClient: boolean;
	}> {
		console.log("[code-d ProcessManager] Stopping all processes (force=" + force + ")...");
		const [served, dcdServer, dcdClient] = await Promise.all([
			this.killProcess("serve-d", force),
			this.killProcess("dcd-server", force),
			this.killProcess("dcd-client", force),
		]);
		console.log("[code-d ProcessManager] All processes stopped:", {
			served,
			dcdServer,
			dcdClient,
		});

		return { served, dcdServer, dcdClient };
	}

	/**
	 *  Formatting process status for display
	 */
	static formatProcessStatus(info: ProcessInfo): string {
		const icon = info.running ? "$(check)" : "$(x)";
		const status = info.running ? "running" : "stoped";
		const pidInfo = info.running ? ` (PID: ${info.pid})` : "";
		return `${icon} ${info.name}: ${status}${pidInfo}`;
	}
}
