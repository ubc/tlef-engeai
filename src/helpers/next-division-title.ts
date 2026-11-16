/**
 * next-division-title.ts
 *
 * Default title for a newly added week/topic on the Documents page (#689).
 */

import type { frameType } from '../types/shared';

/**
 * nextDivisionTitle - Returns the default title for the division added after `existing`.
 *
 * The number follows the division's position (`existing.length + 1`) and skips any
 * number an existing "Week N" / "Topic N" title already uses. Division ids are not
 * used: course setup assigns hash ids, and reading their leading digits produced
 * titles such as "Week 2829".
 *
 * @param existing - Current divisions of the course, in display order
 * @param courseFrameType - `byWeek` yields "Week N"; anything else yields "Topic N"
 * @returns Title such as "Week 12"
 */
export function nextDivisionTitle(
    existing: ReadonlyArray<{ title?: string }>,
    courseFrameType: frameType | string | undefined
): string {
    const label = courseFrameType === 'byWeek' ? 'Week' : 'Topic';
    const pattern = new RegExp(`^${label}\\s+(\\d+)$`, 'i');

    // Step 1: collect numbers already used by default-style titles
    const taken = new Set<number>();
    for (const division of existing) {
        const match = pattern.exec((division.title ?? '').trim());
        if (match) taken.add(Number(match[1]));
    }

    // Step 2: start after the last position and skip taken numbers
    let next = existing.length + 1;
    while (taken.has(next)) next += 1;
    return `${label} ${next}`;
}
