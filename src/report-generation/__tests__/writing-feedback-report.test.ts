/**
 * Student feedback PDF tests — safe content and interactive annotations
 *
 * Inspects PDFKit output at the object-stream level to verify student-safe
 * sections, exact highlight geometry, popup metadata, and selectable source text.
 *
 * @author: @rdschrs
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: Structural regression coverage for general and annotated PDFs.
 */

import zlib from 'zlib';
import { buildDefaultWritingAssignment } from '../../writing-feedback/default-rubric-profile';
import type {
    AnchoredComment,
    WritingAssignment,
    WritingFeedbackResult,
    WritingRubricCriterion,
    WritingSubmission
} from '../../writing-feedback/contracts';
import { StudentWritingFeedbackPdfService } from '../writing-feedback-report';

/**
 * Convert raw bytes, inflatable object streams, and PDFKit's split hex text runs
 * into one searchable string. This deliberately avoids relying on a visual viewer
 * so tests can assert the emitted PDF dictionary and student-visible text.
 */
function searchableText(pdf: Buffer): string {
    const raw = pdf.toString('latin1');
    let inflated = '';
    const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamPattern.exec(raw)) !== null) {
        try {
            inflated += zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
        } catch {
            // Non-Flate streams such as metadata remain available in the raw byte string.
        }
    }
    const drawnText = Array.from(inflated.matchAll(/<([0-9a-fA-F]+)>/g))
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join('');
    return raw + inflated + '\n' + drawnText;
}

const verifiedText = [
    'The centrifugal pump moves fluid by converting rotational kinetic energy into hydrodynamic energy.',
    'The impeller accelerates the fluid outward from the center of rotation, raising both velocity and pressure.',
    'A volute casing then decelerates the flow and converts velocity head into additional pressure head.'
].join(' ');

function submission(overrides: Partial<WritingSubmission> = {}): WritingSubmission {
    const now = new Date('2026-07-22T10:00:00Z');
    return {
        id: 'submission-1',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        studentId: 'student-1',
        attempt: 1,
        sourceType: 'manual',
        originalText: verifiedText,
        verifiedText,
        requiresVerification: false,
        status: 'approved',
        createdAt: now,
        updatedAt: now,
        ...overrides
    } as WritingSubmission;
}

function feedback(
    criteria: WritingRubricCriterion[] = assignment.rubric.criteria,
    suggestedLevel: string = 'proficient'
): WritingFeedbackResult {
    return {
        criteria: criteria.map((criterion) => ({
            criterion: criterion.id,
            suggestedLevel,
            evidence: [{ quote: 'The impeller accelerates the fluid outward', rationale: 'Signals process staging.' }],
            explanation: `The description provides evidence for ${criterion.label}.`,
            confidence: 0.82
        })),
        strengths: ['Consistent technical vocabulary throughout the description.'],
        revisionGoals: [{
            skillTag: 'organization',
            goal: 'Signal the transition between components explicitly.',
            guidedQuestion: 'Where does the reader learn the casing takes over from the impeller?'
        }],
        internalFlags: ['needs_review']
    };
}

function comment(overrides: Partial<AnchoredComment> = {}): AnchoredComment {
    const quote = 'The impeller accelerates the fluid outward';
    const startOffset = verifiedText.indexOf(quote);
    return {
        id: 'comment-1',
        quote,
        startOffset,
        endOffset: startOffset + quote.length,
        comment: 'Strong verb choice here keeps the process description active.',
        origin: 'staff',
        ...overrides
    };
}

const service = new StudentWritingFeedbackPdfService();
const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Technical description');

/** Builds a report fixture with assignment-authored criterion and ranked level collections. */
function assignmentWithCriteria(count: number): WritingAssignment {
    const dynamicAssignment = buildDefaultWritingAssignment(
        'course-1',
        `assignment-${count}`,
        `${count}-criterion writing task`
    );
    const criteria = Array.from({ length: count }, (_, index): WritingRubricCriterion => ({
        id: `criterion_${index + 1}`,
        label: `Criterion ${index + 1}`,
        description: `Assignment-specific criterion ${index + 1}.`
    }));
    return {
        ...dynamicAssignment,
        rubric: {
            ...dynamicAssignment.rubric,
            criteria,
            // Deliberately store the levels out of rank order: ids and explicit ranks are authoritative.
            levels: [
                { id: 'advanced', label: 'Advanced', description: 'Fully demonstrated.', rank: 2 },
                { id: 'initial', label: 'Initial', description: 'Not yet demonstrated.', rank: 1 }
            ]
        }
    };
}

