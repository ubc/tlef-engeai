/**
 * student-view-banner.test.ts
 *
 * The banner appears only while a course is actually being previewed, names the test
 * student so the viewer knows whose history they are looking at, and offers reset before
 * exit. Jest here is node with no jsdom, so the model is tested and the rendering is left
 * to the browser pass.
 */

import {
    STUDENT_VIEW_RESET_ACTION,
    STUDENT_VIEW_RESET_COPY,
    buildStudentViewBannerModel
} from '../student/student-view-banner';

describe('student view banner model', () => {
    it('is absent when student view is inactive', () => {
        expect(buildStudentViewBannerModel({ active: false, courseId: null })).toBeNull();
    });

    it('is absent when active without a course, which cannot be acted on', () => {
        expect(buildStudentViewBannerModel({ active: true, courseId: null })).toBeNull();
    });

    it('names the test student and says only the viewer sees it', () => {
        const model = buildStudentViewBannerModel({ active: true, courseId: 'course-1' })!;

        expect(model.text).toBe("You're in student view as Test student. Only you can see this.");
        expect(model.courseId).toBe('course-1');
    });

    it('offers reset then exit, in that order', () => {
        const model = buildStudentViewBannerModel({ active: true, courseId: 'course-1' })!;

        expect(model.actions).toEqual([
            { action: 'reset', label: 'Reset' },
            { action: 'exit', label: 'Exit student view' }
        ]);
    });

    it('warns that reset deletes the preview history and spares real students', () => {
        expect(STUDENT_VIEW_RESET_COPY.body).toContain('Real students are not affected');
    });

    it('matches the reset action against the slug the modal actually resolves', () => {
        const slug = STUDENT_VIEW_RESET_COPY.confirmText.toLowerCase().replace(/\s+/g, '-');
        expect(STUDENT_VIEW_RESET_ACTION).toBe(slug);
    });
});
