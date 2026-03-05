/**
 * Student User Factory - Validated creation of student CourseUser objects
 *
 * Handles student user creation from API responses with:
 * - Input validation and error boundaries
 * - Safe fallbacks for incomplete/malformed API data
 * - Consistent CourseUser structure for student mode
 *
 * Kept separate from InstructorUserFactory so instructor auth logic
 * is never sent to student clients (principle of least privilege).
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-02-13
 */

import { CourseUser } from '../../../src/functions/types.js';

/** Context for creating a student user from API response */
export interface StudentUserContext {
    apiUser: Partial<CourseUser> & { userId: string; name: string };
}

/**
 * Factory for creating validated student CourseUser objects
 */
export class StudentUserFactory {
    /**
     * Create a validated CourseUser for student mode from API response
     */
    createUser(context: StudentUserContext): CourseUser {
        this.validateContext(context);

        const { apiUser } = context;
        const now = new Date();

        return {
            name: apiUser.name ?? 'Unknown Student',
            userId: apiUser.userId,
            courseId: apiUser.courseId ?? '',
            courseName: apiUser.courseName ?? 'Student Course',
            userOnboarding: apiUser.userOnboarding ?? false,
            affiliation: (apiUser.affiliation === 'faculty' ? 'faculty' : 'student') as 'student' | 'faculty',
            status: (apiUser.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
            chats: Array.isArray(apiUser.chats) ? apiUser.chats : [],
            createdAt: apiUser.createdAt instanceof Date ? apiUser.createdAt : now,
            updatedAt: apiUser.updatedAt instanceof Date ? apiUser.updatedAt : now
        };
    }

    private validateContext(context: StudentUserContext): void {
        if (!context.apiUser) {
            throw new Error('API user data is required for student user creation');
        }
        if (!context.apiUser.userId || !context.apiUser.name) {
            throw new Error('Student user must have userId and name');
        }
    }
}

/** Singleton instance for student mode only */
export const studentUserFactory = new StudentUserFactory();
