# Writing Feedback — Canvas Release Contract

What a release does to Canvas, in what order, what each state means, and what may be retried.
Read this before changing anything under `src/writing-feedback/` that touches release.

Companion documents: `WRITING_FEEDBACK_REVIEW_GUIDE.md` (what the feature is), `WRITING_FEEDBACK_FILE_MAP.md` (where the code is).

## The rule the whole design serves

A Canvas submission comment is not idempotent. Posting one twice sends the student a second copy
of their feedback and a second notification. Canvas offers no idempotency key for comments,
rubric assessments, or grades. So every mechanism below exists to answer one question: *may this
write be attempted again?*

Three answers, and only three:

| Answer | Where it is recorded | What happens next |
| --- | --- | --- |
| It definitely did not happen | `status: 'failed'` | Staff may release again |
| It definitely happened | `status: 'released'` / `'reconciled'` | Nothing; a correction is a new release |
| Nobody knows | `status: 'reconciliation_required'` | A human checks Canvas; the queue never retries |

## Preconditions

A release is refused before any Canvas call when:

- the submission is not `approved`, or has no complete staff-final assessment;
- no preview exists for the exact current payload (see *Fingerprint*);
- the submission has already spent `MAX_SUBMISSION_RELEASES` (5) releases that reached a student;
- the latest release is `reconciliation_required`, `released`, or `reconciled`;
- another release for this submission already holds the lock;
- for a live release, the submission has no Canvas identity (`canvasUserId`), or the course lost its Canvas link.

## Fingerprint

`computeReleaseFingerprint` (`canvas-release-service.ts`) hashes the semantic payload: submission
id, feedback run id, rubric version, staff-final grade, the final assessment, the optional
technical run id, and the staff-approved student narrative. Rendered PDF bytes are excluded —
each render stamps fresh annotation ids and timestamps, so including them would make every
preview a different release.

The fingerprint is the release record's identity (unique index). Consequences:

- Previewing the same payload twice returns the same record rather than creating a second one.
- Editing feedback, the grade, or the narrative produces a *different* fingerprint. `enqueueRelease`
  recomputes it and refuses a preview the payload has moved on from, where staff can see the
  refusal, rather than failing later inside a worker.

## The lock

`releaseLockedAt` on the release record, taken by `claimWritingReleaseForQueue` in one
`findOneAndUpdate`. Properties:

- **Atomic.** Two staff members pressing Release in the same second both pass the "is a job
  already queued?" read; exactly one wins the claim. The loser is handed the winner's job, or
  told a release is already in progress.
- **Status-preserving.** The claim does not change `status`, because the status is what a resumed
  release reads to know how far the last attempt got. Overwriting it would make a worker re-attach
  a comment Canvas already has.
- **Bounded.** A lock older than `RELEASE_LOCK_TTL_MS` (30 minutes) is treated as abandoned, so a
  worker that died cannot freeze a submission for good.
- **Released in a `finally`.** However `runQueuedRelease` ends, the lock goes back.

Two further guards sit beside it:

- A unique partial index (`active_release_job`) on `{ courseId, type, payload.submissionId }` where
  `type: 'release'` and `state: 'queued'`. A duplicate-key error here is not shown to staff: the
  job that won is the answer the caller wanted.
- `appendReview` refuses while a release is in flight (lock held, or status `feedback_attached` /
  `grade_queued` / `reconciliation_required`). Without it, staff could save a new unapproved
  revision while the worker was rendering the approved one.

## Order of writes

`POST .../release` queues and returns `202`; the write runs in the worker with `maxAttempts: 1`.
The queue's generic retry is right for a model call and wrong for an external write.

```
previewed
   │  claim lock, enqueue job
   ▼
worker: resolve adapter ──► integration must match the preview's (see Fail-closed)
   │
   │  re-preview (rebuilds process-local prepared PDFs/preflight for the same fingerprint)
   ▼
upload PDF(s) ──► attach one submission comment ──► feedback_attached
   │
   ▼
write per-criterion rubric assessment ──► (rubricAssessmentWritten)
   │
   ├─ Canvas rubric grades the assignment ──► released      (no total posted: Canvas derived it)
   │
   ▼
post staff-final grade (bulk update) ──► grade_queued ──► wait on Progress ──► released
```

Each step resumes from where the previous one stopped: a release that already has
`feedback_attached` does not re-attach the comment; one with `grade_queued` and a progress id only
waits on the progress.

## Outcome classification

`isDefiniteRejection` (`live-canvas-release-service.ts`) decides `failed` vs
`reconciliation_required` after a side-effecting write:

| Outcome | Treated as | Why |
| --- | --- | --- |
| `CanvasApiError` 4xx, except 408 and 429 | definite failure | Canvas rejected the request; nothing changed |
| `CanvasApiError` 5xx | uncertain | Canvas may have applied the write before the response was lost |
| `CanvasApiError` 408 / 429 | uncertain | Rate limiting can land mid-flight; the response does not say |
| Timeout, socket error, anything not a Canvas API error | uncertain | Outcome unobservable |
| `CanvasGradeExportError` | definite failure | The package refused before sending; Canvas never saw it |

Every status transition after a Canvas call is a compare-and-set against the statuses the caller
believes it is acting on (`finalizeWritingRelease(fingerprint, update, expectedStatuses)`), so a
slow or duplicated writer cannot walk a finished release backwards.

## Fail-closed rules

- **Adapter identity.** The worker refuses when the adapter it resolves is not the one the preview
  was made against. A course whose Canvas link went missing after preview would otherwise resolve
  to the visibly-labelled mock, marking the release complete locally while nothing reached Canvas.
- **Exact attempt.** Release re-reads the Canvas submission and refuses if the assignment, user, or
  attempt no longer matches the preview: a student who resubmitted must not receive feedback on an
  attempt they replaced.
- **Rubric shape.** If the live Canvas rubric no longer matches the imported shape, preview refuses
  rather than writing scores into criteria that may have been rebuilt.
- **Missing credential.** A queued release whose staff credential is gone fails the job with a
  sanitized message naming reconnection as the fix. It never falls back to another user's token.

## Deployment constraint

Prepared release artifacts (rendered PDF bytes, Canvas preflight objects) live in a process-local
map with a 30-minute TTL. The worker re-previews before releasing, which rebuilds them for the
same fingerprint, so a restart or a separate worker process is survivable — but the rebuild costs
a fresh render and fresh Canvas preflight reads. Nothing durable holds the bytes. If the app is
ever deployed with several server instances writing concurrently, revisit this: the correctness
guards are the fingerprint and the lock, both durable, but the prepared state is not.

## Logging

Never log submission text, prompts containing it, generated feedback, OAuth tokens, or provider
error messages that may quote a Canvas payload. Release errors are stored sanitized
(`sanitizedError`) and are the only text shown to staff about a failure.

## What is deliberately not automated

- Reconciliation. `reconciliation_required` means a human opens Canvas and looks.
- Retry of any uncertain write.
- Any Canvas write during import. Import is read-only, always.
