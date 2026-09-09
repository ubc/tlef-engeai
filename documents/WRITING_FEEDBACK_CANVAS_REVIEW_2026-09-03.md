# Writing Feedback Canvas Implementation Review

Date: 2026-09-03

Scope reviewed:

- Active worktree: `/home/crodas/EngE-AI/tlef-engeai/.claude/worktrees/rubric-page-redesign`
- Branch: `worktree-rubric-page-redesign`
- Head observed: `79952ba`
- Review focus: Canvas import, release preview, queued release, rubric write-back, job/release persistence, and Writing Feedback file organization.

I did not change production source in this review.

## Summary

The Canvas implementation has several strong foundations: course staff authorization is applied at the Writing Feedback route prefix, Canvas import stays read-only, live release is preview-first, release uses the staff member's stored OAuth credential, and the worker avoids automatic retry for external write jobs.

The risks that remain are mostly production lifecycle risks rather than simple missing-code defects. The release path relies on process-local preview state and unconditional Mongo updates around external Canvas side effects. Under concurrent clicks, multiple workers, restarts, or an edit while a release is queued, the system can release stale content, mark a new draft as released, or attempt duplicate Canvas comments. There is also one serious fail-open path where a queued release that was previewed as live Canvas can resolve to the mock adapter if the course link/config is absent when the worker runs.

## Findings

### P1 - Release has no durable in-progress lock or compare-and-set transition

Evidence:

- `WritingSubmissionStatus` has no release-pending/in-progress state; it moves directly through `approved` and `released` (`src/writing-feedback/contracts.ts:25`).
- Staff edits are blocked only after `submission.status === 'released'`; an approved submission with a queued or leased release is still editable (`src/writing-feedback/writing-feedback-service.ts:392`).
- Saving any review revision appends the review and resets the submission to `draft_ready` unconditionally (`src/db/mongo/writing-feedback-mongo.ts:941`).
- `enqueueRelease` performs `findActiveWritingJob` and then `enqueueWritingJob` as separate calls, with no unique active-job index (`src/writing-feedback/writing-feedback-service.ts:582`, `src/db/mongo/writing-feedback-mongo.ts:1077`, `src/db/mongo/writing-feedback-mongo.ts:1096`).
- The releases collection has a unique `payloadFingerprint`, but no active-release lock by submission (`src/db/mongo/writing-feedback-mongo.ts:163`).
- `finalizeWritingRelease` updates by fingerprint without an expected-current-status predicate (`src/db/mongo/writing-feedback-mongo.ts:1047`).
- After Canvas reports success, the service sets submission status to `released` with no expected-status predicate (`src/writing-feedback/writing-feedback-service.ts:714`, `src/db/mongo/writing-feedback-mongo.ts:742`).

Why this matters:

1. A staff member can queue a release, edit feedback before the worker finishes, and create a new unapproved `draft_ready` revision. The worker may still release the older approved payload, then overwrite the local submission status to `released`, hiding the fact that the newest revision was never approved or sent.
2. Two near-simultaneous release clicks can both observe no active job and both insert jobs. The job lease prevents two workers from claiming the same job, but it does not prevent two distinct release jobs for the same submission/fingerprint. Without a release-status compare-and-set before attaching feedback, two workers can race into Canvas side effects.

Recommended fix:

- Add a durable submission state such as `release_queued`/`releasing`, or an explicit `releaseLock` field with fingerprint, job id, actor, and timestamp.
- Make queue creation atomic with a unique partial index for active release jobs by `{ courseId, type, payload.submissionId }` where state is `queued` or `leased`, or use a single `findOneAndUpdate(..., upsert: true)` style queue claim.
- Add compare-and-set release transitions, for example `previewed -> feedback_attaching -> feedback_attached -> rubric_writing -> grade_queued -> released`, and require the expected prior status before each external write.
- Set submission `released` only if the submission is still approved for the same release fingerprint/review revision that was released.
- Add tests for concurrent `enqueueRelease`, concurrent workers processing duplicate release jobs, and staff editing between queue and worker completion.

### P1 - Queued live Canvas release can silently downgrade to mock release

Evidence:

- Live preview persists release records with `integration: 'canvas'` (`src/writing-feedback/live-canvas-release-service.ts:206`).
- The worker reloads the latest release, but passes only `courseId` and `queuedByUserId` to the resolver (`src/writing-feedback/writing-feedback-service.ts:615`, `src/writing-feedback/writing-feedback-service.ts:625`).
- `resolveQueuedReleaseService` returns a mock Canvas release service whenever it cannot resolve a Canvas course id (`src/writing-feedback/queued-release-service.ts:48`).
- The mock release service can finalize a release with synthetic Canvas ids (`src/writing-feedback/canvas-release-service.ts:144`).

