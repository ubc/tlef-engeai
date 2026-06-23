/**
 * course-selection-redirect.ts
 *
 * Post-login and page-gate redirect paths for course selection surfaces.
 */

import type { GlobalUser } from '../types/shared';
import { isAdminUser } from '../utils/admin';

/** Returns admin or faculty/student course selection path. */
export function getCourseSelectionRedirectPath(globalUser: GlobalUser | null | undefined): string {
    if (isAdminUser(globalUser)) {
        return '/admin/course-selection';
    }
    return '/course-selection';
}
