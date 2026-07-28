# Git Worktrees and Cursor Workflow

This guide explains how to work on multiple EngE-AI features in parallel using Git worktrees and Cursor, without stepping on uncommitted work in `main`.

**Audience:** developers using Cursor Agent on this repo  
**Last updated:** 2026-07-22

---

## 1. Overview

### What is a Git worktree?

Normally one Git clone equals one folder checked out to one branch. A **worktree** adds extra working directories that share the **same** Git history (`.git` object store) but can have **different files** on disk (different branch or commit).

```text
projects/tlef-engeai/                    ← main worktree (e.g. main)
  .git/                                  ← shared history

projects/tlef-engeai--my-feature/        ← linked worktree (e.g. feature/my-feature)
  src/...                                ← isolated edits

~/.cursor/worktrees/tlef-engeai/<id>/    ← Cursor agent sandbox (ephemeral)
```

| Property | Meaning |
|----------|---------|
| Shared history | Commits in one worktree are visible from all others |
| Isolated files | Edits in worktree A do not touch the main checkout |
| Parallel branches | No constant `git stash` / branch switching in one folder |
| Branch rule | The same branch cannot be checked out in two worktrees at once |

### Why Cursor uses worktrees

Agent runs edit files, run terminals, and may install dependencies. Worktrees keep that activity **out of your main desk** until you deliberately merge or apply changes.

---

## 2. Three places code can live

| Layer | Location | On GitHub? |
|-------|----------|------------|
| **Main desk** | `projects/tlef-engeai/` | Yes, after push |
| **Your manual worktrees** | `projects/tlef-engeai--<task>/` | Only after push + PR |
| **Cursor sandboxes** | `~/.cursor/worktrees/tlef-engeai/<id>/` | Only after push |

**Rule:** `main` does not change until **you** merge, apply worktree changes, or open a PR.

---

## 3. Folder layout (best practice for this repo)

### Recommended: sibling folders under `projects/`

Keep manual worktrees **next to** the main repo, not inside it:

```text
projects/
├── tlef-engeai/                         ← main desk (branch: main)
├── tlef-engeai--conversation-export/    ← your worktree
├── tlef-engeai--auth-fix/                 ← another worktree
├── tlef-engeai.code-workspace             ← multi-root (see §8)
├── docker-simple-saml/                    ← sibling dependency
└── FakeAcademicAPI/
```

**Naming convention**

| Item | Pattern | Example |
|------|---------|---------|
| Folder | `tlef-engeai--<short-task>` | `tlef-engeai--conversation-export` |
| Branch | `feature/<short-task>` | `feature/conversation-export` |

**Create a manual worktree**

```bash
cd /path/to/projects/tlef-engeai

git worktree add \
  ../tlef-engeai--conversation-export \
  -b feature/conversation-export
```

Open in a new Cursor window:

```bash
cursor ../tlef-engeai--conversation-export
```

### Optional: group many lanes

```text
projects/_worktrees/tlef-engeai/conversation-export/
```

```bash
git worktree add ../_worktrees/tlef-engeai/conversation-export -b feature/conversation-export
```

### What to avoid

| Don't | Why |
|-------|-----|
| `tlef-engeai/worktrees/foo/` | Inside the repo; easy to commit by mistake |
| Reuse `tlef-engeai-charisma/` as a worktree | That is a **full clone** (duplicate `.git`), not a lightweight worktree |
| Manual worktrees under `~/.cursor/worktrees/` | Reserved for Cursor-managed sandboxes |

### Sibling services (Docker / SAML)

A worktree contains **only** `tlef-engeai` files. For full-stack work:

- Use a second Cursor window with `tlef-engeai.code-workspace` for reference, **or**
- Rely on `.env` paths to sibling repos (`docker-simple-saml`, etc.)

---

## 4. Cursor commands and modes

### IDE Agent chat (single-root folder only)

Open **`projects/tlef-engeai`** as a **single folder** — not the multi-root `.code-workspace`.

