/**
 * ScenarioService — single workflow boundary for Practice Scenarios
 *
 * Owns generation, practice grading, exam grading, response persistence, and
 * solution-gate derivation. Routes stay thin: auth, parse, service call, JSON shape.
 *
 * @author: @gatahcha
 * @date: 2026-07-14
 * @version: 1.0.0
 * @description: Orchestrates scenario generation and student response grading/persistence.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { RAGApp } from '../rag/rag-app';
import { ragPrompts } from '../rag/rag-prompts';
import { IDGenerator } from '../utils/unique-id-generator';
import { appLogger } from '../utils/logger';
import type {
    ScenarioDifficulty,
    ScenarioExamAnswerInput,
    ScenarioExamSubmitResponse,
    ScenarioGenerateResponse,
    ScenarioLearningObjectiveSnapshot,
    ScenarioMode,
    ScenarioPartFeedbackResponse,
    ScenarioQuestion,
    ScenarioStudentResponse,
    ScenarioSubQuestion,
    ScenarioSubQuestionType,
} from '../types/shared';
import { computeScenarioOverallGrade, defaultExpectedTimeMinutes } from '../types/shared';
import { buildScenarioGenerationSystemPrompt } from './prompts/scenario-generation-prompt';
import {
    buildScenarioExamGradingUserTurn,
    buildScenarioExamFeedbackSystemPrompt,
    buildScenarioPracticeDescriptiveFeedbackSystemPrompt,
    buildScenarioPracticeFeedbackUserTurn,
    buildScenarioPracticeSocraticFeedbackSystemPrompt,
    type PracticeFeedbackPromptTier,
} from './prompts/scenario-feedback-prompt';
import {
    batchScenarioSchema,
    assemblePracticeDescriptiveFeedback,
    sanitizeExamGradingResponse,
    sanitizeGeneratedScenario,
    sanitizeScenarioFeedback,
    sanitizeScenarioPracticeDescriptiveFeedback,
    sanitizeScenarioPracticeFeedback,
    resolveScenarioPersistTitle,
    scenarioExamGradingResponseSchema,
    scenarioPracticeFeedbackResponseSchema,
    singleScenarioSchema,
    type GeneratedScenario,
} from './scenario-schemas';
import { hasCompletedAllSubQuestions } from '../db/mongo/scenario-questions-mongo';
import {
    checkPracticeSubmissionGate,
    countPracticeAttemptsToday,
    getLastPracticeAttemptAtToday,
    PRACTICE_DAILY_MAX_ATTEMPTS,
} from './scenario-practice-limits';
import {
    getPracticeCooldownMessage,
    getPracticeDailyLimitMessage,
} from './scenario-practice-canned-responses';

/** Instructor/AI generate request — routes map Zod-parsed body into this shape. */
export interface ScenarioGenerateDraftsInput {
    mode: 'single' | 'batch';
    sourcePrompt: string;
    topicOrWeekId: string;
    count?: number;
    courseId: string;
    courseName: string;
    createdByUserId: string;
    subQuestionTypes?: ScenarioSubQuestionType[];
    difficulty?: ScenarioDifficulty;
    title?: string;
    learningObjectiveIds?: string[];
}

/** Practice check-answer or instructor preview for one sub-question. */
export interface ScenarioSubmitStudentResponseInput {
    courseId: string;
    courseName: string;
    questionId: string;
    subQuestionId: string;
    studentAnswer: string;
    mode: ScenarioMode;
    studentUserId: string;
    /** When true, allow grading unpublished drafts (instructor preview) without requiring published status. */
    allowUnpublished?: boolean;
}

/** Exam submit — student must supply exactly one answer per visible sub-question. */
export interface ScenarioSubmitExamInput {
    courseId: string;
    courseName: string;
    questionId: string;
    answers: ScenarioExamAnswerInput[];
    studentUserId: string;
}

/**
 * ScenarioService Class
 *
 * Single orchestration path for AI draft generation, per-part practice grading,
 * batch exam grading, embedded response persistence, and solution gating.
 *
 * Key Features:
 * - RAG-augmented structured LLM generation with LO validation
 * - Practice TA feedback (no grade) and exam academic grading (1–10)
 * - Atomic embedded `studentResponses[]` writes via Mongo delegate
 * - Mode-aware solution reveal from completion records (no CourseUser progress)
 */
