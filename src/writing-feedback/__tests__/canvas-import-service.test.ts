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

import { buildA2Assignment } from '../a2-profile';
import {
    buildCanvasImportIdentity,
    createCanvasImportGateway,
    LocalDemoCanvasImportGateway,
    SafeCanvasImportService,
    UnconfiguredCanvasImportGateway
} from '../canvas-import-service';
import type { CanvasImportStore } from '../canvas-import-contracts';
import type { WritingAssignment, WritingSubmission } from '../contracts';

/** Minimal in-memory persistence double used to expose import idempotency in isolation. */
class MemoryStore implements CanvasImportStore {
    readonly assignment: WritingAssignment = buildA2Assignment('course-1', 'assignment-1');
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
            canvasAssignmentId: 'demo-lled200-a2-description'
        });
        const retry = await service.importAssignment({
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-lled200-a2-description'
        });

        expect(first).toMatchObject({ importedCount: 2, skippedCount: 0, integration: 'mock_canvas' });
        expect(first.submissions).toHaveLength(2);
        expect(first.submissions.every((item) => item.sourceType === 'canvas_text')).toBe(true);
        expect(first.submissions.every((item) => item.verifiedText === item.originalText)).toBe(true);
        expect(first.submissions.every((item) => item.requiresVerification === false)).toBe(true);
        expect(retry).toMatchObject({ importedCount: 0, skippedCount: 2 });
        expect(store.submissions).toHaveLength(2);
    });

    it('builds deterministic, non-source identities for idempotency', () => {
        const input = {
            courseId: 'course-1',
            targetAssignmentId: 'assignment-1',
            canvasAssignmentId: 'demo-lled200-a2-description',
            sourceRecordKey: 'synthetic-learner-a',
            attempt: 1
        };
        const first = buildCanvasImportIdentity(input);
        const second = buildCanvasImportIdentity(input);
        expect(first).toEqual(second);
        expect(first.studentId).toMatch(/^canvas-demo-[a-f0-9]{24}$/);
        expect(first.studentId).not.toContain(input.sourceRecordKey);
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
