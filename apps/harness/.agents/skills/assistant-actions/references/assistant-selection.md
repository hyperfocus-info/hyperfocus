# Assistant selection

Resolve an exact id or a unique name in the named/current project first, then a
unique global name. Case-insensitive or fuzzy matches are usable only when
unambiguous. Use current persisted state, not a guess from the assistant prompt.

- Project-chat operations default to the current project unless another is named.
- Global assistants can answer state questions anywhere; project work and jobs need
  a known destination. A clone can use the current project as its destination.
- Bulk project actions target project-scoped assistants. Include global assistants
  only when named, or when the user explicitly requests workspace-wide scope.
- Ask one focused question when assistant, job, todo, question, project, or schedule
  still has multiple plausible targets. Supply the actual candidates.
- Do not ask again for an exact target, an already supplied schedule, or an
  authorized recovery action. An empty lookup is a result, not a clarification need.
- A request to inspect failure does not authorize retry. A requested recovery can
  proceed after local diagnosis unless it needs a human decision or missing access.

After clarification, resume the original action using
[operation handoffs](operation-handoffs.md).
