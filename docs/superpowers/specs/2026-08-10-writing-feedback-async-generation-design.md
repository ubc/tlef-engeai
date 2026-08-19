# Writing Feedback asynchronous generation — design

Date: 2026-08-10
Branch: `refactor/writing-feedback-production`
Status: approved for planning

## Problem

`POST /api/courses/:courseId/writing-feedback/submissions/:submissionId/generate` awaits
`WritingFeedbackService.generate()` inside the HTTP request. The model call, schema
validation, and exact-evidence reconciliation all run before the response is sent, so the
request is held open for the full duration of an LLM round trip.

The durable queue that should carry this work already exists and is complete:

- `WritingJob` contract with `queued` / `leased` / `completed` / `failed` states,
  bounded attempts, and a lease expiry.
- `enqueueWritingJob`, `leaseNextWritingJob`, `completeWritingJob`, and `failWritingJob`
  Mongo delegates, where leasing is a single atomic `findOneAndUpdate`.
- `MongoWritingFeedbackJobRunner.runNext()`, which leases one job, dispatches it to an
  injected handler, and records completion or sanitized failure.

None of it is reachable. `job-runner.ts` is imported nowhere and `enqueueWritingJob` has
zero call sites. This design wires the existing machinery rather than building new
machinery.

Two facts make the change small. `generate()` already writes the durable states
`generating`, `draft_ready`, and `failed`. The frontend already has labels and colors for
all of them. The state machine exists; only the execution path is synchronous.

## Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| A-1 | The worker is an in-process poller started from `server.ts`. | No deployment change, no new entry point, no process manager. Production deployment is still an open question in project memory, so a second container would be premature. Mongo's atomic lease already makes the design safe if multiple app instances are run later. |
| A-2 | The review page polls until the status settles. | Reuses status vocabulary that already exists end to end. A staff member who navigates away and returns still sees correct state, because the state lives in Mongo rather than in a pending request. |
| A-3 | `maxAttempts` is 1; the first error is terminal. | Simplest to reason about and cheapest on model spend. A staff member presses Generate again themselves. |
| A-4 | The route enqueues; a separate module binds job type to the domain service. | Keeps queue mechanics outside a service that already owns model calls, review, PDF, and release. Matches the existing "handlers are deliberately injected" boundary in `job-runner.ts`. |
| A-5 | A second Generate while one is in flight is rejected with an error. | One rule, no extra query. Also stops two staff members double-spending a model call on the same submission. |
| A-6 | The worker sweeps orphaned jobs on startup. | With `maxAttempts: 1` a crash mid-generation is otherwise unrecoverable. See "Crash recovery". |

## Architecture

### New module: `src/writing-feedback/writing-feedback-jobs.ts`

Two exports.

`buildWritingFeedbackJobHandlers(mongo)` returns the handler map consumed by
`MongoWritingFeedbackJobRunner`. Only `generate` is registered; `extract`, `pdf`, and
`release` remain unregistered and would throw "No registered writing-feedback job handler"
if enqueued, which is the runner's existing behavior for unknown types.

`startWritingFeedbackWorker(mongo, options)` starts an interval loop and returns a stop
function. Each tick drains the queue by calling `runNext()` until it returns false or a
bounded per-tick ceiling is reached, so a backlog does not take one interval per job. A
re-entrancy flag prevents a slow tick from overlapping the next one. The stop function
clears the interval and is used by tests.

Defaults: 2000 ms poll interval, 20 jobs per tick ceiling, 60000 ms lease (the runner's
existing default).

### Startup

`server.ts` calls `startWritingFeedbackWorker` once, after the Mongo connection is
established. The worker is not gated behind an environment variable: a config knob that
can be misconfigured to "nothing ever runs" is a worse failure mode than a worker running
in every instance, which the atomic lease already tolerates.

### Request path

`POST .../generate` becomes:

1. Load the submission within its course scope.
2. Reject when the status is already `generating`, with an error the existing toast
   surfaces as generation already being in progress.
3. Validate generation preconditions.
4. Set the submission status to `generating`.
5. `enqueueWritingJob({ courseId, type: 'generate', state: 'queued', maxAttempts: 1, payload: { submissionId } })`.
6. Respond `202` with `{ success: true, data: { status: 'generating' } }`.

Step 4 happens in the route rather than in the worker on purpose. The worker may not pick
the job up for up to one poll interval, and without an immediate status write the review
page would show the previous status and then jump, or the dedupe guard in step 2 would not
yet see an in-flight run.

### Precondition extraction

The preconditions currently checked inside `generate()` — the submission exists, does not
require verification, and has non-empty verified text — must also be checkable from the
route. Without that, clicking Generate on an unverified submission returns `202` and then
silently flips to `failed`, which is a worse experience than today's immediate error.

