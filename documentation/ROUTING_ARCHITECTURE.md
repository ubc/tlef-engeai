# Routing Architecture Migration Plan

## Overview

This document outlines the migration from file-based routing (`/pages/instructor-mode.html`, `/pages/student-mode.html`) to a professional RESTful URL structure (`/course/:courseId/instructor/documents`, `/course/:courseId/student`). This change will improve URL structure, enable direct linking, support browser history, and provide a more professional user experience.

The application uses a **Single Page Application (SPA)** pattern where:
- One HTML shell serves all routes for each interface (`instructor-mode.html` for instructors, `student-mode.html` for students)
- Components (e.g., `documents-instructor.html`, `chat-window.html`) are dynamically loaded based on URL
- Navigation happens via JavaScript without full page reloads
- URL reflects the current view for bookmarking and sharing

## ⚠️ Critical Fixes Required

Before implementing routing changes, these critical fixes must be addressed:

1. **`getCourseIdFromURL()` Function** (Phase 2.1)
   - Currently only matches instructor URLs
   - Must be updated to support both instructor and student URLs
   - **This will break if not fixed first**

2. **Component Loading Order** (Phase 3.1)
   - URL state must be checked BEFORE `updateUI()` is called
   - Otherwise, components will load twice (once by `updateUI()`, once by URL handler)
   - Consider passing URL state to `initializeChatInterface()` to avoid race conditions

3. **Onboarding Flow** (Phase 3.6 - Student Only)
   - Must preserve URL state when student needs onboarding
   - After onboarding completes, navigate to intended URL
   - Use sessionStorage as backup for page reloads

4. **Error Handling** (Phase 3.3)
   - Invalid chatIds, network failures, 404s, 403s must all be handled gracefully
   - Show user-friendly error messages, don't crash the app

5. **CourseId Validation** (Phase 3.1, step 4)
   - Must validate URL courseId matches session courseId
   - Redirect to correct course if mismatch detected

## Target URL Structure

### Instructor Routes

```
/course/:courseId/instructor/documents          → Documents management (DEFAULT)
/course/:courseId/instructor/flags              → Flag reports
/course/:courseId/instructor/monitor            → Monitor dashboard
/course/:courseId/instructor/chat               → Chat interface (default: welcome screen)
/course/:courseId/instructor/chat?chatId=xyz    → Specific chat conversation
/course/:courseId/instructor/assistant-prompts  → Assistant prompts configuration
```

### Student Routes

```
/course/:courseId/student                       → Student chat interface (DEFAULT - welcome screen or active chat)
/course/:courseId/student/chat                  → Chat interface (default: welcome screen)
/course/:courseId/student/chat?chatId=xyz       → Specific chat conversation
/course/:courseId/student/profile               → Student profile page
/course/:courseId/student/flag-history          → Flag history page
/course/:courseId/student/about                 → About page
```

## Current Interface Structures

### Instructor Mode Structure
Instructor mode uses a state-based navigation system:
- Uses `StateEvent` enum to track current view
- Components loaded via `loadComponent()` function
- Navigation handled through sidebar menu items

### Student Mode Structure
Student mode uses a simpler component-based structure:
- `welcome-screen` - Welcome screen when no chats exist
- `chat-window` - Active chat interface
- `profile` - Student profile page
- `flag-history` - Student's flag submission history
- `about` - About page (loaded via `renderAbout()`)
- Uses `currentComponent` variable to track state
- Components loaded via `loadComponent()` function
- Navigation handled through event listeners

## Architecture: Single Page Application (SPA) Pattern

### Component Orchestration

The application uses a **Single Page Application (SPA)** architecture:

1. **Shell Page (`instructor-mode.html`)**:
   - Serves as the container/shell for all instructor views
   - Contains the sidebar navigation, header, and layout structure
   - Has a `main-content-area` div where components are dynamically injected
   - Loaded once and reused for all instructor routes

2. **Component Files** (e.g., `documents-instructor.html`):
   - Self-contained HTML fragments/components
   - Fetched dynamically via `loadComponentHTML()` API call
   - Injected into `main-content-area` via `innerHTML`
   - Initialized with JavaScript functions (e.g., `initializeDocumentsPage()`)

3. **Orchestration Flow**:
   ```
   URL: /course/:courseId/instructor/documents
   ↓
   Backend: Serve instructor-mode.html (shell)
   ↓
   Frontend: Parse URL → Extract view ('documents')
   ↓
   Frontend: Fetch component HTML → /components/documents/documents-instructor.html
   ↓
   Frontend: Inject into main-content-area
   ↓
   Frontend: Call initializeDocumentsPage() to set up event listeners
   ```

### Benefits of SPA Approach

- **Single HTML Shell**: One `instructor-mode.html` serves all routes
- **Dynamic Component Loading**: Components loaded on-demand
- **No Page Reloads**: Navigation via `history.pushState()` (faster UX)
- **Shared State**: Sidebar, navigation, and layout persist across views
- **Code Reusability**: Common layout code in one place

## Key Changes

### 1. Default Route Behavior

**Current Behavior:**
- User enters course → Redirected to `/pages/instructor-mode.html`
- Frontend loads default view (documents) via state management
- URL doesn't reflect current view

**New Behavior:**
- User enters course → Redirected to `/course/:courseId/instructor/documents`
- URL explicitly shows the current view
- Browser history reflects actual navigation
- Same HTML shell (`instructor-mode.html`) serves all routes
- Components loaded dynamically based on URL

### 3. Chat Query Parameters

**Current Behavior:**
- Chat state managed internally via `ChatManager`
- No direct URL access to specific chats

