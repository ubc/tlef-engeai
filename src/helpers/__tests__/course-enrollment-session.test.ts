import type { Request } from 'express';
import { refreshSessionGlobalUser } from '../session-global-user';
import type { GlobalUser } from '../../types/shared';

describe('session-global-user', () => {
    it('refreshSessionGlobalUser updates session from DB', async () => {
        const freshUser: GlobalUser = {
            userId: 'stu-1',
            puid: 'puid-stu',
            name: 'Student',
            affiliation: 'student',
            status: 'active',
            coursesEnrolled: ['course-a'],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const req = {
            user: { puid: 'puid-stu' },
            session: {
                globalUser: {
                    ...freshUser,
                    coursesEnrolled: []
                }
            }
        } as unknown as Request;

        const mongoDB = {
            findGlobalUserByPUID: jest.fn().mockResolvedValue(freshUser)
        } as never;

        const result = await refreshSessionGlobalUser(req, mongoDB);

        expect(result?.coursesEnrolled).toEqual(['course-a']);
        expect(
            (req.session as unknown as { globalUser: GlobalUser }).globalUser.coursesEnrolled
        ).toEqual(['course-a']);
    });
});
