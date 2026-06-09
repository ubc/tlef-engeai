// src/db/enge-ai-mongodb.ts

/**
 * enge-ai-mongodb.ts
 * @author: @gatahcha
 * @date: 2025-03-13
 * @description: Singleton MongoDB access layer for EngE-AI — façade delegates into `mongo/` (`./mongo/course-mongo`, `./mongo/flag-mongo`, `./mongo/chat-mongo`, …).
 */

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';
import {
    activeCourse,
    AdditionalMaterial,
    Chat,
    ChatMessage,
    PersistedConversationModeId,
    CourseUser,
    FlagReport,
    GlobalUser,
    InitialAssistantPrompt,
    MemoryAgentEntry,
    SystemPromptItem,
    ConversationModeId
} from '../types/shared';
import { IDGenerator } from '../utils/unique-id-generator';
import { appLogger } from '../utils/logger';

import type { MongoDalContext } from './mongo/mongo-context';
import * as ChatMongo from './mongo/chat-mongo';
import * as CollectionRegistryMongo from './mongo/collection-registry-mongo';
import * as CourseMongo from './mongo/course-mongo';
import * as CourseUserMongo from './mongo/course-user-mongo';
import * as FlagMongo from './mongo/flag-mongo';
import * as GlobalUserMongo from './mongo/global-user-mongo';
import * as InstructorPromptMongo from './mongo/instructor-prompt-mongo';
import * as SystemPromptConfigMongo from './mongo/system-prompt-config-mongo';
import * as MemoryAgentMongo from './mongo/memory-agent-mongo';
import * as ScheduledTaskMongo from './mongo/scheduled-task-mongo';
import * as TopicWeekMongo from './mongo/topic-week-mongo';
import * as ConversationExportMongo from './mongo/conversation-export-mongo';
import * as CourseBackupMongo from './mongo/course-backup-mongo';

dotenv.config();

/**
 * EngEAI_MongoDB
 *
 * Thin singleton connecting to MongoDB and delegating to domain modules (`MongoDalContext`).
 * Public method names preserved for callers.
 */
export class EngEAI_MongoDB {
    private static instance: EngEAI_MongoDB;

