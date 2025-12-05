/**
 * DUMMY COURSES DEBUG SERVICE
 * 
 * This module provides dummy courses for testing and demonstration purposes.
 * It creates three courses with different states:
 * - APSC 099: Settled course with completed onboarding
 * - APSC 080: Course ready for onboarding
 * - APSC 060: Course ready for flag setup onboarding
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { IDGenerator } from '../functions/unique-id-generator';
import { activeCourse, TopicOrWeekInstance, LearningObjective, AdditionalMaterial, FlagReport, CourseUser, GlobalUser, TopicOrWeekItem } from '../functions/types';

const idGenerator = IDGenerator.getInstance();


/**
 * Creates APSC 099 - Engineering for Kindergarten (Settled Course)
 * This course has completed onboarding with learning objectives
 */
async function createCHBE241(): Promise<activeCourse> {
    const courseId = idGenerator.uniqueIDGenerator('APSC099-Engineering-Kindergarten');
    const now = new Date();
    
    const courseName = 'CHBE 241: Material and Energy Balances';
    
    const course: activeCourse = {
        id: courseId,
        date: now,
        courseName: courseName,
        courseSetup:  true,
        contentSetup: true, // Completed onboarding
        flagSetup: true, // Completed flag setup
        monitorSetup: true, // Completed monitor setup
        instructors: [
            'Alireza Bagherzadeh',
        ],
        teachingAssistants: [
        ],
        frameType: 'byTopic',
        tilesNumber: 10,
        topicOrWeekInstances: [],
        collections: {
            users: `${courseName}_users`,
            flags: `${courseName}_flags`,
            memoryAgent: `${courseName}_memory-agent`
        }
    };


    const topicOrWeekInstances = [
        {
            title: 'Chapter 2',
            items: [
                {
                    title: 'Introduction to Engineering Calculations',
                    objectives: [
                        'Know the goals, format and expectations in this course',
                        'Relate units of measure from various measurement systems and convert between them',
                        'Choose appropriate units for variables based on dimensional consistency of equations'
                    ]
                }
            ],
        },
        {
            title: 'Chapter 3',
            items: [
                {
                    title: 'Processes & Process Variables',
                    objectives: [
                        'Calculate mass, molar and volumetric flows and convert between them',
                        'Distinguish between variables as _intensive _ and extensive',
                        'Define basic process variables: Density – Ch3.1, Flow rate – Ch 3.2, Chemical Composition – Ch 3.3,  Pressure (absolute and gauge) – Ch 3.4, Temperature – Ch 3.5',
                    ]
                },
            ],
        },
        {
            title: 'Chapter 4',
            items: [
                {
                    title: 'Part I (Process Types & Flowcharts)',
                    objectives: [
                        'Classify processes based on their time characteristics and stream configurations – Ch 4.1',
                        'Apply the general mass balance equation to characterize systems – Ch 4.2',
                        'Construct block flow diagrams for chemical processes – Ch 4.3a/b'
                    ]
                },
                {
                    title: 'Part II (DoF Analysis, St. St. Single and Multi-Unit Material Balances)',
                    objectives: [
                        'Determine the degree-of-freedom (DOF) of processes to understand whether they are under specified, adequately specified or over specified',
                        'Apply a general procedure to organize process flow calculations',
                        'Evaluate overall process economics using four basic figures of merit'
                    ]
                },
                {
                    title: 'Part III (Systems involving Chemical Reactions)',
                    objectives: [
                        'Manipulate chemical reactions to balance reaction stoichiometry – Ch 4.6a Characterize reactor performance using limiting and excess reactants as well as fractional conversion – Ch 4.6b',
                        'Use extent of reaction in order to characterize a chemical reaction – Ch 4.6b',
                        'Calculate the equilibrium constant for a given chemical system – Ch 4.6c',
                        'Analyze scenarios with multiple reactions using selectivity, and yield – Ch 4.6d'
                    ]
                },
                {
                    title: 'Part IV (DOF Analysis for Reactive Systems)',
                    objectives: [
                        '**Determine** _degrees of freedom_ using extent of reaction or atomic species approach for reactive systems and fully Solve them – Ch 4.7',
                    ]
                },
                {
                    title: 'Part V (Recycle, Bypass, and Purge Streams)',
                    objectives: [
                        'Identify recycle, purge and bypass streams in chemical processes – Ch 4.7f/g',
                        'Solve material balances problems involving recycle, purge and/or bypass streams'
                    ]
                },
                {
                    title: 'Part VI (Combustion Reactions)',
                    objectives: [
                        'Apply combustion concepts such as incomplete (partial) combustion, theoretical air/O2 and excess air/O2 to analyze combustion reactions – Ch 4.8',
                    ]
                }
            ],
        },
    ];

    // Create topic/week instances and learning objectives
    for (let i = 0; i < topicOrWeekInstances.length; i++) {
        const instanceData = topicOrWeekInstances[i];
        
        // Process each item in the topic/week instance
        for (let j = 0; j < instanceData.items.length; j++) {
            const itemData = instanceData.items[j];
            const topicOrWeekId = idGenerator.topicOrWeekID({
                id: idGenerator.uniqueIDGenerator(`topic-or-week-${i + 1}`),
                date: now,
                title: instanceData.title,
                courseName: course.courseName,
                published: true,
                items: [],
                createdAt: now,
                updatedAt: now
            }, course.courseName);
            const itemId = idGenerator.itemID({
                id: idGenerator.uniqueIDGenerator(`item-${i + 1}-${j + 1}`),
                date: now,
                title: itemData.title,
                courseName: course.courseName,
                topicOrWeekTitle: instanceData.title,
                itemTitle: itemData.title,
                learningObjectives: [],
                additionalMaterials: [],
                createdAt: now,
                updatedAt: now
            }, instanceData.title, course.courseName);
            
            const learningObjectives: LearningObjective[] = itemData.objectives.map((objective, index) => {
                // Create a temporary learning objective object to generate ID
                const tempObjective: LearningObjective = {
                    id: '', // Will be set after ID generation
                    LearningObjective: objective,
                    courseName: course.courseName,
                    topicOrWeekTitle: instanceData.title,
                    itemTitle: itemData.title,
                    createdAt: now,
                    updatedAt: now
                };
                
                // Generate ID using the complete learning objective object
                const objectiveId = idGenerator.learningObjectiveID(
                    tempObjective,
                    itemData.title,
                    instanceData.title,
                    course.courseName
                );
                
                // Return the complete learning objective with generated ID
                return {
                    ...tempObjective,
                    id: objectiveId
                };
            });

            // Find or create the topic/week instance
            let instance = course.topicOrWeekInstances.find(inst => inst.title === instanceData.title);
            
            if (!instance) {
                instance = {
                    id: topicOrWeekId,
                    date: now,
                    title: instanceData.title,
                    courseName: course.courseName,
                    published: true,
                    createdAt: now,
                    updatedAt: now,
                    items: []
                };
                course.topicOrWeekInstances.push(instance);
            }

            // Add the item to the instance
            const item: TopicOrWeekItem = {
                id: itemId,
                date: now,
                title: itemData.title,
                courseName: course.courseName,
                topicOrWeekTitle: instanceData.title,
                itemTitle: itemData.title,
                learningObjectives: learningObjectives,
                additionalMaterials: [],
                completed: true,
                createdAt: now,
                updatedAt: now
            };

            instance.items.push(item);
        }
    }

    return course;
}

