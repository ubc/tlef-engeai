/**
 * migrate schemas — allowlists for op A
 *
 * `additionalMaterialFields` must equal PERSISTED_ADDITIONAL_MATERIAL_KEYS (Documents UI / Mongo).
 * Nested `file` is not on the list; hoistMaterialFile copies leftovers then the walker strips it.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.1.0
 * @description: Collection field specs for npm run migrate attributeCheck.
 */

import { buildNewCourseFeatures } from '../dashboard-setting/course-features';
import { DEFAULT_COURSE_LLM_SETTINGS } from '../dashboard-setting/model-selection-service';
import type { FieldSpec } from './schema-walker';
import { hoistMaterialFile } from './schema-walker';

const capabilityFields: FieldSpec[] = [
    { key: 'enabled', default: false },
    { key: 'enabledAt', optional: true },
    { key: 'enabledBy', optional: true },
];

const llmSelectionFields: FieldSpec[] = [
    { key: 'modelId', enum: ['gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-4o-mini'], default: 'gpt-5.6-luna' },
    { key: 'reasoningLevel', enum: ['none', 'low', 'medium', 'high'], default: 'none' },
];

const promptModuleFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'body', default: '' },
    { key: 'sortOrder', default: 0 },
];

const modeStateFields: FieldSpec[] = [
    { key: 'usePlatformDefault', default: true },
    { key: 'modules', kind: 'array', itemFields: promptModuleFields, default: [] },
    { key: 'updatedAt', optional: true },
    { key: 'platformDefaultVersion', optional: true },
];

const learningObjectiveFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'LearningObjective', default: '' },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

const struggleTopicFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'struggleTopic', default: '' },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

/** Persist allowlist — keys must equal PERSISTED_ADDITIONAL_MATERIAL_KEYS. */
export const additionalMaterialFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'date', optional: true },
    { key: 'name', default: '' },
    { key: 'courseName', optional: true },
    { key: 'topicOrWeekTitle', optional: true },
    { key: 'itemTitle', optional: true },
    { key: 'sourceType', enum: ['file', 'url', 'text'], default: 'file' },
    { key: 'text', optional: true },
    { key: 'fileName', optional: true },
    { key: 'uploaded', optional: true },
    { key: 'qdrantChunkIds', kind: 'array', default: [] },
    { key: 'chunksGenerated', default: 0 },
    { key: 'deleted', optional: true },
    { key: 'deletedAt', optional: true },
    { key: 'uploadedBy', optional: true },
    { key: 'courseId', optional: true },
    { key: 'topicOrWeekId', optional: true },
    { key: 'itemId', optional: true },
];

const itemFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'date', optional: true },
    { key: 'title', default: '' },
    { key: 'courseName', optional: true },
    { key: 'topicOrWeekTitle', optional: true },
    { key: 'itemTitle', optional: true },
    { key: 'completed', optional: true },
    { key: 'learningObjectives', kind: 'array', itemFields: learningObjectiveFields, default: [] },
    { key: 'instructorStruggleTopics', kind: 'array', itemFields: struggleTopicFields, optional: true },
    {
        key: 'additionalMaterials',
        kind: 'array',
        itemFields: additionalMaterialFields,
        optional: true,
        preprocess: (value) => (Array.isArray(value) ? value.map((item) => hoistMaterialFile(item)) : value),
    },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

const topicOrWeekFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'date', optional: true },
    { key: 'title', default: '' },
    { key: 'courseName', optional: true },
    { key: 'published', default: false },
    { key: 'scheduledPublishAt', optional: true },
    { key: 'items', kind: 'array', itemFields: itemFields, default: [] },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

const initialPromptFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'title', default: '' },
    { key: 'content', default: '' },
    { key: 'dateCreated', optional: true },
    { key: 'isSelected', default: false },
    { key: 'isDefault', optional: true },
];

const systemPromptItemFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'title', default: '' },
    { key: 'content', default: '' },
    { key: 'dateCreated', optional: true },
    { key: 'isAppended', default: false },
    { key: 'isDefault', optional: true },
    { key: 'componentType', optional: true },
];

