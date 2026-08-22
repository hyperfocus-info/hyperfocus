# @hyperfocus/ai-core

Canonical zod-validated harness protocol plus a framework-neutral WebSocket client. Applications own presentation; the harness owns runtimes, persistence, credentials, and run state.

The client is deliberately optional. Consumers can remain fully offline and connect to a local harness only when AI features are requested.

