# Writing Feedback production readiness — design

- **Date:** 2026-08-10
- **Branch:** `refactor/writing-feedback-production`, based on `origin/main` at `fc8f957`
- **Scope:** Spec 1 of 2. Structural work only. LLM auto-derivation of the rubric draft is Spec 2.

## Problem

Writing Feedback works for exactly one assignment. The four rubric criteria and the four
performance levels are closed TypeScript unions and closed zod enums, so a second assignment
with different criteria cannot exist without changing types, validation, prompts, PDF
rendering, persistence, and the frontend rubric editor.

Concretely, on `origin/main`:

| Location | Hard-coded assumption |
| --- | --- |
| `src/writing-feedback/contracts.ts:33` | `type A2Level = 'emerging' \| 'developing' \| 'competent' \| 'strong'` |
| `src/writing-feedback/contracts.ts:36` | `type A2CriterionId` — four fixed slugs |
| `src/writing-feedback/contracts.ts:17` | one global `A2_PROFILE_VERSION` constant |
| `src/writing-feedback/feedback-schema.ts:17,25` | zod enums repeating the same eight literals |
| `src/writing-feedback/feedback-schema.ts:33,44` | `.length(4)` and "each criterion exactly once" fixed at four |
| `src/writing-feedback/feedback-engine.ts:126` | prompt contains the literal `LLED 200 Technical Description Paragraph 1` |
| `src/writing-feedback/canvas-import-service.ts:27-65` | fixtures keyed `demo-lled200-a2-*` with a canned centrifugal-pump essay |
| `public/scripts/feature/writing-feedback-rubric.ts:236,245` | UI states the criteria and SFL lenses are "fixed by the correction pipeline" and renders `SFL mapping (locked)` |
| `public/scripts/feature/writing-feedback-rubric.ts:86` | validation message hard-codes "all four performance levels" |

The rubric editor has no control to add or remove a criterion or a level. It renders whatever
`source.criteria` and `source.levels` contain and permits editing only `label` and `description`.

A separate problem: an assignment is created from a title and an optional due date only
(`src/routes/route-writing-feedback.ts:93-102`). Nothing captures what the assignment actually
asks students to do, so the system has no basis for understanding the task. `buildA2Rubric`
compensates by stamping hard-coded LLED 200 task, audience, purpose, and constraints onto
every assignment.

## Goals

1. Any number of assignments, each with its own criteria, levels, and profile.
2. Systemic Functional Linguistics stays first-class — the shipped default rubric is SFL-grounded
   and instructors extend or prune it rather than receiving a blank form.
3. The system knows what an assignment is about, from instructor-approved text rather than a
   declared taxonomy.
4. No course-specific or assignment-specific content left in the source tree.
5. Clearer control flow and comments written in plain English.

## Non-goals

- LLM derivation of the rubric draft from assignment instructions. That is Spec 2.
- Live Canvas OAuth, production OCR, retention policy, real-student evaluation. All remain
  blocked on institutional decisions recorded in the shared project memory.
- Any change to the approval, release, privacy, or evidence invariants.

## Preserved invariants

Unchanged by this work, and each covered by a regression test:

- Generated feedback is a draft until a human approves it. Approval is not release.
- Only staff-verified text enters generation.
- Every evidence quote must be an exact substring of the verified text.
- Student submissions never enter the course-material RAG or Qdrant pipeline.
- Submission text, generated feedback, prompt bodies containing student text, and PUIDs are
  never logged.
- Student-facing output excludes confidence values, internal flags, model metadata, and
  staff-only notes.

## Design

### 1. Domain model

`src/writing-feedback/contracts.ts`:

```ts
export type WritingCriterionId = string;   // instructor-authored slug, frozen after approval
export type WritingLevelId = string;       // instructor-authored slug, frozen after approval
export type WritingFunctionTag = 'content' | 'interpersonal' | 'organizational';

export interface WritingRubricCriterion {
    id: WritingCriterionId;
    label: string;
    description: string;
    functionTag?: WritingFunctionTag;  // SFL metafunction; same union as AnchoredComment.functionTag
    sflDimension?: string;             // linguistic lens, now instructor-editable
}

export interface WritingRubricLevel {
    id: WritingLevelId;
    label: string;
    description: string;
    rank: number;      // explicit worst-to-best ordering
    points?: number;   // all-or-nothing across the rubric
}
```

Removed: `A2_PROFILE_VERSION`, `A2Level`, `A2CriterionId`. Renamed: `A2FeedbackResult` becomes
`WritingFeedbackResult`. `gradeMapping` becomes `Record<WritingLevelId, number>`.
`WritingAssignment.profileVersion` becomes a per-assignment value, and `WritingAssignment` gains
`instructions?: string` holding the raw assignment text.

