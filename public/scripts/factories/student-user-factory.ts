// public/scripts/factories/student-user-factory.ts
/**
 * student-user-factory.ts
 * 
 * @author: @gatahcha
 * @date: 2026-03-07
 * @latest app version: 1.2.9.9
 * @description: Validated creation of student CourseUser objects. 
 */

import { CourseUser, StudentUserContext } from '../types.js';

/**
 * StudentUserFactory
 * 
 * @returns CourseUser
 * Validates context and creates a CourseUser for student mode.
 */
export class StudentUserFactory {
    
    /**
     * Create a validated CourseUser for student mode from API response
     * 
     * @param context StudentUserContext
     * @returns CourseUser
     * Validates context and creates a CourseUser for student mode from API response.
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

    /**
     * Validate context
     * 
     * @param context StudentUserContext
     * @returns void
     * Validates the context for student user creation.
     */
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
