# Portable utilities

`@hyperfocus/utilities` owns framework-neutral primitives used by repository
apps, packages and tooling. Import a focused public subpath; there is no root
barrel. No Solid, DOM state, filesystem, persistence or host credentials belong
here. Project policies stay in their local utility modules.

- `/assert`: `assert(condition,message)` throws Error for falsy conditions and
  narrows the asserted condition for TypeScript. Error text belongs to the caller.

- `/compare`: `checkpointDifference(a,b,path = '$')` returns the first diagnostic
  difference between acyclic checkpoints. Typed arrays and DataViews compare exact
  selected bytes and constructors; native typed-array element values remain
  uncoerced, including bigint and signed zero. Objects compare own enumerable
  string keys in ordinal order, ignoring prototypes and symbol keys. Other values
  use Object.is. This is a checkpoint diagnostic, not general object equality;
  neither input is mutated and cycles are unsupported.

- `/math`: `clamp(value, min, max, inverted = 'maximum')`, `clamp01`,
  `roundDecimal(value, places = 0)`. Clamp propagates NaN and infinities; the fourth
  argument preserves the two historical inverted-bound policies. Rounding uses
  JavaScript Math.round, including negative ties and floating-point limits.
  `clampLowerFirst` exposes the direct lower-bound-winning formula for hot paths;
  `clamp01Or` uses an explicit fallback for nonfinite input. `finiteOr`,
  `positiveNumberOr`, `nonNegativeNumberOr`, `positiveSafeIntegerOr` and
  `nonNegativeSafeIntegerOr` preserve distinct finite/sign/integer policies and
  return the caller's fallback unchanged for invalid input.
  `clampInteger` rounds finite clamped input and returns the minimum for nonfinite
  input; `isFiniteNumber` supplies the non-coercing type guard.
  `smoothstep01` retains the clamped `t*t*(3-2*t)` operation order; `modulo` retains
  `((value % divisor) + divisor) % divisor`, including negative-divisor/zero behavior.
  `mean` returns zero for an empty array and otherwise uses ordinary left-to-right
  addition divided by length, without filtering invalid samples.
  `parseBoundedInteger` and `parseBoundedDecimal` preserve base-10 parseInt versus
  parseFloat prefixes, decimal-step rounding and configurable bound precedence
  (default minimum). Invalid/falsy text returns undefined; these are not strict
  financial parsers.
- `/tuples`: `map3` and `map4` map dense ordinary fixed-width tuples, retaining
  width, callback index order and source identity, with one result array. They do
  not validate/coerce input or emulate typed-array/subclass species behavior;
  unknown or sparse arrays belong at a reader boundary.
- `/records`: `isRecord` excludes null/arrays; `isObject` excludes null and allows
  arrays; both permit non-plain prototypes. `asRecord` keeps record identity and
  returns a new empty object for invalid input. `asObject` permits arrays;
  `isPlainRecord` requires Object/null prototypes. `requireRecord` and `recordField`
  accept a caller-owned error message. `objectRows` filters an untrusted array to
  non-null objects including array elements. They do not sanitize properties.
- `/text`: `text` extracts strings unchanged or returns empty text, `escapeHtml`
  escapes five HTML-sensitive characters (unknown input requires explicit
  `{coerce:true}`), and `errorMessage` preserves Error and
  string messages with explicit fallback/stringification options. `readText`
  returns validated text or undefined; `requireText` throws a caller-supplied
  message. Trimming, nonblank checks, length bounds and UTF-16/UTF-8 units are
  explicit. Error-only and nonblank fallbacks use `acceptStrings` and `nonBlank`.
  `normalizeWhitespace`, `stringValues`, `encodePath` and `escapeRegExp` own the
  corresponding literal transformations. `compareText` uses ordinal JavaScript
  ordering. `constantTimeTextEqual` preserves a full-max-length XOR loop; the name
  does not establish a cryptographic timing guarantee in JavaScript.
  No trimming/coercion is implicit.
  HTML apostrophes can retain the legacy `&#039;` spelling with `apostrophe`;
  `formatPercent` retains `Math.round(value * 100)` without clamping.
  `escapeInlineJson` replaces literal `<` in JSON with `\u003c`, preserving native
  serialization failures and throwing on undefined output.
  `parseBooleanText` accepts only the literal strings `true`/`false`.
  `formatBytes` retains the editor's base-1024 B/KB/MB display policy, one decimal
  for KB/MB and no validation or automatic promotion beyond MB. Explicit
  `{unit:'KB'|'MB',places}` selects a fixed binary unit/precision for other consumers.
  Automatic storage labels can select `maximumUnit:'GB'`, `bytesLabel:'bytes'`
  and `nanUnit:'bytes'`; the editor defaults retain their original MB/NaN policy.
- `/records` also exposes `copyRecord`: a shallow copy of own enumerable string
  keys, excluding arrays and returning undefined for invalid input. It preserves
  native getter/proxy errors; identity-preserving guards and readers stay distinct.
  `requireRecordCopy(value,label)` applies the same copy policy and throws
  TypeError with the caller's label for invalid input.
- `/validation`: `requireNumber` accepts only finite numbers with explicit range
  and safe-integer policies; it never coerces or clamps. `requireBoolean` is
  non-coercing. Explicit `{finite:false}` admits every number unchanged, including
  NaN and infinities, for protocol-owned normalization; it cannot combine with
  bounds or integer checks. `requireBigInt` accepts only native bigint values.
  `requireOneOf` returns an actual allowed value using Object.is,
  and `requireArray` returns dense unknown elements for a domain reader to check.
  The engine's report, appearance and portable-resource readers are real consumers.
  `readObject` composes actual typed field readers and preserves unknown own fields
  shallowly; `ObjectReaders<T>` requires every canonical key, including optional
  keys. `optional` preserves absence and explicit undefined without defaults.
  `readList`, exact `readTuple`, `readDictionary` and `readUnion` compose nested
  readers. `readArrayLike` validates a safe nonnegative length and indexed values,
  returning a detached ordinary array from typed buffers or indexed objects.
  Domain readers own deep-clone or borrow policy and authored-reference validation.
- `/money`: `decimalCents` accepts signed safe-integer cents and emits exact
  two-place decimal text using integer digits. It rejects fractions, infinities,
  NaN and unsafe amounts. It never rounds or converts major units to cents.
- `/timing`: `createDebouncedCallback({ callback, delay, schedule? })` returns
  `invoke`, `cancel`, `flush` and `pending`. It uses trailing execution and the
  newest arguments; owners cancel on disposal. Flush runs pending work once and
  permits reentrant invocation. Delay must be finite/nonnegative. An injected
  asynchronous scheduler returns a cancellation function, allowing deterministic
  tests without platform timer-handle types. It does not cancel callback-owned
  async work after execution begins.
- `/csv`: `csvCell` always quotes and doubles quotes. It neutralizes leading
  formula markers; options can retain raw formulas or string negatives when a
  consumer has a different export contract. Numeric negatives remain numeric by
  default. `formulaPolicy:'whitespace'` preserves the custom-report rule covering
  whitespace before =/+/@/- and leading tab/CR/LF; `numeric:true` explicitly marks
  a trusted numeric column and bypasses that text neutralization.

Keep existing consumer semantics when migrating: throwing versus fallback,
whitespace, byte versus character limits, quote spelling, inverted bounds and
timer cleanup are observable. Compatibility facades can re-export these owners;
they must not retain copied implementations. New policies need real consumers
and boundary vectors. Run `bun test packages/utilities`, the package typecheck and
build, plus affected consumers; see [package testing](../../docs/package-testing.md).
