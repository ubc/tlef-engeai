// mongo-context.ts
/**
 * mongo-context.ts
 * @author @gatahcha (refactor)
 * @description Thread-safe **view** of singleton-owned Mongo state passed into domain helpers (`flag-mongo.ts`, `course-mongo.ts`, …).
 *
 * Implementations read `db` and caches; they must not replace the client or reassign context fields.
 */

import type { Db } from 'mongodb';
import type { IDGenerator } from '../../utils/unique-id-generator';

/**
 * Resolved Mongo collection names for one course instance (users, flags, memory agent, scheduled jobs).
 */
export interface CourseCollectionNames {
    users: string;
    flags: string;
    memoryAgent: string;
    scheduledTasks: string;
}

/**
 * Context bundle for all `*-mongo.ts` delegates.
 *
 * - `db`: connected database from `EngEAI_MongoDB.getInstance()`
 * - `idGenerator`: stable ID generation (course codes, roster ids, …)
 * - `collectionNamesCache`: memoized `getCollectionNames(courseName)` lookups
 * - `scheduledTasksIndexesEnsured`: which scheduled-task collections already had indexes created
 */
export interface MongoDalContext {
    readonly db: Db;
    readonly idGenerator: IDGenerator;
    readonly collectionNamesCache: Map<string, CourseCollectionNames>;
    readonly scheduledTasksIndexesEnsured: Set<string>;
}
