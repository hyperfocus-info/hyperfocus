import { buildSynaestheticDashboard } from "../build-synaesthetic-dashboard";
import { openEvaluationLibrary } from "./evaluation-library";

type LegacyFocusedTarget = {
  readonly group?: string;
  readonly title?: string;
  readonly path: string;
  readonly outputPath?: string;
  readonly note?: string;
};

const DASHBOARD_ORIGIN = "http://127.0.0.1:3217";

/**
 * Compatibility entry point for callers that previously generated a standalone
 * focused HTML file. Evaluations are now persisted; the returned string is the
 * stable dashboard URL for the immutable run.
 */
export async function buildFocusedHtmlReport(target: LegacyFocusedTarget) {
  const library = openEvaluationLibrary();
  try {
    const [result] = await library.evaluateFiles([target.path]);
    if (!result || result.status === "failed") {
      throw new Error(`Evaluation failed for ${target.path}.`);
    }
    return result.url;
  } finally {
    library.close();
  }
}

/** Builds the reusable dashboard assets and returns the library URL. */
export async function buildHtmlReport() {
  await buildSynaestheticDashboard();
  return `${DASHBOARD_ORIGIN}/`;
}

function mediaPaths(args: readonly string[]) {
  if (args[0] === "--track") return args.slice(1);
  return args.filter((argument) => !argument.startsWith("--"));
}

async function evaluateFromCommandLine(paths: readonly string[]) {
  const library = openEvaluationLibrary();
  try {
    const results = await library.evaluateFiles(paths);
    for (const result of results) {
      console.log(result.title);
      console.log(`Score: ${result.overallScore === null ? "unavailable" : result.overallScore.toFixed(3)}`);
      console.log(result.url);
    }
  } finally {
    library.close();
  }
}

if (import.meta.main) {
  const paths = mediaPaths(Bun.argv.slice(2));
  if (paths.length > 0) {
    await evaluateFromCommandLine(paths);
  } else {
    const url = await buildHtmlReport();
    console.log(`Dashboard: ${url}`);
    console.log("Start it with: bun run synaesthetic:serve");
  }
}
