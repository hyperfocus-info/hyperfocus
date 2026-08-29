import { setDefaultTimeout } from "bun:test";
import { registerServerRuntimeBudgetTests } from "./runtime-budget-tests";

setDefaultTimeout(15000);

registerServerRuntimeBudgetTests();
