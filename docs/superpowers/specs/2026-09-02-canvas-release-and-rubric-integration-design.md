# Canvas release and rubric integration — design

Date: 2026-09-02
Status: approved, not implemented
Branch: `worktree-rubric-page-redesign` after merging `feature/writing-feedback-canvas-release`

## Purpose

Bring the two in-flight Writing Feedback lines together and carry one workflow end to end: an
instructor imports a Canvas assignment, customises and approves its rubric, reviews a submission,
annotates it, enters a final per-criterion grade, saves once, approves, and releases the feedback
PDF and the grade to Canvas — with the grade filled into the Canvas rubric criterion by criterion,
so a student can see where the number came from.

Both lines exist and neither has been reviewed or merged. The rubric page redesign is 22 commits on
`worktree-rubric-page-redesign` (1.13.0, never pushed). The Canvas release work is 26 modified and 4
untracked files on `feature/writing-feedback-canvas-release` with **zero commits**.

## Non-negotiables carried in

Every Writing Feedback invariant in `AGENTS.md` continues to hold, and three bear directly on this
work:

- Model output is a draft. Nothing reaches Canvas without staff approval.
- Student submissions never enter the course-material RAG/Qdrant pipeline.
- Submission text, generated feedback, prompt bodies containing student text, Canvas tokens and
  PUIDs are never logged.

One external constraint comes from the course team (Kathleen):

- The **Complete PDF** — summary feedback plus the annotated student text — is the artifact that
  goes to Canvas.

Kathleen's notes also recorded, from Alireza, that feedback need only be pushed to Canvas once per
submission. That has been superseded by an explicit product decision: see DR-7. Staff may re-release
revised feedback up to five times.

Canvas's posting policy (grades and comments visible immediately, versus held for manual posting) is
a Canvas course setting. EngE-AI reads it and discloses it. EngE-AI never sets it.

## Decisions

**DR-1 — Both branches merge into one.** The Canvas work is committed on its own branch first, then
merged into `worktree-rubric-page-redesign`, and all new work happens there. One branch, one pull
request, one browser pass. A `git merge-tree` dry run against a `git stash create` commit shows the
only textual conflict is `documents/ENDPOINT_ARCHITECTURE.md`, where both branches appended to the
same section.

**DR-2 — Rubric provenance is per lens.** A lab report's imported Canvas rubric seeds the
**technical** lens; its writing lens always keeps the built-in Organization / Content /
Interpersonal Positioning grid. Any other assignment's Canvas rubric seeds the writing lens, as
today. An assignment with no Canvas rubric falls back to the built-in profile for that lens.

*Rationale.* For a lab report the instructor's Canvas rubric is the technical marking scheme; the
metafunctions are ours and are not something a lab handout describes. Today
`writing-feedback-mongo.ts:335` hard-codes `lens: 'linguistic'`, so an imported lab report loses the
metafunctions **and** loses autofill — `gridSourceFor` returns `'canvas'`, whose merge rules are
`mayAddRows: false, mayWriteRow: false, mayWriteCells: false`. That is the opposite of what a lab
report needs.

**DR-3 — Canvas rubric ids are preserved as a side-map.** `canvas-rubric-mapping.ts:slugify` derives
our criterion ids from the criterion's visible name, because Canvas ids such as `_1234` fail our
schema's `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`. The Canvas ids are currently discarded. They are now
returned alongside the mapped shape and stored on the assignment, keyed by our id.

*Rationale.* Writing into a Canvas rubric requires addressing Canvas's own criterion ids. Adopting
them as our ids instead would break the schema and force a migration across every stored feedback
run, evidence record, staff assessment and PDF, all of which reference our criterion id. The map is
additive: one optional field, no migration, ids stay readable.

**DR-4 — Lab reports are graded on the technical rubric only.** Writing feedback is still generated,
annotated and printed for a lab report; it carries no grade. Only the technical assessment is
released to Canvas.

**DR-5 — Annotations carry a lens.** `AnchoredComment` gains an explicit `lens` field, the Technical
tab becomes editable, and for a lab report the technical annotations and comments are presented
first — in the review UI and in the PDF.

*Rationale.* `contracts.ts:461` already states this is required: *"Carries no lens marker today —
only linguistic comments and model seeds exist, and the Technical tab is read-only. Technical
annotations will need an explicit lens field before anchored comments can distinguish linguistic vs.
technical criteria."*

