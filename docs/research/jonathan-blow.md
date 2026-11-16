# Jonathan Blow: engineering and game-design knowledgebase

Research date: November 1, 2026. This is a sourced interpretation of Blow's work,
not a repository policy or a claim that he has reviewed Hyperfocus. The companion
[code audit](../audits/jonathan-blow.md) applies these ideas to the current tree.

The connecting idea is **preserve the ability to understand, change and improve
the actual thing being built**. In software, this means direct representations,
visible costs and short feedback loops. In games, it means coherent rules whose
consequences are worth discovering. Simplicity serves those outcomes; small code,
few buttons, low-level languages and fewer dependencies are imperfect proxies.

## Good software

### 1. Complexity must pay for itself

In his 2016 Braid cleanup, Blow removes an automatic bitmap-loader registration
framework because straightforward extension dispatch supplies the needed
behavior with less machinery. He also deletes obsolete platform and publisher
paths, revisits assumptions inherited from old hardware, and discusses replacing
linked entity traversal with arrays. This is concrete maintenance reasoning:
compare the work a mechanism creates against the capability it supplies today.
Historical justification does not guarantee continuing value. Neither does a
pattern's familiarity. [Braid Code Cleanup, Part 1, July 16, 2016](https://number-none.com/blow/blog/programming/2016/07/16/braid_code_cleanup_1)

**Application:** when reviewing an abstraction, name its real consumers, the
decision it centralizes, and the changes it makes easier. Follow one modification
through its full call path. A reusable library that removes repeated work can
pass this test; a registration layer that merely relocates a switch can fail it.

### 2. Share useful data without forcing everyone into the same operation model

