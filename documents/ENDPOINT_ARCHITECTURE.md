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
| `/api/course` | courseEntryRoutes | Course entry, enter-by-code, current course |
| `/api/user` | userManagementRoutes | User profile, onboarding, activity |
| `/api/health` | healthRoutes | Health check |
| `/api/version` | versionRoutes | App version (SemVer) |

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
| `GET /course/:courseId/instructor` | Redirects to documents |
| `GET /course/:courseId/instructor/documents` | Document management |
| `GET /course/:courseId/instructor/flags` | Flag reports |
| `GET /course/:courseId/instructor/monitor` | Student chat monitoring |
| `GET /course/:courseId/instructor/chat` | Instructor chat |
| `GET /course/:courseId/instructor/assistant-prompts` | Assistant prompts |
| `GET /course/:courseId/instructor/system-prompts` | System prompts |
| `GET /course/:courseId/instructor/scenario-questions` | Scenario Questions (Practice Scenarios authoring) |
| `GET /course/:courseId/instructor/course-information` | Course info |
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
| `GET /course/:courseId/student/scenarios` | Practice Scenarios |
| `GET /course/:courseId/student/profile` | Profile |
| `GET /course/:courseId/student/flag-history` | Flag history |
| `GET /course/:courseId/student/about` | About page |
| `GET /course/:courseId/student/onboarding/student` | Student onboarding |

---

## 4. API Routes by Domain

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
| GET | `/api/courses/:id` | Yes | Any | Get course by ID |
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

Standalone practice bank (`planner/scenario-generation-recovery-plan.md`). Documents live one-per-question in `{courseName}_scenario_questions` — lazy-provisioned on first request via SQ-001 ([DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sq-001-scenario-questions-collection-backfill)), never embedded on `activeCourse`. Chapter grouping uses `TopicOrWeekInstance.id`. Mounted from `src/routes/mongo/scenario-questions-routes.ts`; orchestration lives in `src/scenario-generation/scenario-service.ts`.

Two auth tiers: `requireCourseMemberForScenarioAPI` (enrolled student **or** staff — list/get/check-answer/solution/responses) and `requireInstructorForCourseAPI` (create/edit/status/delete/generate/LO catalog). Drafts are **404**, not 403, for students (D5/E-01 — no draft-existence leakage).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/scenario-questions/learning-objectives?topicOrWeekId=` | Yes | Instructor | Topic-scoped LO catalog for generate/editor selectors |
| GET | `/api/courses/:courseId/scenario-questions` | Yes | Member | Instructor: all statuses, `?status=`/`?topicOrWeekId=` filters. Student: published only |
| GET | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Member | Instructor: full document any status. Student: 404 unless published (no model answers / response history) |
| POST | `/api/courses/:courseId/scenario-questions` | Yes | Instructor | Manual create (draft) |
| PUT | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Instructor | Edit title/chapter/narrative/parts/LOs (does not change `status`) |
| PATCH | `/api/courses/:courseId/scenario-questions/:questionId/status` | Yes | Instructor | `{ status: 'draft' \| 'published' \| 'rejected' }` — publish re-validates server-side |
| DELETE | `/api/courses/:courseId/scenario-questions/:questionId` | Yes | Instructor | Hard delete |
| POST | `/api/courses/:courseId/scenario-questions/generate` | Yes | Instructor | `{ mode, sourcePrompt, topicOrWeekId, learningObjectiveIds?, subQuestionTypes?, difficulty?, title?, count? }` — RAG-grounded AI drafts |
| POST | `/api/courses/:courseId/scenario-questions/:questionId/check-answer` | Yes | Member | `{ subQuestionId, studentAnswer, mode }` → `{ responseId, grade (1–10), feedback }` — appends embedded history |
| POST | `/api/courses/:courseId/scenario-questions/:questionId/submit-exam` | Yes | Student | `{ answers: [{ subQuestionId, studentAnswer }] }` → `{ overallGrade, results[] }` — batch grade + atomic append |
| GET | `/api/courses/:courseId/scenario-questions/:questionId/responses` | Yes | Member | Caller's own embedded response history only |
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

**Post-upload struggle generation:** After a successful material save, the server may append instructor struggle-topic labels to the section catalog. For course **`Test 3`**, labels are loaded deterministically from `src/fixtures/APSC183-instructor-struggle-topics.json` (matched by `Topic N` in section title or filename; up to 5 labels per upload, FIFO dedup). Other courses use LLM structured generation (or dev-mode mocks when `DEVELOPING_MODE=true`).

### 4.5 Chat (`/api/chat`)

All chat endpoints require auth. Access is scoped by session `currentCourse` and user ownership of chats.

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/chat/user/chats/metadata` | Yes | Any | List chat metadata |
| GET | `/api/chat/user/chats` | Yes | Any | List full chats |
| GET | `/api/chat/conversation-modes` | Yes | Any | List teaching mode catalog (labels only); includes `defaultConversationMode` when session/query course is known |
| POST | `/api/chat/newchat` | Yes | Any | Create new welcome-only chat with persisted `conversationMode: 'undeclared'` |
| POST | `/api/chat/restore/:chatId` | Yes | Any | Restore chat into server memory; lazy mode migration uses message history |
| PATCH | `/api/chat/:chatId/conversation-mode` | Yes | Any | Update teaching mode before the first user message; rejects chats that already contain a user turn |
| POST | `/api/chat/:chatId` | Yes | Any | Send message; first user message finalizes an undeclared chat to `socratic` or `explanatory` before LLM processing |
| POST | `/api/chat/:chatId/dismiss-unstruggle` | Yes | Any | Dismiss unstruggle |
| GET | `/api/chat/:chatId/history` | Yes | Any | Get chat history |
| GET | `/api/chat/:chatId/message/:messageId` | Yes | Any | Get single message |
| DELETE | `/api/chat/:chatId` | Yes | Any | Delete chat |
| PUT | `/api/chat/:chatId/pin` | Yes | Any | Pin/unpin chat |
| GET | `/api/chat/test` | No | — | Test endpoint |

### 4.6 User Management (`/api/user`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/user/current` | Yes | Any | Current user info |
| POST | `/api/user/update-onboarding` | Yes | Any | Update onboarding state |
| POST | `/api/user/activity` | Yes | Any | Record activity |

### 4.7 Health & Version

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check (DB ping) |
| GET | `/api/version` | No | App version (SemVer) |

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

**Lazy restore migration:** if `conversationMode` is already `socratic` or `explanatory`, restore leaves it unchanged. Missing, invalid, or `undeclared` rows with any user message are backfilled to `socratic` to preserve historical default behavior. Missing, invalid, or `undeclared` rows with no user messages are written as `undeclared` so the picker remains editable.

**Struggle topics (current phase):** memory-agent detection and per-turn `<struggle_topics>` injection apply only to finalized Socratic chats (`conversationMode === 'socratic'`). Explanatory chats use the PROSE instructor modules from platform JSON and an Explanatory RAG user-turn bridge in `rag-prompts.ts`; they do not receive struggle-topic injection.

**System prompt assembly (v2):** `assembleCourseSystemPrompt()` builds `<system_prompt mode="…">` XML from platform JSON (`instructorModules` only in v1.3.0+) plus optional per-course overrides in Mongo (`systemPromptConfig`). Learning objectives are injected into the `course main intro` module. See `src/chat/system-prompts/assemble-course-system-prompt.ts`.
