/**
 * Platform admin utilities.
 */

import type { GlobalUser } from '../types/shared';

/** True when the global user has platform admin privileges. */
export function isAdminUser(globalUser: GlobalUser | null | undefined): boolean {
    return globalUser?.isAdmin === true;
}
