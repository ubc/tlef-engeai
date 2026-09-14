/**
 * Course material catalog tests — the staff-pickable list of published readings
 *
 * Covers publication gating, deleted material, label composition, and ordering.
 *
 * @author: @rdschrs
 * @date: 2026-09-12
 * @version: 1.0.0
 * @description: Regression coverage for the titles staff may name to a student.
 */

import { listPublishedCourseMaterialTitles } from '../course-material-catalog';
import type { activeCourse } from '../../types/shared';

function course(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: 'course-1',
        courseName: 'LLED 200',
        topicOrWeekInstances: [
            {
                id: 'week-1',
                title: 'Week 1',
                published: true,
                items: [{
                    id: 'item-1',
                    title: 'Lecture 1',
                    additionalMaterials: [
                        { id: 'm1', name: 'Staging a descriptive report' },
                        { id: 'm2', name: 'Objective positioning' }
                    ]
                }]
            },
            {
                id: 'week-2',
                title: 'Week 2',
                published: false,
                items: [{
                    id: 'item-2',
                    title: 'Lecture 2',
                    additionalMaterials: [{ id: 'm3', name: 'Unreleased draft notes' }]
                }]
            }
        ],
        ...overrides
    } as unknown as activeCourse;
}

describe('listPublishedCourseMaterialTitles', () => {
    it('composes the same label shape retrieval resolves for a cited material', () => {
        const titles = listPublishedCourseMaterialTitles(course());

        expect(titles.map((entry) => entry.label)).toEqual([
            'Week 1 · Lecture 1 · Staging a descriptive report',
            'Week 1 · Lecture 1 · Objective positioning'
        ]);
    });

    it('omits material under an unpublished topic', () => {
        // The title is printed to the student in Useful readings, so the picker may only
        // offer what the course has actually released.
        const titles = listPublishedCourseMaterialTitles(course());

        expect(titles.some((entry) => entry.label.includes('Unreleased draft notes'))).toBe(false);
    });

    it('omits deleted material', () => {
        const withDeleted = course();
        withDeleted.topicOrWeekInstances[0].items[0].additionalMaterials![1]!.deleted = true;

        const titles = listPublishedCourseMaterialTitles(withDeleted);

        expect(titles.map((entry) => entry.label)).toEqual(['Week 1 · Lecture 1 · Staging a descriptive report']);
    });

    it('returns an empty list for a course with no published material', () => {
        expect(listPublishedCourseMaterialTitles({ topicOrWeekInstances: [] } as unknown as activeCourse)).toEqual([]);
        expect(listPublishedCourseMaterialTitles(undefined)).toEqual([]);
    });
});
