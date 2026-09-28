/**
 * @fileoverview The diagnosis failure message is fixed text with no student content, so the
 * service may log it verbatim; unknown messages stay withheld.
 */

import { describeFailureSafely } from '../writing-feedback-service';
import { TEXT_DIAGNOSIS_FAILED_MESSAGE } from '../text-diagnosis';

describe('describeFailureSafely and the diagnosis step', () => {
    it('logs the fixed diagnosis failure message verbatim', () => {
        expect(describeFailureSafely(new Error(TEXT_DIAGNOSIS_FAILED_MESSAGE))).toContain(TEXT_DIAGNOSIS_FAILED_MESSAGE);
    });

    it('still withholds a message that is not on the allowlist', () => {
        expect(describeFailureSafely(new Error('Sound happens when an object vibrates.'))).not.toContain('Sound happens');
    });
});
