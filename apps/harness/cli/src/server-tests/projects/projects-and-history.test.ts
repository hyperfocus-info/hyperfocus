import { setDefaultTimeout } from "bun:test";
import { registerServerProjectsAndHistoryTests } from "./register-tests";

setDefaultTimeout(30000);

registerServerProjectsAndHistoryTests({ shardIndex: 0, shardCount: 4 });
