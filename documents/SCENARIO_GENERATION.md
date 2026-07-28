# Practice Scenarios (Scenario Generation)

EngE-AI’s **Practice Scenarios** feature creates, persists, and evaluates **troubleshooting scenario questions**. Instructors author a course-scoped question bank; students complete scenarios in Practice or Exam mode.

This capability is **not** a chat conversation mode. The legacy `scenario-generation` chat mode was retired. Generation prompts reside under `src/scenario-generation/` and serve this feature only.

---

## Overview

1. The instructor selects a course topic or week, provides a seed prompt, and requests generation of one or more draft scenarios (RAG retrieval plus LLM structured output).
2. The instructor reviews and edits drafts in the authoring editor, then publishes approved questions.
3. The student accesses published scenarios in **Practice** mode (formative feedback with retries) or **Exam** mode (single submission covering all sub-questions).
4. The server persists data in MongoDB, invokes the LLM for generation and answer evaluation, and stores attempt history as embedded fields on each question document.

---

## Terminology

| UI label | Code / API name | Visibility |
| -------- | --------------- | ---------- |
| Practice Scenarios | `scenario-questions` (API), `scenarios` (student page) | Students |
| Scenario Questions | Same collection; instructor UI label | Instructors |
| Topic / week / chapter | `topicOrWeekId` | Both; foreign key to `activeCourse.topicOrWeekInstances[].id` |
| Part / sub-question | `subQuestions[]`, keyed by `subQuestionId` | Both |
| Narrative / stem | `questionBody` | Students (Markdown and optional diagram) |
| Model answer | `modelAnswer` on each sub-question | Instructors until solution release |
| Full worked solution | `solutionBody` | Students after solution gate conditions are met |

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  Instructor: scenario-questions-instructor.ts                            │
│  Student:    scenarios-student.ts                                        │
│       │                                                                  │
│       ▼                                                                  │
│  scenario-questions-api.ts  (HTTP client)                                │
└───────┬─────────────────────────────────────────────────────────────────┘
        │  /api/courses/:courseId/scenario-questions/*
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  scenario-questions-routes.ts                                            │
│  Authentication, Zod validation → service or Mongo delegate              │
└───────┬──────────────────────────────┬──────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────────┐    ┌────────────────────────────────────────────┐
│ scenario-service.ts   │    │ scenario-questions-mongo.ts                 │
│ Generate, evaluate,   │    │ CRUD, embedded studentResponses[], publish  │
│ solution gate         │    │ validation                                  │
└───────┬───────────────┘    └────────────────────────────────────────────┘
        │
        ├── RAGApp.retrieveForChat()     ← course materials from Qdrant
        ├── LLMModule (structured JSON)  ← generation, feedback, exam scoring
        └── Zod in scenario-schemas.ts   ← validation and sanitization
```

Route handlers remain thin. AI workflow logic belongs in `scenario-service.ts`; persistence belongs in `scenario-questions-mongo.ts`.

---

## File map

| Path | Role |
| ---- | ---- |
| [`src/scenario-generation/scenario-service.ts`](../src/scenario-generation/scenario-service.ts) | Orchestration: draft generation, practice feedback, exam evaluation, solution gate |
| [`src/scenario-generation/scenario-schemas.ts`](../src/scenario-generation/scenario-schemas.ts) | Zod schemas, request validation, LLM output sanitizers |
| [`src/scenario-generation/prompts/scenario-generation-prompt.ts`](../src/scenario-generation/prompts/scenario-generation-prompt.ts) | System prompt for scenario authoring |
| [`src/scenario-generation/prompts/scenario-feedback-prompt.ts`](../src/scenario-generation/prompts/scenario-feedback-prompt.ts) | System and user prompts for practice feedback and exam evaluation |
| [`src/scenario-generation/scenario-practice-limits.ts`](../src/scenario-generation/scenario-practice-limits.ts) | Daily attempt limits, cooldown, feedback tier resolution |
| [`src/scenario-generation/scenario-practice-canned-responses.ts`](../src/scenario-generation/scenario-practice-canned-responses.ts) | Standard messages when rate limits block LLM evaluation |
| [`src/routes/mongo/scenario-questions-routes.ts`](../src/routes/mongo/scenario-questions-routes.ts) | REST routes (mounted from `route-mongo.ts`) |
| [`src/db/mongo/scenario-questions-mongo.ts`](../src/db/mongo/scenario-questions-mongo.ts) | Mongo CRUD, lazy collection provisioning, publish validation, response append |
| [`src/db/mongo/scenario-indexes.ts`](../src/db/mongo/scenario-indexes.ts) | Indexes on `{courseName}_scenario_questions` |
| [`src/types/shared.ts`](../src/types/shared.ts) | Domain types (mirrored in `public/scripts/types.ts`) |
| [`public/scripts/api/scenario-questions-api.ts`](../public/scripts/api/scenario-questions-api.ts) | Frontend HTTP client |
| [`public/scripts/feature/scenario-questions-instructor.ts`](../public/scripts/feature/scenario-questions-instructor.ts) | Instructor UI: topic grid, generation form, editor |
| [`public/scripts/feature/scenarios-student.ts`](../public/scripts/feature/scenarios-student.ts) | Student UI: question list, practice and exam workspace |
| [`public/scripts/feature/scenario-answer-flashcard.ts`](../public/scripts/feature/scenario-answer-flashcard.ts) | Parses model-answer Markdown into flashcard steps (deterministic; no LLM) |

Tests: `src/scenario-generation/__tests__/`.

---

## Page routes

The server serves a shared course HTML shell; the client loads the appropriate component from the URL.

| Path | Description |
| ---- | ----------- |
| `GET /course/:courseId/instructor/scenario-questions` | Instructor authoring. Query parameters: `?browse=questions`, `?topicOrWeekId=`, `?generate=1`, `?questionId=` |
| `GET /course/:courseId/student/scenarios` | Student practice bank. Query parameters: `?questionId=`, `?mode=practice\|exam` |

REST API reference: [ENDPOINT_ARCHITECTURE.md](ENDPOINT_ARCHITECTURE.md) — section **Scenario Questions (Practice Scenarios / Scenario Questions)**.

---

## Data model (MongoDB)

### Collection

- Per course: `{courseName}_scenario_questions`
- Registered on the course document as `activeCourse.collections.scenarioQuestions`
- Provisioned lazily on first API access for pre-feature courses (migration **SQ-001**). See [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sq-001-scenario-questions-collection-backfill).

### Document structure

Each document represents one scenario question:

```text
ScenarioQuestion
├── id, courseId, courseName, topicOrWeekId
├── status: draft | published | rejected
├── title, sourcePrompt
├── questionBody          ← student-facing narrative (Markdown)
├── solutionBody          ← full worked solution
├── difficulty, expectedTimeMinutes
├── learningObjectives[]  ← snapshot at generation or edit time
├── generatedBy: instructor | ai
├── subQuestions[]
│   ├── subQuestionId     ← server-assigned; API key for check-answer and exam
│   ├── subQuestionType   ← calculation | troubleshoot | action | corrective
│   ├── prompt, modelAnswer
│   └── studentResponses[]  ← embedded attempt history
│       ├── id, studentUserId, mode (practice | exam)
│       ├── studentAnswer, feedback
│       ├── grade?          ← exam mode only (integer 1–10)
│       └── submittedAt
└── timestamps, sortOrder, createdByUserId, …
```

Student responses are embedded on each sub-question rather than stored in a separate collection. This simplifies check-answer handling and solution gating. Document size is monitored against MongoDB’s 16 MiB limit (`SCENARIO_DOCUMENT_GROWTH_GUARD_BYTES`).

### Student-facing projection

`getPublishedScenarioQuestionForStudent` omits:

- `solutionBody`
- each sub-question’s `modelAnswer`
- all `studentResponses`

Draft documents return **404** to students (not **403**) to avoid leaking draft existence.

---

## Instructor workflow

```text
Topic grid / question list
    → Generation form (seed prompt, learning objectives, part types, difficulty)
        → POST …/scenario-questions/generate
        → Draft document(s) persisted (status: draft)
    → Editor (auto-save, model-answer flashcard preview)
        → PUT …/scenario-questions/:id
    → Publish
        → PATCH …/scenario-questions/:id/status  { status: "published" }
        → Server validates narrative and complete sub-questions before publish
```

### Generate request body

| Field | Description |
| ----- | ----------- |
| `mode` | `single` (one question) or `batch` (multiple; maximum **10**) |
| `sourcePrompt` | Instructor seed text for the scenario theme |
| `topicOrWeekId` | Topic or week used to scope RAG retrieval and learning-objective catalog |
| `learningObjectiveIds` | Optional; each id must belong to the selected topic or week |
| `subQuestionTypes` | Ordered part types; default `calculation`, `troubleshoot`, `action` |
| `difficulty` | `easy`, `medium`, or `hard`; default `medium` |
| `title` | Optional override; otherwise the LLM-generated title is used |
| `count` | Batch mode only — number of distinct scenarios to generate |

### Generation pipeline

Implemented in `ScenarioService.generateDrafts()`:

```text
1. Resolve and validate learning objectives
2. Invoke LLM (or developer-mode mock)
      a. Build RAG query from sourcePrompt and learning-objective text
      b. RAGApp.retrieveForChat(limit: 5, scoreThreshold: 0.4, topicOrWeekId)
      c. buildScenarioGenerationSystemPrompt(mode, LO texts)
      d. ragPrompts.formatScenarioGenerationUserTurn(context, sourcePrompt)
      e. sendStructuredConversation → singleScenarioSchema | batchScenarioSchema
3. sanitizeGeneratedScenario() — remove incomplete parts; remap types as requested
4. createScenarioQuestion() for each valid result — server assigns subQuestionId
```

If validation fails for all generated questions, no documents are persisted and the API returns **422**.

---

## Prompts (generation)

Generation prompts are TypeScript modules in `scenario-generation-prompt.ts`. They follow the same `<module id="…">` structure and `*Module Purpose*` / `*Module Content*` convention as chat system prompts (see [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md)).

| Module | Purpose |
| ------ | ------- |
| system prompt guidance | Module stack interpretation |
| artefact mermaid syntax | `<Artefact>…</Artefact>` diagrams in `questionBody` |
| latex formatting | `$…$` and `$$…$$` delimiters (KaTeX-compatible) |
| scenario generation rules | Narrative structure, sub-questions, flashcard model answers |
| batch generation | Additional rules when `mode: batch` |
| selected learning objectives | Appended when the instructor selects objectives |

Structured LLM output (before server-assigned identifiers):

- `title`, `questionBody`, `solutionBody`
- `subQuestions[]`: `{ subQuestionType, prompt, modelAnswer }`

Model answers use ATX `# Title` headings; the client parses these into flashcard steps (`scenario-answer-flashcard.ts`).

Answer-evaluation prompts reside in `scenario-feedback-prompt.ts` (practice and exam paths; student input is XML-escaped).

---

## Student workflow

### Practice mode (`mode: practice`)

- Submissions are per sub-question via `POST …/check-answer`.
- Responses provide formative feedback only; no numeric score is assigned.
- Per-part solution reveal is available in practice without completing all sub-questions.
- Attempt limits apply (see [Practice attempt limits](#practice-attempt-limits)).

### Exam mode (`mode: exam`)

- The student submits all sub-question answers in one request: `POST …/submit-exam`.
- The server evaluates all parts in a single structured LLM call and returns per-part scores (1–10), feedback, and an overall score (sum of part scores).
- Exam submission is restricted to enrolled students.

### Solution release

`GET …/solution?mode=practice|exam`

- **Full release:** the student must have submitted a response for every sub-question in the requested mode (practice allows per-part release as noted above).
- Returns `questionBody`, `solutionBody`, and sub-questions without embedded `studentResponses`.

---

## Answer evaluation

| Mode | LLM output | Persisted fields |
| ---- | ---------- | ---------------- |
| Practice (attempts 1–2) | Socratic formative feedback | `feedback` |
| Practice (attempts 3–6) | Direct evaluation; server appends model answer | `feedback` |
| Exam | Integer score (1–10) and academic feedback per part | `grade`, `feedback` |

Sanitizers in `scenario-schemas.ts`:

- Clamp invalid exam scores to the allowed range
- Replace feedback that reproduces the model answer verbatim
- Exam batch: require exactly one result per `subQuestionId`

In developer mode, `isDeveloperMode()` bypasses live LLM calls and returns fixtures from `helpers/developer-mode.ts`.

---

## Practice attempt limits

Applied per sub-question, per calendar day (timezone `America/Vancouver`), for students only. Instructor preview is exempt.

| Rule | Value |
| ---- | ----- |
| Maximum attempts per day | **6** |
| Attempts 1–2 | Socratic tier (formative hints; model answer withheld) |
| Attempts 3–6 | Descriptive tier (evaluation with server-attached model answer) |
| Attempt 7+ (same day) | Blocked; standard rate-limit message; no LLM call or persistence |
| Cooldown between attempts | **30 seconds** |

Implementation: `scenario-practice-limits.ts`, `scenario-practice-canned-responses.ts`.

---

## Sub-question types

| Type | Description |
| ---- | ----------- |
| `calculation` | Quantitative or formula-based work |
| `troubleshoot` | Root-cause analysis |
| `action` | Immediate operational response |
| `corrective` | Longer-term corrective measures |

The instructor specifies an ordered list at generation time; the LLM produces one part per type in that order.

---

## Authorization (API)

| Middleware | Principal | Routes |
| ---------- | --------- | ------ |
| `requireInstructorForCourseAPI` | Course staff | Create, update, delete, generate, learning-objective catalog |
| `requireCourseMemberForScenarioAPI` | Enrolled student or staff | List, retrieve, check-answer, solution, response history |
| Handler-level check | Enrolled students only | `submit-exam` (instructors receive **403**) |

---

## Migrations

| Id | Description |
| -- | ----------- |
| **SQ-001** | Lazy provisioning of `{courseName}_scenario_questions` and course registration |
| **SQ-002** | Backfill `difficulty`, `expectedTimeMinutes`, `learningObjectives`, `subQuestionType` |
| **SQ-003** | Backfill `subQuestionId` and empty `studentResponses[]` on legacy documents |

Details: [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md), [MONGO_DATA_LAYER.md](MONGO_DATA_LAYER.md).

---

## Tests

```bash
npm test -- src/scenario-generation
```

Coverage includes Zod sanitizers, practice limits, feedback prompt structure, and rate-limit messages.

---

## Related documentation

- [ENDPOINT_ARCHITECTURE.md](ENDPOINT_ARCHITECTURE.md) — REST routes and RBAC
- [MONGO_DATA_LAYER.md](MONGO_DATA_LAYER.md) — collection layout and domain notes
- [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md) — chat mode prompts (separate from scenario generation)
- [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md) — SQ-001 through SQ-003

---

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Generation returns **422** | Empty RAG context or LLM output missing valid sub-questions; inspect `[SCENARIO-SERVICE]` logs |
| Student cannot access a question | Document must be `published`; drafts return **404** |
| Check-answer returns a fixed message | Practice daily limit or cooldown active |
| Model-answer flashcards do not render | Model answer must begin with `# Title` (ATX h1) |
| Frontend and backend type mismatch | Update both `src/types/shared.ts` and `public/scripts/types.ts` |
