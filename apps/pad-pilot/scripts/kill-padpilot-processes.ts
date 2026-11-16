import { asRecord } from "@hyperfocus/utilities/records";
import { rm } from "node:fs/promises";
import path from "node:path";
import { readBoundedUtf8File } from "./directory-transaction";
import { spawnSyncWithDeadline } from "./process-runner";

type DevProcessRegistry = {
  pid: number;
  startedAt: number;
  version: 1;
};

type WindowsProcessInfo = {
  commandLine: string;
  createdAt: number;
  name: string;
  pid: number;
};

export const devProcessRegistryByteLimit = 4096;
const processQueryOutputByteLimit = 65536;
const devProcessRegistryCountLimit = 64;
const processInspectorTimeoutMs = 10_000;
const projectRoot = path.resolve(import.meta.dir, "..");

const windowsProcessInspectorSource = String.raw`
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public sealed class PadPilotProcessSnapshot
{
    public int pid { get; set; }
    public string name { get; set; }
    public string commandLine { get; set; }
    public long createdAt { get; set; }
}

public static class PadPilotProcessInspector
{
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const int ProcessCommandLineInformation = 60;
    private const int MaxCommandLineBytes = 60 * 1024;

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime
    {
        public uint Low;
        public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct UnicodeString
    {
        public ushort Length;
        public ushort MaximumLength;
        public IntPtr Buffer;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder imageName, ref int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr process, out FileTime creation, out FileTime exit, out FileTime kernel, out FileTime user);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(IntPtr process, int informationClass, IntPtr information, int informationLength, out int returnLength);

    private static bool IsMissingProcessError(int error)
    {
        return error == 6 || error == 87 || error == 1168;
    }

    private static bool IsMissingProcessStatus(int status)
    {
        uint value = unchecked((uint)status);
        return value == 0xC0000008u || value == 0xC000000Bu || value == 0xC000010Au;
    }

    private static bool HasExited(IntPtr process)
    {
        uint exitCode;
        return GetExitCodeProcess(process, out exitCode) && exitCode != 259;
    }

    public static PadPilotProcessSnapshot Query(int processId)
    {
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero)
        {
            int error = Marshal.GetLastWin32Error();
            if (IsMissingProcessError(error))
            {
                return null;
            }
            throw new Win32Exception(error, "Unable to open process.");
        }

        try
        {
            var imageName = new StringBuilder(32768);
            int imageNameLength = imageName.Capacity;
            if (!QueryFullProcessImageName(process, 0, imageName, ref imageNameLength))
            {
                int error = Marshal.GetLastWin32Error();
                if (IsMissingProcessError(error) || (error == 31 && HasExited(process)))
                {
                    return null;
                }
                throw new Win32Exception(error, "Unable to query process image (Win32 " + error + ").");
            }

            FileTime creation;
            FileTime exit;
            FileTime kernel;
            FileTime user;
            if (!GetProcessTimes(process, out creation, out exit, out kernel, out user))
            {
                int error = Marshal.GetLastWin32Error();
                if (IsMissingProcessError(error) || (error == 31 && HasExited(process)))
                {
                    return null;
                }
                throw new Win32Exception(error, "Unable to query process creation time (Win32 " + error + ").");
            }
            long creationFileTime = ((long)creation.High << 32) | creation.Low;

            int commandLineLength;
            int lengthStatus = NtQueryInformationProcess(process, ProcessCommandLineInformation, IntPtr.Zero, 0, out commandLineLength);
            if (commandLineLength <= 0 || commandLineLength > MaxCommandLineBytes)
            {
                if (IsMissingProcessStatus(lengthStatus))
                {
                    return null;
                }
                throw new InvalidOperationException("Process command line length was invalid.");
            }

            IntPtr commandLineBuffer = Marshal.AllocHGlobal(commandLineLength);
            try
            {
                int returnedLength;
                int status = NtQueryInformationProcess(process, ProcessCommandLineInformation, commandLineBuffer, commandLineLength, out returnedLength);
                if (status < 0)
                {
                    if (IsMissingProcessStatus(status))
                    {
                        return null;
                    }
                    throw new InvalidOperationException("Unable to query process command line (NTSTATUS 0x" + status.ToString("X8") + ").");
                }
                var commandLine = (UnicodeString)Marshal.PtrToStructure(commandLineBuffer, typeof(UnicodeString));
                if (commandLine.Length > commandLine.MaximumLength || commandLine.Length > MaxCommandLineBytes || (commandLine.Length & 1) != 0)
                {
                    throw new InvalidOperationException("Process command line response was invalid.");
                }

                return new PadPilotProcessSnapshot
                {
                    pid = processId,
                    name = Path.GetFileName(imageName.ToString()),
                    commandLine = commandLine.Length == 0 ? string.Empty : Marshal.PtrToStringUni(commandLine.Buffer, commandLine.Length / 2),
                    createdAt = new DateTimeOffset(DateTime.FromFileTimeUtc(creationFileTime)).ToUnixTimeMilliseconds(),
                };
            }
            finally
            {
                Marshal.FreeHGlobal(commandLineBuffer);
            }
        }
        finally
        {
            CloseHandle(process);
        }
    }
}
`;

