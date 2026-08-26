/**
 * mongo-attribute-check — migrate op A
 *
 * Walks known collections in catalog-first order, then named backfills IPA-001 / OB-001 / OB-002.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Mongo schema allowlist pass for npm run migrate.
 */

import type { Collection, Db } from 'mongodb';
import { migrateInstructorAllowances } from '../helpers/migrate-instructor-allowances';
import { migrateOnboardingFlags } from '../helpers/migrate-onboarding-flags';
import { migrateInstructorOnboardingStages } from '../helpers/migrate-instructor-onboarding-stages';
import {
    ACADEMIC_PERIODS_COLLECTION,
    ACTIVE_COURSE_LIST_COLLECTION,
    ACTIVE_USERS_COLLECTION,
    INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION,
} from '../db/mongo/mongo-constants';
import { buildCourseCatalogMap, printCatalogMap, type CourseCatalogMap } from './catalog-map';
import { allChecked, createProgressCounts, formatProgressLine, recordStatus, type ProgressStatus } from './progress';
import {
    academicPeriodSchema,
    activeCourseSchema,
    canvasConnectionSchema,
    courseUserSchema,
    flagReportSchema,
    globalUserSchema,
    instructorPeriodAllowanceSchema,
    memoryAgentSchema,
    pathwaySchema,
    scenarioProgressSchema,
    scenarioQuestionSchema,
    scheduledTaskSchema,
    writingAssignmentSchema,
    writingFeedbackRunSchema,
    writingJobSchema,
    writingReleaseSchema,
    writingSubmissionSchema,
} from './schemas';
import { countMaterialLeftovers, walkObject, type FieldSpec } from './schema-walker';

export interface MongoCheckResult {
    catalog: CourseCatalogMap;
    allChecked: boolean;
    fail: number;
}

const WRITING_FEEDBACK: { name: string; schema: FieldSpec[] }[] = [
    { name: 'writing-assignments', schema: writingAssignmentSchema },
    { name: 'writing-submissions', schema: writingSubmissionSchema },
    { name: 'writing-feedback-runs', schema: writingFeedbackRunSchema },
    { name: 'writing-releases', schema: writingReleaseSchema },
    { name: 'writing-jobs', schema: writingJobSchema },
    { name: 'canvas-connections', schema: canvasConnectionSchema },
];

/**
 * collectionExists - true when Mongo already has this collection (MISSING otherwise).
 */
async function collectionExists(db: Db, name: string): Promise<boolean> {
    const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
    return found.length > 0;
}

/**
 * walkCollection - allowlist-walk every document; replaceOne when apply and the walk changed the doc.
 */
async function walkCollection(
    collection: Collection,
    schema: FieldSpec[],
    apply: boolean
): Promise<{ docs: number; changed: number; errors: number; walked: Record<string, unknown>[] }> {
    const walked: Record<string, unknown>[] = [];
    let docs = 0;
    let changed = 0;
    let errors = 0;
    const cursor = collection.find({});
    for await (const doc of cursor) {
        docs += 1;
        const result = walkObject(doc, schema);
        if (result.skipped || !result.value) {
            errors += 1;
            continue;
        }
        walked.push(result.value);
        if (result.changed) {
            changed += 1;
            if (apply && doc._id) {
                const { _id, ...rest } = result.value as Record<string, unknown> & { _id?: unknown };
                await collection.replaceOne({ _id: doc._id }, { _id: doc._id, ...rest } as any);
                void _id;
            }
        }
    }
    return { docs, changed, errors, walked };
}

/**
 * runMongoAttributeCheck - op A: schema walk + IPA-001 + OB-001 + OB-002.
 *
 * @param db - Connected Mongo database
 * @param apply - Persist when true
 * @param log - Progress printer
 */
