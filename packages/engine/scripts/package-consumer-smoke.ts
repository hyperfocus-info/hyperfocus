import { runExternalConsumer } from "./package-consumer-smoke/core.ts";

if (runExternalConsumer) await import("./package-consumer-smoke/external-consumer.ts");
