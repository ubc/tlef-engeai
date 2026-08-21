# EngE-AI Endpoint Architecture

This document describes the endpoint architecture, role-based access control (RBAC), and modular orchestration of the EngE-AI backend.

---

## 1. Overview

EngE-AI uses a split architecture with:

- **Page routes** — Serve HTML shells; frontend loads components based on URL
- **API routes** — RESTful JSON endpoints; grouped by domain (courses, chat, RAG, auth, etc.)
- **Role-based access** — Student vs instructor enforced at both page and API levels

All API routes are prefixed with `/api/`. Page routes are served from `/` and `/course/:courseId/...`.

---

## 2. Route Registration (server.ts)

| Mount Path | Router | Purpose |
|------------|--------|---------|
| `/auth` | authRoutes | Login, logout, SAML callback, current user |
| `/` | courseRoutes | Course-scoped page routes (instructor/student shells) |
| `/api/chat` | chatAppRoutes | Chat CRUD, streaming, metadata |
| `/api/rag` | ragAppRoutes | Document upload, retrieval, search, wipe |
| `/api/courses` | mongodbRoutes | Courses, flags, objectives, materials, monitor |
| `/api/courses` | writingFeedbackRoutes | Optional staff writing-feedback workspace |
| `/api/course` | courseEntryRoutes | Course entry, enter-by-code, current course |
| `/api/user` | userManagementRoutes | User profile, onboarding, activity |
| `/api/health` | healthRoutes | Health check |
| `/api/version` | versionRoutes | App version (SemVer) |
| `/api/lms` | lmsRoutes | Canvas + Moodle per-user connections |

Public HTML (no auth), registered in `server.ts` before `express.static`:

| Path | File | Purpose |
|------|------|---------|
| `GET /` | `public/index.html` | Marketing home (authenticated users are redirected) |
| `GET /team` | `public/pages/team.html` | Project team |
| `GET /docs` and `GET /docs/*` | `public/pages/docs.html` | Markdown docs shell. `express.static` for `public/docs/` is mounted first (`index: false`) so `.md` / `nav.json` are real files, not the HTML shell. |

---

## 3. Page Routes (course-routes.ts)

All course-scoped pages use the same HTML shell; the frontend parses the URL to load the correct component.

### Middleware Chain

1. **validateCourseAccess** — Ensures user is authenticated and has access (instructor or enrolled). Sets `req.courseContext` with `isInstructor`, `isEnrolled`.
2. **requireInstructorForCourse** — Redirects non-instructors to `/course-selection`.
3. **requireStudentForCourse** — Redirects instructors to `/course-selection`.

### Instructor Routes (require instructor role)

| Path | Description |
|------|-------------|
| `GET /course/:courseId/instructor` | Redirects to dashboard |
| `GET /course/:courseId/instructor/dashboard` | Instructor home (feature cards, click-to-reveal course code, Advanced Settings for instructors/admins) |
| `GET /course/:courseId/instructor/documents` | Document management |
| `GET /course/:courseId/instructor/settings` | Legacy redirect → dashboard (capability toggles live in Advanced Settings) |
| `GET /course/:courseId/instructor/writing-feedback` | Capability-gated Writing Feedback; redirects to Dashboard when disabled (`?notice=feature-disabled&feature=writingFeedback`) |
| `GET /course/:courseId/instructor/flags` | Flag reports |
| `GET /course/:courseId/instructor/monitor` | Student chat monitoring |
| `GET /course/:courseId/instructor/chat` | Instructor chat |
| `GET /course/:courseId/instructor/assistant-prompts` | Assistant prompts |
| `GET /course/:courseId/instructor/system-prompts` | System prompts |
| `GET /course/:courseId/instructor/scenario-questions` | Scenario Questions (Practice Scenarios authoring). Requires `scenarioGeneration` Extra Feature. Query: `?browse=questions`, `?topicOrWeekId=`, `?generate=1`, `?questionId=` |
| `GET /course/:courseId/instructor/pathway-library` | Capability-gated Guided Pathway Library; redirects to Dashboard when disabled |
| `GET /course/:courseId/instructor/course-information` | Legacy redirect → dashboard (metadata in Advanced Settings; course code in topbar) |
| `GET /course/:courseId/instructor/about` | About page |
| `GET /course/:courseId/instructor/onboarding/course-setup` | Onboarding |
| `GET /course/:courseId/instructor/onboarding/document-setup` | Onboarding |
| `GET /course/:courseId/instructor/onboarding/flag-setup` | Onboarding |
| `GET /course/:courseId/instructor/onboarding/monitor-setup` | Onboarding |
| `GET /instructor/onboarding/new-course` | New course creation (no courseId) |

### Student Routes (require student role)

| Path | Description |
|------|-------------|
| `GET /course/:courseId/student` | Student home |
| `GET /course/:courseId/student/chat` | Chat interface |
| `GET /course/:courseId/student/scenarios` | Practice Scenarios. Requires `scenarioGeneration` Extra Feature. Query: `?questionId=`, `?mode=practice|exam` |
| `GET /course/:courseId/student/profile` | Profile |
| `GET /course/:courseId/student/flag-history` | Flag history |
| `GET /course/:courseId/student/about` | About page |
| `GET /course/:courseId/student/onboarding/student` | Student onboarding |

---

## 4. API Routes by Domain

### 4.0 Course capabilities (`/api/courses/:courseId/features/*`)

Optional course capabilities live on `activeCourse.features`. Missing entries are disabled. Only roster managers (faculty instructors / platform admins) may toggle them. Disabling hides UI and blocks operational APIs; domain records are preserved.

| Method | Path | Description |
|---|---|---|
| PATCH | `/api/courses/:courseId/features/writing-feedback` | Body `{ enabled: boolean }` — Writing Feedback workspace |
| PATCH | `/api/courses/:courseId/features/memory-agent` | Body `{ enabled: boolean }` — Memory Agent / struggle topics |
| PATCH | `/api/courses/:courseId/features/guided-pathway` | Body `{ enabled: boolean }` — Pathway Library + chat intercept |
| PATCH | `/api/courses/:courseId/features/scenario-generation` | Body `{ enabled: boolean }` — Scenario Generation Extra Feature (gates Practice Scenarios / Scenario Questions UI+APIs and unstruggle Yes scenario chips) |


**Success (200):** `{ success: true, data: activeCourse, message }`  
**Errors:** `400` invalid body, `403` non–roster-manager, `404` course missing

Struggle-topic document APIs require `requireCourseFeatureAPI('memoryAgent')`. Pathway Library APIs require `requireCourseFeatureAPI('guidedPathway')`.

**Chat unstruggle gating:** When `memoryAgent` is disabled, chat never injects `<questionUnstruggle>` / struggle tags, the Yes/No special send path is skipped, and any model-emitted unstruggle tags are stripped before persistence. When `memoryAgent` is enabled but `scenarioGeneration` is disabled, unstruggle Yes still clears the struggle topic but returns a No-style hardcoded reply with no `<scenarioSuggestions>` list (even if published scenarios exist). Chat FE always renders those tags when present in message text; capability policy is server-side only.

**Scenario Generation Extra Feature:** When off, Practice Scenarios / Scenario Questions APIs return 403 (`requireCourseFeatureAPI('scenarioGeneration')`); instructor and student scenario page routes redirect; student sidebar and instructor nav hide the tool. Unstruggle Yes chips remain gated as above.