    private static MONGO_URI = `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(process.env.MONGO_PASSWORD || '')}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
    private client: MongoClient;
    public db!: Db;
    public idGenerator: IDGenerator;

    private collectionNamesCache: Map<
        string,
        { users: string; flags: string; memoryAgent: string; scheduledTasks: string }
    > = new Map();

    private scheduledTasksIndexesEnsured = new Set<string>();

    private constructor() {
        this.idGenerator = IDGenerator.getInstance();
        this.client = new MongoClient(EngEAI_MongoDB.MONGO_URI, {
            authSource: process.env.MONGO_AUTH_SOURCE
        });
    }

    private ctx(): MongoDalContext {
        return {
            db: this.db,
            idGenerator: this.idGenerator,
            collectionNamesCache: this.collectionNamesCache,
            scheduledTasksIndexesEnsured: this.scheduledTasksIndexesEnsured
        };
    }

    /**
     * getInstance
     *
     * @returns Promise<EngEAI_MongoDB> — Singleton instance; connects to MongoDB on first call
     */
    public static async getInstance(): Promise<EngEAI_MongoDB> {
        if (!EngEAI_MongoDB.instance) {
            EngEAI_MongoDB.instance = new EngEAI_MongoDB();

            try {
                await EngEAI_MongoDB.instance.client.connect();
                EngEAI_MongoDB.instance.db = EngEAI_MongoDB.instance.client.db(process.env.MONGO_DB_NAME);
                appLogger.log('✅ MongoDB connected successfully');
            } catch (error) {
                appLogger.error('❌ Failed to connect to MongoDB:', error);
                throw new Error(`MongoDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return EngEAI_MongoDB.instance;
    }

    /**
     * 
     * close — disconnect client
     * 
     */
    public async close(): Promise<void> {
        try {
            await this.client.close();
            appLogger.log('✅ MongoDB connection closed');
        } catch (error) {
            appLogger.error('❌ Error closing MongoDB connection:', error);
            throw error;
        }
    }

    /**
     * testConnection — Pings MongoDB (health checks).
     * @returns true if ping succeeds
     */
    public async testConnection(): Promise<boolean> {
        try {
            await this.db.admin().ping();
            return true;
        } catch (error) {
            appLogger.error('❌ MongoDB connection test failed:', error);
            return false;
        }
    }
    
    /**
     * #########################################################
     * Delegates — active course lifecycle: see course-mongo.ts
     * #########################################################
     */
    public postActiveCourse = async (course: activeCourse) => CourseMongo.postActiveCourse(this.ctx(), course);

    public getActiveCourse = async (id: string) => CourseMongo.getActiveCourse(this.ctx(), id);

    public getActiveCourseByCode = async (courseCode: string) =>
        CourseMongo.getActiveCourseByCode(this.ctx(), courseCode);

    public getCourseByName = async (name: string) => CourseMongo.getCourseByName(this.ctx(), name);

    public getAllActiveCourses = async () => CourseMongo.getAllActiveCourses(this.ctx());

    public updateActiveCourse = async (id: string, updateData: Partial<activeCourse>) =>
        CourseMongo.updateActiveCourse(this.ctx(), id, updateData);

    public deleteActiveCourse = async (course: activeCourse) =>
        CourseMongo.deleteActiveCourse(this.ctx(), course);

    public removeCourseFromAllUsers = async (courseId: string): Promise<number> =>
        CourseMongo.removeCourseFromAllUsers(this.ctx(), courseId);

    public dropCollection = async (collectionName: string) =>
        CourseMongo.dropCollection(this.ctx(), collectionName);

    /**
     * Topic/week embeddings on course doc — topic-week-mongo.ts
     */
    public addLearningObjective = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        learningObjective: any
    ) =>
        TopicWeekMongo.addLearningObjective(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            learningObjective
        );

    public updateLearningObjective = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        objectiveId: string,
        updateData: any
    ) =>
        TopicWeekMongo.updateLearningObjective(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            objectiveId,
            updateData
        );

    public deleteLearningObjective = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        objectiveId: string
    ) =>
        TopicWeekMongo.deleteLearningObjective(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            objectiveId
        );

    /** Rewrite `topicOrWeekInstances[]` order by id permutation (drag-reorder). */
    public reorderTopicOrWeekInstances = async (courseId: string, orderedIds: string[]) =>
        TopicWeekMongo.reorderTopicOrWeekInstances(this.ctx(), courseId, orderedIds);

    /** Rewrite `learningObjectives[]` order by id permutation (drag-reorder). */
    public reorderLearningObjectives = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        orderedIds: string[]
    ) =>
        TopicWeekMongo.reorderLearningObjectives(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            orderedIds
        );

    public getAllLearningObjectives = async (courseId: string) =>
        TopicWeekMongo.getAllLearningObjectives(this.ctx(), courseId);

    /** Instructor struggle catalog CRUD — delegates to topic-week-mongo.ts */
    public addInstructorStruggleTopic = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        struggleTopic: any
    ) =>
        TopicWeekMongo.addInstructorStruggleTopic(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            struggleTopic
        );

    /** PATCH one `instructorStruggleTopics[]` entry by id. */
    public updateInstructorStruggleTopic = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        struggleTopicId: string,
        updateData: { struggleTopic: string }
    ) =>
        TopicWeekMongo.updateInstructorStruggleTopic(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            struggleTopicId,
            updateData
        );

    /** DELETE one `instructorStruggleTopics[]` entry by id. */
    public deleteInstructorStruggleTopic = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        struggleTopicId: string
    ) =>
        TopicWeekMongo.deleteInstructorStruggleTopic(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            struggleTopicId
        );

    /** Rewrite `instructorStruggleTopics[]` order by id permutation (drag-reorder). */
    public reorderInstructorStruggleTopics = async (
        courseId: string,
        topicOrWeekId: string,
        contentId: string,
        orderedIds: string[]
    ) =>
        TopicWeekMongo.reorderInstructorStruggleTopics(
            this.ctx(),
            courseId,
            topicOrWeekId,
            contentId,
            orderedIds
        );

    /** Flatten all instructor struggle labels with topic/week and section titles (memory-agent catalog). */
    public getAllInstructorStruggleTopics = async (courseId: string) =>
        TopicWeekMongo.getAllInstructorStruggleTopics(this.ctx(), courseId);

    public addContentItem = async (courseId: string, topicOrWeekId: string, contentItem: any) =>
        TopicWeekMongo.addContentItem(this.ctx(), courseId, topicOrWeekId, contentItem);

    public addAdditionalMaterial = async (
        courseId: string,
        topicOrWeekId: string,
        itemId: string,
        material: AdditionalMaterial
    ) => TopicWeekMongo.addAdditionalMaterial(this.ctx(), courseId, topicOrWeekId, itemId, material);

    public clearAllAdditionalMaterials = async (courseId: string) =>
        TopicWeekMongo.clearAllAdditionalMaterials(this.ctx(), courseId);

    /**
     * #########################################################
     * Collection registry + scheduled publish jobs
     * #########################################################
     */
    public async getCollectionNames(courseName: string) {
        return CollectionRegistryMongo.getCollectionNames(this.ctx(), courseName);
    }

    public upsertScheduledTopicOrWeekTask = async (
        courseName: string,
        courseId: string,
        topicOrWeekId: string,
        title: string,
        scheduledFor: Date
    ) =>
        ScheduledTaskMongo.upsertScheduledTopicOrWeekTask(
            this.ctx(),
            courseName,
            courseId,
            topicOrWeekId,
            title,
            scheduledFor
        );

    public deleteScheduledTaskByTopicOrWeekId = async (courseName: string, topicOrWeekId: string) =>
        ScheduledTaskMongo.deleteScheduledTaskByTopicOrWeekId(this.ctx(), courseName, topicOrWeekId);

    public deleteScheduledTaskById = async (courseName: string, taskId: string) =>
        ScheduledTaskMongo.deleteScheduledTaskById(this.ctx(), courseName, taskId);

    public findDueScheduledTasksForCourse = async (courseName: string, before: Date) =>
        ScheduledTaskMongo.findDueScheduledTasksForCourse(this.ctx(), courseName, before);

    /**
     * #########################################################
     * Flags — flag-mongo.ts
     * #########################################################
     */
    public createFlagReport = async (flagReport: FlagReport) => FlagMongo.createFlagReport(this.ctx(), flagReport);

    public getAllFlagReports = async (courseName: string) =>
        FlagMongo.getAllFlagReports(this.ctx(), courseName);

    public getFlagReport = async (courseName: string, flagId: string) =>
        FlagMongo.getFlagReport(this.ctx(), courseName, flagId);

    public updateFlagReport = async (courseName: string, flagId: string, updateData: Partial<FlagReport>) =>
        FlagMongo.updateFlagReport(this.ctx(), courseName, flagId, updateData);

    public deleteFlagReport = async (courseName: string, flagId: string) =>
        FlagMongo.deleteFlagReport(this.ctx(), courseName, flagId);

    public deleteAllFlagReports = async (courseName: string) =>
        FlagMongo.deleteAllFlagReports(this.ctx(), courseName);

    public validateStatusTransition = FlagMongo.validateStatusTransition;

    public updateFlagStatus = async (
        courseName: string,
        flagId: string,
        newStatus: string,
        response?: string,
        instructorId?: string
    ) => FlagMongo.updateFlagStatus(this.ctx(), courseName, flagId, newStatus, response, instructorId);

    public getFlagStatistics = async (courseName: string) =>
        FlagMongo.getFlagStatistics(this.ctx(), courseName);

    public validateFlagCollection = async (courseName: string) =>
        FlagMongo.validateFlagCollection(this.ctx(), courseName);

    public createFlagIndexes = async (courseName: string) =>
        FlagMongo.createFlagIndexes(this.ctx(), courseName);

    public getFlagReportsWithUserNames = async (courseName: string) =>
        FlagMongo.getFlagReportsWithUserNames(this.ctx(), courseName);

    

    /**
     * #########################################################
     * Course users roster — course-user-mongo.ts
     * #########################################################
     */
    public findUserByUserId = async (courseName: string, userId: string) =>
        CourseUserMongo.findUserByUserId(this.ctx(), courseName, userId);

    public batchFindUsersByUserIds = async (courseName: string, userIds: string[]) =>
        CourseUserMongo.batchFindUsersByUserIds(this.ctx(), courseName, userIds);

    public findStudentByUserId = async (courseName: string, userId: string) =>
        CourseUserMongo.findStudentByUserId(this.ctx(), courseName, userId);

    public findStudentByPUID = async (courseName: string, puid: string) =>
        CourseUserMongo.findStudentByPUID(this.ctx(), courseName, puid);

    public createStudent = async (courseName: string, userData: Partial<CourseUser>) =>
        CourseUserMongo.createStudent(this.ctx(), courseName, userData);

    public countCourseStudentsAndActiveChats = async (courseName: string) =>
        CourseUserMongo.countCourseStudentsAndActiveChats(this.ctx(), courseName);

    /**
     * Chats — chat-mongo.ts
     */
    public getUserChats = async (courseName: string, userId: string) =>
        ChatMongo.getUserChats(this.ctx(), courseName, userId);

    public getUserChatsMetadata = async (courseName: string, userId: string) =>
        ChatMongo.getUserChatsMetadata(this.ctx(), courseName, userId);

    public addChatToUser = async (courseName: string, userId: string, chat: Chat) =>
        ChatMongo.addChatToUser(this.ctx(), courseName, userId, chat);

    public updateUserChat = async (courseName: string, userId: string, chatId: string, chat: Chat) =>
        ChatMongo.updateUserChat(this.ctx(), courseName, userId, chatId, chat);

    public addMessageToChat = async (courseName: string, userId: string, chatId: string, message: ChatMessage) =>
        ChatMongo.addMessageToChat(this.ctx(), courseName, userId, chatId, message);

    public ensureChatConversationMode = async (
        courseName: string,
        userId: string,
        chatId: string,
        mode: PersistedConversationModeId = 'socratic'
    ) => ChatMongo.ensureChatConversationMode(this.ctx(), courseName, userId, chatId, mode);

    public updateChatTitle = async (courseName: string, userId: string, chatId: string, newTitle: string) =>
        ChatMongo.updateChatTitle(this.ctx(), courseName, userId, chatId, newTitle);

    public updateChatPinStatus = async (courseName: string, userId: string, chatId: string, isPinned: boolean) =>
        ChatMongo.updateChatPinStatus(this.ctx(), courseName, userId, chatId, isPinned);

    public updateMessageInChat = async (
        courseName: string,
        userId: string,
        chatId: string,
        messageId: string,
        newText: string
    ) => ChatMongo.updateMessageInChat(this.ctx(), courseName, userId, chatId, messageId, newText);

    public markChatAsDeleted = async (courseName: string, userId: string, chatId: string) =>
        ChatMongo.markChatAsDeleted(this.ctx(), courseName, userId, chatId);

    public deleteChatFromUser = async (courseName: string, userId: string, chatId: string) =>
        ChatMongo.deleteChatFromUser(this.ctx(), courseName, userId, chatId);

    /**
     * Bulk conversation ZIP export — conversation-export-mongo.ts (aggregation cursor only).
     */
    public aggregateStudentChatsForZipExport = async (courseName: string) =>
        ConversationExportMongo.aggregateStudentChatsForZipExport(this.ctx(), courseName);

    /** Roster students + memory-agent struggle topics for monitor ZIP `Struggle topics/` entries. */
    public listStudentStruggleRowsForZipExport = async (courseName: string) =>
        ConversationExportMongo.listStudentStruggleRowsForZipExport(this.ctx(), courseName);

    /** Instructor ZIP: catalog row + per-course collections as EJSON strings — course-backup-mongo.ts */
    public loadCourseMongoBackupPayloads = async (course: activeCourse) =>
        CourseBackupMongo.loadCourseMongoBackupPayloads(this.ctx(), course);

    /**
     * Global profiles — global-user-mongo.ts
     */
    public findGlobalUserByPUID = async (puid: string) => GlobalUserMongo.findGlobalUserByPUID(this.ctx(), puid);

    public findGlobalUserByUserId = async (userId: string) =>
        GlobalUserMongo.findGlobalUserByUserId(this.ctx(), userId);

    public createGlobalUser = async (userData: Partial<GlobalUser>) =>
        GlobalUserMongo.createGlobalUser(this.ctx(), userData);

    public addCourseToGlobalUser = async (puid: string, courseId: string) =>
        GlobalUserMongo.addCourseToGlobalUser(this.ctx(), puid, courseId);

    public updateGlobalUser = async (puid: string, updateData: Partial<GlobalUser>) =>
        GlobalUserMongo.updateGlobalUser(this.ctx(), puid, updateData);

    public updateGlobalUserAffiliation = async (
        userId: string,
        affiliation: 'student' | 'faculty'
    ) => GlobalUserMongo.updateGlobalUserAffiliation(this.ctx(), userId, affiliation);

    /**
     * #########################################################
     * Memory agent — memory-agent-mongo.ts
     * #########################################################
     */
    public createMemoryAgentEntry = async (courseName: string, entry: MemoryAgentEntry) =>
        MemoryAgentMongo.createMemoryAgentEntry(this.ctx(), courseName, entry);

    public getMemoryAgentEntry = async (courseName: string, userId: string) =>
        MemoryAgentMongo.getMemoryAgentEntry(this.ctx(), courseName, userId);

    public updateMemoryAgentStruggleWords = async (
        courseName: string,
        userId: string,
        struggleTopics: string[]
    ) => MemoryAgentMongo.updateMemoryAgentStruggleWords(this.ctx(), courseName, userId, struggleTopics);

    public initializeMemoryAgentForUser = async (
        courseName: string,
        userId: string,
        name: string,
        affiliation: 'student' | 'faculty'
    ) => MemoryAgentMongo.initializeMemoryAgentForUser(this.ctx(), courseName, userId, name, affiliation);

    /**
     * Instructor prompts embedded on active course docs — instructor-prompt-mongo.ts
     */
    public getInitialAssistantPrompts = async (courseId: string) =>
        InstructorPromptMongo.getInitialAssistantPrompts(this.ctx(), courseId);

    public getSelectedInitialAssistantPrompt = async (courseId: string) =>
        InstructorPromptMongo.getSelectedInitialAssistantPrompt(this.ctx(), courseId);

    public createInitialAssistantPrompt = async (courseId: string, prompt: InitialAssistantPrompt) =>
        InstructorPromptMongo.createInitialAssistantPrompt(this.ctx(), courseId, prompt);

    public updateInitialAssistantPrompt = async (
        courseId: string,
        promptId: string,
        updates: Partial<InitialAssistantPrompt>
    ) => InstructorPromptMongo.updateInitialAssistantPrompt(this.ctx(), courseId, promptId, updates);

    public deleteInitialAssistantPrompt = async (courseId: string, promptId: string) =>
        InstructorPromptMongo.deleteInitialAssistantPrompt(this.ctx(), courseId, promptId);

    public selectInitialAssistantPrompt = async (courseId: string, promptId: string) =>
        InstructorPromptMongo.selectInitialAssistantPrompt(this.ctx(), courseId, promptId);

    public ensureDefaultPromptExists = async (courseId: string, courseName?: string) =>
        InstructorPromptMongo.ensureDefaultPromptExists(this.ctx(), courseId, courseName);

    public getSystemPromptItems = async (courseId: string) =>
        InstructorPromptMongo.getSystemPromptItems(this.ctx(), courseId);

    public getBaseSystemPrompt = async (courseId: string) =>
        InstructorPromptMongo.getBaseSystemPrompt(this.ctx(), courseId);

    public getAppendedSystemPromptItems = async (courseId: string) =>
        InstructorPromptMongo.getAppendedSystemPromptItems(this.ctx(), courseId);

    public createSystemPromptItem = async (courseId: string, item: SystemPromptItem) =>
        InstructorPromptMongo.createSystemPromptItem(this.ctx(), courseId, item);

    public updateSystemPromptItem = async (
        courseId: string,
        itemId: string,
        updates: Partial<SystemPromptItem>
    ) => InstructorPromptMongo.updateSystemPromptItem(this.ctx(), courseId, itemId, updates);

    public deleteSystemPromptItem = async (courseId: string, itemId: string) =>
        InstructorPromptMongo.deleteSystemPromptItem(this.ctx(), courseId, itemId);

    public toggleSystemPromptItemAppend = async (courseId: string, itemId: string, append: boolean) =>
        InstructorPromptMongo.toggleSystemPromptItemAppend(this.ctx(), courseId, itemId, append);

    public saveSystemPromptAppendChanges = async (
        courseId: string,
        changes: Array<{ itemId: string; append: boolean }>
    ) => InstructorPromptMongo.saveSystemPromptAppendChanges(this.ctx(), courseId, changes);

    public ensureDefaultSystemPromptComponents = async (courseId: string, courseName?: string) =>
        InstructorPromptMongo.ensureDefaultSystemPromptComponents(this.ctx(), courseId, courseName);

    public getSystemPromptConfig = async (courseId: string) =>
        SystemPromptConfigMongo.getSystemPromptConfig(this.ctx(), courseId);

    public updateModeSystemPrompt = async (
        courseId: string,
        mode: ConversationModeId,
        input: SystemPromptConfigMongo.UpdateModeSystemPromptInput
    ) => SystemPromptConfigMongo.updateModeSystemPrompt(this.ctx(), courseId, mode, input);

    public resetModeSystemPrompt = async (courseId: string, mode: ConversationModeId) =>
        SystemPromptConfigMongo.resetModeSystemPrompt(this.ctx(), courseId, mode);

    public setDefaultConversationMode = async (courseId: string, mode: ConversationModeId) =>
        SystemPromptConfigMongo.setDefaultConversationMode(this.ctx(), courseId, mode);

    public getDefaultConversationModeForCourse = async (courseId: string) =>
        SystemPromptConfigMongo.getDefaultConversationModeForCourse(this.ctx(), courseId);
}
