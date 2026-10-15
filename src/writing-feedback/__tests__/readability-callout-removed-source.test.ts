/**
 * @fileoverview D-155: the readability callout is gone from the review page and the engines
 * no longer write the plain-language flag. The lint itself stays for the eval harness.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('readability callout removed', () => {
    it('is not rendered on the review page', () => {
        const review = read('public', 'scripts', 'feature', 'writing-feedback-review.ts');
        expect(review).not.toContain('plainLanguageWarning');
        expect(review).not.toContain('plainHosts');
    });

    it('is not written by either engine', () => {
        expect(read('src', 'writing-feedback', 'feedback-engine.ts')).not.toContain('plainLanguageFlag');
        expect(read('src', 'writing-feedback', 'technical-feedback-engine.ts')).not.toContain('plainLanguageFlag');
    });

    it('keeps the lint for the eval harness', () => {
        expect(read('src', 'writing-feedback', 'eval-checks.ts')).toContain('lintFeedbackProse');
    });
});