export class ScenarioService {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    /**
     * Generate one or more AI draft scenario questions and persist them as drafts.
     *
     * @param input - Generation mode, prompt, topic, LO ids, and course context
     * @returns Saved draft question(s) or a structured error when validation/LLM fails
     */
    public async generateDrafts(input: ScenarioGenerateDraftsInput): Promise<ScenarioGenerateResponse> {
        try {
            // ====================================================================
            // STEP 1: Resolve and validate learning objectives against topic/week
            // ====================================================================
            const learningObjectives = await this.resolveLearningObjectives(
                input.courseId,
                input.topicOrWeekId,
                input.learningObjectiveIds
            );

            // get the requested count – if batch, use the count, otherwise use 1
            const requestedCount = input.mode === 'batch' ? Math.max(1, input.count ?? 1) : 1;

            // generate a unique job id for the generation job
            const aiGenerationJobId =
                input.mode === 'batch'
                    ? IDGenerator.getInstance().uniqueIDGenerator(
                          `${input.courseName}-${input.sourcePrompt}-${Date.now()}`
                      )
                    : undefined;

            // get the difficulty – if not provided, use medium
            const difficulty: ScenarioDifficulty = input.difficulty ?? 'medium';

            // get the types – if not provided, use calculation, troubleshoot, and action
            const types = input.subQuestionTypes?.length
                ? input.subQuestionTypes
                : (['calculation', 'troubleshoot', 'action'] as ScenarioSubQuestionType[]);

            // ====================================================================
            // STEP 2: Generate via LLM
            // ====================================================================
            const rawResults = await this.generateViaLLM(
                input,
                requestedCount,
                types,
                difficulty,
                learningObjectives.map((lo) => lo.text)
            );

            // ====================================================================
            // STEP 3: Sanitize LLM output — drop incomplete parts, remap types
            // ====================================================================
            const sanitized = rawResults
                .map((raw) => sanitizeGeneratedScenario(raw, types))
                .filter((q): q is GeneratedScenario => q !== null);

            if (sanitized.length === 0) {
                appLogger.warn('[SCENARIO-SERVICE] All generated question(s) failed validation; no draft persisted');
                return {
                    success: false,
                    error: 'Generation did not produce a question with at least one valid subquestion. Please try again or refine the prompt.',
                };
            }

            // ====================================================================
            // STEP 4: Persist drafts — server assigns subQuestionId at insert time
            // ====================================================================
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const saved: ScenarioQuestion[] = [];

            // persist the generated questions
            for (const question of sanitized) {
                const title = resolveScenarioPersistTitle(input.title, question.title);

                // create the scenario question
                const created = await mongoDB.createScenarioQuestion({
                    courseId: input.courseId,
                    courseName: input.courseName,
                    topicOrWeekId: input.topicOrWeekId,
                    title,
                    sourcePrompt: input.sourcePrompt,
                    questionBody: question.questionBody,
                    solutionBody: question.solutionBody,
                    subQuestions: question.subQuestions,
                    generatedBy: 'ai',
                    aiGenerationJobId,
                    createdByUserId: input.createdByUserId,
                    difficulty,
                    expectedTimeMinutes: defaultExpectedTimeMinutes(difficulty, question.subQuestions.length),
                    learningObjectives,
                });
                saved.push(created);
            }

            appLogger.log(
                `[SCENARIO-SERVICE] Persisted ${saved.length}/${requestedCount} generated question(s) for course ${input.courseName}`
            );
            return { success: true, data: saved, aiGenerationJobId };
        } catch (error) {
            appLogger.error('[SCENARIO-SERVICE] Generation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Scenario generation failed',
            };
        }
    }

