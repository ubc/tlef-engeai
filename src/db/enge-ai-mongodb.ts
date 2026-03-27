// src/db/enge-ai-mongodb.ts

/**
 * enge-ai-mongodb.ts
 * @author: @gatahcha
 * @date: 2025-03-13
 * @latest app version: 1.2.9.9
 * @description: Singleton MongoDB access layer for EngE-AI. Manages courses, users, flags, learning objectives, materials, chats, memory agent, and instructor-allowed-courses.
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { activeCourse, 
    AdditionalMaterial, 
    TopicOrWeekInstance, 
    TopicOrWeekItem, 
    FlagReport, 
    Chat, 
    ChatMessage, 
    GlobalUser, 
    CourseUser, 
    LearningObjective, 
    LearningObjectiveForDisplay, 
    MemoryAgentEntry, 
    InitialAssistantPrompt,
    DEFAULT_PROMPT_ID, 
    SystemPromptItem, 
    DEFAULT_BASE_PROMPT_ID, 
    DEFAULT_LEARNING_OBJECTIVES_ID, 
    DEFAULT_STRUGGLE_TOPICS_ID } from '../types/shared';
import { IDGenerator } from '../utils/unique-id-generator';
import { INITIAL_ASSISTANT_MESSAGE, SYSTEM_PROMPT } from '../chat/chat-prompts';
import { appLogger } from '../utils/logger';

dotenv.config();

/**
 * EngEAI_MongoDB
 *
 * methods:
 *   - getInstance: Returns singleton MongoDB instance (connects on first call)
 *   - testConnection: Pings MongoDB to verify connectivity
 *   - postActiveCourse: Creates a new course in active-course-list
 *   - getActiveCourse: Gets course by ID
 *   - getActiveCourseByCode: Gets course by 6-char PIN code
 *   - getCourseByName: Gets course by name
 *   - getAllActiveCourses: Returns all active courses
 *   - updateActiveCourse: Updates course by ID
 *   - deleteActiveCourse: Deletes course and cascades to per-course collections
 *   - removeCourseFromAllUsers: Removes course from all GlobalUsers' coursesEnrolled
 *   - dropCollection: Drops a collection by name
 *   - getCollectionNames: Returns users, flags, memoryAgent collection names for a course
 *   - addLearningObjective: Adds learning objective to content item
 *   - updateLearningObjective: Updates learning objective
 *   - deleteLearningObjective: Deletes learning objective
 *   - getAllLearningObjectives: Returns all learning objectives for a course
 *   - createFlagReport: Creates flag report in course flags collection
 *   - getAllFlagReports: Returns all flag reports for a course
 *   - getFlagReport: Gets single flag report by ID
 *   - updateFlagReport: Updates flag report
 *   - deleteFlagReport: Deletes flag report
 *   - deleteAllFlagReports: Deletes all flag reports for a course
 *   - validateStatusTransition: Validates flag status transition (unresolved ↔ resolved)
 *   - updateFlagStatus: Updates flag status with validation
 *   - getFlagStatistics: Returns flag counts by type and status
 *   - validateFlagCollection: Validates flag collection schema
 *   - createFlagIndexes: Creates indexes on flags collection
 *   - getFlagReportsWithUserNames: Returns flag reports with resolved user names
 *   - addContentItem: Adds content item to topic/week
 *   - addAdditionalMaterial: Adds additional material to content item
 *   - clearAllAdditionalMaterials: Clears all materials for a course
 *   - close: Closes MongoDB connection
 *   - findUserByUserId: Finds user by userId in course (returns name, affiliation; no PUID)
 *   - batchFindUsersByUserIds: Batch lookup users by userIds
 *   - findStudentByUserId: Finds CourseUser (student) by userId
 *   - findStudentByPUID: (deprecated) Finds student by PUID
 *   - createStudent: Creates new CourseUser in course
 *   - updateUserChat: Updates or adds chat in CourseUser's chats array
 *   - findGlobalUserByPUID: Finds GlobalUser in active-users by PUID (only collection storing PUID)
 *   - findGlobalUserByUserId: Finds GlobalUser by userId
 *   - createGlobalUser: Creates new GlobalUser in active-users
 *   - updateGlobalUser: Updates GlobalUser by PUID
 *   - updateGlobalUserAffiliation: Updates GlobalUser affiliation (student | faculty)
 *   - getMemoryAgentEntry: Gets struggle topics for user in course
 *   - updateMemoryAgentStruggleWords: Updates or creates memory agent entry with struggle topics
 */