`functionTag` deliberately reuses the union already present on `AnchoredComment`, so criterion
filters and annotation filters share one axis instead of maintaining two parallel taxonomies.
Those three values are the Academic Writing Matrix's names for the SFL metafunctions
(ideational, interpersonal, textual), consistent with decision D-017.

`rank` is the only addition beyond loosening. PDF column order and grade mapping currently rely
on array position, which breaks silently the first time an instructor reorders levels.

Frontend mirrors of all of the above go in `public/scripts/types.ts` and
`public/scripts/feature/writing-feedback-shared.ts`, as the repository rule requires.

### 2. Default rubric profile

`src/writing-feedback/a2-profile.ts` becomes `src/writing-feedback/default-rubric-profile.ts`.

Three criteria, one per SFL metafunction. This is the principled minimum: SFL holds that every
text makes three kinds of meaning at once, so three criteria cover a text without overlap or
gaps. It also matches the three criteria in the official LLED 200 A2 handout, which resolves the
mismatch recorded in project memory by construction rather than by renaming anything.

| id | Label | Metafunction | `functionTag` | Lens |
| --- | --- | --- | --- | --- |
| `organization` | Organization | Textual | `organizational` | How the text is staged and held together: information sequencing, theme progression, cohesive ties, paragraph boundaries |
| `content` | Content | Ideational / experiential | `content` | What is represented: technical entities, processes, participants, circumstances, and the accuracy of the relations between them |
| `interpersonal_positioning` | Interpersonal Positioning | Interpersonal | `interpersonal` | How the writer positions the reader: modality and hedging, stance, technicality calibrated to the stated audience |

Four levels, ranks 1 to 4, no points by default:

| rank | id | Label | Descriptor |
| --- | --- | --- | --- |
| 1 | `weak` | Weak | The criterion is not yet demonstrated; revision should start here |
| 2 | `developing` | Developing | The criterion is partly demonstrated and needs focused revision |
| 3 | `proficient` | Proficient | The criterion is clearly demonstrated for this task |
| 4 | `exemplary` | Exemplary | The criterion is demonstrated precisely and effectively |

The template is created with `status: 'draft'`, not `'approved'`. This is a behaviour change:
`buildA2Rubric` currently ships pre-approved. Requiring approval means no assignment is ever
graded against a rubric no human has looked at.

### 3. Optional criterion library

`src/writing-feedback/criterion-library.ts` holds criteria that are available but off by
default. Data only; adding one is a single action in the editor and removing it is free.

| id | Label | `functionTag` | Purpose |
| --- | --- | --- | --- |
| `task_constraints` | Task Constraints | none | Word count, required representation, stated audience, format |
| `sources_referencing` | Sources and Referencing | `organizational` | Citation practice, reference list, attribution |
| `genre_staging` | Genre Staging | `organizational` | Whether the stages expected for this assignment are present and ordered |

Moving `task_constraints` out of the default set answers an open question recorded in project
memory. It stops being a silently scored fourth criterion and becomes a per-assignment choice.

### 4. Validation built from the rubric

`src/writing-feedback/feedback-schema.ts` exports `buildFeedbackSchema(rubric)` in place of the
module-level `a2FeedbackSchema` constant:

```ts
export function buildFeedbackSchema(rubric: WritingRubricDefinition) {
    const criterionIds = rubric.criteria.map((criterion) => criterion.id);
    const levelIds = rubric.levels.map((level) => level.id);
    return z.object({
        criteria: z.array(z.object({
            criterion: z.enum(criterionIds as [string, ...string[]]),
            suggestedLevel: z.enum(levelIds as [string, ...string[]]),
            evidence: z.array(evidenceSchema).min(1),
            explanation: z.string().min(1),
            confidence: z.number().min(0).max(1)
        })).length(criterionIds.length),
        strengths: z.array(z.string().min(1)).max(5),
        revisionGoals: z.array(revisionGoalSchema).max(3),
        internalFlags: z.array(z.string()).max(8)
    }).superRefine(requireEachCriterionExactlyOnce(criterionIds));
}
```

Guarantees are identical to today's. The only change is where the allowed values come from.

Rubric-level validation added in `rubric-schema.ts`:

- 1 to 10 criteria, unique slug-shaped ids
- 2 to 8 levels, unique slug-shaped ids, unique contiguous ranks
- points present on every level or on none
- criterion and level ids are immutable once the rubric is approved

The last rule matters because `CriterionFeedback.criterion` and `AnchoredComment.criterion`
store ids. Renaming an approved id would orphan every past run and anchored comment that
references it. Labels stay freely editable; changing an id means creating a new criterion.

### 5. Generation prompt

`feedback-engine.ts:126` drops the `LLED 200 Technical Description Paragraph 1` literal and
serialises the approved rubric instead: title, task, audience, purpose, constraints, learning
outcomes, each criterion with its label, description, and lens, and each level with its label,
description, and rank. The model is told which criteria to judge and which level names it may
emit, rather than those being implicit in a schema it cannot see.

