import {
    buildStruggleGenerationSystemPrompt,
    buildStruggleGenerationUserTurn,
    clearStruggleGenerationPromptCache,
} from '../struggle-generation-prompt';
import { formatPriorStruggleTopicsXml } from '../struggle-fifo-collector';

describe('buildStruggleGenerationSystemPrompt', () => {
    beforeEach(() => {
        clearStruggleGenerationPromptCache();
    });

    it('loads struggle_generation.md module content', () => {
        const prompt = buildStruggleGenerationSystemPrompt();

        expect(prompt).toContain('*Module Purpose*');
        expect(prompt).toContain('<prior_assigned_struggle_topics>');
        expect(prompt).toContain('FIFO rule');
        expect(prompt).toContain('MTRL-style');
    });
});

describe('buildStruggleGenerationUserTurn', () => {
    const priorXml = formatPriorStruggleTopicsXml('Topic 8 — Electrochemistry / Lecture notes', [
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

    it('wraps prior XML and uploaded material', () => {
        const turn = buildStruggleGenerationUserTurn(
            priorXml,
            'lecture-8.pdf',
            'Extracted electrochemistry text.',
            false
        );

        expect(turn).toContain(
            '<prior_assigned_struggle_topics info="Topic 8 — Electrochemistry / Lecture notes">'
        );
        expect(turn).toContain('<section topic_or_week="Topic 4" item="Tutorial">');
        expect(turn).not.toContain('order=');
        expect(turn).toContain(
            '<section topic_or_week="Topic 8 — Electrochemistry" item="Lecture notes" info="current topic">'
        );
        expect(turn).toContain(
            '<uploaded_material material_name="lecture-8.pdf" truncated="false">'
        );
        expect(turn).toContain('Extracted electrochemistry text.');
        expect(turn).toContain('</uploaded_material>');
    });

    it('marks truncated material in uploaded_material attribute', () => {
        const turn = buildStruggleGenerationUserTurn(priorXml, 'big.pdf', 'short excerpt', true);

        expect(turn).toContain('<uploaded_material material_name="big.pdf" truncated="true">');
    });

    it('escapes XML in material name and extracted text', () => {
        const turn = buildStruggleGenerationUserTurn(
            priorXml,
            'file & "1".pdf',
            'E = mc<2>',
            false
        );

        expect(turn).toContain('material_name="file &amp; &quot;1&quot;.pdf"');
        expect(turn).toContain('E = mc&lt;2&gt;');
    });
});