    /**
     * submitStudentResponse - Grade one sub-question answer (practice: TA feedback only), persist, and return feedback.
     * 
     *
     * @param input - Question/sub-question ids, student answer, mode, and course context
     * @returns Grade and feedback; persists unless instructor preview on unpublished draft fails lookup
     */
    public async submitStudentResponse(
        input: ScenarioSubmitStudentResponseInput
    ): Promise<ScenarioPartFeedbackResponse> {
        const { subQuestionId, mode } = input;
        try {
            // ====================================================================
            // STEP 1: Load question and resolve the target sub-question
            // ====================================================================
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const question = await mongoDB.getScenarioQuestionById(input.courseName, input.questionId);
            if (!question || (!input.allowUnpublished && question.status !== 'published')) {
                return {
                    success: false,
                    responseId: '',
                    subQuestionId,
                    mode,
                    feedback: '',
                    error: 'Question not found',
                };
            }

            const subQuestion = question.subQuestions.find((s) => s.subQuestionId === subQuestionId);
            if (!subQuestion) {
                return {
                    success: false,
                    responseId: '',
                    subQuestionId,
                    mode,
                    feedback: '',
                    error: `Sub-question ${subQuestionId} not found`,
                };
            }

            const now = new Date();
            let feedbackTier: PracticeFeedbackPromptTier = 'socratic';

            // ====================================================================
            // STEP 2a: Practice abuse gates (students only — instructor preview skips)
            // ====================================================================
            if (mode === 'practice' && !input.allowUnpublished) {
                const todayPriorCount = countPracticeAttemptsToday(subQuestion, input.studentUserId, now);
                const lastSubmittedAtToday = getLastPracticeAttemptAtToday(
                    subQuestion,
                    input.studentUserId,
                    now
                );
                const gate = checkPracticeSubmissionGate({
                    todayPriorCount,
                    lastSubmittedAtToday,
                    now,
                });

                if (!gate.allowed) {
                    const feedback =
                        gate.blockReason === 'cooldown'
                            ? getPracticeCooldownMessage((gate.retryAfterMs ?? 0) / 1000)
                            : getPracticeDailyLimitMessage(gate.resetsAt ?? now);

                    return {
                        success: true,
                        responseId: '',
                        subQuestionId,
                        mode,
                        feedback,
                        feedbackSource: 'canned',
                        blockReason: gate.blockReason ?? undefined,
                        attemptNumber: todayPriorCount,
                        attemptsRemaining: Math.max(0, PRACTICE_DAILY_MAX_ATTEMPTS - todayPriorCount),
                        maxAttemptsPerDay: PRACTICE_DAILY_MAX_ATTEMPTS,
                        retryAfterSeconds:
                            gate.blockReason === 'cooldown'
                                ? Math.ceil((gate.retryAfterMs ?? 0) / 1000)
                                : undefined,
                        resetsAt:
                            gate.blockReason === 'daily_limit' && gate.resetsAt
                                ? gate.resetsAt.toISOString()
                                : undefined,
                    };
                }

                feedbackTier = gate.tier === 'descriptive' ? 'descriptive' : 'socratic';
            }

            // ====================================================================
            // STEP 2b: Practice feedback via LLM (or mock) — no numeric grade
            // ====================================================================
            const reviewed = await this.feedbackPracticePart(
                question.questionBody,
                subQuestion,
                input.studentAnswer,
                feedbackTier
            );

            const todayPriorCount =
                mode === 'practice' && !input.allowUnpublished
                    ? countPracticeAttemptsToday(subQuestion, input.studentUserId, now)
                    : 0;
            const attemptNumber = todayPriorCount + 1;
            const answerRevealed = feedbackTier === 'descriptive';

            // generate a unique response id
            const responseId = IDGenerator.getInstance().scenarioStudentResponseID(
                subQuestionId,
                input.studentUserId,
                now
            );

            // create the scenario student response record
            const record: ScenarioStudentResponse = {
                id: responseId,
                studentUserId: input.studentUserId,
                mode,
                studentAnswer: input.studentAnswer.trim(),
                feedback: reviewed.feedback,
                submittedAt: now,
            };

            // ====================================================================
            // STEP 3: Atomically append to embedded studentResponses[]
            // ====================================================================

            // append the scenario student response record to the question
            await mongoDB.appendScenarioStudentResponse(
                input.courseName,
                input.questionId,
                subQuestionId,
                record
            );

            return {
                success: true,
                responseId,
                subQuestionId,
                mode,
                feedback: reviewed.feedback,
                feedbackTier: mode === 'practice' ? feedbackTier : undefined,
                feedbackSource: 'llm',
                attemptNumber: mode === 'practice' && !input.allowUnpublished ? attemptNumber : undefined,
                attemptsRemaining:
                    mode === 'practice' && !input.allowUnpublished
                        ? Math.max(0, PRACTICE_DAILY_MAX_ATTEMPTS - attemptNumber)
                        : undefined,
                maxAttemptsPerDay:
                    mode === 'practice' && !input.allowUnpublished ? PRACTICE_DAILY_MAX_ATTEMPTS : undefined,
                answerRevealed: mode === 'practice' ? answerRevealed : undefined,
            };
        } catch (error) {
            appLogger.error('[SCENARIO-SERVICE] submitStudentResponse failed:', error);
            return {
                success: false,
                responseId: '',
                subQuestionId,
                mode,
                feedback: '',
                error: error instanceof Error ? error.message : 'Feedback generation failed',
            };
        }
    }