Why this matters:

If a staff member previews a live Canvas release, then the course link or Canvas config is missing at worker time, the worker can select `mock_canvas` instead of failing closed. That can mark the local release as successful even though no Canvas comment, rubric assessment, or grade reached the real course.

Recommended fix:

- Resolve the queued adapter from the stored release record, not only current course state.
- If `release.integration === 'canvas'`, the worker must require a live Canvas course id and a usable stored staff credential. If either is missing, fail the job with a sanitized reconnect/relink message.
- Only allow mock release when the stored release record was previewed as `mock_canvas`.
- Add a regression test that previews as live Canvas and then removes the course link/config before `runQueuedRelease`.

### P1 - Canvas HTTP errors after side-effecting writes are treated as definite failures

Evidence:

- The Canvas toolkit throws `CanvasApiError` for any non-OK HTTP response (`node_modules/@ubc/ubc-genai-toolkit-lms-integration/dist/providers/canvas/api-client.js:235`).
- Feedback comment `PUT` treats every `CanvasApiError` as a definite failure rather than `reconciliation_required` (`src/writing-feedback/live-canvas-release-service.ts:288`).
- Rubric assessment `PUT` does the same (`src/writing-feedback/live-canvas-release-service.ts:339`).
- Grade `POST` treats `CanvasApiError` as definite failure instead of uncertain (`src/writing-feedback/live-canvas-release-service.ts:380`).
- Canvas's own docs describe submission grade/comment updates as side-effecting APIs, and bulk grade updates return an asynchronous Progress object rather than immediate finality.

Why this matters:

A Canvas 500/502/503/504 or proxy timeout can arrive after Canvas accepted or partially applied a comment, rubric assessment, or grade job. Marking that as a definite failed release tells staff it may be retried, which can duplicate feedback comments or overwrite grade/rubric state without a reconciliation check.

Recommended fix:

- Classify Canvas/network outcomes by stage and status class:
  - 400/401/403/404/422 validation/auth/resource errors can be definite failures.
  - 408/409/423/425/429 and all 5xx after a side-effecting write should enter `reconciliation_required`.
  - Fetch/network timeouts after a side-effecting request should also enter `reconciliation_required`.
- Preserve existing resumability after definite grade-only failures, but do not automatically retry any uncertain comment/rubric/grade operation.
- Add tests for `CanvasApiError(500)` on comment PUT, rubric PUT, and grade POST.

### P2 - Lab-report release artifacts contradict the recorded product decision

Evidence:

- Decision D-080 says lab reports release two PDFs and the two analyses are not merged (`project-memory/01 Project Memory/Decisions.md:102`).
- `WRITING_FEEDBACK_ARCHITECTURE.md` says writing and technical PDFs are separate, and release attaches both PDFs in one comment (`documents/WRITING_FEEDBACK_ARCHITECTURE.md:106`, `documents/WRITING_FEEDBACK_ARCHITECTURE.md:109`).
- The live adapter supports one writing PDF plus at most one technical PDF (`src/writing-feedback/live-canvas-release-service.ts:65`).
- Its tests build a two-artifact release input (`src/writing-feedback/__tests__/live-canvas-release-service.test.ts:51`).
- `WritingFeedbackService.previewRelease` and `release` currently render one combined `writing-feedback-complete.pdf` with `include: 'both'` and put only that writing artifact into the release input (`src/writing-feedback/writing-feedback-service.ts:521`, `src/writing-feedback/writing-feedback-service.ts:537`, `src/writing-feedback/writing-feedback-service.ts:680`, `src/writing-feedback/writing-feedback-service.ts:696`).

Why this matters:

This is not just a doc typo. Staff and students will receive a different artifact shape than the current product memory and supervisor-facing architecture document describe. It also means the adapter/test surface is validating a path the orchestration layer never exercises.

Recommended fix:

- Decide whether D-080 is still authoritative.
- If yes, render the writing PDF with writing content/annotations only and render `lens: 'technical'` as a second summary-only artifact for lab reports.
- Add service-level tests proving lab reports pass two artifacts into preview/release, and non-lab submissions pass one.
- If the combined PDF is now intentional, update D-080, architecture docs, frontend copy, and tests to say one combined PDF everywhere.

### P2 - Process-local preview state limits production deployment shape

Evidence:

- The live release preview stores prepared PDF bytes and preflight state in a module-level `Map` with a 30-minute TTL (`src/writing-feedback/live-canvas-release-service.ts:26`, `src/writing-feedback/live-canvas-release-service.ts:46`, `src/writing-feedback/live-canvas-release-service.ts:190`).
- The worker is started in-process at server startup (`src/writing-feedback/worker.ts:1`, `src/server.ts:340`).
- The queued worker requires the prepared preview entry to still be present before it can attach feedback (`src/writing-feedback/live-canvas-release-service.ts:234`).