export class EngEAI_MongoDB {
    private static instance: EngEAI_MongoDB;
    private static activeCourseListCollection: string = 'active-course-list';
    private static activeUsersCollection: string = 'active-users';
    private static MONGO_URI = `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(process.env.MONGO_PASSWORD || '')}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
    private client: MongoClient;
    public db!: Db;
    public idGenerator: IDGenerator;

    private constructor() {
        this.idGenerator = IDGenerator.getInstance();
        this.client = new MongoClient(EngEAI_MongoDB.MONGO_URI, {
            authSource: process.env.MONGO_AUTH_SOURCE
        });
    }

    /**
     * getInstance
     *
     * @returns Promise<EngEAI_MongoDB> — Singleton instance; connects to MongoDB on first call
     * Returns the singleton MongoDB instance. Connects to MongoDB if not already connected.
     */
    public static async getInstance(): Promise<EngEAI_MongoDB> {
        if (!EngEAI_MongoDB.instance) {
            EngEAI_MongoDB.instance = new EngEAI_MongoDB();
            
            // Connect to MongoDB
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
     * getCourseCollection
     *
     * @returns Collection — MongoDB collection for active-course-list
     * Returns the active-course-list collection. Private helper.
     */
    private getCourseCollection(): Collection {
        return this.db.collection(EngEAI_MongoDB.activeCourseListCollection);
    }

    /**
     * testConnection
     *
     * @returns Promise<boolean> — True if MongoDB ping succeeds, false otherwise
     * Pings MongoDB to verify connectivity. Used for health checks.
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
     * postActiveCourse
     *
     * @param course activeCourse — Course document to create (id, courseName, instructors, etc.)
     * @returns Promise<void> — Resolves when course is created; skips if course.id already exists
     * Creates a new course in active-course-list. Creates per-course collections (users, flags, memory-agent). Generates courseCode if not provided. Idempotent for duplicate course.id.
     */
    public postActiveCourse = async (course: activeCourse) => {
        try {
            // Check if course already exists - prevent duplicates
            const existingCourse = await this.getActiveCourse(course.id);
            if (existingCourse) {
                appLogger.log(`⚠️ Course with id ${course.id} already exists, skipping creation`);
                return;
            }

            //use singleton's DB
            const courseName = course.courseName;

            // Generate course code if it doesn't exist
            let courseCode: string;
            if (course.courseCode) {
                // Use existing courseCode if provided
                courseCode = course.courseCode;
            } else {
                // Generate new course code with uniqueness check
                let attempts = 0;
                const maxAttempts = 10;
                let codeDate = course.date;
                
                do {
                    courseCode = this.idGenerator.courseCodeID(courseName, codeDate);
                    const existingCourseWithCode = await this.getCourseCollection().findOne({ courseCode: courseCode });
                    
                    if (!existingCourseWithCode) {
                        // Code is unique, break out of loop
                        break;
                    }
                    
                    // Code exists, try with slightly modified date (add milliseconds)
                    attempts++;
                    codeDate = new Date(codeDate.getTime() + attempts);
                    appLogger.log(`[COURSE-CODE] Duplicate code found, retrying with modified date (attempt ${attempts})`);
                } while (attempts < maxAttempts);
                
                if (attempts >= maxAttempts) {
                    appLogger.error(`[COURSE-CODE] ⚠️ Failed to generate unique course code after ${maxAttempts} attempts`);
                    // Still use the generated code (very low probability of collision)
                }
                
                appLogger.log(`[COURSE-CODE] Generated course code: ${courseCode} for course: ${courseName}`);
            }

            //create users collection (idempotent - won't throw if exists)
            const userCollection = `${courseName}_users`;
            try {
                await this.db.createCollection(userCollection);
            } catch (error: any) {
                // Ignore NamespaceExists error (collection already exists)
                if (error.codeName !== 'NamespaceExists') {
                    throw error;
                }
            }
    
            //create flags collection (idempotent - won't throw if exists)
            const flagsCollection = `${courseName}_flags`;
            try {
                await this.db.createCollection(flagsCollection);
            } catch (error: any) {
                // Ignore NamespaceExists error (collection already exists)
                if (error.codeName !== 'NamespaceExists') {
                    throw error;
                }
            }

            //create memory-agent collection (idempotent - won't throw if exists)
            const memoryAgentCollection = `${courseName}_memory-agent`;
            try {
                await this.db.createCollection(memoryAgentCollection);
            } catch (error: any) {
                // Ignore NamespaceExists error (collection already exists)
                if (error.codeName !== 'NamespaceExists') {
                    throw error;
                }
            }

            // Store collection names and course code in course document
            const courseWithCollections: activeCourse = {
                ...course,
                courseCode: courseCode,
                collections: {
                    users: userCollection,
                    flags: flagsCollection,
                    memoryAgent: memoryAgentCollection
                }
            };

            await this.getCourseCollection().insertOne(courseWithCollections as any);

            // Create indexes for optimal performance
            try {
                const indexResult = await this.createFlagIndexes(courseName);
                if (indexResult.success) {
                    appLogger.log(`✅ Created ${indexResult.indexesCreated.length} indexes for course: ${courseName}`);
                } else {
                    appLogger.warn(`⚠️ Some indexes failed to create for course: ${courseName}`, indexResult.errors);
                }
            } catch (indexError) {
                appLogger.error(`❌ Error creating indexes for course ${courseName}:`, indexError);
                // Don't fail course creation if index creation fails
            }
        
        } catch (error) {
            appLogger.error('Error creating collections and schemas:', error);
            // Re-throw the error so callers know it failed
            throw error;
        }
    }

    /**
     * getActiveCourse
     *
     * @param id string — Course ID
     * @returns Promise<activeCourse | null> — Course document or null if not found
     * Gets course by ID from active-course-list.
     */
    public getActiveCourse = async (id: string) => {
        return await this.getCourseCollection().findOne({ id: id });
    }

    /**
     * getActiveCourseByCode
     *
     * @param courseCode string — 6-character PIN code for course entry
     * @returns Promise<activeCourse | null> — Course document or null if not found
     * Gets course by 6-char course code (used for student course entry).
     */
    public getActiveCourseByCode = async (courseCode: string) => {
        return await this.getCourseCollection().findOne({ courseCode: courseCode });
    }

    /**
     * getCourseByName
     *
     * @param name string — Course name (exact or case-insensitive match)
     * @returns Promise<activeCourse | null> — Course document or null if not found
     * Gets course by name. Tries exact match first, then case-insensitive regex.
     */
    public getCourseByName = async (name: string) => {
        // Try exact match first
        let course = await this.getCourseCollection().findOne({ courseName: name });
        
        // If no exact match, try case-insensitive search
        if (!course) {
            course = await this.getCourseCollection().findOne({ 
                courseName: { $regex: new RegExp(`^${name.replace(/\s+/g, '\\s*')}$`, 'i') }
            });
        }
        
        return course;
    }

    /**
     * getAllActiveCourses
     *
     * @returns Promise<activeCourse[]> — All courses in active-course-list
     * Returns all active courses. Used for course selection and admin views.
     */
    public getAllActiveCourses = async () => {
        return await this.getCourseCollection().find({}).toArray();
    }

    /**
     * updateActiveCourse
     *
     * @param id string — Course ID to update
     * @param updateData Partial<activeCourse> — Fields to update (merged with $set)
     * @returns Promise<activeCourse | null> — Updated course document or null
     * Updates course by ID. Sets updatedAt automatically.
     */
    public updateActiveCourse = async (id: string, updateData: Partial<activeCourse>) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { id: id },
            { $set: { ...updateData, updatedAt: Date.now().toString() } },
            { returnDocument: 'after' }
        );
        return result;
    }

    /**
     * deleteActiveCourse
     *
     * @param course activeCourse — Course to delete (uses course.id)
     * @returns Promise<void> — Resolves when course document is deleted
     * Deletes course from active-course-list. Caller must cascade to per-course collections (users, flags, memory-agent) separately.
     */
    public deleteActiveCourse = async (course: activeCourse) => {
        await this.getCourseCollection().deleteOne({ id: course.id });
    }

    /**
     * removeCourseFromAllUsers
     *
     * @param courseId string — Course ID to remove from all GlobalUsers' coursesEnrolled
     * @returns Promise<number> — Number of users modified in active-users
     * Removes courseId from coursesEnrolled array for all GlobalUsers. Used when deleting a course.
     */
    public removeCourseFromAllUsers = async (courseId: string): Promise<number> => {
        try {
            const activeUsersCollection = this.db.collection('active-users');
            const updateResult = await activeUsersCollection.updateMany(
                { coursesEnrolled: { $in: [courseId] } },
                { $pull: { coursesEnrolled: courseId } } as any
            );
            appLogger.log(`✅ Removed course ${courseId} from ${updateResult.modifiedCount} user(s) in active-users`);
            return updateResult.modifiedCount;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            appLogger.error(`❌ Error removing course from active-users:`, errorMessage);
            throw error;
        }
    }

    /**
     * dropCollection
     *
     * @param collectionName string — Name of the collection to drop
     * @returns Promise<{ success: boolean; error?: string }> — Success status; error message if failed
     * Drops a collection from the database. Returns success if collection does not exist (idempotent).
     */
    public dropCollection = async (collectionName: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const collectionExists = await this.db.listCollections({ name: collectionName }).hasNext();
            
            if (collectionExists) {
                await this.db.dropCollection(collectionName);
                appLogger.log(`✅ Successfully dropped collection: ${collectionName}`);
                return { success: true };
            } else {
                appLogger.log(`⚠️ Collection ${collectionName} does not exist, skipping drop`);
                return { success: true }; // Not an error if collection doesn't exist
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            appLogger.error(`❌ Error dropping collection ${collectionName}:`, errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * addLearningObjective
     *
     * @param courseId string — Course ID
     * @param topicOrWeekId string — Topic/week instance ID
     * @param contentId string — Content item ID
     * @param learningObjective any — Learning objective object (id, LearningObjective, etc.)
     * @returns Promise<activeCourse | null> — Updated course document or null
     * Adds a learning objective to a content item. Uses arrayFilters for nested update.
     */
    public addLearningObjective = async (courseId: string, topicOrWeekId: string, contentId: string, learningObjective: any) => {
        appLogger.log('🎯 [MONGODB] addLearningObjective called with:', { courseId, topicOrWeekId, contentId, learningObjective });
        
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId
            },
            { 
                $push: { 
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': learningObjective
                },
                $set: { updatedAt: Date.now().toString() }
            },
            { 
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        
        appLogger.log('✅ [MONGODB] addLearningObjective result:', result);
        return result;
    }

    /**
     * updateLearningObjective
     *
     * @param courseId string — Course ID
     * @param topicOrWeekId string — Topic/week instance ID
     * @param contentId string — Content item ID
     * @param objectiveId string — Learning objective ID to update
     * @param updateData any — Fields to update (LearningObjective text, etc.)
     * @returns Promise<activeCourse | null> — Updated course document or null
     * Updates a learning objective by ID. Sets updatedAt automatically.
     */
    public updateLearningObjective = async (courseId: string, topicOrWeekId: string, contentId: string, objectiveId: string, updateData: any) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId,
                'topicOrWeekInstances.items.learningObjectives.id': objectiveId
            },
            { 
                $set: { 
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].LearningObjective': updateData.LearningObjective,
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].updatedAt': Date.now().toString(),
                    updatedAt: Date.now().toString()
                }
            },
            { 
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId },
                    { 'objective.id': objectiveId }
                ],
                returnDocument: 'after' 
            }
        );
        return result;
    }

    /**
     * deleteLearningObjective
     *
     * @param courseId string — Course ID
     * @param topicOrWeekId string — Topic/week instance ID
     * @param contentId string — Content item ID
     * @param objectiveId string — Learning objective ID to delete
     * @returns Promise<activeCourse | null> — Updated course document or null
     * Removes a learning objective from a content item using $pull.
     */
    public deleteLearningObjective = async (courseId: string, topicOrWeekId: string, contentId: string, objectiveId: string) => {
        appLogger.log('🗑️ [MONGODB] deleteLearningObjective called with:', { courseId, topicOrWeekId, contentId, objectiveId });
        
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId
            },
            { 
                $pull: { 
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': { id: objectiveId }
                } as any,
                $set: { updatedAt: Date.now().toString() }
            },
            { 
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        
        appLogger.log('✅ [MONGODB] deleteLearningObjective result:', result);
        return result;
    }

    /**
     * getAllLearningObjectives
     *
     * @param courseId string — Course ID
     * @returns Promise<LearningObjectiveForDisplay[]> — All learning objectives with topic/week and item from predecessor (parent hierarchy)
     * Extracts LearningObjective text and attaches topicOrWeekTitle, itemTitle from parent instance and item.
     * Uses MongoDB aggregation pipeline (BSON) to avoid fetching full course document — only returns flattened objectives.
     */
    public getAllLearningObjectives = async (courseId: string): Promise<LearningObjectiveForDisplay[]> => {
        const results = await this.getCourseCollection().aggregate<LearningObjectiveForDisplay>([
            { $match: { id: courseId } },
            { $unwind: '$topicOrWeekInstances' },
            { $unwind: '$topicOrWeekInstances.items' },
            { $unwind: '$topicOrWeekInstances.items.learningObjectives' },
            {
                $project: {
                    _id: 0,
                    LearningObjective: '$topicOrWeekInstances.items.learningObjectives.LearningObjective',
                    topicOrWeekTitle: { $ifNull: ['$topicOrWeekInstances.title', ''] },
                    itemTitle: {
                        $ifNull: [
                            '$topicOrWeekInstances.items.itemTitle',
                            { $ifNull: ['$topicOrWeekInstances.items.title', ''] }
                        ]
                    }
                }
            }
        ]).toArray();

        return results;
    }

    // Flag report methods
    
    // Cache for collection names to avoid repeated database lookups
    private collectionNamesCache: Map<string, {users: string, flags: string, memoryAgent: string}> = new Map();

    /**
     * getCollectionNames
     *
     * @param courseName string — Course name
     * @returns Promise<{ users: string; flags: string; memoryAgent: string }> — Collection names for users, flags, memory-agent
     * Returns collection names from course document or computed fallback ({courseName}_users, etc.). Results are cached.
     */
    public async getCollectionNames(courseName: string): Promise<{users: string, flags: string, memoryAgent: string}> {
        // Check cache first
        if (this.collectionNamesCache.has(courseName)) {
            return this.collectionNamesCache.get(courseName)!;
        }

        try {
            // Fetch course document from active-course-list
            const course = await this.getCourseByName(courseName) as activeCourse | null;
            
            // If course exists and has collections field with all required keys, use stored names
            if (course && course.collections && 
                course.collections.users && 
                course.collections.flags && 
                course.collections.memoryAgent) {
                const collectionNames = {
                    users: course.collections.users,
                    flags: course.collections.flags,
                    memoryAgent: course.collections.memoryAgent
                };
                
                // Cache the result
                this.collectionNamesCache.set(courseName, collectionNames);
                return collectionNames;
            }
        } catch (error) {
            appLogger.warn(`[MONGODB] Warning: Could not fetch course document for ${courseName}, using computed collection names:`, error);
        }

        // Fallback to computed collection names (backward compatibility)
        const computedNames = {
            users: `${courseName}_users`,
            flags: `${courseName}_flags`,
            memoryAgent: `${courseName}_memory-agent`
        };

        // Cache the computed names
        this.collectionNamesCache.set(courseName, computedNames);
        return computedNames;
    }

    /**
     * getFlagsCollection
     *
     * @param courseName string — Course name
     * @returns Promise<Collection> — MongoDB flags collection for the course
     * Returns the flags collection. Private helper. Uses getCollectionNames for collection name.
     */
    private async getFlagsCollection(courseName: string): Promise<Collection> {
        const collections = await this.getCollectionNames(courseName);
        return this.db.collection(collections.flags);
    }

    /**
     * createFlagReport
     *
     * @param flagReport FlagReport — Flag report document (id, courseName, flagType, userId, etc.)
     * @returns Promise<InsertOneResult> — MongoDB insert result
     * Inserts a new flag report into the course's flags collection.
     */
    public createFlagReport = async (flagReport: FlagReport) => {
        //START DEBUG LOG : DEBUG-CODE(001)
        appLogger.log('🏴 Creating flag report:', flagReport.id, 'for course:', flagReport.courseName);
        //END DEBUG LOG : DEBUG-CODE(001)
        
        try {
            const flagsCollection = await this.getFlagsCollection(flagReport.courseName);
            
            const result = await flagsCollection.insertOne(flagReport as any);
            
            //START DEBUG LOG : DEBUG-CODE(009)
            appLogger.log('🏴 Flag report created successfully:', flagReport.id, 'MongoDB ID:', result.insertedId);
            //END DEBUG LOG : DEBUG-CODE(009)
            
            return result;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(010)
            appLogger.log('🏴 Error creating flag report:', flagReport.id, 'Error:', error);
            //END DEBUG LOG : DEBUG-CODE(010)
            
            throw new Error(`Failed to create flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * getAllFlagReports
     *
     * @param courseName string — Course name
     * @returns Promise<FlagReport[]> — All flag reports for the course
     * Returns all flag reports from the course's flags collection.
     */
    public getAllFlagReports = async (courseName: string): Promise<FlagReport[]> => {
        //START DEBUG LOG : DEBUG-CODE(002)
        appLogger.log('🏴 Getting flag reports for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(002)
        
        const flagsCollection = await this.getFlagsCollection(courseName);
        return await flagsCollection.find({}).toArray() as unknown as FlagReport[];
    }

    /**
     * getFlagReport
     *
     * @param courseName string — Course name
     * @param flagId string — Flag report ID
     * @returns Promise<FlagReport | null> — Flag report or null if not found
     * Gets a single flag report by ID.
     */
    public getFlagReport = async (courseName: string, flagId: string): Promise<FlagReport | null> => {
        //START DEBUG LOG : DEBUG-CODE(003)
        appLogger.log('🏴 Getting flag report:', flagId, 'for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(003)
        
        const flagsCollection = await this.getFlagsCollection(courseName);
        return await flagsCollection.findOne({ id: flagId }) as FlagReport | null;
    }

    /**
     * updateFlagReport
     *
     * @param courseName string — Course name
     * @param flagId string — Flag report ID to update
     * @param updateData Partial<FlagReport> — Fields to update (merged with $set)
     * @returns Promise<FlagReport | null> — Updated flag report or null
     * Updates a flag report. Sets updatedAt automatically. Normalizes response to empty string if undefined.
     */
    public updateFlagReport = async (courseName: string, flagId: string, updateData: Partial<FlagReport>) => {
        //START DEBUG LOG : DEBUG-CODE(004)
        appLogger.log('🏴 Updating flag report:', flagId, 'for course:', courseName, 'with data:', updateData);
        //END DEBUG LOG : DEBUG-CODE(004)
        
        try {
            const flagsCollection = await this.getFlagsCollection(courseName);
            
            // Add updatedAt timestamp
            const updateWithTimestamp = {
                ...updateData,
                updatedAt: new Date()
            };

            // If response is undefined/null, set it to empty string
            if (updateData.response === undefined || updateData.response === null) {
                updateWithTimestamp.response = '';
            }

            //START DEBUG LOG : DEBUG-CODE(011)
            appLogger.log('🏴 About to update with query:', { id: flagId });
            appLogger.log('🏴 About to update with data:', { $set: updateWithTimestamp });
            //END DEBUG LOG : DEBUG-CODE(011)

            const result = await flagsCollection.findOneAndUpdate(
                { id: flagId },
                { $set: updateWithTimestamp },
                { returnDocument: 'after' }
            );

            //START DEBUG LOG : DEBUG-CODE(012)
            appLogger.log('🏴 Update result:', result);
            //END DEBUG LOG : DEBUG-CODE(012)

            return result;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(013)
            appLogger.log('🏴 Error updating flag report:', flagId, 'Error:', error);
            //END DEBUG LOG : DEBUG-CODE(013)
            
            throw new Error(`Failed to update flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * deleteFlagReport
     *
     * @param courseName string — Course name
     * @param flagId string — Flag report ID to delete
     * @returns Promise<DeleteResult> — MongoDB delete result
     * Deletes a single flag report by ID.
     */
    public deleteFlagReport = async (courseName: string, flagId: string) => {
        //START DEBUG LOG : DEBUG-CODE(005)
        appLogger.log('🏴 Deleting flag report:', flagId, 'for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(005)
        
        const flagsCollection = await this.getFlagsCollection(courseName);
        return await flagsCollection.deleteOne({ id: flagId });
    }

    /**
     * deleteAllFlagReports
     *
     * @param courseName string — Course name
     * @returns Promise<DeleteResult> — MongoDB delete result
     * Deletes all flag reports for a course. Used when resetting or cleaning course data.
     */
    public deleteAllFlagReports = async (courseName: string) => {
        //START DEBUG LOG : DEBUG-CODE(006)
        appLogger.log('🏴 Deleting all flag reports for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(006)
        
        const flagsCollection = await this.getFlagsCollection(courseName);
        return await flagsCollection.deleteMany({});
    }

    // =====================================
    // ========= FLAG STATUS MANAGEMENT ====
    // =====================================

    /**
     * validateStatusTransition
     *
     * @param currentStatus string — Current flag status (unresolved | resolved)
     * @param newStatus string — Desired new status
     * @returns { isValid: boolean; error?: string } — Validation result; error message if invalid
     * Validates flag status transition. unresolved → resolved and resolved → unresolved are allowed.
     */
    public validateStatusTransition = (currentStatus: string, newStatus: string): {
        isValid: boolean;
        error?: string;
    } => {
        //START DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION)
        appLogger.log(`[MONGODB] 🔄 Validating status transition: ${currentStatus} -> ${newStatus}`);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION)
        
        // Valid statuses
        const validStatuses = ['unresolved', 'resolved'];
        
        // Check if new status is valid
        if (!validStatuses.includes(newStatus)) {
            return {
                isValid: false,
                error: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`
            };
        }
        
        // Check if current status is valid
        if (!validStatuses.includes(currentStatus)) {
            return {
                isValid: false,
                error: `Invalid current status: ${currentStatus}. Must be one of: ${validStatuses.join(', ')}`
            };
        }
        
        // Status transition rules
        const validTransitions: { [key: string]: string[] } = {
            'unresolved': ['resolved'], // unresolved can only go to resolved
            'resolved': ['unresolved']  // resolved can go back to unresolved (for corrections)
        };
        
        if (!validTransitions[currentStatus].includes(newStatus)) {
            return {
                isValid: false,
                error: `Invalid transition: ${currentStatus} -> ${newStatus}. Valid transitions: ${validTransitions[currentStatus].join(', ')}`
            };
        }
        
        //START DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION-SUCCESS)
        appLogger.log(`[MONGODB] ✅ Status transition validated: ${currentStatus} -> ${newStatus}`);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION-SUCCESS)
        
        return { isValid: true };
    }

    /**
     * updateFlagStatus
     *
     * @param courseName string — Course name
     * @param flagId string — Flag report ID to update
     * @param newStatus string — New status (unresolved | resolved)
     * @param response string — Optional instructor response (for resolved)
     * @param instructorId string — Optional instructor userId for audit
     * @returns Promise<FlagReport | null> — Updated flag report or null
     * Updates flag status with validation. Validates transition via validateStatusTransition.
     */
    public updateFlagStatus = async (
        courseName: string, 
        flagId: string, 
        newStatus: string, 
        response?: string,
        instructorId?: string
    ): Promise<FlagReport | null> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
        appLogger.log(`[MONGODB] 🔄 Updating flag status: ${flagId} to ${newStatus} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
        
        try {
            const flagsCollection = await this.getFlagsCollection(courseName);
            
            // Get current flag to validate transition
            const currentFlag = await flagsCollection.findOne({ id: flagId });
            if (!currentFlag) {
                throw new Error(`Flag not found: ${flagId}`);
            }
            
            // Validate status transition
            const validation = this.validateStatusTransition(currentFlag.status, newStatus);
            if (!validation.isValid) {
                throw new Error(validation.error);
            }
            
            // Prepare update data
            const updateData: any = {
                status: newStatus,
                updatedAt: new Date()
            };
            
            // Add response if provided
            if (response !== undefined) {
                updateData.response = response;
            }
            
            // Add audit information
            if (instructorId) {
                updateData.lastUpdatedBy = instructorId;
                updateData.lastUpdatedAt = new Date();
            }
            
            // Update the flag
            const result = await flagsCollection.findOneAndUpdate(
                { id: flagId },
                { $set: updateData },
                { returnDocument: 'after' }
            );
            
            if (!result) {
                throw new Error(`Failed to update flag: ${flagId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Flag status updated successfully: ${flagId} -> ${newStatus}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-SUCCESS)
            
            return result as unknown as FlagReport;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error updating flag status:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
            throw error;
        }
    }