/**
 * Creates APSC 080 - Introduction to Engineering (Onboarding Course)
 * This course is ready for onboarding but hasn't completed it yet
 */
async function createAPSC080(): Promise<activeCourse> {
    const courseId = idGenerator.uniqueIDGenerator('APSC080-Introduction-Engineering');
    const now = new Date();
    
    const course: activeCourse = {
        id: courseId,
        date: now,
        courseName: 'APSC 080: Introduction to Engineering',
        courseSetup: false,
        contentSetup: false, // Not completed onboarding
        flagSetup: false, // Not completed flag setup
        monitorSetup: false, // Not completed monitor setup
        instructors: [
            'Dr. Jennifer Martinez',
            'Prof. Robert Wilson',
            'Dr. Lisa Park'
        ],
        teachingAssistants: [
            'James Anderson',
            'Maria Garcia',
            'Kevin Lee',
            'Sophie Brown'
        ],
        frameType: 'byTopic',
        tilesNumber: 10,
        topicOrWeekInstances: []
    };

    // Create 10 empty modules (ready for onboarding)
    const moduleTitles = [
        'Module 1: Engineering Fundamentals',
        'Module 2: Mathematics in Engineering',
        'Module 3: Physics and Mechanics',
        'Module 4: Materials Science',
        'Module 5: Thermodynamics',
        'Module 6: Electrical Engineering Basics',
        'Module 7: Computer-Aided Design',
        'Module 8: Project Management',
        'Module 9: Engineering Ethics',
        'Module 10: Capstone Project'
    ];

    for (let i = 0; i < 10; i++) {
        const instanceData: TopicOrWeekInstance = {
            id: idGenerator.topicOrWeekID({
                id: idGenerator.uniqueIDGenerator(`topic-or-week-${i + 1}`),
                date: now,
                title: moduleTitles[i],
                courseName: course.courseName,
                published: false,
                items: [],
                createdAt: now,
                updatedAt: now
            }, course.courseName),
            date: now,
            title: moduleTitles[i],
            courseName: course.courseName,
            published: false,
            createdAt: now,
            updatedAt: now,
            items: [{
                id: idGenerator.itemID({
                    id: idGenerator.uniqueIDGenerator(`item-${i + 1}`),
                    date: now,
                    title: moduleTitles[i],
                    courseName: course.courseName,
                    topicOrWeekTitle: moduleTitles[i],
                    itemTitle: moduleTitles[i],
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: now,
                    updatedAt: now
                }, moduleTitles[i], course.courseName),
                date: now,
                title: moduleTitles[i],
                courseName: course.courseName,
                topicOrWeekTitle: moduleTitles[i],
                itemTitle: moduleTitles[i],
                learningObjectives: [],
                additionalMaterials: [],
                completed: false,
                createdAt: now,
                updatedAt: now
            }]
        };

        course.topicOrWeekInstances.push(instanceData);
    }

    return course;
}

