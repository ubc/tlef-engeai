/**
 * canvas-identity-response — how a refused Canvas identity check is answered
 *
 * A refused account stays connected, so a mismatch has to carry the link to connect again; the
 * other refusals are not fixed by reconnecting and must not suggest they are.
 */

jest.mock('@ubc/ubc-genai-toolkit-lms-integration', () => ({
    canvas: {},
    createMongoTokenStore: jest.fn(),
    rosterFieldCoverage: jest.fn(),
}));
jest.mock('../../helpers/provision-course', () => ({ provisionCourse: jest.fn() }));
jest.mock('../../db/enge-ai-mongodb', () => ({ EngEAI_MongoDB: { getInstance: jest.fn() } }));
jest.mock('../../utils/logger', () => ({ appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import type { Request, Response } from 'express';
import { CanvasIdentityError } from '../canvas-course-sync';
import { handleCanvasIdentityError } from '../canvas-identity-response';

function responseSpy() {
    const res = {
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(payload: unknown) {
            res.body = payload;
            return res;
        },
    };
    return res;
}

const req = { originalUrl: '/api/courses/c1/writing-feedback/canvas/assignments' } as Request;

describe('handleCanvasIdentityError', () => {
    it('offers a connect link, returning to the refused request, for a genuine mismatch', async () => {
        const res = responseSpy();

        await expect(handleCanvasIdentityError(new CanvasIdentityError('not you', 'mismatch'), req, res as unknown as Response))
            .resolves.toBe(true);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            error: 'not you',
            reason: 'mismatch',
            connectUrl: `/api/lms/canvas/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`,
        });
    });

    it.each([['identifiers_withheld'], ['no_puid'], ['self_not_on_roster']] as const)(
        'offers no connect link for %s, which reconnecting cannot fix',
        async (reason) => {
            const res = responseSpy();

            await handleCanvasIdentityError(new CanvasIdentityError('cannot confirm', reason), req, res as unknown as Response);

            expect(res.statusCode).toBe(403);
            expect(res.body).not.toHaveProperty('connectUrl');
        }
    );

    it('passes other errors through untouched', async () => {
        const res = responseSpy();

        await expect(handleCanvasIdentityError(new Error('Canvas is down'), req, res as unknown as Response)).resolves.toBe(false);
        expect(res.statusCode).toBe(0);
    });
});
