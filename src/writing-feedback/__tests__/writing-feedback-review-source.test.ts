/**
 * @fileoverview Source guard for frontend review copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-review.ts'),
    'utf8'
);

describe('writing feedback review source contract', () => {
    it('labels retired rubric criteria without rendering internal ids', () => {
        const criterionLabel = source.match(/function criterionLabel[\s\S]*?\n}/)?.[0] ?? '';
        expect(source).toContain("?? 'Removed criterion'");
        expect(source).toContain('This criterion was removed after rubric v');
        expect(criterionLabel).not.toMatch(/\?\?\s*id/);
    });
});
