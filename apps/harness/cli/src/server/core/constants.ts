
import { STREAM_DELTA_MAX_BYTES } from "@hyperfocus/ai-core/protocol";

export const DEV_UI_LIVE_RELOAD_ENDPOINT = "/__dev/ui-reload-state";

export const BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION = 2;

export const BACKGROUND_JOB_REPOSITORY_CONTRACT_METHODS = [
  "appendBackgroundJobRunEventIfOwned",
  "touchBackgroundJobRunIfOwned",
  "setBackgroundJobRunStatusIfOwned",
  "renewBackgroundJobRunLease",
  "isBackgroundRunOwnedBy"
] as const;

export const DERIVED_PROGRESS_HEARTBEAT_MS = 10_000;

export const STREAM_DELTA_FLUSH_MS = 50;

export const STREAM_DELTA_MAX_BUFFERED_BYTES = STREAM_DELTA_MAX_BYTES;

export const STREAM_PERSIST_INTERVAL_MS = 1000;

export const BACKGROUND_RUN_CONTROLLER_LEASE_MS = 900000;

export const BACKGROUND_RUN_CONTROLLER_RENEW_MS = 60000;
