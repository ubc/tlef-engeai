/**
 * Tests for struggle-topics user-turn bridge (list plus adaptive guidance, no reveal hardcode).
 */
import { formatStruggleTopicsUserBridge } from '../struggle-topics-bridge';

describe('formatStruggleTopicsUserBridge', () => {
    it('injects struggle_topics list without reveal tags when topics exist', () => {
        const out = formatStruggleTopicsUserBridge(['Nernst equation', 'buffers']);
        expect(out).toContain('<struggle_topics>Nernst equation, buffers</struggle_topics>');
        expect(out).toContain('Private routing context');
        expect(out).toContain('Never name list labels');
        expect(out).not.toContain('topics you might want to focus on');
        expect(out).not.toMatch(/questionUnstruggle\s+reveal=/i);
        expect(out).not.toContain('reveal="TRUE"');
        expect(out).not.toContain('reveal="FALSE"');
    });

    it('attaches adaptive guidance to the socratic branch when topics exist', () => {
        const out = formatStruggleTopicsUserBridge(['Nernst equation']);
        expect(out).toContain('preserve student ownership');
        expect(out).toContain('partial representation');
        expect(out).toContain('LaTeX, lists, diagrams');
        // Routing direction must match struggle_topics.md: match -> interpretive, else socratic.
        expect(out).toContain(
            'When the question is an exact or strong match to a label above, begin a focused scaffold'
        );
        expect(out).toContain('when it is adjacent, off-list, or unclear, use socratic conversation');
        // Guards the inverted phrasing that routed non-matches into the interpretive scaffold.
        expect(out).not.toMatch(/Unless the question is an exact or strong/i);
    });

    it('injects empty struggle_topics without reveal tags when list is empty', () => {
        const out = formatStruggleTopicsUserBridge([]);
        expect(out).toContain('<struggle_topics></struggle_topics>');
        expect(out).toContain('Private routing context');
        expect(out).toContain('Never mention struggle topics');
        expect(out).not.toMatch(/questionUnstruggle\s+reveal=/i);
        expect(out).not.toContain('reveal="TRUE"');
        expect(out).not.toContain('reveal="FALSE"');
    });

    it('marks interpretive, practice, and unstruggle inactive on the empty-list branch', () => {
        const out = formatStruggleTopicsUserBridge([]);
        expect(out).toContain('Socratic conversation only this turn');
        expect(out).toContain('interpretive conversation, practice questions');
        expect(out).toContain('inactive');
        expect(out).toContain('preserve student ownership');
        expect(out).toContain('brief explanation');
    });
});
