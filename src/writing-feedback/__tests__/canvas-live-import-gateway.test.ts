/**
 * Live Canvas import gateway tests — read-only intake and its refusals
 *
 * Covers the decisions that would be expensive to get wrong against a real course: which
 * assignments and submissions are eligible, that no institutional identifier is ever requested
 * or retained, that attachment bytes are pulled only during an explicit import, and that a
 * single bad submission does not lose the rest of the import.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Regression coverage for live Canvas assignment and submission reads.
 */

import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { SafeCanvasImportService } from '../canvas-import-service';
import { LiveCanvasImportGateway } from '../canvas-live-import-gateway';
import type { CanvasImportStore } from '../canvas-import-contracts';
import type { DocumentExtractionService, WritingAssignment, WritingSubmission } from '../contracts';

/** In-memory persistence double, mirroring the one used for the demo adapter. */
class MemoryStore implements CanvasImportStore {
    readonly assignment: WritingAssignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Technical Description');
    readonly submissions: WritingSubmission[] = [];

    async getWritingAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment | null> {
        return courseId === this.assignment.courseId && assignmentId === this.assignment.id ? this.assignment : null;
    }

    async listWritingSubmissions(courseId: string, assignmentId: string): Promise<WritingSubmission[]> {
        return this.submissions.filter((item) => item.courseId === courseId && item.assignmentId === assignmentId);
    }

    async createWritingSubmission(
        input: Omit<WritingSubmission, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<WritingSubmission> {
        const now = new Date();
        const stored: WritingSubmission = { ...input, id: `stored-${this.submissions.length + 1}`, createdAt: now, updatedAt: now };
        this.submissions.push(stored);
        return stored;
    }
}

/** Records every call so the tests can assert on what was and was not asked of Canvas. */
function fakeClient(responses: {
    get?: Record<string, unknown>;
    getAll?: Record<string, unknown[]>;
    download?: () => Promise<{ data: Uint8Array; size: number }>;
}) {
    const calls: Array<{ method: string; path: string; query?: Record<string, unknown> }> = [];
    // Suffix match, not substring: '/courses/1/assignments/2/submissions' contains
    // '/assignments' as well, so a substring match would hand back the assignment list for a
    // submissions call. Only the resource at the end of the path identifies the endpoint.
    const match = (table: Record<string, unknown> | undefined, path: string) => {
        const keys = Object.keys(table ?? {});
        const key = keys.find((candidate) => path.endsWith(candidate))
            ?? keys.find((candidate) => path.includes(candidate));
        return key === undefined ? undefined : (table as Record<string, unknown>)[key];
    };
    return {
        calls,
        client: {
            async get(path: string, query?: Record<string, unknown>) {
                calls.push({ method: 'get', path, query });
                return match(responses.get, path) ?? {};
            },
            async getAll(path: string, query?: Record<string, unknown>) {
                calls.push({ method: 'getAll', path, query });
                return (match(responses.getAll as Record<string, unknown>, path) as unknown[]) ?? [];
            },
            async post() { throw new Error('the live import gateway must never write to Canvas'); },
            async put() { throw new Error('the live import gateway must never write to Canvas'); },
            async delete() { throw new Error('the live import gateway must never write to Canvas'); },
            async download(url: string) {
                calls.push({ method: 'download', path: url });
                if (!responses.download) throw new Error('unexpected download');
                return responses.download();
            }
        } as any
    };
}

/** Deterministic stand-in for the local parser, so tests assert wiring rather than parsing. */
const passthroughExtractor: DocumentExtractionService = {
    async extract(input: { buffer: Buffer; fileName: string }) {
        return { text: input.buffer.toString('utf8').replace(/<[^>]*>/g, '').trim(), fileName: input.fileName };
    }
};

const ASSIGNMENTS = [
    {
        id: 101,
        name: 'Technical Description',
        points_possible: 20,
        due_at: '2026-09-22T06:59:00Z',
        submission_types: ['online_text_entry', 'online_upload'],
        has_submitted_submissions: true,
        description: '<p>Explain one <strong>failure mode</strong>.</p><ul><li>Use SI units.</li></ul>',
        rubric: [{ id: 'crit_1' }]
    },
    // Excluded: a quiz has no writing to import.
    {
        id: 102,
        name: 'Weekly Quiz',
        submission_types: ['online_quiz'],
        has_submitted_submissions: true
    },
    // Excluded: nothing submitted yet.
    {
        id: 103,
        name: 'Draft Outline',
        submission_types: ['online_text_entry'],
        has_submitted_submissions: false
    },
    // Excluded: anonymous grading withholds the identity staff need to review by.
    {
        id: 104,
        name: 'Blind Peer Review',
        submission_types: ['online_text_entry'],
        has_submitted_submissions: true,
        anonymize_students: true
    }
];

describe('LiveCanvasImportGateway assignment listing', () => {
    it('offers only assignments that can actually be imported', async () => {
        const { client } = fakeClient({ getAll: { '/assignments': ASSIGNMENTS } });
        const gateway = new LiveCanvasImportGateway({ client, canvasCourseId: '55' });

        const assignments = await gateway.listAssignments();

        expect(assignments.map((item) => item.canvasAssignmentId)).toEqual(['101']);
        expect(assignments[0]).toMatchObject({
            title: 'Technical Description',
            pointsPossible: 20,
            rubricState: 'canvas_rubric',
            synthetic: false
        });
    });

    it('carries the assignment brief as plain text, since it becomes the local instructions', async () => {
        // Without this the summary reaches the import route with no description, the created
        // assignment has no instructions, and auto-fill refuses with nothing to propose from.
        const { client } = fakeClient({ getAll: { '/assignments': ASSIGNMENTS } });
        const gateway = new LiveCanvasImportGateway({ client, canvasCourseId: '55' });

        const [assignment] = await gateway.listAssignments();

        expect(assignment.description).toBe('Explain one failure mode.\nUse SI units.');
        expect(assignment.description).not.toContain('<');
    });

    it('leaves the submission count unset rather than guessing one', async () => {
        // Canvas's assignment payload carries no submitted count; inventing one from
        // needs_grading_count would show staff a number that means something else.
        const { client } = fakeClient({ getAll: { '/assignments': ASSIGNMENTS } });
        const assignments = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).listAssignments();
        expect(assignments[0].submissionCount).toBeUndefined();
    });

    it('reports a live, importable connection without calling Canvas', async () => {
        const { client, calls } = fakeClient({});
        const status = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).getStatus();

        expect(status).toMatchObject({ mode: 'live', integration: 'canvas', connected: true, canImport: true, syntheticDataOnly: false });
        expect(calls).toHaveLength(0);
    });
});