**New Behavior:**
- Default chat view: `/course/:courseId/instructor/chat`
- Specific chat: `/course/:courseId/instructor/chat?chatId=abc123def456`
- Enables direct linking to conversations
- Supports bookmarking specific chats

## Implementation Steps

### Phase 1: Backend Routes

#### 1.1 Update Course Routes Module

**File**: `src/routes/course-routes.ts`

**Reference**: See existing instructor routes (lines 100-106)

**Changes Needed**:
```typescript
// Add student routes after instructor routes
router.get('/course/:courseId/student', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/chat', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/profile', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/flag-history', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/about', validateCourseAccess, serveStudentShell());

// Helper function to serve student shell (similar to serveInstructorShell)
function serveStudentShell() {
    return asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const publicPath = path.join(__dirname, '../../public');
        const studentPagePath = path.join(publicPath, 'pages/student-mode.html');
        res.sendFile(studentPagePath);
    });
}
```

**Location**: Add after instructor routes, before the default instructor route

#### 1.2 Update Server Configuration

**File:** `src/server.ts`

```typescript
// Add import
import courseRoutes from './routes/course-routes';

// Add route registration (BEFORE static file serving to catch course routes first)
app.use('/', courseRoutes);  // Routes handle their own paths starting with /course/

// Keep existing routes...
// Static file serving comes after route handlers
```

#### 1.3 Update Course Entry Redirects

**File**: `src/routes/course-entry.ts`

**Reference**: See instructor redirect updates (lines 179, 376)

**Changes Needed**:

Update student redirects (lines 175, 182, 372, 379):
```typescript
// OLD:
redirect = '/pages/student-mode.html';

// NEW:
redirect = `/course/${courseId}/student`;
```

**Specific Locations**:
- Line ~175: Student with onboarding redirect
- Line ~182: Student without onboarding redirect
- Line ~372: Student with onboarding redirect (enter-by-code)
- Line ~379: Student without onboarding redirect (enter-by-code)

#### 1.4 Add Backward Compatibility

**File**: `src/server.ts`

**Reference**: See instructor backward compatibility (lines 60-66)

**Changes Needed**:

Add student redirect after instructor redirect:
```typescript
// Backward compatibility: Redirect old student-mode.html to new URL structure
app.get('/pages/student-mode.html', (req: any, res: any) => {
    const currentCourse = req.session?.currentCourse;
    if (currentCourse?.courseId) {
        res.redirect(`/course/${currentCourse.courseId}/student`);
    } else {
        res.redirect('/pages/course-selection.html');
    }
});
```

**Location**: Add after instructor-mode.html redirect (around line 66)

## Implementation Plan

### Phase 2: Frontend URL Utilities

#### 2.1 Fix `getCourseIdFromURL()` to Support Student URLs

**File**: `public/scripts/utils/url-parser.ts`

**CRITICAL**: The existing `getCourseIdFromURL()` function only matches instructor URLs. It must be updated to support both instructor and student URLs.

**Current Implementation** (line 11-14):
```typescript
export function getCourseIdFromURL(): string | null {
    const pathMatch = window.location.pathname.match(/^\/course\/([a-f0-9]{12})\/instructor\//);
    return pathMatch ? pathMatch[1] : null;
}
```

**Updated Implementation**:
```typescript
export function getCourseIdFromURL(): string | null {
    // Match both instructor and student URLs
    const pathMatch = window.location.pathname.match(/^\/course\/([a-f0-9]{12})\/(instructor|student)/);
    return pathMatch ? pathMatch[1] : null;
}
```

**Location**: Update existing function at line 11-14

#### 2.2 Add Student URL Parsing Functions

**File**: `public/scripts/utils/url-parser.ts`

**Reference**: See existing functions (lines 1-78)

**Changes Needed**:
```typescript
/**
 * Extract student view from current URL
 * Example: /course/abc123/student/chat -> 'chat'
 */
export function getStudentViewFromURL(): 'chat' | 'profile' | 'flag-history' | 'about' | null {
    const pathMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/student\/([^\/]+)/);
    if (!pathMatch) {
        // Check if it's just /course/:courseId/student (default view)
        const defaultMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/student$/);
        if (defaultMatch) return 'chat'; // Default to chat view
        return null;
    }
    
    const view = pathMatch[1];
    const validViews: Array<'chat' | 'profile' | 'flag-history' | 'about'> = ['chat', 'profile', 'flag-history', 'about'];
    return validViews.includes(view as any) ? (view as 'chat' | 'profile' | 'flag-history' | 'about') : null;
}

/**
 * Build student URL
 */
export function buildStudentURL(courseId: string, view?: string, chatId?: string): string {
    let url = `/course/${courseId}/student`;
    if (view && view !== 'chat') {
        url += `/${view}`;
    } else if (view === 'chat') {
        url += '/chat';
    }
    if (chatId) {
        url += `?chatId=${chatId}`;
    }
    return url;
}

/**
 * Navigate to student view using history.pushState (no page reload)
 */
export function navigateToStudentView(view?: string, chatId?: string): void {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[URL-PARSER] Cannot navigate: courseId not found in URL');
        return;
    }
    
    const url = buildStudentURL(courseId, view, chatId);
    
    // Use pushState for SPA navigation (no page reload)
    window.history.pushState({ view, chatId }, '', url);
    
    // Trigger popstate event manually to handle navigation
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view, chatId } }));
}

/**
 * Navigate to specific student chat
 */
export function navigateToStudentChat(courseId: string, chatId: string): void {
    const url = buildStudentURL(courseId, 'chat', chatId);
    window.history.pushState({ view: 'chat', chatId }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'chat', chatId } }));
}
```

