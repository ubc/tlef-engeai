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
     * @returns Array of Chat objects
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
            
            const chats = (user as any).chats || [];
            
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            console.log(`[MONGODB] ✅ Found ${chats.length} chats for user`);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
            
            return chats;
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
     * Delete a chat from user's chats array
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