    /**
     * getFlagStatistics
     *
     * @param courseName string — Course name
     * @returns Promise<{ total, unresolved, resolved, byType, byStatus, recentActivity }> — Flag counts and breakdowns
     * Returns flag statistics: total counts, by type, by status, and recent activity (24h, 7d, 30d).
     */
    public getFlagStatistics = async (courseName: string): Promise<{
        total: number;
        unresolved: number;
        resolved: number;
        byType: { [key: string]: number };
        byStatus: { [key: string]: number };
        recentActivity: {
            last24Hours: number;
            last7Days: number;
            last30Days: number;
        };
    }> => {
        //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS)
        appLogger.log(`[MONGODB] 📊 Getting flag statistics for course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS)
        
        try {
            const flagsCollection = await this.getFlagsCollection(courseName);
            
            // Get all flags
            const allFlags = await flagsCollection.find({}).toArray();
            
            // Basic counts
            const total = allFlags.length;
            const unresolved = allFlags.filter(f => f.status === 'unresolved').length;
            const resolved = allFlags.filter(f => f.status === 'resolved').length;
            
            // Count by type
            const byType: { [key: string]: number } = {};
            allFlags.forEach(flag => {
                byType[flag.flagType] = (byType[flag.flagType] || 0) + 1;
            });
            
            // Count by status
            const byStatus: { [key: string]: number } = {};
            allFlags.forEach(flag => {
                byStatus[flag.status] = (byStatus[flag.status] || 0) + 1;
            });
            
            // Recent activity
            const now = new Date();
            const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const recentActivity = {
                last24Hours: allFlags.filter(f => f.createdAt >= last24Hours).length,
                last7Days: allFlags.filter(f => f.createdAt >= last7Days).length,
                last30Days: allFlags.filter(f => f.createdAt >= last30Days).length
            };
            
            const stats = {
                total,
                unresolved,
                resolved,
                byType,
                byStatus,
                recentActivity
            };
            
            //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-RESULT)
            appLogger.log(`[MONGODB] 📊 Flag statistics retrieved:`, stats);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-RESULT)
            
            return stats;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error getting flag statistics:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
            throw error;
        }
    }

    // =====================================
    // ========= DATABASE VALIDATION =======
    // =====================================

    /**
     * validateFlagCollection
     *
     * @param courseName string — Course name
     * @returns Promise<{ isValid, issues, stats }> — Validation result; issues array; stats (totalFlags, invalidDocuments, etc.)
     * Validates all flag documents in the collection. Returns issues for invalid documents.
     */
    public validateFlagCollection = async (courseName: string): Promise<{
        isValid: boolean;
        issues: string[];
        stats: {
            totalFlags: number;
            unresolvedFlags: number;
            resolvedFlags: number;
            invalidDocuments: number;
        };
    }> => {
        //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS)
        appLogger.log('🔍 [MONGODB] Validating flag collection for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS)
        
        try {
            const flagsCollection = await this.getFlagsCollection(courseName);
            const issues: string[] = [];
            
            // Get all flags for validation
            const allFlags = await flagsCollection.find({}).toArray();
            
            // Validate each flag document
            let invalidDocuments = 0;
            for (const flag of allFlags) {
                const validation = this.validateFlagDocument(flag);
                if (!validation.isValid) {
                    invalidDocuments++;
                    issues.push(`Flag ${flag.id}: ${validation.issues.join(', ')}`);
                }
            }
            
            // Get statistics
            const totalFlags = allFlags.length;
            const unresolvedFlags = allFlags.filter(f => f.status === 'unresolved').length;
            const resolvedFlags = allFlags.filter(f => f.status === 'resolved').length;
            
            const isValid = invalidDocuments === 0;
            
            //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-RESULT)
            appLogger.log('🔍 [MONGODB] Flag collection validation result:', {
                isValid,
                totalFlags,
                unresolvedFlags,
                resolvedFlags,
                invalidDocuments,
                issuesCount: issues.length
            });
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-RESULT)
            
            return {
                isValid,
                issues,
                stats: {
                    totalFlags,
                    unresolvedFlags,
                    resolvedFlags,
                    invalidDocuments
                }
            };
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-ERROR)
            appLogger.error('🔍 [MONGODB] Error validating flag collection:', error);
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-ERROR)
            
            throw new Error(`Flag collection validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * validateFlagDocument
     *
     * @param flagDocument any — Raw flag document from MongoDB
     * @returns { isValid: boolean; issues: string[] } — Validation result; list of validation issues
     * Validates flag document structure (required fields, types, status). Private helper.
     */
    private validateFlagDocument = (flagDocument: any): {
        isValid: boolean;
        issues: string[];
    } => {
        const issues: string[] = [];
        
        // Required fields validation
        const requiredFields = ['id', 'courseName', 'date', 'flagType', 'reportType', 'chatContent', 'userId', 'status', 'createdAt', 'updatedAt'];
        for (const field of requiredFields) {
            if (flagDocument[field] === undefined || flagDocument[field] === null) {
                issues.push(`Missing required field: ${field}`);
            }
        }
        
        // Type validation
        if (flagDocument.id && typeof flagDocument.id !== 'string') {
            issues.push('Field "id" must be a string');
        }
        
        if (flagDocument.userId && typeof flagDocument.userId !== 'number') {
            issues.push('Field "userId" must be a number');
        }
        
        if (flagDocument.status && !['unresolved', 'resolved'].includes(flagDocument.status)) {
            issues.push('Field "status" must be "unresolved" or "resolved"');
        }
        
        if (flagDocument.flagType && !['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other'].includes(flagDocument.flagType)) {
            issues.push('Field "flagType" has invalid value');
        }
        
        // Date validation
        if (flagDocument.date && !(flagDocument.date instanceof Date)) {
            issues.push('Field "date" must be a Date object');
        }
        
        if (flagDocument.createdAt && !(flagDocument.createdAt instanceof Date)) {
            issues.push('Field "createdAt" must be a Date object');
        }
        
        if (flagDocument.updatedAt && !(flagDocument.updatedAt instanceof Date)) {
            issues.push('Field "updatedAt" must be a Date object');
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * createFlagIndexes
     *
     * @param courseName string — Course name
     * @returns Promise<{ success, indexesCreated, errors }> — Index creation result; success if no errors
     * Creates indexes on flags collection: status_createdAt, userId, courseName_status, flagType_status.
     */
    public createFlagIndexes = async (courseName: string): Promise<{
        success: boolean;
        indexesCreated: string[];
        errors: string[];
    }> => {
        //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
        appLogger.log('📊 [MONGODB] Creating indexes for flag collection:', courseName);
        //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
        
        try {
            const flagsCollection = await this.getFlagsCollection(courseName);
            const indexesCreated: string[] = [];
            const errors: string[] = [];
            
            // Define indexes for optimal query performance
            const indexDefinitions = [
                {
                    name: 'status_createdAt',
                    spec: { status: 1, createdAt: -1 } as any,
                    description: 'Primary query index for unresolved flags sorted by newest first'
                },
                {
                    name: 'userId',
                    spec: { userId: 1 } as any,
                    description: 'User lookup index for flags by specific user'
                },
                {
                    name: 'courseName_status',
                    spec: { courseName: 1, status: 1 } as any,
                    description: 'Course-specific flag filtering'
                },
                {
                    name: 'flagType_status',
                    spec: { flagType: 1, status: 1 } as any,
                    description: 'Filter flags by type'
                }
            ];
            
            // Create each index
            for (const indexDef of indexDefinitions) {
                try {
                    await flagsCollection.createIndex(indexDef.spec, { 
                        name: indexDef.name,
                        background: true // Create index in background to avoid blocking
                    });
                    indexesCreated.push(indexDef.name);
                    
                    //START DEBUG LOG : DEBUG-CODE(INDEX-CREATED)
                    appLogger.log('📊 [MONGODB] Created index:', indexDef.name, '-', indexDef.description);
                    //END DEBUG LOG : DEBUG-CODE(INDEX-CREATED)
                } catch (indexError) {
                    const errorMsg = `Failed to create index ${indexDef.name}: ${indexError instanceof Error ? indexError.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    appLogger.error('📊 [MONGODB]', errorMsg);
                }
            }
            
            const success = errors.length === 0;
            
            //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-RESULT)
            appLogger.log('📊 [MONGODB] Index creation result:', {
                success,
                indexesCreated: indexesCreated.length,
                errors: errors.length
            });
            //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-RESULT)
            
            return {
                success,
                indexesCreated,
                errors
            };
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-ERROR)
            appLogger.error('📊 [MONGODB] Error creating indexes:', error);
            //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-ERROR)
            
            throw new Error(`Index creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * addContentItem
     *
     * @param courseId string — Course ID
     * @param topicOrWeekId string — Topic/week instance ID
     * @param contentItem any — Content item to add (TopicOrWeekItem)
     * @returns Promise<{ success: boolean; data?: any; error?: string }> — Success status; content item or error
     * Adds a content item to a topic/week instance. Pushes to items array and updates course.
     */
    public addContentItem = async (courseId: string, topicOrWeekId: string, contentItem: any) => {
        try {
            appLogger.log('📝 Adding content item to course:', courseId, 'topic/week instance:', topicOrWeekId);
            
            const course = await this.getActiveCourse(courseId);
            if (!course) {
                return { success: false, error: 'Course not found' };
            }

            const instance = course.topicOrWeekInstances?.find((d: any) => d.id === topicOrWeekId);
            if (!instance) {
                return { success: false, error: 'Topic/Week instance not found' };
            }

            // Initialize items array if it doesn't exist
            if (!instance.items) {
                instance.items = [];
            }

            // Add the new content item
            instance.items.push(contentItem);

            // Update the course in the database
            const result = await this.updateActiveCourse(courseId, course as Partial<activeCourse>);
            
            if (result && result.ok) {
                return { success: true, data: contentItem };
            } else {
                return { success: false, error: 'Failed to save content item to database' };
            }
        } catch (error) {
            appLogger.error('Error adding content item:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * addAdditionalMaterial
     *
     * @param courseId string — Course ID
     * @param topicOrWeekId string — Topic/week instance ID
     * @param itemId string — Content item ID
     * @param material AdditionalMaterial — Material to add (name, sourceType, text/file, etc.)
     * @returns Promise<any> — Updated course document or null
     * Adds additional material to a content item. Uses arrayFilters for nested $push.
     */
    public addAdditionalMaterial = async (
        courseId: string, 
        topicOrWeekId: string, 
        itemId: string, 
        material: AdditionalMaterial
    ): Promise<any> => {
        try {
            appLogger.log('📄 Adding additional material to course:', courseId, 'topic/week instance:', topicOrWeekId, 'item:', itemId);
            
            const result = await this.getCourseCollection().findOneAndUpdate(
                { 
                    id: courseId,
                    'topicOrWeekInstances.id': topicOrWeekId,
                    'topicOrWeekInstances.items.id': itemId
                },
                { 
                    $push: { 
                        'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': material as any
                    },
                    $set: { updatedAt: Date.now().toString() }
                },
                { 
                    arrayFilters: [
                        { 'instance.id': topicOrWeekId },
                        { 'item.id': itemId }
                    ],
                    returnDocument: 'after' 
                }
            );
            
            appLogger.log('✅ Additional material added successfully');
            return result;
        } catch (error) {
            appLogger.error('Error adding additional material:', error);
            throw error;
        }
    }

    /**
     * clearAllAdditionalMaterials
     *
     * @param courseId string — Course ID
     * @returns Promise<any> — Updated course document or null
     * Clears all additionalMaterials from all content items in the course. Uses $unset with arrayFilters.
     */
    public clearAllAdditionalMaterials = async (courseId: string): Promise<any> => {
        try {
            appLogger.log('🗑️ Clearing all additional materials from course:', courseId);
            
            const result = await this.getCourseCollection().findOneAndUpdate(
                { id: courseId },
                { 
                    $unset: { 
                        'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': 1 
                    },
                    $set: { updatedAt: Date.now().toString() }
                },
                { 
                    arrayFilters: [
                        { 'instance.id': { $exists: true } }, // Match all topic/week instances that have an id
                        { 'item.id': { $exists: true } }     // Match all items that have an id
                    ],
                    returnDocument: 'after' 
                }
            );
            
            appLogger.log('✅ All additional materials cleared successfully');
            return result;
        } catch (error) {
            appLogger.error('Error clearing additional materials:', error);
            throw error;
        }
    }

    /**
     * close
     *
     * @returns Promise<void> — Resolves when MongoDB client is closed
     * Closes the MongoDB connection. Used for graceful shutdown.
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

    // =====================================
    // ========= USER MANAGEMENT ===========
    // =====================================

    /**
     * getUserCollection
     *
     * @param courseName string — Course name
     * @returns Promise<Collection> — MongoDB users collection for the course
     * Returns the users collection. Private helper. Uses getCollectionNames.
     */
    private async getUserCollection(courseName: string): Promise<Collection> {
        const collections = await this.getCollectionNames(courseName);
        return this.db.collection(collections.users);
    }

    /**
     * findUserByUserId
     *
     * @param courseName string — Course name
     * @param userId string — User ID (string format)
     * @returns Promise<{ name, affiliation, userId } | null> — User details or null; PUID never returned (privacy)
     * Finds user in course by userId. Returns name, affiliation, userId only (no PUID).
     */
    public findUserByUserId = async (courseName: string, userId: string): Promise<{
        name: string;
        affiliation: string;
        userId: string;
    } | null> => {
        //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
        appLogger.log(`[MONGODB] 🔍 Finding user with userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const user = await userCollection.findOne({ userId: userId });
            
            if (user) {
                //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                appLogger.log(`[MONGODB] ✅ Found user:`, { name: user.name, userId: user.userId, affiliation: user.affiliation });
                //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                
                return {
                    name: user.name,
                    affiliation: user.affiliation,
                    userId: user.userId
                };
            } else {
                //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                appLogger.log(`[MONGODB] ❌ User with userId ${userId} not found in course ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                
                return null;
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error finding user with userId ${userId}:`, error);
            //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
            throw error;
        }
    }

    /**
     * batchFindUsersByUserIds
     *
     * @param courseName string — Course name
     * @param userIds string[] — Array of userIds to look up
     * @returns Promise<Map<userId, { name, affiliation, userId }>> — Map of userId to user details; PUID never returned
     * Batch lookup users by userIds. Returns name, affiliation, userId only. Used for flag reports with user names.
     */
    public batchFindUsersByUserIds = async (courseName: string, userIds: string[]): Promise<Map<string, {
        name: string;
        affiliation: string;
        userId: string;
    }>> => {
        //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
        appLogger.log(`[MONGODB] 🔍 Batch finding ${userIds.length} users in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const users = await userCollection.find({ userId: { $in: userIds } }).toArray();
            
            const userMap = new Map<string, {
                name: string;
                affiliation: string;
                userId: string;
            }>();
            
            for (const user of users) {
                userMap.set(user.userId, {
                    name: user.name,
                    affiliation: user.affiliation,
                    userId: user.userId
                });
            }
            
            //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
            appLogger.log(`[MONGODB] ✅ Batch lookup found ${userMap.size} out of ${userIds.length} users`);
            //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
            
            return userMap;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error in batch user lookup:`, error);
            //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
            throw error;
        }
    }

    /**
     * getFlagReportsWithUserNames
     *
     * @param courseName string — Course name
     * @returns Promise<Array<FlagReport & { userName?, userAffiliation? }>> — Flag reports with resolved user names
     * Returns all flag reports with userName and userAffiliation resolved via batchFindUsersByUserIds.
     */
    public getFlagReportsWithUserNames = async (courseName: string): Promise<Array<FlagReport & {
        userName?: string;
        userAffiliation?: string;
    }>> => {
        //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
        appLogger.log(`[MONGODB] 🔍 Getting flag reports with user names for course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
        
        try {
            // Get all flag reports
            const flagReports = await this.getAllFlagReports(courseName);
            
            if (flagReports.length === 0) {
                return [];
            }
            
            // Extract unique userIds
            const userIds = [...new Set(flagReports.map(flag => flag.userId))];
            
            // Batch lookup users
            const userMap = await this.batchFindUsersByUserIds(courseName, userIds);
            
            // Combine flag reports with user information
            // NOTE: PUID is not included for privacy
            const flagsWithNames = flagReports.map(flag => {
                const userInfo = userMap.get(flag.userId);
                return {
                    ...flag,
                    userName: userInfo?.name || 'Unknown User',
                    userAffiliation: userInfo?.affiliation || 'Unknown'
                };
            });
            
            //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
            appLogger.log(`[MONGODB] ✅ Retrieved ${flagsWithNames.length} flag reports with user names`);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
            
            return flagsWithNames;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error getting flag reports with user names:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
            throw error;
        }
    }

    /**
     * findStudentByUserId
     *
     * @param courseName string — Course name
     * @param userId string — User ID (string format)
     * @returns Promise<CourseUser | null> — CourseUser document or null if not found
     * Finds CourseUser (student) by userId in course users collection.
     */
    public findStudentByUserId = async (courseName: string, userId: string) => {
        //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID)
        appLogger.log(`[MONGODB] 🔍 Finding student with userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const student = await userCollection.findOne({ userId: userId });
            
            if (student) {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-SUCCESS)
                appLogger.log(`[MONGODB] ✅ Found existing student:`, student);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-SUCCESS)
            } else {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-NOT-FOUND)
                appLogger.log(`[MONGODB] ❌ Student with userId ${userId} not found in course ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-NOT-FOUND)
            }
            
            return student;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error finding student with userId ${userId}:`, error);
            //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-ERROR)
            throw error;
        }
    }

    /**
     * findStudentByPUID
     *
     * @deprecated Use findStudentByUserId instead. Kept for backward compatibility.
     * @param courseName string — Course name
     * @param puid string — PUID of the student
     * @returns Promise<CourseUser | null> — CourseUser document or null if not found
     * Finds CourseUser by PUID. Deprecated; prefer findStudentByUserId (privacy).
     */
    public findStudentByPUID = async (courseName: string, puid: string) => {
        //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
        appLogger.log(`[MONGODB] 🔍 Finding student with PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const student = await userCollection.findOne({ puid: puid });
            
            if (student) {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
                appLogger.log(`[MONGODB] ✅ Found existing student:`, student);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
            } else {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
                appLogger.log(`[MONGODB] ❌ Student with PUID ${puid} not found in course ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
            }
            
            return student;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error finding student with PUID ${puid}:`, error);
            //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
            throw error;
        }
    }

    /**
     * createStudent
     *
     * @param courseName string — Course name
     * @param userData Partial<CourseUser> — User data (name, userId, affiliation, etc.); puid excluded (privacy)
     * @returns Promise<CourseUser> — Created CourseUser document
     * Creates new CourseUser in course. PUID is never stored in course users (privacy).
     */
    public createStudent = async (courseName: string, userData: Partial<CourseUser>): Promise<CourseUser> => {
        //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
        appLogger.log(`[MONGODB] 🚀 Creating new student in course: ${courseName}`, userData);
        //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            // Generate unique ID for the student (using course-specific ID)
            const studentId = this.idGenerator.userID(userData as CourseUser);
            
            // Create student object WITHOUT puid (privacy - only userId is stored)
            const { puid, ...userDataWithoutPuid } = userData as any;
            const newStudent: CourseUser = {
                ...userDataWithoutPuid,
                id: studentId,
                createdAt: new Date(),
                updatedAt: new Date()
            } as CourseUser;
            
            const result = await userCollection.insertOne(newStudent as any);
            
            //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Created new student with ID: ${studentId} (userId: ${newStudent.userId})`);
            //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
            
            return newStudent;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error creating student:`, error);
            //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
            throw error;
        }
    }

    // =====================================
    // ========= CHAT MANAGEMENT ===========
    // =====================================

    /**
     * getUserChats
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @returns Promise<Chat[]> — Array of active chats (excludes soft-deleted)
     * Returns all chats for a user. Filters out chats where isDeleted === true.
     */
    public getUserChats = async (courseName: string, userId: string): Promise<Chat[]> => {
        //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
        appLogger.log(`[MONGODB] 📋 Getting chats for user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const user = await userCollection.findOne({ userId: userId });
            
            if (!user) {
                //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                appLogger.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
                //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                return [];
            }
            
            const allChats = (user as any).chats || [];
            
            // Filter out soft-deleted chats (where isDeleted === true)
            // Chats without isDeleted field are treated as active (backward compatibility)
            const activeChats = allChats.filter((chat: Chat) => !chat.isDeleted);
            
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Found ${activeChats.length} active chats (${allChats.length - activeChats.length} deleted) for user`);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            
            return activeChats;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error getting user chats:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
            throw error;
        }
    }

    /**
     * getUserChatsMetadata
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @returns Promise<any[]> — Chat metadata (id, courseName, itemTitle, isPinned, messageCount, lastMessageTimestamp)
     * Returns chat metadata without full messages. Sorted by most recent first. Excludes soft-deleted.
     */
    public getUserChatsMetadata = async (courseName: string, userId: string): Promise<any[]> => {
        appLogger.log(`[MONGODB] 📊 Getting chat metadata for user userId: ${userId} in course: ${courseName}`);
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            const user = await userCollection.findOne({ userId: userId });
            
            if (!user) {
                appLogger.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
                return [];
            }
            
            const allChats = (user as any).chats || [];
            
            // Filter out soft-deleted chats and transform to metadata
            const activeChatsMetadata = allChats
                .filter((chat: Chat) => !chat.isDeleted)
                .map((chat: Chat) => ({
                    id: chat.id,
                    courseName: chat.courseName,
                    itemTitle: chat.itemTitle,
                    isPinned: chat.isPinned,
                    pinnedMessageId: chat.pinnedMessageId,
                    messageCount: chat.messages ? chat.messages.length : 0,
                    lastMessageTimestamp: chat.messages && chat.messages.length > 0 
                        ? chat.messages[chat.messages.length - 1].timestamp 
                        : 0
                }))
                .sort((a: any, b: any) => b.lastMessageTimestamp - a.lastMessageTimestamp); // Sort by most recent first
            
            appLogger.log(`[MONGODB] ✅ Found ${activeChatsMetadata.length} active chat metadata for user`);
            
            return activeChatsMetadata;
        } catch (error) {
            appLogger.error(`[MONGODB] 🚨 Error getting user chat metadata:`, error);
            throw error;
        }
    }

    /**
     * addChatToUser
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chat Chat — Chat object to add
     * @returns Promise<void> — Resolves when chat is added; throws if user not found
     * Pushes a new chat to the user's chats array.
     */
    public addChatToUser = async (courseName: string, userId: string, chat: Chat): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
        appLogger.log(`[MONGODB] ➕ Adding chat ${chat.id} to user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId },
                { 
                    $push: { chats: chat } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`User not found with userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat added successfully to user`);
            //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error adding chat to user:`, error);
            //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
            throw error;
        }
    }

    /**
     * updateUserChat
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID to update
     * @param chat Chat — Updated chat object (replaces existing)
     * @returns Promise<void> — Resolves when chat is updated; throws if not found
     * Replaces chat in user's chats array by chatId. Uses positional $ operator.
     */
    public updateUserChat = async (courseName: string, userId: string, chatId: string, chat: Chat): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
        appLogger.log(`[MONGODB] 🔄 Updating chat ${chatId} for user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$': chat,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat updated successfully`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error updating user chat:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
            throw error;
        }
    }

    /**
     * addMessageToChat
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID
     * @param message ChatMessage — Message to add (id, sender, text, timestamp, etc.)
     * @returns Promise<void> — Resolves when message is pushed; throws if chat not found
     * Pushes a message to the chat's messages array. Uses positional $ operator.
     */
    public addMessageToChat = async (courseName: string, userId: string, chatId: string, message: ChatMessage): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
        appLogger.log(`[MONGODB] 💬 Adding message to chat ${chatId} for user userId: ${userId}`);
        //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                { 
                    $push: { 'chats.$.messages': message } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Message added to chat successfully`);
            //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error adding message to chat:`, error);
            //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
            throw error;
        }
    }

    /**
     * updateChatTitle
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID to update
     * @param newTitle string — New itemTitle for the chat
     * @returns Promise<void> — Resolves when title is updated; throws if not found
     * Updates chat's itemTitle. Used when user renames a chat.
     */
    public updateChatTitle = async (courseName: string, userId: string, chatId: string, newTitle: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
        appLogger.log(`[MONGODB] 📝 Updating chat title for chat ${chatId} to "${newTitle}" for user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$.itemTitle': newTitle,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat title updated successfully to "${newTitle}"`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error updating chat title:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
            throw error;
        }
    }

    /**
     * updateChatPinStatus
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID to update
     * @param isPinned boolean — Whether chat should be pinned
     * @returns Promise<void> — Resolves when pin status is updated; throws if not found
     * Sets isPinned on chat. Used for pin/unpin in sidebar.
     */
    public updateChatPinStatus = async (courseName: string, userId: string, chatId: string, isPinned: boolean): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN)
        appLogger.log(`[MONGODB] 📌 Updating chat pin status for chat ${chatId} to ${isPinned} for user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN)

        try {
            const userCollection = await this.getUserCollection(courseName);

            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                {
                    $set: {
                        'chats.$.isPinned': isPinned,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
            }

            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat pin status updated successfully to ${isPinned}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error updating chat pin status:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-ERROR)
            throw error;
        }
    }

    /**
     * updateMessageInChat
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID
     * @param messageId string — Message ID to update
     * @param newText string — New text content for the message
     * @returns Promise<void> — Resolves when message is updated; throws if not found
     * Updates a message's text in a chat. Used when dismissing questionUnstruggle ("No, maybe later").
     */
    public updateMessageInChat = async (
        courseName: string,
        userId: string,
        chatId: string,
        messageId: string,
        newText: string
    ): Promise<void> => {
        try {
            const userCollection = await this.getUserCollection(courseName);

            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                {
                    $set: {
                        'chats.$[chat].messages.$[msg].text': newText,
                        updatedAt: new Date()
                    }
                },
                {
                    arrayFilters: [
                        { 'chat.id': chatId },
                        { 'msg.id': messageId }
                    ]
                }
            );

            if (result.matchedCount === 0) {
                throw new Error(`Chat or message not found: chatId=${chatId}, messageId=${messageId}`);
            }
        } catch (error) {
            appLogger.error(`[MONGODB] 🚨 Error updating message in chat:`, error);
            throw error;
        }
    };

    /**
     * markChatAsDeleted
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID to mark as deleted
     * @returns Promise<void> — Resolves when chat is soft-deleted; throws if not found
     * Sets isDeleted: true on chat. Preserves history for audit; hides from getUserChats.
     */
    public markChatAsDeleted = async (courseName: string, userId: string, chatId: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
        appLogger.log(`[MONGODB] 🗑️ Marking chat ${chatId} as deleted for user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$.isDeleted': true,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat ${chatId} marked as deleted successfully`);
            //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error marking chat as deleted:`, error);
            //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
            throw error;
        }
    }

    /**
     * deleteChatFromUser
     *
     * @deprecated Use markChatAsDeleted() instead for soft delete
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param chatId string — Chat ID to remove
     * @returns Promise<void> — Resolves when chat is removed; throws if user not found
     * Hard-deletes chat from user's chats array via $pull. Prefer markChatAsDeleted.
     */
    public deleteChatFromUser = async (courseName: string, userId: string, chatId: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
        appLogger.log(`[MONGODB] 🗑️ Deleting chat ${chatId} from user userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
        
        try {
            const userCollection = await this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { userId: userId },
                { 
                    $pull: { chats: { id: chatId } } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`User not found with userId: ${userId}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
            appLogger.log(`[MONGODB] ✅ Chat deleted successfully from user`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
            appLogger.error(`[MONGODB] 🚨 Error deleting chat from user:`, error);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
            throw error;
        }
    }

    // ===========================================
    // ========= GLOBAL USER MANAGEMENT =========
    // ===========================================

    /**
     * getGlobalUserCollection
     *
     * @returns Collection — MongoDB active-users collection
     * Returns the active-users collection (GlobalUser registry). Private helper.
     */
    private getGlobalUserCollection(): Collection {
        return this.db.collection(EngEAI_MongoDB.activeUsersCollection);
    }

    /**
     * findGlobalUserByPUID
     *
     * @param puid string — PUID (Privacy-focused Unique Identifier)
     * @returns Promise<GlobalUser | null> — GlobalUser or null if not found
     * Finds GlobalUser in active-users by PUID. PUID is only stored in active-users (privacy).
     */
    public findGlobalUserByPUID = async (puid: string): Promise<GlobalUser | null> => {
        const collection = this.getGlobalUserCollection();
        return await collection.findOne({ puid: puid }) as GlobalUser | null;
    }

    /**
     * findGlobalUserByUserId
     *
     * @param userId string — User ID (string format)
     * @returns Promise<GlobalUser | null> — GlobalUser or null if not found
     * Finds GlobalUser by userId. Preferred over findGlobalUserByPUID for API endpoints (avoids PUID).
     */
    public findGlobalUserByUserId = async (userId: string): Promise<GlobalUser | null> => {
        const collection = this.getGlobalUserCollection();
        return await collection.findOne({ userId: userId }) as GlobalUser | null;
    }

    /**
     * createGlobalUser
     *
     * @param userData Partial<GlobalUser> — User data (name, puid, userId, affiliation, status, coursesEnrolled)
     * @returns Promise<GlobalUser> — Created GlobalUser document
     * Creates new GlobalUser in active-users. Sets createdAt and updatedAt.
     */
    public createGlobalUser = async (userData: Partial<GlobalUser>): Promise<GlobalUser> => {
        const collection = this.getGlobalUserCollection();
        
        const newUser: GlobalUser = {
            name: userData.name!,
            puid: userData.puid!,
            userId: userData.userId!,
            coursesEnrolled: userData.coursesEnrolled || [],
            affiliation: userData.affiliation!,
            status: userData.status || 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        await collection.insertOne(newUser as any);
        return newUser;
    }

    /**
     * addCourseToGlobalUser
     *
     * @param puid string — PUID of the GlobalUser
     * @param courseId string — Course ID to add to coursesEnrolled
     * @returns Promise<void> — Resolves when course is added (uses $addToSet for idempotency)
     * Adds courseId to GlobalUser's coursesEnrolled array. Idempotent.
     */
    public addCourseToGlobalUser = async (puid: string, courseId: string): Promise<void> => {
        const collection = this.getGlobalUserCollection();
        
        await collection.updateOne(
            { puid: puid },
            { 
                $addToSet: { coursesEnrolled: courseId },
                $set: { updatedAt: new Date() }
            }
        );
    }

    /**
     * updateGlobalUser
     *
     * @param puid string — PUID of the GlobalUser to update
     * @param updateData Partial<GlobalUser> — Fields to update (merged with $set)
     * @returns Promise<GlobalUser> — Updated GlobalUser document
     * Updates GlobalUser by PUID. Sets updatedAt automatically.
     */
    public updateGlobalUser = async (puid: string, updateData: Partial<GlobalUser>): Promise<GlobalUser> => {
        const collection = this.getGlobalUserCollection();

        const result = await collection.findOneAndUpdate(
            { puid: puid },
            {
                $set: {
                    ...updateData,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        return result as unknown as GlobalUser;
    }

    /**
     * updateGlobalUserAffiliation
     *
     * @param userId string — User ID of the GlobalUser
     * @param affiliation 'student' | 'faculty' — New affiliation
     * @returns Promise<GlobalUser> — Updated GlobalUser document; throws if not found
     * Updates GlobalUser affiliation by userId. Used when reconciling CWL with DB.
     */
    public updateGlobalUserAffiliation = async (userId: string, affiliation: 'student' | 'faculty'): Promise<GlobalUser> => {
        const collection = this.getGlobalUserCollection();

        const result = await collection.findOneAndUpdate(
            { userId: userId },
            {
                $set: {
                    affiliation: affiliation,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new Error(`GlobalUser with userId ${userId} not found`);
        }

        return result as unknown as GlobalUser;
    }

    // ===========================================
    // ========= MEMORY AGENT MANAGEMENT =========
    // ===========================================

    /**
     * getMemoryAgentCollection
     *
     * @param courseName string — Course name
     * @returns Promise<Collection> — MongoDB memory-agent collection for the course
     * Returns the memory-agent collection. Private helper. Uses getCollectionNames.
     */
    private async getMemoryAgentCollection(courseName: string): Promise<Collection> {
        const collections = await this.getCollectionNames(courseName);
        return this.db.collection(collections.memoryAgent);
    }

    /**
     * createMemoryAgentEntry
     *
     * @param courseName string — Course name
     * @param entry MemoryAgentEntry — Memory agent entry (name, userId, role, struggleTopics)
     * @returns Promise<void> — Resolves when entry is created; idempotent on duplicate key
     * Creates new memory agent entry. Treats duplicate key (11000) as success (race condition).
     */
    public createMemoryAgentEntry = async (courseName: string, entry: MemoryAgentEntry): Promise<void> => {
        appLogger.log(`[MONGODB] 🧠 Creating memory agent entry for userId: ${entry.userId} in course: ${courseName}`);
        
        try {
            const memoryAgentCollection = await this.getMemoryAgentCollection(courseName);
            await memoryAgentCollection.insertOne(entry as any);
            
            appLogger.log(`[MONGODB] ✅ Memory agent entry created successfully for userId: ${entry.userId}`);
        } catch (error: any) {
            // Handle duplicate key error (MongoDB error code 11000) - entry already exists
            // This can happen in race conditions, so we treat it as idempotent success
            if (error.code === 11000 || error.code === 11001) {
                appLogger.log(`[MONGODB] ℹ️ Memory agent entry already exists for userId: ${entry.userId} (duplicate key error - treating as success)`);
                return; // Idempotent - entry exists, which is what we want
            }
            
            appLogger.error(`[MONGODB] 🚨 Error creating memory agent entry:`, error);
            throw error;
        }
    }

    /**
     * getMemoryAgentEntry
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @returns Promise<MemoryAgentEntry | null> — Memory agent entry or null if not found
     * Gets memory agent entry (struggle topics) for user. Read-only; does not create.
     */
    public getMemoryAgentEntry = async (courseName: string, userId: string): Promise<MemoryAgentEntry | null> => {
        appLogger.log(`[MONGODB] 🔍 Getting memory agent entry for userId: ${userId} in course: ${courseName}`);
        
        try {
            const memoryAgentCollection = await this.getMemoryAgentCollection(courseName);
            const entry = await memoryAgentCollection.findOne({ userId: userId }) as MemoryAgentEntry | null;
            
            if (entry) {
                appLogger.log(`[MONGODB] ✅ Found memory agent entry for userId: ${userId}`);
            } else {
                appLogger.log(`[MONGODB] ⚠️ Memory agent entry not found for userId: ${userId}`);
            }
            
            return entry;
        } catch (error) {
            appLogger.error(`[MONGODB] 🚨 Error getting memory agent entry:`, error);
            throw error;
        }
    }

    /**
     * updateMemoryAgentStruggleWords
     *
     * @param courseName string — Course name
     * @param userId string — User ID
     * @param struggleTopics string[] — Array of struggle words/topics to set
     * @returns Promise<void> — Resolves when entry is updated or created
     * Updates or creates memory agent entry with struggle topics. Upserts by userId.
     */
    public updateMemoryAgentStruggleWords = async (courseName: string, userId: string, struggleTopics: string[]): Promise<void> => {
        appLogger.log(`[MONGODB] 🔄 Updating struggle words for userId: ${userId} in course: ${courseName}`);
        appLogger.log(`[MONGODB] 📝 New struggle words:`, struggleTopics);
        
        try {
            const memoryAgentCollection = await this.getMemoryAgentCollection(courseName);
            
            const result = await memoryAgentCollection.findOneAndUpdate(
                { userId: userId },
                { 
                    $set: { 
                        struggleTopics: struggleTopics,
                        updatedAt: new Date()
                    }
                },
                { returnDocument: 'after' }
            );
            
            if (!result) {
                throw new Error(`Memory agent entry not found for userId: ${userId}`);
            }
            
            appLogger.log(`[MONGODB] ✅ Struggle words updated successfully for userId: ${userId}`);
        } catch (error) {
            appLogger.error(`[MONGODB] 🚨 Error updating struggle words:`, error);
            throw error;
        }
    }

    /**
     * Map affiliation to role for memory agent
     * @param affiliation - The user's affiliation ('student' or 'faculty')
     * @returns The corresponding role ('Student', 'instructor', or 'TA')
     */
    private mapAffiliationToRole(affiliation: 'student' | 'faculty'): 'instructor' | 'TA' | 'Student' {
        if (affiliation === 'student') {
            return 'Student';
        }
        // For now, map 'faculty' to 'instructor'
        // TODO: Add logic to distinguish between 'instructor' and 'TA' if needed
        return 'instructor';
    }

    /**
     * Initialize memory agent entry for a user when CourseUser is created
     * @param courseName - The name of the course
     * @param userId - The user ID
     * @param name - The user's name
     * @param affiliation - The user's affiliation ('student' or 'faculty')
     */
    public initializeMemoryAgentForUser = async (courseName: string, userId: string, name: string, affiliation: 'student' | 'faculty'): Promise<void> => {
        appLogger.log(`[MONGODB] 🧠 Initializing memory agent for userId: ${userId} in course: ${courseName}`);
        
        try {
            // Check if entry already exists (idempotent check)
            const existingEntry = await this.getMemoryAgentEntry(courseName, userId);
            
            if (existingEntry) {
                appLogger.log(`[MONGODB] ℹ️ Memory agent entry already exists for userId: ${userId}, skipping initialization (idempotent)`);
                return;
            }
            
            // Map affiliation to role
            const role = this.mapAffiliationToRole(affiliation);
            
            // Create new entry with empty struggle words
            const newEntry: MemoryAgentEntry = {
                name: name,
                userId: userId,
                role: role,
                struggleTopics: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // createMemoryAgentEntry handles duplicate key errors gracefully (idempotent)
            await this.createMemoryAgentEntry(courseName, newEntry);
            appLogger.log(`[MONGODB] ✅ Memory agent initialized successfully for userId: ${userId} with role: ${role}`);
        } catch (error) {
            // If error is not a duplicate key error, throw it
            // Duplicate key errors are already handled in createMemoryAgentEntry
            appLogger.error(`[MONGODB] 🚨 Error initializing memory agent:`, error);
            throw error;
        }
    }

    // Initial Assistant Prompt management methods

    /**
     * Get all initial assistant prompts for a course
     * @param courseId - The course ID
     * @returns Array of initial assistant prompts
     */
    public getInitialAssistantPrompts = async (courseId: string): Promise<InitialAssistantPrompt[]> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }
        return (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
    }

    /**
     * Get the selected initial assistant prompt for a course
     * Uses MongoDB query with $elemMatch for O(1) complexity
     * @param courseId - The course ID
     * @returns The selected prompt or null if none selected
     */
    public getSelectedInitialAssistantPrompt = async (courseId: string): Promise<InitialAssistantPrompt | null> => {
        const course = await this.getCourseCollection().findOne(
            { 
                id: courseId,
                'collectionOfInitialAssistantPrompts.isSelected': true
            },
            {
                projection: {
                    'collectionOfInitialAssistantPrompts.$': 1
                }
            }
        );
        
        if (!course) {
            return null;
        }
        
        const courseData = course as unknown as activeCourse;
        const prompts = courseData.collectionOfInitialAssistantPrompts || [];
        
        // MongoDB $ projection returns array with matching element, so we get the first one
        return prompts.length > 0 ? prompts[0] : null;
    }

    /**
     * Create a new initial assistant prompt for a course
     * @param courseId - The course ID
     * @param prompt - The prompt to create
     */
    public createInitialAssistantPrompt = async (courseId: string, prompt: InitialAssistantPrompt): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
        prompts.push(prompt);

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfInitialAssistantPrompts: prompts } }
        );
    }

    /**
     * Update an existing initial assistant prompt
     * @param courseId - The course ID
     * @param promptId - The prompt ID to update
     * @param updates - Partial prompt data to update
     */
    public updateInitialAssistantPrompt = async (courseId: string, promptId: string, updates: Partial<InitialAssistantPrompt>): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
        const promptIndex = prompts.findIndex(p => p.id === promptId);
        
        if (promptIndex === -1) {
            throw new Error(`Prompt with id ${promptId} not found`);
        }

        prompts[promptIndex] = { ...prompts[promptIndex], ...updates };

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfInitialAssistantPrompts: prompts } }
        );
    }

    /**
     * Delete an initial assistant prompt
     * Prevents deletion of the default prompt and auto-selects default if deleted prompt was selected
     * @param courseId - The course ID
     * @param promptId - The prompt ID to delete
     */
    public deleteInitialAssistantPrompt = async (courseId: string, promptId: string): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
        
        // Find the prompt to delete
        const promptToDelete = prompts.find(p => p.id === promptId);
        if (!promptToDelete) {
            throw new Error(`Prompt with id ${promptId} not found`);
        }

        // Prevent deletion of default prompt
        if (promptToDelete.isDefault || promptToDelete.id === DEFAULT_PROMPT_ID) {
            throw new Error('Cannot delete the default system prompt');
        }

        // Check if the prompt being deleted was selected
        const wasSelected = promptToDelete.isSelected;

        // Filter out the deleted prompt
        const filteredPrompts = prompts.filter(p => p.id !== promptId);

        // If the deleted prompt was selected, select the default prompt
        if (wasSelected) {
            const defaultPrompt = filteredPrompts.find(p => p.isDefault || p.id === DEFAULT_PROMPT_ID);
            if (defaultPrompt) {
                // Ensure default exists (will create if missing)
                await this.ensureDefaultPromptExists(courseId, course.courseName);
                // Select the default prompt
                const updatedPrompts = filteredPrompts.map(p => ({
                    ...p,
                    isSelected: (p.isDefault || p.id === DEFAULT_PROMPT_ID) ? true : false
                }));
                await this.getCourseCollection().updateOne(
                    { id: courseId },
                    { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
                );
            } else {
                // No default exists, just remove the deleted prompt
                await this.getCourseCollection().updateOne(
                    { id: courseId },
                    { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } }
                );
            }
        } else {
            // Just remove the deleted prompt
            await this.getCourseCollection().updateOne(
                { id: courseId },
                { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } }
            );
        }
    }

