/**
 * saml-callback-roster-enrollment.test.ts
 *
 * Pins that every CWL sign-in grants Canvas roster enrollment, whichever callback path the IdP
 * posts to. Deployed environments use `/Shibboleth.sso/SAML2/POST` (mounted in `server.ts`) while
 * local SAML testing uses `/auth/saml/callback`, so both must run the one shared handler.
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

const SAML_USER = {
    puid: 'TEST_PUID_001',
    firstName: 'Test',
    lastName: 'Student',
    affiliation: 'student',
};

const storedUser = {
    puid: SAML_USER.puid,
    name: 'Test Student',
    userId: 'user-1',
    coursesEnrolled: [] as string[],
    affiliation: 'student',
    status: 'active',
    isAdmin: false,
};

jest.mock('../../middleware/passport', () => ({
    isSamlAvailable: true,
    ubcShibStrategy: {},
    passport: {
        // Stands in for SAML response validation: the IdP has vouched for this user.
        authenticate: () => (req: any, _res: any, next: any) => {
            req.user = { ...SAML_USER };
            next();
        },
    },
}));

const mongo = {
    findGlobalUserByPUID: jest.fn(),
    createGlobalUser: jest.fn(),
    updateGlobalUserAffiliation: jest.fn(),
    updateGlobalUser: jest.fn(),
    idGenerator: { globalUserID: jest.fn(() => 'user-1') },
};

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn(async () => mongo) },
}));

const applyRosterEnrollment = jest.fn();
jest.mock('../../helpers/apply-roster-enrollment', () => ({
    applyRosterEnrollment: (...args: unknown[]) => applyRosterEnrollment(...args),
}));

import authRoutes, { samlCallbackHandler } from '../route-auth';

/** Mounts the callback the way `server.ts` and the auth router do, with a minimal session. */
function buildApp(): express.Express {
    const app = express();
    app.use((req: any, _res, next) => {
        req.session = { save: (callback: (err?: Error) => void) => callback() };
        next();
    });
    app.use('/auth', authRoutes);
    app.post('/Shibboleth.sso/SAML2/POST', ...samlCallbackHandler);
    return app;
}

describe('CWL sign-in roster enrollment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.findGlobalUserByPUID.mockResolvedValue({ ...storedUser });
        applyRosterEnrollment.mockImplementation(async (_db, user) => ({
            ...user,
            coursesEnrolled: ['course-from-canvas'],
        }));
    });

    it.each(['/Shibboleth.sso/SAML2/POST', '/auth/saml/callback'])(
        'grants roster enrollment for a sign-in posted to %s',
        async (callbackPath) => {
            const response = await request(buildApp()).post(callbackPath);

            expect(response.status).toBe(302);
            expect(applyRosterEnrollment).toHaveBeenCalledTimes(1);
            expect(applyRosterEnrollment).toHaveBeenCalledWith(
                mongo,
                expect.objectContaining({ userId: 'user-1' })
            );
        }
    );

    it('mounts the shared handler at the IdP-registered path in server.ts', () => {
        // server.ts starts listening on import, so its wiring is checked from source.
        const serverSource = fs.readFileSync(path.join(__dirname, '../../server.ts'), 'utf8');

        expect(serverSource).toMatch(
            /app\.post\(\s*'\/Shibboleth\.sso\/SAML2\/POST'\s*,\s*\.\.\.samlCallbackHandler\s*\)/
        );
    });
});
