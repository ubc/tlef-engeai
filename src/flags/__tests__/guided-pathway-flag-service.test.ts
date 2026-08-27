import type { GuidedPathwayFlagWriter } from '../guided-pathway-flag-contracts';
import { persistGuidedPathwayFlagSafely } from '../guided-pathway-flag-service';

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
        actor: { origin: 'student' as const, userId: 'student-1' },
        chatId: 'chat-1',
        clientMessageId: 'client-message-1',
    };
}

describe('persistGuidedPathwayFlagSafely', () => {
    it('writes one flag with the exact message for an eligible notification-enabled trigger', async () => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn().mockResolvedValue({ created: true }),
        };

        await expect(persistGuidedPathwayFlagSafely(baseInput(writer))).resolves.toEqual({
            status: 'created',
        });
        expect(writer.createGuidedPathwayFlag).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'course-1',
            pathwayId: 'pathway-1',
            messageText: '  Keep my exact spacing.  ',
            actor: { origin: 'student', userId: 'student-1' },
            chatId: 'chat-1',
            clientMessageId: 'client-message-1',
        }));
    });

    it('forwards an explicit instructor-test actor without changing the exact message', async () => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn().mockResolvedValue({ created: true }),
        };

        await expect(persistGuidedPathwayFlagSafely({
            ...baseInput(writer),
            actor: { origin: 'instructor-test', userId: 'instructor-1' },
        })).resolves.toEqual({ status: 'created' });
        expect(writer.createGuidedPathwayFlag).toHaveBeenCalledWith(expect.objectContaining({
            messageText: '  Keep my exact spacing.  ',
            actor: { origin: 'instructor-test', userId: 'instructor-1' },
        }));
    });

    it('returns failed instead of throwing when flag storage rejects', async () => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn().mockRejectedValue({
                code: 91,
                message: 'database unavailable',
            }),
        };

        await expect(persistGuidedPathwayFlagSafely(baseInput(writer))).resolves.toEqual({
            status: 'failed',
            errorCode: 91,
        });
    });

    it.each([
        ['notification is disabled', { trigger: { ...trigger, notifyInstructorOnTrigger: false } }],
        ['the sender has no eligible server-derived actor', { actor: null }],
        ['the course id is unavailable', { courseId: undefined }],
    ])('skips storage when %s', async (_label, overrides) => {
        const writer: GuidedPathwayFlagWriter = {
            createGuidedPathwayFlag: jest.fn(),
        };

        await expect(persistGuidedPathwayFlagSafely({
            ...baseInput(writer),
            ...overrides,
        })).resolves.toEqual({ status: 'skipped' });
        expect(writer.createGuidedPathwayFlag).not.toHaveBeenCalled();
    });
});