describe('LiveCanvasImportGateway submission previews', () => {
    const SUBMISSIONS = [
        {
            user_id: 900,
            attempt: 1,
            submission_type: 'online_text_entry',
            body: '<p>A shell-and-tube heat exchanger transfers thermal energy.</p>',
            submitted_at: '2026-09-21T18:15:00Z',
            workflow_state: 'submitted',
            user: { id: 900, name: 'Jordan Lee' }
        },
        {
            user_id: 901,
            attempt: 2,
            submission_type: 'online_upload',
            submitted_at: '2026-09-21T20:40:00Z',
            workflow_state: 'submitted',
            user: { id: 901, name: 'Sam Rivera' },
            attachments: [{ id: 7, display_name: 'essay.docx', 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 4096, url: 'https://canvas.test/files/7/download' }]
        },
        // No transcript to read: a URL submission.
        {
            user_id: 902,
            attempt: 1,
            submission_type: 'online_url',
            submitted_at: '2026-09-21T21:00:00Z',
            workflow_state: 'submitted',
            user: { id: 902, name: 'Ash Kim' }
        },
        // Placeholder row Canvas returns for every enrolled student.
        { user_id: 903, submission_type: null, submitted_at: null, workflow_state: 'unsubmitted', user: { id: 903, name: 'Never Submitted' } },
        // Excused work is not the student's text to review.
        { user_id: 904, attempt: 1, submission_type: 'online_text_entry', body: '<p>x</p>', submitted_at: '2026-09-20T10:00:00Z', workflow_state: 'submitted', excused: true, user: { id: 904, name: 'Excused Student' } }
    ];

    it('classifies each submission and drops rows with nothing to import', async () => {
        const { client } = fakeClient({ get: { '/assignments/101': { id: 101 } }, getAll: { '/submissions': SUBMISSIONS } });
        const previews = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).listSubmissionPreviews('101');

        expect(previews.map((item) => [item.canvasUserId, item.contentKind])).toEqual([
            ['900', 'text_entry'],
            ['901', 'file_upload'],
            ['902', 'unsupported']
        ]);
        expect(previews[1].attachments[0]).toMatchObject({ fileName: 'essay.docx', attachmentId: '7' });
    });

    it('requests no SIS data, so Canvas never serializes a PUID, student number, or CWL', async () => {
        const { client, calls } = fakeClient({ get: { '/assignments/101': { id: 101 } }, getAll: { '/submissions': SUBMISSIONS } });
        await new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).listSubmissionPreviews('101');

        const submissionCall = calls.find((call) => call.path.includes('/submissions'));
        expect(submissionCall?.query).toEqual({ include: ['user'] });
        expect(JSON.stringify(submissionCall?.query)).not.toMatch(/sis|integration_id|login/i);
    });

    it('fetches no attachment bytes while previewing', async () => {
        const { client, calls } = fakeClient({ get: { '/assignments/101': { id: 101 } }, getAll: { '/submissions': SUBMISSIONS } });
        await new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).listSubmissionPreviews('101');
        expect(calls.some((call) => call.method === 'download')).toBe(false);
    });

    it('refuses an anonymized assignment with a reason staff can act on', async () => {
        const { client } = fakeClient({ get: { '/assignments/104': { id: 104, anonymize_students: true } } });
        await expect(
            new LiveCanvasImportGateway({ client, canvasCourseId: '55' }).listSubmissionPreviews('104')
        ).rejects.toThrow('anonymous grading');
    });
});

