# Writing Feedback Diagnosis and Grounding Implementation Plan

> Code listings longer than three lines were removed after implementation; the code lives in the repository and its history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a whole-text diagnosis and a deterministic gate ahead of local feedback, and make every course-material citation evidence-backed, measured by a repeatable eval harness.

**Architecture:** The linguistic engine grows from two model calls to four. A genre-retrieval pass feeds a new diagnosis call. A pure gate decides `standard` or `global_revision`. The analyzer runs as before, but reads the genre excerpts. Per-finding retrieval is followed by a batched relevance call. The writer returns standard and global content together. Held-back annotations, the mode override and global-block edits travel in the existing append-only review revision. Coverage is cached on the assignment.

**Tech Stack:** Node 24.1.0, TypeScript, Express, MongoDB, Zod, `ubc-genai-toolkit-llm` (`sendStructuredConversation`), `ubc-genai-toolkit-rag` via `RAGApp`, PDFKit, Jest with ts-jest (node environment), vanilla TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-09-28-writing-feedback-diagnosis-grounding-design.md`

## Global Constraints

- Node 24.1.0 via NVM. No Python anywhere, including scripts.
- Never edit `dist/` or `public/dist/`.
- Keep HTTP handlers thin. Persistence lives in `src/db/mongo/writing-feedback-mongo.ts`, exposed through `EngEAI_MongoDB` in `src/db/enge-ai-mongodb.ts`.
- Mirror every shared type between `src/writing-feedback/contracts.ts` and `public/scripts/feature/writing-feedback-shared.ts`.
- Filenames lowercase kebab-case. Values/functions camelCase. Types PascalCase. Behavior-first TSDoc on every exported API. Step comments in non-trivial pipelines. Match the surrounding comment density.
- Student text, evidence quotes, analyzer `observation` and `functionalInterpretation` must never reach any retrieval query or the relevance call.
- Never log submission text, prompts, model output or feedback content. Error messages that can reach staff are hand-written constants, never derived from Zod or provider errors.
- Student-facing output excludes confidence, internal flags, diagnosis rationale, excerpt text, prompt/model metadata and held-back annotations in global mode.
- Every new course route inherits the router's Writing Feedback enablement and staff RBAC (instructor/admin/TA parity, D-049).
- All contract changes are additive. Runs, revisions and comments stored before this change must still read and render (as standard mode).
- Jest always with `--maxWorkers=4`, and jest, `tsc` and builds run in the background (`run_in_background`), never the foreground.
- Backend check: `npx tsc --noEmit -p tsconfig.json`. Frontend check: `npx tsc --noEmit -p public/tsconfig.json`.
- **Commits:** the project forbids committing unless the user explicitly asks. Each task's commit step runs only if the user has authorized commits for this execution. If so, use a subject line only, with no body and no co-author or AI trailers, authored as the repository's configured user.
- Do not touch the unrelated untracked files under `docs/superpowers/plans/` and `docs/superpowers/specs/`.

## Review Focus

1. **A rubric whose stages are all stored `required: true`** (every existing rubric, because the editor hardcoded it). An optional stage the student skipped must not silently hide all local feedback before staff have reviewed the flags. The one-time notice in Task 13 and the override in Task 14 cover this; the gate truth table in Task 2 pins that only `required === true` counts.
2. **A diagnosis that names a stage id the profile lacks, or omits one.** Expect the run to fail with the fixed diagnosis message, never a gate computed from partial data. Pinned in Task 3.
3. **A run stored before this change** (no `gateDecision`, no `globalRevision`, goals without `action`, comments without `heldBack`). Expect the review page, PDF and release to behave exactly as today. Pinned in Tasks 10 and 11.
4. **Staff flip the mode after approving, then release.** Expect the release to use the latest revision's `modeOverride`. Pinned in Task 11.
5. **Course with published and unpublished material.** Unpublished excerpts may inform but never become citable or appear in coverage labels shown as readings. Pinned in Task 4 and Task 6.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/writing-feedback/__tests__/fixtures/eval/eval-fixtures.ts` | Create | Synthetic LLED 200 texts, expectations, profile builder |
| `src/writing-feedback/__tests__/fixtures/eval/eval-materials.ts` | Create | Synthetic lecture notes and in-memory retriever |
| `src/writing-feedback/eval-checks.ts` | Create | Pure per-fixture checks, tolerant of baseline output |
| `scripts/wf-eval.ts` | Create | Live eval runner and report writer |
| `src/writing-feedback/contracts.ts` | Modify | New diagnosis, gate, global, coverage, excerpt types |
| `src/writing-feedback/feedback-gate.ts` | Create | Gate decision, effective mode, student-facing comment filter |
| `src/writing-feedback/text-diagnosis.ts` | Create | Diagnosis schema, prompt, validation |
| `src/writing-feedback/course-material-mentions.ts` | Modify | Need builders, vocabulary expansion, need-based retrieval |
| `src/writing-feedback/material-relevance.ts` | Create | Relevance pairs, call, supported-excerpt map |
| `src/writing-feedback/material-coverage.ts` | Create | Coverage rows and material fingerprint |
| `src/writing-feedback/feedback-schema.ts` | Modify | Writer schema: excerpt ids, goal action, global block; guards |
| `src/writing-feedback/prompt-examples.ts` | Create | Versioned synthetic worked examples |
| `src/writing-feedback/sfl-foundation.ts` | Modify | Expectedness legend, prompt payload without gates, versions |
| `src/writing-feedback/feedback-engine.ts` | Modify | Four-call pipeline, rewritten analyzer/writer prompts |
| `src/writing-feedback/anchored-comments.ts` | Modify | `heldBack` on seeds and input schema |
| `src/writing-feedback/summary-edits.ts` | Modify | `globalRevision` staff edits |
| `src/writing-feedback/summary-redraft-engine.ts` | Modify | Goal `action` |
| `src/writing-feedback/writing-feedback-service.ts` | Modify | Mode-aware student document, coverage service methods |
| `src/report-generation/writing-feedback-report.ts` | Modify | Global block, goal action, held-back filtering |
| `src/db/mongo/writing-feedback-mongo.ts`, `src/db/enge-ai-mongodb.ts` | Modify | Coverage persistence |
| `src/migrate/schemas.ts` | Modify | New run and assignment keys |
| `src/routes/route-writing-feedback.ts` | Modify | Revision payload fields, coverage routes |
| `public/scripts/feature/writing-feedback-shared.ts` | Modify | Browser mirror |
| `public/scripts/feature/writing-feedback-diagnosis-model.ts` | Create | Pure review-page model for banner, toggle, held-back |
| `public/scripts/feature/writing-feedback-diagnosis.ts` | Create | DOM rendering for banner, held-back group, global editor |
| `public/scripts/feature/writing-feedback-review.ts` | Modify | Wire diagnosis UI into the review panel |
| `public/scripts/feature/writing-feedback-rubric.ts` | Modify | Required checkbox, notice, coverage panel |
| `public/scripts/feature/writing-feedback-batch.ts` | Modify | Rewrite chip |
| `documents/ENDPOINT_ARCHITECTURE.md`, `documents/MONGO_DATA_LAYER.md` | Modify | Contract docs |

---

## Phase 0 — Baseline measurement

### Task 1: Eval harness and baseline on current prompts

**Files:**
- Create: `src/writing-feedback/__tests__/fixtures/eval/eval-fixtures.ts`
- Create: `src/writing-feedback/__tests__/fixtures/eval/eval-materials.ts`
- Create: `src/writing-feedback/eval-checks.ts`
- Create: `scripts/wf-eval.ts`
- Create: `src/writing-feedback/__tests__/eval-checks.test.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `buildDefaultWritingAssignment(courseId, assignmentId, title, instructions?)` from `default-rubric-profile.ts`; `approveRubricDraft(draft, actorId, date)` from `rubric-schema.ts`; `RubricWritingFeedbackEngine(llm?, retriever?)`; `WritingFeedbackMaterialRetriever`.
- Produces: `EVAL_FIXTURES: EvalFixture[]`, `buildEvalAssignment(): WritingAssignment`, `EVAL_LECTURE_NOTES`, `InMemoryMaterialRetriever`, `runEvalChecks(output: EvalRunOutput, fixture: EvalFixture): EvalCheckResult[]`. Later tasks do not change these signatures.

- [ ] **Step 1: Write the fixtures**

`src/writing-feedback/__tests__/fixtures/eval/eval-fixtures.ts`:

The spec's `dr-materials-covered` fixture is folded into `dr-partial-weak-definition`, which already needs the lecture notes and asserts a supported citation.

- [ ] **Step 2: Write the synthetic materials and in-memory retriever**

`src/writing-feedback/__tests__/fixtures/eval/eval-materials.ts`:

- [ ] **Step 3: Write the failing check tests**

`src/writing-feedback/__tests__/eval-checks.test.ts`:

- [ ] **Step 4: Run it to verify it fails**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/eval-checks.test.ts`
Expected: FAIL with `Cannot find module '../eval-checks'`.

- [ ] **Step 5: Implement the checks**

