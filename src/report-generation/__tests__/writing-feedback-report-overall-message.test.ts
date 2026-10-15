/**
 * @fileoverview One student PDF format: a whole-text problem adds an unheaded opening
 * paragraph and keeps criterion feedback; goals print their action, and a question prints
 * only when the goal has one.
 */

import zlib from 'zlib';
import { buildDefaultWritingAssignment } from '../../writing-feedback/default-rubric-profile';
import type { WritingFeedbackResult, WritingSubmission } from '../../writing-feedback/contracts';
import { StudentWritingFeedbackPdfService } from '../writing-feedback-report';

/** Raw, inflated and hex-drawn text of a PDF, as the main report test extracts it. */
function searchableText(pdf: Buffer): string {
    const raw = pdf.toString('latin1');
    let inflated = '';
    const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamPattern.exec(raw)) !== null) {
        try {
            inflated += zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
        } catch {
            // Not every stream is deflated text.
        }
    }
    const drawnText = Array.from(inflated.matchAll(/<([0-9a-fA-F]+)>/g))
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join('');
    return raw + inflated + '\n' + drawnText;
}

const verifiedText = 'How Sound Works. Sound happens when an object vibrates. First, the object pushes the air.';
const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Descriptive report');
const submission = {
    id: 'submission-1', courseId: 'course-1', assignmentId: 'assignment-1', studentId: 'student-1', attempt: 1,
    sourceType: 'manual', originalText: verifiedText, verifiedText, requiresVerification: false, status: 'approved',
    createdAt: new Date('2026-09-28T10:00:00Z'), updatedAt: new Date('2026-09-28T10:00:00Z')
} as WritingSubmission;

function feedback(goal: WritingFeedbackResult['revisionGoals'][number]): WritingFeedbackResult {
    return {
        criteria: assignment.rubric.criteria.map((criterion) => ({
            criterion: criterion.id,
            suggestedLevel: 'weak',
            evidence: [{ quote: 'Sound happens when an object vibrates.', rationale: 'EVIDENCEMARKER rationale.' }],
            explanation: 'EXPLANATIONMARKER.',
            confidence: 0.5
        })),
        strengths: ['Sound is a strong entity to classify.'],
        revisionGoals: [goal],
        internalFlags: []
    };
}

const service = new StudentWritingFeedbackPdfService();

describe('overall message', () => {
    it('opens the feedback without a heading and keeps criterion feedback', async () => {
        const text = searchableText(await service.render({
            assignment, submission,
            feedback: { ...feedback({ skillTag: 'descriptive_report', goal: 'GOALMARKER make it a report.', action: 'Define sound first.' }), gateDecision: 'global_revision' },
            overallMessage: 'OVERALLMARKER the text explains how sound works.\n1. STEPMARKER say what sound is.'
        }));
        const drawn = text.slice(text.lastIndexOf('\n'));
        expect(drawn).toContain('OVERALLMARKER');
        expect(drawn).toContain('STEPMARKER');
        expect(drawn.indexOf('OVERALLMARKER')).toBeLessThan(drawn.indexOf('What you did well'));
        expect(drawn).toContain('EXPLANATIONMARKER');
        expect(drawn).toContain('GOALMARKER');
        expect(drawn).not.toMatch(/rewrite/i);
    });

    it('prints no opening paragraph without one', async () => {
        const text = searchableText(await service.render({
            assignment, submission, feedback: feedback({ skillTag: 's', goal: 'Revise.', action: 'Do it.' })
        }));
        const drawn = text.slice(text.lastIndexOf('\n'));
        expect(drawn).not.toContain('OVERALLMARKER');
        expect(drawn.indexOf('What you did well')).toBeGreaterThanOrEqual(0);
        expect(drawn).toContain('EXPLANATIONMARKER');
    });
});

describe('revision goals', () => {
    it('prints the action and omits a missing question', async () => {
        const text = searchableText(await service.render({
            assignment, submission, feedback: feedback({ skillTag: 's', goal: 'Define sound.', action: 'ACTIONMARKER name its class.' })
        }));
        expect(text).toContain('Next step: ACTIONMARKER');
        expect(text).not.toContain('Ask yourself');
    });
});
