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
| POST | `/api/course/enter` | Yes | Any | Enter course by ID |
| POST | `/api/course/enter-by-code` | Yes | Any | Enter course by code |
| GET | `/api/course/current` | Yes | Any | Get current course from session |

### 4.3 Courses & Content (`/api/courses`)

#### Course CRUD

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses` | Yes | Instructor (global) | Create new course |
| GET | `/api/courses` | Yes | Any | List courses (filtered by role) |
| GET | `/api/courses/check-exists` | No | — | Check if course exists (query: id) |
| GET | `/api/courses/allowed-for-instructor` | Yes | Instructor (global) | Courses instructor can manage |
| GET | `/api/courses/:id` | Yes | Any | Get course by ID |
| PUT | `/api/courses/:id` | Yes | Instructor | Update course |
| DELETE | `/api/courses/:id` | Yes | Instructor | Delete course |
| DELETE | `/api/courses/:id/restart-onboarding` | Yes | Instructor | Restart onboarding |
| DELETE | `/api/courses/:id/remove` | Yes | Instructor | Remove course (soft) |
| POST | `/api/courses/:courseId/instructors` | Yes | Instructor | Add instructor |

#### Topic/Week & Items

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses/:courseId/topic-or-week-instances` | Yes | Instructor | Create topic/week |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items` | Yes | Instructor | Create item |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId` | Yes | Instructor | Delete material |

#### Learning Objectives

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives` | Yes | Any | Get objectives |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives` | Yes | Instructor | Create objective |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId` | Yes | Instructor | Update objective |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId` | Yes | Instructor | Delete objective |

#### Instructor struggle topics (per content item; memory-agent catalog)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics` | Yes | Any | Get struggle topics for item |
| POST | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics` | Yes | Instructor | Create struggle topic |
| PUT | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics/:struggleTopicId` | Yes | Instructor | Update struggle topic |
| DELETE | `/api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/struggle-topics/:struggleTopicId` | Yes | Instructor | Delete struggle topic |

#### Flags (student creates; instructor manages)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/courses/:courseId/flags` | Yes | Student or Instructor | Create flag (shared) |
| GET | `/api/courses/:courseId/flags` | Yes | Instructor | List flags |
| GET | `/api/courses/:courseId/flags/with-names` | Yes | Instructor | List flags with names |
| GET | `/api/courses/:courseId/flags/:flagId` | Yes | Instructor | Get flag report |
| PUT | `/api/courses/:courseId/flags/:flagId` | Yes | Instructor | Update flag |
| PATCH | `/api/courses/:courseId/flags/:flagId/response` | Yes | Instructor | Update response |

#### Monitor (instructor-only)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/monitor/:courseId/chat-titles` | Yes | Instructor* | Chat titles for all students |
| GET | `/api/courses/monitor/:courseId/chat/:chatId/download` | Yes | Instructor* | Download full conversation |

*Monitor routes use `asyncHandlerWithAuth` only; instructor access is enforced at page level. Consider adding `requireInstructorForCourseAPI` for defense in depth.

#### Documents (MongoDB-side delete)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| DELETE | `/api/courses/:courseId/documents/all` | Yes | Instructor | Delete all RAG documents for course |

#### System prompt config (v2, instructor-only)

Platform defaults ship in `src/chat/system-prompts/shared-default/`, `socratic-default/`, and `explanatory-default/` (flat `.md` + JSON manifests; see [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md)). Per-course overrides live on `activeCourse.systemPromptConfig`. Routes: `src/routes/mongo/system-prompt-config-routes.ts` (mounted from `route-mongo.ts`).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/courses/:courseId/system-prompts/config` | Yes | Instructor | Full config; SP-001 lazy migrate from `collectionOfSystemPromptItems` and `$unset` legacy field ([DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sp-001-system-prompt-v1--v2), remove by 2026-06-30) |
| PUT | `/api/courses/:courseId/system-prompts/config/modes/:mode` | Yes | Instructor | Autosave `{ modules?, usePlatformDefault? }` for `socratic` or `explanatory` |
| POST | `/api/courses/:courseId/system-prompts/config/modes/:mode/reset` | Yes | Instructor | Set `usePlatformDefault: true` for one mode |
| PUT | `/api/courses/:courseId/system-prompts/config/default-conversation-mode` | Yes | Instructor | `{ mode }` — default teaching mode for new student chats |
| POST | `/api/courses/:courseId/system-prompts/config/validate-plain` | Yes | Instructor | `{ xml }` → `{ ok, modules?, warnings[] }` |
| GET | `/api/courses/:courseId/system-prompts/config/platform-modules/:mode` | Yes | Instructor | Shipped instructor modules from JSON (read-only) |
| POST | `/api/courses/admin/system-prompt-defaults/reload` | Yes | Admin (global) | Reload platform JSON cache from disk |

### 4.4 RAG (`/api/rag`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/rag/documents/text` | Yes | Instructor | Upload text document |
| POST | `/api/rag/documents/file` | Yes | Instructor | Upload file (PDF, DOCX, etc.) |
| GET | `/api/rag/documents/:courseName` | Yes | Any | List documents (by hierarchy) |
| GET | `/api/rag/documents/:courseName/:contentTitle` | Yes | Any | Documents by content |
| GET | `/api/rag/documents/:courseName/:contentTitle/:subContentTitle` | Yes | Any | Documents by sub-content |
| GET | `/api/rag/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber` | Yes | Any | Get specific chunk |
| POST | `/api/rag/search` | Yes | Any | Vector search |
| DELETE | `/api/rag/wipe-all` | Yes | Instructor | Wipe all RAG data for course |

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
