import {
    buildMemoryAgentSystemPrompt,
    formatStruggleCatalogForPrompt
} from '../memory-agent-prompt';

describe('memory-agent-prompt', () => {
    it('formatStruggleCatalogForPrompt builds hierarchical XML', () => {
        const xml = formatStruggleCatalogForPrompt([
            {
                struggleTopic: 'Phase diagrams',
                topicOrWeekId: 'week-1',
                topicOrWeekTitle: 'Week 1',
                itemTitle: 'Lecture 1'
            },
            {
                struggleTopic: 'Enthalpy',
                topicOrWeekId: 'week-1',
                topicOrWeekTitle: 'Week 1',
                itemTitle: 'Lecture 2'
            }
        ]);

        expect(xml).toContain('<course_struggle_catalog>');
        expect(xml).toContain('title="Week 1"');
        expect(xml).toContain('<struggle_topic>Phase diagrams</struggle_topic>');
        expect(xml).toContain('title="Lecture 2"');
        expect(xml).toContain('<struggle_topic>Enthalpy</struggle_topic>');
    });

    it('buildMemoryAgentSystemPrompt includes empty existing block when none stored', () => {
        const prompt = buildMemoryAgentSystemPrompt(
            [{ struggleTopic: 'Vectors', topicOrWeekId: 'week-2', topicOrWeekTitle: 'Week 2', itemTitle: 'Lab' }],
            []
        );

        expect(prompt).toContain('# Memory agent');
        expect(prompt).toContain('## Purpose');
        expect(prompt).toContain('<existing_student_struggle_topics>');
        expect(prompt).not.toContain('<topic>Vectors</topic>');
        expect(prompt).toContain('<struggle_topic>Vectors</struggle_topic>');
    });

    it('buildMemoryAgentSystemPrompt lists existing student topics', () => {
        const prompt = buildMemoryAgentSystemPrompt(
            [{ struggleTopic: 'Vectors', topicOrWeekId: 'week-2', topicOrWeekTitle: 'Week 2', itemTitle: 'Lab' }],
            ['Vectors']
        );

        expect(prompt).toContain('<topic>Vectors</topic>');
    });
});
