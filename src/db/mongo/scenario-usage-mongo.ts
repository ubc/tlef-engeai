/**
 * Scenario Usage Mongo — read-only student activity on Practice Scenarios for staff
 *
 * Reads `{courseName}_scenario_questions`, where each sub-question embeds its
 * `studentResponses[]`. Archived (removed) and unpublished questions are included when the
 * student answered them, because that work still counts toward usage. Results are keyed by
 * roster `userId` (never PUID) and are only served through staff-gated routes.
 *
 * @author: Kathleen Tom
 * @date: 2026-11-20
 * @version: 1.0.0
 * @description: Per-student attempt counts and per-student scenario history for the instructor Monitor.
 */

import type {
    activeCourse,
    ScenarioMode,
    ScenarioQuestionStatus,
    ScenarioStudentUsageHistory,
    ScenarioSubQuestionType,
    ScenarioUsageAttempt,
    ScenarioUsageCounts,
    ScenarioUsagePart,
    ScenarioUsageProgress,
    ScenarioUsageQuestion,
    ScenarioUsageQuestionState,
} from '../../types/shared';
import { effortFlagsForAnswer } from '../../scenario-generation/scenario-effort-flags';
import { getPracticeDayKey } from '../../scenario-generation/scenario-practice-limits';
import { isInCourseInstructors, isInCourseTAs } from '../../utils/course-staff';
import { getCollectionNames } from './collection-registry-mongo';
import { batchFindUsersByUserIds } from './course-user-mongo';
import type { MongoDalContext } from './mongo-context';
import { withoutTestStudents } from './student-view-filter';

/** Chapter label for questions whose topic/week no longer exists on the course. */
export const UNCATEGORIZED_TOPIC_TITLE = 'Uncategorized';

/** A question as read for one student: only that student's responses are kept on each part. */
export interface StudentScopedQuestionDoc {
    id: string;
    title?: string;
    status: ScenarioQuestionStatus;
    topicOrWeekId?: string;
    sortOrder?: number;
    subQuestions?: Array<{
        subQuestionId: string;
        subQuestionType?: ScenarioSubQuestionType;
        prompt?: string;
        modelAnswer?: string; // used server-side for effort flags only; never returned
        studentResponses?: Array<{
            id: string;
            studentUserId: string;
            mode: ScenarioMode;
            studentAnswer: string;
            feedback: string;
            grade?: number;
            submittedAt: Date | string;
        }>;
    }>;
}

async function getScenarioQuestionsCollection(ctx: MongoDalContext, courseName: string) {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.scenarioQuestions);
}

/**
 * getScenarioUsageCounts — how many questions each student has answered at least once.
 *
 * A question counts once per student however many parts or attempts they submitted, in
 * either mode, whatever its current status (removed questions included).
 *
 * @param ctx - Mongo context
 * @param courseName - Course whose scenario questions to read
 * @returns Counts keyed by stringified roster userId; students with no answers are absent
 */
export async function getScenarioUsageCounts(
    ctx: MongoDalContext,
    courseName: string
): Promise<ScenarioUsageCounts> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const rows = await collection
        .aggregate<{ _id: unknown; questionsAttempted: number }>([
            { $unwind: '$subQuestions' },
            { $unwind: '$subQuestions.studentResponses' },
            // One row per (student, question), then count questions per student
            { $group: { _id: { userId: '$subQuestions.studentResponses.studentUserId', questionId: '$id' } } },
            { $group: { _id: '$_id.userId', questionsAttempted: { $sum: 1 } } },
        ])
        .toArray();

    const questionsAttemptedByUserId: Record<string, number> = {};
    for (const row of rows) {
        if (row._id === null || row._id === undefined) continue;
        questionsAttemptedByUserId[String(row._id)] = row.questionsAttempted;
    }
    return { questionsAttemptedByUserId };
}

/**
 * getStudentScenarioUsageHistory — one student's activity across the question bank.
 *
 * Reads every published question plus any other question the student answered, keeping only
 * that student's responses (filtered in the database so other students' answers are never loaded).
 *
 * @param ctx - Mongo context
 * @param course - Course whose bank and chapter order to use
 * @param userId - Roster userId of the student
 * @returns The history, or `null` when the user is not on the course roster (or is a test student)
 */