    /**
     * Select an initial assistant prompt as active (atomic update)
     * Sets all prompts to isSelected: false, then sets the target prompt to isSelected: true
     * @param courseId - The course ID
     * @param promptId - The prompt ID to select
     */
    public selectInitialAssistantPrompt = async (courseId: string, promptId: string): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
        const promptIndex = prompts.findIndex(p => p.id === promptId);
        
        if (promptIndex === -1) {
            throw new Error(`Prompt with id ${promptId} not found`);
        }

        // Atomic update: set all to false, then target to true
        const updatedPrompts = prompts.map((p, index) => ({
            ...p,
            isSelected: index === promptIndex
        }));

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
        );
    }

    /**
     * Ensure the default prompt exists for a course
     * Creates it if missing, and selects it if no other prompt is selected
     * @param courseId - The course ID
     * @param courseName - The course name (for logging)
     */
    public ensureDefaultPromptExists = async (courseId: string, courseName?: string): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
        
        // Check if default prompt already exists
        const defaultPrompt = prompts.find(p => p.isDefault || p.id === DEFAULT_PROMPT_ID);
        
        if (!defaultPrompt) {
            // Create default prompt
            const newDefaultPrompt: InitialAssistantPrompt = {
                id: DEFAULT_PROMPT_ID,
                title: 'Default Welcome Message',
                content: INITIAL_ASSISTANT_MESSAGE,
                dateCreated: new Date(),
                isSelected: prompts.length === 0 || !prompts.some(p => p.isSelected), // Select if no other prompt is selected
                isDefault: true
            };

            prompts.push(newDefaultPrompt);

            await this.getCourseCollection().updateOne(
                { id: courseId },
                { $set: { collectionOfInitialAssistantPrompts: prompts } }
            );

            appLogger.log(`✅ Created default prompt for course: ${courseName || courseId}`);
        } else {
            // Default exists, but ensure it's selected if no other prompt is selected
            const hasSelectedPrompt = prompts.some(p => p.isSelected && !p.isDefault && p.id !== DEFAULT_PROMPT_ID);
            
            if (!hasSelectedPrompt && !defaultPrompt.isSelected) {
                // No other prompt is selected, select the default
                const updatedPrompts = prompts.map(p => ({
                    ...p,
                    isSelected: (p.isDefault || p.id === DEFAULT_PROMPT_ID) ? true : false
                }));

                await this.getCourseCollection().updateOne(
                    { id: courseId },
                    { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
                );

                appLogger.log(`✅ Auto-selected default prompt for course: ${courseName || courseId}`);
            }
        }
    }

    // ===========================================
    // ========= SYSTEM PROMPT ITEMS ============
    // ===========================================

    /**
     * Get all system prompt items for a course
     * @param courseId - The course ID
     * @returns Array of system prompt items (both appended and not appended)
     */
    public getSystemPromptItems = async (courseId: string): Promise<SystemPromptItem[]> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }
        return (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
    }

    /**
     * Get the base system prompt item for a course
     * @param courseId - The course ID
     * @returns The base system prompt item or null if not found
     */
    public getBaseSystemPrompt = async (courseId: string): Promise<SystemPromptItem | null> => {
        const items = await this.getSystemPromptItems(courseId);
        return items.find(item => item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID) || null;
    }

    /**
     * Get only appended custom system prompt items (for use in getSystemPrompt)
     * @param courseId - The course ID
     * @returns Array of appended custom system prompt items
     */
    public getAppendedSystemPromptItems = async (courseId: string): Promise<SystemPromptItem[]> => {
        const items = await this.getSystemPromptItems(courseId);
        return items.filter(item => item.isAppended && item.componentType === 'custom');
    }

    /**
     * Create a new system prompt item for a course
     * @param courseId - The course ID
     * @param item - The system prompt item to create
     */
    public createSystemPromptItem = async (courseId: string, item: SystemPromptItem): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
        items.push(item);

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfSystemPromptItems: items } }
        );
    }

    /**
     * Update an existing system prompt item
     * @param courseId - The course ID
     * @param itemId - The item ID to update
     * @param updates - Partial item data to update
     */
    public updateSystemPromptItem = async (courseId: string, itemId: string, updates: Partial<SystemPromptItem>): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
        const itemIndex = items.findIndex(item => item.id === itemId);
        
        if (itemIndex === -1) {
            throw new Error(`System prompt item with id ${itemId} not found`);
        }

        const itemToUpdate = items[itemIndex];
        const isBaseComponent = itemToUpdate.componentType === 'base' || itemToUpdate.id === DEFAULT_BASE_PROMPT_ID;
        if (isBaseComponent && (updates.title !== undefined || updates.content !== undefined)) {
            throw new Error('Cannot edit the default base system prompt component');
        }

        items[itemIndex] = { ...items[itemIndex], ...updates };

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfSystemPromptItems: items } }
        );
    }

    /**
     * Delete a system prompt item
     * Prevents deletion of default components (base, learning objectives, struggle topics)
     * @param courseId - The course ID
     * @param itemId - The item ID to delete
     */
    public deleteSystemPromptItem = async (courseId: string, itemId: string): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
        
        // Find the item to delete
        const itemToDelete = items.find(item => item.id === itemId);
        if (!itemToDelete) {
            throw new Error(`System prompt item with id ${itemId} not found`);
        }

        // Prevent deletion of default components
        if (itemToDelete.componentType && ['base', 'learning-objectives', 'struggle-topics'].includes(itemToDelete.componentType)) {
            throw new Error(`Cannot delete the default ${itemToDelete.componentType} component`);
        }

        // Filter out the deleted item
        const filteredItems = items.filter(item => item.id !== itemId);

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfSystemPromptItems: filteredItems } }
        );
    }

    /**
     * Toggle append status of a system prompt item
     * @param courseId - The course ID
     * @param itemId - The item ID to toggle
     * @param append - Whether to append (true) or remove (false)
     */
    public toggleSystemPromptItemAppend = async (courseId: string, itemId: string, append: boolean): Promise<void> => {
        await this.updateSystemPromptItem(courseId, itemId, { isAppended: append });
    }

    /**
     * Save multiple append status changes at once
     * @param courseId - The course ID
     * @param changes - Array of changes with itemId and append status
     */
    public saveSystemPromptAppendChanges = async (courseId: string, changes: Array<{ itemId: string; append: boolean }>): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
        
        // Create a map of changes for quick lookup
        const changesMap = new Map(changes.map(change => [change.itemId, change.append]));

        // Update items with new append status
        const updatedItems = items.map(item => {
            if (changesMap.has(item.id)) {
                return { ...item, isAppended: changesMap.get(item.id)! };
            }
            return item;
        });

        await this.getCourseCollection().updateOne(
            { id: courseId },
            { $set: { collectionOfSystemPromptItems: updatedItems } }
        );
    }

    /**
     * Ensure the three default system prompt components exist for a course
     * Creates them if missing
     * @param courseId - The course ID
     * @param courseName - The course name (for logging)
     */
    public ensureDefaultSystemPromptComponents = async (courseId: string, courseName?: string): Promise<void> => {
        const course = await this.getActiveCourse(courseId);
        if (!course) {
            throw new Error(`Course with id ${courseId} not found`);
        }

        const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
        const existingIds = new Set(items.map(item => item.id));
        const dateCreated = new Date();

        // Ensure base system prompt exists
        if (!existingIds.has(DEFAULT_BASE_PROMPT_ID)) {
            const basePrompt: SystemPromptItem = {
                id: DEFAULT_BASE_PROMPT_ID,
                title: 'Base System Prompt',
                content: SYSTEM_PROMPT,
                dateCreated: dateCreated,
                isAppended: true, // Always included
                isDefault: true,
                componentType: 'base'
            };
            items.push(basePrompt);
            appLogger.log(`✅ Created default base system prompt for course: ${courseName || courseId}`);
        }

        // Ensure learning objectives component exists
        if (!existingIds.has(DEFAULT_LEARNING_OBJECTIVES_ID)) {
            const learningObjectives: SystemPromptItem = {
                id: DEFAULT_LEARNING_OBJECTIVES_ID,
                title: 'Learning Objectives',
                content: '<learningobjectives></learningobjectives>', // Placeholder for regex replacement
                dateCreated: dateCreated,
                isAppended: true, // Always included
                isDefault: true,
                componentType: 'learning-objectives'
            };
            items.push(learningObjectives);
            appLogger.log(`✅ Created default learning objectives component for course: ${courseName || courseId}`);
        }

        // Ensure struggle topics component exists
        if (!existingIds.has(DEFAULT_STRUGGLE_TOPICS_ID)) {
            const struggleTopics: SystemPromptItem = {
                id: DEFAULT_STRUGGLE_TOPICS_ID,
                title: 'Struggle Topics',
                content: '<strugglewords></strugglewords>', // Placeholder for regex replacement
                dateCreated: dateCreated,
                isAppended: true, // Always included
                isDefault: true,
                componentType: 'struggle-topics'
            };
            items.push(struggleTopics);
            appLogger.log(`✅ Created default struggle topics component for course: ${courseName || courseId}`);
        }

        // Update database if any items were added
        const courseData = course as unknown as activeCourse;
        const existingItems = courseData.collectionOfSystemPromptItems || [];
        if (items.length > existingItems.length) {
            await this.getCourseCollection().updateOne(
                { id: courseId },
                { $set: { collectionOfSystemPromptItems: items } }
            );
        }
    }
}
