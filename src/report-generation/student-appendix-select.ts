/**
 * student-appendix-select.ts
 * @description Filters and orders roster users for the per-student PDF appendix.
 */

import type { MonitorStruggleUserRow } from '../types/shared';

/** Students with at least one recorded struggle topic, sorted by name. */
export function selectStudentsForAppendix(users: MonitorStruggleUserRow[]): MonitorStruggleUserRow[] {
    return users
        .filter(
            (user) =>
                user.role === 'student' &&
                user.struggleTopicCount > 0 &&
                user.struggleTopicsByChapter.length > 0
        )
        .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }));
}
