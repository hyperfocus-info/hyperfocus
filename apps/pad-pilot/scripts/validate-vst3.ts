import { existsSync } from "node:fs";
import path from "node:path";
import { runCheckedProcess } from "./process-runner";
import { validatorToolPaths } from "./bootstrap-vst-validators";

type ValidatorKind = "all" | "pluginval" | "steinberg";

const validationDeadlineMs = 1200000;

export function defaultVst3Path(projectRoot: string) {
  return path.join(
    projectRoot,
    "build",
    "plugin",
    "PadPilot_artefacts",
    "Release",
    "VST3",
    "PadPilot.vst3",
  );
}

export function buildPluginvalCommand(executable: string, pluginPath: string, strictness: number) {
  return [executable, "--strictness-level", String(strictness), pluginPath];
}

export function buildSteinbergValidatorCommand(executable: string, pluginPath: string, extensive: boolean) {
  return extensive ? [executable, "-e", pluginPath] : [executable, pluginPath];
}

export function parseValidationArgs(args: string[]) {
  let pluginPath = "";
  let pluginvalPath = "";
  let steinbergValidatorPath = "";
  let strictness = 10;
  let extensive = true;
  let validator: ValidatorKind = "all";

  for (let index = 0; index < args.length; ++index) {
    const argument = args[index];
    const nextValue = () => {
      const value = args[++index];
      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }
      return value;
    };

    switch (argument) {
      case "--plugin":
        pluginPath = nextValue();
        break;
      case "--pluginval":
        pluginvalPath = nextValue();
        break;
      case "--validator":
        steinbergValidatorPath = nextValue();
        break;
      case "--strictness":
        strictness = Number(nextValue());
        break;
      case "--only": {
        const value = nextValue();
        if (value !== "all" && value !== "pluginval" && value !== "steinberg") {
          throw new Error("--only must be all, pluginval, or steinberg.");
        }
        validator = value;
        break;
      }
      case "--no-extensive":
        extensive = false;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(strictness) || strictness < 1 || strictness > 10) {
    throw new Error("--strictness must be an integer from 1 through 10.");
  }

  return {
    extensive,
    pluginPath,
    pluginvalPath,
    steinbergValidatorPath,
    strictness,
    validator,
  };
}

function resolveExecutable(explicitPath: string, commandNames: string[], localPath: string, label: string) {
  if (explicitPath) {
    const resolved = Bun.which(explicitPath) ?? path.resolve(explicitPath);
    if (!existsSync(resolved)) {
      throw new Error(`${label} not found: ${resolved}`);
    }
    return resolved;
  }

  for (const commandName of commandNames) {
    const resolved = Bun.which(commandName);
    if (resolved) {
      return resolved;
    }
  }
  if (existsSync(localPath)) {
    return localPath;
  }
  throw new Error(
    `${label} not found. Install it or pass its executable path explicitly.`,
  );
}

function runValidator(command: string[], projectRoot: string, label: string) {
  console.log(`\n${label}: ${command.join(" ")}`);
  runCheckedProcess(command, {
    cwd: projectRoot,
    label,
    timeoutMs: validationDeadlineMs,
  });
}

async function main() {
  const projectRoot = path.resolve(import.meta.dir, "..");
  const options = parseValidationArgs(Bun.argv.slice(2));
  const localTools = validatorToolPaths(projectRoot);
  const pluginPath = path.resolve(
    options.pluginPath || defaultVst3Path(projectRoot),
  );
  if (!existsSync(pluginPath)) {
    throw new Error(`VST3 bundle not found: ${pluginPath}`);
  }

  if (options.validator === "all" || options.validator === "pluginval") {
    const executable = resolveExecutable(
      options.pluginvalPath,
      ["pluginval", "pluginval.exe"],
      localTools.pluginval,
      "pluginval",
    );
    runValidator(
      buildPluginvalCommand(executable, pluginPath, options.strictness),
      projectRoot,
      `pluginval strictness ${options.strictness}`,
    );
  }

  if (options.validator === "all" || options.validator === "steinberg") {
    const executable = resolveExecutable(
      options.steinbergValidatorPath,
      ["validator", "validator.exe", "vstvalidator", "vstvalidator.exe"],
      localTools.steinberg,
      "Steinberg VST3 validator",
    );
    runValidator(
      buildSteinbergValidatorCommand(executable, pluginPath, options.extensive),
      projectRoot,
      `Steinberg validator${options.extensive ? " extensive" : ""}`,
    );
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
