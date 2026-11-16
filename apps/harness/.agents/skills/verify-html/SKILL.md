---
name: verify-html
description: Check a standalone HTML artifact for classic JavaScript syntax and missing local scripts without executing it. Use for standalone HTML delivery; bundled apps and module scripts need their own build checks.
---

# Verify a standalone HTML product

Run `bun <this-skill-directory>/verify-html.ts <absolute-html-path>`.
The command returns bounded JSON and exits nonzero for invalid JavaScript, missing
local scripts, unsupported module scripts, or network script dependencies.
Use `--help` for the command contract. It uses Node built-ins and launches no child processes.

For a requested working product, also exercise its relevant behavior in an owned
headless browser. Choose interactions and boundary cases from the actual artifact;
syntax validation alone does not establish product completion.

On Windows use PowerShell-compatible commands. Do not use Bash process substitution,
heredocs, or `node --check index.html`; this helper extracts and parses scripts.
Report incomplete features and unverified domains explicitly in the delivery.