describe('StudentWritingFeedbackPdfService', () => {
    it.each([3, 6])('renders all %i assignment-authored criteria', async (criterionCount) => {
        const dynamicAssignment = assignmentWithCriteria(criterionCount);
        const pdf = await service.render({
            assignment: dynamicAssignment,
            submission: submission({ assignmentId: dynamicAssignment.id }),
            feedback: feedback(dynamicAssignment.rubric.criteria, 'advanced'),
            include: 'general'
        });
        const text = searchableText(pdf);

        for (let index = 1; index <= criterionCount; index += 1) {
            expect(text).toContain(`Criterion ${index}`);
        }
        expect(text).toContain('Advanced');
    });

    it('renders unknown criterion and level ids as their raw slugs', async () => {
        const unknownCriterion: WritingRubricCriterion = {
            id: 'unexpected_criterion_slug',
            label: 'Unused fixture label',
            description: 'Represents a stale or externally supplied criterion reference.'
        };
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback([unknownCriterion], 'unexpected_level_slug'),
            include: 'general'
        });
        const text = searchableText(pdf);

        expect(text).toContain('unexpected_criterion_slug');
        expect(text).toContain('unexpected_level_slug');
    });

    it('renders a general PDF with the reformatted summary sections and no highlights', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            grade: 85,
            staffFeedback: 'Well structured overall; see the goals below.',
            include: 'general'
        });
        const text = searchableText(pdf);
        expect(text).toContain('Writing Feedback');
        expect(text).toContain('What you did well');
        expect(text).toContain('Evidence from your writing');
        expect(text).toContain('Priority revision goals');
        expect(text).toContain('Feedback from your teaching team');
        expect(text).toContain('Approved grade: 85');
        expect(text).not.toContain('/Highlight');
        // The full submission body belongs to the annotated mode only.
        expect(text).not.toContain('volute casing then decelerates');
    });

    it('renders the annotated PDF with highlight annotations carrying popup text and author', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment({ howToImprove: 'Keep pairing precise verbs with each component.' })],
            include: 'annotated',
            annotationAuthor: 'Jamie Rivera'
        });
        const text = searchableText(pdf);
        expect(text).toContain('/Highlight');
        expect(text).toContain('/QuadPoints');
        expect(text).toContain('Strong verb choice here keeps the process description active.');
        expect(text).toContain('How to improve: Keep pairing precise verbs with each component.');
        expect(text).toContain('Jamie Rivera');
        expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.7');
        expect(text).toMatch(/\/NM \([0-9a-f-]{36}\)/);
        expect(text).toMatch(/\/M \(D:\d{14}\+00'00'\)/);
        expect(text).toMatch(/\/CreationDate \(D:\d{14}\+00'00'\)/);
        expect(text).toContain('/Subj (Writing feedback comment)');
        expect(text).toContain('/Page 0');
        // Canvas-style: the annotation is the invisible popup carrier; the visible yellow is
        // painted into the page content stream as rect fills.
        expect(text).toContain('/CA 0');
        expect(text).toContain('/C [1 1 1]');
        // Rect-fill op plus the highlight yellow (250/255) set as fill color.
        expect(text).toMatch(/ re\n/);
        expect(text).toContain('0.9803921568627451');
        // Full student text is drawn.
        expect(text).toContain('volute casing then decelerates');
        // General summary sections are not part of the annotated-only document.
        expect(text).not.toContain('Priority revision goals');
    });

    it('falls back to a generic author when none is provided', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment()],
            include: 'annotated'
        });
        expect(searchableText(pdf)).toContain('Teaching Team');
    });

    it('never prints staff-only metadata in the annotated output', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment({
                origin: 'model_seed',
                functionTag: 'organizational',
                levelTag: 'clause_word',
                priority: 'high'
            })],
            include: 'annotated'
        });
        const text = searchableText(pdf);
        expect(text).not.toContain('model_seed');
        expect(text).not.toContain('functionTag');
        expect(text).not.toContain('clause_word');
        expect(text).not.toContain('confidence');
        expect(text).not.toContain('needs_review');
    });

    it('merges comments with overlapping spans into one annotation carrying every popup', async () => {
        const first = comment({ comment: 'First observation about this sentence.' });
        const second = comment({
            id: 'comment-2',
            comment: 'Second, separate observation about the same sentence.'
        });
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [first, second],
            include: 'annotated',
            annotationAuthor: 'Jamie Rivera'
        });
        const text = searchableText(pdf);
        // One merged /Highlight annotation, not two stacked ones the viewer hides.
        expect(text.match(/\/Subtype \/Highlight/g)).toHaveLength(1);
        expect(text).toContain('First observation about this sentence.');
        expect(text).toContain('Second, separate observation about the same sentence.');
    });

    it('keeps separate annotations for non-overlapping comments', async () => {
        const firstQuote = 'The centrifugal pump moves fluid';
        const second = comment({ id: 'comment-2', comment: 'Different sentence, different popup.' });
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [
                comment({
                    quote: firstQuote,
                    startOffset: verifiedText.indexOf(firstQuote),
                    endOffset: verifiedText.indexOf(firstQuote) + firstQuote.length
                }),
                second
            ],
            include: 'annotated'
        });
        expect(searchableText(pdf).match(/\/Subtype \/Highlight/g)).toHaveLength(2);
    });

    it('labels a staff comment popup with its author name over the approver fallback', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment({ authorName: 'Pat Lee' })],
            include: 'annotated',
            annotationAuthor: 'Jamie Rivera'
        });
        expect(searchableText(pdf)).toContain('/T (Pat Lee)');
    });

    it('attributes each popup inside a merged annotation when authors differ', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [
                comment({ authorName: 'Pat Lee', comment: 'First observation.' }),
                comment({ id: 'comment-2', authorName: 'Jamie Rivera', comment: 'Second observation.' })
            ],
            include: 'annotated'
        });
        const text = searchableText(pdf);
        expect(text).toContain('Pat Lee');
        expect(text).toContain('Jamie Rivera');
        expect(text).toContain('First observation.');
        expect(text).toContain('Second observation.');
    });

    it('stores a complete long comment in annotation Contents without duplicating it as page text', async () => {
        const longFeedback = 'This paragraph needs a clearer topic sentence. '.repeat(20).trim();
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [
                comment({ comment: longFeedback, authorName: 'Pat Lee' }),
                comment({
                    id: 'comment-2',
                    quote: 'A volute casing',
                    startOffset: verifiedText.indexOf('A volute casing'),
                    endOffset: verifiedText.indexOf('A volute casing') + 'A volute casing'.length,
                    comment: 'Second full comment body.'
                })
            ],
            include: 'annotated',
            annotationAuthor: 'Jamie Rivera'
        });
        const text = searchableText(pdf);
        // The complete value remains in /Contents for the viewer-controlled popup.
        expect(text).toContain(longFeedback);
        // Comment bodies and the former trailing Comments section are not drawn as page text.
        const drawnOnly = text.split('\n').pop() ?? '';
        expect(drawnOnly).not.toContain('This paragraph needs a clearer topic sentence.');
        expect(drawnOnly).not.toContain('Second full comment body.');
        expect(drawnOnly).not.toContain('Comments');
    });

    it('emits multi-line QuadPoints (multiple of 8) for a span crossing a wrap', async () => {
        // Span long enough to guarantee at least one wrap at LETTER width.
        const start = verifiedText.indexOf('converting rotational');
        const end = verifiedText.indexOf('raising both velocity');
        const long = comment({
            id: 'comment-long',
            quote: verifiedText.slice(start, end),
            startOffset: start,
            endOffset: end,
            comment: 'This whole movement works as one causal chain.'
        });
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [long],
            include: 'annotated'
        });
        const text = searchableText(pdf);
        const quadMatch = /\/QuadPoints \[([^\]]+)\]/.exec(text);
        expect(quadMatch).not.toBeNull();
        const numbers = quadMatch![1].trim().split(/\s+/).filter(Boolean);
        expect(numbers.length % 8).toBe(0);
        expect(numbers.length).toBeGreaterThanOrEqual(16);
    });

    it('renders both sections in the combined mode', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment()],
            include: 'both',
            annotationAuthor: 'Jamie Rivera'
        });
        const text = searchableText(pdf);
        expect(text).toContain('What you did well');
        expect(text).toContain('Your writing, with comments');
        expect(text).toContain('/Highlight');
    });

    it('defaults to the general document when include is omitted', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            comments: [comment()]
        });
        const text = searchableText(pdf);
        expect(text).toContain('What you did well');
        expect(text).not.toContain('/Highlight');
    });
});

describe('technical section', () => {
    const technicalAssignment = assignmentWithCriteria(2);
    const technicalRubric = technicalAssignment.rubric;
    const technicalResult = feedback(technicalRubric.criteria, 'advanced');

    it('renders a technical section when technical feedback is supplied', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            technicalFeedback: technicalResult,
            technicalRubric,
            include: 'general'
        });
        expect(searchableText(pdf)).toContain('Technical feedback');
    });

    it('omits the technical section when none is supplied', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            include: 'general'
        });
        expect(searchableText(pdf)).not.toContain('Technical feedback');
    });

    it('never prints internal flags or confidence from either lens', async () => {
        const pdf = await service.render({
            assignment,
            submission: submission(),
            feedback: feedback(),
            technicalFeedback: technicalResult,
            technicalRubric,
            include: 'general'
        });
        const text = searchableText(pdf);
        expect(text).not.toContain('confidence');
        expect(text).not.toContain('needs_review');
    });
});