/**
 * Checks if the active-course-list collection exists and has documents
 */
async function collectionExistsAndHasData(): Promise<boolean> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const collectionName = 'active-course-list';
        
        // Check if collection exists
        const collectionExists = await instance.db.listCollections({ name: collectionName }).hasNext();
        
        if (!collectionExists) {
            return false;
        }
        
        // Check if collection has any documents
        const collection = instance.db.collection(collectionName);
        const documentCount = await collection.countDocuments();
        
        return documentCount > 0;
    } catch (error) {
        console.error('Error checking if collection exists:', error);
        return false;
    }
}

/**
 * Checks if a course exists in the database
 */
async function courseExists(courseId: string): Promise<boolean> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const course = await instance.getActiveCourse(courseId);
        return course !== null;
    } catch (error) {
        console.error('Error checking if course exists:', error);
        return false;
    }
}

/**
 * Creates or updates a course in the database
 */
async function createOrUpdateCourse(course: activeCourse): Promise<boolean> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Check if course exists
        const exists = await courseExists(course.id);
        
        if (exists) {
            // Update existing course
            await instance.updateActiveCourse(course.id, course);
            console.log(`Updated course: ${course.courseName}`);
        } else {
            // Create new course
            await instance.postActiveCourse(course);
            console.log(`Created course: ${course.courseName}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error creating/updating course:', error);
        return false;
    }
}

/**
 * Deletes a course from the database
 */
async function deleteCourse(courseId: string): Promise<boolean> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const course = await instance.getActiveCourse(courseId);
        if (course) {
            await instance.deleteActiveCourse(course as unknown as activeCourse);
            console.log(`Deleted course: ${courseId}`);
        }
        return true;
    } catch (error) {
        console.error('Error deleting course:', error);
        return false;
    }
}

/**
 * Initializes dummy courses on server startup
 */
export async function initializeDummyCourses(): Promise<void> {
    console.log('🔧 Initializing dummy courses...');
    
    try {
        // Create APSC 099 (Settled Course)
        const chbe241 = await createCHBE241();
        await createOrUpdateCourse(chbe241);

        
        console.log('✅ Dummy courses initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing dummy courses:', error);
    }
}

/**
 * Clears all chats from all users in a course
 * @param courseName - The course name
 */
async function clearAllChats(courseName: string): Promise<void> {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const userCollectionName = `${courseName}_users`;
        const userCollection = mongoDB.db.collection(userCollectionName);
        
        // Clear chats array for all users in the course
        const result = await userCollection.updateMany(
            {},
            {
                $set: { 
                    chats: [],
                    updatedAt: new Date()
                }
            }
        );
        
        console.log(`🗑️ Cleared chats from ${result.modifiedCount} users in course: ${courseName}`);
    } catch (error) {
        console.error(`❌ Error clearing chats for course ${courseName}:`, error);
        throw error;
    }
}

/**
 * Clears all flags for a course
 * @param courseName - The course name
 */
async function clearAllFlags(courseName: string): Promise<void> {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        await mongoDB.deleteAllFlagReports(courseName);
        console.log(`🗑️ Cleared all flags for course: ${courseName}`);
    } catch (error) {
        console.error(`❌ Error clearing flags for course ${courseName}:`, error);
        throw error;
    }
}

/**
 * Clears all documents (additional materials) for a course
 * @param courseId - The course ID
 */
async function clearAllDocuments(courseId: string): Promise<void> {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        await mongoDB.clearAllAdditionalMaterials(courseId);
        console.log(`🗑️ Cleared all documents for course: ${courseId}`);
    } catch (error) {
        console.error(`❌ Error clearing documents for course ${courseId}:`, error);
        throw error;
    }
}

/**
 * Wipes every document inside the active-users collection
 */
async function clearActiveUsersCollection(): Promise<void> {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const collection = mongoDB.db.collection('active-users');
        const deleteResult = await collection.deleteMany({});
        console.log(`🧹 Cleared ${deleteResult.deletedCount} document(s) from active-users`);
    } catch (error) {
        console.error('❌ Error clearing active-users collection:', error);
        throw error;
    }
}

/**
 * Resets dummy courses to their original state
 * Wipes everything in active-course-list collection, then adds CHBE 241
 * Deletes all MongoDB collections except 'active-users'
 * @returns Object with success status and optional message
 * 
 * COMMENTED OUT: This functionality has been replaced with per-course removal
 * See DELETE /api/courses/:id/remove route instead
 */
/* COMMENTED OUT - REPLACED WITH PER-COURSE REMOVAL
export async function resetDummyCourses(): Promise<{ success: boolean; skipped?: boolean; message?: string }> {
    console.log('🔄 Resetting dummy courses...');
    console.log('⚠️  This will wipe active-course-list, delete all Qdrant documents, and delete ALL collections except active-users');
    
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Step 1: Get all active courses before deleting them (needed to clear Qdrant documents)
        console.log('📋 Getting all active courses to clear Qdrant documents...');
        let allCourses: activeCourse[] = [];
        let totalQdrantDeleted = 0;
        const qdrantErrors: string[] = [];
        
        try {
            allCourses = await mongoDB.getAllActiveCourses() as unknown as activeCourse[];
            console.log(`📋 Found ${allCourses.length} course(s) to clear from Qdrant`);
        } catch (error) {
            console.warn('⚠️  Could not get active courses (collection may not exist):', error);
        }
        
        // Step 2: Clear Qdrant documents for all courses
        if (allCourses.length > 0) {
            console.log('🗑️  Clearing Qdrant documents for all courses...');
            try {
                const { RAGApp } = await import('../routes/RAG-App.js');
                const ragApp = await RAGApp.getInstance();
                
                for (const course of allCourses) {
                    try {
                        if (course.id) {
                            const qdrantResult = await ragApp.deleteAllDocumentsForCourse(course.id);
                            totalQdrantDeleted += qdrantResult.deletedCount;
                            if (qdrantResult.errors && qdrantResult.errors.length > 0) {
                                qdrantErrors.push(...qdrantResult.errors);
                            }
                            console.log(`✅ Deleted ${qdrantResult.deletedCount} Qdrant document(s) for course: ${course.courseName}`);
                        }
                    } catch (error) {
                        const errorMsg = `Failed to clear Qdrant for course ${course.courseName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                        qdrantErrors.push(errorMsg);
                        console.error(`❌ ${errorMsg}`);
                    }
                }
                
                console.log(`✅ Deleted ${totalQdrantDeleted} total Qdrant document(s) across all courses`);
                if (qdrantErrors.length > 0) {
                    console.warn(`⚠️  ${qdrantErrors.length} error(s) occurred during Qdrant cleanup`);
                }
            } catch (error) {
                console.error('❌ Error clearing Qdrant documents:', error);
                // Continue with MongoDB cleanup even if Qdrant fails
            }
        } else {
            console.log('ℹ️  No courses found, skipping Qdrant cleanup');
        }
        
        // Step 3: Clear all documents from active-course-list collection
        console.log('🗑️  Clearing all courses from active-course-list...');
        try {
            const activeCourseListCollection = mongoDB.db.collection('active-course-list');
            const deleteResult = await activeCourseListCollection.deleteMany({});
            console.log(`✅ Deleted ${deleteResult.deletedCount} course(s) from active-course-list`);
        } catch (error) {
            console.error('❌ Error clearing active-course-list:', error);
            throw error;
        }
        
        // Step 4: Get all collections in the database
        const allCollections = await mongoDB.db.listCollections().toArray();
        const collectionNames = allCollections.map(col => col.name);
        
        console.log(`📋 Found ${collectionNames.length} collection(s) in database`);
        
        // Collections to preserve (only active-users now)
        const preservedCollections = ['active-users'];
        
        // Filter out collections to preserve
        const collectionsToDrop = collectionNames.filter(
            name => !preservedCollections.includes(name)
        );
        
        console.log(`🗑️  Dropping ${collectionsToDrop.length} collection(s) (preserving: ${preservedCollections.join(', ')})`);
        
        // Step 5: Drop all collections except the preserved ones
        const droppedCollections: string[] = [];
        const errors: string[] = [];
        
        for (const collectionName of collectionsToDrop) {
            try {
                const dropResult = await mongoDB.dropCollection(collectionName);
                if (dropResult.success) {
                    droppedCollections.push(collectionName);
                    console.log(`✅ Dropped collection: ${collectionName}`);
                } else {
                    errors.push(`Failed to drop ${collectionName}: ${dropResult.error}`);
                    console.error(`❌ Failed to drop ${collectionName}:`, dropResult.error);
                }
            } catch (error) {
                const errorMsg = `Error dropping ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }
        
        console.log(`✅ Dropped ${droppedCollections.length} collection(s) successfully`);
        if (errors.length > 0) {
            console.warn(`⚠️  ${errors.length} error(s) occurred during collection deletion`);
        }

        // Step 6: Wipe active-users collection after preserving it
        console.log('🧹 Clearing active-users collection...');
        try {
            await clearActiveUsersCollection();
        } catch (error) {
            console.error('❌ Failed to clear active-users collection:', error);
            throw error;
        }
        
        // Step 7: Reset CHBE 241 by recreating it (this will add it back to active-course-list)
        console.log('🔄 Recreating CHBE 241...');
        await initializeDummyCourses();
        
        let message = `Dummy courses reset successfully. Deleted ${totalQdrantDeleted} Qdrant document(s), wiped active-course-list, dropped ${droppedCollections.length} collection(s), and recreated CHBE 241.`;
        if (qdrantErrors.length > 0 || errors.length > 0) {
            const allErrors = [...qdrantErrors, ...errors];
            message += ` (${allErrors.length} error(s) occurred)`;
        }
        console.log(`✅ ${message}`);
        
        return { 
            success: true, 
            skipped: false,
            message: message
        };
    } catch (error) {
        console.error('❌ Error resetting dummy courses:', error);
        return { 
            success: false, 
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}
END COMMENTED OUT */

/**
 * Gets all dummy courses for display
 */
export async function getDummyCourses(): Promise<{ apsc099: activeCourse | null, apsc080: activeCourse | null }> {
    try {
        const apsc099Id = idGenerator.uniqueIDGenerator('APSC099-Engineering-Kindergarten');
        const apsc080Id = idGenerator.uniqueIDGenerator('APSC080-Introduction-Engineering');
        
        const instance = await EngEAI_MongoDB.getInstance();
        
        const apsc099 = await instance.getActiveCourse(apsc099Id) as activeCourse | null;
        const apsc080 = await instance.getActiveCourse(apsc080Id) as activeCourse | null;
        
        return { apsc099, apsc080 };
    } catch (error) {
        console.error('Error getting dummy courses:', error);
        return { apsc099: null, apsc080: null };
    }
}

/**
 * Registers the current logged-in user to CHBE 241 course
 * This is a development-only feature for the reset dummy courses functionality
 * @param globalUser - The GlobalUser object from session
 * @returns Object with success status and optional message
 */
export async function registerCurrentUserToCHBE241(globalUser: GlobalUser): Promise<{ success: boolean; message?: string }> {
    console.log(`[RESET-USER-REGISTRATION] 🧑 Registering user ${globalUser.userId} to CHBE 241...`);
    
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const courseName = 'CHBE 241: Material and Energy Balances';
        
        // Get CHBE 241 course details
        const course = await mongoDB.getCourseByName(courseName) as activeCourse | null;
        
        if (!course) {
            const errorMsg = `Course "${courseName}" not found after reset`;
            console.error(`[RESET-USER-REGISTRATION] ❌ ${errorMsg}`);
            return { 
                success: false, 
                message: errorMsg 
            };
        }
        
        console.log(`[RESET-USER-REGISTRATION] ✅ Found course: ${course.courseName} (ID: ${course.id})`);
        
        // Check if CourseUser already exists (idempotent)
        const existingCourseUser = await mongoDB.findStudentByUserId(
            courseName,
            globalUser.userId
        );
        
        if (existingCourseUser) {
            console.log(`[RESET-USER-REGISTRATION] ⚠️ User ${globalUser.userId} already registered to ${courseName}, skipping registration`);
            return { 
                success: true, 
                message: `User already registered to ${courseName}` 
            };
        }
        
        // Create CourseUser entry
        console.log(`[RESET-USER-REGISTRATION] 📝 Creating CourseUser entry...`);
        const newCourseUserData: Partial<CourseUser> = {
            name: globalUser.name,
            userId: globalUser.userId,
            courseName: course.courseName,
            courseId: course.id,
            userOnboarding: false,
            affiliation: globalUser.affiliation,
            status: 'active',
            chats: []
        };
        
        const courseUser = await mongoDB.createStudent(courseName, newCourseUserData) as any;
        console.log(`[RESET-USER-REGISTRATION] ✅ CourseUser created for userId: ${globalUser.userId}`);
        
        // Add course to GlobalUser's enrolled list if not already present
        if (!globalUser.coursesEnrolled.includes(course.id)) {
            await mongoDB.addCourseToGlobalUser(
                globalUser.puid,
                course.id
            );
            console.log(`[RESET-USER-REGISTRATION] ✅ Added course to GlobalUser's enrolled list`);
        } else {
            console.log(`[RESET-USER-REGISTRATION] ℹ️ Course already in GlobalUser's enrolled list`);
        }
        
        const successMsg = `User ${globalUser.name} (${globalUser.userId}) successfully registered to ${courseName}`;
        console.log(`[RESET-USER-REGISTRATION] ✅ ${successMsg}`);
        
        return { 
            success: true, 
            message: successMsg 
        };
    } catch (error) {
        const errorMsg = `Failed to register user to CHBE 241: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`[RESET-USER-REGISTRATION] ❌ ${errorMsg}`, error);
        return { 
            success: false, 
            message: errorMsg 
        };
    }
}
