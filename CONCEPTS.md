# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Branch Groups

### Branch Group
A cohort of tasks that share one integration branch and one managed pull request. The group — not its member tasks — owns the shared branch name, the PR identity, and the group lifecycle (open, finalized, abandoned). Members reference their group by the group's stored id, never by a derivable string.

A Branch Group's shared branch is only ever a merge *target*; it is never any member task's working branch. Each member works on its own per-task branch and lands onto the group branch.

### Branch Assignment Mode
The strategy by which a task acquires its working branch and merge target. Shared mode gives the task a per-task working branch derived from the group's shared branch and sets the shared branch as merge target; per-task-derived mode gives a derived working branch with no shared target; the remaining modes (project default, existing, custom new) bind the task directly to a named branch. Only shared mode creates Branch Group membership.

### Landed
The status of a Branch Group member whose work is merge-confirmed onto *its own group's* shared branch via the branch-group integration path. A member merged onto any other branch — a sibling task branch, the project default — is not Landed, regardless of its column. A group is complete when it has at least one member and every member is Landed; completeness gates Promotion.

### Group Promotion
The completion-gated, idempotent act of carrying a complete Branch Group forward: merging the group branch toward the project's integration branch and, in pull-request mode, creating-or-reusing the group's single managed PR. Re-running a Promotion never creates a second PR. Under disabled auto-merge, Promotion is an explicit user action; member-to-group landing may still proceed without triggering it.

## Engine Processes

### Self-Healing
The engine's family of recovery sweeps that detect and repair stuck or inconsistent task states (interrupted merges, already-merged work in review, misbound branches). Self-healing must honor the same merge-target rules as the normal path — a shared-group member is always evaluated against its group branch, never the project default — and attribution of already-merged work must be anchored to commit ownership markers, not free-text matches.
