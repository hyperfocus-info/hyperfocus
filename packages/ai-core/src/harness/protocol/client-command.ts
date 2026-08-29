import { z } from "zod";
import { workspaceClientCommandSchema } from "./client-command-workspace";
import { runClientCommandSchema } from "./client-command-runs";
import { jobClientCommandSchema } from "./client-command-jobs";
import { assistantClientCommandSchema } from "./client-command-assistants";
import { runtimeClientCommandSchema } from "./client-command-runtime";
import { browserClientCommandSchema } from "./client-command-browser";
import { requestIdSchema, type CommandRejectionCode } from "./shared";

export const clientCommandSchema = z.discriminatedUnion("type", [
  ...workspaceClientCommandSchema.options,
  ...runClientCommandSchema.options,
  ...jobClientCommandSchema.options,
  ...assistantClientCommandSchema.options,
  ...browserClientCommandSchema.options,
  ...runtimeClientCommandSchema.options
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;

export function parseClientCommand(input: unknown): ClientCommand {
  return clientCommandSchema.parse(input);
}

export function getClientCommandRejectionMetadata(input: unknown, parseError?: unknown): {
  requestId?: string;
  code?: CommandRejectionCode;
} {
  if (!isRecord(input)) return {};
  const requestId = requestIdSchema.safeParse(input.requestId);
  return {
    requestId: requestId.success ? requestId.data : undefined,
    code: hasInvalidCursorIssue(parseError) ? "invalid-cursor" : undefined
  };
}

function hasInvalidCursorIssue(error: unknown) {
  if (!(error instanceof z.ZodError)) return false;
  return error.issues.some((issue) => issue.path.at(-1) === "cursor");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
