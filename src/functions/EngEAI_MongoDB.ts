import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { activeCourse, AdditionalMaterial, ContentDivision, courseItem, FlagReport } from './types';
import { IDGenerator } from './unique-id-generator';

dotenv.config();

export class EngEAI_MongoDB {
    private static instance: EngEAI_MongoDB;
    private static activeCourseListDatabase: string = 'TLEF-ENGEAI-DB';
    private static activeCourseListCollection: string = 'active-course-list';
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
            await this.getCourseCollection().insertOne(course);

            //use singleton's DB
            const courseName = course.courseName;

            //create users collection
            const userCollection = `${courseName}_users`;
            await this.db.createCollection(userCollection);
    
            //create messages collection
            const messagesCollection = `${courseName}_messages`;
            await this.db.createCollection(messagesCollection);
    
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
            
            const result = await flagsCollection.insertOne(flagReport);
            
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

    public async close(): Promise<void> {
        try {
            await this.client.close();
            console.log('✅ MongoDB connection closed');
        } catch (error) {
            console.error('❌ Error closing MongoDB connection:', error);
            throw error;
        }
    }
}