    /**
     * Submit all exam answers: validate completeness, batch-grade, persist, return overall grade.
     *
     * @param input - Full answer set for one published question
     * @returns Per-part grades/feedback and rounded overall grade; 400 on validation errors
     */
    public async submitExam(input: ScenarioSubmitExamInput): Promise<ScenarioExamSubmitResponse> {
        try {
            // ====================================================================
            // STEP 1: Load published question and validate answer completeness
            // ====================================================================
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const question = await mongoDB.getScenarioQuestionById(input.courseName, input.questionId);
            if (!question || question.status !== 'published') {
                return { success: false, overallGrade: 0, results: [], error: 'Question not found' };
            }

            // validate the exam answers
            const validationError = this.validateExamAnswers(question, input.answers);
            if (validationError) {
                return { success: false, overallGrade: 0, results: [], error: validationError };
            }

            const answerById = new Map(input.answers.map((a) => [a.subQuestionId, a.studentAnswer.trim()]));
            const orderedIds = question.subQuestions.map((s) => s.subQuestionId);

            // ====================================================================
            // STEP 2: Batch-grade every part in one structured LLM call
            // ====================================================================
            const graded = await this.gradeExamBatch(question, answerById);
            if (!graded) {
                return {
                    success: false,
                    overallGrade: 0,
                    results: [],
                    error: 'Exam grading failed to return a complete result set. Please try again.',
                };
            }

            // ====================================================================
            // STEP 3: Build response records and atomically append all parts
            // ====================================================================
            const now = new Date();
            const idGen = IDGenerator.getInstance();
            const items = graded.map((result) => {
                const responseId = idGen.scenarioStudentResponseID(
                    result.subQuestionId,
                    input.studentUserId,
                    now
                );
                const response: ScenarioStudentResponse = {
                    id: responseId,
                    studentUserId: input.studentUserId,
                    mode: 'exam',
                    studentAnswer: answerById.get(result.subQuestionId) || '',
                    grade: result.grade,
                    feedback: result.feedback,
                    submittedAt: now,
                };
                return { subQuestionId: result.subQuestionId, response };
            });

            await mongoDB.appendScenarioExamResponses(input.courseName, input.questionId, items);

            // ====================================================================
            // STEP 4: Sum part grades and return results in question order
            // ====================================================================
            const overallGrade = computeScenarioOverallGrade(graded.map((g) => g.grade));
            const results = orderedIds.map((id) => {
                const g = graded.find((r) => r.subQuestionId === id)!;
                return { subQuestionId: id, grade: g.grade, feedback: g.feedback };
            });

            return { success: true, overallGrade, results };
        } catch (error) {
            appLogger.error('[SCENARIO-SERVICE] submitExam failed:', error);
            return {
                success: false,
                overallGrade: 0,
                results: [],
                error: error instanceof Error ? error.message : 'Exam submission failed',
            };
        }
    }

