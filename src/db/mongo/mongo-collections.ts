// mongo-collections.ts
/**
 * mongo-collections.ts
 * @author @gatahcha (refactor)
 * @description Tiny helpers returning `Collection` handles for **fixed-name** global collections.
 *
 * Prefer these over string literals so renames stay localized.
 */

import type { Db, Collection } from 'mongodb';
import { ACTIVE_COURSE_LIST_COLLECTION, ACTIVE_USERS_COLLECTION } from './mongo-constants';

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
