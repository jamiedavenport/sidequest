---
name: commit-and-push
description: Commit the current repository changes with a validated Conventional Commit message and push the current branch. Use when the user asks Codex to commit and push completed work; do not use for history rewriting, force-pushing, or release automation.
---

# Commit and push

Complete one normal commit-and-push operation for the current Git repository.

## Safety and scope

- Treat explicit invocation or an explicit request to commit and push as authorization for one normal commit and one normal push of the current branch.
- Never use `--no-verify`, `--force`, `--force-with-lease`, amend an existing commit, rewrite history, change branches, or pull/rebase unless the user explicitly requests it.
- Preserve all user changes. Inspect staged, unstaged, and untracked changes before staging. If changes appear sensitive, accidental, generated unexpectedly, or unrelated enough to require multiple commits, stop and ask for direction.
- Follow repository instructions and run the required validation appropriate to the change. Do not weaken or skip configured hooks.

## Workflow

1. Confirm the working directory is inside a Git worktree. Read `git status --short --branch`, identify the current branch, and stop if HEAD is detached.
2. Inspect the complete pending change, including staged and unstaged diffs and relevant untracked files. Review recent commit subjects only for repository-specific scope vocabulary, not as permission to abandon Conventional Commits.
3. If there are coherent pending changes, run the repository's required checks, then stage them with `git add -A`. Re-inspect the staged diff before committing.
4. Write a concise Conventional Commit message in the form `type(optional-scope): imperative description`. Choose the type and scope from the actual staged change. Prefer repository-specific commit rules when they are stricter. If Commitlint is available, validate the candidate before committing.
5. Commit normally so all Git hooks run. If a hook reformats files or rejects the message, inspect the result, fix the reported issue, re-stage as needed, and retry. Never bypass the hook.
6. Push only after the commit succeeds. Use `git push` when the branch has an upstream. If it has no upstream and `origin` is the unambiguous intended remote, use `git push --set-upstream origin <current-branch>`; otherwise ask which remote to use.
7. Verify the final branch status and report the commit hash, final subject, and pushed remote/branch.

If there are no pending changes but the current branch contains unpushed commits, push them after confirming the upstream. If there is nothing to commit or push, report that without creating an empty commit.

If the push is rejected or authentication fails, leave the successful local commit intact, report the exact blocker, and do not alter history automatically.
