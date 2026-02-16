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
/**
 * Factory for creating validated instructor CourseUser objects
 */
export class InstructorUserFactory {
    /**
     * Create a validated CourseUser for instructor mode
     */
    createUser(context) {
        var _a, _b;
        this.validateContext(context);
        const { authState, courseContext } = context;
        const baseUser = authState.user;
        const courseId = (_a = courseContext === null || courseContext === void 0 ? void 0 : courseContext.id) !== null && _a !== void 0 ? _a : '';
        const courseName = (_b = courseContext === null || courseContext === void 0 ? void 0 : courseContext.courseName) !== null && _b !== void 0 ? _b : 'Default Instructor Course';
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
    validateContext(context) {
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