describe('LiveCanvasImportGateway rubric and assignment-detail import', () => {
    const RUBRIC_ASSIGNMENT = {
        id: 101,
        name: 'Technical Description',
        points_possible: 20,
        description: '<p>Describe a <strong>device</strong>.</p><ul><li>100-200 words</li></ul>',
        rubric_settings: { id: 55, title: 'Essay Rubric', points_possible: 24 },
        rubric: [
            {
                id: '_1234', description: 'Thesis', long_description: 'States a clear claim.', points: 10,
                ratings: [
                    { id: 'r1', description: 'Full Marks', long_description: 'Clear claim.', points: 10 },
                    { id: 'r2', description: 'No Marks', long_description: '', points: 0 }
                ]
            },
            {
                // Deliberately ragged: three ratings against the previous row's two.
                id: '_5678', description: 'Evidence', long_description: '', points: 14,
                ratings: [
                    { id: 'r3', description: 'Strong', long_description: '', points: 14 },
                    { id: 'r4', description: 'Adequate', long_description: '', points: 7 },
                    { id: 'r5', description: 'Weak', long_description: '', points: 0 }
                ]
            }
        ]
    };

    it('preserves each row\'s own ratings instead of padding to a rectangle', async () => {
        const { client } = fakeClient({ get: { '/assignments/101': RUBRIC_ASSIGNMENT } });
        const { rubric } = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' })
            .loadAssignmentContext('101');

        expect(rubric?.rows.map((row) => row.ratings.length)).toEqual([2, 3]);
        expect(rubric?.rows[0]).toMatchObject({ canvasCriterionId: '_1234', label: 'Thesis', points: 10 });
        expect(rubric?.title).toBe('Essay Rubric');
        expect(rubric?.pointsPossible).toBe(24);
    });

    it('mirrors Canvas exactly, adding no EngE-AI fields of its own', async () => {
        const { client } = fakeClient({ get: { '/assignments/101': RUBRIC_ASSIGNMENT } });
        const { rubric } = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' })
            .loadAssignmentContext('101');

        expect(Object.keys(rubric!.rows[0]).sort()).toEqual(
            ['canvasCriterionId', 'description', 'label', 'points', 'ratings']
        );
        expect(Object.keys(rubric!.rows[0].ratings[0]).sort()).toEqual(
            ['canvasRatingId', 'description', 'label', 'points']
        );
    });

    it('imports the assignment brief as both HTML and plain text', async () => {
        const { client } = fakeClient({ get: { '/assignments/101': RUBRIC_ASSIGNMENT } });
        const { details } = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' })
            .loadAssignmentContext('101');

        expect(details.descriptionHtml).toContain('<strong>device</strong>');
        expect(details.descriptionText).toBe('Describe a device.\n100-200 words');
        expect(details.pointsPossible).toBe(20);
    });

    it('reports no rubric rather than failing when Canvas has none', async () => {
        const { client } = fakeClient({ get: { '/assignments/102': { id: 102, name: 'No Rubric', description: '' } } });
        const context = await new LiveCanvasImportGateway({ client, canvasCourseId: '55' })
            .loadAssignmentContext('102');

        // The instructor authors one in EngE-AI instead; this is an ordinary outcome.
        expect(context.rubric).toBeNull();
        expect(context.details.importedAt).toBeInstanceOf(Date);
    });
});

