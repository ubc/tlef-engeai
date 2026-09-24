/**
 * Feedback PDF disposition contract
 *
 * Staff review a PDF far more often than they archive one, so the route serves it inline and
 * offers download as the explicit choice. Previously every mode forced a download, which is why
 * a reviewer could not simply look at the feedback they had just written.
 *
 * A source-text guard, matching `writing-feedback-lens-routes-contract.test.ts`: the route needs
 * a live Mongo connection to exercise, and the contract worth pinning is the header it sets.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Pins inline-by-default PDF delivery and the explicit download escape hatch.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', 'route-writing-feedback.ts'),
    'utf8'
);

describe('feedback pdf disposition', () => {
    it('serves the pdf inline by default', () => {
        expect(source).toMatch(/const disposition = req\.query\.download === '1' \? 'attachment' : 'inline'/);
        expect(source).toMatch(/Content-Disposition['"],\s*`\$\{disposition\}; filename="\$\{filename\}"`/);
    });

    it('no longer hard-codes attachment', () => {
        expect(source).not.toMatch(/`attachment; filename=/);
    });
});
