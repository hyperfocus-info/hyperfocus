# Caveman compression helper

This packaged skill rewrites explicitly requested prose through Claude. Invocation
and provider requirements live in [SKILL.md](SKILL.md).

Run these commands from this directory:

```text
python -m unittest scripts.test_compress
python -m scripts.validate original.md candidate.md
python -m scripts.benchmark original.md candidate.md
```

The tests run offline with mocked inference. Validation rejects changed headings,
fenced code, inline code, frontmatter, detected paths, URLs, and empty output.
It does not prove preservation of prose meaning, all commands, indentation-based
code, list hierarchy, or table semantics; inspect the diff and exercise the
instructions on representative tasks.

Candidates remain in a temporary directory until validation passes. The helper
checks for source changes during inference, creates the backup exclusively, and
replaces the source atomically. It is not a locking protocol for simultaneous
writers. Existing backups are never overwritten; move a backup deliberately before
requesting another compression. Restore from the backup if semantic review fails.

Benchmarking requires `tiktoken` (`python -m pip install tiktoken`) and reports
`o200k_base` text counts. It does not measure Astra provider usage, reasoning,
tool context, latency, or task success. No fixed savings percentage is guaranteed.
Missing tokenization fails rather than substituting word counts.

The helper sends the requested text to Claude through the Anthropic SDK or
`claude --print`. The SDK uses `ANTHROPIC_API_KEY`; the CLI uses its own configured
authentication and environment. Missing SDK support falls back to the CLI; this
script does not sandbox that external CLI. A fixed argument list and stdin avoid
shell interpolation, calls have a deadline, and the Windows child is requested hidden.

Local writes are temporary candidates beside the source, the sibling
`<stem>.original.md` backup, and the source replacement. Review content before
choosing a file to send; provider access is not a reason to include unrelated files.
