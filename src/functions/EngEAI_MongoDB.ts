import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { activeCourse, AdditionalMaterial, ContentDivision, courseItem, FlagReport, User, Chat, ChatMessage, GlobalUser, CourseUser } from './types';
import { IDGenerator } from './unique-id-generator';

dotenv.config();

export class EngEAI_MongoDB {
    private static instance: EngEAI_MongoDB;
    private static activeCourseListDatabase: string = 'TLEF-ENGEAI-DB';
    private static activeCourseListCollection: string = 'active-course-list';
    private static activeUsersCollection: string = 'active-users';
    private static MONGO_URL = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017`;
    
    private client: MongoClient;
    public db!: Db;
    public idGenerator: IDGenerator;

    private constructor() {
        this.idGenerator = IDGenerator.getInstance();
        this.client = new MongoClient(EngEAI_MongoDB.MONGO_URL, {
            authSource: 'admin',
        });
    }

    public static async getInstance(): Promise<EngEAI_MongoDB> {
        if (!EngEAI_MongoDB.instance) {
            EngEAI_MongoDB.instance = new EngEAI_MongoDB();
            
            // Connect to MongoDB
            try {
                await EngEAI_MongoDB.instance.client.connect();
                EngEAI_MongoDB.instance.db = EngEAI_MongoDB.instance.client.db(EngEAI_MongoDB.activeCourseListDatabase);
                console.log('✅ MongoDB connected successfully');
            } catch (error) {
                console.error('❌ Failed to connect to MongoDB:', error);
                throw new Error(`MongoDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return EngEAI_MongoDB.instance;
    }

    /**
     * Get the active course list collection
     */
    private getCourseCollection(): Collection {
        return this.db.collection(EngEAI_MongoDB.activeCourseListCollection);
    }

    public async testConnection(): Promise<boolean> {
        try {
            await this.db.admin().ping();
            return true;
        } catch (error) {
            console.error('❌ MongoDB connection test failed:', error);
            return false;
        }
    }

    // Course management methods
    public postActiveCourse = async (course: activeCourse) => {
        try {
            await this.getCourseCollection().insertOne(course as any);

            //use singleton's DB
            const courseName = course.courseName;

            //create users collection
            const userCollection = `${courseName}_users`;
            await this.db.createCollection(userCollection);
    
            //create flags collection
            const flagsCollection = `${courseName}_flags`;
            await this.db.createCollection(flagsCollection);

            // Create indexes for optimal performance
            try {
                const indexResult = await this.createFlagIndexes(courseName);
                if (indexResult.success) {
                    console.log(`✅ Created ${indexResult.indexesCreated.length} indexes for course: ${courseName}`);
                } else {
                    console.warn(`⚠️ Some indexes failed to create for course: ${courseName}`, indexResult.errors);
                }
            } catch (indexError) {
                console.error(`❌ Error creating indexes for course ${courseName}:`, indexError);
                // Don't fail course creation if index creation fails
            }
        
        } catch (error) {
            console.error('Error creating collections and schemas:', error);
        }
    }

    public getActiveCourse = async (id: string) => {
        return await this.getCourseCollection().findOne({ id: id });
    }

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

    public getAllActiveCourses = async () => {
        return await this.getCourseCollection().find({}).toArray();
    }

    public updateActiveCourse = async (id: string, updateData: Partial<activeCourse>) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { id: id },
            { $set: { ...updateData, updatedAt: Date.now().toString() } },
            { returnDocument: 'after' }
        );
        return result;
    }

    public deleteActiveCourse = async (course: activeCourse) => {
        await this.getCourseCollection().deleteOne({ id: course.id });
    }

    // Learning objectives methods
    public addLearningObjective = async (courseId: string, divisionId: string, contentId: string, learningObjective: any) => {
        console.log('🎯 [MONGODB] addLearningObjective called with:', { courseId, divisionId, contentId, learningObjective });
        
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId
            },
            { 
                $push: { 
                    'divisions.$[division].items.$[item].learningObjectives': learningObjective
                },
                $set: { updatedAt: Date.now().toString() }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        
        console.log('✅ [MONGODB] addLearningObjective result:', result);
        return result;
    }

    public updateLearningObjective = async (courseId: string, divisionId: string, contentId: string, objectiveId: string, updateData: any) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId,
                'divisions.items.learningObjectives.id': objectiveId
            },
            { 
                $set: { 
                    'divisions.$[division].items.$[item].learningObjectives.$[objective].LearningObjective': updateData.LearningObjective,
                    'divisions.$[division].items.$[item].learningObjectives.$[objective].updatedAt': Date.now().toString(),
                    updatedAt: Date.now().toString()
                }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId },
                    { 'objective.id': objectiveId }
                ],
                returnDocument: 'after' 
            }
        );
        return result;
    }

    public deleteLearningObjective = async (courseId: string, divisionId: string, contentId: string, objectiveId: string) => {
        console.log('🗑️ [MONGODB] deleteLearningObjective called with:', { courseId, divisionId, contentId, objectiveId });
        
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId
            },
            { 
                $pull: { 
                    'divisions.$[division].items.$[item].learningObjectives': { id: objectiveId }
                } as any,
                $set: { updatedAt: Date.now().toString() }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        
        console.log('✅ [MONGODB] deleteLearningObjective result:', result);
        return result;
    }

    // Flag report methods
    /**
     * Get the flags collection for a specific course
     * @param courseName - the name of the course
     * @returns the flags collection
     */
    private getFlagsCollection = (courseName: string): Collection => {
        const flagsCollectionName = `${courseName}_flags`;
        return this.db.collection(flagsCollectionName);
    }

    public createFlagReport = async (flagReport: FlagReport) => {
        //START DEBUG LOG : DEBUG-CODE(001)
        console.log('🏴 Creating flag report:', flagReport.id, 'for course:', flagReport.courseName);
        //END DEBUG LOG : DEBUG-CODE(001)
        
        try {
            const flagsCollection = this.getFlagsCollection(flagReport.courseName);
            
            const result = await flagsCollection.insertOne(flagReport as any);
            
            //START DEBUG LOG : DEBUG-CODE(009)
            console.log('🏴 Flag report created successfully:', flagReport.id, 'MongoDB ID:', result.insertedId);
            //END DEBUG LOG : DEBUG-CODE(009)
            
            return result;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(010)
            console.error('🏴 Error creating flag report:', flagReport.id, 'Error:', error);
            //END DEBUG LOG : DEBUG-CODE(010)
            
            throw new Error(`Failed to create flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public getFlagReports = async (courseName: string): Promise<FlagReport[]> => {
        //START DEBUG LOG : DEBUG-CODE(002)
        console.log('🏴 Getting flag reports for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(002)
        
        const flagsCollection = this.getFlagsCollection(courseName);
        return await flagsCollection.find({}).toArray() as unknown as FlagReport[];
    }

    public getFlagReport = async (courseName: string, flagId: string): Promise<FlagReport | null> => {
        //START DEBUG LOG : DEBUG-CODE(003)
        console.log('🏴 Getting flag report:', flagId, 'for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(003)
        
        const flagsCollection = this.getFlagsCollection(courseName);
        return await flagsCollection.findOne({ id: flagId }) as FlagReport | null;
    }

    public updateFlagReport = async (courseName: string, flagId: string, updateData: Partial<FlagReport>) => {
        //START DEBUG LOG : DEBUG-CODE(004)
        console.log('🏴 Updating flag report:', flagId, 'for course:', courseName, 'with data:', updateData);
        //END DEBUG LOG : DEBUG-CODE(004)
        
        try {
            const flagsCollection = this.getFlagsCollection(courseName);
            
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
            console.log('🏴 About to update with query:', { id: flagId });
            console.log('🏴 About to update with data:', { $set: updateWithTimestamp });
            //END DEBUG LOG : DEBUG-CODE(011)

            const result = await flagsCollection.findOneAndUpdate(
                { id: flagId },
                { $set: updateWithTimestamp },
                { returnDocument: 'after' }
            );

            //START DEBUG LOG : DEBUG-CODE(012)
            console.log('🏴 Update result:', result);
            //END DEBUG LOG : DEBUG-CODE(012)

            return result;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(013)
            console.error('🏴 Error updating flag report:', flagId, 'Error:', error);
            //END DEBUG LOG : DEBUG-CODE(013)
            
            throw new Error(`Failed to update flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public deleteFlagReport = async (courseName: string, flagId: string) => {
        //START DEBUG LOG : DEBUG-CODE(005)
        console.log('🏴 Deleting flag report:', flagId, 'for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(005)
        
        const flagsCollection = this.getFlagsCollection(courseName);
        return await flagsCollection.deleteOne({ id: flagId });
    }

    // =====================================
    // ========= FLAG STATUS MANAGEMENT ====
    // =====================================

    /**
     * Validates flag status transition
     * @param currentStatus - Current status of the flag
     * @param newStatus - Desired new status
     * @returns Validation result
     */
    public validateStatusTransition = (currentStatus: string, newStatus: string): {
        isValid: boolean;
        error?: string;
    } => {
        //START DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION)
        console.log(`[MONGODB] 🔄 Validating status transition: ${currentStatus} -> ${newStatus}`);
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
        console.log(`[MONGODB] ✅ Status transition validated: ${currentStatus} -> ${newStatus}`);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION-SUCCESS)
        
        return { isValid: true };
    }

    /**
     * Updates flag status with validation and audit trail
     * @param courseName - The name of the course
     * @param flagId - The ID of the flag to update
     * @param newStatus - The new status
     * @param response - Optional instructor response
     * @param instructorId - ID of the instructor making the change
     * @returns Updated flag report
     */
    public updateFlagStatus = async (
        courseName: string, 
        flagId: string, 
        newStatus: string, 
        response?: string,
        instructorId?: string
    ): Promise<FlagReport | null> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
        console.log(`[MONGODB] 🔄 Updating flag status: ${flagId} to ${newStatus} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
        
        try {
            const flagsCollection = this.getFlagsCollection(courseName);
            
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
            console.log(`[MONGODB] ✅ Flag status updated successfully: ${flagId} -> ${newStatus}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-SUCCESS)
            
            return result as unknown as FlagReport;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
            console.error(`[MONGODB] 🚨 Error updating flag status:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
            throw error;
        }
    }

    /**
     * Gets flag statistics for a course
     * @param courseName - The name of the course
     * @returns Flag statistics
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
        console.log(`[MONGODB] 📊 Getting flag statistics for course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS)
        
        try {
            const flagsCollection = this.getFlagsCollection(courseName);
            
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
            console.log(`[MONGODB] 📊 Flag statistics retrieved:`, stats);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-RESULT)
            
            return stats;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
            console.error(`[MONGODB] 🚨 Error getting flag statistics:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
            throw error;
        }
    }

    // =====================================
    // ========= DATABASE VALIDATION =======
    // =====================================

    /**
     * Validates flag collection structure and integrity
     * @param courseName - The name of the course
     * @returns Validation result with details
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
        console.log('🔍 [MONGODB] Validating flag collection for course:', courseName);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS)
        
        try {
            const flagsCollection = this.getFlagsCollection(courseName);
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
            console.log('🔍 [MONGODB] Flag collection validation result:', {
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
            console.error('🔍 [MONGODB] Error validating flag collection:', error);
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-ERROR)
            
            throw new Error(`Flag collection validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validates a single flag document structure
     * @param flagDocument - The flag document to validate
     * @returns Validation result
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
     * Creates database indexes for optimal flag query performance
     * @param courseName - The name of the course
     * @returns Promise with index creation results
     */
    public createFlagIndexes = async (courseName: string): Promise<{
        success: boolean;
        indexesCreated: string[];
        errors: string[];
    }> => {
        //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
        console.log('📊 [MONGODB] Creating indexes for flag collection:', courseName);
        //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
        
        try {
            const flagsCollection = this.getFlagsCollection(courseName);
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
                    console.log('📊 [MONGODB] Created index:', indexDef.name, '-', indexDef.description);
                    //END DEBUG LOG : DEBUG-CODE(INDEX-CREATED)
                } catch (indexError) {
                    const errorMsg = `Failed to create index ${indexDef.name}: ${indexError instanceof Error ? indexError.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error('📊 [MONGODB]', errorMsg);
                }
            }
            
            const success = errors.length === 0;
            
            //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-RESULT)
            console.log('📊 [MONGODB] Index creation result:', {
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
            console.error('📊 [MONGODB] Error creating indexes:', error);
            //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-ERROR)
            
            throw new Error(`Index creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public addContentItem = async (courseId: string, divisionId: string, contentItem: any) => {
        try {
            console.log('📝 Adding content item to course:', courseId, 'division:', divisionId);
            
            const course = await this.getActiveCourse(courseId);
            if (!course) {
                return { success: false, error: 'Course not found' };
            }

            const division = course.divisions?.find((d: any) => d.id === divisionId);
            if (!division) {
                return { success: false, error: 'Division not found' };
            }

            // Initialize items array if it doesn't exist
            if (!division.items) {
                division.items = [];
            }

            // Add the new content item
            division.items.push(contentItem);

            // Update the course in the database
            const result = await this.updateActiveCourse(courseId, course as Partial<activeCourse>);
            
            if (result && result.ok) {
                return { success: true, data: contentItem };
            } else {
                return { success: false, error: 'Failed to save content item to database' };
            }
        } catch (error) {
            console.error('Error adding content item:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    public async close(): Promise<void> {
        try {
            await this.client.close();
            console.log('✅ MongoDB connection closed');
        } catch (error) {
            console.error('❌ Error closing MongoDB connection:', error);
            throw error;
        }
    }

    // =====================================
    // ========= USER MANAGEMENT ===========
    // =====================================

    /**
     * Get the user collection for a specific course
     * @param courseName - The name of the course (e.g., "APSC 099")
     * @returns Collection instance for the course users
     */
    private getUserCollection(courseName: string): Collection {
        const collectionName = `${courseName}_users`;
        return this.db.collection(collectionName);
    }

    /**
     * Find a user by userId in a specific course and return user details
     * @param courseName - The name of the course
     * @param userId - The userId to look up
     * @returns User object with name, puid, and affiliation if found, null otherwise
     */
    public findUserByUserId = async (courseName: string, userId: number): Promise<{
        name: string;
        puid: string;
        affiliation: string;
        userId: number;
    } | null> => {
        //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
        console.log(`[MONGODB] 🔍 Finding user with userId: ${userId} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            const user = await userCollection.findOne({ userId: userId });
            
            if (user) {
                //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                console.log(`[MONGODB] ✅ Found user:`, { name: user.name, puid: user.puid, affiliation: user.affiliation });
                //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                
                return {
                    name: user.name,
                    puid: user.puid,
                    affiliation: user.affiliation,
                    userId: user.userId
                };
            } else {
                //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                console.log(`[MONGODB] ❌ User with userId ${userId} not found in course ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                
                return null;
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
            console.error(`[MONGODB] 🚨 Error finding user with userId ${userId}:`, error);
            //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
            throw error;
        }
    }

    /**
     * Batch lookup multiple users by their userIds
     * @param courseName - The name of the course
     * @param userIds - Array of userIds to look up
     * @returns Map of userId to user details
     */
    public batchFindUsersByUserIds = async (courseName: string, userIds: number[]): Promise<Map<number, {
        name: string;
        puid: string;
        affiliation: string;
        userId: number;
    }>> => {
        //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
        console.log(`[MONGODB] 🔍 Batch finding ${userIds.length} users in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            const users = await userCollection.find({ userId: { $in: userIds } }).toArray();
            
            const userMap = new Map<number, {
                name: string;
                puid: string;
                affiliation: string;
                userId: number;
            }>();
            
            for (const user of users) {
                userMap.set(user.userId, {
                    name: user.name,
                    puid: user.puid,
                    affiliation: user.affiliation,
                    userId: user.userId
                });
            }
            
            //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
            console.log(`[MONGODB] ✅ Batch lookup found ${userMap.size} out of ${userIds.length} users`);
            //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
            
            return userMap;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
            console.error(`[MONGODB] 🚨 Error in batch user lookup:`, error);
            //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
            throw error;
        }
    }

    /**
     * Get flag reports with resolved user names
     * @param courseName - The name of the course
     * @returns Array of flag reports with user names resolved
     */
    public getFlagReportsWithUserNames = async (courseName: string): Promise<Array<FlagReport & {
        userName?: string;
        userPuid?: string;
        userAffiliation?: string;
    }>> => {
        //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
        console.log(`[MONGODB] 🔍 Getting flag reports with user names for course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
        
        try {
            // Get all flag reports
            const flagReports = await this.getFlagReports(courseName);
            
            if (flagReports.length === 0) {
                return [];
            }
            
            // Extract unique userIds
            const userIds = [...new Set(flagReports.map(flag => flag.userId))];
            
            // Batch lookup users
            const userMap = await this.batchFindUsersByUserIds(courseName, userIds);
            
            // Combine flag reports with user information
            const flagsWithNames = flagReports.map(flag => {
                const userInfo = userMap.get(flag.userId);
                return {
                    ...flag,
                    userName: userInfo?.name || 'Unknown User',
                    userPuid: userInfo?.puid || 'Unknown PUID',
                    userAffiliation: userInfo?.affiliation || 'Unknown'
                };
            });
            
            //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
            console.log(`[MONGODB] ✅ Retrieved ${flagsWithNames.length} flag reports with user names`);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
            
            return flagsWithNames;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
            console.error(`[MONGODB] 🚨 Error getting flag reports with user names:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
            throw error;
        }
    }

    /**
     * Find a student by PUID in a specific course
     * @param courseName - The name of the course (e.g., "APSC 099")
     * @param puid - The PUID of the student
     * @returns User object if found, null otherwise
     */
    public findStudentByPUID = async (courseName: string, puid: string) => {
        //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
        console.log(`[MONGODB] 🔍 Finding student with PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            const student = await userCollection.findOne({ puid: puid });
            
            if (student) {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
                console.log(`[MONGODB] ✅ Found existing student:`, student);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
            } else {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
                console.log(`[MONGODB] ❌ Student with PUID ${puid} not found in course ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
            }
            
            return student;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
            console.error(`[MONGODB] 🚨 Error finding student with PUID ${puid}:`, error);
            //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
            throw error;
        }
    }

    /**
     * Create a new student in a specific course
     * @param courseName - The name of the course (e.g., "APSC 099")
     * @param userData - The user data to create
     * @returns Created user object
     */
    public createStudent = async (courseName: string, userData: Partial<User>): Promise<User> => {
        //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
        console.log(`[MONGODB] 🚀 Creating new student in course: ${courseName}`, userData);
        //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            // Generate unique ID for the student
            const studentId = this.idGenerator.userID(userData as User);
            
            const newStudent: User = {
                ...userData,
                id: studentId,
                createdAt: new Date(),
                updatedAt: new Date()
            } as User;
            
            const result = await userCollection.insertOne(newStudent as any);
            
            //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
            console.log(`[MONGODB] ✅ Created new student with ID: ${studentId}`, result);
            //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
            
            return newStudent;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
            console.error(`[MONGODB] 🚨 Error creating student:`, error);
            //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
            throw error;
        }
    }

    // =====================================
    // ========= CHAT MANAGEMENT ===========
    // =====================================

    /**
     * Get all chats for a specific user by PUID
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @returns Array of Chat objects (excluding soft-deleted chats)
     */
    public getUserChats = async (courseName: string, puid: string): Promise<Chat[]> => {
        //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
        console.log(`[MONGODB] 📋 Getting chats for user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            const user = await userCollection.findOne({ puid: puid });
            
            if (!user) {
                //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                console.log(`[MONGODB] ⚠️ User not found with PUID: ${puid}`);
                //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                return [];
            }
            
            const allChats = (user as any).chats || [];
            
            // Filter out soft-deleted chats (where isDeleted === true)
            // Chats without isDeleted field are treated as active (backward compatibility)
            const activeChats = allChats.filter((chat: Chat) => !chat.isDeleted);
            
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            console.log(`[MONGODB] ✅ Found ${activeChats.length} active chats (${allChats.length - activeChats.length} deleted) for user`);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            
            return activeChats;
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
            console.error(`[MONGODB] 🚨 Error getting user chats:`, error);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
            throw error;
        }
    }

    /**
     * Add a new chat to a user's chats array
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chat - The chat object to add
     */
    public addChatToUser = async (courseName: string, puid: string, chat: Chat): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
        console.log(`[MONGODB] ➕ Adding chat ${chat.id} to user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid },
                { 
                    $push: { chats: chat } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`User not found with PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
            console.log(`[MONGODB] ✅ Chat added successfully to user`);
            //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
            console.error(`[MONGODB] 🚨 Error adding chat to user:`, error);
            //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
            throw error;
        }
    }

    /**
     * Update an existing chat in user's chats array
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chatId - The ID of the chat to update
     * @param chat - The updated chat object
     */
    public updateUserChat = async (courseName: string, puid: string, chatId: string, chat: Chat): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
        console.log(`[MONGODB] 🔄 Updating chat ${chatId} for user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$': chat,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
            console.log(`[MONGODB] ✅ Chat updated successfully`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
            console.error(`[MONGODB] 🚨 Error updating user chat:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
            throw error;
        }
    }

    /**
     * Add a message to a specific chat in user's chats array
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chatId - The ID of the chat
     * @param message - The message to add
     */
    public addMessageToChat = async (courseName: string, puid: string, chatId: string, message: ChatMessage): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
        console.log(`[MONGODB] 💬 Adding message to chat ${chatId} for user PUID: ${puid}`);
        //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid, 'chats.id': chatId },
                { 
                    $push: { 'chats.$.messages': message } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
            console.log(`[MONGODB] ✅ Message added to chat successfully`);
            //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
            console.error(`[MONGODB] 🚨 Error adding message to chat:`, error);
            //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
            throw error;
        }
    }

    /**
     * Update chat title in user's chats array
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chatId - The ID of the chat to update
     * @param newTitle - The new title for the chat
     */
    public updateChatTitle = async (courseName: string, puid: string, chatId: string, newTitle: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
        console.log(`[MONGODB] 📝 Updating chat title for chat ${chatId} to "${newTitle}" for user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$.itemTitle': newTitle,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
            console.log(`[MONGODB] ✅ Chat title updated successfully to "${newTitle}"`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
            console.error(`[MONGODB] 🚨 Error updating chat title:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
            throw error;
        }
    }

    /**
     * Mark a chat as deleted (soft delete) instead of removing it
     * This preserves chat history for audit/analytics while hiding it from users
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chatId - The ID of the chat to mark as deleted
     */
    public markChatAsDeleted = async (courseName: string, puid: string, chatId: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
        console.log(`[MONGODB] 🗑️ Marking chat ${chatId} as deleted for user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid, 'chats.id': chatId },
                { 
                    $set: { 
                        'chats.$.isDeleted': true,
                        updatedAt: new Date()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`Chat not found with ID: ${chatId} for user PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
            console.log(`[MONGODB] ✅ Chat ${chatId} marked as deleted successfully`);
            //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
            console.error(`[MONGODB] 🚨 Error marking chat as deleted:`, error);
            //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
            throw error;
        }
    }

    /**
     * Delete a chat from user's chats array (HARD DELETE - kept for backward compatibility)
     * @deprecated Use markChatAsDeleted() instead for soft delete
     * @param courseName - The name of the course
     * @param puid - The PUID of the user
     * @param chatId - The ID of the chat to delete
     */
    public deleteChatFromUser = async (courseName: string, puid: string, chatId: string): Promise<void> => {
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
        console.log(`[MONGODB] 🗑️ Deleting chat ${chatId} from user PUID: ${puid} in course: ${courseName}`);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
        
        try {
            const userCollection = this.getUserCollection(courseName);
            
            const result = await userCollection.updateOne(
                { puid: puid },
                { 
                    $pull: { chats: { id: chatId } } as any,
                    $set: { updatedAt: new Date() }
                } as any
            );
            
            if (result.matchedCount === 0) {
                throw new Error(`User not found with PUID: ${puid}`);
            }
            
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
            console.log(`[MONGODB] ✅ Chat deleted successfully from user`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
            console.error(`[MONGODB] 🚨 Error deleting chat from user:`, error);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
            throw error;
        }
    }

    // ===========================================
    // ========= GLOBAL USER MANAGEMENT =========
    // ===========================================

    /**
     * Get the global users collection
     */
    private getGlobalUserCollection(): Collection {
        return this.db.collection(EngEAI_MongoDB.activeUsersCollection);
    }

    /**
     * Find a global user by PUID
     */
    public findGlobalUserByPUID = async (puid: string): Promise<GlobalUser | null> => {
        const collection = this.getGlobalUserCollection();
        return await collection.findOne({ puid: puid }) as GlobalUser | null;
    }

    /**
     * Create a new global user
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
     * Add a course to global user's enrolled courses
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
     * Update global user
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
}
