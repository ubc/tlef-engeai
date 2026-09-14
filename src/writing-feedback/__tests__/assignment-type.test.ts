/**
 * Assignment type service tests — the one-time writing / lab report choice (D-123)
 */

import {
    AssignmentTypeService,
    NOT_LAB_REPORT_MESSAGE,
    TYPE_ALREADY_CHOSEN_MESSAGE,
    assignmentTypeErrorStatus,
    isAssignmentTypeChoice,
    type AssignmentTypeStore
} from '../assignment-type';
import type { LabReportRouting } from '../rubric-seed';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { buildLabReportRubric } from '../lab-report-profile';
import type { CanvasRubricIdMap, WritingAssignment } from '../contracts';

function pendingAssignment(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    return {
        ...buildDefaultWritingAssignment('course-1', 'assignment-1', 'Lab 3'),
        assignmentTypePending: true,
        ...overrides
    };
}

function canvasSeeded(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    const grid = buildLabReportRubric('platform', new Date('2026-01-01T00:00:00.000Z'));
    return pendingAssignment({
        rubricSource: 'canvas',
        canvasRubricImport: {
            shape: { criteria: grid.criteria, levels: grid.levels },
            ids: {} as CanvasRubricIdMap,
            importedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        ...overrides
    });
}

function store(assignment: WritingAssignment | null) {
    return {
        getWritingAssignment: jest.fn(async (): Promise<WritingAssignment | null> => assignment),
        chooseWritingAssignmentType: jest.fn(
            async (_c: string, _a: string, isLabReport: boolean): Promise<WritingAssignment | null> =>
                assignment ? { ...assignment, isLabReport, assignmentTypePending: undefined } : null
        ),
        applyLabReportRubricRouting: jest.fn(
            async (_c: string, _a: string, routing: LabReportRouting, _reset: boolean): Promise<WritingAssignment | null> =>
                assignment ? { ...assignment, isLabReport: true, technicalRubricDraft: routing.technicalDraft } : null
        )
    };
}

/** Builds the service over jest doubles; the cast is confined to this one place. */
function service(mongo: ReturnType<typeof store>): AssignmentTypeService {
    return new AssignmentTypeService(mongo as unknown as AssignmentTypeStore);
}

describe('isAssignmentTypeChoice', () => {
    it('accepts only the two answers', () => {
        expect(isAssignmentTypeChoice('writing')).toBe(true);
        expect(isAssignmentTypeChoice('lab_report')).toBe(true);
        expect(isAssignmentTypeChoice('lab-report')).toBe(false);
        expect(isAssignmentTypeChoice(undefined)).toBe(false);
    });
});

describe('assignmentTypeErrorStatus', () => {
    it('maps fixed messages to their HTTP status', () => {
        expect(assignmentTypeErrorStatus(new Error('Writing assignment not found'))).toBe(404);
        expect(assignmentTypeErrorStatus(new Error(TYPE_ALREADY_CHOSEN_MESSAGE))).toBe(409);
        expect(assignmentTypeErrorStatus(new Error(NOT_LAB_REPORT_MESSAGE))).toBe(409);
        expect(assignmentTypeErrorStatus(new Error('anything else'))).toBe(400);
    });
});

describe('AssignmentTypeService.choose', () => {
    it('records a writing assignment without touching the rubrics', async () => {
        const mongo = store(pendingAssignment());
        const result = await service(mongo).choose('course-1', 'assignment-1', 'writing', 'staff-1');

        expect(mongo.chooseWritingAssignmentType).toHaveBeenCalledWith('course-1', 'assignment-1', false);
        expect(mongo.applyLabReportRubricRouting).not.toHaveBeenCalled();
        expect(result.isLabReport).toBe(false);
    });

    it('moves a Canvas grid to the technical rubric and resets the writing rubric for a lab report', async () => {
        const mongo = store(canvasSeeded());
        await service(mongo).choose('course-1', 'assignment-1', 'lab_report', 'staff-1');

        expect(mongo.chooseWritingAssignmentType).toHaveBeenCalledWith('course-1', 'assignment-1', true);
        const [, , routing, resetWriting] = mongo.applyLabReportRubricRouting.mock.calls[0];
        expect(routing.technicalRubricSource).toBe('canvas');
        expect(routing.writingRubricSource).toBe('internal_profile');
        expect(resetWriting).toBe(true);
    });

    it('seeds the built-in technical rubric and keeps the writing rubric for a manual lab report', async () => {
        const mongo = store(pendingAssignment());
        await service(mongo).choose('course-1', 'assignment-1', 'lab_report', 'staff-1');

        const [, , routing, resetWriting] = mongo.applyLabReportRubricRouting.mock.calls[0];
        expect(routing.technicalRubricSource).toBe('builtin');
        expect(resetWriting).toBe(false);
    });

    it('refuses once the type has been chosen and writes nothing', async () => {
        const mongo = store(pendingAssignment({ assignmentTypePending: undefined }));

        await expect(service(mongo).choose('course-1', 'assignment-1', 'writing', 'staff-1'))
            .rejects.toThrow(TYPE_ALREADY_CHOSEN_MESSAGE);
        expect(mongo.chooseWritingAssignmentType).not.toHaveBeenCalled();
    });

    it('refuses when another request chose the type first', async () => {
        const mongo = store(pendingAssignment());
        mongo.chooseWritingAssignmentType.mockResolvedValueOnce(null);

        await expect(service(mongo).choose('course-1', 'assignment-1', 'lab_report', 'staff-1'))
            .rejects.toThrow(TYPE_ALREADY_CHOSEN_MESSAGE);
        expect(mongo.applyLabReportRubricRouting).not.toHaveBeenCalled();
    });

    it('reports a missing assignment', async () => {
        await expect(service(store(null)).choose('course-1', 'missing', 'writing', 'staff-1'))
            .rejects.toThrow('Writing assignment not found');
    });
});

describe('AssignmentTypeService.seedTechnicalRubric', () => {
    it('refuses an assignment that is not a lab report', async () => {
        const mongo = store(pendingAssignment({ assignmentTypePending: undefined, isLabReport: false }));

        await expect(service(mongo).seedTechnicalRubric('course-1', 'assignment-1', 'staff-1'))
            .rejects.toThrow(NOT_LAB_REPORT_MESSAGE);
    });

    it('leaves an existing technical draft alone', async () => {
        const draft = buildLabReportRubric('staff-1', new Date());
        const assignment = pendingAssignment({ assignmentTypePending: undefined, isLabReport: true, technicalRubricDraft: draft });
        const mongo = store(assignment);

        const result = await service(mongo).seedTechnicalRubric('course-1', 'assignment-1', 'staff-1');

        expect(result).toBe(assignment);
        expect(mongo.applyLabReportRubricRouting).not.toHaveBeenCalled();
    });

    it('seeds a missing technical rubric without resetting the writing rubric', async () => {
        const mongo = store(canvasSeeded({ assignmentTypePending: undefined, isLabReport: true }));

        await service(mongo).seedTechnicalRubric('course-1', 'assignment-1', 'staff-1');

        const [, , routing, resetWriting] = mongo.applyLabReportRubricRouting.mock.calls[0];
        expect(routing.technicalRubricSource).toBe('canvas');
        expect(resetWriting).toBe(false);
    });
});