**Location**: Add after existing instructor functions

### Phase 3: Update Frontend Navigation

#### 3.1 Update Instructor Mode Initialization

**File**: `public/scripts/instructor-mode.ts`

**Reference**: See existing instructor-mode.ts implementation (lines 200-221, 1271-1281)

**Key Changes:**

1. **Import URL utilities:**
```typescript
import { 
    getCourseIdFromURL, 
    getInstructorViewFromURL, 
    getChatIdFromURL,
    navigateToInstructorView,
    navigateToChat
} from './utils/url-parser.js';
```

2. **Update initialization to read from URL:**
```typescript
document.addEventListener('DOMContentLoaded', async () => {
    // ... existing auth check ...
    
    // Extract courseId and view from URL
    const courseIdFromURL = getCourseIdFromURL();
    const viewFromURL = getInstructorViewFromURL();
    const chatIdFromURL = getChatIdFromURL();
    
    // Validate courseId matches session
    const sessionResponse = await fetch('/api/course/current');
    const sessionData = await sessionResponse.json();
    
    if (courseIdFromURL && sessionData.course?.courseId !== courseIdFromURL) {
        console.warn('[INSTRUCTOR-MODE] URL courseId does not match session, updating...');
        // Optionally redirect to sync session
    }
    
    // Set initial state based on URL
    if (viewFromURL) {
        currentState = mapViewToStateEvent(viewFromURL);
    } else {
        // Default to documents if no view specified
        currentState = StateEvent.Documents;
        // Redirect to documents URL if not already there
        if (courseIdFromURL) {
            navigateToInstructorView('documents');
            return; // Exit early, navigation will reload
        }
    }
    
    // Load appropriate component based on URL view
    if (viewFromURL === 'chat' && chatIdFromURL) {
        // Load specific chat
        await loadChatById(chatIdFromURL);
    } else {
        // Load component for current view
        updateUI(); // This will call loadComponent() based on currentState
    }
    
    // ... rest of initialization ...
});
```

3. **Update navigation handlers:**
```typescript
// OLD:
documentsStateEl?.addEventListener('click', () => {
    if (currentState !== StateEvent.Documents) {
        currentState = StateEvent.Documents;
        updateUI();
    }
});

// NEW:
documentsStateEl?.addEventListener('click', () => {
    navigateToInstructorView('documents');
});

// Similar updates for flags, monitor, assistant-prompts
```

4. **Add browser history support:**
```typescript
// Handle browser back/forward
window.addEventListener('popstate', () => {
    const view = getInstructorViewFromURL();
    const chatId = getChatIdFromURL();
    
    if (view) {
        currentState = mapViewToStateEvent(view);
        
        if (view === 'chat' && chatId) {
            loadChatById(chatId);
        } else {
            updateUI();
        }
    }
});
```

5. **Update chat navigation:**
```typescript
// When creating/selecting a chat, update URL
async function loadChatById(chatId: string): Promise<void> {
    const courseId = getCourseIdFromURL();
    if (!courseId) return;
    
    // Update URL with chatId query parameter using navigateToChat
    navigateToChat(courseId, chatId);
    
    // Load chat content
    await loadChatWindow();
    if (chatManager) {
        await chatManager.loadChatById(chatId);
    }
}
```

#### 3.2 Helper Function: Map View to State Event

```typescript
function mapViewToStateEvent(view: string): StateEvent {
    switch (view) {
        case 'documents': return StateEvent.Documents;
        case 'flags': return StateEvent.Flag;
        case 'monitor': return StateEvent.Monitor;
        case 'chat': return StateEvent.Chat;
        case 'assistant-prompts': return StateEvent.AssistantPrompts;
        default: return StateEvent.Documents;
    }
}
```

#### 3.3 Update Student Mode Initialization

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts implementation (lines 200-221, 1271-1281)

**Changes Needed:**

1. **Import URL utilities** (at top of file, after line 10):
```typescript
import {
    getCourseIdFromURL,
    getStudentViewFromURL,
    getChatIdFromURL,
    navigateToStudentView,
    navigateToStudentChat
} from './utils/url-parser.js';
```

2. **Update authentication check** (around line 13):
```typescript
async function checkAuthentication(): Promise<boolean> {
    // Get courseId from URL if available, otherwise use default redirect
    const courseId = getCourseIdFromURL();
    const redirectPath = courseId ? `/course/${courseId}/student` : '/pages/student-mode.html';
    return await authService.checkAuthenticationAndRedirect(redirectPath, 'STUDENT-MODE');
}
```

3. **Add URL parsing and courseId validation** (after line 31, before courseUser fetch):
```typescript
    // Extract courseId and view from URL
    const courseIdFromURL = getCourseIdFromURL();
    const viewFromURL = getStudentViewFromURL();
    const chatIdFromURL = getChatIdFromURL();

    // Store URL state for later use (after courseUser validation)
    // Note: We'll validate courseId matches session after courseUser is fetched
```

4. **Add courseId validation after courseUser fetch** (after line 36, after courseUser is fetched):
```typescript
    // Validate courseId from URL matches session courseUser
    if (courseIdFromURL && courseUser.courseId !== courseIdFromURL) {
        console.error('[STUDENT-MODE] ❌ URL courseId mismatch:', {
            urlCourseId: courseIdFromURL,
            sessionCourseId: courseUser.courseId
        });
        // Redirect to correct course URL
        window.location.href = `/course/${courseUser.courseId}/student`;
        return;
    }
```

