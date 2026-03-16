// public/scripts/factories/instructor-user-factory.ts

/**
 * instructor-user-factory.ts
 * 
 * @author: @gatahcha
 * @date: 2026-03-07
 * @latest app version: 1.2.9.9
 * @description: Validated creation of instructor CourseUser objects. 
 */

import { CourseUser, InstructorUserContext } from '../types.js';

/**
 * InstructorUserFactory
 * 
 * @returns CourseUser
 * Validates context and creates a CourseUser for instructor mode.
 */
export class InstructorUserFactory {
    
    /**
     * Create a validated CourseUser for instructor mode
     * 
     * @param context InstructorUserContext
     * @returns CourseUser
     * Validates context and creates a CourseUser for instructor mode.
     */
    createUser(context: InstructorUserContext): CourseUser {
        this.validateContext(context);

        const { authState, courseContext } = context;
        const baseUser = authState.user!;

        const courseId = courseContext?.id ?? '';
        const courseName = courseContext?.courseName ?? 'Default Instructor Course';

        return {
            name: baseUser.name,
            userId: baseUser.userId,
            courseId,
            courseName,
            userOnboarding: false,
            affiliation: 'faculty',
            status: 'active',
            chats: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Validate context
     * 
     * @param context InstructorUserContext
     * @returns void
     * Validates the context for instructor user creation.
     */
    private validateContext(context: InstructorUserContext): void {
        if (!context.authState) {
            throw new Error('AuthState is required for instructor user creation');
        }
        if (!context.authState.isAuthenticated || !context.authState.user) {
            throw new Error('Invalid authentication state for user creation');
        }
        if (!context.authState.user.name || !context.authState.user.userId) {
            throw new Error('Auth user must have name and userId');
        }
    }
}

/** Singleton instance for instructor mode only */
export const instructorUserFactory = new InstructorUserFactory();
