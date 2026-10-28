// scripts/platform.mjs
// Everything that differs between macOS and Windows, in one place.
// Background jobs: launchd on macOS (com.jobpipeline.*), Task Scheduler on
// Windows (JobPipeline-*). Both installers write DASHBOARD_PORT to .env.local.

import os from "os";
import path from "path";
import { execSync, spawn } from "child_process";

const isWindows = process.platform === "win32";

const quietly = (cmd) => {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const mac = {
  name: "macOS",
  installCommand: "./scripts/install-mac.sh",
  isScheduled: (job) => quietly(`launchctl print gui/${process.getuid()}/com.jobpipeline.${job}`),
  openFile: (file) => spawn("open", ["-e", file], { stdio: "ignore" }),
  openUrl: (url) => spawn("open", [url], { stdio: "ignore" }),
  // macOS blocks background jobs from reading these folders.
  blockedFolder: (dir) =>
    ["Desktop", "Documents", "Downloads"].some((d) => dir.startsWith(path.join(os.homedir(), d))),
  blockedFolderFix:
    "Move the folder to ~/Projects and run ./scripts/install-mac.sh again. macOS blocks background jobs from Desktop, Documents and Downloads.",
};

const windows = {
  name: "Windows",
  installCommand: "powershell -ExecutionPolicy Bypass -File scripts\\install-windows.ps1",
  isScheduled: (job) => quietly(`schtasks /Query /TN "JobPipeline-${job}"`),
  openFile: (file) => spawn("notepad.exe", [file], { stdio: "ignore", detached: true }),
  openUrl: (url) => spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" }),
  // OneDrive syncs Desktop and Documents on most Windows PCs and breaks node_modules.
  blockedFolder: (dir) => /onedrive/i.test(dir),
  blockedFolderFix:
    "Move the folder out of OneDrive (for example to C:\\Users\\<you>\\Projects\\Job-pipeline) and run the installer again. OneDrive syncing breaks the app's files.",
};

export const PLATFORM = isWindows ? windows : mac;

// npm is npm.cmd on Windows, which needs a shell to run.
export const npmSpawnOptions = isWindows ? { shell: true } : {};

// A path dragged into a terminal: macOS escapes spaces with "\ ", Windows
// wraps it in quotes, and PowerShell may add a leading "& ".
export function cleanDroppedPath(raw) {
  let s = String(raw || "").trim().replace(/^&\s*/, "");
  s = s.replace(/^['"]|['"]$/g, "");
  return isWindows ? s : s.replace(/\\ /g, " ");
}
