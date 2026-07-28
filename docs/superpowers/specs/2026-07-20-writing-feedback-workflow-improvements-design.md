# Writing Feedback workflow improvements — design

Date: 2026-07-20
Status: Approved by user, proceeding to implementation.

## Context

Following the 2026-07-19 native-restyle pass, the user identified eight gaps in the
Writing Feedback staff workspace (`public/scripts/feature/writing-feedback*.ts`,
`src/routes/route-writing-feedback.ts`, `src/writing-feedback/*`). This spec covers
all eight as one implementation pass since they are all localized to this one
feature area, not independent subsystems.

## Product decisions (user-approved)

1. **Assignment delete** is blocked while the assignment has any submissions
   (`submissionCount > 0`). Staff must delete submissions first. No cascade.
2. **Submission delete** is allowed at any status, including `released`. The
   confirmation modal shows an extra warning line when the submission is released,
   noting the release cannot be recalled.
3. **Delete permission**: any course staff (instructor + TA) — same gate as the
   rest of the Writing Feedback API (`requireInstructorForCourseAPI`, which despite
   its name checks `isCourseStaff`, i.e. instructor or TA). No new middleware.

## 1. Delete assignment

- Backend: `DELETE /:courseId/writing-feedback/assignments/:assignmentId`
  - Reuses the router-level `requireInstructorForCourseAPI` + `requireCourseFeatureAPI`
    gate already applied to the whole `/writing-feedback` router — no extra
    middleware needed.
  - 404 if assignment not found.
  - 409 `'Delete submissions before deleting this assignment'` if
    `countWritingSubmissionsByAssignment` (or an equivalent per-assignment count)
    is non-zero.
  - Add `deleteWritingAssignment(ctx, courseId, assignmentId)` to
    `src/db/mongo/writing-feedback-mongo.ts`; wire through `EngEAI_MongoDB`.
- Frontend (`writing-feedback.ts`):
  - Trash icon button in `renderAssignmentCard`'s `.wf-assignment-controls`, next
    to "Edit rubric". `stopPropagation` like the rubric button (card header is
    also a click target for expand/collapse).
  - On click: `showDeleteConfirmationModal('assignment', assignment.title)`; on
    confirm, `DELETE` the assignment, remove the card from `state.assignments`,
    re-render landing, toast success.
  - If the API returns 409 (submissions still exist), show that message via the
    existing error toast path instead of removing the card.

## 2. Delete submission

