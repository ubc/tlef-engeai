# EngE-AI Authentication System Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication Flow](#authentication-flow)
3. [Data Structures](#data-structures)
4. [Code Components](#code-components)
5. [Session Management](#session-management)
6. [Course User Creation](#course-user-creation)
7. [Privacy & Security](#privacy--security)
8. [API Endpoints](#api-endpoints)
9. [Frontend Integration](#frontend-integration)

---

## Overview

The EngE-AI authentication system uses a **two-tier user model**:
- **GlobalUser**: Cross-course user identity stored in `active-users` collection (contains PUID)
- **CourseUser**: Course-specific user data stored in `{courseName}_users` collections (no PUID)

The system supports two authentication methods:
- **UBCShib (SAML 2.0) Authentication** (Production): UBC CWL integration via the `passport-ubcshib` strategy
- **Local Authentication** (Development): Username/password with hardcoded test users

**Key Principle**: PUID (Privacy-focused Unique Identifier) is **NEVER** sent to the frontend. Only `userId` is used for frontend operations.

### Configuration & Environment Variables

- Backend dependency: `passport-ubcshib@0.1.6` wraps UBC's SAML 2.0 endpoints and replaces the legacy `passport-saml` usage.
- `SAML_AVAILABLE`: `true` (default) enables UBCShib; set to `false` for the local fake-user fallback.
- `SAML_ISSUER`, `SAML_ENTRY_POINT`, `SAML_CALLBACK_URL`, `SAML_LOGOUT_URL`, `SAML_METADATA_URL`, `SAML_CERT_PATH`: reused by the `passport-ubcshib` strategy for CWL integration. These align with the docker-simple-saml setup and production CWL configuration.
- Certificates are read from `SAML_CERT_PATH` (defaults to `certs/server.crt`), matching earlier SAML deployments.

**Testing & Rollback**

- Validate locally using the docker-simple-saml environment before pointing at CWL staging.
- For immediate rollback (e.g., IdP outage), set `SAML_AVAILABLE=false` to revert to the local authentication path without redeploying code.

---

## Authentication Flow

### Phase 1: Initial Login (Unregistered User)

#### Step 1: User Initiates Login

**Frontend Action:**
- User navigates to `/auth/login` or clicks login button
- Frontend calls `authService.login()` which redirects to `/auth/login`

**Backend Route:** `GET /auth/login`
- **File**: `src/routes/auth.ts` (lines 21-41)
- **UBCShib Mode**: Redirects to the CWL IdP via `passport-ubcshib`
- **Local Mode**: Serves login page (`local-login.html`)

#### Step 2: Authentication Provider Verification

**UBCShib Flow:**
1. User redirected to UBC CWL login page
2. User enters CWL credentials
3. UBC IdP validates credentials
4. IdP redirects back to `/auth/saml/callback` with SAML assertion

**Local Flow:**
1. User enters username/password on login page
2. Form submits to `POST /auth/login`
3. Passport LocalStrategy validates credentials

**Code Location:**
- **UBCShib Strategy**: `src/middleware/passport.ts` (lines 49-143)
- **Local Strategy**: `src/middleware/passport.ts` (lines 145-192)

#### Step 3: Passport Authentication

**UBCShib Callback:**
- **Route**: `POST /auth/saml/callback`
- **File**: `src/routes/auth.ts` (lines 44-113)
- **Process**:
  1. `passport.authenticate('ubcshib')` validates the SAML 2.0 assertion
  2. The UBCShib profile is normalized into the user object (lines 79-138 in passport.ts)
  3. User object created with: `username`, `puid`, `firstName`, `lastName`, `affiliation`
  4. `req.user` is populated by Passport

**Local Login:**
- **Route**: `POST /auth/login`
- **File**: `src/routes/auth.ts` (lines 116-201)
- **Process**:
  1. `passport.authenticate('local', callback)` validates credentials
  2. Custom callback receives authenticated user
  3. User object from `FAKE_USERS` (lines 20-43 in passport.ts)
  4. `req.logIn(user)` serializes user to session

#### Step 4: GlobalUser Creation/Lookup

**After Authentication Success:**

**Code Location**: `src/routes/auth.ts` (lines 68-89 for SAML, 156-174 for Local)

**Process:**
1. Extract PUID from `req.user.puid`
2. Query MongoDB: `mongoDB.findGlobalUserByPUID(puid)`
3. **If GlobalUser doesn't exist** (First-time user):
   - Generate `userId`: `mongoDB.idGenerator.globalUserID(puid, name, affiliation)`
   - Create GlobalUser in `active-users` collection:
     ```typescript
     {
       name: string,
       puid: string,        // ONLY stored here
       userId: string,      // Generated unique ID
       coursesEnrolled: [],
       affiliation: 'student' | 'faculty',
       status: 'active',
       createdAt: Date,
       updatedAt: Date
     }
     ```
4. **If GlobalUser exists**:
   - Retrieve existing GlobalUser from database
   - Use existing `userId`

#### Step 5: Session Storage

**Code Location**: `src/routes/auth.ts` (lines 94, 195)

**Process:**
1. Store GlobalUser in session: `req.session.globalUser = globalUser`
   - **Contains**: Full GlobalUser object including PUID (backend only)
2. Passport serializes `req.user` to session via `serializeUser()`
   - **Contains**: User object from authentication (username, puid, firstName, lastName, affiliation)
3. Session saved: `req.session.save()`
4. Redirect to course selection: `/pages/course-selection.html`

**Session Structure:**
```typescript
req.session = {
  globalUser: GlobalUser,      // Full object with PUID
  currentCourse?: {            // Set later during course entry
    courseId: string,
    courseName: string
  }
}

req.user = {                   // From Passport (serialized)
  username: string,
  puid: string,
  firstName: string,
  lastName: string,
  affiliation: string,
  // ... other SAML/local fields
}
```

---

### Phase 2: Subsequent Requests (Authenticated User)

#### Request Flow

**Middleware Chain** (in order):
1. **CORS** (`app.use(cors())`)
2. **Body Parsers** (`express.json()`, `express.urlencoded()`)
3. **Session Middleware** (`sessionMiddleware`) - `src/middleware/session.ts`
   - Reads session cookie
   - Attaches `req.session` from session store
4. **Passport Initialize** (`passport.initialize()`)
5. **Passport Session** (`passport.session()`) - **Critical**
   - Calls `deserializeUser()` to restore `req.user` from session
   - `req.user` is now available on all authenticated requests
6. **Request Logging**
7. **Static Files**
8. **Route Handlers**

**Code Location**: `src/server.ts` (lines 25-59)

#### API Endpoint: `/auth/me` or `/auth/current-user`

**Code Location**: `src/routes/auth.ts` (lines 296-391, 393-488)

**Process:**
1. Check authentication: `req.isAuthenticated()`
2. Get `userId` from session: `req.session.globalUser.userId`
3. Query MongoDB: `mongoDB.findGlobalUserByUserId(userId)`
   - **Note**: Uses `userId`, NOT PUID (privacy protection)
4. Validate session data matches database:
   - `userId` matches
   - `affiliation` matches
5. Build response:
   ```typescript
   {
     authenticated: true,
     user: {
       username: string,      // From req.user
       userId: string,         // From GlobalUser
       affiliation: string      // From GlobalUser
     },
     globalUser: {             // Sanitized (no PUID)
       userId: string,
       name: string,
       affiliation: string,
       status: string,
       coursesEnrolled: string[]
     }
   }
   ```

**Key Point**: PUID is **never** sent to frontend. The `sanitizeGlobalUserForFrontend()` function removes it.

---

### Phase 3: Course Entry (CourseUser Creation)

#### User Selects Course

**Frontend Action:**
- User selects a course from course selection page
- Frontend calls `POST /api/course/enter` with `courseId`

**Code Location**: `src/routes/course-entry.ts` (lines 19-134)

#### Course Entry Process

**Step 1: Get GlobalUser from Session**
```typescript
const globalUser = req.session.globalUser;
// Contains: puid, userId, name, affiliation, coursesEnrolled, etc.
```

**Step 2: Get Course Details**
```typescript
const course = await mongoDB.getActiveCourse(courseId);
// Returns: courseName, courseId, instructors, etc.
```

**Step 3: Check for Existing CourseUser**
```typescript
let courseUser = await mongoDB.findStudentByPUID(
  course.courseName, 
  globalUser.puid  // Uses PUID for lookup (backend only)
);
```

**Step 4: Create CourseUser if Needed**
If CourseUser doesn't exist:
```typescript
const newCourseUserData = {
  name: globalUser.name,
  userId: globalUser.userId,        // Reuse from GlobalUser
  courseName: course.courseName,
  courseId: course.id,
  userOnboarding: false,
  affiliation: globalUser.affiliation,
  status: 'active',
  chats: []
};

courseUser = await mongoDB.createStudent(
  course.courseName, 
  newCourseUserData
);
```

**Step 5: Initialize Memory Agent**
```typescript
await mongoDB.initializeMemoryAgentForUser(
  course.courseName,
  globalUser.userId,    // Uses userId, not PUID
  globalUser.name,
  globalUser.affiliation
);
```

**Step 6: Update GlobalUser**
```typescript
if (!globalUser.coursesEnrolled.includes(courseId)) {
  await mongoDB.addCourseToGlobalUser(
    globalUser.puid,    // Uses PUID for lookup (backend only)
    courseId
  );
}
```

**Step 7: Store Current Course in Session**
```typescript
req.session.currentCourse = {
  courseId: course.id,
  courseName: course.courseName
};
```

**Step 8: Determine Redirect**
- Student without onboarding → `/pages/student-mode.html` (with onboarding)
- Student with onboarding → `/pages/student-mode.html` (chat interface)
- Faculty → `/pages/instructor-mode.html`

---

## Data Structures

### GlobalUser (Database: `active-users` collection)

**Location**: `src/functions/types.ts` (lines 203-212)

```typescript
interface GlobalUser {
  name: string;                    // Full name: "FirstName LastName"
  puid: string;                    // Privacy-focused Unique Identifier - ONLY stored here
  userId: string;                   // Generated unique ID (string format)
  coursesEnrolled: string[];       // Array of course IDs
  affiliation: 'student' | 'faculty';
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}
```

**Storage**: MongoDB `active-users` collection
**Session Storage**: `req.session.globalUser` (full object with PUID)
**Frontend**: Sanitized version (PUID removed) via `sanitizeGlobalUserForFrontend()`

### CourseUser (Database: `{courseName}_users` collections)

**Location**: `src/functions/types.ts` (lines 168-179)

```typescript
interface CourseUser {
  name: string;                    // User's name
  userId: string;                  // From GlobalUser (NO PUID stored here)
  courseName: string;             // Full course name
  courseId: string;                // Course unique ID
  userOnboarding: boolean;         // Course-specific onboarding status
  affiliation: 'student' | 'faculty';
  status: 'active' | 'inactive';
  chats: Chat[];                   // Course-specific chat history
  createdAt: Date;
  updatedAt: Date;
}
```

**Storage**: MongoDB `{courseName}_users` collection (one per course)
**Key Point**: CourseUser does **NOT** contain PUID (privacy protection)

### req.user (Passport Session Object)

**Location**: Set by Passport during authentication

```typescript
// SAML Authentication
{
  username: string,        // From SAML: cwlLoginName
  puid: string,            // From SAML: cwlLoginKey
  firstName: string,       // From SAML: givenName
  lastName: string,        // From SAML: sn
  affiliation: string,     // From SAML: eduPersonAffiliation
  email: string,
  sessionIndex: string,    // For SAML logout
  nameID: string,
  nameIDFormat: string
}

// Local Authentication
{
  username: 'student' | 'instructor',
  puid: 'FAKE_STUDENT_PUID_001' | 'FAKE_INSTRUCTOR_PUID_001',
  firstName: 'Test',
  lastName: 'Student' | 'Instructor',
  affiliation: 'student' | 'faculty',
  email: string,
  // ... other fields
}
```

**Storage**: Passport session (via `serializeUser()`)
**Usage**: Backend only - never sent to frontend

### Frontend User Interface

**Location**: `public/scripts/services/AuthService.ts` (lines 12-16)

```typescript
interface User {
  username: string;
  userId: string;         // From GlobalUser
  affiliation: string;    // From GlobalUser
  // NO PUID, firstName, or lastName
}
```

**Source**: API response from `/auth/me` or `/auth/current-user`
**Key Point**: Frontend never receives PUID, firstName, or lastName

---

## Code Components

### 1. Authentication Routes

**File**: `src/routes/auth.ts`

**Key Endpoints:**
- `GET /auth/login` - Initiates login (SAML redirect or login page)
- `POST /auth/login` - Local authentication handler
- `POST /auth/saml/callback` - SAML callback handler
- `GET /auth/logout` - Logout handler
- `GET /auth/me` - Get current user (legacy)
- `GET /auth/current-user` - Get current user

**Key Functions:**
- GlobalUser creation/lookup after authentication
- Session management
- User data sanitization for frontend

### 2. Passport Configuration

**File**: `src/middleware/passport.ts`

**Key Components:**
- **SAML Strategy**: Maps SAML profile to user object
- **Local Strategy**: Validates local credentials against FAKE_USERS
- **Serialization**: `serializeUser()` - stores user in session
- **Deserialization**: `deserializeUser()` - restores user from session

**FAKE_USERS** (Development only):
```typescript
{
  student: { username, puid, firstName, lastName, affiliation, ... },
  instructor: { username, puid, firstName, lastName, affiliation, ... }
}
```

### 3. Session Middleware

**File**: `src/middleware/session.ts`

**Configuration:**
- Secret: `SESSION_SECRET` environment variable
- Cookie: `engeai.sid`
- Secure: HTTPS-only in production, HTTP allowed in development
- HttpOnly: true (prevents client-side access)
- MaxAge: 2 hours default

### 4. MongoDB Operations

**File**: `src/functions/EngEAI_MongoDB.ts`

**Key Methods:**
- `findGlobalUserByPUID(puid)` - Find GlobalUser by PUID
- `findGlobalUserByUserId(userId)` - Find GlobalUser by userId (preferred)
- `createGlobalUser(userData)` - Create new GlobalUser
- `findStudentByPUID(courseName, puid)` - Find CourseUser by PUID
- `findStudentByUserId(courseName, userId)` - Find CourseUser by userId
- `createStudent(courseName, userData)` - Create new CourseUser
- `addCourseToGlobalUser(puid, courseId)` - Add course to enrolled list

### 5. User Utilities

**File**: `src/functions/user-utils.ts`

**Key Function:**
- `sanitizeGlobalUserForFrontend(globalUser)` - Removes PUID before sending to frontend

### 6. Course Entry

**File**: `src/routes/course-entry.ts`

**Key Endpoint:**
- `POST /api/course/enter` - Creates/retrieves CourseUser and stores current course in session

### 7. User Management

**File**: `src/routes/user-management.ts`

**Key Endpoints:**
- `GET /api/user/current` - Get current CourseUser from session
- `POST /api/user/update-onboarding` - Update CourseUser onboarding status

---

## Session Management

### Session Storage

**Backend Session** (`req.session`):
```typescript
{
  globalUser: GlobalUser,        // Full object with PUID
  currentCourse?: {
    courseId: string,
    courseName: string
  }
}
```

**Passport Session** (`req.user`):
- Stored separately by Passport
- Contains authentication user object
- Restored on each request via `deserializeUser()`

### Session Lifecycle

1. **Login**: Session created, GlobalUser stored
2. **Course Entry**: `currentCourse` added to session
3. **Subsequent Requests**: Session read, `req.user` and `req.session` populated
4. **Logout**: Session destroyed

### Session Access

**Backend:**
- `req.session.globalUser` - Full GlobalUser (includes PUID)
- `req.user` - Passport user object (includes PUID)
- Both available on all authenticated requests

**Frontend:**
- No direct session access (session is server-side only)
- Gets user data via API calls: `/auth/me` or `/auth/current-user`
- Receives sanitized data (no PUID)

---

## Course User Creation

### Flow Diagram

```
User Authenticated
    ↓
GlobalUser exists in session
    ↓
User selects course
    ↓
POST /api/course/enter
    ↓
Check if CourseUser exists in {courseName}_users
    ↓
If NOT exists:
    ├─ Create CourseUser with:
    │   ├─ name: from GlobalUser
    │   ├─ userId: from GlobalUser (reused)
    │   ├─ courseName: from course
    │   ├─ courseId: from course
    │   ├─ userOnboarding: false
    │   └─ chats: []
    │
    ├─ Initialize memory agent
    │
    └─ Add courseId to GlobalUser.coursesEnrolled
    ↓
Store currentCourse in session
    ↓
Return CourseUser + redirect info
```

### Code Flow

**File**: `src/routes/course-entry.ts` (lines 19-134)

1. **Extract GlobalUser from Session** (line 22)
2. **Get Course Details** (line 36)
3. **Lookup CourseUser** (lines 46-49)
   - Uses `findStudentByPUID()` (backend can use PUID)
4. **Create CourseUser if Needed** (lines 52-66)
   - Reuses `userId` from GlobalUser
   - Does NOT store PUID (privacy)
5. **Initialize Memory Agent** (lines 71-82)
6. **Update GlobalUser** (lines 85-91)
7. **Store Current Course** (lines 97-100)
8. **Return Response** (lines 120-125)

---

## Privacy & Security

### PUID Handling

**PUID Storage Locations:**
- ✅ MongoDB `active-users` collection (GlobalUser)
- ✅ Server-side session (`req.session.globalUser`)
- ✅ Passport session (`req.user`)
- ❌ CourseUser collections (NOT stored)
- ❌ Frontend (NEVER sent)

### Privacy Protection Mechanisms

1. **Sanitization Function**: `sanitizeGlobalUserForFrontend()`
   - Removes PUID before sending to frontend
   - Used in all API endpoints that return GlobalUser

2. **API Response Structure**:
   ```typescript
   // Backend sends:
   {
     user: {
       username: string,
       userId: string,      // NO PUID
       affiliation: string
     },
     globalUser: {
       userId: string,      // NO PUID
       name: string,
       // ... other fields
     }
   }
   ```

3. **Frontend Interface**:
   - `User` interface does NOT include PUID
   - Frontend code never accesses PUID
   - All operations use `userId` instead

### userId vs PUID

**userId**:
- Generated unique identifier (string format)
- Safe to send to frontend
- Used for all frontend operations
- Reused across all courses

**PUID**:
- Privacy-focused Unique Identifier
- Only used for backend database lookups
- Never exposed to frontend
- Only stored in GlobalUser collection

---

## API Endpoints

### Authentication Endpoints

#### `GET /auth/login`
- **Purpose**: Initiate login
- **SAML**: Redirects to SAML IdP
- **Local**: Serves login page
- **File**: `src/routes/auth.ts` (lines 21-41)

#### `POST /auth/login`
- **Purpose**: Handle local authentication
- **Method**: POST
- **Body**: `{ username, password }`
- **Process**: Validates credentials, creates/finds GlobalUser, stores in session
- **File**: `src/routes/auth.ts` (lines 116-201)

#### `POST /auth/saml/callback`
- **Purpose**: Handle SAML callback
- **Method**: POST
- **Process**: Validates SAML assertion, creates/finds GlobalUser, stores in session
- **File**: `src/routes/auth.ts` (lines 44-113)

#### `GET /auth/logout`
- **Purpose**: Logout user
- **Process**: Destroys session, redirects to SAML logout if applicable
- **File**: `src/routes/auth.ts` (lines 212-279)

#### `GET /auth/me`
- **Purpose**: Get current user info (legacy endpoint)
- **Method**: GET
- **Authentication**: Required
- **Response**: `{ authenticated, user, globalUser }`
- **Process**: 
  1. Gets `userId` from `req.session.globalUser.userId`
  2. Queries MongoDB by `userId`
  3. Validates session data
  4. Returns sanitized user data
- **File**: `src/routes/auth.ts` (lines 393-488)

#### `GET /auth/current-user`
- **Purpose**: Get current user info
- **Method**: GET
- **Authentication**: Required
- **Response**: Same as `/auth/me`
- **File**: `src/routes/auth.ts` (lines 296-391)

### Course Entry Endpoints

#### `POST /api/course/enter`
- **Purpose**: Enter a course (create/retrieve CourseUser)
- **Method**: POST
- **Authentication**: Required
- **Body**: `{ courseId: string }`
- **Process**: 
  1. Gets GlobalUser from session
  2. Looks up or creates CourseUser
  3. Stores current course in session
  4. Returns redirect info
- **File**: `src/routes/course-entry.ts` (lines 19-134)

#### `GET /api/course/current`
- **Purpose**: Get current course from session
- **Method**: GET
- **Authentication**: Required
- **Response**: `{ course: { courseId, courseName } }`
- **File**: `src/routes/course-entry.ts` (lines 141-159)

### User Management Endpoints

#### `GET /api/user/current`
- **Purpose**: Get current CourseUser
- **Method**: GET
- **Authentication**: Required
- **Response**: `{ courseUser, globalUser, currentCourse }`
- **Process**:
  1. Gets `globalUser` and `currentCourse` from session
  2. Queries CourseUser using `globalUser.userId`
  3. Returns sanitized data
- **File**: `src/routes/user-management.ts` (lines 19-50)

#### `POST /api/user/update-onboarding`
- **Purpose**: Update CourseUser onboarding status
- **Method**: POST
- **Authentication**: Required
- **Body**: `{ userId, courseName, userOnboarding }`
- **Process**: Updates CourseUser in `{courseName}_users` collection
- **File**: `src/routes/user-management.ts` (lines 57-98)

---

## Frontend Integration

### AuthService

**File**: `public/scripts/services/AuthService.ts`

**Purpose**: Manages frontend authentication state

**Key Methods:**
- `checkAuthStatus()` - Calls `/auth/me` to get user data
- `login()` - Redirects to `/auth/login`
- `logout()` - Redirects to `/auth/logout`
- `getUser()` - Returns current user (from state)
- `isAuthenticated()` - Returns authentication status

**User Interface:**
```typescript
interface User {
  username: string;
  userId: string;
  affiliation: string;
  // NO PUID, firstName, or lastName
}
```

**State Management:**
```typescript
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
}
```

### Frontend Usage

**Student Mode**: `public/scripts/student-mode.ts`
- Calls `authService.checkAuthenticationAndRedirect()`
- Uses `authState.user.userId` for operations
- Displays `authState.user.username` in UI

**Instructor Mode**: `public/scripts/instructor-mode.ts`
- Similar authentication check
- Uses `authState.user.userId` for operations

**Course Selection**: `public/scripts/course-selection.ts`
- Calls `POST /api/course/enter` with `courseId`
- Receives redirect information
- Navigates to appropriate page

---

## Complete Authentication Flow Example

### Scenario: New User (First Login)

1. **User visits site** → Not authenticated
2. **User clicks login** → Redirected to `/auth/login`
3. **SAML Flow**:
   - Redirected to UBC CWL
   - User enters credentials
   - Redirected back to `/auth/saml/callback`
4. **Backend Processing**:
   - Passport validates SAML assertion
   - Extracts: `puid`, `name`, `affiliation`
   - Queries MongoDB: `findGlobalUserByPUID(puid)` → **NOT FOUND**
   - Generates `userId`: `globalUserID(puid, name, affiliation)`
   - Creates GlobalUser in `active-users`:
     ```json
     {
       "name": "John Doe",
       "puid": "123456789",
       "userId": "abc123def456",
       "coursesEnrolled": [],
       "affiliation": "student",
       "status": "active"
     }
     ```
   - Stores in session: `req.session.globalUser = globalUser`
   - Saves session
   - Redirects to `/pages/course-selection.html`
5. **Frontend**:
   - Calls `authService.checkAuthStatus()`
   - Fetches `/auth/me`
   - Receives: `{ user: { username, userId, affiliation }, globalUser: { userId, name, ... } }`
   - **NO PUID in response**
   - Stores in `authState.user`
6. **User selects course**:
   - Frontend calls `POST /api/course/enter` with `courseId`
   - Backend:
     - Gets `globalUser` from session
     - Queries: `findStudentByPUID(courseName, globalUser.puid)` → **NOT FOUND**
     - Creates CourseUser in `APSC_099_users`:
       ```json
       {
         "name": "John Doe",
         "userId": "abc123def456",  // Reused from GlobalUser
         "courseName": "APSC 099",
         "courseId": "course-123",
         "userOnboarding": false,
         "affiliation": "student",
         "chats": []
       }
       ```
     - Stores `currentCourse` in session
     - Returns redirect: `/pages/student-mode.html`
7. **User in Student Mode**:
   - Frontend calls `GET /api/user/current`
   - Backend:
     - Gets `globalUser` and `currentCourse` from session
     - Queries: `findStudentByUserId(courseName, globalUser.userId)`
     - Returns CourseUser + sanitized GlobalUser
   - Frontend uses CourseUser for chat operations

### Scenario: Returning User

1. **User visits site** → Session exists
2. **Request arrives**:
   - Session middleware reads session cookie
   - Passport deserializes `req.user` from session
   - `req.session.globalUser` is available
3. **Frontend calls `/auth/me`**:
   - Backend gets `userId` from `req.session.globalUser.userId`
   - Queries: `findGlobalUserByUserId(userId)`
   - Returns user data
4. **User selects course**:
   - CourseUser already exists
   - Backend retrieves existing CourseUser
   - No creation needed

---

## Key Design Decisions

### 1. Two-Tier User Model

**Why**: 
- GlobalUser provides cross-course identity
- CourseUser provides course-specific data (chats, onboarding)
- Separation allows course-specific features without affecting global identity

### 2. PUID Privacy

**Why**:
- PUID is sensitive personal information
- Should only be stored in one place (GlobalUser)
- Never exposed to frontend
- Frontend uses `userId` for all operations

### 3. Session-Based Authentication

**Why**:
- Canvas iframe compatibility (no localStorage)
- Server-side session is more secure
- Allows session management and timeout
- Works with SAML logout flow

### 4. userId Reuse

**Why**:
- `userId` is generated once per GlobalUser
- Reused across all CourseUser instances
- Provides consistent identity across courses
- Safe to expose to frontend

### 5. Database Lookup Strategy

**Backend Operations**:
- Can use PUID (stored in session, backend only)
- Can use userId (preferred for new code)

**Frontend Operations**:
- Only uses userId (PUID never available)

---

## Security Considerations

### 1. Session Security
- HttpOnly cookies (prevents XSS)
- Secure cookies in production (HTTPS only)
- Session timeout (2 hours default)
- Session secret from environment variable

### 2. PUID Protection
- Never sent to frontend
- Only stored in `active-users` collection
- Not stored in CourseUser collections
- Sanitized before any API response

### 3. Authentication Validation
- Session data validated against database on each request
- userId and affiliation checked for consistency
- Invalid sessions rejected

### 4. SAML Security
- Certificate validation
- Clock skew tolerance (5 seconds)
- Session index tracking for logout

---

## Troubleshooting

### Common Issues

1. **"User session incomplete" error**
   - **Cause**: `req.session.globalUser` is missing
   - **Solution**: User needs to log in again

2. **"User not found in database" error**
   - **Cause**: GlobalUser doesn't exist for the userId
   - **Solution**: Check if user completed login flow

3. **PUID in frontend**
   - **Cause**: Backend not sanitizing GlobalUser
   - **Solution**: Ensure `sanitizeGlobalUserForFrontend()` is used

4. **Session not persisting**
   - **Cause**: Session not saved before redirect
   - **Solution**: Ensure `req.session.save()` is called

---

## File Reference

### Backend Files
- `src/routes/auth.ts` - Authentication routes
- `src/middleware/passport.ts` - Passport configuration
- `src/middleware/session.ts` - Session configuration
- `src/routes/course-entry.ts` - Course entry logic
- `src/routes/user-management.ts` - User management endpoints
- `src/functions/EngEAI_MongoDB.ts` - Database operations
- `src/functions/user-utils.ts` - User utility functions
- `src/functions/types.ts` - Type definitions

### Frontend Files
- `public/scripts/services/AuthService.ts` - Frontend auth service
- `public/scripts/student-mode.ts` - Student mode authentication
- `public/scripts/instructor-mode.ts` - Instructor mode authentication
- `public/scripts/course-selection.ts` - Course selection logic

---

## Summary

The EngE-AI authentication system provides:

1. **Secure Authentication**: SAML (production) or Local (development)
2. **Two-Tier User Model**: GlobalUser (cross-course) + CourseUser (per-course)
3. **Privacy Protection**: PUID never exposed to frontend
4. **Session Management**: Server-side sessions compatible with Canvas iframe
5. **userId-Based Operations**: Frontend uses userId, backend can use PUID when needed
6. **Comprehensive Validation**: Session data validated against database

The system ensures that user identity is properly managed across courses while maintaining strict privacy controls around sensitive identifiers like PUID.