    /**
     * Return embedded response history for the authenticated student only.
     *
     * @param courseName - Course display name (collection suffix)
     * @param questionId - Scenario question id
     * @param studentUserId - Caller id — other students' records are never returned
     */
    public async getStudentResponseHistory(
        courseName: string,
        questionId: string,
        studentUserId: string
    ): Promise<Array<ScenarioStudentResponse & { subQuestionId: string }>> {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        return mongoDB.getScenarioStudentResponses(courseName, questionId, studentUserId);
    }

    /**
     * Whether the student may view model answers — every sub-question must have a response in mode.
     *
     * @param question - Full instructor question (includes embedded responses)
     * @param studentUserId - Student requesting solution reveal
     * @param mode - `practice` or `exam` — completion is tracked per mode
     */
    public canRevealSolution(question: ScenarioQuestion, studentUserId: string, mode: ScenarioMode): boolean {
        return hasCompletedAllSubQuestions(question, studentUserId, mode);
    }

    /**
     * validateExamAnswers - Validate exam payload: exactly one non-empty answer per visible subQuestionId.
     *
     * @param question - Full instructor question (includes embedded responses)
     * @param answers - Array of scenario exam answer inputs
     * @returns Human-readable error string, or null when valid
     */
    private validateExamAnswers(question: ScenarioQuestion, answers: ScenarioExamAnswerInput[]): string | null {
        const expected = new Set(question.subQuestions.map((s) => s.subQuestionId));
        const seen = new Set<string>();

        // iterate over the answers and validate them
        for (const answer of answers) {
            const id = answer.subQuestionId?.trim();
            if (!id || !expected.has(id)) {
                return `Unknown or invalid subQuestionId: ${answer.subQuestionId}`;
            }
            if (seen.has(id)) {
                return `Duplicate answer for subQuestionId: ${id}`;
            }
            if (!answer.studentAnswer?.trim()) {
                return `Empty answer for subQuestionId: ${id}`;
            }
            seen.add(id);
        }

        // if the number of seen answers is not the same as the number of expected answers, return an error
        if (seen.size !== expected.size) {
            const missing = [...expected].filter((id) => !seen.has(id));
            return `Missing answers for: ${missing.join(', ')}`;
        }

        // if the answers are valid, return null
        return null;
    }

    /**
     * Map instructor-selected LO ids to snapshot objects; reject ids outside the topic/week catalog.
     */
    private async resolveLearningObjectives(
        courseId: string,
        topicOrWeekId: string,
        learningObjectiveIds?: string[]
    ): Promise<ScenarioLearningObjectiveSnapshot[]> {
        if (!learningObjectiveIds?.length) return [];

        // get the learning objectives from the database
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const catalog = await mongoDB.getLearningObjectivesForTopicOrWeek(courseId, topicOrWeekId);
        // map the learning objectives by id
        const byId = new Map(catalog.map((o) => [o.objectiveId, o]));
        // create the snapshots
        const snapshots: ScenarioLearningObjectiveSnapshot[] = [];

        // iterate over the learning objective ids and create the snapshots
        for (const id of learningObjectiveIds) {
            const option = byId.get(id);
            if (!option) {
                throw new Error(`Learning objective ${id} is not in topic/week ${topicOrWeekId}`);
            }
            snapshots.push({
                objectiveId: option.objectiveId,
                text: option.text,
                sourceTopicOrWeekId: option.topicOrWeekId,
                sourceItemId: option.itemId,
            });
        }

        //if no learning objectives are found, return an empty array
        return snapshots;
    }

