# Caveman formats

Read only the requested format. Formatting does not grant permission to commit,
post a review, or change configuration; continue actions already authorized.

## Help

Show modes from the skill's table and these one-shot commands without changing mode:

| Command | Result |
| --- | --- |
| `/caveman help` | Mode and command help. |
| `/caveman commit` | Concise Conventional Commit text. |
| `/caveman review` | Concise review findings. |
| `stop caveman` or `normal mode` | End the active mode. |

Former hyphenated names are conversational aliases. This skill implements no
environment-variable or configuration defaults.

The packaged Harness also supplies `caveman-compress` for an explicitly requested
prose-file rewrite. Its Python/provider requirements and preservation limits are
in that skill; it does not change the active communication mode.

## Commit

Use `<type>(<optional-scope>): <imperative summary>` and the repository's commit
conventions. Include a body for material reasons, breaking changes, migrations,
or reverts. Preserve required trailers and requested attribution; invent neither
issue references nor coauthors. Return pasteable text in the requested format.

## Review

Lead findings with file/line, concrete failure, trigger, impact, and supported fix.
Use a short paragraph when one line would lose evidence or uncertainty. The
owning review workflow determines inspection and validation; this mode only
changes presentation.