**DR-6 — Release runs as a queued job.** Pressing Release enqueues a `release` job — a type already
present in `WritingJob['type']` and never implemented — and returns immediately. The worker rebuilds
the queuing staff member's Canvas client from the Mongo token store and performs the Canvas writes.
The review page polls status exactly as it polls generation.

**DR-7 — A submission may be released up to five times, and says so.** Feedback can be revised and
re-released; the cap is five successful releases per submission, after which release is refused.
Every release after the first is a revision, and the submission displays that in EngE-AI: which
revision it is on, and that it has been revised since its first release. A release that failed
part-way remains resumable by any staff member, because the PDF may already be attached in Canvas
and abandoning it strands a student. Uncertain outcomes continue to enter
`reconciliation_required` and are never retried automatically.

*Rationale.* This supersedes the earlier one-push-per-submission rule taken from Kathleen's notes
("I asked Alireza about this, and he said we only need to push feedback to canvas one time per
submission"). Staff correct mistakes, and a rule that makes the first release final turns a typo
into an unfixable one. Five is a limit rather than a workflow: it stops an accidental loop and keeps
a student from receiving an unbounded stream of comment notifications, since Canvas notifies on
every submission comment. The count is derived from release records, so nothing new is stored.

**DR-8 — The PDF prints the full rubric grid.** Criteria as rows, levels as columns, descriptors in
their cells, the earned cell marked, points per criterion and a total.

**DR-9 — Manually uploaded submissions are refused, not matched.** A submission with no
`canvasUserId` cannot be released; the UI says why. Staff-driven matching is separate work.

## Architecture

### Data model

All additions are optional fields. No migration runs, and no existing document becomes invalid.

`WritingAssignment` (`src/writing-feedback/contracts.ts`, mirrored in
`public/scripts/feature/writing-feedback-shared.ts`):

```ts
/** The Canvas rubric exactly as imported, held independently of which lens uses it. */
canvasRubricImport?: {
    shape: ImportedRubricShape;            // criteria + levels already mapped to our contract
    ids: Record<string, {                  // keyed by OUR criterion id
        criterionId: string;               // Canvas criterion id, e.g. "_1234"
        ratingIds: Record<string, string>; // our level id -> Canvas rating id
    }>;
    importedAt: Date;
};

/** Where the technical grid came from. `rubricSource` continues to describe the writing lens. */
technicalRubricSource?: 'canvas' | 'builtin';
```

`rubricSource` is currently assignment-wide and consulted only for the writing lens. It stays that
way and is documented as writing-lens-only, with `technicalRubricSource` beside it. Making it
per-lens matters: without the split, a Canvas-seeded technical rubric makes `gridSourceFor` report
`'canvas'` for the writing lens too, which disables the metafunctions autofill DR-2 depends on.

`AnchoredComment`:

```ts
lens: 'linguistic' | 'technical';  // absent on stored comments; read as 'linguistic'
```

`StaffFinalAssessment` gains `lens: WritingFeedbackLens`, recording which rubric was graded.

`WritingRelease` gains:

```ts
queuedByUserId?: string;   // the staff member whose Canvas credential the worker acts with
rubricAssessmentWritten?: boolean;  // whether per-criterion points reached the Canvas rubric
revision?: number;         // 1-5; which release of this submission this record is
```

The revision number is assigned when a release is previewed, from the count of releases already
`released` or `reconciled` for that submission. The submission detail response carries
`releaseCount` and `maxReleases` so the review page can show "Released · revision 2 of 5" without
the browser counting records itself.

`WritingJob.payload` stays `{ submissionId: string }`. The release job carries no Canvas data; the
handler reloads everything inside the Writing Feedback boundary, as the generation handler does.

### Rubric provenance and the lab-report ordering problem

`isLabReport` is set by `PATCH /assignments/:assignmentId/lab-report`
(`route-writing-feedback.ts:619`) **after** the assignment exists. At Canvas import time nothing
knows whether the assignment is a lab report, so the import cannot route the rubric by kind.

The import therefore stores the mapped Canvas grid and its ids in `canvasRubricImport`
unconditionally, and seeds the writing lens from it exactly as it does today. Nothing about a plain
assignment changes.

The lab-report toggle already seeds a technical draft from `buildLabReportRubric` when the flag is
turned on. That is the routing hook. When the flag becomes true:

1. If `canvasRubricImport` exists, the technical draft seeds from its shape and
   `technicalRubricSource` becomes `'canvas'`. Otherwise it seeds from `buildLabReportRubric` and
   the source is `'builtin'` — today's behaviour.
2. The writing lens resets to `buildDefaultWritingRubric` and `rubricSource` becomes undefined, so
   the metafunctions and their autofill return.

Step 2 discards an unapproved writing draft, so it is guarded by the checks the toggle already
enforces in the other direction: refuse when the writing rubric is approved, or when writing
feedback runs already exist. A refusal explains that the assignment must be marked as a lab report
before its rubrics are approved.

`gridSourceFor` (`rubric-autofill.ts:47`) currently returns `'apsc182'` for the technical lens
unconditionally. It becomes:

| Lens | Condition | Grid source | Autofill may |
|---|---|---|---|
| technical | `technicalRubricSource === 'canvas'` | `canvas` | nothing |
| technical | otherwise | `apsc182` | write cells |
| writing | `rubricSource === 'canvas'` | `canvas` | nothing |
| writing | lab report, or no Canvas rubric | `metafunctions_lab` | write rows and cells |
| writing | plain assignment with a Canvas rubric | `canvas` | nothing |

`metafunctions_plain` is removed as a reachable source, and `metafunctions_lab` is renamed
`metafunctions` — it now covers a manually created writing assignment too, so a name saying "lab"
would be wrong. A manual assignment and a lab report's writing lens share one rule: the three
metafunctions are fixed and autofill writes only what they mean for this assignment. The docstring in `rubric-seed.ts` claiming that nothing
branches on lab reports, and the one in `rubric-autofill.ts` claiming the technical grid is never
Canvas-seeded, are both rewritten rather than left contradicting the code.

### Annotations across two lenses

`renderAnnotations` takes a lens and renders one working set per lens over the same verified text.
`getWorkingComments()` returns both sets, each tagged. The Technical tab hosts the same annotation
surface the writing tab has, rather than the read-only draft view it renders today.

Ordering: for a lab report the technical pane is first in the tab order and its comments lead in the
PDF. For a plain assignment nothing changes — there is no technical lens.

Saving stays one action. `Save staff revision` already posts summary fields, annotation working set,
and `finalAssessment` in a single POST (`writing-feedback-review.ts:763`); it now carries both
lenses' comments in that same request. There is no separate annotation save, and none is added.

### Grading

`buildStaffFinalAssessment` takes a lens and validates against that lens's approved rubric.
`rubricSupportsStaffAssessment` decides which lens is gradeable: for a lab report that is the
technical rubric, for anything else the writing rubric. The review page shows the grade column on
the gradeable lens only.

Server-side computation of totals is unchanged and remains the only authority — neither the browser
nor Canvas redefines the grading contract.

### PDF

`renderFinalAssessment` (`writing-feedback-report.ts:205`) is replaced by a grid renderer:

- Criteria as rows, the rubric's levels as columns, each cell holding its descriptor.
- The earned cell is marked; the criterion's awarded and possible points sit beside the row.
- A total row.

Layout risk is real: eight levels of 400-character descriptors do not fit a portrait page. The
renderer measures column widths from the level count, wraps within cells, and breaks pages at row
boundaries so a criterion is never split across pages. At five or more levels the grid section is
rendered on a landscape page; at four or fewer it stays portrait with the rest of the document.

Lab report document order: technical feedback and its grid first, then the writing feedback and the
annotated text. **One document, not two.** The Canvas branch rendered a lab report as a separate
writing PDF and technical PDF and attached both; a lab report now produces a single combined PDF,
because a student should open one file. A plain assignment is unaffected, and the staff-only
`?lens=technical` download stays available. Model suggestions, confidence, internal flags and
staff notes stay out of the PDF, unchanged.

The release artifact filename becomes `writing-feedback-complete.pdf`, matching what it has always
contained — `previewRelease` already renders with `include: 'both'`.

### PDF viewing

`GET .../feedback.pdf` sets `Content-Disposition: inline` and the review page opens it in an in-page
viewer, with download as a secondary action. The route's failure path currently returns
`res.status(400).json(...)`, so a failed render navigates the staff member to a JSON blob; the
viewer renders a real error state instead.

### Release

**Off-request Canvas client.** `canvas-config.ts` stores Canvas OAuth tokens through
`createMongoTokenStore`, keyed by `GlobalUser.userId` — never the PUID. A new
`resolveCanvasClientForUser(userKey)` reproduces what `canvas.requireAuth` does inline: read the
stored tokens, refresh them when they are within the expiry buffer, persist the refreshed pair, and
build an `ApiClient` with an `onUnauthorized` refresh hook. Roughly forty lines, no new dependency.
If the user has no stored tokens or the refresh fails, the job fails with a message asking that
person to reconnect Canvas.

**Queue.** `startWritingFeedbackWorker` registers a `release` handler beside `generate`. Pressing
Release enqueues a job and returns; the review page polls. The queue's generic retry must not
override DR-7 — a job whose release record sits in `reconciliation_required` completes without
retrying.

**Write order, one submission.** The existing preview/prepare step is unchanged: it preflights the
feedback and grade writes without writing, and holds the rendered bytes server-side.

1. Re-read the live Canvas submission and verify it is the exact attempt that was previewed.
2. Upload the Complete PDF, plus the technical PDF when a technical run exists, and attach both in
   one submission comment.
3. Re-read the assignment's live Canvas rubric and check that every graded criterion still resolves
   through `canvasRubricImport.ids`. Then `PUT .../submissions/:user_id` with
   `rubric_assessment[<canvasCriterionId>][points]` and `[rating_id]` per criterion.
4. Post the total grade **only when the Canvas rubric is not set to use-for-grading**. When it is,
   step 3 has already set the grade and posting again would contradict it.

**Refusals, before anything is written.** Any graded criterion missing from the side-map aborts the
release — a partial rubric is worse than none. A criterion id that no longer exists in the live
Canvas rubric aborts, which is how an instructor editing the rubric inside Canvas after import is
caught rather than silently mis-scored. A mismatch between the Canvas assignment's `points_possible`
and the rubric total already aborts at preflight; the message names which value to change and where.

**Lock.** The submission-level lock is enforced in the service, not only by payload fingerprint. The
existing `payloadFingerprint` deduplication stays for retry reconciliation; DR-7 adds a check that no
`released` record exists for the submission.

**Existing defects fixed on the way through.** `feedbackBatch` is built from the first artifact
only while `attachFeedback` uploads every artifact. With a lab report now producing one combined
PDF the two agree in practice, but the preflight is still built from every artifact so they cannot
drift apart again.

## Error handling

| Situation | Behaviour |
|---|---|
| Submission has no `canvasUserId` | Release refused, UI explains the submission was not imported from Canvas (DR-9) |
| Graded criterion missing from the side-map | Release aborts before any Canvas write |
| Live Canvas rubric no longer matches the map | Release aborts before any Canvas write |
| Canvas `points_possible` ≠ rubric total | Preflight aborts, message names both values |
| Newer Canvas attempt than the previewed one | Release aborts, staff regenerate for the current attempt |
| PDF upload fails | `failed` / `failureStage: 'feedback'`, uploaded file ids retained, resumable |
| Comment write returns an uncertain outcome | `reconciliation_required`, never retried automatically |
| Rubric assessment write fails definitely | `failed` / `failureStage: 'grade'`, resumable; PDFs already attached |
| Grade progress does not confirm | `reconciliation_required` |
| Staff member's Canvas token revoked between queue and run | Job fails, message asks that person to reconnect Canvas |
| Submission already `released` | Release refused (DR-7) |

Sanitized errors only. No provider error text, submission content, or token value is persisted or
logged.

## Documentation

`documents/ENDPOINT_ARCHITECTURE.md` records the release queue's status endpoint and the changed
`feedback.pdf` disposition. `documents/MONGO_DATA_LAYER.md` records `canvasRubricImport`,
`technicalRubricSource`, the `AnchoredComment.lens` field, and the two new `WritingRelease` fields.
`documents/WRITING_FEEDBACK_ARCHITECTURE.md` records the per-lens rubric provenance rule and the
release write order. Required by `AGENTS.md` whenever contracts change.

## Testing

Unit and contract tests are written before each piece, following the repository's TDD rule. Specific
coverage the design requires:

- Side-map round trip: a Canvas rubric maps to our shape, its ids survive, and a rubric whose
  criteria our schema slugifies to colliding ids is detected rather than silently merged.
- `gridSourceFor` across the full table above, including the lab-report re-route.
- The lab-report toggle re-routing a stored Canvas grid to the technical lens and restoring the
  metafunctions on the writing lens, plus its refusals when a rubric is approved or runs exist.
- Annotation lens tagging, including stored comments with no lens reading as `linguistic`.
- One save carrying both lenses' comments, summary fields and the final assessment in a single POST.
- Grade write order: rubric assessment then total, and the total suppressed when the Canvas rubric is
  use-for-grading.
- Every refusal in the error table, each asserted to write nothing to Canvas.
- The release lock: a released submission refuses a second push; a failed one resumes.
- PDF grid rendering at 2 and 8 levels, and page breaking at row boundaries.

### Browser acceptance pass

Mandatory, and blocked until Docker Desktop is running with WSL integration enabled — `docker` is
currently unreachable from this distro, so there is no Mongo and no local Canvas. Playwright works
here with the recipe in the 2026-09-01 session log; do not run `npx playwright install`.

One instructor, one lab report, driven end to end:

1. Import a Canvas lab-report assignment carrying a rubric.
2. Mark it a lab report; confirm the technical lens took the Canvas grid and the writing lens holds
   the metafunctions.
3. Autofill and approve both rubrics.
4. Open a long synthetic lab report — long enough to page the PDF and to exercise anchor offsets
   across a document staff would actually receive.
5. Generate; annotate on both lenses; confirm technical is presented first.
6. Enter per-criterion technical grades, or accept the suggested ones.
7. Save once. Confirm both lenses' annotations and the summary persisted together.
8. Approve.
9. Open the Complete PDF in the browser. Check the grid, the marked cells, the totals, and
   technical-first ordering.
10. Preview, then release.
11. In Canvas: both PDFs on the right student's submission attempt, the rubric showing per-criterion
    points with the right cells highlighted, and a total that matches.
12. Attempt a second push; confirm it is refused.

Then the same for a plain writing assignment: Canvas rubric on the writing lens, graded on the
writing lens, one PDF.

Synthetic student data only, as every prior Canvas pass has used. No real submission, PUID, token
value, or generated feedback is recorded anywhere.

## Out of scope

- Matching manually uploaded submissions to Canvas students (DR-9).
- Bulk release of a whole assignment's submissions. Jobs are per submission; a bulk enqueue is a
  small addition later but changes the review page.
- Wiring `requireCompleteRubricCells`. It remains exported with zero callers, and whether approval
  should gate on a complete grid is the open product question behind D-085.
- The onboarding Writing Feedback tutorial copy pass, already owed twice over and made worse by this
  work's renames.
- Canvas rubric creation from an EngE-AI-authored rubric.

## Limitations to accept

**Preview state is server-local.** `preparedReleases` is an in-memory `Map` with a 30-minute TTL. A
restart voids every preview, and the mechanism does not work across more than one server process.
Acceptable for a single-process pilot; it is not a production-scale design and should be recorded as
such.

**A queued release acts as an absent person.** The worker uses the queuing staff member's stored
Canvas credential minutes or hours after they left the page. If they revoke access or lose the
course in between, the job fails and asks them to reconnect. Correct, but it is a failure staff have
not met before.

**The five-release cap is our record, not Canvas's.** Canvas has no idempotency key for submission
comments, so the cap is enforced by counting our own release records. A database restore to a point
before a release would reset the count. Each release also adds a new submission comment in Canvas
rather than replacing the previous one, so a student on revision three sees three comments, each
with its own PDF — the newest is the current feedback, and nothing in Canvas marks the older ones
superseded.

**The side-map is fixed at import.** Like `canvasRubricRefusal` (D-088), it is written at creation
and never re-stamped, because re-stamping onto a grid staff have since edited would be wrong. An
instructor who rebuilds the rubric in Canvas after import gets a refused release, not a silent
remap — which is the safe outcome, but it needs a documented way forward.

**Rubric bands versus Canvas ratings.** `spaceBandsEvenly` now produces contiguous ranges (D-087)
while a Canvas rating is a single value. Writing `rating_id` requires choosing the rating whose band
contains the awarded points; where a Canvas rubric's own ratings do not partition the range cleanly,
the points are written without a `rating_id` rather than guessing a cell.

## Open questions

- Should a bulk "release this assignment" enqueue exist, and if so does the review page grow a
  submission list with per-row status?
- What is the operational procedure when a release lands in `reconciliation_required`? The app
  refuses automatic retry, but the human workflow still has no owner or checklist. Carried from
  2026-09-01.
- Does anything display `postManually` to staff before they release? A held Canvas course means the
  student sees nothing until the instructor posts, which staff should know at release time.
- Who reviews the merged branch, and does it open as one pull request against `main`?