export function parseDevProcessRegistry(value: string) {
  if (Buffer.byteLength(value, "utf8") > devProcessRegistryByteLimit) {
    throw new Error("Invalid PadPilot dev-process registry: file is oversized.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(value));
  } catch {
    throw new Error("Invalid PadPilot dev-process registry.");
  }
  const pid = typeof parsed.pid === "number" ? parsed.pid : Number.NaN;
  const startedAt = typeof parsed.startedAt === "number" ? parsed.startedAt : Number.NaN;
  if (parsed.version !== 1 || !Number.isSafeInteger(pid) || pid <= 0
      || !Number.isSafeInteger(startedAt) || startedAt <= 0) {
    throw new Error("Invalid PadPilot dev-process registry.");
  }
  return { pid, startedAt, version: 1 as const };
}

export async function readDevProcessRegistry(registryPath: string) {
  const contents = await readBoundedUtf8File(
    registryPath,
    devProcessRegistryByteLimit,
    "PadPilot dev-process registry",
  );
  return parseDevProcessRegistry(contents);
}

export function matchesRegisteredDevProcess(registry: DevProcessRegistry, processInfo: WindowsProcessInfo) {
  const normalizedCommand = processInfo.commandLine.replaceAll("\\", "/").toLowerCase();
  return processInfo.pid === registry.pid
    && /^bun(?:x)?(?:\.exe)?$/i.test(processInfo.name)
    && /(?:^|[\s"'/])scripts\/dev\.ts(?:[\s"']|$)/.test(normalizedCommand)
    && Number.isSafeInteger(processInfo.createdAt)
    && processInfo.createdAt >= registry.startedAt - 60_000
    && processInfo.createdAt <= registry.startedAt + 10_000;
}

export function queryWindowsProcess(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("Invalid Windows process ID.");
  }
  const command = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -TypeDefinition $env:PADPILOT_PROCESS_INSPECTOR_SOURCE",
    "$targetPid=[int]$env:PADPILOT_DEV_PID",
    "$process=[PadPilotProcessInspector]::Query($targetPid)",
    "if ($null -eq $process) { exit 3 }",
    "$process|ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSyncWithDeadline(["powershell", "-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PADPILOT_DEV_PID: String(pid),
      PADPILOT_PROCESS_INSPECTOR_SOURCE: windowsProcessInspectorSource,
    },
    label: "Registered PadPilot dev process inspection",
    maxBuffer: processQueryOutputByteLimit * 2,
    stderr: "pipe",
    stdout: "pipe",
    timeoutMs: processInspectorTimeoutMs,
  });
  if (result.exitCode === 3) {
    return null;
  }
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim().slice(0, 2_048);
    throw new Error(`Unable to inspect registered PadPilot dev process (PowerShell exit ${result.exitCode})${detail ? `: ${detail}` : "."}`);
  }
  const stdout = result.stdout ?? new Uint8Array();
  if (stdout.byteLength > processQueryOutputByteLimit) {
    throw new Error("Registered PadPilot dev process identity response was oversized.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(stdout));
  } catch {
    throw new Error("Registered PadPilot dev process identity response was malformed.");
  }
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Registered PadPilot dev process identity response was malformed.");
  }
  const processInfo = asRecord(decoded);
  if (!Number.isSafeInteger(processInfo.pid) || processInfo.pid !== pid
      || typeof processInfo.createdAt !== "number" || !Number.isSafeInteger(processInfo.createdAt) || processInfo.createdAt <= 0
      || typeof processInfo.name !== "string" || processInfo.name.length === 0 || processInfo.name.length > 260
      || typeof processInfo.commandLine !== "string" || processInfo.commandLine.length > 32_768) {
    throw new Error("Registered PadPilot dev process identity response was malformed.");
  }
  return { pid, createdAt: Number(processInfo.createdAt), name: processInfo.name, commandLine: processInfo.commandLine };
}

