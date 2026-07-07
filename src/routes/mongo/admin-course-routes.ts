/**
 * admin-course-routes.ts
 *
 * Admin BFF and course provisioning. Mounted at `/api/admin`.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { DEFAULT_ACADEMIC_PERIOD_TITLE } from '../../db/mongo/academic-period-mongo';
import type { activeCourse, GlobalUser, InstructorInfo } from '../../types/shared';
import { buildDefaultByWeekCourseContent } from '../../helpers/build-default-course-content';
import { isAdminUser } from '../../utils/admin';
import { routeParam } from '../../helpers/route-params';

const router = Router();

function mapInstructorNames(course: activeCourse): string {
    const names =
        course.instructors?.map((inst) => {
            if (typeof inst === 'string') {
                return inst;
            }
            return inst?.name ?? inst?.userId ?? 'Unknown';
        }) ?? [];
    return names.join(', ') || 'No instructors';
}

router.get(
    '/course-selection',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (_req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const defaultPeriodId = await mongo.getDefaultAcademicPeriodId();
        const periods = await mongo.listAcademicPeriods();
        const courses = await mongo.getAllActiveCourses();

        const coursesByPeriod = new Map<string, activeCourse[]>();
        for (const period of periods) {
            coursesByPeriod.set(period.id, []);
        }

        const unassigned: activeCourse[] = [];
        for (const course of courses as activeCourse[]) {
            const periodId = course.academicPeriodId ?? defaultPeriodId;
            if (!coursesByPeriod.has(periodId)) {
                coursesByPeriod.set(periodId, []);
            }
            coursesByPeriod.get(periodId)!.push(course);
        }

        const payload = periods.map((period) => {
            const periodCourses = coursesByPeriod.get(period.id) ?? [];
            return {
                ...period,
                courseCount: periodCourses.length,
                courses: periodCourses.map((c) => ({
                    ...c,
                    instructorDisplay: mapInstructorNames(c)
                }))
            };
        });

        res.json({
            success: true,
            data: {
                periods: payload,
                defaultPeriodId,
                defaultPeriodTitle: DEFAULT_ACADEMIC_PERIOD_TITLE
            }
        });
    })
);

router.get(
    '/users/search',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const q = (req.query.q as string) ?? '';
        const mongo = await EngEAI_MongoDB.getInstance();
        const users = await mongo.searchFacultyUsersByName(q);
        const data = users.map((u) => ({
            userId: u.userId,
            name: u.name,
            affiliation: u.affiliation
        }));
        res.json({ success: true, data });
    })
);

router.put(
    '/instructor-allowances',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const { puid, academicPeriodId, allowedCourseNames } = req.body ?? {};
        if (!puid || !academicPeriodId || !Array.isArray(allowedCourseNames)) {
            return res.status(400).json({
                success: false,
                error: 'puid, academicPeriodId, and allowedCourseNames[] are required'
            });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const period = await mongo.getAcademicPeriodById(academicPeriodId);
        if (!period) {
            return res.status(404).json({ success: false, error: 'Academic period not found' });
        }
        const data = await mongo.setInstructorPeriodAllowance(puid, academicPeriodId, allowedCourseNames);
        res.json({ success: true, data });
    })
);

router.post(
    '/courses',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const globalUser = (req.session as any).globalUser as GlobalUser;
        const { courseName, academicPeriodId, instructorUserIds } = req.body ?? {};

        if (!courseName || typeof courseName !== 'string' || !courseName.trim()) {
            return res.status(400).json({ success: false, error: 'courseName is required' });
        }
        if (!academicPeriodId || typeof academicPeriodId !== 'string') {
            return res.status(400).json({ success: false, error: 'academicPeriodId is required' });
        }
        if (!Array.isArray(instructorUserIds)) {
            return res.status(400).json({ success: false, error: 'instructorUserIds must be an array' });
        }

        const mongo = await EngEAI_MongoDB.getInstance();
        const period = await mongo.getAcademicPeriodById(academicPeriodId);
        if (!period) {
            return res.status(404).json({ success: false, error: 'Academic period not found' });
        }

        const trimmedName = courseName.trim();
        const existing = await mongo.getCourseByName(trimmedName);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Course name already exists' });
        }

        const topicOrWeekInstances = buildDefaultByWeekCourseContent(
            trimmedName,
            12,
            mongo.idGenerator
        );

        const tempCourse = {
            courseName: trimmedName,
            date: new Date(),
            courseSetup: false,
            contentSetup: false,
            flagSetup: false,
            monitorSetup: false,
            frameType: 'byWeek' as const,
            tilesNumber: 12,
            topicOrWeekInstances,
            instructors: [] as InstructorInfo[],
            teachingAssistants: [] as InstructorInfo[]
        };
        const id = mongo.idGenerator.courseID(tempCourse as activeCourse);

        const courseData: activeCourse = {
            ...tempCourse,
            id,
            instructors: [],
            teachingAssistants: []
        };

        await mongo.postActiveCourse(courseData);
        await mongo.linkCourseToPeriod(id, academicPeriodId);

        let created = (await mongo.getActiveCourse(id)) as activeCourse;

        const instructorIds: string[] = [...new Set(instructorUserIds.filter((x: unknown) => typeof x === 'string'))];
        const instructors = await mongo.enrollInstructorsOnCourse(created, instructorIds);
        await mongo.updateActiveCourse(id, { instructors });
        created = { ...created, instructors };

        await mongo.enrollUserInCourse(globalUser, id, 'faculty');

        for (const instructorId of instructorIds) {
            const instUser = await mongo.findGlobalUserByUserId(instructorId);
            if (!instUser) {
                continue;
            }
            const allowanceNames = await mongo.getAllowedCourseNamesForInstructor(
                instUser.puid,
                academicPeriodId
            );
            const nextNames = [...new Set([...allowanceNames, trimmedName])];
            await mongo.setInstructorPeriodAllowance(instUser.puid, academicPeriodId, nextNames);
        }

        res.status(201).json({ success: true, data: created });
    })
);

router.put(
    '/courses/:id',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const courseId = routeParam(req.params, 'id');
        const { courseName, academicPeriodId, instructorUserIds } = req.body ?? {};
        const mongo = await EngEAI_MongoDB.getInstance();

        const existing = await mongo.getActiveCourse(courseId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        const updates: Partial<activeCourse> = {};

        if (courseName !== undefined) {
            if (typeof courseName !== 'string' || !courseName.trim()) {
                return res.status(400).json({ success: false, error: 'courseName must be a non-empty string' });
            }
            const trimmed = courseName.trim();
            const duplicate = await mongo.getCourseByName(trimmed);
            if (duplicate && duplicate.id !== courseId) {
                return res.status(409).json({ success: false, error: 'Course name already exists' });
            }
            updates.courseName = trimmed;
        }

        if (academicPeriodId !== undefined) {
            const period = await mongo.getAcademicPeriodById(academicPeriodId);
            if (!period) {
                return res.status(404).json({ success: false, error: 'Academic period not found' });
            }
            await mongo.linkCourseToPeriod(courseId, academicPeriodId);
        }

        if (Array.isArray(instructorUserIds)) {
            const instructors = await mongo.enrollInstructorsOnCourse(existing as activeCourse, instructorUserIds);
            updates.instructors = instructors;
        }

        if (Object.keys(updates).length > 0) {
            await mongo.updateActiveCourse(courseId, updates);
        }

        const data = await mongo.getActiveCourse(courseId);
        res.json({ success: true, data });
    })
);

/** Optional idempotent admin enrollment when entering from admin list */
router.post(
    '/courses/:id/ensure-enrollment',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const globalUser = (req.session as any).globalUser as GlobalUser;
        if (!isAdminUser(globalUser)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const courseId = routeParam(req.params, 'id');
        const course = await mongo.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }
        await mongo.ensureAdminCourseEnrollment(globalUser, courseId);
        res.json({ success: true });
    })
);

export default router;