    /**
     * RAG retrieval + structured LLM generation for single or batch mode.
     * 
     * @param input - The input for the scenario generation
     * @param requestedCount - The number of questions to generate
     * @param types - The types of questions to generate
     * @param difficulty - The difficulty of the questions
     * @param learningObjectiveTexts - The learning objectives for the questions
     * @returns The generated scenarios
     */
    private async generateViaLLM(
        input: ScenarioGenerateDraftsInput,
        requestedCount: number,
        types: ScenarioSubQuestionType[],
        difficulty: ScenarioDifficulty,
        learningObjectiveTexts: string[]
    ): Promise<GeneratedScenario[]> {
        const ragQuery = this.buildScenarioRagQuery(input.sourcePrompt, learningObjectiveTexts);

        // Retrieve course-material context scoped to the selected topic/week when possible
        const ragApp = await RAGApp.getInstance();

        // log the RAG query and scope
        appLogger.log(`[SCENARIO-SERVICE] RAG query:\n${ragQuery}`);
        appLogger.log(`[SCENARIO-SERVICE] RAG scope — course: ${input.courseName}, topicOrWeekId: ${input.topicOrWeekId}`);

        // retrieve the context from the RAG app
        const chunks = await ragApp.retrieveForChat(ragQuery, input.courseName, {
            limit: 5,
            scoreThreshold: 0.4,
            topicOrWeekId: input.topicOrWeekId,
        });
        const context = ragPrompts.formatRetrievedContext(chunks);

        appLogger.log(`[SCENARIO-SERVICE] RAG retrieved ${chunks.length} chunk(s)`);
        if (chunks.length === 0) {
            appLogger.warn(
                '[SCENARIO-SERVICE] No RAG chunks — generation user turn will omit <course_materials> (check published docs for this topic/week)'
            );
        } else {
            appLogger.log(`[SCENARIO-SERVICE] RAG context length: ${context.length} chars`);
        }

        // build the system prompt
        const systemPrompt = buildScenarioGenerationSystemPrompt(input.mode, learningObjectiveTexts);

        // build the type line
        const typeLine = `\n\nGenerate exactly ${types.length} subquestion(s) with these types in order: ${types.join(', ')}. Difficulty: ${difficulty}.`;

        // build the prompt suffix
        const promptSuffix =
            (input.mode === 'batch' ? `\n\nGenerate exactly ${requestedCount} distinct question(s).` : '') + typeLine;
        const userTurn = ragPrompts.formatScenarioGenerationUserTurn(context, input.sourcePrompt) + promptSuffix;

        // build the messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        // log the messages
        this.logLlmPrompts(input.mode === 'batch' ? 'generate-batch' : 'generate-single', messages);

        if (input.mode === 'single') {
            const response = await this.llmModule.sendStructuredConversation(messages, singleScenarioSchema, {
                structuredOutputName: 'scenario_generation_single',
            });
            return response?.parsed ? [response.parsed] : [];
        }

        const response = await this.llmModule.sendStructuredConversation(messages, batchScenarioSchema, {
            structuredOutputName: 'scenario_generation_batch',
        });
        return response?.parsed?.questions ?? [];
    }

    /**
     * feedbackPracticePart - Practice check-answer: friendly TA feedback via structured LLM output (no grade).
     *
     * Tier selects the prompt path: `socratic` returns hint-style feedback only; `descriptive`
     * evaluates the answer and appends the model answer server-side. Always returns `{ feedback }`.
     *
     * @param questionBody - Parent scenario stem shown to the LLM for context
     * @param subQuestion - Target sub-part (prompt, modelAnswer, type)
     * @param studentAnswer - Student submission text for this sub-question
     * @param tier - `socratic` (default) or `descriptive` (evaluation + model answer reveal)
     * @returns `{ feedback }` TA-facing string; throws when structured LLM output is empty
     */
    private async feedbackPracticePart(
        questionBody: string,
        subQuestion: ScenarioSubQuestion,
        studentAnswer: string,
        tier: PracticeFeedbackPromptTier = 'socratic'
    ): Promise<{ feedback: string }> {

        // build the system prompt
        const systemPrompt =
            tier === 'descriptive'
                ? buildScenarioPracticeDescriptiveFeedbackSystemPrompt()
                : buildScenarioPracticeSocraticFeedbackSystemPrompt();

        // build the user turn
        const userTurn = buildScenarioPracticeFeedbackUserTurn(
            questionBody,
            subQuestion.prompt,
            subQuestion.modelAnswer,
            studentAnswer,
            tier
        );

        // build the messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        this.logLlmPrompts('feedback-practice', messages);

        // send the messages to the LLM
        const response = await this.llmModule.sendStructuredConversation(
            messages,
            scenarioPracticeFeedbackResponseSchema,
            { structuredOutputName: 'scenario_practice_feedback' }
        );
        if (!response?.parsed) {
            throw new Error('Empty structured response from LLM');
        }

        if (tier === 'descriptive') {
            const { feedback: evaluation } = sanitizeScenarioPracticeDescriptiveFeedback(response.parsed);
            return { feedback: assemblePracticeDescriptiveFeedback(evaluation, subQuestion.modelAnswer) };
        }

        return sanitizeScenarioPracticeFeedback(response.parsed, subQuestion.modelAnswer);
    }

