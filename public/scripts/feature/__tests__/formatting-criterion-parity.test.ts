/**
 * formatting-criterion-parity.test.ts
 *
 * The server defaults formatting criteria to staff on Canvas import; the grid warns when
 * staff hand one back to EngE-AI. Both must agree on what "formatting" means, or a row
 * imported as staff could be switched without a warning, or warn when it never defaulted.
 */

import { FORMATTING_CRITERION_PATTERN as SERVER_PATTERN } from '../../../../src/writing-feedback/criterion-assessment';
import { FORMATTING_CRITERION_PATTERN as CLIENT_PATTERN } from '../writing-feedback-shared';

describe('formatting criterion pattern parity', () => {
    it('is the same pattern on server and client', () => {
        expect(CLIENT_PATTERN.source).toBe(SERVER_PATTERN.source);
        expect(CLIENT_PATTERN.flags).toBe(SERVER_PATTERN.flags);
    });
});