describe('SafeCanvasImportService over a live gateway', () => {
    const SUBMISSIONS = [
        { user_id: 900, attempt: 1, submission_type: 'online_text_entry', body: '<p>Heat exchanger prose.</p>', submitted_at: '2026-09-21T18:15:00Z', workflow_state: 'submitted', user: { id: 900, name: 'Jordan Lee' } },
        { user_id: 901, attempt: 2, submission_type: 'online_upload', submitted_at: '2026-09-21T20:40:00Z', workflow_state: 'submitted', user: { id: 901, name: 'Sam Rivera' }, attachments: [{ id: 7, display_name: 'essay.txt', size: 40, url: 'https://canvas.test/files/7/download' }] },
        { user_id: 902, attempt: 1, submission_type: 'online_url', submitted_at: '2026-09-21T21:00:00Z', workflow_state: 'submitted', user: { id: 902, name: 'Ash Kim' } }
    ];

    function liveService(store: MemoryStore, download?: () => Promise<{ data: Uint8Array; size: number }>) {
        const { client } = fakeClient({
            get: { '/assignments/101': { id: 101 } },
            getAll: { '/assignments': [{ id: 101, name: 'Technical Description', submission_types: ['online_text_entry', 'online_upload'], has_submitted_submissions: true }], '/submissions': SUBMISSIONS },
            download
        });
        const gateway = new LiveCanvasImportGateway({ client, canvasCourseId: '55', extractor: passthroughExtractor });
        return new SafeCanvasImportService(store, gateway);
    }

    const request = { courseId: 'course-1', targetAssignmentId: 'assignment-1', canvasAssignmentId: '101' };
    const okDownload = async () => ({ data: new Uint8Array(Buffer.from('Essay text from the attachment.')), size: 31 });

    it('stores text entries verified and uploads awaiting verification', async () => {
        const store = new MemoryStore();
        const result = await liveService(store, okDownload).importAssignment(request);

        expect(result).toMatchObject({ importedCount: 2, skippedCount: 0, unsupportedCount: 1, failedCount: 0, integration: 'canvas' });

        const [textEntry, upload] = store.submissions;
        expect(textEntry).toMatchObject({ sourceType: 'canvas_text', requiresVerification: false, status: 'imported', studentLabel: 'Jordan Lee', canvasUserId: '900' });
        expect(textEntry.verifiedText).toBe('Heat exchanger prose.');
        // Parsed bytes are never trusted as final text.
        expect(upload).toMatchObject({ sourceType: 'digital_file', requiresVerification: true, status: 'verification_needed', canvasUserId: '901' });
        expect(upload.verifiedText).toBeUndefined();
    });

    it('persists no institutional identifier alongside the Canvas user id', async () => {
        const store = new MemoryStore();
        await liveService(store, okDownload).importAssignment(request);

        for (const submission of store.submissions) {
            // studentId must stay a one-way hash that does not embed the Canvas id.
            expect(submission.studentId).toMatch(/^canvas-[a-f0-9]{24}$/);
            expect(submission.studentId).not.toContain(String(submission.canvasUserId));
            expect(Object.keys(submission)).not.toContain('puid');
            expect(JSON.stringify(submission)).not.toMatch(/integration_id|sis_user_id|login_id/);
        }
    });

    it('re-importing creates nothing new', async () => {
        const store = new MemoryStore();
        await liveService(store, okDownload).importAssignment(request);
        const retry = await liveService(store, okDownload).importAssignment(request);

        expect(retry).toMatchObject({ importedCount: 0, skippedCount: 2, unsupportedCount: 1 });
        expect(store.submissions).toHaveLength(2);
    });

    it('keeps importing when one submission fails to download', async () => {
        const store = new MemoryStore();
        const failing = async () => { throw new Error('Canvas file download returned 500'); };
        const result = await liveService(store, failing).importAssignment(request);

        // The text entry still lands; only the upload is counted as retryable.
        expect(result).toMatchObject({ importedCount: 1, failedCount: 1, unsupportedCount: 1 });
        expect(store.submissions).toHaveLength(1);
        expect(store.submissions[0].sourceType).toBe('canvas_text');
    });

    it('refuses text beyond the review limit instead of importing it', async () => {
        // Canvas import does not pass through the manual route's cleanText validator, so the
        // 30,000-character bound the rest of the workspace assumes has to hold here too.
        const store = new MemoryStore();
        const oversize = `<p>${'word '.repeat(7000)}</p>`;
        const { client } = fakeClient({
            get: { '/assignments/101': { id: 101 } },
            getAll: {
                '/assignments': [{ id: 101, name: 'Long Essay', submission_types: ['online_text_entry'], has_submitted_submissions: true }],
                '/submissions': [{ user_id: 900, attempt: 1, submission_type: 'online_text_entry', body: oversize, submitted_at: '2026-09-21T18:15:00Z', workflow_state: 'submitted', user: { id: 900, name: 'Jordan Lee' } }]
            }
        });
        const service = new SafeCanvasImportService(
            store,
            new LiveCanvasImportGateway({ client, canvasCourseId: '55', extractor: passthroughExtractor })
        );

        const result = await service.importAssignment(request);

        expect(result).toMatchObject({ importedCount: 0, unsupportedCount: 1, failedCount: 0 });
        expect(store.submissions).toHaveLength(0);
    });

    it('never issues a write to Canvas during an import', async () => {
        // post/put/delete on the fake client throw; reaching one fails the import loudly.
        const store = new MemoryStore();
        await expect(liveService(store, okDownload).importAssignment(request)).resolves.toMatchObject({ integration: 'canvas' });
    });
});
