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

/** MongoDB collection name for academic period catalog (`academic-periods`). */
export const ACADEMIC_PERIODS_COLLECTION = 'academic-periods';

/** MongoDB collection name for period-scoped instructor course allow-lists. */
export const INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION = 'instructor-period-allowances';

/** MongoDB collection for cross-process operational migration leases and completion records. */
export const APPLICATION_MIGRATIONS_COLLECTION = 'application-migrations';

/** Legacy shared Guided Pathway collection retained as a GPF-002 migration source. */
export const GUIDED_PATHWAY_FLAGS_COLLECTION = 'guided-pathway-flags';

/** MongoDB collection for per-course LMS roster snapshots (`course-lms-rosters`). */
export const COURSE_LMS_ROSTERS_COLLECTION = 'course-lms-rosters';
