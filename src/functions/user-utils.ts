/**
 * User Utility Functions
 * 
 * Shared utility functions for user data manipulation and privacy protection
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { GlobalUser } from './types';

/**
 * Sanitize GlobalUser object for frontend responses
 * Removes PUID to ensure privacy - PUID should NEVER be sent to frontend
 * 
 * This function is critical for maintaining user privacy. PUID (Privacy-focused 
 * Unique Identifier) should only exist in:
 * - MongoDB active-users collection (backend storage)
 * - Server-side session storage (backend use)
 * 
 * PUID must NEVER be:
 * - Sent to frontend in API responses
 * - Exposed in client-side code
 * - Logged in client-accessible logs
 * 
 * @param globalUser - The GlobalUser object from database or session
 * @returns Sanitized GlobalUser object without PUID
 * 
 * @example
 * ```typescript
 * const globalUser = await mongoDB.findGlobalUserByPUID(puid);
 * const sanitized = sanitizeGlobalUserForFrontend(globalUser);
 * res.json({ globalUser: sanitized }); // Safe to send to frontend
 * ```
 */
export function sanitizeGlobalUserForFrontend(globalUser: GlobalUser): Omit<GlobalUser, 'puid'> {
    return {
        userId: globalUser.userId,
        name: globalUser.name,
        affiliation: globalUser.affiliation,
        status: globalUser.status,
        coursesEnrolled: globalUser.coursesEnrolled,
        createdAt: globalUser.createdAt,
        updatedAt: globalUser.updatedAt
    };
}