| Command | Purpose |
|---------|---------|
| `/worktree` | Rest of this chat runs in an isolated checkout |
| `/best-of-n model1, model2, ...` | Same task on multiple models; one worktree each |
| `/apply-worktree` | Bring chosen changes into the main checkout |
| `/delete-worktree` | Remove the isolated checkout |

Example:

```text
/worktree fix struggle topics error messaging in chat prompts
```

### Cursor-managed sandboxes

When Cursor creates a worktree (via `/worktree` or agents), it lands under:

```text
~/.cursor/worktrees/tlef-engeai/<opaque-id>/
```

Names like `sal` or `bqe` are random IDs — not task descriptions.

### Cloud agents

Cloud agents use an isolated VM and branch in the cloud, not a local worktree folder. Conceptually the same workflow: isolate → review → merge via PR.

---

## 5. Agentic engineer workflow

You steer; the agent executes in a lane; you review before anything hits `main`.

```text
1. Task        You define scope (one sentence, one chat)
2. Isolate     /worktree or manual git worktree add
3. Plan        Agent proposes; you approve
4. Implement   Agent edits in the lane only
5. Test        Run checks in that worktree (if needed)
6. Review      git diff, read files — yes/no on merge
7. Integrate   PR (preferred) or /apply-worktree + commit
8. Sync        git pull on main after merge
9. Cleanup     git worktree remove … or /delete-worktree
```

### Merging back to main

**Path A — Pull request (preferred for EngE-AI)**

```bash
cd ../tlef-engeai--conversation-export   # or Cursor sandbox path

git add …
git commit -m "Describe the change"
git checkout -b feature/conversation-export   # if detached HEAD
git push -u origin feature/conversation-export
gh pr create
```

After the PR merges:

```bash
cd /path/to/projects/tlef-engeai
git pull
git worktree remove ../tlef-engeai--conversation-export
```

**Path B — Cursor apply (small/local changes)**

In the chat that used `/worktree`:

```text
/apply-worktree
```

Then in main:

```bash
git status
git diff
git add … && git commit -m "…"
git push
```

### Detached HEAD in Cursor sandboxes

Cursor sandboxes are often on **detached HEAD** (commit exists, no branch name). Before pushing:

```bash
git checkout -b feature/my-task
```

---

## 6. Switching between worktrees

You do not “switch worktrees” inside one folder. **Open another folder** (ideally another Cursor window).

