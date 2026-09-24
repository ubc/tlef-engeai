/**
 * student-view-exclusion-guard.test.ts
 *
 * The regression guard for Student View. Every staff-facing student listing must leave test
 * students out, and it must do so through the one shared rule rather than a hand-written
 * copy — a second copy is how the two drift apart. Also pins the paths a test student can
 * never reach, so a later change that would give it one fails here first.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { courseSummaryEngagementFacetPipeline } from '../course-user-mongo';
import { studentConversationZipExportPipeline } from '../conversation-export-mongo';
import { EXCLUDE_TEST_STUDENTS_MATCH } from '../student-view-filter';

/** Every `$match` in a pipeline, including the branches of a `$facet`. */
function matchStages(pipeline: Record<string, any>[]): Record<string, any>[] {
    const stages: Record<string, any>[] = [];
    for (const stage of pipeline) {
        if (stage.$match) {
            stages.push(stage.$match);
        }
        if (stage.$facet) {
            for (const branch of Object.values<Record<string, any>[]>(stage.$facet)) {
                stages.push(...matchStages(branch));
            }
        }
    }
    return stages;
}

function studentMatchStages(pipeline: Record<string, any>[]): Record<string, any>[] {
    return matchStages(pipeline).filter((stage) => stage.affiliation);
}

describe('test student exclusion', () => {
    it('every student $match in the course summary carries the exclusion', () => {
        const stages = studentMatchStages(courseSummaryEngagementFacetPipeline());

        expect(stages.length).toBeGreaterThan(0);
        for (const stage of stages) {
            expect(stage).toMatchObject(EXCLUDE_TEST_STUDENTS_MATCH);
        }
    });

    it('the conversation export pipeline carries the exclusion', () => {
        const stages = studentMatchStages(studentConversationZipExportPipeline());

        expect(stages.length).toBeGreaterThan(0);
        for (const stage of stages) {
            expect(stage).toMatchObject(EXCLUDE_TEST_STUDENTS_MATCH);
        }
    });

    // Source guard: a new query on the users collection must opt in or out deliberately.
    const AUDITED = [
        'src/db/mongo/course-user-mongo.ts',
        'src/db/mongo/monitor-roster-mongo.ts',
        'src/db/mongo/conversation-export-mongo.ts',
        'src/db/mongo/course-backup-mongo.ts',
        'src/routes/route-mongo.ts'
    ];

    it.each(AUDITED)('%s uses the shared exclusion rather than a hand-written one', (file) => {
        const source = readFileSync(join(process.cwd(), file), 'utf8');

        expect(source).toMatch(/student-view-filter/);
        expect(source).not.toMatch(/isTestStudent:\s*\{\s*\$ne/);
    });

    it('the shared rule lives in a leaf module, so a listing importing it starts no cycle', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/db/mongo/student-view-filter.ts'),
            'utf8'
        );
        const valueImports = source
            .split('\n')
            .filter((line) => line.startsWith('import ') && !line.startsWith('import type '));

        expect(valueImports).toEqual([]);
    });
});

describe('paths a test student cannot reach', () => {
    it('Writing Feedback keys submissions by a Canvas identity hash, never an EngE-AI userId', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/writing-feedback/canvas-import-service.ts'),
            'utf8'
        );

        expect(source).toMatch(/studentId: `\$\{prefix\}-\$\{studentDigest/);
        expect(source).not.toMatch(/globalUser\.userId/);
    });

    it('memory-agent rows are excluded by id, because they carry no affiliation', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/db/mongo/struggle-stats-mongo.ts'),
            'utf8'
        );

        expect(source).toMatch(/listTestStudentUserIds/);
        expect(source).toMatch(/getAllMemoryAgentEntries\(ctx, courseData\.courseName, testStudentIds\)/);
    });
});
