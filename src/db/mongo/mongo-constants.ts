// mongo-constants.ts
/**
 * mongo-constants.ts
 * @author @gatahcha (refactor)
 * @description Single source of truth for **global** MongoDB collection base names used by the EngE-AI data layer.
 *
 * Per-course collections (`{courseName}_users`, etc.) are derived at runtime; only catalog-style names live here.
 */

/** MongoDB collection name for the course catalog (`active-course-list`). */
export const ACTIVE_COURSE_LIST_COLLECTION = 'active-course-list';

/** MongoDB collection name for cross-course user profiles (`active-users`), including `puid`. */
export const ACTIVE_USERS_COLLECTION = 'active-users';
