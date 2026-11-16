# Motion Laboratory

Runs six procedural-motion scenarios against real humanoid fixtures in three
synchronized views. Start with `bun build.ts`, then `bun server.ts` from this
directory. The server prints its URL.

Keep the laboratory's own theme and framework-neutral browser runtime. Its CSS
caption/control/body/section roles and constrained spacing supply local defaults;
do not reintroduce tiny labels or truncated diagnostic values. Full validation
and before/after evidence live in the
[example control handoff](../../../../docs/design-system/example-controls.md).

`browser-proof.ts` owns motion accuracy and deterministic replay. The design
capture additionally checks task controls, responsive overflow and increased text
size; it does not replace the motion proof.
