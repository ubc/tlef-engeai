/**
 * Canvas import service tests — fail-closed gateways and idempotent intake
 *
 * Verifies the visible synthetic-demo boundary, production-safe unconfigured
 * behavior, privacy-preserving identities, and duplicate-resistant local imports.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.0.0
 * @description: Regression coverage for safe Canvas-to-local submission imports.
 */

import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import {
    buildCanvasImportIdentity,
    createCanvasImportGateway,
    LocalDemoCanvasImportGateway,
    SafeCanvasImportService,
    UnconfiguredCanvasImportGateway
} from '../canvas-import-service';
import type { CanvasImportGateway, CanvasImportStore, CanvasImportSubmissionPreview } from '../canvas-import-contracts';
import type { WritingAssignment, WritingSubmission } from '../contracts';

/** Minimal in-memory persistence double used to expose import idempotency in isolation. */
class MemoryStore implements CanvasImportStore {
    readonly assignment: WritingAssignment = buildDefaultWritingAssignment(
        'course-1',
        'assignment-1',
        'Local writing assignment'
    );
    readonly submissions: WritingSubmission[] = [];
    private nextId = 1;

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
        // Mirrors the unique attempt index and the one-active-per-student partial index.
        const clash = this.submissions.some((item) => item.studentId === input.studentId
            && (item.attempt === input.attempt || (item.slot === 'active' && (input.slot ?? 'active') === 'active')));
        if (clash) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        const stored: WritingSubmission = { slot: 'active', ...input, id: `stored-${this.nextId++}`, createdAt: now, updatedAt: now };
        this.submissions.push(stored);
        return stored;
    }

    async deleteWritingSubmission(courseId: string, submissionId: string): Promise<boolean> {
        const index = this.submissions.findIndex((item) => item.courseId === courseId && item.id === submissionId);
        if (index < 0) return false;
        this.submissions.splice(index, 1);
        return true;
    }
}

describe('Canvas import gateway selection', () => {
    it('uses a visibly synthetic local gateway outside production', async () => {
        const gateway = createCanvasImportGateway({ NODE_ENV: 'development' });
        expect(gateway).toBeInstanceOf(LocalDemoCanvasImportGateway);
        await expect(gateway.getStatus()).resolves.toMatchObject({
            connected: false,
            canImport: true,
            syntheticDataOnly: true,
            integration: 'mock_canvas'
        });
    });

    it('fails closed in production and for unsupported live mode', async () => {
        const production = createCanvasImportGateway({ NODE_ENV: 'production' });
        const requestedLive = createCanvasImportGateway({ NODE_ENV: 'development', CANVAS_INTEGRATION_MODE: 'live' });
        expect(production).toBeInstanceOf(UnconfiguredCanvasImportGateway);
        expect(requestedLive).toBeInstanceOf(UnconfiguredCanvasImportGateway);
        await expect(production.listAssignments()).resolves.toEqual([]);
        await expect(requestedLive.getStatus()).resolves.toMatchObject({ canImport: false, connected: false });
    });

    it('allows an explicit synthetic mock in production for controlled demos', () => {
        expect(createCanvasImportGateway({ NODE_ENV: 'production', CANVAS_INTEGRATION_MODE: 'mock' }))
            .toBeInstanceOf(LocalDemoCanvasImportGateway);
    });
});

describe('SafeCanvasImportService', () => {
    it('imports verified Canvas-text fixtures and skips the same attempts on retry', async () => {
        const store = new MemoryStore();
        const service = new SafeCanvasImportService(store, new LocalDemoCanvasImportGateway());

        const first = await service.importAssignment({
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-technical-description'
        });
        const retry = await service.importAssignment({
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-technical-description'
        });

        expect(first).toMatchObject({ importedCount: 1, skippedCount: 0, integration: 'mock_canvas' });
        expect(first.submissions).toHaveLength(1);
        expect(first.submissions.every((item) => item.sourceType === 'canvas_text')).toBe(true);
        expect(first.submissions.every((item) => item.verifiedText === item.originalText)).toBe(true);
        expect(first.submissions.every((item) => item.requiresVerification === false)).toBe(true);
        // The stored time is the student's Canvas submission time, not the import time.
        const preview = await service.previewAssignment('demo-technical-description');
        expect(first.submissions[0].submittedAt).toEqual(preview.submissions[0].submittedAt);
        expect(retry).toMatchObject({ importedCount: 0, skippedCount: 1 });
        expect(store.submissions).toHaveLength(1);
    });

    it('gives every attempt by one student the same studentId and a distinct fingerprint', () => {
        const input = {
            integration: 'canvas' as const,
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'canvas-7',
            sourceRecordKey: 'learner-a'
        };
        const first = buildCanvasImportIdentity({ ...input, attempt: 1 });
        const second = buildCanvasImportIdentity({ ...input, attempt: 2 });
        expect(second.studentId).toEqual(first.studentId);
        expect(second.fingerprint).not.toEqual(first.fingerprint);
        expect(buildCanvasImportIdentity({ ...input, sourceRecordKey: 'learner-b', attempt: 1 }).studentId)
            .not.toEqual(first.studentId);
    });

    it('builds deterministic, non-source identities for idempotency', () => {
        const input = {
            integration: 'mock_canvas' as const,
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-technical-description',
            sourceRecordKey: 'synthetic-learner-a',
            attempt: 1
        };
        const first = buildCanvasImportIdentity(input);
        const second = buildCanvasImportIdentity(input);
        expect(first).toEqual(second);
        expect(first.studentId).toMatch(/^canvas-demo-[a-f0-9]{24}$/);
        expect(first.studentId).not.toContain(input.sourceRecordKey);
    });

    it('keeps demo and live identities in separate id spaces', () => {
        // A synthetic fixture and a real Canvas user must never collide on studentId, and the
        // prefix must make a stored record's provenance readable without a join.
        const shared = {
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-lled200-a2-description',
            sourceRecordKey: 'synthetic-learner-a',
            attempt: 1
        };
        const demo = buildCanvasImportIdentity({ ...shared, integration: 'mock_canvas' });
        const live = buildCanvasImportIdentity({ ...shared, integration: 'canvas' });

        expect(demo.fingerprint).not.toEqual(live.fingerprint);
        expect(demo.studentId).toMatch(/^canvas-demo-[a-f0-9]{24}$/);
        expect(live.studentId).toMatch(/^canvas-[a-f0-9]{24}$/);
        expect(live.studentId.startsWith('canvas-demo-')).toBe(false);
    });

    it('does not expose assignments when Canvas is unconfigured', async () => {
        const service = new SafeCanvasImportService(new MemoryStore(), new UnconfiguredCanvasImportGateway());
        await expect(service.listAssignments()).resolves.toEqual([]);
        await expect(service.importAssignment({
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'anything'
        })).rejects.toThrow('Canvas import is not configured');
    });
});

