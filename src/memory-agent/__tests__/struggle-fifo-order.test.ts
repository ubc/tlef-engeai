import type { activeCourse, InstructorStruggleTopic, TopicOrWeekInstance, TopicOrWeekItem } from '../../types/shared';
import {
    collectPriorStruggleTopicsForGeneration,
    formatPriorStruggleTopicsXml,
} from '../struggle-fifo-collector';

function makeTopic(id: string, label: string): InstructorStruggleTopic {
    const now = new Date();
    return { id, struggleTopic: label, createdAt: now, updatedAt: now };
}

function makeItem(
    id: string,
    title: string,
    struggleTopics: InstructorStruggleTopic[] = []
): TopicOrWeekItem {
    const now = new Date();
    return {
        id,
        date: now,
        title,
        courseName: 'MTRL 251',
        topicOrWeekTitle: '',
        itemTitle: title,
        learningObjectives: [],
        instructorStruggleTopics: struggleTopics,
        createdAt: now,
        updatedAt: now,
    };
}

function makeInstance(id: string, title: string, items: TopicOrWeekItem[]): TopicOrWeekInstance {
    const now = new Date();
    return {
        id,
        date: now,
        title,
        courseName: 'MTRL 251',
        published: true,
        items,
        createdAt: now,
        updatedAt: now,
    };
}

function makeCourse(instances: TopicOrWeekInstance[]): activeCourse {
    const now = new Date();
    return {
        id: 'course-1',
        date: now,
        courseSetup: true,
        contentSetup: true,
        flagSetup: true,
        monitorSetup: true,
        courseName: 'MTRL 251',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byTopic',
        tilesNumber: instances.length,
        topicOrWeekInstances: instances,
    };
}

describe('collectPriorStruggleTopicsForGeneration', () => {
    it('first section in course has no earlier sections', () => {
        const course = makeCourse([
            makeInstance('tw-1', 'Topic 1', [
                makeItem('item-1', 'Lecture notes', [makeTopic('st-1', 'intro topic')]),
            ]),
            makeInstance('tw-2', 'Topic 2', [makeItem('item-2', 'Tutorial')]),
        ]);

        const sections = collectPriorStruggleTopicsForGeneration(course, 'tw-1', 'item-1');

        expect(sections).toHaveLength(1);
        expect(sections[0].isCurrent).toBe(true);
        expect(sections[0].topics).toEqual(['intro topic']);
    });

    it('mid-course includes only prior sections and current', () => {
        const course = makeCourse([
            makeInstance('tw-1', 'Topic 4', [
                makeItem('item-1', 'Tutorial', [
                    makeTopic('st-1', 'nernst equation and its effect on cell potential'),
                ]),
            ]),
            makeInstance('tw-2', 'Topic 8 — Electrochemistry', [
                makeItem('item-2', 'Lecture notes', [makeTopic('st-2', 'diagram of galvanic cell')]),
            ]),
        ]);

        const sections = collectPriorStruggleTopicsForGeneration(course, 'tw-2', 'item-2');

        expect(sections).toHaveLength(2);
        expect(sections[0]).toMatchObject({
            topicOrWeekTitle: 'Topic 4',
            itemTitle: 'Tutorial',
            isCurrent: false,
        });
        expect(sections[1]).toMatchObject({
            topicOrWeekTitle: 'Topic 8 — Electrochemistry',
            itemTitle: 'Lecture notes',
            isCurrent: true,
        });
    });

    it('same topic/week multiple items preserves item sequence', () => {
        const course = makeCourse([
            makeInstance('tw-1', 'Topic 5', [
                makeItem('item-a', 'Lecture', [makeTopic('st-a', 'topic a')]),
                makeItem('item-b', 'Tutorial', [makeTopic('st-b', 'topic b')]),
                makeItem('item-c', 'Lab', []),
            ]),
        ]);

        const sections = collectPriorStruggleTopicsForGeneration(course, 'tw-1', 'item-c');

        expect(sections.map((s) => s.itemTitle)).toEqual(['Lecture', 'Tutorial', 'Lab']);
        expect(sections[2].isCurrent).toBe(true);
    });

    it('throws when target section is not found', () => {
        const course = makeCourse([
            makeInstance('tw-1', 'Topic 1', [makeItem('item-1', 'Lecture')]),
        ]);

        expect(() =>
            collectPriorStruggleTopicsForGeneration(course, 'tw-missing', 'item-1')
        ).toThrow(/target not found/i);
    });
});

describe('formatPriorStruggleTopicsXml', () => {
    it('renders curriculum sequence with current section info attribute', () => {
        const xml = formatPriorStruggleTopicsXml('Topic 8 — Electrochemistry / Lecture notes', [
            {
                topicOrWeekTitle: 'Topic 4',
                itemTitle: 'Tutorial',
                topics: ['nernst equation and its effect on cell potential'],
                isCurrent: false,
            },
            {
                topicOrWeekTitle: 'Topic 8 — Electrochemistry',
                itemTitle: 'Lecture notes',
                topics: ['diagram of galvanic cell'],
                isCurrent: true,
            },
        ]);

        expect(xml).toContain(
            '<prior_assigned_struggle_topics info="Topic 8 — Electrochemistry / Lecture notes">'
        );
        expect(xml).toContain('<section topic_or_week="Topic 4" item="Tutorial">');
        expect(xml).not.toContain('order=');
        expect(xml).toContain(
            '<section topic_or_week="Topic 8 — Electrochemistry" item="Lecture notes" info="current topic">'
        );
        const topic4Section = xml.indexOf('<section topic_or_week="Topic 4"');
        const topic8Section = xml.indexOf(
            '<section topic_or_week="Topic 8 — Electrochemistry" item="Lecture notes" info="current topic">'
        );
        expect(topic4Section).toBeGreaterThan(-1);
        expect(topic8Section).toBeGreaterThan(-1);
        expect(topic4Section).toBeLessThan(topic8Section);
    });

    it('omits inner sections when catalog is empty', () => {
        const xml = formatPriorStruggleTopicsXml('Topic 1 / Lecture', [
            {
                topicOrWeekTitle: 'Topic 1',
                itemTitle: 'Lecture',
                topics: [],
                isCurrent: true,
            },
        ]);

        expect(xml).toBe(
            '<prior_assigned_struggle_topics info="Topic 1 / Lecture">\n</prior_assigned_struggle_topics>'
        );
    });

    it('escapes XML special characters in attributes and text', () => {
        const xml = formatPriorStruggleTopicsXml('Topic & "1" / Item <A>', [
            {
                topicOrWeekTitle: 'Week & "2"',
                itemTitle: 'Lab <notes>',
                topics: ['pH & <equilibrium>'],
                isCurrent: true,
            },
        ]);

        expect(xml).toContain('info="Topic &amp; &quot;1&quot; / Item &lt;A>"');
        expect(xml).toContain('topic_or_week="Week &amp; &quot;2&quot;"');
        expect(xml).toContain('item="Lab &lt;notes>"');
        expect(xml).toContain('<struggle_topic>pH &amp; &lt;equilibrium&gt;</struggle_topic>');
    });
});