Why this matters:

The design works in a single long-running Node process. It fails when the app runs with multiple server instances, a separate worker process, sticky sessions disabled, or a restart between preview and release. In those cases staff see a failed release even though the persisted preview record exists.

Recommended fix:

- Either document single-process deployment as a hard release constraint, or persist prepared release artifacts in a short-lived durable store keyed by fingerprint.
- Store only approved student-safe PDFs, expiry, artifact manifest, and Canvas preflight metadata. Do not store prompt bodies, raw student text beyond existing writing records, tokens, or Canvas credentials.
- Include artifact manifest fields in the durable preview record so the worker can prove it is releasing the same artifact set previewed.

### P2 - Release can queue against a stale preview and fail later instead of refusing immediately

Evidence:

- `enqueueRelease` checks that some latest release exists, but does not recompute the current release fingerprint and compare it with the latest preview (`src/writing-feedback/writing-feedback-service.ts:585`).
- Live release later requires an exact fingerprint and throws if that exact preview is missing (`src/writing-feedback/live-canvas-release-service.ts:220`).

Why this matters:

If feedback, staff narrative, or the final assessment changes after preview and the submission is approved again, the release endpoint can still enqueue a job based on an older preview. The worker then fails asynchronously. This is safe from accidental live Canvas writes, but it is a confusing production workflow and can leave a stale failed job displayed next to a newer preview.

Recommended fix:

- Recompute the current release fingerprint in `enqueueRelease`.
- Require `latestRelease.payloadFingerprint === currentFingerprint` and `latestRelease.status === 'previewed'` before queueing.
- Include the fingerprint in the queued job payload so the worker releases exactly the payload staff confirmed, not merely the latest release for that submission.

### P2 - Canvas attachment import bypasses the toolkit's scoped attachment helper

Evidence:

- The toolkit provides `downloadSubmissionAttachment`, which resolves the attachment through course, assignment, user, and attachment ids before downloading (`node_modules/@ubc/ubc-genai-toolkit-lms-integration/dist/providers/canvas/resources/submissions.d.ts:88`).
- The current live import gateway downloads `attachment.url` directly (`src/writing-feedback/canvas-live-import-gateway.ts:421`).

Why this matters:

The direct download still benefits from the Canvas client's origin restrictions, so this is not an obvious SSRF/token leak. The weaker property is provenance: the URL proves it points to Canvas, not that it belongs to the selected course, assignment, student, and attachment. The scoped helper gives better protection against stale or confused attachment metadata and is easier for reviewers to trust.

Recommended fix:

- Preserve `canvasAssignmentId`, `canvasUserId`, and `attachmentId` on the selected attachment preview.
- Use `downloadSubmissionAttachment(client, { courseId, gradeItemId, userId, attachmentId, maxBytes })`.
- Keep the existing extension, size, and extraction checks.

### P3 - Markdown Canvas uploads are unsupported although Writing Feedback intake allows Markdown elsewhere

Evidence:

- Canvas import parseable extensions are `txt`, `docx`, `pdf`, `html`, and `htm` (`src/writing-feedback/canvas-live-import-gateway.ts:64`).
- No `.md`/`markdown` support is present in the Writing Feedback Canvas import path.

Why this matters:

This is a workflow mismatch rather than a high-risk release bug. A student who uploads a Markdown file to Canvas may be skipped even though staff/manual intake can reasonably accept Markdown-like text.

Recommended fix:

- Add `md`/`markdown` when `LocalDocumentExtractionService` supports it, or explicitly document Canvas Markdown uploads as unsupported.
- Add a unit test for `.md` Canvas attachments.

### P3 - A Canvas context-import error path may log provider message text

Evidence:

- `loadAssignmentContext` catches Canvas assignment/rubric import failures and logs `error.message` (`src/writing-feedback/canvas-import-service.ts:281`).
- The comment directly above says a Canvas payload can carry assignment text (`src/writing-feedback/canvas-import-service.ts:282`).

Why this matters:

This is lower risk than student-text logging, but it weakens the stated "no Canvas/course payloads in logs" posture. Provider error messages sometimes include snippets of response bodies or request context.

Recommended fix:

- Replace provider messages with a fixed sanitized code such as `canvas_assignment_context_failed`.
- If operational detail is needed, log only provider status code/stage fields explicitly known not to contain course/student content.

## Test Run

Command:

```bash
npm test -- --runTestsByPath \
  src/writing-feedback/__tests__/release-lock.test.ts \
  src/writing-feedback/__tests__/live-canvas-release-service.test.ts \
  src/writing-feedback/__tests__/canvas-live-import-gateway.test.ts \
  src/writing-feedback/__tests__/canvas-rubric-write.test.ts
```

