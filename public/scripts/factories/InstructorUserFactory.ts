/**
 * Instructor User Factory - Validated creation of instructor CourseUser objects
 *
 * Handles instructor user creation with:
 * - Input validation and error boundaries
 * - Safe fallbacks for undefined course data (e.g. courseName)
 * - Consistent CourseUser structure for instructor mode
 *
 * Kept separate from StudentUserFactory so instructor auth logic
 * is never sent to student clients (principle of least privilege).
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-02-13
 */

import { CourseUser, activeCourse } from '../../../src/functions/types.js';
import type { AuthState } from '../services/AuthService.js';

/** Context for creating an instructor user from auth + course data */
export interface InstructorUserContext {
    authState: AuthState;
    courseContext?: activeCourse | null;
}

/**
 * Factory for creating validated instructor CourseUser objects
 */
export class InstructorUserFactory {
    /**
     * Create a validated CourseUser for instructor mode
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
