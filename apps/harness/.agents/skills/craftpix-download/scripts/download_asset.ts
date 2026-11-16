#!/usr/bin/env bun

import {
  checkCraftpixHealth,
  createCraftpixDownloadError,
  DEFAULT_TIMEOUT,
  executeDownload,
} from "./craftpix";

type Options = {
  sourceUrl: string;
  outputDir?: string;
  cookieFile?: string;
  filename?: string;
  subitem?: string;
  resolveOnly: boolean;
  overwrite: boolean;
  timeout: number;
  debug: boolean;
  check: boolean;
};

function printUsage(): void {
  console.log(`Download a Craftpix asset with a Netscape-format browser cookie export.

Usage:
  bun "<skill>/scripts/download_asset.ts" <source_url> [options]

Arguments:
  <source_url>            Craftpix product page URL or direct download URL

Options:
  --output-dir <path>     Destination directory for the downloaded archive
  --cookie-file <path>    Netscape-format cookie file path
  --filename <name>       Optional output filename override
  --subitem <id>          Optional alternate package id
  --resolve-only          Print the resolved download URL without downloading
  --check                 Probe page resolution and archive access without writing
  --overwrite             Replace an existing output file
  --timeout <seconds>     HTTP timeout in seconds (default: ${DEFAULT_TIMEOUT})
  --debug                 Log resolved cookie file path and parsed cookie names
  -h, --help              Show this help message`);
}

function parseArgs(argv: string[]): Options {
  const positionals: string[] = [];
  const options: Omit<Options, "sourceUrl"> = {
    outputDir: undefined,
    cookieFile: undefined,
    filename: undefined,
    subitem: undefined,
    resolveOnly: false,
    overwrite: false,
    timeout: DEFAULT_TIMEOUT,
    debug: false,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const next = argv[index + 1];
    switch (arg) {
      case "--output-dir":
        if (!next) {
          throw createCraftpixDownloadError("--output-dir requires a value.");
        }
        options.outputDir = next;
        index += 1;
        break;
      case "--cookie-file":
        if (!next) {
          throw createCraftpixDownloadError("--cookie-file requires a value.");
        }
        options.cookieFile = next;
        index += 1;
        break;
      case "--filename":
        if (!next) {
          throw createCraftpixDownloadError("--filename requires a value.");
        }
        options.filename = next;
        index += 1;
        break;
      case "--subitem":
        if (!next) {
          throw createCraftpixDownloadError("--subitem requires a value.");
        }
        options.subitem = next;
        index += 1;
        break;
      case "--timeout":
        if (!next) {
          throw createCraftpixDownloadError("--timeout requires a value.");
        }
        options.timeout = Number.parseInt(next, 10);
        if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
          throw createCraftpixDownloadError("--timeout must be a positive integer.");
        }
        index += 1;
        break;
      case "--resolve-only":
        options.resolveOnly = true;
        break;
      case "--check":
        options.check = true;
        options.resolveOnly = true;
        break;
      case "--overwrite":
        options.overwrite = true;
        break;
      case "--debug":
        options.debug = true;
        break;
      default:
        throw createCraftpixDownloadError(`Unknown argument: ${arg}`);
    }
  }

  if (positionals.length !== 1) {
    throw createCraftpixDownloadError("Expected exactly one Craftpix source URL.");
  }
  if (!options.resolveOnly && !options.outputDir) {
    throw createCraftpixDownloadError("--output-dir is required unless --resolve-only is set.");
  }

  return {
    sourceUrl: positionals[0],
    ...options,
  };
}

async function main(): Promise<number> {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.check) {
      const health = await checkCraftpixHealth(args);
      console.log(JSON.stringify(health, null, 2));
      return health.probe.status === "available" ? 0 : 2;
    }
    const result = await executeDownload(args);
    console.log(args.resolveOnly ? result.resolved.downloadUrl : result.destination);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    return 1;
  }
}

void main().then((exitCode) => {
  process.exit(exitCode);
});
