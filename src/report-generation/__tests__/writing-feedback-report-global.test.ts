/**
 * @fileoverview Rewrite-mode student PDF: the global block replaces criterion evidence,
 * goals print their action, and a question prints only when the goal has one.
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

const globalRevision = {
    diagnosisStatement: 'DIAGNOSISMARKER the text explains how sound works.',
    whatToKeep: ['KEEPMARKER sound as the entity'],
    rewriteDirection: 'REWRITEMARKER classify the types of sound.'
};

const service = new StudentWritingFeedbackPdfService();

describe('rewrite-mode student PDF', () => {
    it('prints the rewrite block instead of criterion evidence', async () => {
        const text = searchableText(await service.render({
            assignment, submission, feedback: feedback({ skillTag: 'rewrite', goal: 'Rewrite as a report.', action: 'Write the classification first.' }),
            mode: 'global_revision', globalRevision
        }));
        expect(text).toContain('What to do next: rewrite');
        expect(text).toContain('DIAGNOSISMARKER');
        expect(text).toContain('KEEPMARKER');
        expect(text).toContain('How to rewrite');
        expect(text).toContain('REWRITEMARKER');
        expect(text).not.toContain('EVIDENCEMARKER');
    });

    it('keeps criterion evidence in standard mode', async () => {
        const text = searchableText(await service.render({
            assignment, submission, feedback: feedback({ skillTag: 's', goal: 'Revise.', action: 'Do it.' }),
            mode: 'standard', globalRevision
        }));
        expect(text).not.toContain('What to do next: rewrite');
        expect(text).toContain('EXPLANATIONMARKER');
    });

    it('prints the action and omits a missing question', async () => {
        const text = searchableText(await service.render({
            assignment, submission, feedback: feedback({ skillTag: 's', goal: 'Define sound.', action: 'ACTIONMARKER name its class.' })
        }));
        expect(text).toContain('Next step: ACTIONMARKER');
        expect(text).not.toContain('Ask yourself');
    });
});

describe('rewrite mode forced on a standard run', () => {
    it('does not present a standard revision goal as the rewrite goal', async () => {
        const standardRun = { ...feedback({ skillTag: 'theme', goal: 'STANDARDGOALMARKER improve theme.', action: 'Move the entity to Theme.' }), gateDecision: 'standard' as const };
        const text = searchableText(await service.render({ assignment, submission, feedback: standardRun, mode: 'global_revision', globalRevision }));
        expect(text).toContain('REWRITEMARKER');
        expect(text).not.toContain('STANDARDGOALMARKER');
    });
});
