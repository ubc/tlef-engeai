/**
 * Tests for failure-isolated Guided Pathway alert persistence.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 1.0.0
 * @description: Verifies eligibility, exact-message forwarding, and safe write failure behavior.
 */

import {
    persistGuidedPathwayAlertSafely,
    type GuidedPathwayFlagWriter,
} from '../pathway-alert-persistence';

const trigger = {
    pathwayId: 'pathway-1',
    pathwayTitle: 'Support pathway',
    notifyInstructorOnTrigger: true,
};

function baseInput(writer: GuidedPathwayFlagWriter) {
    return {
        writer,
        trigger,
        courseId: 'course-1',
        courseName: 'Course One',
        messageText: '  Keep my exact spacing.  ',
        studentUserId: 'student-1',
        chatId: 'chat-1',
        clientMessageId: 'client-message-1',
        isEligibleStudent: true,
    };
}

describe('persistGuidedPathwayAlertSafely', () => {
    it('writes one alert with the exact message for an eligible notification-enabled trigger', async () => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn().mockResolvedValue({ created: true }),
        };

        await expect(persistGuidedPathwayAlertSafely(baseInput(writer))).resolves.toEqual({
            status: 'created',
        });
        expect(writer.createGuidedPathwayFlag).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'course-1',
            pathwayId: 'pathway-1',
            messageText: '  Keep my exact spacing.  ',
            studentUserId: 'student-1',
            chatId: 'chat-1',
            clientMessageId: 'client-message-1',
        }));
    });

    it('returns failed instead of throwing when alert storage rejects', async () => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn().mockRejectedValue({
                code: 91,
                message: 'database unavailable',
            }),
        };

        await expect(persistGuidedPathwayAlertSafely(baseInput(writer))).resolves.toEqual({
            status: 'failed',
            errorCode: 91,
        });
    });

    it.each([
        ['notification is disabled', { trigger: { ...trigger, notifyInstructorOnTrigger: false } }],
        ['the sender is not an eligible student', { isEligibleStudent: false }],
        ['the course id is unavailable', { courseId: undefined }],
    ])('skips storage when %s', async (_label, overrides) => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn(),
        };

        await expect(persistGuidedPathwayAlertSafely({
            ...baseInput(writer),
            ...overrides,
        })).resolves.toEqual({ status: 'skipped' });
        expect(writer.createGuidedPathwayFlag).not.toHaveBeenCalled();
    });
});
