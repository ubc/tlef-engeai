import {
    assignmentTypeFromAction,
    oldestPendingAssignment,
    proceedToRubricMessage
} from '../writing-feedback-assignment-type-state';

describe('proceedToRubricMessage', () => {
    it('tells staff the rubric must be approved before feedback', () => {
        const message = proceedToRubricMessage('writing');
        expect(message).toContain('writing assignment');
        expect(message).toContain('approve it');
        expect(message).toContain('feedback cannot be generated');
    });

    it('names both rubrics for a lab report', () => {
        const message = proceedToRubricMessage('lab_report');
        expect(message).toContain('writing and technical rubrics');
        expect(message).toContain('feedback cannot be generated');
    });
});

describe('assignmentTypeFromAction', () => {
    it('maps the modal button actions to the two answers', () => {
        // ModalOverlay derives an action from the button text: lower case, spaces to hyphens.
        expect(assignmentTypeFromAction('writing-assignment')).toBe('writing');
        expect(assignmentTypeFromAction('lab-report-assignment')).toBe('lab_report');
    });

    it('treats any other close as no answer', () => {
        expect(assignmentTypeFromAction('close')).toBeNull();
        expect(assignmentTypeFromAction('escape')).toBeNull();
    });
});

describe('oldestPendingAssignment', () => {
    it('picks the earliest-created pending assignment', () => {
        const picked = oldestPendingAssignment([
            { id: 'new', assignmentTypePending: true, createdAt: '2026-09-13T10:00:00.000Z' },
            { id: 'settled', createdAt: '2026-09-01T10:00:00.000Z' },
            { id: 'old', assignmentTypePending: true, createdAt: '2026-09-12T10:00:00.000Z' }
        ]);
        expect(picked?.id).toBe('old');
    });

    it('ignores legacy and settled assignments', () => {
        expect(oldestPendingAssignment([
            { id: 'legacy', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'settled', assignmentTypePending: false, createdAt: '2026-01-02T00:00:00.000Z' }
        ])).toBeUndefined();
    });
});
