# Division Terminology Ambiguities & Proposed Changes

## Overview
The word "division" is ambiguous in this codebase and should be replaced with more descriptive terminology. Since courses can be organized by **week** or by **topic** (`frameType`), the terminology should reflect this flexibility.

## Proposed Naming Convention

### Core Changes
1. **`ContentDivision`** → **`TopicOrWeekInstance`**
   - Represents a single instance of a topic or week in a course
   - Interface location: `src/functions/types.ts` (lines 84-96)

2. **`courseItem`** → **`TopicOrWeekItem`**
   - Represents a single item (e.g., lecture, session) within a topic/week
   - Interface location: `src/functions/types.ts` (lines 98-114)

3. **`content-session`** (CSS class) → **`topic-or-week`**
   - Used for the wrapper div containing a topic/week section
   - Location: `public/scripts/feature/documents.ts` (line 150)
   - CSS: `public/styles/instructor-components/documents.css` (lines 61-70)

4. **`division-content`** (CSS class) → **`topic-or-week-item`**
   - Used for the content container within a topic/week
   - Location: `public/scripts/feature/documents.ts` (line 307)
   - CSS: `public/styles/instructor-components/documents.css` (lines 111-119)

---

## Complete List of Ambiguities

### 1. Type Definitions (`src/functions/types.ts`)

#### Interface: `ContentDivision` (lines 84-96)
- **Current:** `ContentDivision`
- **Proposed:** `TopicOrWeekInstance`
- **Fields affected:**
  - `items: courseItem[]` → `items: TopicOrWeekItem[]`

#### Interface: `courseItem` (lines 98-114)
- **Current:** `courseItem`
- **Proposed:** `TopicOrWeekItem`
- **Fields affected:**
  - `divisionTitle: string` → `topicOrWeekTitle: string`
  - (This field stores the parent topic/week title)

#### Interface: `activeCourse` (lines 60-73)
- **Current:** `divisions: ContentDivision[]`
- **Proposed:** `topicOrWeekInstances: TopicOrWeekInstance[]` or `topicsOrWeeks: TopicOrWeekInstance[]`

#### Interface: `Chat` (lines 31-40)
- **Current:** `divisionTitle: string`
- **Proposed:** `topicOrWeekTitle: string`

#### Interface: `LearningObjective` (lines 119-127)
- **Current:** `divisionTitle: string`
- **Proposed:** `topicOrWeekTitle: string`

#### Interface: `AdditionalMaterial` (lines 140-161)
- **Current:** 
  - `divisionTitle: string`
  - `divisionId?: string`
- **Proposed:**
  - `topicOrWeekTitle: string`
  - `topicOrWeekId?: string`

---

### 2. Function Parameters & Variables

#### MongoDB Functions (`src/functions/EngEAI_MongoDB.ts`)
- `addLearningObjective(courseId, divisionId, contentId, ...)`
  - `divisionId` → `topicOrWeekId`
- `updateLearningObjective(courseId, divisionId, contentId, ...)`
  - `divisionId` → `topicOrWeekId`
- `deleteLearningObjective(courseId, divisionId, contentId, ...)`
  - `divisionId` → `topicOrWeekId`
- `addContentItem(courseId, divisionId, contentItem)`
  - `divisionId` → `topicOrWeekId`
- MongoDB query paths: `'divisions.id'`, `'divisions.$[division]'`, `'divisions.items'`
  - Should become: `'topicOrWeekInstances.id'`, `'topicOrWeekInstances.$[instance]'`, `'topicOrWeekInstances.items'`

#### Unique ID Generator (`src/functions/unique-id-generator.ts`)
- `divisionID(contentDivision, courseName)`
  - Function name → `topicOrWeekID(topicOrWeekInstance, courseName)`
  - Parameter → `topicOrWeekInstance`
- `itemID(courseItem, divisionTitle, courseName)`
  - Parameter `divisionTitle` → `topicOrWeekTitle`
- `learningObjectiveID(learningObjective, itemTitle, divisionTitle, courseName)`
  - Parameter `divisionTitle` → `topicOrWeekTitle`
- `uploadContentID(additionalMaterial, itemTitle, divisionTitle, courseName)`
  - Parameter `divisionTitle` → `topicOrWeekTitle`

---

### 3. API Routes (`src/routes/mongo-app.ts`)

#### Route Paths
- `POST /api/courses/:courseId/divisions` → `POST /api/courses/:courseId/topic-or-week-instances`
- `POST /api/courses/:courseId/divisions/:divisionId/items` → `POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items`
- `GET /api/courses/:courseId/divisions/:divisionId/items/:itemId/objectives` → `GET /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives`
- `POST /api/courses/:courseId/divisions/:divisionId/items/:itemId/objectives` → `POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives`
- `PUT /api/courses/:courseId/divisions/:divisionId/items/:itemId/objectives/:objectiveId` → `PUT /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId`
- `DELETE /api/courses/:courseId/divisions/:divisionId/items/:itemId/objectives/:objectiveId` → `DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId`
- `POST /api/courses/:courseId/divisions/:divisionId/items/:itemId/materials` → `POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials`
- `DELETE /api/courses/:courseId/divisions/:divisionId/items/:itemId/materials/:materialId` → `DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId`
- `PATCH /api/courses/:courseId/divisions/:divisionId/title` → `PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/title`
- `PATCH /api/courses/:courseId/divisions/:divisionId/published` → `PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/published`
- `PATCH /api/courses/:courseId/divisions/:divisionId/items/:itemId/title` → `PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/title`
- `DELETE /api/courses/:courseId/divisions/:divisionId/items/:itemId` → `DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId`

