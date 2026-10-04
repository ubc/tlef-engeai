/**
 * @fileoverview Source guard for the review page's plain-language warning. The review
 * panel needs a DOM and the Jest project has none, so the wiring is pinned by reading the
 * source; the copy itself is unit tested in writing-feedback-diagnosis-model.test.ts.
 */

import fs from 'fs';
import path from 'path';

const review = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-review.ts'),
    'utf8'
);

describe('plain-language warning on the review page', () => {
    it('builds one warning per lens from that lens\'s run', () => {
        expect(review).toContain('plainLanguageWarning(lensRuns[lens])');
    });

    it('shows only the visible lens\'s warning', () => {
        expect(review).toMatch(/plainHosts\.forEach\(\(host, key\) => \{ host\.hidden = key !== lens \|\| !host\.textContent; \}\)/);
    });

    it('renders the warnings above the annotation lists', () => {
        const warnings = review.indexOf('plainHosts.forEach((host) => annotationsBody.append(host))');
        expect(warnings).toBeGreaterThan(-1);
        expect(warnings).toBeLessThan(review.indexOf('listHosts.forEach((host) => annotationsBody.append(host))'));
    });
});
