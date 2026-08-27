/**
 * Manual flag policy
 *
 * Defines the inherited manual-report categories and lifecycle validation used
 * by both HTTP and Mongo adapters without performing persistence or logging.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Pure category and status-transition policy for manual flags.
 */

import type { FlagReport } from '../types/shared';

/** Manual/student-reported categories accepted by the existing flag workflow. */
export const MANUAL_FLAG_TYPES = [
    'innacurate_response',
    'harassment',
    'inappropriate',
    'dishonesty',
    'interface bug',
    'other'
] as const satisfies readonly FlagReport['flagType'][];

/**
 * isManualFlagType - Narrows untrusted input to an inherited manual flag category.
 *
 * @param value - Candidate request or document value
 * @returns Whether the value is one of the supported manual report categories
 */
export function isManualFlagType(value: unknown): value is FlagReport['flagType'] {
    return typeof value === 'string' && (MANUAL_FLAG_TYPES as readonly string[]).includes(value);
}

/**
 * validateManualFlagStatusTransition - Validates the inherited two-state lifecycle.
 *
 * Same-state and unknown-state transitions fail with a stable explanatory error.
 *
 * @param currentStatus - Existing stored status
 * @param newStatus - Requested next status
 * @returns A success discriminator or the validation error for the caller
 */
export function validateManualFlagStatusTransition(
    currentStatus: string,
    newStatus: string
): { isValid: boolean; error?: string } {
    const validStatuses = ['unresolved', 'resolved'];
    if (!validStatuses.includes(newStatus)) {
        return {
            isValid: false,
            error: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`
        };
    }
    if (!validStatuses.includes(currentStatus)) {
        return {
            isValid: false,
            error: `Invalid current status: ${currentStatus}. Must be one of: ${validStatuses.join(', ')}`
        };
    }
    const validTransitions: Record<string, string[]> = {
        unresolved: ['resolved'],
        resolved: ['unresolved']
    };
    if (!validTransitions[currentStatus].includes(newStatus)) {
        return {
            isValid: false,
            error: `Invalid transition: ${currentStatus} -> ${newStatus}. Valid transitions: ${validTransitions[currentStatus].join(', ')}`
        };
    }
    return { isValid: true };
}