5. **Refactor component loading to respect URL state** (IMPORTANT: This must be done BEFORE calling `initializeChatInterface`):

**Option A: Pass URL state to initializeChatInterface** (Recommended):
```typescript
    // Check onboarding status
    if (!courseUser.userOnboarding) {
        console.log('[STUDENT-MODE] 🎓 User needs onboarding');
        // Store URL state to restore after onboarding
        const urlState = { view: viewFromURL, chatId: chatIdFromURL };

        // Trigger onboarding
        await renderStudentOnboarding(courseUser);

        // Listen for onboarding completion event
        window.addEventListener('onboarding-completed', (event: any) => {
            console.log('[STUDENT-MODE] ✅ Onboarding completed, initializing chat interface...');
            const completedUser = event.detail.user || courseUser;
            completedUser.userOnboarding = true;
            initializeChatInterface(completedUser, urlState);
        });

        return; // Stop execution here - onboarding will handle completion
    } else {
        console.log('[STUDENT-MODE] ✅ User already onboarded');
        // Pass URL state to initializeChatInterface
        initializeChatInterface(courseUser, { view: viewFromURL, chatId: chatIdFromURL });
    }
```

**Then update `initializeChatInterface` signature** (around line 144):
```typescript
async function initializeChatInterface(user: any, urlState?: { view: string | null, chatId: string | null }): Promise<void> {
    // ... existing initialization code ...

    // After ChatManager initialization and updateUI(), check URL state
    if (urlState) {
        await handleURLState(urlState.view, urlState.chatId);
    }
}
```

```typescript
/**
 * Handle URL-based component loading
 * Called after ChatManager is initialized
 */
async function handleURLState(view: string | null, chatId: string | null): Promise<void> {
    if (view === 'chat' && chatId) {
        // Load specific chat
        await loadChatById(chatId).catch(err => {
            console.error('[STUDENT-MODE] Error loading chat from URL:', err);
            // Fall back to default chat interface (updateUI already handled this)
        });
    } else if (view === 'profile') {
        await loadComponent('profile');
    } else if (view === 'flag-history') {
        await loadComponent('flag-history');
    } else if (view === 'about') {
        await renderAbout({ component: currentComponent, mode: 'student' });
    }
    // If view is null or 'chat' without chatId, updateUI() already handled default state
}
```

#### 3.4 Update Navigation Handlers

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts navigation handlers (lines 354-374)

**Changes Needed:**

1. **Update flag-history button handler** (around line 523):
```typescript
// OLD:
// Note: The button is named 'profile-btn' but loads 'flag-history' component
profileBtn.addEventListener('click', () => {
    loadComponent('flag-history');
});

// NEW:
profileBtn.addEventListener('click', () => {
    navigateToStudentView('flag-history');
});
```

2. **Update profile back button** (around line 402):
```typescript
// OLD:
backBtn?.addEventListener('click', () => loadComponent('chat-window'));

// NEW:
backBtn?.addEventListener('click', () => navigateToStudentView('chat'));
```

3. **Update flag-history back button** (around line 484):
```typescript
// OLD:
backBtn.addEventListener('click', () => {
    const event = new CustomEvent('flag-history-closed', { ... });
    window.dispatchEvent(event);
});

// NEW:
backBtn.addEventListener('click', () => {
    navigateToStudentView('chat');
});
```

4. **Update about button handler** (around line 352):
```typescript
// OLD:
await renderAbout({ component: currentComponent, mode: 'student' });

// NEW:
navigateToStudentView('about');
```

#### 3.5 Add Browser History Support

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts browser history support (lines 435-449)

**Changes Needed**:

Add browser history support (after event listeners, before end of DOMContentLoaded):
```typescript
// Handle browser back/forward navigation
window.addEventListener('popstate', async (event: PopStateEvent) => {
    // Validate courseId matches session before navigation
    const courseIdFromURL = getCourseIdFromURL();
    if (!courseIdFromURL) {
        console.error('[STUDENT-MODE] ❌ Cannot navigate: courseId not found in URL');
        return;
    }

    // Verify courseId matches current session
    try {
        const response = await fetch('/api/user/current');
        const { courseUser } = await response.json();
        if (courseUser && courseUser.courseId !== courseIdFromURL) {
            console.error('[STUDENT-MODE] ❌ CourseId mismatch in popstate:', {
                urlCourseId: courseIdFromURL,
                sessionCourseId: courseUser.courseId
            });
            // Redirect to correct course
            window.location.href = `/course/${courseUser.courseId}/student`;
            return;
        }
    } catch (error) {
        console.error('[STUDENT-MODE] ❌ Error validating courseId:', error);
        return;
    }

    const view = getStudentViewFromURL();
    const chatId = getChatIdFromURL();

    if (view === 'chat' && chatId) {
        // Load specific chat
        await loadChatById(chatId).catch(err => {
            console.error('[STUDENT-MODE] Error loading chat from URL:', err);
            // Fall back to default chat interface
            await loadComponent('chat-window');
        });
    } else if (view === 'chat' || !view) {
        // Default chat view
        await loadComponent('chat-window');
    } else if (view === 'profile') {
        await loadComponent('profile');
    } else if (view === 'flag-history') {
        await loadComponent('flag-history');
    } else if (view === 'about') {
        await renderAbout({ component: currentComponent, mode: 'student' });
    }
});
```

#### 3.6 Add Chat Navigation Helper

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts `loadChatById` function (lines 800-870)

**Changes Needed**:

