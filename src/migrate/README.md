# npm run migrate

Manual Mongo + Qdrant schema sync. The app no longer rewrites collections on `npm run dev`. You run this CLI when stored documents have drifted from the types the Documents UI reads.

Numbered one-off backfills (IPA-001, OB-001, …) stay in [`documents/DATA_MIGRATIONS.md`](../../documents/DATA_MIGRATIONS.md). This file is the operator how-to.

---

## 1. The problem

Uploads create **two** stores that must stay joined:

| Store | What it holds |
| --- | --- |
| Mongo `active-course-list` → `additionalMaterials[]` | One **parent file** per upload (title, OS filename, list of chunk ids) |
| Qdrant collection | One **vector point per chunk** of that file |

Older uploads did not persist that join cleanly. Typical Compass leftovers:

- Nested `file` (`file.fileName`, `file.qdrantId`, `file.chunksGenerated`) — Multer/upload metadata that the Documents UI never reads. The UI uses top-level `fileName`.
- Singular `qdrantId` — **one** UUID, usually the **first** Qdrant point. A 21-chunk file still only stored one string. `chunksGenerated: 21` is a **count**, not 21 ids.
- Extra keys on course/user docs (`struggleTopicsPerChapter`, …) that are not on the current types.
- Extra Qdrant payload keys (`learningObjectives`) that do not belong on a chunk.
- Orphan Qdrant points: the file was deleted in Mongo (or never saved) but the vectors stayed.

Until you `--apply`, Compass does not change. `--check` (and bare `npm run migrate`) only prints what **would** change.

---

## 2. Target shape (Mongo = Documents UI)

After a successful apply, each additional material looks like the list record the UI loads:

| Field | Meaning |
| --- | --- |
| `id` | Parent file id (also Qdrant payload `id`) |
| `name` | Display title |
| `fileName` | OS filename (`APSC 183 Topic 1.md`) |
| `qdrantChunkIds` | **All** Qdrant **point UUIDs** for this file |
| `chunksGenerated` | `qdrantChunkIds.length` |

**Must not remain** on Mongo:

- nested `file`
- singular `qdrantId`
- `extractedText` (struggle-generation input only)
- browser `File` (FormData during upload only)

**Two different ids** (easy to mix up):

| Id | Where | Example |
| --- | --- | --- |
| Material / file id | Mongo `additionalMaterials.id`, Qdrant **payload** `id` | `3975d851a9ff` |
| Chunk / point id | Qdrant **point** id, Mongo `qdrantChunkIds[]` | `4ba7cd60-be60-4af5-9c8d-e51e6739e852` |

One file with 21 chunks → one Mongo material, 21 strings in `qdrantChunkIds`.

---

## 3. Pipeline (always A → B → C → D)

Letters match **run order**. Register chunk ids (C) before deleting orphans (D).

```text
A  Mongo allowlist walk
B  Strip extra keys on Qdrant payloads
C  Copy live point UUIDs onto Mongo qdrantChunkIds
D  Mongo wins titles; delete Qdrant points with no live parent file
```

| Step | Op name | Writes on `--apply` | Does not |
| --- | --- | --- | --- |
| **A** | `mongo-attribute-check` | Hoist `file` → `fileName`, seed `qdrantChunkIds` from leftover `qdrantId` (one id), strip unknown Mongo keys, IPA-001 + OB-001 + OB-002 | Create missing collections |
| **B** | `qdrant-attribute-check` | Overwrite payload to the allowlist (drops `learningObjectives`) | Delete points |
| **C** | `qdrant-resolve` | Set `qdrantChunkIds` to every point whose payload `id` matches a live material | Invent Mongo files for orphans |
| **D** | `qdrant-validate` | Patch payload titles from Mongo; **delete UNTRACKED points** | Recreate deleted vectors |

**Log labels**

- `CHECKED` — known collection/point, joined to a live material when relevant
- `MISSING` — collection not created yet (scenario_questions, pathways, …). Lazy on first use; migrate does not `createCollection`
- `UNTRACKED` (Mongo) — leftover collection such as `prompt-collection`; not dropped
- `UNTRACKED` (Qdrant) — point with no live `additionalMaterials.id`. Op D `--apply` **deletes** these

---

## 4. Check vs apply

The `--` after `migrate` is for npm: pass `--check` / `--apply` to our CLI, not to npm.

| Command | What happens |
| --- | --- |
| `npm run migrate` | Check. Prints what **would** change. Compass / Qdrant stay the same. |
| `npm run migrate -- --check` | Same as `npm run migrate`. |
| `npm run migrate -- --apply` | Writes to whatever `.env` points at. Use this when you intend to migrate. |

Do not pass `--check` and `--apply` together.

---

## 5. Env

Migrate uses the **same** Mongo/Qdrant vars as the app.

```bash
MONGO_DB_NAME=...
QDRANT_COLLECTION_NAME=...
```

Stop the app server before `--apply`. There is no menu.

---

## 6. How to use (in order)

### Example A — check first (always)

See what would change. Compass is untouched. These two commands are the same:

```bash
npm run migrate
npm run migrate -- --check
```

Read the leftover banner after `active-course-list`, then Qdrant `UNTRACKED` vs `material=… CHECKED`, then `would-be qdrantChunkIds`.

### Example B — apply (writes)

```bash
npm run migrate -- --check
# stop npm run dev
npm run migrate -- --apply
```

Then in Compass: `active-course-list` → course → `topicOrWeekInstances` → `items` → `additionalMaterials` → `qdrantChunkIds`.

### Example C — Test 3 file that showed one `qdrantId` instead of 21 chunks

**Before apply**

```text
active-course-list / Test 3 / additionalMaterials
  id: 3975d851a9ff
  fileName: APSC 183 Topic 1.md
  qdrantId: 4ba7cd60-be60-4af5-9c8d-e51e6739e852    ← one leftover string
  chunksGenerated: 21                               ← count only
  qdrantChunkIds: missing
```

**After Example B**

```text
  qdrantChunkIds: [ 21 Qdrant point UUIDs ]
  chunksGenerated: 21
  qdrantId: gone
  nested file: gone
```

The 21 ids are the vector-DB chunk ids. RAG delete uses that array.

### Example D — debug one step only

```bash
npm run migrate -- --op mongo-attribute-check --check
npm run migrate -- --op qdrant-resolve --apply
```

Prefer the full pipeline. Never run `--op qdrant-validate --apply` before a successful **C** (`qdrant-resolve`) on that data.

---

## 7. Rollback

Restore a Mongo backup taken before `--apply`. Qdrant deletes from **D** are not reversible without re-uploading the files.
