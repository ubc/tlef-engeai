/**
 * build-default-course-content.ts
 *
 * Default topic/week skeleton for admin-created and instructor-onboarded courses.
 */

import type { TopicOrWeekInstance, TopicOrWeekItem, frameType } from '../types/shared';
import type { IDGenerator } from '../utils/unique-id-generator';

/**
 * buildTopicOrWeekInstances — generates topic/week tiles for course setup
 *
 * @param frameType - byWeek or byTopic
 * @param tilesNumber - Number of weeks or topics
 * @param courseName - Course display name stored on each item
 * @param idGenerator - ID generator for stable document ids
 * @returns TopicOrWeekInstance array for active-course-list
 */
export function buildTopicOrWeekInstances(
    frameType: frameType,
    tilesNumber: number,
    courseName: string,
    idGenerator: IDGenerator
): TopicOrWeekInstance[] {
    if (frameType === 'byWeek') {
        return buildDefaultByWeekCourseContent(courseName, tilesNumber, idGenerator);
    }

    const courseContent: TopicOrWeekInstance[] = [];

    for (let i = 0; i < tilesNumber; i++) {
        const topicTitle = `Topic ${i + 1}`;

        const courseContentTopic1: TopicOrWeekItem = {
            id: '',
            date: new Date(),
            title: topicTitle,
            courseName,
            topicOrWeekTitle: topicTitle,
            itemTitle: topicTitle,
            learningObjectives: [],
            instructorStruggleTopics: [],
            additionalMaterials: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const contentMock: TopicOrWeekInstance = {
            id: '',
            date: new Date(),
            title: topicTitle,
            courseName,
            published: false,
            items: [courseContentTopic1],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        courseContentTopic1.id = idGenerator.itemID(courseContentTopic1, contentMock.title, courseName);

        courseContent.push({
            id: idGenerator.topicOrWeekID(contentMock, courseName),
            date: new Date(),
            title: topicTitle,
            courseName,
            published: false,
            items: [courseContentTopic1],
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    return courseContent;
}

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