**Student course payload:** Non-staff course GETs omit `features` and `llmSettings` so Guided Pathway / Extra Feature / model settings are not console-readable. Staff (instructors, TAs, platform admins for the course) still receive the full document. Students fetch shell UI flags via `GET /api/courses/:courseId/student-capabilities` (`{ scenarioGeneration: boolean }` only).

### 4.0.1 Course LLM settings (`/api/courses/:courseId/llm-settings`)

Per-feature model and reasoning for Chat, Writing Feedback, Scenario Generation, Guided Pathway, and Memory Agent. Stored on `activeCourse.llmSettings`. Runtime resolution uses `ModelSelectionService`: process-local Map keyed by `courseId` with 5-minute inactivity eviction; cold misses single-flight load Mongo then insert; successful PATCH writes Mongo first then `setCachedSettings` (write-through). Freshness after save is guaranteed for a **single Node process**; multi-worker coherence is out of scope. Only roster managers may update. Students/TAs never PATCH; the server applies settings when their feature calls run. The Model Settings UI always lists all five feature rows; Writing Feedback, Guided Pathway, Memory Agent, and Scenario Generation rows are shaded and non-interactive until the matching Extra Feature capability is enabled. PATCH still requires all five feature keys.

| Method | Path | Description |
|---|---|---|
| GET | `/api/courses/:courseId/llm-model-catalog` | Course staff — dashboard catalog (`costTier` + `reasoningOptions` id/label; brain icons are client-side) |
| PATCH | `/api/courses/:courseId/llm-settings` | Roster managers — body: full per-feature map (see below) |

**GET catalog success (200):** `{ success: true, data: { models, defaultSelection } }`

Platform `defaultSelection` (and per-feature fallback when Mongo has no usable row): `{ "modelId": "gpt-5.6-luna", "reasoningLevel": "none" }`.

Each `models[]` entry: `{ id, label, costTier, reasoningOptions: [{ id, label }] }`. No `costLabel`, no `brainCount`.

**PATCH body:**

```json
{
  "chat": { "modelId": "gpt-5.6-luna", "reasoningLevel": "high" },
  "scenarioGeneration": { "modelId": "gpt-5.4-mini", "reasoningLevel": "medium" },
  "writingFeedback": { "modelId": "gpt-4o-mini", "reasoningLevel": "low" },
  "guidedPathway": { "modelId": "gpt-5.4-mini", "reasoningLevel": "medium" },
  "memoryAgent": { "modelId": "gpt-5.4-mini", "reasoningLevel": "low" }
}
```

**Provider catalog** (`supportedReasoningLevels` in `LLM_MODEL_SPECS` / `model-selection-list.ts` — verbatim from OpenAI docs):