`WritingFeedbackService` gains `assertGeneratable(courseId, submissionId)`, which performs
those checks and returns the submission. `generate()` calls it in place of its current
inline check, so there is exactly one definition of the rule. This preserves existing
behavior and existing test meaning; it is a refactor, not a behavior change.

### Response contract change

The endpoint previously returned the generated `WritingFeedbackResult`. It now returns a
status acknowledgement. This is a breaking change to that one endpoint, and the frontend
is the only consumer. `documents/ENDPOINT_ARCHITECTURE.md` must record the new `202`
contract.

## Data flow

```
staff clicks Generate
  route: guard -> assertGeneratable -> status=generating -> enqueue -> 202
  frontend: render "Generating" chip, begin polling detail every 3s

worker tick (<=2s later)
  leaseNextWritingJob  (state=leased, attempts=1, leaseUntil=now+60s)
  handler -> service.generate()
      status=generating (already set; idempotent)
      model call -> validate -> createWritingFeedbackRun -> status=draft_ready
  completeWritingJob   (state=completed)

frontend poll observes status != generating -> stop polling -> re-render
```

Failure path: the handler throws, `generate()`'s existing catch sets the submission to
`failed` and rethrows, the runner calls `failWritingJob` with a generic message, and
`attempts (1) >= maxAttempts (1)` makes the job terminal. No new failure code is required.

## Crash recovery

With `maxAttempts: 1` a process death mid-generation is unrecoverable by the existing
predicate. The job stays `leased`; once its lease expires the reclaim filter evaluates
`attempts < maxAttempts` as `1 < 1`, which is false, so it is never leased again. The
submission remains `generating` forever and staff see a spinner that never resolves.

The worker therefore performs a sweep on startup: jobs whose state is `leased`, whose
`leaseUntil` has passed, and whose attempts are exhausted are marked `failed`, and their
submissions are set to `failed`. Staff see "Needs attention" and can press Generate again.

This requires one new Mongo delegate, `sweepOrphanedWritingJobs`, exposed through
`EngEAI_MongoDB`, which returns the orphaned jobs it transitioned so the worker can set
each corresponding submission to `failed`. It runs once at startup rather than every tick,
because the only way to create an orphan is a process restart.

## Error handling

- Provider errors never reach job records. `sanitizedError` stays the runner's existing
  generic string, preserving the invariant that submission content, prompts, and provider
  secrets are never persisted or logged.
- The frontend surfaces a terminal failure through the existing `failed` status chip. It
  does not surface a reason, because no student-safe reason is persisted by design.
- A poll that errors stops polling and leaves the last rendered state, rather than
  retrying indefinitely against a failing endpoint.
- The route writes `generating` before it enqueues, so an enqueue that throws would leave
  the submission in an in-flight state with no job behind it. The route therefore restores
  the previous status when `enqueueWritingJob` fails, and surfaces the error, so the dedupe
  guard cannot lock a submission out of future attempts.

## Frontend

`writing-feedback-review.ts` gains a poll controller:

- Starts after a successful enqueue, and also on page load when the status is already
  `generating`, which covers reopening a submission mid-run.
- Polls the existing submission detail endpoint every 3000 ms.
- Stops on a settled status, on request error, on navigation away from the view, and after
  a 5-minute cap so a stuck run cannot poll forever.
- Re-renders the review view when the status settles.

The Generate button returns to its idle state immediately after the `202`, so a TA can move
to the next submission while the run proceeds.

## Testing

New `src/writing-feedback/__tests__/writing-feedback-jobs.test.ts`:

- the `generate` handler dispatches with the job's `courseId` and `payload.submissionId`;
- a tick drains multiple queued jobs rather than one per interval;
- the per-tick ceiling is honored;
- a slow tick does not overlap the following tick;
- the stop function halts polling;
- the startup sweep transitions an expired, attempt-exhausted leased job and its
  submission to `failed`, and leaves a healthy leased job alone.

Existing `writing-feedback-service.test.ts` coverage of `generate()` stays valid because
the method's behavior is unchanged.

No route-level test is added. Project memory records that this repository has no
`supertest` or `MongoMemoryServer` harness anywhere in `src/routes/__tests__` or
`src/db/mongo/__tests__`, and every existing Mongo-delegate test covers pure logic only.
Introducing that infrastructure is a separate decision, not a side effect of this change.

## Invariants preserved

- Job payloads carry only `submissionId`; no student content enters the queue.
- `courseId` rides on the job so the handler authorizes within a course scope.
- Generation still consumes staff-verified text only, because `generate()` is unchanged.
- Model output remains a draft; nothing in this change touches approval or release.
- No submission text, prompt body, or generated feedback is logged.

## Out of scope

- Retention (`retentionAt` is still never set). Tracked separately.
- The `extract`, `pdf`, and `release` job types remain unregistered.
- Any change to approval, release, or the Canvas boundary.
- Multi-instance deployment topology and process management.