#### Route Handler Variables
- `const { courseId, divisionId } = req.params` → `const { courseId, topicOrWeekId } = req.params`
- `const division = course.divisions?.find(...)` → `const instance = course.topicOrWeekInstances?.find(...)`
- `const divisions = course.divisions || []` → `const instances = course.topicOrWeekInstances || []`

---

### 4. Frontend Code

#### `public/scripts/instructor-mode.ts`
- Line 43: `divisions: []` → `topicOrWeekInstances: []` or `topicsOrWeeks: []`

#### `public/scripts/feature/documents.ts`
- Line 34: `let courseData: ContentDivision[] = []` → `let courseData: TopicOrWeekInstance[] = []`
- Line 61: `currentClass.divisions` → `currentClass.topicOrWeekInstances`
- Line 69: `const defaultDivision: ContentDivision = {...}` → `const defaultInstance: TopicOrWeekInstance = {...}`
- Line 81: `divisionTitle: ...` → `topicOrWeekTitle: ...`
- Line 108: `currentClass.divisions = ...` → `currentClass.topicOrWeekInstances = ...`
- Line 131: `courseData.forEach((division) => {...})` → `courseData.forEach((instance) => {...})`
- Line 146: `function createDivisionElement(division: ContentDivision)` → `function createTopicOrWeekElement(instance: TopicOrWeekInstance)`
- Line 150: `wrapper.className = 'content-session'` → `wrapper.className = 'topic-or-week'`
- Line 155: `header.setAttribute('data-division', division.id)` → `header.setAttribute('data-topic-or-week', instance.id)`
- Line 184: `renameIcon.setAttribute('data-division-id', division.id)` → `renameIcon.setAttribute('data-topic-or-week-id', instance.id)`
- Line 194: `division.items.length` → `instance.items.length`
- Line 212: `addSection(division)` → `addSection(instance)`
- Line 220: `division.published` → `instance.published`
- Line 255: `/divisions/${division.id}/published` → `/topic-or-week-instances/${instance.id}/published`
- Line 307: `contentEl.className = 'division-content'` → `contentEl.className = 'topic-or-week-item'`
- Line 308: `contentEl.id = `content-division-${division.id}`` → `contentEl.id = `content-topic-or-week-${instance.id}``
- Line 311: `division.items.forEach((content) => {...})` → `instance.items.forEach((item) => {...})`
- Line 312: `buildContentItemDOM(division.id, content)` → `buildTopicOrWeekItemDOM(instance.id, item)`
- Multiple occurrences of `divisionId` variables → `topicOrWeekId`
- Multiple occurrences of `divisionTitle` → `topicOrWeekTitle`
- Function `toggleDivision(divisionId)` → `toggleTopicOrWeek(topicOrWeekId)`
- Function `deleteDivision(divisionId)` → `deleteTopicOrWeek(topicOrWeekId)`

#### `public/scripts/feature/chat.ts`
- Line 448: `divisionTitle: ''` → `topicOrWeekTitle: ''`

#### `public/scripts/onboarding/document-setup.ts`
- Line 609: `divisionTitle: firstDivision.title` → `topicOrWeekTitle: firstInstance.title`

#### `public/scripts/services/DocumentUploadModule.ts`
- All occurrences of `divisionTitle` → `topicOrWeekTitle`

---

### 5. CSS Classes (`public/styles/instructor-components/documents.css`)

#### Existing Classes
- `.content-session` (lines 61-70) → `.topic-or-week`
- `.division-content` (lines 111-119) → `.topic-or-week-item`
- `.division-control-panel` (line 201) → `.topic-or-week-control-panel`
- `.status-add-division` (line 214) → `.status-add-topic-or-week`
- `.status-delete-all-divisions` (line 229) → `.status-delete-all-topics-or-weeks`

---

### 6. HTML Elements (`public/components/documents/documents-instructor.html`)

- `id="add-division-btn"` → `id="add-topic-or-week-btn"`
- `id="delete-all-divisions-btn"` → `id="delete-all-topics-or-weeks-btn"`
- `class="status-add-division"` → `class="status-add-topic-or-week"`
- `class="status-delete-all-divisions"` → `class="status-delete-all-topics-or-weeks"`
- `class="division-control-panel"` → `class="topic-or-week-control-panel"`

---

### 7. Backend Route Handlers (`src/routes/chat-app.ts`)

- Line 403-408: `course.divisions`, `division: ContentDivision`, `division.items`, `item: courseItem`
  - Should become: `course.topicOrWeekInstances`, `instance: TopicOrWeekInstance`, `instance.items`, `item: TopicOrWeekItem`