| `modelId` | Display | Official `supportedReasoningLevels` | Provider docs |
|---|---|---|---|
| `gpt-5.6-luna` | GPT 5.6 Luna | `none`, `low`, `medium`, `high`, `xhigh`, `max` | [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) · [Reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| `gpt-5.4-mini` | GPT 5.4 Mini | `none`, `low`, `medium`, `high`, `xhigh` | [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) |
| `gpt-4o-mini` | GPT 4o Mini | _(empty)_ | [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) |

**App picker / PATCH `reasoningLevel`:** `AppReasoningLevel` = `none` \| `low` \| `medium` \| `high` only. Dashboard `reasoningOptions` are APP ∩ provider for that model (`xhigh` / `max` stay on the catalog, not in the picker or Mongo). When `supportedReasoningLevels` is empty, any app level may be stored but provider options omit `reasoningEffort`.

**Brain UI (client-only):** Model Settings maps `costTier` → 1–3 brain icons and reasoning id → 0–3 brains (`none` = no icon). The API does not send brain counts or `$` labels.

**Toolkit:** Runtime options are `ubc-genai-toolkit-llm` `LLMOptions` (`model` + optional `reasoningEffort`). Emitted efforts are a subset of toolkit `ReasoningEffort` (`none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max`). When `reasoningEffort` is set, `temperature` is omitted (gpt-5-class models reject the combination).

**Legacy:** flat `{ modelId, reasoningLevel }` on older courses is hydrated to all five features on read.

**Success (200):** `{ success: true, data: activeCourse, message }`  
**Errors:** `400` invalid body / unsupported model–reasoning pair, `403` non–roster-manager, `404` course missing, `500` persist failure

<!-- @rdschrs: Implemented the course-scoped Writing Feedback API boundary. -->
### 4.0.2 Writing Feedback (`/api/courses/:courseId/writing-feedback`)

Every endpoint requires course-staff RBAC followed by `requireCourseFeatureAPI('writingFeedback')`. That router-level pair is the complete authorization for this section — no endpoint layers a narrower guard on top. Instructors, platform admins, and TAs therefore have identical access to the whole workspace: intake, assignment creation, rubric mutation and approval, review, and release (D-049, 2026-08-18; reverses the earlier rule that rubric mutation additionally required roster-management permission).

Feature configuration remains separate and narrower: `PATCH /api/courses/:courseId/features/writing-feedback` (see §4.0) still requires roster-management permission, so only instructors and admins can enable or disable the capability for a course.

Canvas endpoints report their integration mode honestly. `demo` with `integration: mock_canvas` lists/imports synthetic local data without contacting Canvas; `not_configured` with `integration: none` explains the institutional OAuth gate. No endpoint in the current local slice establishes live OAuth or writes a rubric/grade/comment to Canvas without a separate explicit release action.

| Method | Path | Description |
|---|---|---|
| GET | `/workspace-context` | Returns UI permissions (including rubric management) and non-secret integration context for the current staff member |
| GET | `/assignments` | Lists assignments with per-assignment `submissionCount`; an empty course stays empty until an explicit create/import action |
| POST | `/assignments` | Creates a manual assignment from `{ title, dueAt?, instructions? }` with a neutral, unapproved rubric draft; instructor/admin only |
| POST | `/instructions/extract` | Multipart `file` extraction for assignment directions (TXT, DOCX, text-PDF, HTML/HTM, or Markdown); returns text for staff review before create; instructor/admin only |
| GET | `/canvas/status` | Returns `demo` or `not_configured` status and safe staff-facing setup guidance; never returns tokens |
| GET | `/canvas/assignments` | Lists selectable synthetic assignments in local demo mode; live listing remains OAuth-gated |
| GET | `/canvas/assignments/:canvasAssignmentId/preview` | Read-only preview of the selected synthetic assignment/submissions before import |
| POST | `/canvas/import` | Creates/reuses the mapped writing assignment, imports/reconciles its selected demo submissions, and reports imported/skipped counts; allowed for instructors/TAs |
| POST | `/assignments/:assignmentId/canvas-import-fixture` | Backward-compatible, clearly labelled synthetic import helper for local testing only |
| DELETE | `/assignments/:assignmentId` | Deletes an assignment; `409` while it still has any submissions (delete those first). Any course staff |
| PATCH | `/assignments/:assignmentId/lab-report` | Body `{ isLabReport: boolean }`. Marking seeds an editable technical rubric draft when one does not already exist. Unmarking is `409` once the technical rubric is approved, or once any technical feedback run exists for the assignment |
| GET | `/assignments/:assignmentId/rubric` | Returns optional approved rubric, current draft, immutable history, optional criterion library (linguistic lens only), and caller edit permission for the selected lens. `?lens=linguistic\|technical` selects which rubric is read (default `linguistic`); requesting `technical` on an assignment not marked as a lab report is `409` |
| PUT | `/assignments/:assignmentId/rubric-draft` | Validates and saves the next rubric draft version for the selected lens (`?lens=linguistic\|technical`, default `linguistic`) without changing that lens's approved rubric; instructor/admin only. `409` when `technical` is requested and the assignment is not marked as a lab report |
| DELETE | `/assignments/:assignmentId/rubric-draft` | Explicitly discards the inactive saved draft for the selected lens (`?lens=linguistic\|technical`, default `linguistic`); instructor/admin only. Unlike the other three rubric routes, this one does not reject `technical` on a non-lab-report assignment — discarding a draft that cannot exist is a no-op, not a conflict |
| POST | `/assignments/:assignmentId/rubric-draft/approve` | Explicitly promotes the saved draft to a new immutable approved version for the selected lens (`?lens=linguistic\|technical`, default `linguistic`) and derives a numeric mapping only when every level has points (linguistic lens only); instructor/admin only. `409` when `technical` is requested and the assignment is not marked as a lab report |
| GET/POST | `/submissions` | Staff queue / manual verified-text intake |
| POST | `/submissions/file` | TXT, DOCX, text-PDF, or HTML extraction; requires staff verification |
| GET | `/submissions/:submissionId` | Submission, history, latest feedback run, stored anchored `comments` (stale-flagged against the current verified text), and `seedComments` derived from run evidence while no revision has stored comments |
| DELETE | `/submissions/:submissionId` | Deletes a submission at any status (including `released`) and cascades its feedback runs, releases, and queued jobs. Any course staff |
| POST | `/submissions/:submissionId/verify` | Saves staff-verified transcript |
| POST | `/submissions/:submissionId/generate` | Generates validated structured feedback for every lens the assignment requires; responds `{ linguistic?, technical? }`. A missing `technical` key means that lens was skipped (not a lab report, or its rubric is not currently approved) or failed — it does not mean the request failed, and the linguistic draft remains reviewable. Never releases |
| POST | `/submissions/:submissionId/reviews` | Appends a staff review revision; optional `comments` array of anchored comments is schema-validated and every anchor re-checked as an exact slice of the verified text. `authorName` is server-stamped (prior attribution carried by comment id; new staff comments attributed to the saving user's display name) — any client-sent value is discarded |
| POST | `/submissions/:submissionId/approve` | Explicit staff approval |
| GET | `/submissions/:submissionId/feedback.pdf` | Student-safe feedback PDF; `?include=general\|annotated\|both` selects the summary document, the verified text with Canvas-style `/Highlight` popup annotations, or both (default `general`; legacy `specific` maps to `annotated`) |
| POST | `/submissions/:submissionId/release-preview` | Dry-run Canvas payload preview |
| POST | `/submissions/:submissionId/release` | Mock-only release; real Canvas requires OAuth gates |

`POST /canvas/import` reads a selected source and writes local writing records only. It creates or reuses one writing assignment per Canvas assignment mapping and carries the source description into local assignment instructions when available. The current response explicitly reports `rubricImport: not_imported`; native Canvas rubric ingestion remains future work. Import does not approve a rubric, generate feedback, or call a Canvas write endpoint. Repeating the same assignment/student/attempt import is idempotent and is returned as skipped/reconciled rather than duplicated.

The rubric draft body contains complete task, audience, purpose, constraints, learning outcomes, grading intent, 1–10 assignment-specific criteria, and 2–8 ranked ordinal levels. Criterion/level ids are unique lowercase slugs; ranks are unique and contiguous from 1; points are supplied for every level or none. Before the first approval, instructors may shape the criterion/level sets. After approval, those id sets are frozen while labels, descriptions, order/rank, lenses, and points remain versioned and editable. Draft validation failures return field-safe `400` responses. Approving without a saved draft is a conflict (`409`). Rubric mutation routes carry no guard narrower than the router-level course-staff check, so TAs have the same access as instructors (see D-049 above). Saving or approving a rubric never updates Canvas automatically.

Anchored comments carry `{ id, criterion?, quote, startOffset, endOffset, comment, howToImprove?, courseMaterialLink?, glossaryDefinition?, origin, functionTag?, levelTag?, priority? }` with UTF-16 offsets into the verified text, a 50-comment cap, and http(s)-only links. `functionTag` (`content|interpersonal|organizational`), `levelTag` (`text|section|clause_word`), and `priority` (`high|medium|low`) mirror the Academic Writing Matrix taxonomy; they are staff-facing triage metadata, seeded only as a criterion→function mapping, and never printed in the student PDF. Offsets are the anchor source of truth and the quote is a checksum: saving rejects any comment whose slice no longer matches, and reads mark such comments `stale` instead of re-anchoring them. Seed comments derive from immutable model-run evidence at read time and are only persisted when staff save a revision. The student PDF includes only comments whose anchors still validate and never exposes `origin`, confidence, internal flags, or staff notes.

Live Canvas OAuth routes are intentionally absent from this table until the privacy/security and developer-key gates are satisfied. The future implementation must preserve the same status/list/import contract while adding encrypted refresh-token storage, pagination, throttling, and explicit instructor connection management.

### 4.1 Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/login` | No | Login page |
| GET | `/auth/login/cwl` | No | CWL login redirect |
| POST | `/auth/login` | No | Form login |
| POST | `/auth/saml/callback` | No | SAML callback |
| GET | `/auth/login-failed` | No | Login failure page |
| GET | `/auth/logout` | No | Logout |
| GET | `/auth/logout/callback` | No | Logout callback |
| GET | `/auth/current-user` | Session | Current user (legacy) |
| GET | `/auth/me` | Session | Current user + global user |
| GET | `/auth/config` | No | Auth config |

### 4.2 Course Entry (`/api/course`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/course/enter` | Yes | Any | Enter course by ID; syncs session `globalUser.coursesEnrolled` from DB after enroll |
| POST | `/api/course/enter-by-code` | Yes | Any | Enter course by code; syncs session `globalUser.coursesEnrolled` from DB after enroll |
| GET | `/api/course/current` | Yes | Any | Get current course from session |

### 4.3 Courses & Content (`/api/courses`)

#### Course CRUD

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses` | Yes | Instructor (global) | Create new course |
| GET | `/api/courses` | Yes | Any | List accessible courses (DB `coursesEnrolled` + course staff roles; admin sees all) |
| GET | `/api/courses/course-selection` | Yes | Student/Instructor | BFF: all academic periods with user's accessible courses grouped; `defaultPeriodId` for UI expand |
| GET | `/api/courses/check-exists` | No | — | Check if course exists (query: id) |
| GET | `/api/courses/allowed-for-instructor` | Yes | Instructor (global) | Allowed course **names** for current academic period (`instructor-period-allowances`) |

#### Admin — academic periods & course provisioning (`/api/admin`, `/api/academic-periods`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/admin/course-selection` | Yes | Admin | Admin course selection HTML |
| GET | `/api/admin/course-selection` | Yes | Admin | BFF: periods + all courses grouped |
| POST | `/api/admin/courses` | Yes | Admin | Create course in period; enroll admin + instructors |
| PUT | `/api/admin/courses/:id` | Yes | Admin | Edit course name, period, instructors |
| POST | `/api/admin/courses/:id/ensure-enrollment` | Yes | Admin | Idempotent admin roster enroll on enter |
| GET | `/api/admin/users/search?q=` | Yes | Admin | Faculty search for instructor picker |
| PUT | `/api/admin/instructor-allowances` | Yes | Admin | Set allowed course names per puid + period |
| GET | `/api/academic-periods` | Yes | Admin | List periods |
| POST | `/api/academic-periods` | Yes | Admin | Create period |
| GET | `/api/academic-periods/:id` | Yes | Admin | Get period |
| PUT | `/api/academic-periods/:id` | Yes | Admin | Update period title/dates |

#### Course CRUD (continued)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:id` | Yes* | Any | Get course by ID. \*Auth preferred; course staff receive full `features` + `llmSettings`. Students / non-staff / unauthenticated get a projection that **omits** `features` and `llmSettings` (`toStudentCoursePayload`). Same projection applies to `GET /api/courses` (list/by name) and course-selection course cards. |
| GET | `/api/courses/:courseId/student-capabilities` | Yes | Member | Student-safe booleans only: `{ scenarioGeneration }` — for shell UI; never returns guidedPathway / full features / llmSettings |
| POST | `/api/courses/:id/complete-course-setup` | Yes | Instructor | Finish course-setup on existing shell (`frameType`, `tilesNumber`); sets `courseSetup: true` |
| PUT | `/api/courses/:id` | Yes | Instructor | Update course |
| DELETE | `/api/courses/:id` | Yes | Instructor | Delete course |
| DELETE | `/api/courses/:id/restart-onboarding` | Yes | Instructor | Restart onboarding |
| DELETE | `/api/courses/:id/remove` | Yes | Instructor | Remove course (soft) |
| POST | `/api/courses/:courseId/instructors` | Yes | Instructor | Add instructor |

#### Topic/Week & Items

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses/:courseId/topic-or-week-instances` | Yes | Instructor | Create topic/week |
| PUT | `/api/courses/:courseId/topic-or-week-instances/reorder` | Yes | Instructor | Reorder topic/week instances (`body: { orderedIds: string[] }` — exact permutation; response includes `changed`) |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items` | Yes | Instructor | Create item |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId` | Yes | Instructor | Delete material |

#### Learning Objectives

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives` | Yes | Any | Get objectives |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives` | Yes | Instructor | Create objective |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/reorder` | Yes | Instructor | Reorder learning objectives (`body: { orderedIds: string[] }` — exact permutation; response includes `changed`) |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId` | Yes | Instructor | Update objective (response includes `changed`) |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId` | Yes | Instructor | Delete objective (response includes `changed`) |

#### Instructor struggle topics (per content item; memory-agent catalog)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics` | Yes | Any | Get struggle topics for item |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics` | Yes | Instructor | Create struggle topic |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics/reorder` | Yes | Instructor | Reorder struggle topics (`body: { orderedIds: string[] }` — exact permutation; response includes `changed`) |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics/:struggleTopicId` | Yes | Instructor | Update struggle topic (response includes `changed`) |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics/:struggleTopicId` | Yes | Instructor | Delete struggle topic (response includes `changed`) |

#### Flags (student creates; instructor manages)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses/:courseId/flags` | Yes | Student or Instructor | Create flag (shared) |
| GET | `/api/courses/:courseId/flags` | Yes | Instructor | List flags |
| GET | `/api/courses/:courseId/flags/with-names` | Yes | Instructor | List flags with names |
| GET | `/api/courses/:courseId/flags/:flagId` | Yes | Instructor | Get flag report |
| PUT | `/api/courses/:courseId/flags/:flagId` | Yes | Instructor | Update flag |
| PATCH | `/api/courses/:courseId/flags/:flagId/response` | Yes | Instructor | Update response |

#### Monitor (instructor roster; post-period analytics)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/analytics-access` | Yes | Instructor (staff) | Flags: `canAccessPostPeriodAnalytics`, `canViewCourseSummary`, `canManageRoster`, `periodEndDate`, `isAdminEarlyAccess`, `isAcademicPeriodEnded` |
| PATCH | `/api/courses/:courseId/roster/:userId/role` | Yes | Faculty instructor or **Admin** | Body `{ role: 'student' \| 'ta' }` — promote/demote TA (TAs cannot call) |
| GET | `/api/courses/monitor/:courseId/conversations` | Yes | Instructor (staff) | Per-user conversation rows (no struggle fields) |
| GET | `/api/courses/monitor/:courseId/struggle-stats` | Yes | Staff + **post-period** (admin always) | Course-wide struggle stacked bar + per-user struggle/conversation rows |
| GET | `/api/courses/monitor/:courseId/chat-titles` | Yes | Instructor (staff) | Chat titles for all students |
| GET | `/api/courses/monitor/:courseId/chat/:chatId/download` | Yes | Instructor (staff) | Download full conversation |
| GET | `/api/courses/monitor/:courseId/conversations-export.zip` | Yes | Staff + **post-period** (admin always) | ZIP of all student conversations + struggle topics folder |

**`GET …/conversations` success (200):** `{ success: true, data: MonitorConversationUserRow[], count: number }`. Each row: `userId`, `userName`, `role` (`student` \| `instructor` \| `admin` \| `ta`), `conversationCount`, `chats`. Uses `requireInstructorForCourseAPI`.

**`GET …/struggle-stats` success (200):** Same shape as before. Uses `requireInstructorForCourseAPI` + `requirePostPeriodAnalyticsAPI` (platform admin bypasses period end).

**`GET /api/courses/:courseId/course-summary/status`:** `summary.endDate` from linked academic period. `shouldDisplayModal` is `false` during the active period for all roles; `true` for staff after period ends. `canViewCourseSummary`: admin always; other staff after period. `struggleTopics` and `downloadConversationAvailable` follow `canAccessPostPeriodAnalytics`.

#### Struggle-topic PDF report (post-period; admin early access)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/report.pdf` | Yes | Staff + **post-period** (admin always) | Server-side PDF: CHBE-branded title, outline, distribution chart, zebra-striped student appendix (all students) |

**Query:** `?phase=prototype` (pages 1–3 only) or `?phase=full` (default from UI — adds a paginated table: student name | struggle topics binned by chapter with bold headers, no course-wide counts).

**Success (200):** `Content-Type: application/pdf`; `Content-Disposition` attachment filename `EngE-AI-{courseName}-{academicYear}-{term}-report.pdf`. Uses `requireInstructorForCourseAPI` + `requirePostPeriodAnalyticsAPI`. Reuses D2 `getCourseStruggleStats` aggregation — chart data matches monitor stacked bar. Title page uses CHBE green (`#4d7a2f`) with white text. Appendix rows are built from per-user memory-agent topics only (counts not exposed in student table).

**Errors:** 404 course not found; 403 until period ends (non-admin) or non-staff; 500 render failure.

#### Report fixture seed (Test 3, admin-only, destructive)

Local development helper for report/monitor work. **Only** course name `Test 3` is accepted. Fixture JSON may be any `Record<studentName, string[]>` (default local file: `APSC183-struggle-topic-lists.json` — APSC183 **data** imported into the **Test 3** sandbox).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses/:courseId/report-fixture/seed` | Yes | **Admin** | Remove all Test 3 student roster rows, all `{course}_memory-agent` rows, and prior `seed-test3-*` global users; then import synthetic students with struggle topics |

**Request body:**

```json
{
  "struggleTopicsByStudent": {
    "Student Name": ["topic label one", "topic label two"]
  }
}
```

**Success (200):** `{ success: true, data: { courseId, courseName, studentsSeeded, memoryAgentRowsCreated, studentsRemoved, syntheticGlobalUsersRemoved, globalStudentsUnenrolled } }`

**Errors:** `400` invalid body or course is not Test 3; `401` unauthenticated; `403` not admin for course; `404` course not found; `500` server error.

**Side effects:** Removes all `{course}_users` documents with `affiliation: 'student'`; deletes all `seed-test3-*` rows in `active-users`; unenrolls other global students from Test 3; creates fresh synthetic `active-users` rows for imported students; does not modify `instructorStruggleTopics` catalog or faculty/admin roster rows.

**Local fixture:** `src/test-scripts/APSC183-struggle-topic-lists.json` (gitignored folder). **Smoke script:** `npx ts-node src/test-scripts/verify-test3-report-fixture.ts`.

#### Documents (MongoDB-side delete)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| DELETE | `/api/courses/:courseId/documents/all` | Yes | Instructor | Delete all RAG documents for course |

#### System prompt config (v2, instructor-only)

Platform defaults ship in `src/chat/system-prompts/shared-default/`, `socratic-default/`, and `explanatory-default/` (flat `.md` + JSON manifests; see [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md)). `scenario-generation` was retired as a chat mode — `scenario-generation-default/` is repurposed for the Practice Scenarios feature's generation prompts (§ Scenario Questions below). Per-course overrides live on `activeCourse.systemPromptConfig`. Routes: `src/routes/mongo/system-prompt-config-routes.ts` (mounted from `route-mongo.ts`).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/system-prompts/config` | Yes | Instructor | Full config; SP-001 lazy migrate from `collectionOfSystemPromptItems` and `$unset` legacy field ([DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sp-001-system-prompt-v1--v2), remove by 2026-06-30) |
| PUT | `/api/courses/:courseId/system-prompts/config/modes/:mode` | Yes | Instructor | Autosave `{ modules?, usePlatformDefault? }` for `socratic` or `explanatory` |
| POST | `/api/courses/:courseId/system-prompts/config/modes/:mode/reset` | Yes | Instructor | Set `usePlatformDefault: true` for one mode |
| PUT | `/api/courses/:courseId/system-prompts/config/default-conversation-mode` | Yes | Instructor | `{ mode }` — default teaching mode for new student chats |
| POST | `/api/courses/:courseId/system-prompts/config/validate-plain` | Yes | Instructor | `{ xml }` → `{ ok, modules?, warnings[] }` |
| GET | `/api/courses/:courseId/system-prompts/config/platform-modules/:mode` | Yes | Instructor | Shipped instructor modules from JSON (read-only) |
| POST | `/api/courses/admin/system-prompt-defaults/reload` | Yes | Admin (global) | Reload platform JSON cache from disk |

#### Scenario Questions (Practice Scenarios / Scenario Questions)

Standalone practice bank (`planner/scenario-generation-recovery-plan.md`). Documents live one-per-question in `{courseName}_scenario_questions` — lazy-provisioned on first request via SQ-001 ([DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sq-001-scenario-questions-collection-backfill)), never embedded on `activeCourse`. Chapter grouping uses `TopicOrWeekInstance.id`. Mounted from `src/routes/mongo/scenario-questions-routes.ts`; orchestration lives in `src/scenario-generation/scenario-service.ts`. All routes require `requireCourseFeatureAPI('scenarioGeneration')`.

Two auth tiers: `requireCourseMemberForScenarioAPI` (enrolled student **or** staff — list/get/check-answer/solution/responses) and `requireInstructorForCourseAPI` (create/edit/status/delete/generate/LO catalog). Drafts are **404**, not 403, for students (D5/E-01 — no draft-existence leakage).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/scenario-questions/learning-objectives?topicOrWeekId=` | Yes | Instructor | Topic-scoped LO catalog for generate/editor selectors |
| GET | `/api/courses/:courseId/scenario-questions` | Yes | Member | Instructor: all statuses, `?status=`/`?topicOrWeekId=` filters (projection omits embedded `studentResponses`; includes `studentResponseCount` per part). Student: published only |
| GET | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Member | Instructor: editor projection (no embedded `studentResponses`; `studentResponseCount` per part). Student: 404 unless published (no model answers / response history) |
| POST | `/api/courses/:courseId/scenario-questions` | Yes | Instructor | Manual create (draft) |
| PUT | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Instructor | Edit title/chapter/narrative/parts/LOs (does not change `status`) |
| PATCH | `/api/courses/:courseId/scenario-questions/:questionId/status` | Yes | Instructor | `{ status: 'draft' \| 'published' \| 'rejected' }` — publish re-validates server-side |
| DELETE | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Instructor | Hard delete |
| POST | `/api/courses/:courseId/scenario-questions/generate` | Yes | Instructor | `{ mode, sourcePrompt, topicOrWeekId, learningObjectiveIds?, subQuestionTypes?, difficulty?, title?, count? }` — RAG-grounded AI drafts |
| POST | `/api/courses/:courseId/scenario-questions/:questionId/check-answer` | Yes | Member | `{ subQuestionId, studentAnswer, mode }` → practice: `{ responseId, feedback, feedbackTier?, feedbackSource?, blockReason?, attemptNumber?, attemptsRemaining?, maxAttemptsPerDay?, retryAfterSeconds?, resetsAt?, answerRevealed? }` (no grade). Socratic attempts 1–2/day; descriptive 3–6 with server-attached model answer; 7+ same day blocked; 30s cooldown between attempts. Canned responses when gated (no persist, no LLM). Instructor preview skips limits. Appends embedded history on allowed LLM responses |
| POST | `/api/courses/:courseId/scenario-questions/:questionId/submit-exam` | Yes | Student | `{ answers: [{ subQuestionId, studentAnswer }] }` → `{ overallGrade, results[] }` — batch grade + atomic append; clears exam draft progress on success |
| GET | `/api/courses/:courseId/scenario-questions/:questionId/progress?mode=` | Yes | Student | Caller's draft answers for one question+mode; `{ answers: [] }` when none. Instructors receive `403` |
| PUT | `/api/courses/:courseId/scenario-questions/:questionId/progress` | Yes | Student | `{ mode, answers: [{ subQuestionId, studentAnswer }] }` — upsert draft (explicit save on leave). At least one non-whitespace answer required. Instructors receive `403` |
| GET | `/api/courses/:courseId/scenario-questions/:questionId/responses` | Yes | Member | Caller's own embedded response history only |
| GET | `/api/courses/:courseId/scenario-questions/:questionId/sub-questions/:subQuestionId/student-responses?limit=&offset=` | Yes | Instructor | Paginated student submissions for one sub-question (newest first; default `limit=10`, max `50`). Instructor editor prefetches with `limit=20` and displays 10 per carousel page. `total` is the live embedded-array count on every response. Returns roster `studentName`, `mode`, `studentAnswer`, `feedback`, `submittedAt` |
| GET | `/api/courses/:courseId/scenario-questions/:questionId/solution?mode=` | Yes | Member | Gated reveal — 403 until every sub-question has a response in `mode` (`practice` \| `exam`) |

**Errors:** `400` invalid body / missing-or-duplicate exam answers; `401` unauthenticated; `403` non-member, instructor on submit-exam, or unmet solution gate; `404` course/question not found (including drafts for students); `422` generation/grading failure; `500` server error.


### 4.4 RAG (`/api/rag`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/rag/documents/text` | Yes | Instructor | Upload text document; 201 `data` may include `generatedStruggleTopics`, `struggleGenerationSkipped`, `struggleGenerationWarning` |
| POST | `/api/rag/documents/file` | Yes | Instructor | Upload file (PDF, DOCX, etc.); 201 `data` may include struggle-generation fields (same as text upload) |
| GET | `/api/rag/documents/:courseName` | Yes | Any | List documents (by hierarchy) |
| GET | `/api/rag/documents/:courseName/:contentTitle` | Yes | Any | Documents by content |
| GET | `/api/rag/documents/:courseName/:contentTitle/:subContentTitle` | Yes | Any | Documents by sub-content |
| GET | `/api/rag/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber` | Yes | Any | Get specific chunk |
| POST | `/api/rag/search` | Yes | Any | Vector search |
| DELETE | `/api/rag/wipe-all` | Yes | Instructor | Wipe all RAG data for course |

**Post-upload struggle generation:** After a successful material save, when **Memory Agent** (`features.memoryAgent.enabled`) is on, the server may append instructor struggle-topic labels to the section catalog. When Memory Agent is off, generation is skipped (`struggleGenerationSkipped: true`) and the upload still succeeds. For course **`Test 3`**, labels are loaded deterministically from `src/fixtures/APSC183-instructor-struggle-topics.json` (matched by `Topic N` in section title or filename; up to 5 labels per upload, FIFO dedup). Other courses use LLM structured generation (or mock-response mode when `MOCK_RESPONSE=true`).

### 4.5 Chat (`/api/chat`)

All chat endpoints require auth. Access is scoped by session `currentCourse` and user ownership of chats.

Chat metadata is ordered by most recent activity and contains no conversation-level starring state. The optional `pinnedMessageId` field is a separate message-level affordance and remains supported.

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/chat/user/chats/metadata` | Yes | Any | List chat metadata |
| GET | `/api/chat/user/chats` | Yes | Any | List full chats |
| GET | `/api/chat/conversation-modes` | Yes | Any | List teaching mode catalog (labels only); includes `defaultConversationMode` when session/query course is known |
| POST | `/api/chat/newchat` | Yes | Any | Create new welcome-only chat with persisted `conversationMode: 'undeclared'` |
| POST | `/api/chat/restore/:chatId` | Yes | Any | Restore chat into server memory; lazy mode migration uses message history |
| PATCH | `/api/chat/:chatId/conversation-mode` | Yes | Any | Update teaching mode before the first user message; rejects chats that already contain a user turn |
| POST | `/api/chat/:chatId` | Yes | Any (admin for `/DEBUG`) | Send message; first user message finalizes an undeclared chat to `socratic` or `explanatory` before LLM processing. Platform admins may send `/DEBUG` to toggle sticky prompt-engineer inspection for that chat only. Unstruggle **Yes** (`yes, I am confident with "topic"`) removes the struggle label, strips the prior bot `<questionUnstruggle>` tag, runs a forked LLM call to pick up to 3 verbatim learning-objective **texts** (not ids), randomly samples up to 3 published scenario questions matching those LO texts, and returns a bot message with a random preconfigured encouragement (`{topic}` substitution) plus optional `<scenarioSuggestions>` JSON tag (no main chat LLM). |
| POST | `/api/chat/:chatId/dismiss-unstruggle` | Yes | Any | Dismiss unstruggle |
| GET | `/api/chat/:chatId/history` | Yes | Any | Get chat history |
| GET | `/api/chat/:chatId/message/:messageId` | Yes | Any | Get single message |
| DELETE | `/api/chat/:chatId` | Yes | Any | Delete chat |
| GET | `/api/chat/test` | No | — | Test endpoint |

### 4.6 User Management (`/api/user`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/user/current` | Yes | Any | Current user info |
| POST | `/api/user/update-onboarding` | Yes | Any | Update onboarding state |
| GET | `/api/user/activity` | Yes | Any | Idle poll (read-only; does not bump `lastActivityAt`) |
| POST | `/api/user/activity` | Yes | Any | Bump activity when `{ userActivity: true }`; same response shape as GET |

#### User activity (session idle UX)

Server-owned idle thresholds and client directives. Authenticated `/api/*` (except `GET`/`POST` `/api/user/activity`) bumps `session.lastActivityAt` via `sessionActivityMiddleware`. Expired sessions receive `401` with `code: "INACTIVITY_EXPIRED"` **without** destroying the session (teardown is deferred so SAML SLO can run).

On expiry the frontend redirects to `GET /auth/logout` (same as the Logout button). When SAML is configured, that triggers full IdP Single Log-Out via `SAML_LOGOUT_URL` (e.g. Docker SimpleSAMLphp `SingleLogoutService.php`). `GET /auth/logout` without `req.user` still runs local teardown and clears `engeai.sid`.

**Environment variables**

| Variable | Default | Meaning |
|----------|---------|---------|
| `INACTIVITY_IDLE_BEFORE_WARNING_MS` | `240000` (4 min) | Ms idle before `state → warning`. Legacy alias: `INACTIVITY_WARNING_MS` |
| `INACTIVITY_GRACE_AFTER_WARNING_MS` | `60000` (1 min) | Ms grace after `warningAt` before `state → expired`. Legacy alias: `INACTIVITY_LOGOUT_MS` |
| `INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS` | `5000` | Fixed poll interval while `state === warning` |
| `INACTIVITY_POLL_JITTER_MS` | `250` | Added to active-phase poll so boundary poll lands just after warning |
| `INACTIVITY_POLL_MAX_DELAY_MS` | unset | Optional cap on `pollAfterMs` while `active` |

**Threshold math:** `warningAt = lastActivityAt + idleBeforeWarning`; `expiresAt = warningAt + graceAfterWarning` (not `lastActivityAt + grace`).

**Response shape (200 or 401 when expired):**

```json
{
  "success": true,
  "idle": {
    "serverTime": 0,
    "lastActivityAt": 0,
    "state": "active",
    "warningAt": 0,
    "expiresAt": 0,
    "remainingMsUntilWarning": 0,
    "remainingMsUntilGraceExpiry": 0
  },
  "client": {
    "pollAfterMs": 240250,
    "uiAction": "none",
    "warningCountdownSec": 60
  }
}
```

`client.uiAction`: `none` | `show_inactivity_warning` | `force_logout`. Frontend must schedule the next poll only via `client.pollAfterMs` (`setTimeout`, not `setInterval`) and must not open the warning modal from `idle.state` alone.

**`pollAfterMs` formulas**

| `idle.state` | Formula |
|--------------|---------|
| `active` | `remainingMsUntilWarning + jitter` (optionally `min(..., INACTIVITY_POLL_MAX_DELAY_MS)`) |
| `warning` | `min(remainingMsUntilGraceExpiry + jitter, INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS)` |
| `expired` | `0` |

### 4.7 Health & Version

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check (DB ping) |
| GET | `/api/version` | No | App version (SemVer) |

---

### 4.8 LMS Integration (`/api/lms`)

Per-user connections to Canvas (OAuth 2.0) and Moodle (pasted web service token),
provided by `@ubc/ubc-genai-toolkit-lms-integration`. Implemented in
`src/routes/route-lms.ts`, with the enrollment-sync logic in
`src/lms/canvas-course-sync.ts`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lms/status` | Authenticated | Which providers are enabled; configuration presence only, never secrets |
| GET | `/api/lms/canvas/auth/login` | Authenticated | Redirect to the Canvas authorize screen |
| GET | `/api/lms/canvas/auth/callback` | Authenticated | Exchange the OAuth code and store tokens |
| POST | `/api/lms/canvas/auth/logout` | Authenticated | Revoke and clear stored Canvas tokens |
| GET | `/api/lms/canvas/available-courses` | Authenticated + Canvas connection | The user's Canvas courses, annotated with whether EngE-AI already has each one |
| POST | `/api/lms/canvas/connect-course` | Authenticated + Canvas connection | Import (instructor) or join (student) one Canvas course; body `{ canvasCourseId, academicPeriodId? }` |
| GET | `/api/lms/canvas/courses` | Instructor + Canvas connection | Raw Canvas course list including provider `raw`; diagnostics only |
| POST | `/api/lms/moodle/auth/connect` | Instructor | Validate and store a pasted `wstoken` (body `{ token }`) |
| POST | `/api/lms/moodle/auth/disconnect` | Instructor | Delete the stored Moodle token (does not revoke it in Moodle) |
| GET | `/api/lms/moodle/courses` | Instructor + Moodle connection | Moodle courses the user is enrolled in |

**Course enrollment sync**

- EngE-AI has two kinds of course. **Admin-created** courses are unchanged: students
  join with the six-character `courseCode`. **Canvas-imported** courses carry an
  `activeCourse.lmsLink` and are joined by connecting Canvas.
- An instructor's import creates the EngE-AI course immediately with
  `courseSetup: false`, so the existing setup redirect walks them through week/topic
  configuration on first entry. Canvas supplies a name and code and nothing else.
- A second instructor importing the same Canvas course **joins** the existing EngE-AI
  course rather than creating a duplicate; otherwise co-taught courses would split
  their students across two copies.
- A student connecting a Canvas course their instructor has not imported gets
  `status: 'awaiting_instructor'` on a `200`, not an error — nothing is wrong, and
  only the instructor can resolve it.
- **Sync only ever adds enrollment.** A student whose Canvas enrollment disappears
  keeps EngE-AI access and chat history: a transient Canvas error, a revoked token,
  and a genuine drop are indistinguishable, and silently locking someone out of their
  own conversations is the worse failure.
- **Enrollment is per-user, not roster-matched.** Each user authorizes Canvas as
  themselves, so `getCourses` already returns their own enrollments; there is no
  roster-wide matching of Canvas users to EngE-AI accounts.

**Instructor identity verification**

- An instructor import requires the Canvas `integration_id` — the PUID at UBC — of the
  account **the stored token belongs to** to match the PUID CWL authenticated. OAuth
  alone proves only that *some* Canvas account with a teacher enrollment was authorized,
  not that it belongs to the signed-in user; a shared machine or a colleague still signed
  in would satisfy it.
- **It is not enough to find someone on the roster carrying the user's PUID.** That only
  proves the EngE-AI user teaches the course, which they may do while the token in hand
  belongs to a different teacher on the same course — the exact case a co-taught course
  on a shared browser produces. The connected account is therefore resolved first via
  `GET /users/self` (which returns the account id for anyone, but withholds
  `integration_id` from an ordinary instructor), and the roster is searched **by Canvas
  user id** so the identifier compared is that account's own.
- Reading that identifier requires a roster read. Canvas grants `read_sis` through a
  `TeacherEnrollment` on a **course**, not at the account level, so `GET /users/self`
  returns no `integration_id` for an instructor. Verified against Canvas's
  `lib/api/v1/user.rb` (`user_can_read_sis_data?` resolves against the course context)
  and `permissions_registry.rb` (`read_sis` is `true_for: [AccountAdmin, TeacherEnrollment]`).
- The read is narrowed accordingly: **teacher roster only** (`enrollmentTypes: ['teacher']`
  passed explicitly, since `getCourseUsers` defaults to students), **instructor paths only**,
  compared in memory and never persisted or logged. No student roster is ever read;
  `active-users` remains the only collection holding a PUID at rest.
- **The check runs when listing courses, not only when importing one.** Canvas
  re-authorizes whoever is already signed in to it, so two EngE-AI users sharing a
  browser end up with the second account holding the first user's Canvas token.
  Verifying only at import would mean `available-courses` had already returned the
  other person's course names. One check settles the whole list: `integration_id`
  identifies the Canvas *account*, not the enrollment, so confirming it against the
  first course they teach covers every row and costs one extra request.
- **A genuine mismatch deletes the stored token** (`handleCanvasIdentityError` in
  `route-lms.ts`). Keeping it traps the user: every retry reaches the same wrong Canvas
  account, and the "reconnect" advice cannot work while the bad credential is on file.
  `identifiers_withheld` and `no_puid` deliberately keep the token — the credential may
  be entirely correct, and only Canvas's answer was incomplete.
- Failures raise `CanvasIdentityError` carrying a `reason` (`mismatch` |
  `identifiers_withheld` | `no_puid` | `self_not_on_roster`), which is what the route
  branches on. The reason is also returned in the 403 body. Matching on message text
  would couple credential deletion to wording that exists to be read by humans and changed.
- `self_not_on_roster` means Canvas listed the course under the account's teacher
  enrollments but the account is absent from the teacher roster — a concluded or
  restricted enrolment. No identifier to read and no evidence of impersonation, so the
  credential is kept.
- A roster where *nobody* carried an `integration_id` is reported as a distinct error
  ("Canvas did not return SIS identifiers") rather than as a mismatch. The symptoms are
  identical, and only one is the instructor's to fix — re-authorizing cannot resolve a
  missing account permission. `rosterFieldCoverage` makes the distinction.
- **Students are not verified this way, and cannot be.** Canvas grants `read_sis` to
  teachers, not students, so a student token cannot read `integration_id` for anyone
  including itself. The exposure is bounded — joining this way reaches exactly what the
  course code already grants — but it is a known gap, not an oversight. Closing it needs
  an identity source outside Canvas.

**Notes**

- Not course-scoped — these are per-user LMS connections, so the course-scoped
  guards do not apply. Every route sits behind `requireAuthAPI`.
- **A provider's `requireAuth` proves a usable LMS credential exists, not that the
  holder may act on a course.** Every write therefore re-derives the caller's Canvas
  enrollment from Canvas (`enrollment_type: teacher|student`) and refuses a course id
  absent from it, so a forged `canvasCourseId` cannot import a course the caller does
  not teach.
- Canvas connection is **open to students**, because enrollment sync is a genuine
  student-facing feature — the earlier instructor-only gate existed to avoid storing
  tokens EngE-AI had no use for. **Moodle stays instructor-only**: it has no
  equivalent student feature, so that reasoning still applies there.
- `/api/lms/canvas/courses` remains instructor-only because it returns each course's
  provider `raw` payload verbatim. `/canvas/available-courses` returns normalized
  fields only and is what the UI calls.
- Each provider **self-disables** when its environment variables are unset
  (`CANVAS_DOMAIN`, `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`,
  `CANVAS_REDIRECT_URI`; `MOODLE_DOMAIN`). The app boots normally without LMS
  configuration; `GET /api/lms/status` reports `missingEnv`, and the course-selection
  page renders no Canvas button at all.
- The course routes use the package's `requireAuth`, which answers `401` with a
  `connectUrl` rather than redirecting. A browser-facing LMS **page** route
  should use `canvas.ensureAuth` instead, which redirects to `/login`.
- `CANVAS_REDIRECT_URI` must match the Canvas Developer Key byte-for-byte,
  including port, and its path is this router's `/canvas/auth/callback`.
- Token persistence and the PUID invariant are documented in
  `MONGO_DATA_LAYER.md`.

---

## 5. Role-Based Access Control (RBAC)

### Page-Level (course-routes.ts)

- **validateCourseAccess** — User must be instructor or enrolled. Sets `req.courseContext`.
- **requireInstructorForCourse** — Redirects to `/course-selection` if not instructor.
- **requireStudentForCourse** — Redirects to `/course-selection` if instructor (students only).

### API-Level (requireCourseRole.ts)

- **requireInstructorForCourseAPI(sources)** — Returns 403 JSON if not instructor. Resolves `courseId` from `params`, `paramsId`, `body`, `query`, or `session`.
- **requireStudentForCourseAPI(sources)** — Returns 403 JSON if not enrolled or if instructor.
- **requireInstructorGlobal** — Requires global faculty affiliation (for course creation, allowed-for-instructor).

### Role Summary

| Endpoint Type | Student | Instructor |
|---------------|---------|------------|
| Course entry, current course | ✅ | ✅ |
| Create flag | ✅ | ✅ |
| Chat (own chats) | ✅ | ✅ |
| Learning objectives (read) | ✅ | ✅ |
| RAG documents (read), search | ✅ | ✅ |
| Course CRUD, instructors | ❌ | ✅ |
| Flags (list, update) | ❌ | ✅ |
| Monitor (chat titles, download) | ❌ | ✅ |
| RAG upload, wipe, documents/all | ❌ | ✅ |
| Objectives (create, update, delete) | ❌ | ✅ |
| Materials delete | ❌ | ✅ |

---

## 6. Modular Orchestration

### Route → Function Mapping

| Route File | Primary Functions |
|------------|-------------------|
| `course-routes.ts` | validateCourseAccess, requireInstructorForCourse, requireStudentForCourse |
| `mongo-app.ts` | EngEAI_MongoDB |
| `rag-routes.ts` | RAGApp |
| `chat-app.ts` | ChatApp, EngEAI_MongoDB; RAG via `RAGApp` + `ragPrompts` |
| `course-entry.ts` | EngEAI_MongoDB |
| `user-management.ts` | EngEAI_MongoDB |
| `auth.ts` | Passport, EngEAI_MongoDB |

### Middleware Chain (Typical API)

1. Express body parsing
2. Session
3. Passport init/session
4. Route-specific: `asyncHandlerWithAuth`, `requireInstructorForCourseAPI`, etc.
5. Handler

---

## 7. Testing

### Variables

```javascript
const BASE = 'http://localhost:8020';  // or your server URL
const COURSE_ID = 'your-course-id';
const CHAT_ID = 'your-chat-id';
```

### Example: Test RBAC (Browser Console)

```javascript
// As student: instructor-only endpoint should return 403
const res = await fetch(`${BASE}/api/courses/${COURSE_ID}/documents/all`, {
  method: 'DELETE',
  credentials: 'include'
});
console.log(res.status);  // Expect 403 if student

// As instructor: should succeed (or 404 if no documents)
const res2 = await fetch(`${BASE}/api/courses/${COURSE_ID}/documents/all`, {
  method: 'DELETE',
  credentials: 'include'
});
console.log(res2.status);
```

### Example: Chat Page

```javascript
const res = await fetch(`${BASE}/api/chat/user/chats/metadata`, { credentials: 'include' });
const data = await res.json();
console.log(data);
```

### Example: Learning Objectives

```javascript
const res = await fetch(
  `${BASE}/api/courses/${COURSE_ID}/topic-or-week-instances/TOPIC_ID/items/ITEM_ID/objectives`,
  { credentials: 'include' }
);
const data = await res.json();
console.log(data);
```

### Example: Delete All Documents (Instructor)

```javascript
const res = await fetch(`${BASE}/api/courses/${COURSE_ID}/documents/all`, {
  method: 'DELETE',
  credentials: 'include'
});
console.log(res.status, await res.json());
```

---

## 8. Design Rationale

1. **Page vs API separation** — Page routes serve shells; APIs return JSON. Clear separation for Canvas iframe and SPA patterns.
2. **Role enforcement at both layers** — Page routes redirect; API routes return 403. Prevents students from accessing instructor features even via direct API calls.
3. **Shared vs role-specific** — Chat, course entry, and flag creation are shared; course management, RAG upload, flags list/update, and monitor are instructor-only.
4. **Modular routes** — Each domain (courses, chat, RAG, auth, user) has its own router for maintainability.
5. **Session-based course context** — `currentCourse` in session drives chat and RAG operations; `courseId` in params/body drives course-scoped APIs.

### Chat RAG flow (`POST /api/chat/:chatId`)

On each student message, `ChatApp` orchestrates retrieval through two RAG classes (shared `RAGModule` from `RAGApp`):

1. **`RAGApp.retrieveForChat`** — vector search with published-item filter (skipped in developer mode)
2. **`ragPrompts.formatRetrievedContext`** — wraps chunks in `<course_materials>...</course_materials>`
3. **`ragPrompts.formatRagUserTurn`** — appends mode-specific bridge (Socratic) and the raw student message
4. Forked LLM conversation receives the assembled user turn; stored chat history keeps the clean student message only
5. Memory-agent analysis uses **`ragPrompts.stripRagFromUserMessage`** to remove injected context from prior turns

**Conversation mode lifecycle:** `undeclared` is a persisted chat lifecycle state, not an LLM prompt mode. New chats are stored as `conversationMode === 'undeclared'` while they contain only the welcome message. The first `POST /api/chat/:chatId` includes the selected real mode (`socratic` or `explanatory`); the backend persists that mode, rebuilds the LLM conversation, and only then processes the user turn. `PATCH /api/chat/:chatId/conversation-mode` remains available for welcome-only chats, but chats with a user message reject mode changes.

**Admin `/DEBUG`:** Platform admins (`ADMINS` / `GlobalUser.isAdmin`) may send exactly `/DEBUG` to toggle a sticky in-memory debug flag for that chat. While on, subsequent messages skip pathways/RAG/MOCK_RESPONSE and use a prompt-engineer system prompt that includes the full teaching system prompt; replies are wrapped as `**DEBUG MODE**`. Non-admins receive 403. Flag clears when the chat is evicted from memory.

**Lazy restore migration:** if `conversationMode` is already `socratic` or `explanatory`, restore leaves it unchanged. Missing, invalid, or `undeclared` rows with any user message are backfilled to `socratic` to preserve historical default behavior. Missing, invalid, or `undeclared` rows with no user messages are written as `undeclared` so the picker remains editable.

**Struggle topics (current phase):** memory-agent detection and per-turn `<struggle_topics>` injection apply only to finalized Socratic chats (`conversationMode === 'socratic'`). Explanatory chats use the PROSE instructor modules from platform JSON and an Explanatory RAG user-turn bridge in `rag-prompts.ts`; they do not receive struggle-topic injection.

**System prompt assembly (v2):** `assembleCourseSystemPrompt()` builds `<system_prompt mode="…">` XML from platform JSON (`instructorModules` only in v1.3.0+) plus optional per-course overrides in Mongo (`systemPromptConfig`). Learning objectives are injected into the `course main intro` module. See `src/chat/system-prompts/assemble-course-system-prompt.ts`.