export const activeCourseSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'date', optional: true },
    { key: 'courseSetup', default: false },
    { key: 'contentSetup', default: false },
    { key: 'flagSetup', default: false },
    { key: 'monitorSetup', default: false },
    { key: 'courseName', identity: true },
    { key: 'instructors', kind: 'opaque', default: [] },
    { key: 'teachingAssistants', kind: 'opaque', default: [] },
    { key: 'frameType', enum: ['byWeek', 'byTopic'], default: 'byTopic' },
    { key: 'tilesNumber', default: 0 },
    { key: 'topicOrWeekInstances', kind: 'array', itemFields: topicOrWeekFields, default: [] },
    { key: 'courseCode', optional: true },
    {
        key: 'collections',
        kind: 'object',
        optional: true,
        fields: [
            { key: 'users', optional: true },
            { key: 'flags', optional: true },
            { key: 'memoryAgent', optional: true },
            { key: 'scheduledTasks', optional: true },
            { key: 'scenarioQuestions', optional: true },
            { key: 'scenarioProgress', optional: true },
            { key: 'pathways', optional: true },
        ],
    },
    { key: 'collectionOfInitialAssistantPrompts', kind: 'array', itemFields: initialPromptFields, optional: true },
    { key: 'collectionOfSystemPromptItems', kind: 'array', itemFields: systemPromptItemFields, optional: true },
    {
        key: 'systemPromptConfig',
        kind: 'object',
        optional: true,
        fields: [
            { key: 'schemaVersion', default: 1 },
            { key: 'defaultConversationMode', enum: ['socratic', 'explanatory'], default: 'socratic' },
            {
                key: 'modes',
                kind: 'object',
                optional: true,
                fields: [
                    { key: 'socratic', kind: 'object', optional: true, fields: modeStateFields },
                    { key: 'explanatory', kind: 'object', optional: true, fields: modeStateFields },
                ],
            },
        ],
    },
    { key: 'academicPeriodId', optional: true },
    {
        key: 'features',
        kind: 'object',
        default: buildNewCourseFeatures(),
        fields: [
            { key: 'writingFeedback', kind: 'object', optional: true, fields: capabilityFields },
            { key: 'memoryAgent', kind: 'object', optional: true, fields: capabilityFields },
            { key: 'guidedPathway', kind: 'object', optional: true, fields: capabilityFields },
            { key: 'scenarioGeneration', kind: 'object', optional: true, fields: capabilityFields },
        ],
    },
    {
        key: 'llmSettings',
        kind: 'object',
        default: DEFAULT_COURSE_LLM_SETTINGS,
        fields: [
            { key: 'chat', kind: 'object', optional: true, fields: llmSelectionFields },
            { key: 'scenarioGeneration', kind: 'object', optional: true, fields: llmSelectionFields },
            { key: 'writingFeedback', kind: 'object', optional: true, fields: llmSelectionFields },
            { key: 'guidedPathway', kind: 'object', optional: true, fields: llmSelectionFields },
            { key: 'memoryAgent', kind: 'object', optional: true, fields: llmSelectionFields },
            { key: 'updatedAt', optional: true },
            { key: 'updatedBy', optional: true },
        ],
    },
];

export const globalUserSchema: FieldSpec[] = [
    { key: 'puid', identity: true },
    { key: 'userId', identity: true },
    { key: 'name', default: '' },
    { key: 'coursesEnrolled', kind: 'array', default: [] },
    { key: 'affiliation', enum: ['student', 'faculty', 'staff', 'empty'], default: 'empty' },
    { key: 'status', enum: ['active', 'inactive'], default: 'active' },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
    { key: 'instructorOnboardingCompleted', optional: true },
    { key: 'studentOnboardingCompleted', optional: true },
    { key: 'isAdmin', optional: true },
];

export const academicPeriodSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'title', default: '' },
    { key: 'startDate', optional: true },
    { key: 'endDate', optional: true },
    { key: 'courseIds', kind: 'array', default: [] },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const instructorPeriodAllowanceSchema: FieldSpec[] = [
    { key: 'puid', identity: true },
    { key: 'academicPeriodId', identity: true },
    { key: 'allowedCourseNames', kind: 'array', default: [] },
    { key: 'updatedAt', optional: true },
];

const chatMessageFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'sender', enum: ['user', 'bot'], default: 'user' },
    { key: 'userId', optional: true },
    { key: 'courseName', optional: true },
    { key: 'text', default: '' },
    { key: 'timestamp', optional: true },
    { key: 'ctas', optional: true, kind: 'opaque' },
];

const chatFields: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseName', optional: true },
    { key: 'topicOrWeekTitle', optional: true },
    { key: 'itemTitle', optional: true },
    { key: 'messages', kind: 'array', itemFields: chatMessageFields, default: [] },
    { key: 'pinnedMessageId', optional: true },
    { key: 'isDeleted', optional: true },
    {
        key: 'conversationMode',
        optional: true,
        enum: ['socratic', 'explanatory', 'undeclared', 'scenario-generation'],
        default: 'undeclared',
    },
];

