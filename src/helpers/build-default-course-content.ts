/**
 * build-default-course-content.ts
 *
 * Default `byWeek` / 12-tile course skeleton for admin-created courses.
 */

import type { TopicOrWeekInstance, TopicOrWeekItem } from '../types/shared';
import type { IDGenerator } from '../utils/unique-id-generator';

export function buildDefaultByWeekCourseContent(
    courseName: string,
    tilesNumber: number,
    idGenerator: IDGenerator
): TopicOrWeekInstance[] {
    const courseContent: TopicOrWeekInstance[] = [];

    for (let i = 0; i < tilesNumber; i++) {
        const weekTitle = `Week ${i + 1}`;

        const lectures: TopicOrWeekItem[] = [1, 2, 3].map((n) => ({
            id: '',
            date: new Date(),
            title: `Lecture ${n}`,
            courseName,
            topicOrWeekTitle: weekTitle,
            itemTitle: `Lecture ${n}`,
            learningObjectives: [],
            instructorStruggleTopics: [],
            additionalMaterials: [],
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        const contentMock: TopicOrWeekInstance = {
            id: '',
            date: new Date(),
            title: weekTitle,
            courseName,
            published: true,
            items: lectures,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        for (const lecture of lectures) {
            lecture.id = idGenerator.itemID(lecture, contentMock.title, courseName);
        }

        courseContent.push({
            id: idGenerator.topicOrWeekID(contentMock, courseName),
            date: new Date(),
            title: weekTitle,
            courseName,
            published: false,
            items: lectures,
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    return courseContent;
}