Result: 4 suites passed, 49 tests passed.

Notes:

- Jest emitted the existing `ts-jest` globals deprecation warning.
- The passing tests cover many intended contracts, but they do not cover the concurrent queue/release races, stale preview queueing, live-preview-to-mock downgrade, or 5xx-as-uncertain Canvas outcomes.

## Suggested Writing Feedback File Setup

Current pain point:

- The reviewed Writing Feedback/Canvas slice contains 81 related source files and roughly 26.6k lines.
- The largest files are hard to scan: `writing-feedback.css` (2774 lines), `writing-feedback-rubric.ts` (2104), `writing-feedback-review.ts` (1386), `writing-feedback-mongo.ts` (1210), `writing-feedback-shared.ts` (1142), `route-writing-feedback.ts` (1043), `writing-feedback-service.ts` (789), and `contracts.ts` (779).

Recommended target structure:

```text
documents/
  WRITING_FEEDBACK_REVIEW_GUIDE.md
  WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md
  WRITING_FEEDBACK_FILE_MAP.md

src/writing-feedback/
  index.ts
  contracts/
    workflow-contracts.ts
    rubric-contracts.ts
    canvas-contracts.ts
  orchestration/
    writing-feedback-service.ts
    release-preparation.ts
    approval-workflow.ts
  generation/
    feedback-engine.ts
    sfl-analysis.ts
    course-material-mentions.ts
  rubric/
    rubric-schema.ts
    rubric-seed.ts
    rubric-bands.ts
    rubric-autofill.ts
    staff-final-assessment.ts
  canvas/
    canvas-client-for-user.ts
    canvas-import-service.ts
    canvas-live-import-gateway.ts
    canvas-import-resolver.ts
    canvas-release-service.ts
    live-canvas-release-service.ts
    queued-release-service.ts
    canvas-rubric-mapping.ts
    canvas-rubric-write.ts
    release-cap.ts
  jobs/
    job-runner.ts
    worker.ts
  review/
    anchored-comments.ts

src/db/mongo/writing-feedback/
  index.ts
  assignments-mongo.ts
  submissions-mongo.ts
  reviews-mongo.ts
  releases-mongo.ts
  jobs-mongo.ts
  glossary-mongo.ts

public/scripts/feature/writing-feedback/
  index.ts
  api.ts
  workspace.ts
  assignment-list.ts
  review-page.ts
  review-release-card.ts
  rubric-editor.ts
  rubric-grid.ts
  rubric-progress.ts
  anchors.ts
  shared.ts

public/styles/instructor-components/writing-feedback/
  index.css
  workspace.css
  rubric.css
  review.css
  release.css
```

Recommended review documents:

- `WRITING_FEEDBACK_REVIEW_GUIDE.md`: a 3-5 page supervisor entry point with "what this feature does," the safety invariants, the first-pass reading order, and a glossary of statuses.
- `WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md`: the exact Canvas release state machine, sequence diagram, failure/reconciliation table, and what is allowed to retry.
- `WRITING_FEEDBACK_FILE_MAP.md`: one row per file with responsibility, owner, test file, and "review only if changing X."

Recommended migration plan:

1. Start with documentation only: add the review guide, Canvas release contract, and file map. This helps the supervisor immediately without a risky code move.
2. Split frontend files next, because those are the biggest and least risky if imports are updated carefully.
3. Move Canvas modules into `src/writing-feedback/canvas/` behind compatibility re-export shims at the old paths, so existing imports and tests stay stable during the transition.
4. Split `writing-feedback-service.ts` into orchestration plus small release/approval helpers after the release-lock fixes are designed.
5. Split `writing-feedback-mongo.ts` last, because persistence movement has the highest blast radius.

Supervisor reading order after the setup:

1. `documents/WRITING_FEEDBACK_REVIEW_GUIDE.md`
2. `documents/WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md`
3. `src/writing-feedback/contracts/`
4. `src/writing-feedback/orchestration/release-preparation.ts`
5. `src/writing-feedback/canvas/`
6. `src/db/mongo/writing-feedback/releases-mongo.ts` and `jobs-mongo.ts`
7. `public/scripts/feature/writing-feedback/review-release-card.ts`

This keeps the feature explainable without forcing a supervisor to start in a 1000-line router or a 1200-line Mongo delegate.

## Sources Checked

- Canvas Submissions API: `https://canvas.instructure.com/doc/api/submissions.html`
- Canvas File Uploads API: `https://canvas.instructure.com/doc/api/file.file_uploads.html`
- Canvas Progress API: `https://canvas.instructure.com/doc/api/progress.html`