His programming-language note uses vectors to distinguish agreement about data
from agreement about operations. Programs can share a vector representation yet
want different operations on it. Putting one privileged operation set into the
data type encourages incompatible replacement types and conversions. Ordinary
data with independently supplied functions makes that disagreement less
expensive. This is a particular critique of coupling, not evidence that every
object or encapsulated resource is wrong. [A note about programming language design, September 12, 2012](https://the-witness.net/news/2012/09/a-note-about-programming-language-design/)

**Application:** keep identity, units, ownership and layout explicit. Normalize
representations where they remove real conversion work. Preserve different
layouts when their costs or domains differ: an authored position, a packed GPU
attribute and a physics structure-of-arrays need not be one universal object.

### 3. Choose the representation from the problem

Braid's rewind requirement motivates particles whose state can be reconstructed
from time and particle identity, rather than retaining every historical state.
The discussion includes deterministic randomness, visible correlation errors,
and duplicated paths that become difficult to keep consistent. It also admits
that an awkward implementation can be adequate to ship when more consequential
player-facing defects compete for attention. Representation can eliminate work
that local optimization would only accelerate; practical priorities still matter.
[Braid Particle System Revision, Part 1, July 7, 2016](https://number-none.com/blow/blog/programming/2016/07/07/braid_particles_1)

**Application:** before pooling a hundred copied objects, ask why those objects
must be copied. Before storing history, ask what is reproducible from inputs,
seed and checkpoints. Do not substitute clever reconstruction where external
events or nondeterminism make it incorrect.

### 4. Performance claims need a real cost model

His older technical rants challenge algorithms whose advertised advantages
disappear on interactive workloads, and comparisons that tune the proposed
algorithm more carefully than the baseline. He favors simplification and argues
that inefficient choices should be conscious. The networking discussion also
connects implementation decisions to whether a player can understand why an
action failed. These are historical arguments, not a current verdict on every
networking technique. [Miscellaneous Rants, 2004](http://number-none.com/product/Miscellaneous%20Rants/index.html)

**Application:** examine worst frames, copies, allocation lifetimes, data movement
and boundary overhead. A faster kernel does not establish a faster game. Compare
equivalent outputs and realistic workloads; include the work needed to prepare,
transfer and consume the kernel's input and output.

### 5. Build tools should preserve thought and expose the machine

The 2025 Jai demonstration emphasizes fast compilation, compiler metaprogramming
in the same language, and generated ordinary code that remains inspectable in a
debugger. It demonstrates structured compiler information, code-cost inspection,
and allocator instrumentation for exploring memory activity. Memory control and
visibility are treated as tools for understanding real programs. The reported
roughly 2.3-second clean compilation is a talk/demo claim, not a benchmark
independently reproduced here. His cost weights are design choices, not a
universal complexity metric. [Jai Demo and Design Explanation, LambdaConf 2025](https://www.youtube.com/watch?v=IdpD5QIVOKQ),
[transcript used for this research](https://youtubetotranscript.com/transcript?current_language_code=en&v=IdpD5QIVOKQ)

**Application:** measure edit-to-observed-result, preserve inspectable source
locations, and connect allocation or execution reports to their causes. A memory
number without lifetime or ownership is difficult to act on. A fast compiler
alone cannot repair slow startup, repeated navigation or lost experiment state.

### 6. Deep understanding and taste are engineering resources

In the Notion interview, Blow describes context-sensitive taste rather than
blind application of style rules. He discusses the benefits of experienced,
autonomous colleagues and the difficulty of retaining shared understanding as a
team grows. His criticism of interface minimalism is also useful: removing
visible controls can remove the information needed to understand a program.
The discussion recognizes organizational tradeoffs rather than proving that one
team structure always wins. [Notion Pioneers interview, August 2, 2021](https://www.notion.com/blog/jonathan-blow)

**Application:** evaluate how quickly someone can locate, explain and change a
behavior. File-size limits and interface counts can reveal review candidates;
they cannot establish comprehensibility. Make important operations discoverable
and preserve a route from symptom to the responsible code and state.

## Good games

### 7. Meaning should emerge through playing

His 2006 design rant argues for games capable of expressing something about
human experience through their actual play. Novelty alone is insufficient, and
a story attached to conventional actions does not automatically make those
actions meaningful. Ultima IV is discussed as a richer exploration than a single
good/evil meter. This does not require every game to teach morality or carry an
explicit message. [Game Design Rant, March 23, 2006](https://number-none.com/blow/slides/rant_2006)

**Application:** describe the experience a mechanic creates, not just its feature
name. Ask what the player notices, infers, risks and chooses while using it.
Additional modes, content or visual spectacle need a relationship to that
experience; they are not automatically depth.

### 8. Remove ambiguity that obstructs the intended discovery

In Jesper Juul's interview, Blow explains Braid's familiar platforming substrate
as a way to focus attention on time mechanics. The Witness similarly gives a
clear puzzle interaction so the challenge can concern solving rather than
guessing what is interactive. Individual puzzles should contain ideas; matching
area counts is not the design goal. He also resists reducing Braid to one simple
interpretation and connects enjoyable development tools to the work produced.
[Handmade Pixels interview, March 21, 2018](https://www.jesperjuul.net/handmadepixels/interviews/blow.html)

**Application:** distinguish difficulty inside the intended skill from confusion
about controls, state or causality. For a fighting game, this can mean readable
contact, intelligible failed inputs and precise retry tools while preserving
execution difficulty and strategic uncertainty.

### 9. Discover consequences instead of manufacturing arbitrary exceptions

The jointly authored talk with Marc ten Bosch frames design as exploring what
follows from a system and presenting its essential ideas clearly. Its published
abstract contrasts this approach with more arbitrary combinations. This research
uses the collaborator's primary summary, not an independently reviewed full
recording. [Designing to Reveal the Nature of the Universe, 2011](https://marctenbosch.com/news/2011/11/designing-to-reveal-the-nature-of-the-universe/)

**Application:** build small playable situations that expose interactions among
existing rules. Investigate surprising outcomes before suppressing them. An
exception can be justified, but should solve an understood design problem rather
than hide a mechanic that does not fit the rest of the game.

### 10. Iterate on difficult, consequential problems

The Depth Jam proposal emphasizes participants bringing ongoing games with
serious problems, implementing between critique sessions, and returning with
changed work. It contrasts sustained investigation with events that can reward
surface novelty. The point is feedback that produces a better game, not the
mere occurrence of collaboration. [The Depth Jam, May 29, 2012](https://the-witness.net/news/2012/05/the-depth-jam/)

**Application:** use a concrete playable question, record what changed, and
revisit the result. Automated simulations can expose rule failures; they cannot
establish whether people found an experience clear, surprising or worthwhile.

## His objections to modern software and infrastructure

In the 2019 DevGAMM talk, Blow argues that everyday failures have become
normalized, hardware progress conceals software inefficiency, and abstraction
can reduce the population capable of repairing underlying systems. He objects
to accumulated friction in installation, operating-system interfaces, shader
languages, compilation and distribution. Infrastructure sometimes restores
capabilities lost through earlier complexity while introducing more machinery.
His criticism includes containers in that context. He acknowledges useful
abstraction and the immediate benefits of ready-made engines; his longer-term
concern is lost competence and dependency on systems few people understand.
He advocates simplifying the parts one can actually control.
[Official DevGAMM recording, 2019](https://www.youtube.com/watch?v=ZSRHeXYDLko),
[timestamped transcript of his speech](https://codigoyfika.github.io/site/preventing-collapse/)

This is his thesis, not an established industry-wide measurement. The historical
analogies, decline claims and productivity comparisons are not independently
validated here. Security, compatibility and operational requirements can justify
real complexity. The useful audit question is which requirement each layer
serves and whether a simpler complete solution can meet it.

## Tradeoffs and limits of applying this philosophy

In the October 2026 GamesBeat interview, Blow explicitly describes the cost of
building a language, engine and game together. He estimates that reusing the
Witness C++ engine might have saved two to four years; that is a retrospective
estimate, not a controlled comparison. He also argues that puzzles should reward
the effort they demand and warns against treating negative playtest feedback
from part of an audience as an automatic command to remove distinctive ideas.
[GamesBeat interview, October 13, 2026](https://gamesbeat.com/how-thekla-created-order-of-the-sinking-star-with-1500-puzzles-jonathan-blow-exclusive-intervie/)

These tradeoffs matter here. A language rewrite requires a product case. An
allocation reduction requires whole-loop evidence. A mechanic should retain its
intended audience and challenge while observed defects are repaired. Human
feedback informs a design judgment; it does not replace one with majority vote.

Do not attribute [Carmack on Inlined Code](https://number-none.com/blow/blog/programming/2014/09/26/carmack-on-inlined-code)
to Blow simply because he hosts it: the text is John Carmack's. Likewise,
Thekla engineering articles have individual authors. This knowledgebase draws
on Blow's authored work, his interview answers, a joint talk summary and
transcriptions of his speech. Transcript mirrors may contain errors; exact
wording should be checked against recordings before quotation.

## Audit questions derived for Hyperfocus

The following are this audit's operational interpretation, not quotations or
new project rules.

| Area | Question that can be answered with evidence |
| --- | --- |
| Primitives | Can valid-looking stale identifiers affect a different object? Does rejected work leave capacity and state unchanged? |
| Representation | Does the format express the domain directly, or repeatedly convert and copy an intermediate form? |
| Memory | Who owns each allocation, who may borrow it, what invalidates it, and what does release actually guarantee? |
| Engine | Can a game change policy without changing generic simulation machinery? Are optional systems really optional? |
| Debugging | Can a bad frame or failed action be traced to the exact input, state, code revision and responsible operation? |
| Performance | Does a claimed win survive equivalent full-loop work, realistic content, instrumentation controls and repeat runs? |
| Iteration | How much time and manual reconstruction separate editing a rule from observing the same situation again? |
| Infrastructure | What capability does each tool or service supply, and can the project build, run and recover through documented boundaries? |
| Games | Can intended players discover meaningful consequences, understand failures and pursue their own next experiment? |
| Evidence | Which conclusions were executed, measured, observed in humans, inferred from source, or merely proposed? |

The companion audit owns findings, priorities and acceptance suggestions. This
document owns the research interpretation; neither changes approved game design.