- Backend: `DELETE /:courseId/writing-feedback/submissions/:submissionId`
  - Same router-level gate.
  - 404 if submission not found.
  - No status restriction (per product decision #2).
  - Add `deleteWritingSubmission(ctx, courseId, submissionId)` to the mongo
    delegate: deletes the submission doc, and cascades cleanup of
    `writing-feedback-runs`, `writing-releases`, and queued `writing-jobs` rows
    whose `payload.submissionId` matches (reviews live embedded in the submission
    doc, so they're removed for free).
- Frontend (`writing-feedback.ts`):
  - Trash icon/button in each `.wf-submission-row`, next to "Open submission".
  - `showDeleteConfirmationModal('submission', submission.studentLabel || 'this submission')`;
    when `submission.status === 'released'`, append the extra warning line to the
    modal content before showing it.
  - On confirm: `DELETE`, remove the row, decrement the assignment's
    `submissionCount` in local state so the landing chip stays correct without a
    full reload.

## 3. Intake textarea size

- Root cause: the manual-intake essay textarea (`writing-feedback.ts:326`,
  `textAreaControl('', 10)`) inherits the generic `.wf-field textarea` rule
  (`min-height: 96px`), sized for short fields like rubric descriptions, not an
  essay.
- Fix: add a dedicated class (e.g. `wf-intake-text`) applied only to this
  textarea, with `min-height: 45vh` (keeps `resize: vertical` from the base
  rule). No behavior change, CSS-only plus one `classList.add` call.

## 4. Zoom control

- Scope: the manual-intake textarea (#3) and the review-page reading pane
  (`.wf-doc-paper`, covering both the verification textarea and the rendered
  annotated `.wf-doc-text`/`.wf-doc-original` content).
- Mechanism: a `--wf-zoom` CSS custom property (default `1`) set on the nearest
  ancestor (`.wf-doc-paper` / the intake form field wrapper). Font sizes in scope
  switch from fixed `px` to `calc(<base> * var(--wf-zoom))`.
- UI: a small "Aa −  100%  +" stepper control. Steps: 85%, 100%, 115%, 130%, 150%.
  Persisted per-browser in `localStorage` under `wf-zoom-level` (single shared
  value across both surfaces, simplest mental model).
- Explicitly out of scope now: paginating uploaded PDF/DOCX content into
  page-like chunks. The extraction pipeline (`document-extraction-service.ts`)
  already flattens everything to plain text before it reaches the submission
  record, so "pages" would require a new representation — noted as a future
  idea, not built here.

## 5. Resizable annotation panel

- `.wf-review-layout` changes from `grid-template-columns: minmax(0,1fr) 420px`
  to `minmax(0,1fr) var(--wf-panel-width, 420px)`.
- A thin vertical drag handle (`.wf-panel-resize-handle`) sits between
  `.wf-doc-pane` and `.wf-feedback-panel`.
  - Pointer drag updates `--wf-panel-width` on `.wf-review-layout`, clamped to
    `[340px, 65% of the layout's rendered width]`.
  - `role="separator"` with `aria-orientation="vertical"`, `tabindex="0"`; Left/Right
    arrow keys resize by 10px steps for keyboard/a11y parity with the rest of the
    dashboard.
  - Double-click resets to the 420px default.
  - Last width persisted in `localStorage` under `wf-panel-width` and applied on
    load.

## 6. Sidebar-collapse dead space

- Root cause: `.wf-main-content { max-width: 1400px; margin: 0 auto; }` centers
  the whole workspace. When the left feature sidebar collapses (`~200px → 56px`),
  the freed width doesn't go to the panels — it becomes larger idle side margins,
  which reads as a layout bug even though the same centering pattern exists on
  Documents/Monitor at smaller caps.
- Fix: loosen the cap with `clamp(0px, 100%, 1600px)`-style sizing (exact value
  tuned in-browser) so wide viewports get more usable width once the sidebar is
  collapsed, instead of a hard, sidebar-agnostic ceiling.
- Also checking live (MongoDB-dependent, starting local Mongo for this pass) for
  any stray vertical gap between `.wf-header` and the first panel below it that
  isn't accounted for by the existing `margin-bottom: 20px` — fixing inline if
  found; no separate design needed, it's a CSS bug not a product decision.

## 7. "Highlight to comment" hint

- The select-text-to-add-comment flow already exists
  (`writing-feedback-anchors.ts`) but has no visible affordance. Add one static
  `wf-muted-note` line under the Annotations tab header (or doc-pane heading)
  in annotate mode: "Select any text in the document to add a comment."

## 8. Review history — full audit trail

- Data already exists: `StaffReviewRevision` snapshots the *entire* comment set
  on every staff save (`comments?: AnchoredComment[]`), plus `studentFeedback`
  and `internalNote` at that point in time. `GET /submissions/:id` already
  returns the full `reviews[]` array with these snapshots. The only gap is
  display — `renderReviewSection` (review.ts:649-660) renders one bare
  `Revision N · date` line per entry.
- Backend: add `staffUserId` to the `ReviewRevision` shape sent to the frontend
  (contracts already have it; it's just not currently threaded into the
  API response / `writing-feedback-shared.ts` `ReviewRevision` type) so history
  can attribute who made each change.
- Frontend: rebuild the history block as one `<details>` per revision, newest
  first:
  - Summary line: `Revision N · <date> · <staffUserId>`.
  - Body: the full `studentFeedback` and `internalNote` text as they were saved
    (read-only, pre-wrapped).
  - A comment diff against the previous revision (or, for the first revision,
    every comment shown as Added): compare by `AnchoredComment.id`.
    - Present only in current → **Added**.
    - Present only in previous → **Removed**.
    - Present in both but any of `comment`, `howToImprove`,
      `courseMaterialLink`, `glossaryDefinition`, `quote`, `functionTag`,
      `levelTag`, `priority` differs → **Edited**, showing the changed
      field(s).
    - Each line shows the quote snippet, comment text, tags, and
      `origin` (model_seed/staff) badge.
  - Purely a read/consult view — no restore/revert action, matching "not to go
    back".

## Testing plan

- `src/writing-feedback/__tests__/`: extend/add coverage for
  `deleteWritingAssignment` (blocked when submissions exist, succeeds when
  empty) and `deleteWritingSubmission` (cascades runs/releases/jobs) at the
  service/mongo-delegate level, plus the two new routes' success/error paths.
- A small pure-function unit test for the comment-diff logic used by the
  history panel (added/edited/removed classification), since it's the one
  piece of new non-trivial logic in this pass.
- Full `npx jest src/writing-feedback` + backend/frontend `tsc --noEmit` before
  calling this done, matching prior sessions' verification bar.
- Browser/visual pass for items 3-7 (sizing, zoom, resize handle, layout,
  hint) — best effort if local MongoDB is reachable; otherwise source-reviewed
  only, called out explicitly rather than claimed as verified.

## Docs to update

- `documents/ENDPOINT_ARCHITECTURE.md`: two new DELETE routes.
- `documents/MONGO_DATA_LAYER.md`: two new delegate functions and their
  cascade behavior.
- `documents/WRITING_FEEDBACK_STYLE_GUIDE.md`: zoom control, resizable panel,
  intake textarea sizing.
- Project memory (`Current State.md` + a dated session log entry) once
  implementation and verification are complete.