/** Gateway whose Canvas submissions a test can change between syncs. */
class ScriptedGateway implements CanvasImportGateway {
    submissions: CanvasImportSubmissionPreview[] = [];

    async getStatus() {
        return {
            mode: 'demo' as const, integration: 'mock_canvas' as const, connected: false,
            canImport: true, syntheticDataOnly: true, label: 'Scripted', message: 'Scripted'
        };
    }

    async listAssignments() {
        return [{ canvasAssignmentId: 'canvas-7', title: 'Scripted', rubricState: 'no_canvas_rubric' as const, synthetic: true }];
    }

    async listSubmissionPreviews() {
        return this.submissions;
    }

    /** Canvas lists only each student's latest attempt, so setting one replaces the last. */
    submit(learner: string, attempt: number): void {
        this.submissions = this.submissions.filter((item) => item.sourceRecordKey !== learner);
        this.submissions.push({
            sourceRecordKey: learner, canvasUserId: learner, studentLabel: learner, attempt,
            submittedAt: new Date(Date.UTC(2026, 9, attempt)), contentKind: 'text_entry',
            attachments: [], synthetic: true, text: `${learner} attempt ${attempt}`
        });
    }
}

describe('SafeCanvasImportService sync', () => {
    const request = { courseId: 'course-1', targetAssignmentId: 'assignment-1', canvasAssignmentId: 'canvas-7' };

    function setup() {
        const store = new MemoryStore();
        const gateway = new ScriptedGateway();
        return { store, gateway, service: new SafeCanvasImportService(store, gateway) };
    }

    it('adds a late first submission to the queue as active', async () => {
        const { store, gateway, service } = setup();
        gateway.submit('learner-a', 1);
        await service.importAssignment(request);
        gateway.submit('learner-b', 1);

        const result = await service.importAssignment(request);

        expect(result).toMatchObject({ importedCount: 1, heldCount: 0, skippedCount: 1 });
        expect(store.submissions.map((item) => item.slot)).toEqual(['active', 'active']);
    });

    it('holds a resubmission beside the active submission instead of adding a second one', async () => {
        const { store, gateway, service } = setup();
        gateway.submit('learner-a', 1);
        const first = await service.importAssignment(request);
        gateway.submit('learner-a', 2);

        const result = await service.importAssignment(request);
        const retry = await service.importAssignment(request);

        expect(result).toMatchObject({ importedCount: 0, heldCount: 1, submissions: [] });
        expect(retry).toMatchObject({ importedCount: 0, heldCount: 0, skippedCount: 1 });
        expect(store.submissions).toHaveLength(2);
        expect(store.submissions[1]).toMatchObject({
            slot: 'held',
            attempt: 2,
            studentId: first.submissions[0].studentId,
            replacesSubmissionId: first.submissions[0].id
        });
    });

    it('keeps only the newest held attempt when a student resubmits again', async () => {
        const { store, gateway, service } = setup();
        gateway.submit('learner-a', 1);
        await service.importAssignment(request);
        gateway.submit('learner-a', 2);
        await service.importAssignment(request);
        gateway.submit('learner-a', 3);

        const result = await service.importAssignment(request);

        expect(result.heldCount).toBe(1);
        expect(store.submissions.map((item) => [item.slot, item.attempt])).toEqual([['active', 1], ['held', 3]]);
    });

    it('skips an attempt staff declined and an attempt older than the active one', async () => {
        const { store, gateway, service } = setup();
        gateway.submit('learner-a', 2);
        await service.importAssignment(request);
        store.submissions[0].declinedAttempts = [3];

        gateway.submit('learner-a', 3);
        const declined = await service.importAssignment(request);
        gateway.submit('learner-a', 1);
        const older = await service.importAssignment(request);

        expect(declined).toMatchObject({ heldCount: 0, skippedCount: 1 });
        expect(older).toMatchObject({ heldCount: 0, skippedCount: 1 });
        expect(store.submissions).toHaveLength(1);
    });
});
