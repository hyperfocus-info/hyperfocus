# Git inspection

## Resolve the target

Accept a remote branch, local branch, or commit SHA. Use a user-provided base;
otherwise choose the merge base with `HEAD` or the evident tracking base. Discover
ambiguous targets before asking:

```powershell
git status --short --branch
git branch --all --list "*<name>*"
git rev-parse --verify <target>
```

Fetch when the user names a remote target or freshness affects the review. A fetch is
not needed for a fixed local commit that already resolves.

## Establish the range

- Commit: `<sha>^..<sha>`.
- Branch: `<base>...<branch>`, after resolving the merge base.

Start with shape, then narrow:

```powershell
git show --stat --oneline <commit>
git diff --name-status <base>...<branch>
git log --oneline <base>..<branch>
git diff --check <base>...<branch>
```

Read focused diffs with enough surrounding context:

```powershell
git diff --unified=80 <range> -- <paths>
git show --unified=80 <commit> -- <paths>
git show <target>:<path>
```

Use `rg` or `git grep` for call sites, schemas, tests, and conceptually duplicate
behavior. Do not check out the target in the main worktree.

## Compare current work

Search the current tree for the behavior introduced by the target, not only its exact
names. Inspect overlapping local changes:

```powershell
git diff --name-status HEAD -- <paths>
git diff --unified=80 -- <paths>
git diff --name-status HEAD..<target>
$mergeBase = git merge-base HEAD <target>
git merge-tree $mergeBase HEAD <target>
```

Separate correctness findings from optional style. Review especially:

- invalid or hostile boundary inputs;
- data migrations, persistence, retries, cancellation, and partial failure;
- races, stale identifiers, or state stored at the wrong scope;
- UI keyboard, focus, disabled reasons, recovery, and responsive behavior; and
- tests that assert shape without proving the user-visible contract.