`src/writing-feedback/eval-checks.ts`:

- [ ] **Step 6: Run the tests to verify they pass**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/eval-checks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the runner**

`scripts/wf-eval.ts`:

Check `dotenv` is a dependency first (`grep '"dotenv"' package.json`). If it is not, drop the `import 'dotenv/config'` line and document exporting the variables in the shell instead.

- [ ] **Step 8: Wire the npm script and ignore reports**

In `package.json` `scripts`, after `"prompts:export-samples"`, add:

```json
"wf:eval": "ts-node --transpile-only scripts/wf-eval.ts",
```

Append to `.gitignore`:

```
eval-reports/
```

- [ ] **Step 9: Run the baseline**

Run (background, needs the user's LLM env): `npm run wf:eval -- --runs 2`
Expected: the command completes and prints a PASS/FAIL line per fixture and run. Most new-behaviour checks FAIL (mode, goalsHaveAction, citationsSupported) because the current prompts lack those fields. Save the report path. If the user's model env is unavailable, stop and ask them to run it, because the baseline comes before any prompt change.

- [ ] **Step 10: Type-check and commit**

Run (background): `npx tsc --noEmit -p tsconfig.json`. Expected: no errors. The `scripts/` file is outside `tsconfig` include, so also run `npx ts-node --transpile-only -e "require('./scripts/wf-eval.ts')" --help` only if the user wants a smoke check; otherwise Step 9 already exercised it.

```bash
git add src/writing-feedback/eval-checks.ts src/writing-feedback/__tests__/eval-checks.test.ts src/writing-feedback/__tests__/fixtures/eval scripts/wf-eval.ts package.json .gitignore
git commit -m "test: add writing feedback live eval harness"
```

---

## Phase 1 — Contracts, diagnosis, grounding, engine

### Task 2: Contracts and the feedback gate

**Files:**
- Modify: `src/writing-feedback/contracts.ts`
- Modify: `public/scripts/feature/writing-feedback-shared.ts`
- Create: `src/writing-feedback/feedback-gate.ts`
- Test: `src/writing-feedback/__tests__/feedback-gate.test.ts`

**Interfaces:**
- Produces (contracts): `RealizedGenre`, `REALIZED_GENRES`, `FeedbackMode`, `TextDiagnosisStage`, `TextDiagnosis`, `GlobalRevision`, `MaterialCoverageRow`, `MaterialCoverage`, `RetrievalNeedKind`; new optional fields `RubricEvidence.supportingExcerptId`, `RevisionGoal.action`, `RevisionGoal.guidedQuestion?`, `WritingFeedbackResult.gateDecision?`, `WritingFeedbackResult.globalRevision?`, `AnchoredComment.heldBack?`, `StaffReviewRevision.modeOverride?`, `StaffSummaryEdit.globalRevision?`, `CourseMaterialExcerpt.id?`, `WritingFeedbackRun`/`WritingFeedbackRunTrace` trace fields, `WritingAssignment.materialCoverage?`.
- Produces (gate): `resolveGateDecision(diagnosis: TextDiagnosis, profile: WritingSflContextProfile): FeedbackMode`, `effectiveMode(gateDecision?: FeedbackMode, modeOverride?: FeedbackMode): FeedbackMode`, `studentFacingComments<T extends { heldBack?: boolean }>(comments: T[], mode: FeedbackMode): T[]`.

- [ ] **Step 1: Write the failing gate tests**

`src/writing-feedback/__tests__/feedback-gate.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/feedback-gate.test.ts`
Expected: FAIL with `Cannot find module '../feedback-gate'`.

- [ ] **Step 3: Add the contracts**

In `src/writing-feedback/contracts.ts`:

1. Directly after `WritingSflContextProfile` (ends near line 113), add:

2. In `RubricEvidence`, after `courseMaterialMention?`, add:

```ts
    /** Excerpt judged to support this passage's finding; the only basis for a citation on new runs. */
    supportingExcerptId?: string;
```

3. Replace `RevisionGoal` with:

4. In `WritingFeedbackResult`, after `internalFlags`, add:

5. In `CourseMaterialExcerpt`, add as the first field:

```ts
    /** Run-scoped excerpt identity that citations and relevance verdicts refer to. Absent on old runs. */
    id?: string;
```

6. In `WritingFeedbackRun`, after `courseMaterialExcerpts?`, add:

and add the same seven fields to `WritingFeedbackRunTrace`.

7. In `AnchoredComment`, after `priority?`, add:

8. In `StaffSummaryEdit`, after `revisionGoalsText?`, add:

```ts
    /** Staff edits of the global rewrite block (writing lens only). */
    globalRevision?: Pick<GlobalRevision, 'diagnosisStatement' | 'whatToKeep' | 'rewriteDirection'>;
```

9. In `StaffReviewRevision`, after `summaryEdits?`, add:

```ts
    /** Staff override of the gate decision; the effective mode is `modeOverride ?? run.gateDecision`. */
    modeOverride?: FeedbackMode;
```

10. In `WritingAssignment` (search `export interface WritingAssignment`), add:

```ts
    /** Cached course-material coverage for the approved writing rubric; staff-only. */
    materialCoverage?: MaterialCoverage;
```

Search the backend for `guidedQuestion` uses (`grep -rn "guidedQuestion" src --include=*.ts | grep -v __tests__`). Each reader must now tolerate `undefined`: in `report-generation/writing-feedback-report.ts:330`, render the `Ask yourself:` line only when `goal.guidedQuestion` is set (Task 10 finishes this renderer).

- [ ] **Step 4: Mirror the browser types**

In `public/scripts/feature/writing-feedback-shared.ts`, add these types (copy-paste; browser dates are strings):

Then:
- In `FeedbackRun.result`, change the `revisionGoals` element type to `{ skillTag: string; goal: string; action?: string; guidedQuestion?: string }` and add `gateDecision?: FeedbackMode; globalRevision?: GlobalRevision;`.
- On `FeedbackRun` add `textDiagnosis?: TextDiagnosis; gateDecision?: FeedbackMode; flags?: string[]; supportedExcerptIds?: string[];`.
- On `AnchoredComment` add `heldBack?: boolean;`.
- On `StaffSummaryEdit` add `globalRevision?: { diagnosisStatement: string; whatToKeep: string[]; rewriteDirection: string };`.
- Find the browser's review-revision type (`grep -n "summaryEdits" public/scripts/feature/writing-feedback-shared.ts`) and add `modeOverride?: FeedbackMode;` beside `summaryEdits`.
- In the browser's evidence type (`grep -n "courseMaterialMention" public/scripts/feature/writing-feedback-shared.ts`), add `supportingExcerptId?: string;`.

`seedSummaryText` in `public/scripts/feature/writing-feedback-summary-editor.ts:44` must accept the optional question: change its parameter to `Array<{ goal: string; action?: string; guidedQuestion?: string }>` and its map body to:

- [ ] **Step 5: Implement the gate**

`src/writing-feedback/feedback-gate.ts`:

- [ ] **Step 6: Run the gate tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/feedback-gate.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Type-check both builds**

Run (background): `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p public/tsconfig.json`
Expected: no errors. If a `guidedQuestion` reader now errors because the field is optional, fix it at the reader by treating it as optional; do not make the field required again.

- [ ] **Step 8: Commit**

```bash
git add src/writing-feedback/contracts.ts src/writing-feedback/feedback-gate.ts src/writing-feedback/__tests__/feedback-gate.test.ts public/scripts/feature/writing-feedback-shared.ts public/scripts/feature/writing-feedback-summary-editor.ts src/report-generation/writing-feedback-report.ts
git commit -m "feat: add writing feedback gate and diagnosis contracts"
```

### Task 3: Text diagnosis schema, prompt and validation

**Files:**
- Create: `src/writing-feedback/text-diagnosis.ts`
- Modify: `src/writing-feedback/sfl-foundation.ts` (version constant)
- Test: `src/writing-feedback/__tests__/text-diagnosis.test.ts`

**Interfaces:**
- Consumes: `TextDiagnosis`, `REALIZED_GENRES`, `WritingAssignment`, `WritingSflContextProfile`, `CourseMaterialExcerpt`; `createQuoteRelocator(verifiedText): (quote: string) => string | undefined` and `MAX_EVIDENCE_QUOTE_LENGTH` from `feedback-schema.ts`; `stripNulls`.
- Produces: `textDiagnosisSchema`, `TEXT_DIAGNOSIS_FAILED_MESSAGE`, `buildTextDiagnosisSystemPrompt(assignment, genreExcerpts: CourseMaterialExcerpt[]): string`, `validateTextDiagnosis(raw: unknown, verifiedText: string, profile: WritingSflContextProfile): TextDiagnosis`, `deterministicTextDiagnosis(profile, verifiedText): TextDiagnosis`, and `TEXT_DIAGNOSIS_PROMPT_VERSION = 'text-diagnosis-v1.0.0'` in `sfl-foundation.ts`.

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/text-diagnosis.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/text-diagnosis.test.ts`
Expected: FAIL with `Cannot find module '../text-diagnosis'`.

- [ ] **Step 3: Add the version constant**

In `src/writing-feedback/sfl-foundation.ts`, after `SFL_WRITER_PROMPT_VERSION` (line 27):

```ts
/** Whole-text diagnosis prompt contract version (recorded in every run trace). */
export const TEXT_DIAGNOSIS_PROMPT_VERSION = 'text-diagnosis-v1.0.0';
```

- [ ] **Step 4: Implement the diagnosis module**

`src/writing-feedback/text-diagnosis.ts`:

- [ ] **Step 5: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/text-diagnosis.test.ts`
Expected: PASS, 9 tests. If `createQuoteRelocator` does not collapse doubled spaces, change the drift test's input to whatever cosmetic difference `feedback-schema.test.ts` already shows it repairing (read that test first). The behaviour pinned is that repairable drift is repaired, not a specific drift shape.

- [ ] **Step 6: Commit**

```bash
git add src/writing-feedback/text-diagnosis.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/__tests__/text-diagnosis.test.ts
git commit -m "feat: add writing feedback whole-text diagnosis"
```

### Task 4: Need-based retrieval

**Files:**
- Modify: `src/writing-feedback/course-material-mentions.ts`
- Test: `src/writing-feedback/__tests__/course-material-needs.test.ts`
- Modify: `src/writing-feedback/__tests__/course-material-grounding.test.ts` (only where it asserts the removed run-level query)

**Interfaces:**
- Consumes: `WritingAssignment`, `SflAnalysis`, `SflFinding`, `RealizedGenre`, `RetrievalNeedKind`, `CourseMaterialExcerpt`, `CourseMaterialMention`; existing `mentionFromChunk`, `findingClusterKey`, `WritingFeedbackMaterialRetriever`, `SFL_RULES_BY_ID`.
- Produces:
  - `interface RetrievalNeed { id: string; kind: RetrievalNeedKind; label: string; query: string; clusterKey?: string; stageId?: string }`
  - `interface GroundingExcerpt { id: string; text: string; needIds: string[]; score: number; published: boolean; mention?: CourseMaterialMention }`
  - `interface NeedRetrieval { excerpts: GroundingExcerpt[]; failed: boolean }`
  - `buildGenreNeeds(assignment): RetrievalNeed[]`
  - `buildContrastNeed(realizedGenre: RealizedGenre, targetGenreId?: string): RetrievalNeed | null`
  - `buildFindingNeeds(assignment, analysis): RetrievalNeed[]`
  - `retrieveForNeeds(assignment, needs, options: { retriever?: WritingFeedbackMaterialRetriever; budgetChars: number; idPrefix: string }): Promise<NeedRetrieval>`
  - `toExcerpts(excerpts: GroundingExcerpt[]): CourseMaterialExcerpt[]` (id, mentionId when published, text)
  - Constants `GENRE_EXCERPT_BUDGET_CHARS = 4000`, `FINDING_EXCERPT_BUDGET_CHARS = 4000`, `MAX_GENRE_QUERIES = 14`, `RULE_QUERY_TERMS`, `LANGUAGE_FUNCTION_QUERIES`, `CONTRAST_PHRASES`.
- Removes: `buildWritingFeedbackRetrievalQuery`, `resolveCourseMaterialGrounding` and `CourseMaterialGrounding`, but only in Task 8, when the engine stops calling them. Leave them in place in this task.

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/course-material-needs.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/course-material-needs.test.ts`
Expected: FAIL, `buildGenreNeeds` is not exported.

- [ ] **Step 3: Implement need builders and retrieval**

Append to `src/writing-feedback/course-material-mentions.ts` (below `resolveCourseMaterialGrounding`), adding `RealizedGenre` and `RetrievalNeedKind` to the contracts import:

If `RETRIEVAL_LIMIT`, `RETRIEVAL_SCORE_THRESHOLD` or `MAX_EXCERPT_CHARS` sit below this code as `const`, they're already in scope (module-level). `RagWritingFeedbackMaterialRetriever` and `mentionFromChunk` are module-private and in scope.

- [ ] **Step 4: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/course-material-needs.test.ts src/writing-feedback/__tests__/course-material-grounding.test.ts`
Expected: PASS for both. The old grounding tests still pass because the old functions remain until Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/writing-feedback/course-material-mentions.ts src/writing-feedback/__tests__/course-material-needs.test.ts
git commit -m "feat: add need-based course material retrieval"
```

### Task 5: Material relevance check

**Files:**
- Create: `src/writing-feedback/material-relevance.ts`
- Modify: `src/writing-feedback/sfl-foundation.ts` (version constant)
- Test: `src/writing-feedback/__tests__/material-relevance.test.ts`

**Interfaces:**
- Consumes: `RetrievalNeed`, `GroundingExcerpt` (Task 4); `LLMModule`, `LLMOptions`, `Message` from `ubc-genai-toolkit-llm`.
- Produces:
  - `MATERIAL_RELEVANCE_PROMPT_VERSION = 'material-relevance-v1.0.0'` (in `sfl-foundation.ts`)
  - `type RelevanceVerdict = 'supports' | 'related' | 'irrelevant'`
  - `interface RelevancePair { pairId: string; needId: string; needLabel: string; excerptId: string; excerptText: string }`
  - `interface RelevanceOutcome { verdicts: Map<string, RelevanceVerdict>; failed: boolean }`
  - `buildRelevancePairs(needs: RetrievalNeed[], excerpts: GroundingExcerpt[]): RelevancePair[]` (cap `MAX_RELEVANCE_PAIRS = 60`)
  - `judgeRelevance(llm: LLMModule | undefined, pairs: RelevancePair[], llmCallOptions?: LLMOptions): Promise<RelevanceOutcome>`
  - `supportedByNeed(pairs: RelevancePair[], outcome: RelevanceOutcome): Map<string, Set<string>>` (needId → excerpt ids)

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/material-relevance.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-relevance.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Add the version constant**

In `sfl-foundation.ts`, after `TEXT_DIAGNOSIS_PROMPT_VERSION`:

```ts
/** Course-material relevance prompt contract version. */
export const MATERIAL_RELEVANCE_PROMPT_VERSION = 'material-relevance-v1.0.0';
```

- [ ] **Step 4: Implement**

`src/writing-feedback/material-relevance.ts`:

- [ ] **Step 5: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-relevance.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/writing-feedback/material-relevance.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/__tests__/material-relevance.test.ts
git commit -m "feat: add course material relevance check"
```

### Task 6: Coverage rows and material fingerprint

**Files:**
- Create: `src/writing-feedback/material-coverage.ts`
- Test: `src/writing-feedback/__tests__/material-coverage.test.ts`

**Interfaces:**
- Consumes: `RetrievalNeed`, `GroundingExcerpt`, `MaterialCoverageRow`, `MaterialCoverage`, the course type returned by `EngEAI_MongoDB.getActiveCourse` (`topicOrWeekInstances[].published`, `.items[].id`, `.updatedAt`, `.additionalMaterials[]`).
- Produces: `buildCoverageRows(needs, excerpts, supported: Map<string, Set<string>>): MaterialCoverageRow[]`, `courseMaterialFingerprint(course): string`, `isCoverageCurrent(coverage: MaterialCoverage | undefined, rubricVersion: number, fingerprint: string): boolean`.

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/material-coverage.test.ts`:

The fingerprint ignores unpublished topics because coverage lists only published, citable material. Grounding may still read unpublished text, but a draft upload does not change what staff see as covered.

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-coverage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/writing-feedback/material-coverage.ts`:

- [ ] **Step 4: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-coverage.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/writing-feedback/material-coverage.ts src/writing-feedback/__tests__/material-coverage.test.ts
git commit -m "feat: add course material coverage rows"
```

### Task 7: Writer schema, citation validation and strengths guard

**Files:**
- Modify: `src/writing-feedback/feedback-schema.ts`
- Modify: `src/writing-feedback/summary-redraft-engine.ts`
- Modify: `src/writing-feedback/technical-feedback-engine.ts` (deterministic goal only)
- Test: `src/writing-feedback/__tests__/writer-guards.test.ts`
- Modify: `src/writing-feedback/__tests__/feedback-schema.test.ts`, `src/writing-feedback/__tests__/summary-redraft-engine.test.ts` where fixtures build goals without `action`

**Interfaces:**
- Consumes: `TextDiagnosis`, `WritingFeedbackResult`, `CourseMaterialMention`, `GroundingExcerpt`.
- Produces:
  - `buildFeedbackSchema(rubric)` now requires `evidence[].supportingExcerptId` (nullish), `revisionGoals[].action` (min 1), `revisionGoals[].guidedQuestion` (nullish), and `globalRevision` (required object).
  - `buildSummaryRedraftSchema(rubric)` requires `action`, `guidedQuestion` nullish.
  - `applyExcerptCitations(result, allowedByFinding: Map<string, Set<string>>, excerptsById: Map<string, GroundingExcerpt>): number` returns how many citations were dropped. For each evidence item, it keeps `supportingExcerptId` only if the id is allowed for one of the item's `sflFindingIds` and that excerpt has a published mention. It then sets `courseMaterialMention` from that excerpt, or deletes both fields otherwise.
  - `applyGlobalExcerptCitations(result, allowed: Set<string>, excerptsById): void` filters `globalRevision.supportingExcerptIds`.
  - `guardStrengths(result, diagnosis: TextDiagnosis, mode: FeedbackMode): string[]` mutates `result.strengths` and returns staff flag strings. It drops strengths overlapping a contradicting quote. In global mode it drops strengths that match none of the transferable strengths, falling back to the transferable strength texts when nothing survives.
  - `STRENGTH_DROPPED_FLAG = 'A strength was removed because it praised language that contradicts the target genre.'`

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/writer-guards.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/writer-guards.test.ts`
Expected: FAIL, `applyExcerptCitations` is not exported.

- [ ] **Step 3: Change the schemas**

In `src/writing-feedback/feedback-schema.ts`:

In `evidenceSchema`, after `courseMaterialMention`, add:

```ts
    supportingExcerptId: z.string().trim().min(1).max(40).nullish(),
```

Replace `revisionGoalSchema` with:

In `buildFeedbackSchema`'s object, after `courseMaterialMentions`, add:

```ts
        // Always produced, so staff can flip the mode without regenerating.
        globalRevision: globalRevisionSchema,
```

In `buildSummaryRedraftSchema`, replace its inline goal object with `revisionGoalSchema`. The redraft does not produce `globalRevision`: in global mode the staff-edited global block is the summary, so redraft stays standard-only. Task 12 enforces that.

- [ ] **Step 4: Add the guards**

Append to `feedback-schema.ts` (add `TextDiagnosis`, `FeedbackMode`, `CourseMaterialMention` to the contracts import and `import type { GroundingExcerpt } from './course-material-mentions';`):

- [ ] **Step 5: Update deterministic goals and the redraft prompt**

- `feedback-engine.ts` `deterministicFeedback` goal (line ~191): add `action: \`Revise the passage that most affects ${criterion.label}.\`,` and keep `guidedQuestion`. Also add to the returned object: `globalRevision: { diagnosisStatement: 'The draft needs staff review against the approved genre profile.', whatToKeep: [], rewriteDirection: 'Revise the draft so each stage in the profile does its purpose.' },`. `gateDecision` is set by the engine in Task 8.
- `technical-feedback-engine.ts:113`: add `action: \`Revise the part of the report that most affects ${criterion.label.toLowerCase()}.\`,` beside `guidedQuestion`. If the technical schema reuses `revisionGoalSchema`, it now requires `action`: update `technical-feedback-engine.ts`'s prompt line about revision goals to "Each revision goal has a concrete action and, only when it helps, a guidedQuestion."
- `summary-redraft-engine.ts:53`: replace the line with `'Return one to three revision goals. Each has a goal, a concrete action the student can take, and, only when it genuinely helps the student think, a guidedQuestion.',`. At line 140, add `action: 'Start with the annotated passage that matters most.',` to the fallback goal.

- [ ] **Step 6: Fix existing fixtures that build goals without `action`**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback src/report-generation src/routes`
Expected: only failures whose message involves `action`, `globalRevision` or `guidedQuestion` in schema parsing. For each, add `action: '<short step>'` to the fixture goal and, where the fixture feeds `buildFeedbackSchema`, a `globalRevision` object. Leave `engine-level` expectations that depend on `attachPerFindingMentions` for Task 8.

- [ ] **Step 7: Run the guard tests and the schema suite**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/writer-guards.test.ts src/writing-feedback/__tests__/feedback-schema.test.ts src/writing-feedback/__tests__/summary-redraft-engine.test.ts src/writing-feedback/__tests__/technical-feedback-engine.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/writing-feedback/feedback-schema.ts src/writing-feedback/summary-redraft-engine.ts src/writing-feedback/technical-feedback-engine.ts src/writing-feedback/feedback-engine.ts src/writing-feedback/__tests__
git commit -m "feat: require actions and evidence-backed citations in feedback"
```

### Task 8: Four-call engine pipeline

**Files:**
- Modify: `src/writing-feedback/feedback-engine.ts`
- Modify: `src/writing-feedback/course-material-mentions.ts` (remove the old grounding API once unused)
- Modify: `src/writing-feedback/__tests__/feedback-engine.test.ts`, `src/writing-feedback/__tests__/course-material-grounding.test.ts`
- Test: `src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: `RubricWritingFeedbackEngine.generate` returns a result with `gateDecision` and `globalRevision` set, plus a `runTrace` containing `textDiagnosis`, `gateDecision`, `courseMaterialExcerpts` (finding pass, with ids), `contrastExcerpts`, `supportedExcerptIds`, `flags`, `diagnosisPromptVersion`, `relevancePromptVersion`, `courseMaterialMentions`, `staffCourseMaterialMentions` and `citableCourseMaterialMentionIds`. The engine also exposes `computeGenreGrounding(assignment, llmCallOptions?)`, used by Task 12 for coverage.
- Structured output names, in call order: `text_diagnosis`, `material_relevance` (genre pass), `sfl_analysis`, `material_relevance` (finding pass), `writing_feedback_v2`. The two relevance passes are separate calls, which keeps each small.

- [ ] **Step 1: Write the failing pipeline tests**

`src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`
Expected: FAIL. The first call is `sfl_analysis`, not `text_diagnosis`.

- [ ] **Step 3: Rewrite `generate`**

In `src/writing-feedback/feedback-engine.ts`:

1. Update imports: add from `./text-diagnosis` (`buildTextDiagnosisSystemPrompt`, `deterministicTextDiagnosis`, `textDiagnosisSchema`, `validateTextDiagnosis`, `TEXT_DIAGNOSIS_FAILED_MESSAGE`); from `./feedback-gate` (`resolveGateDecision`); from `./course-material-mentions` (`buildGenreNeeds`, `buildContrastNeed`, `buildFindingNeeds`, `retrieveForNeeds`, `toExcerpts`, `findingClusterKey`, `GENRE_EXCERPT_BUDGET_CHARS`, `FINDING_EXCERPT_BUDGET_CHARS`, `WRITING_FEEDBACK_COURSE_SOURCE_VERSION`, types `GroundingExcerpt`, `RetrievalNeed`, `NeedRetrieval`, `WritingFeedbackMaterialRetriever`); from `./material-relevance` (`buildRelevancePairs`, `judgeRelevance`, `supportedByNeed`); from `./feedback-schema` (`applyExcerptCitations`, `applyGlobalExcerptCitations`, `guardStrengths`); from `./sfl-foundation` (`TEXT_DIAGNOSIS_PROMPT_VERSION`, `MATERIAL_RELEVANCE_PROMPT_VERSION`); and types `FeedbackMode`, `TextDiagnosis` from `./contracts`. Remove the imports of `resolveCourseMaterialGrounding` and `CourseMaterialGrounding`.

2. Delete `attachPerFindingMentions` and `validateWriterReferences`. Citation validity is now `applyExcerptCitations`. Keep the finding-id check from `validateWriterReferences` as a small function:

The message is the one `validateWriterReferences` used, so `SAFE_TO_LOG_MESSAGES` in `writing-feedback-service.ts` still recognizes it. Add `TEXT_DIAGNOSIS_FAILED_MESSAGE`'s text to `SAFE_TO_LOG_MESSAGES` (line ~99), and remove `'Feedback referenced a course material outside the retrieval allowlist'` from it, because nothing throws that message any more.

3. Add a genre-grounding helper on the class. It is also used for coverage:

4. Replace the body of `generate` after the three gate checks at its top (blank text, approved rubric, complete profile) with:

and add a module-level helper:

`staffCourseMaterialMentions` keeps listing unpublished material through `GroundingExcerpt.staffMention` (Task 4), so the staff panel's "unpublished" rows still work.

5. Change `deterministicFeedback` to the new signature `(assignment, text, analysis, allowedByFinding: Map<string, Set<string>>, excerpts: GroundingExcerpt[])`. Replace its mention block with:

and remove its `courseMaterialMentions` line. Step 8's shared post-processing sets both. Delete the old separate mock branch at the top of `generate`, since the new body handles mock mode throughout.

6. Remove `resolveCourseMaterialGrounding`, `CourseMaterialGrounding`, `buildWritingFeedbackRetrievalQuery`, `buildFindingRetrievalQuery`, `uniqueMentions`, `buildExcerpts`, `STUDENT_MENTION_LIMIT` and `EXCERPT_BUDGET_CHARS` from `course-material-mentions.ts` if nothing else imports them (`grep -rn "<name>" src --include=*.ts`). In `course-material-grounding.test.ts`, delete tests of removed functions. Keep and adapt any test that pins "no student text in queries" to the new builders; Task 4 already pins that, so duplicates can go.

7. Update `feedback-engine.test.ts`:
- Every fake `sendStructuredConversation` must answer `text_diagnosis` (a `fits` diagnosis over the test's profile stages) and `material_relevance` (all `supports`), exactly as in the pipeline test's `fakeLlm`.
- Change `toHaveBeenCalledTimes(2)` to count the calls actually made (diagnosis, two relevance passes, analyzer, writer = 5, or 4 when no excerpts were retrieved in a pass, since `judgeRelevance` returns early with no pairs), asserting names in order instead of the raw count.
- Delete `cites material found for any linked finding, not only the first`. The auto-attach it pinned is removed by design; the pipeline test's citation case replaces it.
- Update the `writerPromptVersion` assertion to the new version constant (Task 9 bumps it; import it instead of hardcoding).

- [ ] **Step 4: Run the engine suites**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts src/writing-feedback/__tests__/course-material-grounding.test.ts src/writing-feedback/__tests__/course-material-needs.test.ts`
Expected: PASS. `buildSflAnalyzerSystemPrompt(assignment, excerpts)` and `buildWritingFeedbackSystemPrompt(assignment, mode)` gain parameters here. Give the new parameters defaults (`excerpts: CourseMaterialExcerpt[] = []`, `mode: FeedbackMode = 'standard'`) so existing callers compile. Task 9 rewrites the bodies.

- [ ] **Step 5: Run the wider Writing Feedback suite**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback src/report-generation src/routes`
Expected: PASS apart from failures that pre-date this plan. Compare against `git stash`-free evidence: run the same command on `HEAD` in a scratch worktree if a failure's origin is unclear, and record the inherited failures in the task report.

- [ ] **Step 6: Commit**

```bash
git add src/writing-feedback/feedback-engine.ts src/writing-feedback/course-material-mentions.ts src/writing-feedback/__tests__
git commit -m "feat: diagnose and gate before local writing feedback"
```

### Task 9: Prompt rewrite and worked examples

**Files:**
- Create: `src/writing-feedback/prompt-examples.ts`
- Modify: `src/writing-feedback/sfl-foundation.ts`
- Modify: `src/writing-feedback/feedback-engine.ts` (`buildSflAnalyzerSystemPrompt`, `buildWritingFeedbackSystemPrompt`)
- Test: `src/writing-feedback/__tests__/prompt-contract.test.ts`

**Interfaces:**
- Consumes: `FeedbackMode`, `CourseMaterialExcerpt`, `WritingAssignment`.
- Produces: `SFL_ANALYZER_PROMPT_VERSION = 'sfl-analyzer-v3.0.0'`, `SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v3.0.0'`, `PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.0.0'`, `ANALYZER_EXAMPLES: string`, `WRITER_STANDARD_EXAMPLES: string`, `WRITER_GLOBAL_EXAMPLE: string`, `EXPECTEDNESS_LEGEND: Record<'O' | 'E' | 'P' | 'R', string>`.

- [ ] **Step 1: Write the failing prompt-contract tests**

`src/writing-feedback/__tests__/prompt-contract.test.ts`:

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/prompt-contract.test.ts`
Expected: FAIL. `expectednessLegend` is undefined.

- [ ] **Step 3: Update the foundation resource**

In `sfl-foundation.ts`:

- Change `SFL_ANALYZER_PROMPT_VERSION` to `'sfl-analyzer-v3.0.0'` and `SFL_WRITER_PROMPT_VERSION` to `'sfl-feedback-writer-v3.0.0'`.
- Add:

- In `sflFoundationPromptResource`, drop `gates` from each rule, add `expectednessLegend: EXPECTEDNESS_LEGEND`, and add a `globalRules` entry: `'Analyze Theme at clause level for every full clause; abstain only for fragments.'`. The `gates` stay on `SFL_FERREIRA_RULES`; only the prompt payload changes.

- [ ] **Step 4: Write the worked examples**

`src/writing-feedback/prompt-examples.ts`:

- [ ] **Step 5: Rewrite the analyzer prompt**

Replace `buildSflAnalyzerSystemPrompt` with:

- [ ] **Step 6: Rewrite the writer prompt**

Replace `buildWritingFeedbackSystemPrompt` with a function taking `(assignment, mode: FeedbackMode = 'standard')`. Keep the existing `<approved_rubric>` serialization block verbatim (the `criteria`/`ratings`/`levels` mapping). Replace everything before it with:

Merge carefully: the last element must be the **existing** `<approved_rubric …>${JSON.stringify({...})}</approved_rubric>` template literal, copied from the current function unchanged. The comment placeholder above only marks where it goes; do not ship it. Import `ANALYZER_EXAMPLES`, `WRITER_STANDARD_EXAMPLES` and `WRITER_GLOBAL_EXAMPLE` from `./prompt-examples`.

- [ ] **Step 7: Run the prompt, engine and existing prompt tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts src/writing-feedback/__tests__/structured-output-schema.test.ts`
Expected: PASS. Existing assertions on exact old prompt sentences (for example `"Three is a ceiling, not a target."`) either still match (keep the wording where the new prompt says the same thing) or are updated to the new sentence. Never delete an assertion that pins an invariant: exact quotes, no rewrites, no confidence in prose, no scope-limit prose.

- [ ] **Step 8: Commit**

```bash
git add src/writing-feedback/prompt-examples.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/feedback-engine.ts src/writing-feedback/__tests__
git commit -m "feat: rewrite writing feedback prompts around method and pedagogy"
```

---

## Phase 2 — Review state, student output, coverage API

### Task 10: Held-back seeds, mode override and global edits in the revision

**Files:**
- Modify: `src/writing-feedback/anchored-comments.ts`
- Modify: `src/writing-feedback/summary-edits.ts`
- Modify: `src/routes/route-writing-feedback.ts` (revision POST at line ~1103)
- Modify: `src/writing-feedback/writing-feedback-service.ts` (`appendReview`, `detail`)
- Modify: `src/migrate/schemas.ts` if the review/run field specs enumerate keys (check `writingSubmissionSchema` or the reviews spec)
- Test: `src/writing-feedback/__tests__/held-back-review.test.ts`

**Interfaces:**
- Consumes: `FeedbackMode`, `effectiveMode`, `studentFacingComments`.
- Produces:
  - `seedCommentsFromRun` sets `heldBack: true` on every seed when `run.gateDecision === 'global_revision'` (or `run.result.gateDecision`).
  - `anchoredCommentInputSchema` accepts `heldBack: z.boolean().optional()`.
  - `summaryEditsInputSchema` accepts `globalRevision: { diagnosisStatement (1..1500), whatToKeep (0..3 × 1..300), rewriteDirection (1..1500) }` optionally, linguistic lens only (refine).
  - The revision route accepts `modeOverride: 'standard' | 'global_revision'` (400 on any other value). `appendReview` persists it.
  - `latestModeOverride(submission): FeedbackMode | undefined` in `writing-feedback-service.ts` returns the newest review's `modeOverride` since the last text edit.

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/held-back-review.test.ts`:

Also add route-contract cases to the existing `src/routes/__tests__/writing-feedback-lens-routes-contract.test.ts`, following its existing request pattern (read the file first; it shows how it mocks the service and session). Add two tests: a POST to `/reviews` with `modeOverride: 'global_revision'` reaches `appendReview` with that field, and `modeOverride: 'sometimes'` returns 400 with the error `modeOverride must be standard or global_revision`.

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/held-back-review.test.ts src/routes/__tests__/writing-feedback-lens-routes-contract.test.ts`
Expected: FAIL. `heldBack` is stripped by the schema and seeds carry no `heldBack`.

- [ ] **Step 3: Implement**

- `anchored-comments.ts` `anchoredCommentInputSchema`: after `priority`, add `heldBack: z.boolean().optional()`.
- `seedCommentsFromRun`: before the loop, add

```ts
    // A rewrite-mode run holds its local annotations back from the student until staff
    // release them or switch the submission to standard feedback.
    const heldBack = (run.gateDecision ?? run.result.gateDecision) === 'global_revision';
```

and in the pushed seed object add `...(heldBack ? { heldBack: true } : {})`.

- `summary-edits.ts`: add to the element object `globalRevision: z.object({ diagnosisStatement: z.string().trim().min(1).max(1500), whatToKeep: z.array(z.string().trim().min(1).max(300)).max(3), rewriteDirection: z.string().trim().min(1).max(1500) }).optional()`, and chain `.refine((edit) => !edit.globalRevision || edit.lens === 'linguistic', { message: 'Only the writing lens has a rewrite summary', path: ['globalRevision'] })` on the element object (before `z.array(...)`).

- Route (`route-writing-feedback.ts`, the reviews POST): after the `summaryEdits` block, add

and pass `modeOverride` into `appendReview`'s revision object.

- `writing-feedback-service.ts`: `appendReview`'s revision type already derives from `StaffReviewRevision`, so `modeOverride` flows into `reviewFields` and persists. Add:

Place it beside `reviewsSinceTextEdit` (it must be defined in or imported into the same module; `grep -n "function reviewsSinceTextEdit" src/writing-feedback/*.ts`). In `detail()`, include `modeOverride: latestModeOverride(submission)` in the returned payload and add `modeOverride?: FeedbackMode` to `SubmissionDetail` in both `contracts.ts` and the browser mirror.

A later revision without `modeOverride` keeps the earlier override, because `latestModeOverride` finds the newest review that set one. For "back to the gate's decision", staff send the explicit mode that matches the gate. The browser always sends the current toggle state (Task 14), so this never becomes ambiguous.

- [ ] **Step 4: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/held-back-review.test.ts src/routes/__tests__/writing-feedback-lens-routes-contract.test.ts src/writing-feedback/__tests__/anchored-comments.test.ts src/writing-feedback/__tests__/summary-edits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/writing-feedback/anchored-comments.ts src/writing-feedback/summary-edits.ts src/routes/route-writing-feedback.ts src/writing-feedback/writing-feedback-service.ts src/writing-feedback/contracts.ts public/scripts/feature/writing-feedback-shared.ts src/writing-feedback/__tests__/held-back-review.test.ts src/routes/__tests__/writing-feedback-lens-routes-contract.test.ts
git commit -m "feat: hold back local annotations in rewrite mode"
```

### Task 11: Mode-aware student PDF and release

**Files:**
- Modify: `src/report-generation/writing-feedback-report.ts`
- Modify: `src/writing-feedback/writing-feedback-service.ts` (`renderReleasePdf`, `buildStudentDocument`, staff PDF download path)
- Test: `src/report-generation/__tests__/writing-feedback-report-global.test.ts` (use whatever directory the existing report tests use; `grep -rln "StudentWritingFeedbackPdfService" src --include=*.test.ts`)
- Test: add cases to `src/writing-feedback/__tests__/writing-feedback-service.test.ts`

**Interfaces:**
- Consumes: `effectiveMode`, `studentFacingComments`, `latestModeOverride`, `GlobalRevision`, `StaffSummaryEdit.globalRevision`.
- Produces:
  - `StudentWritingFeedbackPdfService.render` input gains `mode?: FeedbackMode` and `globalRevision?: GlobalRevision`. With `mode === 'global_revision'` and a `globalRevision`, the writing general sections render: heading **"What to do next: rewrite"**, the diagnosis statement, **"Keep"** bullets, **"How to rewrite"** text, the single revision goal (with `Next step:` action), the staff-final grade block as today, and **"Useful readings"**. Criterion evidence sections are omitted. The annotated section receives only the comments passed in.
  - Revision goals render `Next step: {action}` when present and `Ask yourself: {question}` only when present.
  - Service helper `resolveStudentView(run, submission): { mode: FeedbackMode; globalRevision?: GlobalRevision; comments: AnchoredComment[] }` merges the latest `summaryEdits[].globalRevision` over `run.result.globalRevision` and filters comments with `studentFacingComments`.

- [ ] **Step 1: Write the failing tests**

Report test: render with `mode: 'global_revision'`, a `globalRevision`, criteria with evidence text `EVIDENCE-MARKER`, and one comment. Extract text by converting the PDF bytes with the same approach the existing report tests use (read one first; if they search raw PDF bytes for uncompressed text, do the same). Assert:
- the output contains `What to do next: rewrite`, the diagnosis statement and `How to rewrite`;
- it does not contain `EVIDENCE-MARKER`;
- a standard-mode render of the same input contains `EVIDENCE-MARKER` and not `What to do next: rewrite`;
- a goal without `guidedQuestion` renders no `Ask yourself:` line, and one with `action` renders `Next step:`.

Service tests (in `writing-feedback-service.test.ts`, reusing its in-memory mongo fake):
- A submission whose run has `gateDecision: 'global_revision'` and whose latest revision's comments include one `heldBack: true` and one `heldBack: false` comment: the release preview's PDF renderer receives only the unheld comment, with `mode: 'global_revision'`. Spy on the PDF service's `render`, the same way existing release tests observe artifacts.
- The same with `modeOverride: 'standard'` on the latest revision: the renderer receives both comments and `mode: 'standard'`.
- A legacy run (no `gateDecision`) behaves as standard.
- `summaryEdits[0].globalRevision` from staff overrides the run's `globalRevision` in the renderer input.

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 <report test path> src/writing-feedback/__tests__/writing-feedback-service.test.ts`
Expected: FAIL. The renderer ignores `mode`.

- [ ] **Step 3: Implement the renderer changes**

In `writing-feedback-report.ts`:

- Add `mode?: FeedbackMode; globalRevision?: GlobalRevision;` to the `render` input type.
- In the writing branch, replace the `renderGeneralSections(...)` call with:

- Add, next to `renderGeneralSections`:

Use the helper names this file actually defines. Read `renderGeneralSections` (line ~191) and reuse its heading, paragraph, bullet and final-assessment helpers exactly. If revision-goal rendering is inline at line ~326, extract it into `renderRevisionGoals(doc, goals)` first, with this body:

Match the font constant names used at line ~326 exactly, and call it from both paths.

- [ ] **Step 4: Implement the service helper and wire it**

In `writing-feedback-service.ts`, add:

Then, in `renderReleasePdf` and the staff PDF download method (`grep -n "\.render({" src/writing-feedback/writing-feedback-service.ts`), take the writing-lens comments the call currently passes, run them through `resolveStudentView(feedbackRun, submission, comments)`, and pass `comments: view.comments, mode: view.mode, globalRevision: view.globalRevision`. Technical-lens comments are never filtered: the gate is linguistic-only.

Global mode leaves the Canvas rubric and grade release paths untouched. Only the PDF artifact changes.

- [ ] **Step 5: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/report-generation src/writing-feedback/__tests__/writing-feedback-service.test.ts src/writing-feedback/__tests__/live-canvas-release-service.test.ts src/writing-feedback/__tests__/canvas-release-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/report-generation/writing-feedback-report.ts src/writing-feedback/writing-feedback-service.ts src/report-generation src/writing-feedback/__tests__/writing-feedback-service.test.ts
git commit -m "feat: render rewrite feedback in the student pdf"
```

### Task 12: Coverage persistence, service and routes

**Files:**
- Modify: `src/db/mongo/writing-feedback-mongo.ts`, `src/db/enge-ai-mongodb.ts`
- Modify: `src/writing-feedback/writing-feedback-service.ts`
- Modify: `src/routes/route-writing-feedback.ts`
- Modify: `src/migrate/schemas.ts` (assignment field spec, if it enumerates keys)
- Modify: `documents/ENDPOINT_ARCHITECTURE.md`, `documents/MONGO_DATA_LAYER.md`
- Test: `src/writing-feedback/__tests__/material-coverage-service.test.ts`, plus route-contract cases

**Interfaces:**
- Consumes: `RubricWritingFeedbackEngine.computeGenreGrounding`, `buildCoverageRows`, `courseMaterialFingerprint`, `isCoverageCurrent`, `MaterialCoverage`.
- Produces:
  - Mongo: `setWritingAssignmentMaterialCoverage(ctx, courseId, assignmentId, coverage: MaterialCoverage): Promise<void>`, exposed as `EngEAI_MongoDB.setWritingAssignmentMaterialCoverage(courseId, assignmentId, coverage)`.
  - Service: `getMaterialCoverage(courseId, assignmentId): Promise<{ coverage: MaterialCoverage | null; current: boolean }>` and `recomputeMaterialCoverage(courseId, assignmentId, llmCallOptions?): Promise<MaterialCoverage>`.
  - Routes: `GET /api/courses/:courseId/writing-feedback/assignments/:assignmentId/material-coverage` → `{ success: true, data: { coverage, current } }`; `POST` on the same path → `{ success: true, data: coverage }`; 400 with `Approve the writing rubric before checking course-material coverage` when there is no approved linguistic rubric.

- [ ] **Step 1: Write the failing tests**

`src/writing-feedback/__tests__/material-coverage-service.test.ts`:

`requireAssignment` loads through `mongo.getWritingAssignment(courseId, assignmentId)`. If it uses a different accessor, name that one in the fake instead. `selectRubric(assignment, 'linguistic').approved` must return undefined for a `draft` rubric. If it reads another field (for example `approvedRubric`), set up the refusal case through that field. Check `rubric-lens.ts` first.

Route-contract cases: GET returns `{ coverage: null, current: false }` for an assignment with none; POST calls the service and returns 200 with the coverage.

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-coverage-service.test.ts`
Expected: FAIL. `recomputeMaterialCoverage` is not a function.

- [ ] **Step 3: Implement persistence**

In `writing-feedback-mongo.ts`, beside `getWritingAssignment`:

Check `normalizeWritingAssignment` passes unknown fields through. If it whitelists fields, add `materialCoverage`. Expose it in `enge-ai-mongodb.ts` with TSDoc, following `getWritingAssignment` at line 222:

```ts
    public setWritingAssignmentMaterialCoverage = async (courseId: string, assignmentId: string, coverage: MaterialCoverage) =>
        WritingFeedbackMongo.setWritingAssignmentMaterialCoverage(this.ctx(), courseId, assignmentId, coverage);
```

- [ ] **Step 4: Implement the service methods**

In `WritingFeedbackService`:

`this.engine` is typed as the `WritingFeedbackEngine` interface (`contracts.ts:899`). Add an optional method to it, with TSDoc: `computeGenreGrounding?(assignment: WritingAssignment, llmCallOptions?: LLMOptions): Promise<{ needs: unknown[]; retrieval: { excerpts: unknown[]; failed: boolean }; supported: Map<string, Set<string>>; relevanceFailed: boolean }>`. Type the service's use through the concrete `RetrievalNeed`/`GroundingExcerpt` types with a cast at one place. In `recomputeMaterialCoverage`, throw `'Course-material coverage is unavailable for this engine'` when the method is absent, and call `this.engine.computeGenreGrounding(...)` otherwise. How `llmCallOptions` are built for generation: reuse the same `ModelSelectionService` call `runLens`'s caller uses (`grep -n "buildFeatureLlmCallOptions" src/writing-feedback/writing-feedback-service.ts`).

- [ ] **Step 5: Implement the routes**

In `route-writing-feedback.ts`, near the `course-materials` route:

Model options must come from the course the same way generation gets them. If `recomputeMaterialCoverage` needs them, build them in the route with the same helper the generation route uses, and pass them in.

- [ ] **Step 6: Update the docs**

- `documents/ENDPOINT_ARCHITECTURE.md`: under Writing Feedback routes, document both coverage routes (auth: course staff; WF enabled; request/response shapes above) and the reviews POST's new `modeOverride` field and `comments[].heldBack` / `summaryEdits[].globalRevision` payload fields.
- `documents/MONGO_DATA_LAYER.md`: document `writing-assignments.materialCoverage`, the new run fields (`textDiagnosis`, `gateDecision`, `contrastExcerpts`, `supportedExcerptIds`, `flags`, `diagnosisPromptVersion`, `relevancePromptVersion`, excerpt `id`), `reviews[].modeOverride`, and `comments[].heldBack`. State that all are optional and that old documents read as standard mode.
- `src/migrate/schemas.ts`: if `mongo-attribute-check` would flag the new keys as unknown, add them as `optional: true` (runs: the new trace keys; assignments: `materialCoverage`). Check by running the attribute-check test suite (`grep -rln "mongo-attribute-check" src --include=*.test.ts`).

- [ ] **Step 7: Run the tests**

Run (background): `npx jest --maxWorkers=4 src/writing-feedback/__tests__/material-coverage-service.test.ts src/routes src/migrate src/db`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db src/writing-feedback/writing-feedback-service.ts src/routes/route-writing-feedback.ts src/migrate/schemas.ts documents/ENDPOINT_ARCHITECTURE.md documents/MONGO_DATA_LAYER.md src/writing-feedback/__tests__/material-coverage-service.test.ts src/routes/__tests__
git commit -m "feat: cache course material coverage per assignment"
```

---

## Phase 3 — Staff UI

Before editing any frontend file, read `.cursor/rules/frontend/` (CSS, accessibility, component rules) and follow them. The existing review CSS is where the new classes go. Find it with `grep -rln "wf-lens-tabs" public/styles`.

### Task 13: Rubric page — Required stages, notice, coverage panel

**Files:**
- Modify: `public/scripts/feature/writing-feedback-rubric.ts` (stage repeater lines ~444–546; the rubric page render)
- Modify: `src/writing-feedback/rubric-autofill.ts` (prompt line ~249)
- Modify: the Writing Feedback stylesheet that holds `.wf-` rubric styles
- Test: `src/writing-feedback/__tests__/writing-feedback-rubric-source.test.ts` (source guards), `public/scripts/feature/__tests__/writing-feedback-coverage-model.test.ts`
- Create: `public/scripts/feature/writing-feedback-coverage-model.ts`

**Interfaces:**
- Consumes: `MaterialCoverage`, `MaterialCoverageRow`, and the coverage routes from Task 12.
- Produces: `coverageRowViews(coverage: MaterialCoverage | null, current: boolean): { rows: Array<{ label: string; covered: boolean; detail: string }>; banner?: string }` and `shouldShowRequiredNotice(rubricId: string, rubricVersion: number, storage: Pick<Storage, 'getItem'>): boolean`.

- [ ] **Step 1: Write the failing model tests**

`public/scripts/feature/__tests__/writing-feedback-coverage-model.test.ts`:

Source guard, added to `writing-feedback-rubric-source.test.ts`:

(Use the variable name that file already uses for the rubric source.)

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 public/scripts/feature/__tests__/writing-feedback-coverage-model.test.ts src/writing-feedback/__tests__/writing-feedback-rubric-source.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the model**

`public/scripts/feature/writing-feedback-coverage-model.ts`:

- [ ] **Step 4: Implement the Required checkbox**

In `writing-feedback-rubric.ts` `renderStageRepeater` (line ~444), add to each stage row, after the purpose field, a labelled checkbox:

Adapt `stage`, `row`, `canEdit` and `onInput` to the names the function uses. A newly added empty stage row defaults to unchecked. In `readStageRepeaterRows` (line ~534), replace `required: true` with `required: (row.querySelector('[data-stage-required]') as HTMLInputElement | null)?.checked === true`.

The one-time notice: where the rubric page renders an approved rubric, if `shouldShowRequiredNotice(assignment.id, rubric.version, window.localStorage)`, render a dismissible notice above the stages: "Check which stages are required. Every stage was previously treated as required; a student who leaves out a required stage now gets rewrite feedback only." Dismissing sets `wf-required-notice:<id>:<version>` to `'1'` inside a try/catch.

- [ ] **Step 5: Implement the coverage panel**

Below the stage repeater on the rubric page (only when a writing rubric is approved), render a section titled **Course-material coverage**:
- Fetch `GET …/assignments/:assignmentId/material-coverage` using the page's existing fetch helper for WF routes.
- Render `coverageRowViews(data.coverage, data.current)`: an optional banner, then a list where each row is `✓` or `✗` (as text with an accessible label, "Covered" / "Not covered", not colour alone), the row label, and the detail.
- A **Recheck materials** button POSTs the same path, disables itself while running with the label "Checking…", and re-renders on success. On failure it shows the server's error in the page's existing inline error style.

Add styles next to the existing rubric page styles: `.wf-coverage`, `.wf-coverage-row`, `.wf-coverage-row--gap`, `.wf-stage-required`. Use existing colour tokens only.

- [ ] **Step 6: Autofill prompt**

In `rubric-autofill.ts` near line 249, add the prompt line: `'- Mark a stage required only when a text missing it could not count as this genre (for a descriptive report: the classification or composition stage and the general statement). Mark closings and optional moves as not required.'`

- [ ] **Step 7: Run tests and the frontend build check**

Run (background): `npx jest --maxWorkers=4 public/scripts/feature/__tests__/writing-feedback-coverage-model.test.ts src/writing-feedback/__tests__/writing-feedback-rubric-source.test.ts src/writing-feedback/__tests__/rubric-autofill.test.ts` and `npx tsc --noEmit -p public/tsconfig.json`
Expected: PASS and no type errors.

- [ ] **Step 8: Commit**

```bash
git add public/scripts/feature/writing-feedback-rubric.ts public/scripts/feature/writing-feedback-coverage-model.ts public/scripts/feature/__tests__/writing-feedback-coverage-model.test.ts src/writing-feedback/rubric-autofill.ts src/writing-feedback/__tests__/writing-feedback-rubric-source.test.ts public/styles
git commit -m "feat: let staff mark required stages and see material coverage"
```

### Task 14: Review page — diagnosis banner, mode toggle, held-back group, global editor, batch chip

**Files:**
- Create: `public/scripts/feature/writing-feedback-diagnosis-model.ts`
- Create: `public/scripts/feature/writing-feedback-diagnosis.ts`
- Modify: `public/scripts/feature/writing-feedback-review.ts` (`renderFeedbackPanel` at line ~713, `renderSummaryLens` at ~1458, `renderReadings` at ~1593, the revision save payload builder)
- Modify: `public/scripts/feature/writing-feedback-batch.ts`
- Modify: the review stylesheet
- Test: `public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts`, source guards in `src/writing-feedback/__tests__/writing-feedback-review-source.test.ts`

**Interfaces:**
- Consumes: `FeedbackRun` (with `textDiagnosis`, `gateDecision`, `flags`, `supportedExcerptIds`, `result.globalRevision`), `SubmissionDetail.modeOverride`, `AnchoredComment.heldBack`, `StaffSummaryEdit.globalRevision`, the stage list from the approved rubric.
- Produces (model):
  - `diagnosisBannerView(run: FeedbackRun, stages: Array<{ id: string; label: string; required?: boolean }>, mode: FeedbackMode): { headline: string; stageChips: Array<{ label: string; status: string; required: boolean }>; warnings: string[]; rationale: string; toggleLabel: string } | null` (null for runs without `textDiagnosis`)
  - `splitHeldBack(comments: AnchoredComment[], mode: FeedbackMode): { visible: AnchoredComment[]; heldBack: AnchoredComment[] }`
  - `releaseHeldBack(comments: AnchoredComment[], id: string): AnchoredComment[]`
  - `resolvedMode(run: FeedbackRun | null, override?: FeedbackMode): FeedbackMode`
  - `showReadAgain(comment: AnchoredComment, run: FeedbackRun | null): boolean`, true when the comment is staff-authored with a title, or its model evidence carries a `supportingExcerptId` found in `run.supportedExcerptIds`. For legacy runs with no `supportedExcerptIds` it keeps today's behaviour.

- [ ] **Step 1: Write the failing model tests**

`public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts`:

For `showReadAgain` to see `supportingExcerptId`, seeds must carry it. In `anchored-comments.ts` `seedCommentsFromRun`, add `...(evidence.supportingExcerptId ? { supportingExcerptId: evidence.supportingExcerptId } : {})`, add `supportingExcerptId?: string` to both `AnchoredComment` types, and add `supportingExcerptId: z.string().trim().min(1).max(40).optional()` to `anchoredCommentInputSchema`. This is a small backend addition inside this task; include those files in its commit.

- [ ] **Step 2: Run to verify failure**

Run (background): `npx jest --maxWorkers=4 public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the model**

`public/scripts/feature/writing-feedback-diagnosis-model.ts`:

- [ ] **Step 4: Implement the DOM module**

`public/scripts/feature/writing-feedback-diagnosis.ts` exports:

It builds a `<section class="wf-diagnosis" aria-label="Whole-text diagnosis">` containing: the headline in a `<p class="wf-diagnosis-headline">`; a `<ul class="wf-diagnosis-stages">` of chips (`<li>` text `"{label}: {status}"`, plus `" (required)"` when required); each warning in a `<p class="wf-diagnosis-warning" role="note">`; a `<details>` with `<summary>Why?</summary>` and the rationale; and a `<button type="button" class="wf-diagnosis-toggle">` with `view.toggleLabel` that calls `onToggle(mode === 'global_revision' ? 'standard' : 'global_revision')`.

It returns `<details class="wf-held-back">` with `<summary>Held back until revision ({n})</summary>`, a one-line explanation ("The student does not see these while this submission gets rewrite feedback."), and, for each comment, the card plus a `<button type="button">Release to student</button>` calling `onRelease(comment.id)`.

It renders three labelled fields: "What the text does" (textarea), "Keep (one per line)" (textarea split on newlines, at most 3 non-empty lines) and "How to rewrite" (textarea). Each label has `for`/`id` pairing, and inputs are disabled when `!canEdit`.

- [ ] **Step 5: Wire into the review page**

In `writing-feedback-review.ts`:
1. Keep a module-level `let currentModeOverride: FeedbackMode | undefined`, initialized from `detail.modeOverride` when the review opens (`renderReviewView`, line ~360).
2. In `renderFeedbackPanel` (line ~713), on the writing lens, compute `mode = resolvedMode(run, currentModeOverride)`. Above the Annotations step, if `diagnosisBannerView(run, stages, mode)` is non-null, insert `renderDiagnosisBanner`. `onToggle` sets `currentModeOverride`, marks the summary stale using the existing stale mechanism the Next step already uses (`grep -n "fingerprint\|stale" public/scripts/feature/writing-feedback-review-steps.ts`), and re-renders the panel.
3. Where writing-lens annotation cards are listed, call `splitHeldBack(workingComments, mode)`. Render `visible` as today, then `renderHeldBackGroup(heldBack, existingCardRenderer, (id) => { workingComments = releaseHeldBack(workingComments, id); rerender(); })`.
4. In `renderSummaryLens` (line ~1458), on the writing lens in global mode, render `renderGlobalRevisionEditor` seeded with `summaryEdit?.globalRevision ?? run.result.globalRevision` instead of the revision-goals editor. Store edits on the pending summary edit for this run. Strengths and criterion explanations stay editable as today.
5. In the revision save payload builder (`grep -n "summaryEdits" public/scripts/feature/writing-feedback-review.ts`), always send `modeOverride: resolvedMode(run, currentModeOverride)` when the run has a `textDiagnosis`, and send `globalRevision` inside the writing summary edit when present. Comments are sent as today; `heldBack` travels on them.
6. Where "Read again" or the reading box is rendered for an annotation, gate it with `showReadAgain(comment, run)`.
7. The Summary step's redraft: when the effective mode is global, skip the summary-redraft request on Next (the global block is not redrafted), and show no redraft confirm.

In `writing-feedback-batch.ts`, where each submission row is rendered, add a chip `<span class="wf-chip wf-chip--rewrite">Rewrite</span>` when the row's latest run has `gateDecision === 'global_revision'` and its latest revision has no `modeOverride === 'standard'`. If the batch payload lacks those fields, add `gateDecision` and `modeOverride` to the batch list item in `batch-generation.ts` and in its browser type. Check `grep -n "interface" src/writing-feedback/batch-generation.ts` first.

Source guards, added to `writing-feedback-review-source.test.ts`:

- [ ] **Step 6: Styles**

Add `.wf-diagnosis`, `.wf-diagnosis-headline`, `.wf-diagnosis-stages`, `.wf-diagnosis-warning`, `.wf-diagnosis-toggle`, `.wf-held-back` and `.wf-chip--rewrite` beside the existing review styles, using existing tokens. The banner must not overflow at 320px width.

- [ ] **Step 7: Run tests and both type checks**

Run (background): `npx jest --maxWorkers=4 public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts src/writing-feedback/__tests__/writing-feedback-review-source.test.ts src/writing-feedback/__tests__/anchored-comments.test.ts src/writing-feedback/__tests__/batch-generation.test.ts`, then `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p public/tsconfig.json`
Expected: PASS and no type errors.

- [ ] **Step 8: Browser pass**

Follow the project's browser-pass recipe (Playwright without Docker or `playwright install`; see the user's memory note "Browser pass recipe"). With the dev server running (`npm run dev`, in the background) and a seeded synthetic submission whose run has `gateDecision: 'global_revision'`, verify at 1440, 768 and 320px:
- the banner shows the headline, stage chips and warnings;
- the toggle flips the mode, and held-back annotations appear or disappear accordingly;
- Release to student moves a card out of the held-back group;
- the Summary step shows the rewrite editor in global mode;
- the downloaded student PDF matches the mode;
- there is no horizontal overflow.

Save screenshots to the session scratchpad. If authentication or seeding blocks the pass, report exactly what blocked it. Do not claim the pass ran.

- [ ] **Step 9: Commit**

```bash
git add public/scripts/feature src/writing-feedback/anchored-comments.ts src/writing-feedback/contracts.ts src/writing-feedback/batch-generation.ts src/writing-feedback/__tests__ public/styles
git commit -m "feat: show whole-text diagnosis and held-back annotations in review"
```

---

## Phase 4 — Measure and record

### Task 15: Eval re-run, full verification and project memory

**Files:**
- Modify: `../project-memory/01 Project Memory/Decisions.md`, `Current State.md`
- Create: `../project-memory/02 Session Log/2026-09-28 - Writing Feedback Diagnosis And Grounding.md` (use the actual completion date)

- [ ] **Step 1: Re-run the live eval**

Run (background): `npm run wf:eval -- --runs 3`
Expected: each fixture's checks mostly PASS. Compare against the Task 1 baseline report:
- `mode` passes for all six fixtures in at least 2 of 3 runs;
- `strengthsGuard`, `citationsSupported`, `goalsHaveAction` and `quotesExact` pass in every run;
- `themeFinding` passes for `dr-weak-theme` in at least 2 of 3 runs.

A fixture that misses these targets is a finding to report with its report excerpt. It isn't a reason to loosen a check. Adjust prompts (Task 9 files) only with the user's agreement, and re-run.

- [ ] **Step 2: Full verification**

Run (background):
- `npx jest --maxWorkers=4`
- `npx tsc --noEmit -p tsconfig.json`
- `npx tsc --noEmit -p public/tsconfig.json`
- `npm run build`
- `git diff --check`

Expected: jest has no failures beyond those recorded as inherited in Task 8 Step 5. Both type checks, the build and the diff check are clean.

- [ ] **Step 3: Record decisions and state**

In `Decisions.md`, add the next free D-numbers for the seven brainstorming decisions (spec section 4), plus:
- citations only via relevance-supported excerpt ids, with auto-attach removed;
- `RevisionGoal.action` required and `guidedQuestion` optional;
- held-back and mode override carried in the append-only revision.

Each entry gets one line of rationale. Update `Current State.md` with a dated section: what shipped, verification counts from Step 2, the eval comparison (baseline versus final pass rates per check, no fixture text needed), and what is still owed (a live run on real LLED 200 material with Alfredo's rubric; sub-projects C, D and E). Write the session log note. No student text, PUIDs, grades or generated feedback go into memory; the eval texts are synthetic, but summarize rather than paste them.

- [ ] **Step 4: Commit**

Project memory lives outside the repository, so there is nothing to commit for it. If commits are authorized, commit any remaining repository changes:

```bash
git add -A src public documents scripts package.json .gitignore
git commit -m "chore: finish writing feedback diagnosis and grounding"
```

Check `git status` first and add only this plan's files. Never add the pre-existing untracked plan and spec files listed in Global Constraints.
