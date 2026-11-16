# Casey Muratori: abstractions, primitives and performance

Research checked November 1, 2026. This is a synthesis of published sources,
not a claim to speak for Muratori. The [repository audit](../audits/casey-muratori.md)
applies the ideas; [the improvement loop](../../packages/performance/README.md#improvement-loop)
owns the working procedure. Repository conclusions are explicitly distinguished
from his statements. Public text and source listings were read; subscriber-only
video content was not accessed.

## Start with the operation, then discover the abstraction

In [Semantic Compression](https://caseymuratori.com/blog_0015) (2014), Muratori
starts with working procedural code and extracts repeated meaning. The objective
is to express the particular operation with less irrelevant repetition while
retaining the details necessary to implement it. He waits for actual instances
before inventing reusable machinery. Objects may emerge as useful bundles of data
and operations; noun taxonomies and inheritance diagrams are poor substitutes for
discovering what the program must do.

This is stronger than minimizing line count. A useful abstraction removes a
recurring burden for callers while keeping the implementation intelligible. A
generic callback pipeline that hides the same work behind several names has not
necessarily compressed anything meaningful. That last test is our application
of his method, not a quotation or a ban on callbacks.

## Preserve a path from convenience to control

[Complexity and Granularity](https://caseymuratori.com/blog_0016) (2014) argues for
continuous granularity: higher-level operations should compose smaller useful
operations without making those operations inaccessible. The caller who needs
one unusual button should not have to replace the entire panel system. He also
clarifies that tightly associated data and functions are acceptable; the objection
is to a design process that predetermines the object hierarchy.

For Hyperfocus, this suggests convenience methods over the same primitive owner:
advance without taking a save snapshot, fill a caller-owned result when needed,
or drive a simulation without inheriting its scheduler. It does not justify
exposing unsafe mutable storage to every caller. Lifetimes, validation and
ownership remain necessary when choosing the lower-level operation.

## Judge an API by integration, not its vocabulary

Muratori's [2004 reusable-components lecture, republished in 2014](https://caseymuratori.com/blog_0024)
describes integration discontinuities and the development of Granny's second API.
Useful technology still fails if adopting it forces another system to surrender
important control. Chris Hecker, whom Muratori credits with the flow-control
addition, preserves a contemporaneous [five-axis summary](https://www.chrishecker.com/API_Design):

| Axis | Our concrete review question |
| --- | --- |
| Granularity | Can the caller replace one expensive operation without rewriting the surrounding system? |
| Redundancy | Is there a convenient common operation as well as its composable pieces? |
| Coupling | What unrelated types, services, state or initialization must be adopted? |
| Retention | Which side owns authoritative state, and what must stay synchronized? |
| Flow control | Who decides when work occurs, how much runs, and when it stops? |

The names are the historical framework; the questions are this repository's
interpretation. Redundancy here can mean useful alternative API routes, rather
than duplicate implementations with diverging semantics.

## Avoid rules that prevent seeing or changing the work

In [“Clean” Code, Horrible Performance](https://www.computerenhance.com/p/clean-code-horrible-performance)
(2023), his shape-processing example compares representations and operations.
The important lesson is that architectural choices can obstruct batching, data
layout and optimization across operations. The example does not establish a
universal multiplier for all object-oriented programs, JavaScript or this engine.

His [follow-up explanation](https://www.computerenhance.com/p/response-to-a-reporter-regarding)
distinguishes indirect-call overhead from the larger loss of optimization freedom.
He explicitly supports segregated arrays when suitable; a switch is not his
universal replacement for every polymorphic design. He also frames types versus
operations as a trade in extensibility, rather than one form being an unconditional
superset. For us, runtime plugin extensibility and a closed numeric kernel can
legitimately have different interfaces.

The [Lister Panel Q&A](https://caseymuratori.com/blog_0023) (2014) rejects a fixed
function-length threshold as his extraction rule. Sequential, unreused work often
stays together; a meaningful name can still help hide a genuinely unwieldy section.
He sometimes prefers small obvious duplication over a compressed expression that
is easier to misunderstand. Our source-size lint is consequently a maintenance
constraint, not evidence that splitting a hot loop improves its architecture.

## Performance awareness comes before heroic optimization

The [course introduction](https://www.computerenhance.com/p/welcome-to-the-performance-aware)
(2023) distinguishes avoiding gross inefficiency through ordinary design choices
from maximizing speed on a particular machine. Hardware awareness should inform
routine code; not every operation needs a specialist optimization project. His
broad claims about modern software's inefficiency are advocacy, not a measured
baseline for Hyperfocus.

The public [course map](https://www.computerenhance.com/p/table-of-contents) organizes
the subject around waste, instruction throughput, SIMD, memory and multithreading,
then profiling and data movement. This gives us questions to investigate, not an
ordered mandate to introduce all five techniques:

- [Waste](https://www.computerenhance.com/p/waste): what instructions or operations
  are unnecessary for the required result? Repeated validation, transformation,
  serialization and copying deserve counts before adding a faster backend.
- [Instructions per clock](https://www.computerenhance.com/p/instructions-per-clock):
  necessary operations can still execute poorly because of dependencies and the
  way work is presented to the processor. Source brevity does not establish this;
  generated code and the actual runtime matter.
- [SIMD](https://www.computerenhance.com/p/single-instruction-multiple-data): one
  instruction can process multiple values. In our JS/WASM boundary, packing,
  copies, calls and leftovers are additional costs that must be included.
- [Caching](https://www.computerenhance.com/p/caching): loads, stores and dependencies
  matter alongside arithmetic. Here the topic is hardware data access, not a rule
  to add application memoization everywhere. Hot working set and access order are
  better questions than simply counting typed arrays.
- [Multithreading](https://www.computerenhance.com/p/multithreading): multiple cores
  can execute independent instruction streams. Our additional question is whether
  useful parallel work exceeds messaging, synchronization and scheduling costs.

The repository-specific examples in these bullets are derived audit questions;
the public excerpts do not establish numerical gains for any Hyperfocus path.

## Establish what reasonable performance looks like

[Repetition Testing](https://www.computerenhance.com/p/repetition-testing) (2023)
separates ordinary program profiling from investigating a path's favorable
performance limit. Repeated runs expose variability from machine state; the best
observation is diagnostic headroom, not a promise about normal operation.
His [published repetition tester](https://github.com/cmuratori/computer_enhance/blob/main/perfaware/part3/listing_0103_repetition_tester.cpp)
checks balanced timing blocks and the expected processed-byte count, and retains
minimum, maximum and total timing. A benchmark must establish that the claimed
work occurred.

The [refterm reference implementation](https://github.com/cmuratori/refterm)
demonstrates a straightforward tile renderer and glyph cache while retaining
important text features. Its stated purpose is a reasonable reference floor,
not an ultimate speed record or a complete terminal. The transferable method is
to build a small, feature-representative counterexample to an assumed cost.
Its historical comparisons are not present-day measurements of other terminals.

Our implication: pair a simple direct implementation with the real consumer.
Estimate unavoidable bytes and operations, then measure the gap. A lower-bound
kernel can disprove an excuse without proving a production replacement. Keep
frame tails, startup, power, memory and network costs in the user-facing check.

## Experimental design can produce the design document

In the [September 2026 Peterman interview](https://www.developing.dev/p/casey-muratori-surprises-in-computer),
around 58:33–1:08:57, Muratori emphasizes retaining a credible route to efficient
execution and testing actual usage before fixing an architecture. He accepts
documentation that communicates what implementation experiments established;
his objection is designing complex interactions from untested assumptions.

That supports a small repeatable loop: inspect a real operation, predict its work,
experiment, retain the result and let the useful abstraction emerge. It does not
require a universal framework, an automatic rewrite or an agent tournament.

## Limits and counterexamples

- [Immediate-mode UI](https://caseymuratori.com/blog_0001) is an example of reducing
  synchronization burden in his viewer tooling, not proof that every accessible
  web interface should be replaced with a custom canvas.
- Managed runtimes need their own measurements. C++ instruction/layout examples
  do not predict JavaScript JIT decisions, garbage collection or Safari behavior.
- Fewer allocations can add comparison/reset work; stronger locality can add
  conversion cost. Our existing game experiments include rejected examples.
- Determinism, identity safety, accessible input and recovery are part of the
  required output. Removing them changes the problem instead of solving it faster.
- No source supplies our oldest supported phone, acceptable latency or offline
  product policy. Those must come from users and device evidence.