export function terminateRegisteredDevProcess(registry: DevProcessRegistry) {
  const command = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -TypeDefinition $env:PADPILOT_PROCESS_INSPECTOR_SOURCE",
    "$targetPid=[int]$env:PADPILOT_DEV_PID",
    "$expectedStart=[long]$env:PADPILOT_DEV_STARTED_AT",
    "$process=[PadPilotProcessInspector]::Query($targetPid)",
    "if ($null -eq $process) { exit 3 }",
    "$createdAt=[long]$process.createdAt",
    "$commandLine=([string]$process.commandLine).Replace('\\','/').ToLowerInvariant()",
    "$name=[string]$process.Name",
    "$validName=$name -match '^bun(x)?(\\.exe)?$'",
    "$validCommand=$commandLine -match '(^|[\\s\"''/])scripts/dev\\.ts([\\s\"'']|$)'",
    "$validStart=($createdAt -ge ($expectedStart - 60000)) -and ($createdAt -le ($expectedStart + 10000))",
    "if (-not ($validName -and $validCommand -and $validStart)) { exit 4 }",
    "& taskkill.exe /PID ([string]$targetPid) /T /F",
    "if ($LASTEXITCODE -ne 0) { $remaining=[PadPilotProcessInspector]::Query($targetPid); if ($null -ne $remaining) { exit 5 } }",
  ].join("; ");
  const result = spawnSyncWithDeadline(["powershell", "-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PADPILOT_DEV_PID: String(registry.pid),
      PADPILOT_DEV_STARTED_AT: String(registry.startedAt),
      PADPILOT_PROCESS_INSPECTOR_SOURCE: windowsProcessInspectorSource,
    },
    label: "Registered PadPilot dev process termination",
    maxBuffer: processQueryOutputByteLimit * 2,
    stderr: "pipe",
    stdout: "pipe",
    timeoutMs: processInspectorTimeoutMs,
  });
  if (result.exitCode === 3) {
    return "absent";
  }
  if (result.exitCode === 4) {
    return "mismatch";
  }
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim().slice(0, 2_048);
    throw new Error(`Unable to terminate registered PadPilot dev process tree (PowerShell exit ${result.exitCode})${detail ? `: ${detail}` : "."}`);
  }
  return "terminated";
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("kill-all currently supports the PadPilot Windows baseline only.");
  }
  const projectRoot = path.resolve(import.meta.dir, "..");
  const registryPaths: string[] = [];
  const registryGlob = new Bun.Glob(".padpilot-dev-process-*.json");
  for await (const relativePath of registryGlob.scan(projectRoot)) {
    if (/^\.padpilot-dev-process-[0-9a-f-]{36}\.json$/i.test(relativePath)) {
      registryPaths.push(path.join(projectRoot, relativePath));
      if (registryPaths.length > devProcessRegistryCountLimit) {
        throw new Error(`PadPilot dev-process registry count exceeded ${devProcessRegistryCountLimit}.`);
      }
    }
  }
  if (registryPaths.length === 0) {
    console.log("[kill-all] No registered PadPilot dev process is running.");
    return;
  }
  let staleCount = 0;
  let terminatedCount = 0;
  for (const registryPath of registryPaths.sort()) {
    const registry = await readDevProcessRegistry(registryPath);
    const termination = terminateRegisteredDevProcess(registry);
    if (termination === "mismatch") {
      throw new Error(`Registered PID ${registry.pid} no longer matches this PadPilot dev runner; refusing to terminate it.`);
    }
    await rm(registryPath, { force: true });
    if (termination === "absent") {
      staleCount += 1;
    } else {
      terminatedCount += 1;
    }
  }
  console.log(`[kill-all] Stopped ${terminatedCount} PadPilot dev process tree(s); removed ${staleCount} stale registry file(s).`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