This is what makes the tool sensitive to what an assignment is about. The understanding lives in
instructor-approved prose on the assignment's own rubric, so a lab report is simply an
assignment whose approved rubric describes a lab report.

### 6. Backward compatibility

No migration script, and no destructive rewrite.

Once criteria and levels are data, a stored document holding the four old criteria and
`emerging`/`developing`/`competent`/`strong` **is** a valid rubric. Validation is constructed
from that stored rubric, so existing assignments keep working untouched. Only newly created
assignments receive the new default template.

The single gap is `rank`, which older documents lack. The Mongo read boundary backfills it from
array position, matching the existing pattern used for legacy `isPinned` in
`src/db/mongo/chat-mongo.ts`.

Label resolution for historical runs goes through the run's stored `rubricVersion` in
`rubricHistory`. An id that resolves to nothing renders as its raw slug rather than throwing, so
a rubric edit can never crash a review page.

### 7. Assignment instructions

`WritingAssignment.instructions?: string` stores the raw text of what the assignment asks
students to do.

- Manual creation: a textarea on the create-assignment form, and the existing document upload
  path reused to accept an instructions file.
- Canvas import: `CanvasImportAssignmentSummary` gains `description?: string`, carried through
  the mock gateway so the live adapter has somewhere to put it later.

In this spec the field is filled by a human and displayed in the rubric editor for reference.
Spec 2 adds the LLM step that reads it and proposes a rubric draft.

### 8. Rubric editor

`public/scripts/feature/writing-feedback-rubric.ts` gains:

- Add criterion, producing a new row with an editable slug, label, description, optional
  `functionTag` dropdown, and optional lens text
- Remove criterion, with confirmation, blocked below one remaining criterion
- Add from library, listing the optional criteria not already present
- Add, remove, and reorder levels, with `rank` recomputed on reorder, bounded at 2 to 8
- Slug fields disabled once the rubric is approved, with an explanation of why

Removed: the "fixed by the correction pipeline" copy at line 236, the `SFL mapping (locked)`
rendering at line 245, and the "all four performance levels" message at line 86.

Accessibility follows the existing patterns in this file: every control is a real button with an
accessible name, removal moves focus to a stable neighbour, and reordering announces the new
position.

### 9. Module moves

```
src/writing-feedback/pdf-service.ts             -> src/report-generation/writing-feedback-report.ts
src/writing-feedback/annotated-text-layout.ts   -> src/report-generation/writing-feedback-layout.ts
src/writing-feedback/__tests__/pdf-service.test.ts
    -> src/report-generation/__tests__/writing-feedback-report.test.ts
src/writing-feedback/__tests__/annotated-text-layout.test.ts
    -> src/report-generation/__tests__/writing-feedback-layout.test.ts
```

The layout engine moves with the renderer. It is PDF-only, used by nothing else, and leaving it
behind would make the boundary meaningless.

The `WritingFeedbackPdfService` port and `FeedbackPdfInclude` type stay in
`writing-feedback/contracts.ts`. Only the implementation moves, so `report-generation` depends
on the Writing Feedback domain and never the reverse. `contracts.ts` is types-only, so this
introduces no runtime cycle.

Both modules are exported from the existing `src/report-generation/index.ts` barrel. That file's
`@author: @gatahcha` header is preserved and gains one `@rdschrs` note, following the repository's
shared-ownership rule.

`src/writing-feedback/writing-feedback-service.ts:30` updates its import accordingly.

### 10. Removing course-specific content

| Current | Replacement |
| --- | --- |
| `demo-lled200-a2-description`, `demo-lled200-description-revision` | `demo-technical-description`, `demo-lab-report` |
| Canned centrifugal-pump essay | Two short neutral synthetic samples, clearly labelled synthetic |
| `promptVersion: 'a2-v1'` | `promptVersion: 'writing-feedback-v1'` |
| Symbols and comments naming A2 or LLED | Generic Writing Feedback vocabulary |
| `documents/WRITING_FEEDBACK_*.md` course-specific passages | Rewritten to describe the capability; LLED 200 appears only as a named pilot course, not as the system's subject |

### 11. Control flow and comments

Structural targets, ranked by measured maximum brace depth:

| File | Depth | LOC |
| --- | --- | --- |
| `src/report-generation/writing-feedback-report.ts` (was `pdf-service.ts`) | 5 | 431 |
| `src/writing-feedback/canvas-import-service.ts` | 5 | 311 |
| `src/report-generation/writing-feedback-layout.ts` (was `annotated-text-layout.ts`) | 5 | 206 |
| `src/writing-feedback/feedback-schema.ts` | 5 | 180 |
| `public/scripts/feature/writing-feedback-review.ts` | 4 | 921 |

