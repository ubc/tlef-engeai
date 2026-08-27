/**
 * route-lms — token-store key derivation and provider gating
 *
 * The central invariant under test: the LMS token collections are keyed by
 * `GlobalUser.userId` and never by a PUID. `active-users` is the only collection
 * permitted to store a PUID at rest, and `createMongoTokenStore` persists
 * whatever `getUserKey` returns as the document key — so a regression here
 * silently writes PUIDs into `canvas_tokens` and `moodle_tokens`.
 */

import type { Request } from 'express';
import type { GlobalUser } from '../../types/shared';

const findGlobalUserByPUID = jest.fn();

/** Satisfies the token store's structural Collection contract without a real driver. */
const collectionStub = {
    createIndex: jest.fn(async () => 'ok'),
    findOne: jest.fn(async () => null),
    updateOne: jest.fn(async () => ({})),
    deleteOne: jest.fn(async () => ({})),
};

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn(async () => ({
            findGlobalUserByPUID,
            db: { collection: () => collectionStub },
        })),
    },
}));

// Imported after the mock so the module's lazy Mongo access resolves to it.
import { resolveUserKey } from '../route-lms';

const PUID = 'FAKE_INSTRUCTOR_PUID_001';
const USER_ID = 'c3c26c48f180';

const globalUser = {
    userId: USER_ID,
    puid: PUID,
    name: 'Test Instructor',
    affiliation: 'faculty',
    status: 'active',
    coursesEnrolled: [],
} as unknown as GlobalUser;

/** Minimal request carrying only what the resolver reads. */
function requestFor(user: unknown): Request {
    return { user } as unknown as Request;
}

describe('resolveUserKey — token store key derivation', () => {
    beforeEach(() => {
        findGlobalUserByPUID.mockReset();
    });

    it('returns the internal userId for the signed-in user', async () => {
        findGlobalUserByPUID.mockResolvedValue(globalUser);

        await expect(resolveUserKey(requestFor({ puid: PUID }))).resolves.toBe(USER_ID);
        expect(findGlobalUserByPUID).toHaveBeenCalledWith(PUID);
    });

    it('never returns the PUID — the active-users invariant', async () => {
        findGlobalUserByPUID.mockResolvedValue(globalUser);

        const key = await resolveUserKey(requestFor({ puid: PUID }));

        expect(key).not.toBe(PUID);
        expect(key).not.toContain('PUID');
        expect(key).toBe(globalUser.userId);
    });

    it('rejects when no user is authenticated, rather than keying on undefined', async () => {
        await expect(resolveUserKey(requestFor(undefined))).rejects.toThrow(
            /without an authenticated user/i
        );
        expect(findGlobalUserByPUID).not.toHaveBeenCalled();
    });

    it('rejects when the signed-in user has no active-users record', async () => {
        findGlobalUserByPUID.mockResolvedValue(null);

        await expect(resolveUserKey(requestFor({ puid: PUID }))).rejects.toThrow(
            /no active-users record/i
        );
    });

    it('does not leak the PUID in the not-found error message', async () => {
        findGlobalUserByPUID.mockResolvedValue(null);

        // Errors reach logs; a PUID in the message would defeat the invariant
        // just as surely as persisting one.
        await expect(resolveUserKey(requestFor({ puid: PUID }))).rejects.toThrow(
            expect.objectContaining({ message: expect.not.stringContaining(PUID) }) as Error
        );
    });
});

