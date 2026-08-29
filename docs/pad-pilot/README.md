# PadPilot documentation

PadPilot is the first-party VST3 platform surface in `apps/pad-pilot`. The
marketplace service is independently deployable from `apps/pad-pilot-marketplace`;
portable Module contracts live in `packages/pad-pilot`.

## Start here

- [App guide](../../apps/pad-pilot/README.md): product model, local commands, and implementation routes.
- [Marketplace guide](../../apps/pad-pilot-marketplace/README.md): service boundary, storage, endpoints, and environment.
- [Zipper merge](zipper-merge.md): source audit, ownership decisions, execution slices, and proof gates.
- [Factory Modules](factory-modules.md): shipped Module catalog and capability contract.
- [Module bridge compatibility](module-bridge-compatibility.md): public bridge compatibility expectations.
- [VST quality gates](vst-quality-gates.md): DSP, realtime, persistence, validator, and host acceptance.
- [FL Studio setup](fl-studio-mvp-setup.md): primary host setup and validation.
- [Testing](testing/README.md): test and validation routes.
- [Tasks](tasks/README.md): owned migration, hardening, and release debt.
- [Audits](audits/README.md): retained architecture and quality findings.

FX catalog/status material and the synaesthetic evaluator guide remain here
because they describe PadPilot product behavior rather than reusable package APIs.

Related: [repository documentation map](../README.md), [architecture](../architecture.md),
[distribution](../distribution.md), and [`@hyperfocus/pad-pilot`](../../packages/pad-pilot/README.md).