    /**
     * Batch-grade all exam parts in one LLM call; validate coverage of every subQuestionId.
     *
     * @param question - Full published question with all sub-parts
     * @param answerById - Student answers keyed by subQuestionId
     * @returns Graded parts in expected order, or null when LLM output is incomplete
     */
    private async gradeExamBatch(
        question: ScenarioQuestion,
        answerById: Map<string, string>
    ): Promise<Array<{ subQuestionId: string; grade: number; feedback: string }> | null> {
        
        // Assemble per-part grading payload and expected id list for sanitizer
        const parts = question.subQuestions.map((sub) => ({
            subQuestionId: sub.subQuestionId,
            prompt: sub.prompt,
            modelAnswer: sub.modelAnswer,
            studentAnswer: answerById.get(sub.subQuestionId) || '',
        }));

        // build the expected ids
        const expectedIds = parts.map((p) => p.subQuestionId);

        // build the model answers by sub-question id
        const modelAnswersBySubQuestionId = Object.fromEntries(
            question.subQuestions.map((s) => [s.subQuestionId, s.modelAnswer])
        );

        // One structured LLM call grades every part — shared narrative, independent judgments
        const systemPrompt = buildScenarioExamFeedbackSystemPrompt();
        const userTurn = buildScenarioExamGradingUserTurn(question.questionBody, parts);
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        // log the messages
        this.logLlmPrompts('grade-exam-batch', messages);

        // send the messages to the LLM
        const response = await this.llmModule.sendStructuredConversation(
            messages,
            scenarioExamGradingResponseSchema,
            { structuredOutputName: 'scenario_exam_grading' }
        );
        if (!response?.parsed) return null;

        // Reject partial/duplicate results; return in question.subQuestions order
        return sanitizeExamGradingResponse(response.parsed, expectedIds, modelAnswersBySubQuestionId);
    }

    /** Vector search query — instructor prompt plus selected LO text for better retrieval. */
    private buildScenarioRagQuery(sourcePrompt: string, learningObjectiveTexts: string[]): string {
        const lines = [sourcePrompt.trim()];
        if (learningObjectiveTexts.length > 0) {
            lines.push('', 'Learning objectives:', ...learningObjectiveTexts.map((t, i) => `${i + 1}. ${t}`));
        }
        return lines.join('\n');
    }

    /** Log full system and user prompts sent to the LLM (dev/staging only via appLogger). */
    private logLlmPrompts(label: string, messages: Message[]): void {
        for (const message of messages) {
            if (message.role === 'system') {
                appLogger.log(`[SCENARIO-SERVICE] ${label} — SYSTEM PROMPT:\n${message.content}`);
            } else if (message.role === 'user') {
                appLogger.log(`[SCENARIO-SERVICE] ${label} — USER TURN:\n${message.content}`);
            }
        }
    }
}

const appConfig = loadConfig();
const scenarioService = new ScenarioService(appConfig);

/** Module-level convenience wrapper around the process-wide {@link ScenarioService} singleton. */
export async function generateScenarioQuestions(
    input: ScenarioGenerateDraftsInput
): Promise<ScenarioGenerateResponse> {
    return scenarioService.generateDrafts(input);
}

/** Module-level convenience wrapper for practice check-answer and instructor preview grading. */
export async function submitScenarioStudentResponse(
    input: ScenarioSubmitStudentResponseInput
): Promise<ScenarioPartFeedbackResponse> {
    return scenarioService.submitStudentResponse(input);
}

/** Module-level convenience wrapper for student exam submission. */
export async function submitScenarioExam(input: ScenarioSubmitExamInput): Promise<ScenarioExamSubmitResponse> {
    return scenarioService.submitExam(input);
}

/** Returns the shared ScenarioService instance for routes that need gate/history helpers. */
export function getScenarioService(): ScenarioService {
    return scenarioService;
}