- Line 1309: `divisionTitle: ''` → `topicOrWeekTitle: ''`

---

### 8. Debug & Mock Data (`src/debug/dummy-courses.ts`)

- Line 17: Import `ContentDivision` → `TopicOrWeekInstance`
- Line 45: `divisions: []` → `topicOrWeekInstances: []`
- Line 135: `const divisionId = ...` → `const topicOrWeekId = ...`
- Line 142: `divisionTitle: module.title` → `topicOrWeekTitle: module.title`
- Line 148: `const division: ContentDivision = {...}` → `const instance: TopicOrWeekInstance = {...}`
- Line 171: `course.divisions.push(division)` → `course.topicOrWeekInstances.push(instance)`
- Similar patterns throughout the file

---

### 9. Chat Prompts (`src/functions/chat-prompts.ts`)

- Line 775: `obj.divisionTitle` → `obj.topicOrWeekTitle`

---

### 10. RAG App (`src/routes/RAG-App.ts`)

- All occurrences of `divisionTitle` in document metadata → `topicOrWeekTitle`
- Validation errors referencing `divisionTitle` → `topicOrWeekTitle`

---

## Summary of Naming Changes

### Type Names
| Current | Proposed |
|---------|----------|
| `ContentDivision` | `TopicOrWeekInstance` |
| `courseItem` | `TopicOrWeekItem` |

### Property Names
| Current | Proposed |
|---------|----------|
| `divisions` (array) | `topicOrWeekInstances` or `topicsOrWeeks` |
| `divisionId` | `topicOrWeekId` |
| `divisionTitle` | `topicOrWeekTitle` |

### CSS Classes
| Current | Proposed |
|---------|----------|
| `.content-session` | `.topic-or-week` |
| `.division-content` | `.topic-or-week-item` |
| `.division-control-panel` | `.topic-or-week-control-panel` |
| `.status-add-division` | `.status-add-topic-or-week` |
| `.status-delete-all-divisions` | `.status-delete-all-topics-or-weeks` |

### Function Names
| Current | Proposed |
|---------|----------|
| `divisionID()` | `topicOrWeekID()` |
| `createDivisionElement()` | `createTopicOrWeekElement()` |
| `toggleDivision()` | `toggleTopicOrWeek()` |
| `deleteDivision()` | `deleteTopicOrWeek()` |
| `buildContentItemDOM()` | `buildTopicOrWeekItemDOM()` |

### API Routes
| Current | Proposed |
|---------|----------|
| `/divisions` | `/topic-or-week-instances` |
| `/:divisionId/` | `/:topicOrWeekId/` |

---

## Alternative Naming Considerations

### Shorter Options (if "topicOrWeek" is too verbose)
- `TopicWeekInstance` (no "Or")
- `ContentInstance` (more generic)
- `SectionInstance` (if "section" isn't already used elsewhere)

### More Specific Options
- `WeekOrTopicInstance` (puts week first)
- `ContentGroupInstance` (more generic)
- `ModuleInstance` (if "module" fits the domain)

### Recommendations
1. **Primary recommendation:** `TopicOrWeekInstance` and `TopicOrWeekItem` - Most explicit and clear
2. **Alternative 1:** `ContentInstance` and `ContentItem` - Shorter but less descriptive
3. **Alternative 2:** `SectionInstance` and `SectionItem` - Only if "section" isn't already used for courseItem-level items

---

## Migration Strategy Notes

1. **Database Migration:** If MongoDB collections use "divisions" as a field name, a migration script will be needed
2. **API Versioning:** Consider maintaining backward compatibility with old route names during transition
3. **Frontend/Backend Sync:** Ensure frontend and backend are updated simultaneously to avoid breaking changes
4. **CSS Migration:** Update CSS files and verify no JavaScript code references old class names via string concatenation

---

## Files Requiring Changes

### TypeScript Source Files
- `src/functions/types.ts`
- `src/functions/EngEAI_MongoDB.ts`
- `src/functions/unique-id-generator.ts`
- `src/functions/chat-prompts.ts`
- `src/routes/mongo-app.ts`
- `src/routes/chat-app.ts`
- `src/routes/RAG-App.ts`
- `src/debug/dummy-courses.ts`
- `public/scripts/instructor-mode.ts`
- `public/scripts/feature/documents.ts`
- `public/scripts/feature/chat.ts`
- `public/scripts/onboarding/document-setup.ts`
- `public/scripts/services/DocumentUploadModule.ts`

### CSS Files
- `public/styles/instructor-components/documents.css`

### HTML Files
- `public/components/documents/documents-instructor.html`

---

## Questions for Review

1. Is `TopicOrWeekInstance` too verbose, or is the clarity worth it?
2. Should we use `topicOrWeekInstances` (plural) or `topicsOrWeeks` (shorter) for the array property?
3. For API routes, should we use:
   - `/topic-or-week-instances` (explicit)
   - `/topics-or-weeks` (shorter)
   - `/content-instances` (generic)
4. Should we maintain any backward compatibility with the old naming during migration?

