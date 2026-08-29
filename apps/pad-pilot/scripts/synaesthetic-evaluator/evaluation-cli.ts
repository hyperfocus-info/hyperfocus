import {
  defaultEvaluationDatabasePath,
  openEvaluationLibrary,
} from "./evaluation-library";
import { serveEvaluationDashboard } from "./evaluation-server";
import { buildSynaestheticDashboard } from "../build-synaesthetic-dashboard";

type CliResult = {
  readonly overallScore: number | null;
  readonly reused: boolean;
  readonly title: string;
  readonly url: string;
};

type CliLibrary = {
  readonly close: () => void;
  readonly evaluateFiles: (
    paths: readonly string[],
    options: { readonly force?: boolean; readonly subjectiveScore?: number },
  ) => Promise<readonly CliResult[]>;
};

function parsePort(value: string | undefined) {
  const parsed = Number(value ?? process.env.PADPILOT_EVALUATOR_PORT ?? "3217");
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("Evaluation dashboard port must be an integer from 1 to 65535.");
  }
  return parsed;
}

function usage() {
  return [
    "Usage:",
    "  bun run scripts/synaesthetic-evaluator/evaluation-cli.ts analyze [--force] [--score <0..1>] <media...>",
    "  bun run scripts/synaesthetic-evaluator/evaluation-cli.ts serve [--port <port>]",
  ].join("\n");
}

export async function runEvaluationCli(args: readonly string[], services: {
  readonly buildDashboard?: typeof buildSynaestheticDashboard;
  readonly log?: (message: string) => void;
  readonly openLibrary?: () => CliLibrary;
  readonly serve?: typeof serveEvaluationDashboard;
} = {}) {
  const log = services.log ?? console.log;
  const command = args[0];
  if (command === "analyze") {
    const force = args.includes("--force");
    const scoreIndex = args.indexOf("--score");
    const scoreValue = scoreIndex >= 0 ? Number(args[scoreIndex + 1]) : undefined;
    if (scoreIndex >= 0 && (scoreValue === undefined || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 1)) {
      throw new Error("Listener score must be a number from 0 to 1.");
    }
    const paths = args.slice(1).filter((argument, index) =>
      argument !== "--force" && argument !== "--score" && index !== scoreIndex,
    );
    if (paths.length === 0 || paths.some((argument) => argument.startsWith("--"))) {
      throw new Error(usage());
    }
    const library = services.openLibrary?.() ?? openEvaluationLibrary();
    try {
      const results = await library.evaluateFiles(paths, { force, subjectiveScore: scoreValue });
      for (const result of results) {
        const score = result.overallScore === null ? "unavailable" : result.overallScore.toFixed(3);
        log(`${result.title}\nScore: ${score}${result.reused ? " (reused)" : ""}\n${result.url}`);
      }
    } finally {
      library.close();
    }
    return 0;
  }

  if (command === "serve") {
    const portIndex = args.indexOf("--port");
    const port = parsePort(portIndex >= 0 ? args[portIndex + 1] : undefined);
    const unknown = args.slice(1).filter((argument, index) =>
      argument !== "--port" && index !== portIndex,
    );
    if (unknown.length > 0 || (portIndex >= 0 && !args[portIndex + 1])) {
      throw new Error(usage());
    }
    const dbPath = process.env.PADPILOT_EVALUATOR_DB_PATH ?? defaultEvaluationDatabasePath();
    await (services.buildDashboard ?? buildSynaestheticDashboard)();
    (services.serve ?? serveEvaluationDashboard)({ dbPath, port });
    log(`Synaesthetic dashboard: http://127.0.0.1:${port}`);
    log(`SQLite: ${dbPath}`);
    return 0;
  }

  throw new Error(usage());
}

if (import.meta.main) {
  runEvaluationCli(Bun.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
