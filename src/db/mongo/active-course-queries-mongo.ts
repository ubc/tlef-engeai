// active-course-queries-mongo.ts
/**
 * active-course-queries-mongo.ts
 * @author @gatahcha (refactor)
 * @description Read-only helpers on **`active-course-list`** shared by registry and course helpers.
 *
 * Kept dependency-light so modules like `collection-registry-mongo` never import `course-mongo` (circular graph risk).
 */

import type { Db } from 'mongodb';
import type { activeCourse } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';

/**
 * fetchActiveCourseDocById
 *
 * Loads **one** course catalog document by stable course `id`.
 *
 * @param db - `Db` — connected Mongo database handle
 * @param id - string — primary course id stored on `activeCourse.id`
 *
 * @returns Promise resolving to `activeCourse` or `null` if absent
 *
 * Actions:
 * - Executes `findOne({ id })` on `active-course-list`.
 */
export async function fetchActiveCourseDocById(db: Db, id: string): Promise<activeCourse | null> {
    const doc = await activeCourseListCollection(db).findOne({ id });
    return doc as activeCourse | null;
}

/**
 * fetchActiveCourseDocByCourseName
 *
 * Resolves a course by **human-readable** `courseName` with the same matching rules as legacy `getCourseByName`.
 *
 * @param db - `Db` — connected Mongo database handle
 * @param name - string — course display name as typed in admin / UI
 *
 * @returns Promise resolving to `activeCourse` or `null` if no match
 *
 * Actions:
 * - Run an **exact** `{ courseName: name }` query first (fast path).
 * - If missing, retry with a **case-insensitive** anchored regex; whitespace runs in `name` are normalized in the pattern.
 */
export async function fetchActiveCourseDocByCourseName(db: Db, name: string): Promise<activeCourse | null> {
    let course = await activeCourseListCollection(db).findOne({ courseName: name });
    if (!course) {
        course = await activeCourseListCollection(db).findOne({
            courseName: { $regex: new RegExp(`^${name.replace(/\s+/g, '\\s*')}$`, 'i') }
        });
    }
    return course as activeCourse | null;
}