export async function runMongoAttributeCheck(
    db: Db,
    apply: boolean,
    log: (line: string) => void
): Promise<MongoCheckResult> {
    const counts = createProgressCounts();
    let step = 0;
    let estimated = 14;

    const emit = (label: string, extra: string, status: ProgressStatus) => {
        step += 1;
        recordStatus(counts, status);
        log(formatProgressLine(step, estimated, label, extra, status));
    };

    log('== Block 1  active-course-list ==');
    log('');
    // Courses first: catalog + leftover nested `file` counts come from this collection.
    const courseColl = db.collection(ACTIVE_COURSE_LIST_COLLECTION);
    const leftover = countMaterialLeftovers(await courseColl.find({}).toArray());
    const courseWalk = await walkCollection(courseColl, activeCourseSchema, apply);
    const catalogBuild = buildCourseCatalogMap(courseWalk.walked);
    estimated = 1 + 3 + 3 + WRITING_FEEDBACK.length + catalogBuild.map.ordered.length * 7;
    emit(
        `collection=${ACTIVE_COURSE_LIST_COLLECTION}`,
        `docs=${courseWalk.docs} changed=${courseWalk.changed} errors=${courseWalk.errors}`,
        courseWalk.errors > 0 && courseWalk.docs === courseWalk.errors ? 'FAIL' : 'CHECKED'
    );
    log('');
    printCatalogMap(catalogBuild.map, log);
    log('');
    log(
        `leftover nested file=${leftover.nestedFile}  singular qdrantId=${leftover.singularQdrantId}`
    );
    log('nested `file` is not in the persist/UI shape; --apply A hoists fileName and unsets file.');
    if (leftover.sampleName) {
        log(
            `  sample name="${leftover.sampleName}" file.fileName=${leftover.sampleFileName ?? ''} file.qdrantId=${leftover.sampleQdrantId ?? ''} → fileName + qdrantChunkIds`
        );
    }
    log('');
    for (const dup of catalogBuild.duplicateNames) {
        log(`  FAIL duplicate courseName="${dup}"`);
        recordStatus(counts, 'FAIL');
    }

    if (courseWalk.errors > 0 && courseWalk.walked.length === 0) {
        log('DONE  allChecked=false  (active-course-list failed; skipping remaining blocks)');
        return { catalog: catalogBuild.map, allChecked: false, fail: counts.fail };
    }

    log('');
    log('== Block 2  other globals ==');
    log('');
    // Periods, instructor allowances, global users, then IPA-001 / OB-001 / OB-002 backfills.
    const globals: { name: string; schema: FieldSpec[] }[] = [
        { name: ACADEMIC_PERIODS_COLLECTION, schema: academicPeriodSchema },
        { name: INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION, schema: instructorPeriodAllowanceSchema },
        { name: ACTIVE_USERS_COLLECTION, schema: globalUserSchema },
    ];
    for (const item of globals) {
        if (!(await collectionExists(db, item.name))) {
            emit(`collection=${item.name}`, 'docs=0', 'MISSING');
            continue;
        }
        const walk = await walkCollection(db.collection(item.name), item.schema, apply);
        emit(
            `collection=${item.name}`,
            `docs=${walk.docs} changed=${walk.changed} errors=${walk.errors}`,
            walk.errors > 0 && walk.docs === walk.errors ? 'FAIL' : 'CHECKED'
        );
    }

    try {
        if (apply) {
            await migrateInstructorAllowances();
        }
        emit('backfill=IPA-001', apply ? 'applied' : 'dry-run', 'CHECKED');
    } catch (error) {
        emit('backfill=IPA-001', error instanceof Error ? error.message : 'error', 'FAIL');
    }

    try {
        if (apply) {
            await migrateOnboardingFlags();
        }
        emit('backfill=OB-001', apply ? 'applied' : 'dry-run', 'CHECKED');
    } catch (error) {
        emit('backfill=OB-001', error instanceof Error ? error.message : 'error', 'FAIL');
    }

    // OB-002 seeds from instructorOnboardingCompleted, so it must run after OB-001.
    try {
        if (apply) {
            await migrateInstructorOnboardingStages();
        }
        emit('backfill=OB-002', apply ? 'applied' : 'dry-run', 'CHECKED');
    } catch (error) {
        emit('backfill=OB-002', error instanceof Error ? error.message : 'error', 'FAIL');
    }

    log('');
    log('== Block 3  writing-feedback ==');
    log('');
    for (const item of WRITING_FEEDBACK) {
        if (!(await collectionExists(db, item.name))) {
            emit(`collection=${item.name}`, 'docs=0', 'MISSING');
            continue;
        }
        const walk = await walkCollection(db.collection(item.name), item.schema, apply);
        emit(
            `collection=${item.name}`,
            `docs=${walk.docs} changed=${walk.changed} errors=${walk.errors}`,
            'CHECKED'
        );
    }

    log('');
    log('== Block 4  per-course last ==');
    log('');
    // Users/flags/memory/tasks/scenarios/pathways after globals so catalog names are already known.
    const perCourseKeys: (keyof CourseCatalogMap['ordered'][0]['collections'])[] = [
        'users',
        'flags',
        'memoryAgent',
        'scheduledTasks',
        'scenarioQuestions',
        'scenarioProgress',
        'pathways',
    ];
    const perCourseSchema: Record<string, FieldSpec[]> = {
        users: courseUserSchema,
        flags: flagReportSchema,
        memoryAgent: memoryAgentSchema,
        scheduledTasks: scheduledTaskSchema,
        scenarioQuestions: scenarioQuestionSchema,
        scenarioProgress: scenarioProgressSchema,
        pathways: pathwaySchema,
    };
    const known = new Set<string>([
        ACTIVE_COURSE_LIST_COLLECTION,
        ACADEMIC_PERIODS_COLLECTION,
        INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION,
        ACTIVE_USERS_COLLECTION,
        'instructor-allowed-courses',
        ...WRITING_FEEDBACK.map((item) => item.name),
    ]);

    for (const [index, course] of catalogBuild.map.ordered.entries()) {
        log('');
        log(`-- course ${index + 1}/${catalogBuild.map.ordered.length}  ${course.courseName} --`);
        log('');
        for (const key of perCourseKeys) {
            const name = course.collections[key];
            known.add(name);
            if (!(await collectionExists(db, name))) {
                emit(`collection=${name}`, 'docs=0', 'MISSING');
                continue;
            }
            const walk = await walkCollection(db.collection(name), perCourseSchema[key], apply);
            emit(
                `collection=${name}`,
                `docs=${walk.docs} changed=${walk.changed} errors=${walk.errors}`,
                'CHECKED'
            );
        }
    }

    log('');
    log('== Block 5  leftovers ==');
    log('');
    // Collections not in the catalog (e.g. prompt-collection) are reported, never dropped.
    const listed = await db.listCollections({}, { nameOnly: true }).toArray();
    const leftoverNames = listed.filter(
        (entry) => !known.has(entry.name) && !entry.name.startsWith('system.')
    );
    estimated += leftoverNames.length;
    for (const entry of leftoverNames) {
        emit(`untracked=${entry.name}`, '', 'UNTRACKED');
    }

    log('');
    log(
        `DONE  allChecked=${allChecked(counts)}  collectionsChecked=${counts.checked}  fail=${counts.fail}  skip=${counts.skip}  missing=${counts.missing}  untracked=${counts.untracked}`
    );
    return { catalog: catalogBuild.map, allChecked: allChecked(counts), fail: counts.fail };
}