Add function after `loadChatWindow` function (around line 250):
```typescript
/**
 * Load chat by ID and update URL
 * Includes comprehensive error handling for invalid chatIds, network failures, etc.
 */
const loadChatById = async (chatId: string): Promise<void> => {
    // Validate chatId format (basic validation)
    if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
        console.error('[STUDENT-MODE] ❌ Invalid chatId provided:', chatId);
        await loadComponent('welcome-screen');
        return;
    }

    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[STUDENT-MODE] ❌ Cannot load chat: courseId not found in URL');
        await loadComponent('welcome-screen');
        return;
    }

    // Update URL with chatId query parameter
    navigateToStudentChat(courseId, chatId);

    // Ensure ChatManager is initialized
    if (!chatManager) {
        console.warn('[STUDENT-MODE] ⚠️ ChatManager not initialized');
        await loadComponent('welcome-screen');
        return;
    }

    // Load chat window component first
    await loadComponent('chat-window');

    // Load the specific chat
    try {
        // Check if chat exists in ChatManager
        const chats = chatManager.getChats();
        const chatExists = chats.some(chat => chat.id === chatId);

        if (chatExists) {
            // Chat is already loaded, just switch to it
            await chatManager.setActiveChatId(chatId);
            chatManager.renderActiveChat();
            console.log('[STUDENT-MODE] ✅ Switched to existing chat:', chatId);
        } else {
            // Chat not in memory, try to restore it from server
            console.log('[STUDENT-MODE] 🔄 Chat not in memory, restoring from server...');

            const restoreResponse = await fetch(`/api/chat/restore/${chatId}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!restoreResponse.ok) {
                // Handle different error cases
                if (restoreResponse.status === 404) {
                    console.error('[STUDENT-MODE] ❌ Chat not found (404):', chatId);
                    // Show user-friendly error message
                    const mainContentArea = document.getElementById('main-content-area');
                    if (mainContentArea) {
                        mainContentArea.innerHTML = `
                            <div style="text-align: center; padding: 2rem; color: #dc3545;">
                                <h3>⚠️ Chat Not Found</h3>
                                <p>The chat you're looking for doesn't exist or you don't have access to it.</p>
                                <button onclick="window.location.href='/course/${courseId}/student'" style="
                                    background: #007bff;
                                    color: white;
                                    border: none;
                                    padding: 0.75rem 1.5rem;
                                    border-radius: 0.375rem;
                                    cursor: pointer;
                                    margin-top: 1rem;
                                ">Return to Chat</button>
                            </div>
                        `;
                    }
                    return;
                } else if (restoreResponse.status === 403) {
                    console.error('[STUDENT-MODE] ❌ Access denied (403):', chatId);
                    await loadComponent('welcome-screen');
                    return;
                } else {
                    console.error('[STUDENT-MODE] ❌ Failed to restore chat:', restoreResponse.status, restoreResponse.statusText);
                    await loadComponent('welcome-screen');
                    return;
                }
            }

            const restoreData = await restoreResponse.json();
            if (restoreData.success) {
                // Chat restored, now switch to it
                await chatManager.setActiveChatId(chatId);
                chatManager.renderActiveChat();
                console.log('[STUDENT-MODE] ✅ Chat restored and loaded:', chatId);
            } else {
                console.error('[STUDENT-MODE] ❌ Failed to restore chat:', restoreData.error);
                await loadComponent('welcome-screen');
            }
        }
    } catch (error) {
        // Handle network errors, timeouts, etc.
        console.error('[STUDENT-MODE] ❌ Error loading chat by ID:', error);

        // Check if it's a network error
        if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error('[STUDENT-MODE] ❌ Network error - check connection');
            const mainContentArea = document.getElementById('main-content-area');
            if (mainContentArea) {
                mainContentArea.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #dc3545;">
                        <h3>⚠️ Connection Error</h3>
                        <p>Unable to load chat. Please check your connection and try again.</p>
                        <button onclick="window.location.reload()" style="
                            background: #007bff;
                            color: white;
                            border: none;
                            padding: 0.75rem 1.5rem;
                            border-radius: 0.375rem;
                            cursor: pointer;
                            margin-top: 1rem;
                        ">Retry</button>
                    </div>
                `;
            }
        } else {
            // Other errors - fall back to welcome screen
            await loadComponent('welcome-screen');
        }
    }
};
```

#### 3.7 Update ChatManager Callbacks

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts ChatManager callbacks (lines 710-737)

**Changes Needed**:

Update ChatManager initialization callbacks (around line 150-170):

**IMPORTANT**: Verify the exact callback action names that ChatManager emits. Check `public/scripts/feature/chat.ts` for the actual callback names.

```typescript
// In ChatManager.getInstance() onModeSpecificCallback:
onModeSpecificCallback: (action: string, data?: any) => {
    // Handle student-specific behaviors
    if (action === 'ui-update-needed') {
        updateUI();
    } else if (action === 'new-chat-created') {
        // New chat created from welcome screen or sidebar
        const newChatId = data?.chatId;
        if (newChatId) {
            const courseId = getCourseIdFromURL();
            if (courseId) {
                navigateToStudentChat(courseId, newChatId);
            }
        }
        // Note: loadChatWindow() is called by updateUI() or ChatManager
    } else if (action === 'chat-clicked') {
        // Chat clicked from sidebar
        const clickedChatId = data?.chatId;
        if (clickedChatId) {
            const courseId = getCourseIdFromURL();
            if (courseId) {
                navigateToStudentChat(courseId, clickedChatId);
            }
        }
        if (data?.loaded) {
            // Chat is fully loaded, safe to switch to chat window
            loadComponent('chat-window');
        }
    } else if (action === 'chat-load-failed') {
        console.error('[STUDENT-MODE] ❌ Chat loading failed:', data?.error);
        // Stay on current view or show error message
        await loadComponent('welcome-screen');
    }
    console.log('Student mode callback:', action, data);
}
```

**Note**: The callback structure may differ from instructor mode. Always verify against the actual ChatManager implementation.

#### 3.8 Update Close Event Handlers

**File**: `public/scripts/student-mode.ts`

**Reference**: See instructor-mode.ts restorePreviousState (lines 1255-1264)

**Changes Needed**:

Update event listeners (around line 360):
```typescript
// OLD:
window.addEventListener('about-page-closed', restorePreviousComponent);

// NEW:
window.addEventListener('about-page-closed', () => {
    const courseId = getCourseIdFromURL();
    if (courseId) {
        navigateToStudentView('chat');
    } else {
        // Fallback for non-URL-based navigation
        restorePreviousComponent();
    }
});

// Update flag-history-closed handler
window.addEventListener('flag-history-closed', () => {
    const courseId = getCourseIdFromURL();
    if (courseId) {
        navigateToStudentView('chat');
    } else {
        // Fallback for non-URL-based navigation
        restorePreviousComponent();
    }
});
```

#### 3.9 Handle Onboarding Flow with URL Preservation

**File**: `public/scripts/student-mode.ts`

**IMPORTANT**: Student mode has an onboarding flow that must preserve URL state. When a student needs onboarding but accesses a URL like `/course/:courseId/student/chat?chatId=xyz`, we must:

1. Complete onboarding first
2. Preserve the intended URL state
3. Navigate to the intended URL after onboarding completes

**Changes Needed**:

Update onboarding flow (around lines 47-60):
```typescript
// Check onboarding status
if (!courseUser.userOnboarding) {
    console.log('[STUDENT-MODE] 🎓 User needs onboarding');

    // Preserve URL state for after onboarding
    const intendedView = viewFromURL || 'chat';
    const intendedChatId = chatIdFromURL || null;

    // Store in sessionStorage as backup (in case of page reload)
    if (intendedChatId) {
        sessionStorage.setItem('intendedChatId', intendedChatId);
        sessionStorage.setItem('intendedView', intendedView);
    }

    // Trigger onboarding
    await renderStudentOnboarding(courseUser);

    // Listen for onboarding completion event
    window.addEventListener('onboarding-completed', async (event: any) => {
        console.log('[STUDENT-MODE] ✅ Onboarding completed, restoring URL state...');
        const completedUser = event.detail.user || courseUser;
        completedUser.userOnboarding = true;

        // Initialize chat interface first
        await initializeChatInterface(completedUser);

        // Then navigate to intended URL state
        const savedChatId = sessionStorage.getItem('intendedChatId');
        const savedView = sessionStorage.getItem('intendedView') || 'chat';

        // Clean up sessionStorage
        sessionStorage.removeItem('intendedChatId');
        sessionStorage.removeItem('intendedView');

        // Navigate to intended state
        if (savedChatId) {
            await loadChatById(savedChatId);
        } else if (savedView && savedView !== 'chat') {
            if (savedView === 'profile') {
                await loadComponent('profile');
            } else if (savedView === 'flag-history') {
                await loadComponent('flag-history');
            } else if (savedView === 'about') {
                await renderAbout({ component: currentComponent, mode: 'student' });
            }
        }
        // If no saved state, default chat view is already loaded by initializeChatInterface
    });

    return; // Stop execution here - onboarding will handle completion
} else {
    console.log('[STUDENT-MODE] ✅ User already onboarded');
    // Load normal chat interface with URL state
    initializeChatInterface(courseUser, { view: viewFromURL, chatId: chatIdFromURL });
}
```

### Phase 4: Update Course Selection Redirect

#### 4.1 Update course-selection.ts

**File:** `public/scripts/course-selection.ts`

When user selects a course, redirect to new URL structure:

```typescript
// After successful course entry
const response = await fetch('/api/course/enter', { ... });
const data = await response.json();

if (data.redirect) {
    // Backend now returns: /course/:courseId/instructor/documents or /course/:courseId/student
    window.location.href = data.redirect;
}
```

## Implementation Checklist

### Backend Changes
- [ ] Update `src/routes/course-routes.ts`:
  - [ ] Add student routes
  - [ ] Add `serveStudentShell()` function
- [ ] Update `src/routes/course-entry.ts` student redirects (4 locations)
- [ ] Add backward compatibility redirect in `src/server.ts`
- [ ] Test course validation and access control
- [ ] Test session management with new routes

### Frontend Changes
- [ ] **CRITICAL**: Fix `getCourseIdFromURL()` to support student URLs (Phase 2.1)
- [ ] Add student URL parsing functions to `public/scripts/utils/url-parser.ts`
- [ ] Update `public/scripts/instructor-mode.ts`:
  - [ ] Import URL utilities
  - [ ] Parse URL on initialization
  - [ ] Update navigation handlers to use URLs
  - [ ] Add browser history support
  - [ ] Update chat navigation with query parameters
- [ ] Update `public/scripts/student-mode.ts`:
  - [ ] Import URL utilities
  - [ ] Update authentication check
  - [ ] Add URL parsing in initialization
  - [ ] Add courseId validation after courseUser fetch
  - [ ] Refactor component loading to respect URL state (avoid double loading)
  - [ ] Update navigation handlers (flag-history button, profile back button, flag-history back button, about button)
  - [ ] Add `loadChatById()` function with comprehensive error handling
  - [ ] Update ChatManager callbacks (verify exact callback names)
  - [ ] Add browser history support (`popstate` listener with courseId validation)
  - [ ] Update close event handlers (about-page-closed, flag-history-closed)
  - [ ] **IMPORTANT**: Handle onboarding flow with URL preservation (Phase 3.6)
- [ ] Update `public/scripts/course-selection.ts` redirect handling
- [ ] Test URL navigation and browser history
- [ ] Test chat query parameter handling

### Testing

#### Basic Navigation Tests
- [ ] Test direct URL access: `/course/:courseId/instructor/documents`
- [ ] Test direct URL access: `/course/:courseId/student`
- [ ] Test navigation between views (no page reload)
- [ ] Test browser back/forward buttons
- [ ] Test chat query parameters: `/course/:courseId/instructor/chat?chatId=xyz`
- [ ] Test chat query parameters: `/course/:courseId/student/chat?chatId=xyz`
- [ ] Test course access validation
- [ ] Test session persistence across navigation
- [ ] Test course entry redirect flow
- [ ] Test component loading and initialization
- [ ] Test backward compatibility redirects

#### Edge Cases & Error Handling
- [ ] Test invalid chatId in URL (should show error, not crash)
- [ ] Test non-existent chatId (404 handling)
- [ ] Test courseId mismatch between URL and session (should redirect)
- [ ] Test navigation during onboarding flow (Student only)
- [ ] Test rapid navigation (multiple clicks quickly)
- [ ] Test browser back/forward during chat loading
- [ ] Test network failure during chat restoration
- [ ] Test access denied (403) for chat user doesn't own
- [ ] Test direct URL access with invalid courseId
- [ ] Test URL with invalid view name (should default to appropriate view)
- [ ] Test empty chatId query parameter (should be ignored)
- [ ] Test courseId format validation (must be 12 hex chars)
- [ ] Test navigation after session timeout
- [ ] Test component loading race conditions

### Documentation
- [ ] Update API documentation with new routes
- [ ] Update user documentation with new URL structure
- [ ] Document URL patterns for developers

## Backward Compatibility

### Temporary Redirects

During migration, add redirects for old URLs:

```typescript
// In server.ts, before course routes
app.get('/pages/instructor-mode.html', (req: any, res: any) => {
    const currentCourse = req.session?.currentCourse;
    if (currentCourse?.courseId) {
        res.redirect(`/course/${currentCourse.courseId}/instructor/documents`);
    } else {
        res.redirect('/pages/course-selection.html');
    }
});
```

## Benefits

1. **Professional URLs**: Clear, RESTful structure (`/course/:courseId/instructor/documents`)
2. **Direct Linking**: Share specific views or chats via URL
3. **Browser History**: Proper back/forward navigation
4. **Bookmarkable**: Users can bookmark specific views
5. **SEO-Friendly**: Clear URL structure (if needed for public pages)
6. **Better UX**: URL reflects current state, easier to understand
7. **Chat Deep Linking**: Direct links to specific conversations via query parameters

## Example User Flows

### Flow 1: Instructor Enters Course
1. User selects course → `POST /api/course/enter`
2. Backend redirects → `/course/abc123def456/instructor/documents`
3. Backend serves → `instructor-mode.html` (shell)
4. Frontend parses URL → Extracts view ('documents')
5. Frontend fetches → `/components/documents/documents-instructor.html`
6. Frontend injects → Component into `main-content-area`
7. Frontend initializes → `initializeDocumentsPage()`
8. URL clearly shows: course context + current view

### Flow 2: Instructor Navigates to Flags (SPA Navigation)
1. User clicks "Flags" menu item
2. Frontend calls → `navigateToInstructorView('flags')`
3. Frontend updates URL → `/course/:courseId/instructor/flags` (via `pushState`, no reload)
4. Frontend triggers → `popstate` event handler
5. Frontend fetches → `/components/report/flag-instructor.html`
6. Frontend injects → Component into `main-content-area`
7. Frontend initializes → `initializeFlags()`
8. Browser history updated (no page reload = faster)

### Flow 3: Instructor Opens Specific Chat
1. User clicks chat from sidebar
2. Frontend calls → `navigateToChat(courseId, chatId)`
3. Frontend updates URL → `/course/:courseId/instructor/chat?chatId=xyz789`
4. Frontend loads → Chat component and specific chat data
5. URL contains chat context for bookmarking/sharing

### Flow 4: Browser Back Navigation
1. User on `/course/:courseId/instructor/flags`
2. User clicks browser back button
3. Browser fires → `popstate` event
4. Frontend detects → URL changed to `/course/:courseId/instructor/documents`
5. Frontend parses → New view from URL
6. Frontend loads → Documents component (no full page reload)
7. View updates accordingly

## Security Considerations

1. **Course Access Validation**: Every route validates user has access to course
2. **404 vs 403**: Return 404 for non-existent courses (prevent enumeration)
3. **Session Validation**: Ensure courseId in URL matches session
4. **Query Parameter Validation**: Validate chatId exists and belongs to user
5. **Authentication Required**: All routes require authentication middleware

## Key Differences Between Instructor and Student Modes

1. **Simpler Structure**: Student mode has fewer main views (chat-focused vs instructor's multiple tools)
2. **Default View**: `/course/:courseId/student` defaults to chat (not documents like instructor)
3. **Component Types**: Student uses `currentComponent` variable instead of `StateEvent` enum
4. **Chat Focus**: Primary interface is chat, other views are secondary
5. **No Sidebar Navigation**: Student mode uses different navigation pattern
6. **Onboarding Flow**: Student mode has an additional onboarding step that must preserve URL state

## Component Orchestration Details

### How Components Work Together

1. **Shell Pages (`instructor-mode.html`, `student-mode.html`)**:
   - Contains layout structure appropriate for each interface
   - Has `<div id="main-content-area">` where components are injected
   - Loads respective TypeScript files which orchestrate everything

2. **Component Files** (e.g., `documents-instructor.html`, `chat-window.html`):
   - Self-contained HTML fragments
   - Located in `/public/components/` directory
   - Fetched via `fetch('/components/...')`
   - Injected via `mainContentAreaEl.innerHTML = html`

3. **Initialization Functions**:
   - Each component has an initialization function (e.g., `initializeDocumentsPage()`, `initializeChatInterface()`)
   - Called after component HTML is injected
   - Sets up event listeners, initializes state, renders data

4. **Navigation Flow**:
   ```
   User clicks menu → navigateToInstructorView('flags') / navigateToStudentView('chat')
   → URL updated (pushState)
   → popstate event fired
   → getInstructorViewFromURL() / getStudentViewFromURL() extracts view
   → loadComponent('flag-instructor') / loadComponent('chat-window')
   → Fetch HTML → Inject → Initialize
   ```

### Benefits of This Architecture

- **Single Shell**: One HTML file serves all routes per interface
- **Dynamic Loading**: Components loaded on-demand
- **No Page Reloads**: Faster navigation via `pushState`
- **Shared Layout**: Navigation/layout persist across views
- **Code Organization**: Components are modular and reusable

## Edge Cases & Error Handling

### Invalid chatId Handling
- **Scenario**: User accesses `/course/:courseId/student/chat?chatId=invalid123`
- **Expected**: Show user-friendly error message, redirect to default chat view
- **Implementation**: See `loadChatById()` error handling in Phase 3.6

### CourseId Mismatch
- **Scenario**: URL has courseId `abc123` but session has courseId `xyz789`
- **Expected**: Redirect to correct course URL based on session
- **Implementation**: Validate courseId after fetching courseUser (Phase 3.1, step 4)

### Network Failures
- **Scenario**: Network error while restoring chat from server
- **Expected**: Show retry button, don't crash the app
- **Implementation**: See `loadChatById()` network error handling

### Onboarding Flow
- **Scenario**: Student needs onboarding but accesses `/course/:courseId/student/chat?chatId=xyz`
- **Expected**: Complete onboarding first, then navigate to intended URL
- **Implementation**: See Phase 3.9 - Onboarding URL Preservation

### Invalid View Names
- **Scenario**: User manually types `/course/:courseId/student/invalid-view`
- **Expected**: Default to chat view, don't crash
- **Implementation**: `getStudentViewFromURL()` returns `null` for invalid views, defaults to chat

### Rapid Navigation
- **Scenario**: User clicks multiple navigation buttons quickly
- **Expected**: Last navigation wins, no race conditions
- **Implementation**: Consider debouncing navigation handlers if needed

### Browser History Edge Cases
- **Scenario**: User navigates back to a chat that was deleted
- **Expected**: Show error message, redirect to default chat view
- **Implementation**: `loadChatById()` handles 404 responses

## Future Enhancements

1. **Nested Routes**: Support deeper nesting if needed (e.g., `/course/:courseId/instructor/documents/:documentId`)
2. **Hash Routing Alternative**: Consider hash-based routing for SPA-like behavior (no page reload)
3. **URL Shortening**: Generate short URLs for sharing (optional)
4. **Analytics**: Track navigation patterns via URL structure

## Implementation Order

1. **Backend First**:
   - Add student routes to `course-routes.ts`
   - Update `course-entry.ts` redirects
   - Add backward compatibility redirect

2. **Frontend Second**:
   - Add student URL functions to `url-parser.ts`
   - Update `student-mode.ts` navigation
   - Update `instructor-mode.ts` if needed

3. **Testing**:
   - Test all routes and navigation
   - Test backward compatibility
   - Test chat deep linking

## File Reference Summary

### Primary Reference Files
- **Backend Routes**: `src/routes/course-routes.ts` - Route handler patterns
- **URL Parser**: `public/scripts/utils/url-parser.ts` - URL parsing utilities
- **Instructor Navigation**: `public/scripts/instructor-mode.ts` - Navigation implementation patterns
- **Student Navigation**: `public/scripts/student-mode.ts` - Student-specific navigation
- **Server Config**: `src/server.ts` - Route registration
- **Course Entry**: `src/routes/course-entry.ts` - Redirect updates

### Files to Modify
- `src/routes/course-routes.ts` - Add student routes
- `public/scripts/utils/url-parser.ts` - Add student URL functions
- `public/scripts/student-mode.ts` - Update navigation logic
- `src/routes/course-entry.ts` - Update student redirects
- `src/server.ts` - Add student backward compatibility

## Notes

- Both instructor and student interfaces follow the same SPA pattern
- Each interface has its own HTML shell (`instructor-mode.html`, `student-mode.html`)
- Components loaded dynamically based on URL
- Navigation uses `history.pushState()` for better UX
- Chat deep linking supported via query parameters
- Backward compatibility maintained with redirects
- **CRITICAL**: `getCourseIdFromURL()` must support both instructor and student URLs (Phase 2.1)
- **IMPORTANT**: Component loading order matters - URL state should be checked before `updateUI()` to avoid double loading
- **NOTE**: Student onboarding flow must preserve URL state for post-onboarding navigation
- All routes maintain existing authentication and session management
- Course context is set in session for API calls
- Frontend primarily uses URL parsing, with session as fallback
- Query parameters used for chat-specific navigation
- Default routes redirect to appropriate default views (documents for instructor, chat for student)

