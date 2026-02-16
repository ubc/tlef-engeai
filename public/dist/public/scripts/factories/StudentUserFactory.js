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
/**
 * Factory for creating validated student CourseUser objects
 */
export class StudentUserFactory {
    /**
     * Create a validated CourseUser for student mode from API response
     */
    createUser(context) {
        var _a, _b, _c, _d;
        this.validateContext(context);
        const { apiUser } = context;
        const now = new Date();
        return {
            name: (_a = apiUser.name) !== null && _a !== void 0 ? _a : 'Unknown Student',
            userId: apiUser.userId,
            courseId: (_b = apiUser.courseId) !== null && _b !== void 0 ? _b : '',
            courseName: (_c = apiUser.courseName) !== null && _c !== void 0 ? _c : 'Student Course',
            userOnboarding: (_d = apiUser.userOnboarding) !== null && _d !== void 0 ? _d : false,
            affiliation: (apiUser.affiliation === 'faculty' ? 'faculty' : 'student'),
            status: (apiUser.status === 'inactive' ? 'inactive' : 'active'),
            chats: Array.isArray(apiUser.chats) ? apiUser.chats : [],
            createdAt: apiUser.createdAt instanceof Date ? apiUser.createdAt : now,
            updatedAt: apiUser.updatedAt instanceof Date ? apiUser.updatedAt : now
        };
    }
    validateContext(context) {
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
