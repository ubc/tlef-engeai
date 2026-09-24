// mongo-collections.ts
/**
 * mongo-collections.ts
 * @author @gatahcha (refactor)
 * @description Tiny helpers returning `Collection` handles for **fixed-name** global collections.
 *
 * Prefer these over string literals so renames stay localized.
 */

import type { Db, Collection, Document } from 'mongodb';
import {
    ACADEMIC_PERIODS_COLLECTION,
    ACTIVE_COURSE_LIST_COLLECTION,
    ACTIVE_USERS_COLLECTION,
    APPLICATION_MIGRATIONS_COLLECTION,
    COURSE_LMS_ROSTERS_COLLECTION,
    GUIDED_PATHWAY_FLAGS_COLLECTION,
    INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION
} from './mongo-constants';

/**
 * activeCourseListCollection
 *
 * Returns the handle for the catalog where each `activeCourse` document lives (`topicOrWeekInstances`, prompts, etc.).
 *
 * @param db - `Db` — connected Mongo database handle
 *
 * @returns `Collection` — `active-course-list`
 */
export function activeCourseListCollection(db: Db): Collection {
    return db.collection(ACTIVE_COURSE_LIST_COLLECTION);
}

/**
 * activeUsersMongoCollection
 *
 * Returns the handle for the global user registry (only collection that stores `puid` alongside `userId`).
 *
 * @param db - `Db` — connected Mongo database handle
 *
 * @returns `Collection` — `active-users`
 */
export function activeUsersMongoCollection(db: Db): Collection {
    return db.collection(ACTIVE_USERS_COLLECTION);
}

/**
 * academicPeriodsCollection
 *
 * @returns `Collection` — `academic-periods`
 */
export function academicPeriodsCollection(db: Db): Collection {
    return db.collection(ACADEMIC_PERIODS_COLLECTION);
}

/**
 * instructorPeriodAllowancesCollection
 *
 * @returns `Collection` — `instructor-period-allowances`
 */
export function instructorPeriodAllowancesCollection(db: Db): Collection {
    return db.collection(INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION);
}

/**
 * applicationMigrationsCollection - Returns the cross-process migration-state collection.
 *
 * @param db - Connected Mongo database handle
 * @returns Fixed `application-migrations` collection
 */
export function applicationMigrationsCollection<T extends Document = Document>(db: Db): Collection<T> {
    return db.collection<T>(APPLICATION_MIGRATIONS_COLLECTION);
}

/**
 * guidedPathwayFlagsCollection
 *
 * Returns the legacy shared alert collection used only as a GPF-002 migration source.
 * Runtime reads and writes use the collection registered on the active course.
 *
 * @param db - Connected Mongo database handle
 * @returns `Collection` - legacy `guided-pathway-flags` migration source
 */
export function guidedPathwayFlagsCollection(db: Db): Collection {
    return db.collection(GUIDED_PATHWAY_FLAGS_COLLECTION);
}

/**
 * courseLmsRostersCollection
 *
 * Returns the handle for per-course LMS roster snapshots. Holds keyed one-way identifiers rather
 * than PUIDs, so it does not join the `active-users` exception — see `src/utils/roster-identity.ts`.
 *
 * @param db - `Db` — connected Mongo database handle
 *
 * @returns `Collection` — `course-lms-rosters`
 */
export function courseLmsRostersCollection(db: Db): Collection {
    return db.collection(COURSE_LMS_ROSTERS_COLLECTION);
}
