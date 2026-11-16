# Deterministic simulation arithmetic

`trig.ts` exports `sin` and `cos`; `atan.ts` exports `atan2`; `acos.ts`
exports `acos`. These pure binary64 functions avoid host-native transcendental
implementations whose last bits can differ between JavaScript engines. The owning
simulation facade selects these functions explicitly; nothing patches global Math.

The arithmetic closure is adapted from pinned @stdlib JavaScript sources:

- `sin`, `cos`, `rempio2`: 0.3.1, fdlibm/Sun argument reduction and kernels.
- `kernel-sin`, `kernel-cos`: 0.2.4, including the supplied cosine polynomials.
- `atan2`: 0.3.1, Go quadrant and exceptional-value handling.
- `atan`, `asin`, `acos`: 0.2.4, Cephes rational approximants and coefficients.
- `ldexp`: 0.2.5, binary exponent scaling used by large argument reduction.
- `number-float64-base-normalize`: 0.2.4, exact subnormal scaling in `bits.ts`.

CommonJS loaders, platform detection, generic collection adapters and examples
were removed. Constants, arithmetic grouping and range-reduction tables remain
unchanged. Direct DataView helpers replace generic float-word access; subnormal
normalization uses the same exact power-of-two scaling. `asin` and `acos` call
the local correctly rounded `sqrt`, never `Math.sqrt`. The unused fifth argument
to the upstream reduction kernel was removed. `Math.floor`, `Math.round` and
`Math.abs` remain where their specified exact operations are required.

One deliberate correctness repair differs from the pinned upstream `atan2`:
when finite `y/x` underflows to zero with negative `x`, the result takes its sign
from `y`. Thus `atan2(-Number.MIN_VALUE, -Number.MAX_VALUE)` is `-PI`, rather
than selecting the positive quadrant from the rounded zero ratio.

Large finite inputs use the complete 24-bit chunk `2/PI` table and fdlibm reduction,
not `% (2*PI)` or a small-input approximation. Signed zero, infinities, NaN,
subnormal inputs and inverse-trig domain boundaries have focused tests. Fixed
golden words in `trig.test.ts` come from the pinned pure-JavaScript stdlib sources
evaluated with Bun 1.4.2; broad host-native comparisons use a numerical tolerance,
not an assumption of identical native bits. A development differential probe also
compared 50,000 randomized binary64 arguments against those pinned sources.

The production facade `../simulation.ts` additionally exports the local correctly
rounded `sqrt` and fixed-order scaled `hypot`. Source-runtime Chrome/Bun comparison
passes exact complete checkpoints for a 2,562-frame physical first-to-three set and
rematch, plus 1,065 targeted physical-scenario frames. A native-math negative
control diverges at frame five. The compatibility prefix is `combat-v3:` because
these arithmetic changes alter simulation results for otherwise identical content.
Generic kinematic `Math.exp` damping is outside this tested rigid-combat boundary;
these checks do not prove every engine system deterministic. Exported browser
journeys remain separate from the source-runtime proof.

`sqrt.ts` selects a 39-byte WebAssembly `f64.sqrt` module once per JavaScript
realm, with the existing portable integer algorithm as the fallback when WASM is
absent or compilation is blocked. The module has no imports, memory or fetch;
numeric calls allocate no conversion buffers. Both paths preserve correctly
rounded finite results and IEEE exceptional-value behavior; arbitrary NaN payload
bits are not promised. Tests compare one million seeded binary64 samples and
rounding boundaries, and exercise fallback without changing global host objects.
Standalone exports allow `wasm-unsafe-eval` in their CSP, without enabling
JavaScript `unsafe-eval`. Restricted consumers continue to use the fallback.
The [Touch of Death audit](../../../examples/touch-of-death/docs/touch-of-death-performance-audit.md)
owns the visible-browser A/B evidence, exact physical-checkpoint comparisons, and
remaining performance limits for this primitive change.

Simulation-only A/B/B/A measurements over the full-set inputs give medians of
3,024.5 ms native and 3,076.05 ms portable (+1.704%, about 1.20 ms per frame).
Shared-machine noise and omitted rendering prevent an FPS claim. Raw comparison,
scenario and benchmark evidence is in
`.local/touch-of-death/deterministic-math-production/`.

Work arrays are module-private, synchronous scratch storage with no callbacks or
awaits; each JavaScript worker owns its own module instance. Do not introduce
reentrant callbacks or shared storage into these kernels.

Copyright and complete license texts are preserved in each adapted source header,
`THIRD_PARTY_NOTICES.md`, and the published engine `third-party-notices.md`. The
headers use `/*!` as well as `@license`; Bun's minifier requires the former to
retain these notices in self-contained exports. `licenses.test.ts` bundles the
production facade with Bun minification and checks all required notice families.
The shared `bits.ts` module carries one retained copy of the complete Apache-2.0
license, so a standalone HTML export includes the license itself as well as the
individual upstream notices. The bundle test checks the complete-text markers
and verifies the license copy is not duplicated.
