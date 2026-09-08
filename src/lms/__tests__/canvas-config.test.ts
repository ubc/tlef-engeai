/**
 * canvas-config.test.ts
 *
 * Guards the scope list the authorize URL requests. These are the least-privilege claims made
 * to the Canvas key's owner, so they are asserted here rather than left to a document that a
 * later edit can silently outgrow.
 */

import { CANVAS_OAUTH_SCOPES, canvasAuthorizeScopeParams } from '../canvas-config';

describe('CANVAS_OAUTH_SCOPES', () => {
    it('requests a scope for every endpoint the app calls', () => {
        // A missing entry is not a local failure: Canvas fixes the granted set when the token is
        // minted, so the gap surfaces as a 401 on whichever call was left out.
        expect(CANVAS_OAUTH_SCOPES).toHaveLength(13);
        expect(new Set(CANVAS_OAUTH_SCOPES).size).toBe(CANVAS_OAUTH_SCOPES.length);
    });

    it('confines every write to a submission, and grants no deletes', () => {
        const writes = CANVAS_OAUTH_SCOPES.filter((scope) => !scope.startsWith('url:GET|'));
        expect(writes).not.toHaveLength(0);
        expect(writes.every((scope) => scope.includes('/submissions'))).toBe(true);
        expect(CANVAS_OAUTH_SCOPES.some((scope) => scope.startsWith('url:DELETE|'))).toBe(false);
    });

    it('reaches no account-level or SIS resource', () => {
        expect(CANVAS_OAUTH_SCOPES.some((scope) => scope.includes('/accounts/'))).toBe(false);
        expect(CANVAS_OAUTH_SCOPES.some((scope) => scope.includes('sis_'))).toBe(false);
    });

    it('uses the literal form Canvas compares against', () => {
        // Canvas matches these strings exactly; a stray space or a missing `url:` prefix fails
        // the authorization the same way requesting nothing does.
        for (const scope of CANVAS_OAUTH_SCOPES) {
            expect(scope).toMatch(/^url:(GET|POST|PUT)\|\/api\/v1\/\S+$/);
            expect(scope.trim()).toBe(scope);
        }
    });
});

describe('canvasAuthorizeScopeParams', () => {
    it('sends every scope in one space-separated parameter', () => {
        // One entry, not thirteen: the package appends a `scope` param per entry, and Canvas
        // keeps only the last of a repeated scalar param — which authorizes successfully and
        // then 401s on every endpoint outside that one scope.
        const params = canvasAuthorizeScopeParams();
        expect(params).toHaveLength(1);
        expect(params[0].split(' ')).toEqual([...CANVAS_OAUTH_SCOPES]);
    });
});
