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
| `/api/version` | versionRoutes | Backend version |

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
| POST | `/api/chat/newchat` | Yes | Any | Create new chat |
| POST | `/api/chat/:chatId` | Yes | Any | Send message (streaming) |
| POST | `/api/chat/:chatId/dismiss-unstruggle` | Yes | Any | Dismiss unstruggle |
| GET | `/api/chat/:chatId/history` | Yes | Any | Get chat history |
| GET | `/api/chat/:chatId/message/:messageId` | Yes | Any | Get single message |
| POST | `/api/chat/restore/:chatId` | Yes | Any | Restore deleted chat |
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
| GET | `/api/version` | No | Backend version |

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
| `chat-app.ts` | ChatApp, EngEAI_MongoDB |
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