Techniques: guard clauses instead of `else` chains, lookup tables instead of `if`/`else if`
ladders, named predicates for compound conditions, and extraction where one function serves two
purposes. No public API changes beyond those specified above.

Comments are rewritten so a new contributor can follow the logic without prior context.

Before:

> Cosmetic model drift may be reconciled through a UTF-16 source map, but paraphrases and
> unmatched evidence fail instead of being invented.

After:

> The model sometimes returns a quote with curly quotes or extra spaces where the student typed
> straight quotes. We fold those differences and try again, mapping back to the exact characters
> the student wrote. A quote the model reworded is rejected — we never invent evidence.

Every exported declaration keeps behaviour-first TSDoc as the repository rules require. The
change is register, not coverage.

## Testing

Existing suites stay green, with fixtures updated to construct rubrics rather than assume four
fixed criteria.

New coverage:

| Test | Asserts |
| --- | --- |
| 3-criterion rubric validates | Criterion count is not fixed |
| 6-criterion rubric validates | Upper end of the supported range works |
| Level id outside the rubric is rejected | Levels are constrained by the rubric, not by a literal |
| Criterion order independence | Judgments may arrive in any order |
| Duplicate criterion id rejected | The exactly-once rule survives the rewrite |
| `rank` backfill | A legacy document without `rank` reads correctly |
| Legacy 4-criterion document still validates | No migration is required |
| Approved rubric rejects an id change | Past runs and anchored comments cannot be orphaned |
| Points all-or-none | Partial point mappings are rejected |
| PDF renders 3 and 6 criteria | Rendering is not fixed at four |
| Unknown criterion id renders as its slug | A rubric edit cannot crash review |
| Prompt contains no course-specific literal | Regression guard against reintroduction |

## Verification

Run before the work is called complete:

- `npx tsc --noEmit` — backend
- `npx tsc -p public/tsconfig.json --noEmit` — frontend
- `npm run build`
- `npx jest src/writing-feedback src/report-generation src/routes src/db/mongo` — focused
- `npx jest` — full suite, compared against the recorded 423/429 baseline so the six known
  failures remain the only ones
- `git diff --check`
- `grep -ri 'lled\|\ba2\b' src public documents` returns only the deliberate pilot-course
  references in documentation

Node 24.1.0, npm 11.3.0.

**MongoDB must be running.** `src/writing-feedback/__tests__/writing-feedback-service.test.ts`
fails at the "stamps the active approved rubric version on each generated run" case with a 5
second Jest timeout whenever MongoDB is unreachable. The trailing output is
`Failed to connect to MongoDB: connect ECONNREFUSED 127.0.0.1:27017`. Confirmed on 2026-08-10:
Docker was not reachable from WSL and port 27017 was closed.

This is an environment condition, not a code defect, and it is not introduced by this work — it
reproduces identically on clean `origin/main` with the local change stashed away. Start Docker
Desktop with WSL integration enabled before treating any suite result as a baseline. Part of the
recorded six-failure baseline may have the same cause and should be re-measured with MongoDB up
before anyone is assigned to triage it.

A follow-up worth raising separately: a unit test named for rubric provenance should not require
a live database. It is outside this spec's scope.

## Delivery

- **Branch:** `refactor/writing-feedback-production` off `origin/main` at `fc8f957`
- **Committed already:** `7c2d0e7` — the evidence-normalization readability edit recovered from
  `stash@{0}`, verified clean against this base
- Remaining work lands as reviewable commits on the same branch
- No push and no pull request without an explicit request

## Decisions this design records

| Ref | Decision |
| --- | --- |
| WF-1 | Rubric criteria and levels are per-assignment instructor-authored data, not closed unions |
| WF-2 | The default template is the three SFL metafunctions; `task_constraints` becomes opt-in |
| WF-3 | Default level labels are Weak, Developing, Proficient, Exemplary, matching the official LLED 200 A2 handout |
| WF-4 | Criterion and level ids are frozen once a rubric is approved; labels stay editable |
| WF-5 | Genre sensitivity comes from instructor-approved assignment text, not a genre taxonomy |
| WF-6 | The default rubric ships as a draft and requires explicit approval before governing generation |
| WF-7 | Existing documents need no migration; only `rank` is backfilled at the read boundary |
| WF-8 | PDF rendering moves to `src/report-generation`; the port stays in the Writing Feedback domain |

These are proposed here and should be promoted to the shared decision log once the
implementation lands.

## Open questions carried forward

- Retention and deletion policy for submissions and feedback runs remains undecided.
- Live Canvas authentication, sandbox scope, and release policy remain undecided.
- Whether an instructor may edit a rubric that already has released feedback against it, or
  whether that requires a new assignment, is not settled by this spec. Current behaviour —
  a new immutable version with history retained — is preserved unchanged.
