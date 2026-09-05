/**
 * @fileoverview Source guard for the rubric page's autosave wiring. The page needs a DOM
 * to run, and the Jest project has none, so the invariants that matter — no technical
 * rubric seeded in the background, no throwing collector on the autosave path, a stop on
 * an expired session — are pinned by reading the source. The state machine itself is unit
 * tested in public/scripts/feature/__tests__/writing-feedback-autosave.test.ts.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-rubric.ts'),
    'utf8'
);

const autosavePath = source.match(/async function autosaveAssignmentRubrics[\s\S]*?\n}\n/)?.[0] ?? '';

describe('rubric page autosave wiring', () => {
    it('has its own narrow write path', () => {
        expect(autosavePath).not.toBe('');
    });

    it('never seeds a technical rubric in the background', () => {
        expect(autosavePath).not.toContain('/lab-report');
        expect(autosavePath).not.toContain('technicalMissing');
    });

    it('never approves in the background', () => {
        expect(autosavePath).not.toContain('rubric-draft/approve');
    });

    it('reads the form without throwing on a half-filled one', () => {
        expect(autosavePath).toContain('readAssignmentDetails(');
    });

    it('writes through the draft route only', () => {
        expect(autosavePath).toContain('/rubric-draft');
        expect(autosavePath).toContain("'PUT'");
    });

    it('stops the loop and says so when the session has expired', () => {
        expect(source).toContain('AutosaveSignedOutError');
        expect(source).toContain("You've been signed out");
    });

    it('clears the page dirty flag once a background write succeeds', () => {
        expect(source).toMatch(/status === 'saved'[\s\S]{0,200}state\.panelDirty = false/);
    });

    it('flushes on page hide and on visibility change', () => {
        expect(source).toContain("'visibilitychange'");
        expect(source).toContain("'pagehide'");
    });
});
