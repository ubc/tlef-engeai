/**
 * Route-level tests for academic period validation helpers.
 */

import {
    validatePeriodDates,
    AcademicPeriodValidationError
} from '../../db/mongo/academic-period-mongo';

describe('academic period route validation', () => {
    it('rejects equal start and end dates', () => {
        expect(() => validatePeriodDates('2026-01-06', '2026-01-06')).toThrow(
            AcademicPeriodValidationError
        );
    });
});
