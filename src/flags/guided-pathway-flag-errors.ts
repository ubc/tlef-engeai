/**
 * Guided Pathway flag errors
 *
 * Domain errors shared by automatic-flag persistence and HTTP adapters so
 * transport status mapping does not depend on the Mongo implementation.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Persistence-neutral lifecycle and identity error contracts.
 */

/** Raised when an alert id is absent from the required course scope. */
export class GuidedPathwayFlagNotFoundError extends Error {
    constructor(message = 'Guided Pathway alert not found') {
        super(message);
        this.name = 'GuidedPathwayFlagNotFoundError';
    }
}

/** Raised when an action conflicts with the alert's completed lifecycle state. */
export class GuidedPathwayFlagConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GuidedPathwayFlagConflictError';
    }
}

/** Raised after a successful reveal audit when the current roster name no longer exists. */
export class GuidedPathwayFlagIdentityUnavailableError extends Error {
    constructor() {
        super('Student identity is unavailable in the current course roster');
        this.name = 'GuidedPathwayFlagIdentityUnavailableError';
    }
}
