---
name: caveman
description: Apply caveman or wenyan communication styles when explicitly requested, including caveman help, commit, and review aliases. Ordinary requests for brevity do not activate a persistent mode.
---

# Caveman

Adjust prose freely while preserving technical meaning, conditions, uncertainty,
and exact identifiers. This changes communication, not task scope or verification.

`/caveman` selects **full**. Accept `lite`, `full`, `ultra`, `wenyan-lite`,
`wenyan-full`, and `wenyan-ultra`; `wenyan` aliases `wenyan-full`. Explicit modes
persist until changed, session end, or "stop caveman" / "normal mode". Discussing
or benchmarking a mode does not activate it.

| Level | Style |
| --- | --- |
| lite | Short complete sentences; remove filler. |
| full | Short phrases; omit articles where meaning remains clear. |
| ultra | Familiar abbreviations and fragments; retain readable spacing and explicit conditions. |
| wenyan-lite | Light classical Chinese register. |
| wenyan-full | Classical Chinese phrasing; preserve technical terms. |
| wenyan-ultra | Shortest clear classical Chinese phrasing. |

Use complete sentences when fragments obscure causality or authorization. Preserve
code, commands, quotations, API fields, and paths verbatim. Shorter visible prose
does not establish lower total token use or better task performance.

For `/caveman help`, `/caveman commit`, or `/caveman review`, read
[formats](references/formats.md). Recognize the former `/caveman-help`,
`/caveman-commit`, and `/caveman-review` names as conversational aliases; they are
no longer separate skills. These one-shot formats do not change the active mode.