export async function getStudentScenarioUsageHistory(
    ctx: MongoDalContext,
    course: activeCourse,
    userId: string
): Promise<ScenarioStudentUsageHistory | null> {
    // Step 1: the student must be a real roster member
    const users = await batchFindUsersByUserIds(ctx, course.courseName, [userId]);
    const student = users.get(String(userId));
    if (!student || student.isTestStudent) return null;

    // Step 2: published questions and anything this student answered, scoped to their responses
    const collection = await getScenarioQuestionsCollection(ctx, course.courseName);
    const docs = await collection
        .aggregate<StudentScopedQuestionDoc>([
            {
                $match: {
                    $or: [{ status: 'published' }, { 'subQuestions.studentResponses.studentUserId': userId }],
                },
            },
            {
                $project: {
                    _id: 0,
                    id: 1,
                    title: 1,
                    status: 1,
                    topicOrWeekId: 1,
                    sortOrder: 1,
                    subQuestions: {
                        $map: {
                            input: { $ifNull: ['$subQuestions', []] },
                            as: 'sub',
                            in: {
                                subQuestionId: '$$sub.subQuestionId',
                                subQuestionType: '$$sub.subQuestionType',
                                prompt: '$$sub.prompt',
                                modelAnswer: '$$sub.modelAnswer',
                                studentResponses: {
                                    $filter: {
                                        input: { $ifNull: ['$$sub.studentResponses', []] },
                                        as: 'r',
                                        cond: { $eq: ['$$r.studentUserId', userId] },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        ])
        .toArray();

    // Step 3: shape for the panel
    return buildStudentScenarioUsageHistory(course, docs, userId, student.name);
}

/**
 * buildStudentScenarioUsageHistory — shape student-scoped question docs into the Monitor history.
 *
 * Ordering: published questions by chapter order on the course, then `sortOrder`; after them,
 * unpublished or removed questions the student answered, most recent activity first.
 * Unpublished/removed questions without answers from this student are dropped.
 *
 * @param course - Course providing chapter titles and order
 * @param docs - Questions with only this student's responses
 * @param userId - Roster userId of the student
 * @param studentName - Display name from the roster
 * @returns Panel-ready history with summary counts
 */
export function buildStudentScenarioUsageHistory(
    course: Pick<activeCourse, 'topicOrWeekInstances'>,
    docs: StudentScopedQuestionDoc[],
    userId: string,
    studentName: string
): ScenarioStudentUsageHistory {
    const chapters = course.topicOrWeekInstances ?? [];
    const chapterIndex = new Map(chapters.map((t, i) => [t.id, i]));
    const chapterTitle = new Map(chapters.map((t) => [t.id, t.title]));

    const questions = docs
        .map((doc) => toUsageQuestion(doc, chapterTitle))
        .filter((q) => q.questionState === 'published' || q.progress !== 'not_attempted');

    const published = questions
        .filter((q) => q.questionState === 'published')
        .sort((a, b) => {
            const ai = chapterIndex.get(a.topicOrWeekId) ?? Number.MAX_SAFE_INTEGER;
            const bi = chapterIndex.get(b.topicOrWeekId) ?? Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return sortOrderOf(docs, a.questionId) - sortOrderOf(docs, b.questionId);
        });
    const others = questions
        .filter((q) => q.questionState !== 'published')
        .sort((a, b) => (b.lastSubmittedAt ?? '').localeCompare(a.lastSubmittedAt ?? ''));

    return {
        userId,
        studentName,
        publishedQuestionCount: published.length,
        questionsAttempted: questions.filter((q) => q.progress !== 'not_attempted').length,
        questionsCompleted: questions.filter((q) => q.progress === 'complete').length,
        questions: [...published, ...others],
    };
}

function sortOrderOf(docs: StudentScopedQuestionDoc[], questionId: string): number {
    return docs.find((d) => d.id === questionId)?.sortOrder ?? 0;
}

function questionStateOf(status: ScenarioQuestionStatus): ScenarioUsageQuestionState {
    if (status === 'published') return 'published';
    if (status === 'archived') return 'removed';
    return 'unpublished';
}

function toUsageQuestion(doc: StudentScopedQuestionDoc, chapterTitle: Map<string, string>): ScenarioUsageQuestion {
    const parts: ScenarioUsagePart[] = (doc.subQuestions ?? []).map((sub) => {
        // Oldest first, so each answer's flags can compare it with the one before
        const chronological = [...(sub.studentResponses ?? [])].sort(
            (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
        );
        const attempts = chronological.map(
            (r, i): ScenarioUsageAttempt => ({
                id: r.id,
                mode: r.mode,
                studentAnswer: r.studentAnswer,
                feedback: r.feedback,
                ...(r.mode === 'exam' && typeof r.grade === 'number' ? { grade: r.grade } : {}),
                submittedAt: new Date(r.submittedAt).toISOString(),
                flags: effortFlagsForAnswer({
                    answer: r.studentAnswer,
                    prompt: sub.prompt ?? '',
                    modelAnswer: sub.modelAnswer ?? '',
                    previousAnswer: i > 0 ? chronological[i - 1].studentAnswer : undefined,
                }),
            })
        );
        return {
            subQuestionId: sub.subQuestionId,
            subQuestionType: sub.subQuestionType ?? 'calculation',
            prompt: sub.prompt ?? '',
            attempts: attempts.reverse(),
        };
    });

    const answeredParts = parts.filter((p) => p.attempts.length > 0).length;
    const progress: ScenarioUsageProgress =
        answeredParts === 0 ? 'not_attempted' : answeredParts === parts.length ? 'complete' : 'partial';

    const allAttempts = parts.flatMap((p) => p.attempts);
    const modesUsed = (['practice', 'exam'] as const).filter((m) => allAttempts.some((a) => a.mode === m));
    const lastSubmittedAt = allAttempts.reduce<string | null>(
        (latest, a) => (latest === null || a.submittedAt > latest ? a.submittedAt : latest),
        null
    );
    const topicOrWeekId = doc.topicOrWeekId ?? '';

    return {
        questionId: doc.id,
        title: doc.title?.trim() || 'Untitled question',
        topicOrWeekId,
        topicTitle: chapterTitle.get(topicOrWeekId) ?? UNCATEGORIZED_TOPIC_TITLE,
        questionState: questionStateOf(doc.status),
        progress,
        modesUsed,
        lastSubmittedAt,
        // Not-attempted questions only need their title in the panel
        parts: progress === 'not_attempted' ? [] : parts,
    };
}

// =====================================================
// Course-wide usage report (CSV export)
// =====================================================

/** One student's totals in the usage export. */
export interface ScenarioUsageReportRow {
    userId: string;
    studentName: string;
    questionsAttempted: number;
    questionsCompleted: number;
    practiceAnswers: number;
    examsSubmitted: number;
    daysActive: number;
    lastActivityAt: Date | null;
    flaggedAnswers: number;
}

/** The export: totals per student plus how many questions are currently published. */
export interface ScenarioUsageReport {
    publishedQuestionCount: number;
    rows: ScenarioUsageReportRow[];
}

/** A question with every student's responses (feedback text not loaded). */
export interface ReportQuestionDoc {
    id: string;
    status: ScenarioQuestionStatus;
    subQuestions?: Array<{
        subQuestionId: string;
        prompt?: string;
        modelAnswer?: string;
        studentResponses?: Array<{
            studentUserId: string;
            mode: ScenarioMode;
            studentAnswer: string;
            submittedAt: Date | string;
        }>;
    }>;
}

/**
 * getScenarioUsageReport — per-student totals for the usage CSV.
 *
 * Rows cover every real student on the roster (test students, instructors and TAs excluded),
 * including students with no activity. Removed (archived) and unpublished questions count
 * toward totals because the work was done.
 *
 * @param ctx - Mongo context
 * @param course - Course to report on
 * @returns Report rows sorted by student name
 */
export async function getScenarioUsageReport(
    ctx: MongoDalContext,
    course: activeCourse
): Promise<ScenarioUsageReport> {
    // Step 1: real students only
    const collections = await getCollectionNames(ctx, course.courseName);
    const userDocs = await ctx.db
        .collection(collections.users)
        .find(withoutTestStudents({ affiliation: 'student' }), { projection: { userId: 1, name: 1 } })
        .toArray();
    const students = userDocs
        .map((u) => ({ userId: String(u.userId), name: String(u.name ?? '') }))
        .filter((u) => !isInCourseTAs(course, u.userId) && !isInCourseInstructors(course, u.userId));

    // Step 2: every question with responses; skip text the report never uses
    const questionDocs = await ctx.db
        .collection(collections.scenarioQuestions)
        .find(
            {},
            {
                projection: {
                    _id: 0,
                    questionBody: 0,
                    solutionBody: 0,
                    sourcePrompt: 0,
                    'subQuestions.studentResponses.feedback': 0,
                },
            }
        )
        .toArray();

    return buildScenarioUsageReport(students, questionDocs as unknown as ReportQuestionDoc[]);
}

/**
 * buildScenarioUsageReport — fold every response into per-student totals.
 *
 * - Questions attempted / completed: ≥1 answer on any part / an answer on every part (any mode)
 * - Practice answers: one per practice submission of one part
 * - Exams submitted: one per exam submission of a whole question (its parts share a timestamp)
 * - Days active: distinct calendar days (America/Vancouver) with any submission
 * - Flagged answers: answers tripping at least one effort flag
 *
 * @param students - Roster students to report on
 * @param questions - Questions with all students' responses
 * @returns Report rows sorted by name, then userId
 */
export function buildScenarioUsageReport(
    students: Array<{ userId: string; name: string }>,
    questions: ReportQuestionDoc[]
): ScenarioUsageReport {
    interface Totals {
        attemptedQuestions: Set<string>;
        completedQuestions: number;
        practiceAnswers: number;
        examSubmissions: Set<string>;
        days: Set<string>;
        lastActivityAt: Date | null;
        flaggedAnswers: number;
    }
    const totals = new Map<string, Totals>(
        students.map((s) => [
            s.userId,
            {
                attemptedQuestions: new Set(),
                completedQuestions: 0,
                practiceAnswers: 0,
                examSubmissions: new Set(),
                days: new Set(),
                lastActivityAt: null,
                flaggedAnswers: 0,
            },
        ])
    );

    for (const question of questions) {
        const parts = question.subQuestions ?? [];
        const partsAnsweredByStudent = new Map<string, number>();

        for (const part of parts) {
            // Group this part's responses by student, oldest first, for duplicate detection
            const byStudent = new Map<string, NonNullable<typeof part.studentResponses>>();
            for (const r of part.studentResponses ?? []) {
                const id = String(r.studentUserId);
                if (!totals.has(id)) continue; // not a reported student (staff, test student, dropped)
                const list = byStudent.get(id) ?? [];
                list.push(r);
                byStudent.set(id, list);
            }

            for (const [userId, responses] of byStudent) {
                const t = totals.get(userId)!;
                responses.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
                partsAnsweredByStudent.set(userId, (partsAnsweredByStudent.get(userId) ?? 0) + 1);
                t.attemptedQuestions.add(question.id);

                responses.forEach((r, i) => {
                    const at = new Date(r.submittedAt);
                    if (r.mode === 'exam') t.examSubmissions.add(`${question.id}@${at.getTime()}`);
                    else t.practiceAnswers += 1;
                    t.days.add(getPracticeDayKey(at));
                    if (!t.lastActivityAt || at > t.lastActivityAt) t.lastActivityAt = at;

                    const flags = effortFlagsForAnswer({
                        answer: r.studentAnswer,
                        prompt: part.prompt ?? '',
                        modelAnswer: part.modelAnswer ?? '',
                        previousAnswer: i > 0 ? responses[i - 1].studentAnswer : undefined,
                    });
                    if (flags.length > 0) t.flaggedAnswers += 1;
                });
            }
        }

        for (const [userId, answeredParts] of partsAnsweredByStudent) {
            if (parts.length > 0 && answeredParts === parts.length) totals.get(userId)!.completedQuestions += 1;
        }
    }

    const rows = students
        .map((s): ScenarioUsageReportRow => {
            const t = totals.get(s.userId)!;
            return {
                userId: s.userId,
                studentName: s.name,
                questionsAttempted: t.attemptedQuestions.size,
                questionsCompleted: t.completedQuestions,
                practiceAnswers: t.practiceAnswers,
                examsSubmitted: t.examSubmissions.size,
                daysActive: t.days.size,
                lastActivityAt: t.lastActivityAt,
                flaggedAnswers: t.flaggedAnswers,
            };
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.userId.localeCompare(b.userId));

    return {
        publishedQuestionCount: questions.filter((q) => q.status === 'published').length,
        rows,
    };
}
