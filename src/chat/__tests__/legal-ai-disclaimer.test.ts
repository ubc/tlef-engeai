/**
 * Self-check for appendLegalAiDisclaimer — fails if Counsel append/idempotency breaks.
 */
import {
    LEGAL_AI_DISCLAIMER_PAGE_PATH,
    LEGAL_AI_DISCLAIMER_SHORT,
    appendLegalAiDisclaimer,
} from '../legal-ai-disclaimer';

describe('appendLegalAiDisclaimer', () => {
    it('appends the short disclaimer when missing', () => {
        const result = appendLegalAiDisclaimer('Hello!');
        expect(result).toBe(`Hello!\n\n${LEGAL_AI_DISCLAIMER_SHORT}`);
        expect(result).toContain(LEGAL_AI_DISCLAIMER_PAGE_PATH);
    });

    it('does not double-append when the page path is already present', () => {
        const once = appendLegalAiDisclaimer('Hello!');
        expect(appendLegalAiDisclaimer(once)).toBe(once);
    });
});