export const courseUserSchema: FieldSpec[] = [
    { key: 'userId', identity: true },
    { key: 'name', default: '' },
    { key: 'courseName', optional: true },
    { key: 'courseId', optional: true },
    { key: 'userOnboarding', default: false },
    { key: 'affiliation', enum: ['student', 'faculty'], default: 'student' },
    { key: 'status', enum: ['active', 'inactive'], default: 'active' },
    { key: 'chats', kind: 'array', itemFields: chatFields, default: [] },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const flagReportSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseName', optional: true },
    { key: 'date', optional: true },
    {
        key: 'flagType',
        enum: ['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other'],
        default: 'other',
    },
    { key: 'reportType', optional: true },
    { key: 'chatContent', optional: true },
    { key: 'userId', optional: true },
    { key: 'status', enum: ['unresolved', 'resolved'], default: 'unresolved' },
    { key: 'response', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const memoryAgentSchema: FieldSpec[] = [
    { key: 'userId', identity: true },
    { key: 'name', default: '' },
    { key: 'role', enum: ['instructor', 'TA', 'Student'], default: 'Student' },
    { key: 'struggleTopics', kind: 'array', default: [] },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const scheduledTaskSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'type', enum: ['scheduled_topic_or_week'], default: 'scheduled_topic_or_week' },
    { key: 'scheduledFor', optional: true },
    { key: 'content', kind: 'opaque', optional: true },
    { key: 'courseId', optional: true },
];

export const pathwaySchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'order', optional: true },
    { key: 'title', optional: true },
    { key: 'enabled', optional: true },
    { key: 'triggerDescription', optional: true },
    { key: 'assistantResponse', optional: true },
    { key: 'ctas', kind: 'opaque', optional: true },
    { key: 'updatedAt', optional: true },
    { key: 'docType', optional: true },
    { key: 'usePlatformDefault', optional: true },
    { key: 'body', optional: true },
];

export const scenarioQuestionSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'courseName', optional: true },
    { key: 'topicOrWeekId', optional: true },
    { key: 'title', optional: true },
    { key: 'status', enum: ['draft', 'published', 'rejected'], default: 'draft' },
    { key: 'sourcePrompt', optional: true },
    { key: 'questionBody', optional: true },
    { key: 'solutionBody', optional: true },
    { key: 'subQuestions', kind: 'opaque', default: [] },
    { key: 'difficulty', enum: ['easy', 'medium', 'hard'], default: 'medium' },
    { key: 'expectedTimeMinutes', optional: true },
    { key: 'learningObjectives', kind: 'opaque', default: [] },
    { key: 'generatedBy', enum: ['instructor', 'ai'], default: 'instructor' },
    { key: 'aiGenerationJobId', optional: true },
    { key: 'sortOrder', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
    { key: 'publishedAt', optional: true },
    { key: 'createdByUserId', optional: true },
    { key: 'lastEditedByUserId', optional: true },
];

export const scenarioProgressSchema: FieldSpec[] = [
    { key: 'userId', identity: true },
    { key: 'questionId', identity: true },
    { key: 'mode', enum: ['practice', 'exam'], default: 'practice' },
    { key: 'answers', kind: 'opaque', default: [] },
    { key: 'updatedAt', optional: true },
];

export const writingAssignmentSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'title', optional: true },
    { key: 'profileVersion', optional: true },
    { key: 'rubricSource', optional: true },
    { key: 'gradeMapping', kind: 'opaque', optional: true },
    { key: 'rubric', kind: 'opaque', optional: true },
    { key: 'rubricDraft', kind: 'opaque', optional: true },
    { key: 'rubricHistory', kind: 'opaque', optional: true },
    { key: 'canvasAssignmentId', optional: true },
    { key: 'dueAt', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const writingSubmissionSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'assignmentId', optional: true },
    { key: 'studentId', optional: true },
    { key: 'studentLabel', optional: true },
    { key: 'attempt', optional: true },
    { key: 'sourceType', optional: true },
    { key: 'originalText', optional: true },
    { key: 'verifiedText', optional: true },
    { key: 'requiresVerification', optional: true },
    { key: 'status', optional: true },
    { key: 'sourceFileId', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
    { key: 'retentionAt', optional: true },
    { key: 'approvedAt', optional: true },
    { key: 'approvedBy', optional: true },
    { key: 'approvedByName', optional: true },
    { key: 'reviews', kind: 'opaque', optional: true },
];

export const writingFeedbackRunSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'assignmentId', optional: true },
    { key: 'submissionId', optional: true },
    { key: 'profileVersion', optional: true },
    { key: 'rubricVersion', optional: true },
    { key: 'result', kind: 'opaque', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'modelMetadata', kind: 'opaque', optional: true },
];

export const writingReleaseSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'submissionId', optional: true },
    { key: 'payloadFingerprint', optional: true },
    { key: 'status', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const writingJobSchema: FieldSpec[] = [
    { key: 'id', identity: true },
    { key: 'courseId', optional: true },
    { key: 'kind', optional: true },
    { key: 'status', optional: true },
    { key: 'payload', kind: 'opaque', optional: true },
    { key: 'createdAt', optional: true },
    { key: 'updatedAt', optional: true },
];

export const canvasConnectionSchema: FieldSpec[] = [
    { key: 'courseId', identity: true },
    { key: 'updatedAt', optional: true },
];

export const QDRANT_PAYLOAD_ALLOWLIST = [
    'id',
    'date',
    'name',
    'courseName',
    'topicOrWeekTitle',
    'itemTitle',
    'sourceType',
    'uploadedAt',
] as const;