describe('instructor gating', () => {
    /**
     * Builds an app around a freshly-required router, with the providers
     * configured and a session standing in for the given affiliation.
     *
     * The router reads env at import time, so the variables must be set before
     * `require` and the module registry reset between cases.
     */
    function appFor(affiliation: string) {
        jest.resetModules();
        process.env.CANVAS_DOMAIN = 'http://localhost:9100';
        process.env.CANVAS_CLIENT_ID = 'test-client-id';
        process.env.CANVAS_CLIENT_SECRET = 'test-client-secret';
        process.env.CANVAS_REDIRECT_URI = 'http://localhost:8020/api/lms/canvas/auth/callback';
        process.env.MOODLE_DOMAIN = 'http://localhost:9200';

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const express = require('express');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const router = require('../route-lms').default;

        const app = express();
        app.use(express.json());
        app.use((req: any, _res: unknown, next: () => void) => {
            req.isAuthenticated = () => true;
            req.user = { puid: PUID };
            req.session = { globalUser: { userId: USER_ID, affiliation } };
            next();
        });
        app.use('/api/lms', router);
        return app;
    }

    const originalEnv = { ...process.env };
    afterAll(() => {
        process.env = originalEnv;
    });

    beforeEach(() => {
        findGlobalUserByPUID.mockResolvedValue(globalUser);
    });

    it.each([
        ['/api/lms/canvas/courses'],
        ['/api/lms/moodle/courses'],
    ])('403s a student on %s', async (route) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const res = await request(appFor('student')).get(route);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/instructor/i);
    });

    it('lets a student start the Canvas OAuth flow', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const res = await request(appFor('student')).get('/api/lms/canvas/auth/login');

        // Course enrollment sync is a student-facing Canvas feature, so a student
        // connecting Canvas now backs a real capability rather than leaving EngE-AI
        // holding an unused token. 302 is the redirect to Canvas's authorize screen.
        expect(res.status).toBe(302);
    });

    it('still blocks a student from starting the Moodle connect flow', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const res = await request(appFor('student')).post('/api/lms/moodle/auth/connect').send({ token: 'x' });

        // Moodle has no student-facing feature, so the original reasoning still holds
        // there: no token is stored for a user the app has nothing to offer.
        expect(res.status).toBe(403);
    });

    it.each([
        ['/api/lms/canvas/available-courses'],
        ['/api/lms/canvas/connect-course'],
    ])('lets a student reach %s, leaving only the LMS-credential check', async (route) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const app = appFor('student');
        const res =
            route === '/api/lms/canvas/connect-course'
                ? await request(app).post(route).send({ canvasCourseId: '742' })
                : await request(app).get(route);

        // 401 (not 403) proves the student passed EngE-AI's gate and the package's own
        // requireAuth answered — these are the two routes enrollment sync runs on.
        expect(res.status).toBe(401);
        expect(res.body.connected).toBe(false);
    });

    it('lets an instructor past the gate, leaving only the LMS-credential check', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const res = await request(appFor('faculty')).get('/api/lms/canvas/courses');

        // 401 (not 403) proves the role gate passed and the package's own
        // requireAuth answered — no stored Canvas token for this user.
        expect(res.status).toBe(401);
        expect(res.body.connected).toBe(false);
    });

    it('leaves the diagnostics route open to any authenticated user', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const request = require('supertest');
        const res = await request(appFor('student')).get('/api/lms/status');

        expect(res.status).toBe(200);
        expect(res.body.packageLoaded).toBe(true);
    });
});

describe('identity failure handling — which reasons discard the credential', () => {
    /**
     * A mismatched token is the reported failure mode: two EngE-AI users on one browser, Canvas
     * still signed in as the first, so the second's connect silently re-authorizes the first
     * person's Canvas account. Leaving that token on file traps the second user — every retry
     * reaches the same wrong account and "reconnect" changes nothing.
     */
    function handlerFor() {
        jest.resetModules();
        process.env.CANVAS_DOMAIN = 'http://localhost:9100';
        process.env.CANVAS_CLIENT_ID = 'test-client-id';
        process.env.CANVAS_CLIENT_SECRET = 'test-client-secret';
        process.env.CANVAS_REDIRECT_URI = 'http://localhost:8020/api/lms/canvas/auth/callback';

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../route-lms').handleCanvasIdentityError as (
            error: unknown,
            req: unknown,
            res: unknown
        ) => Promise<boolean>;
    }

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

    const originalEnv = { ...process.env };
    afterAll(() => {
        process.env = originalEnv;
    });

    beforeEach(() => {
        findGlobalUserByPUID.mockResolvedValue(globalUser);
        collectionStub.deleteOne.mockClear();
    });

    it('deletes the stored token on a genuine mismatch', async () => {
        const handle = handlerFor();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CanvasIdentityError } = require('../../lms/canvas-course-sync');
        const res = responseSpy();

        const handled = await handle(
            new CanvasIdentityError('not you', 'mismatch'),
            requestFor({ puid: PUID }),
            res
        );

        expect(handled).toBe(true);
        expect(res.statusCode).toBe(403);
        // Keyed by internal userId, never the PUID — the same invariant as every other write.
        expect(collectionStub.deleteOne).toHaveBeenCalledWith({ userKey: USER_ID });
    });

    it.each([['identifiers_withheld'], ['no_puid'], ['self_not_on_roster']])(
        'keeps the token when the reason is %s',
        async (reason) => {
            const handle = handlerFor();
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { CanvasIdentityError } = require('../../lms/canvas-course-sync');
            const res = responseSpy();

            const handled = await handle(
                new CanvasIdentityError('cannot confirm', reason),
                requestFor({ puid: PUID }),
                res
            );

            expect(handled).toBe(true);
            expect(res.statusCode).toBe(403);
            // The credential may be entirely correct; only Canvas's answer was incomplete.
            expect(collectionStub.deleteOne).not.toHaveBeenCalled();
        }
    );

    it('passes non-identity errors through to the caller untouched', async () => {
        const handle = handlerFor();
        const res = responseSpy();

        const handled = await handle(new Error('Canvas is down'), requestFor({ puid: PUID }), res);

        expect(handled).toBe(false);
        expect(res.statusCode).toBe(0);
        expect(collectionStub.deleteOne).not.toHaveBeenCalled();
    });
});

describe('provider gating', () => {
    it('imports cleanly without LMS environment variables, leaving the app bootable', () => {
        // The module is imported above with no CANVAS_*/MOODLE_* set in the test
        // environment. `loadConfigFromEnv` throws when its variables are missing,
        // so reaching this point at all proves both providers self-disabled
        // instead of taking the process down at startup.
        expect(process.env.CANVAS_CLIENT_ID).toBeUndefined();
        expect(typeof resolveUserKey).toBe('function');
    });
});