| Action | How |
|--------|-----|
| List worktrees | `git worktree list` |
| Jump to a task | **File → New Window → Open Folder** → worktree path |
| Cycle windows | **Cmd+`** (macOS) |
| Shell | `cd ../tlef-engeai--my-task` |

**Pattern:** one Cursor window per active lane; `main` stays the integration desk.

---

## 7. Worktree setup: `.cursor/worktrees.json`

This file does **not** enable `/worktree`. It runs **once** when Cursor **creates** a new worktree.

Current project config:

```json
{
  "setup-worktree-unix": "npm ci && [ -f \"$ROOT_WORKTREE_PATH/.env\" ] && cp \"$ROOT_WORKTREE_PATH/.env\" .env"
}
```

| Step | What it does |
|------|----------------|
| `npm ci` | Clean install of `node_modules` **in that worktree only** (from `package-lock.json`) |
| `cp … .env` | Copy `.env` from main checkout if it exists (`$ROOT_WORKTREE_PATH` = main repo root) |

Keys: `setup-worktree-unix`, `setup-worktree-windows`, or generic `setup-worktree`.

**When you need `npm ci` in a worktree**

| Goal | Need `npm ci`? |
|------|----------------|
| Review agent diff only | No |
| Run `npm run dev` / tests in that lane | Yes |

Each worktree gets its **own** `node_modules` (~40 MB for this repo). Main’s `node_modules` is untouched.

---

## 8. Why `/worktree` may be unavailable

Common blockers for this project:

| Requirement | This repo |
|-------------|-----------|
| Valid Git repo | Yes |
| Remote configured | Yes (`origin` → GitHub) |
| **Single-root workspace** | **No** if `tlef-engeai.code-workspace` is open (4 folders) |
| Agent mode (not Ask) | Required |

**Fix:** **File → Open Folder** → `projects/tlef-engeai` only.

The multi-root workspace includes `tlef-engeai`, `docker-simple-saml`, `EngE-AI-RAG-Document-examples`, and `FakeAcademicAPI`. Cursor does not support `/worktree` in multi-root workspaces.

**Workaround while keeping multi-root:** use manual worktrees from the terminal (§3).

---

## 9. Disk and cost

Worktrees are **not** full copies of the repo.

| Part | Shared? | Typical size (EngE-AI) |
|------|---------|-------------------------|
| Git history (`.git/objects`) | Yes, once | ~3–8 MB |
| Source files per worktree | No | ~2–5 MB |
| `node_modules` per worktree | No | ~40 MB if you run `npm ci` |

Six Cursor sandboxes with **no** `node_modules` ≈ 14 MB total — not six times the full repo.

Cost adds up when many lanes each run `npm ci` and dev servers in parallel (RAM/ports, not just disk).

---

## 10. Knowing what an agent did

Cursor does **not** write a task label file into sandboxes (no `TASK.md` by default). Names like `sal` are opaque.

### Evidence layers

| Layer | Command / location | Tells you |
|-------|-------------------|-----------|
| Git commit | `git log -1` | Committed changes + message |
| Uncommitted work | `git status`, `git diff` | WIP not yet committed |
| vs main | `git log main..HEAD` | Commits not on main |
| Folder created | `stat -f '%SB' …` on sandbox path | When sandbox was born |
| Original prompt | Cursor chat history / agent transcripts | **Why** (not always linked to sandbox name) |

### Audit all worktrees

```bash
cd /path/to/projects/tlef-engeai

for d in $(git worktree list --porcelain | awk '/^worktree / {print $2}'); do
  name=$(basename "$d")
  echo "=== $name ==="
  stat -f 'created: %SB' -t '%Y-%m-%d %H:%M' "$d" 2>/dev/null
  git -C "$d" log -1 --oneline 2>/dev/null
  git -C "$d" status -sb 2>/dev/null
  echo
done
```

### Git states (informal)

```text
Clean at commit X   →  git status clean
Dirty (WIP)         →  modified files in git status
Ahead of main       →  git log main..HEAD non-empty
```

There is no Cursor enum like `ready_to_merge` — you decide after review.

---

## 11. Cleanup

### Remove a manual worktree

```bash
cd /path/to/projects/tlef-engeai
git worktree remove ../tlef-engeai--conversation-export
git branch -d feature/conversation-export   # after merge
```

### Remove a Cursor sandbox

In the creating chat:

```text
/delete-worktree
```

Or from main repo:

```bash
git worktree remove ~/.cursor/worktrees/tlef-engeai/<id>
```

Cursor auto-manages sandbox count (default limit ~25). Delete stale sandboxes to avoid confusion.

---

## 12. Quick reference

```bash
# List
git worktree list

# Create (manual, named)
git worktree add ../tlef-engeai--my-task -b feature/my-task

# Inspect lane
cd ../tlef-engeai--my-task
git status && git diff && git log -1

# Push + PR
git push -u origin feature/my-task && gh pr create

# Remove
git worktree remove ../tlef-engeai--my-task
```

| I want to… | Do this |
|------------|---------|
| Parallel features I control | Manual sibling worktrees (`tlef-engeai--…`) |
| Agent experiment | `/worktree` with single-folder open |
| Compare models | `/best-of-n` |
| Merge to main | PR (preferred) or `/apply-worktree` |
| Full stack + SAML | Separate window for `.code-workspace` or manual worktree + `.env` |

---

## Related

- [How to Contribute](../README.md#how-to-contribute) — branch + PR flow
- `.cursor/worktrees.json` — post-create setup hook
- [Cursor worktrees docs](https://cursor.com/docs/configuration/worktrees)
