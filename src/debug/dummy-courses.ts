/**
 * DUMMY COURSES DEBUG SERVICE
 * 
 * This module provides dummy courses for testing and demonstration purposes.
 * It creates two courses with different states:
 * - APSC 099: Settled course with completed onboarding
 * - APSC 080: Course ready for onboarding
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { EngEAI_MongoDB } from '../routes/mongoApp';
import { IDGenerator } from '../functions/unique-id-generator';
import { activeCourse, ContentDivision, LearningObjective, AdditionalMaterial } from '../functions/types';

const idGenerator = IDGenerator.getInstance();

/**
 * Creates APSC 099 - Engineering for Kindergarten (Settled Course)
 * This course has completed onboarding with learning objectives
 */
async function createAPSC099(): Promise<activeCourse> {
    const courseId = idGenerator.uniqueIDGenerator('APSC099-Engineering-Kindergarten');
    const now = new Date();
    
    const course: activeCourse = {
        id: courseId,
        date: now,
        courseName: 'APSC 099: Engineering for Kindergarten',
        courseSetup: true,
        contentSetup: true, // Completed onboarding
        instructors: [
            'Dr. Sarah Johnson',
            'Prof. Michael Chen'
        ],
        teachingAssistants: [
            'Alex Thompson',
            'Emma Rodriguez',
            'David Kim'
        ],
        frameType: 'byTopic',
        tilesNumber: 10,
        divisions: []
    };

    // Create 10 modules with learning objectives
    const modules = [
        {
            title: 'Module 1: Building with Blocks',
            objectives: [
                'Identify basic building shapes (cubes, cylinders, triangles)',
                'Build simple structures using blocks',
                'Understand the concept of stability in structures'
            ]
        },
        {
            title: 'Module 2: Simple Machines',
            objectives: [
                'Recognize different types of simple machines',
                'Understand how levers help us lift heavy objects',
                'Identify wheels and axles in everyday objects'
            ]
        },
        {
            title: 'Module 3: Water and Engineering',
            objectives: [
                'Explore how water flows and moves',
                'Build simple water channels',
                'Understand the concept of water pressure'
            ]
        },
        {
            title: 'Module 4: Bridges and Structures',
            objectives: [
                'Learn about different types of bridges',
                'Build a simple bridge using craft materials',
                'Test the strength of different bridge designs'
            ]
        },
        {
            title: 'Module 5: Energy and Motion',
            objectives: [
                'Understand what energy is and how it moves things',
                'Explore different ways to make things move',
                'Build a simple windmill or water wheel'
            ]
        },
        {
            title: 'Module 6: Materials and Properties',
            objectives: [
                'Identify different materials and their properties',
                'Test which materials are strong, flexible, or waterproof',
                'Choose appropriate materials for different projects'
            ]
        },
        {
            title: 'Module 7: Transportation Engineering',
            objectives: [
                'Learn about different types of vehicles',
                'Understand how wheels and engines work together',
                'Design a simple vehicle using recycled materials'
            ]
        },
        {
            title: 'Module 8: Environmental Engineering',
            objectives: [
                'Understand how engineers help protect the environment',
                'Learn about recycling and reusing materials',
                'Design a solution to reduce waste'
            ]
        },
        {
            title: 'Module 9: Communication and Signals',
            objectives: [
                'Learn about different ways to send messages',
                'Understand how signals and codes work',
                'Create a simple communication device'
            ]
        },
        {
            title: 'Module 10: Future Engineers',
            objectives: [
                'Explore what engineers do in different fields',
                'Design a solution to a real-world problem',
                'Present engineering ideas to classmates'
            ]
        }
    ];

    // Create divisions and learning objectives
    for (let i = 0; i < 10; i++) {
        const module = modules[i];
        const divisionId = idGenerator.uniqueIDGenerator(`division-${i + 1}`);
        const itemId = idGenerator.uniqueIDGenerator(`item-${i + 1}`);
        
        const learningObjectives: LearningObjective[] = module.objectives.map((objective, index) => ({
            id: idGenerator.uniqueIDGenerator(`objective-${i + 1}-${index + 1}`),
            LearningObjective: objective,
            courseName: course.courseName,
            divisionTitle: module.title,
            itemTitle: module.title,
            createdAt: now,
            updatedAt: now
        }));

        const division: ContentDivision = {
            id: divisionId,
            date: now,
            title: module.title,
            courseName: course.courseName,
            published: true,
            createdAt: now,
            updatedAt: now,
            items: [{
                id: itemId,
                date: now,
                title: module.title,
                courseName: course.courseName,
                divisionTitle: module.title,
                itemTitle: module.title,
                learningObjectives: learningObjectives,
                additionalMaterials: [],
                completed: true,
                createdAt: now,
                updatedAt: now
            }]
        };

        course.divisions.push(division);
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
        courseSetup: true,
        contentSetup: false, // Not completed onboarding
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
        divisions: []
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
        const divisionId = idGenerator.uniqueIDGenerator(`division-${i + 1}`);
        const itemId = idGenerator.uniqueIDGenerator(`item-${i + 1}`);
        
        const division: ContentDivision = {
            id: divisionId,
            date: now,
            title: moduleTitles[i],
            courseName: course.courseName,
            published: false,
            createdAt: now,
            updatedAt: now,
            items: [{
                id: itemId,
                date: now,
                title: moduleTitles[i],
                courseName: course.courseName,
                divisionTitle: moduleTitles[i],
                itemTitle: moduleTitles[i],
                learningObjectives: [],
                additionalMaterials: [],
                completed: false,
                createdAt: now,
                updatedAt: now
            }]
        };

        course.divisions.push(division);
    }

    return course;
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
        const apsc099 = await createAPSC099();
        await createOrUpdateCourse(apsc099);
        
        // Create APSC 080 (Onboarding Course)
        const apsc080 = await createAPSC080();
        await createOrUpdateCourse(apsc080);
        
        console.log('✅ Dummy courses initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing dummy courses:', error);
    }
}

/**
 * Resets dummy courses to their original state
 */
export async function resetDummyCourses(): Promise<boolean> {
    console.log('🔄 Resetting dummy courses...');
    
    try {
        // Delete existing courses
        const apsc099Id = idGenerator.uniqueIDGenerator('APSC099-Engineering-Kindergarten');
        const apsc080Id = idGenerator.uniqueIDGenerator('APSC080-Introduction-Engineering');
        
        await deleteCourse(apsc099Id);
        await deleteCourse(apsc080Id);
        
        // Recreate courses
        await initializeDummyCourses();
        
        console.log('✅ Dummy courses reset successfully');
        return true;
    } catch (error) {
        console.error('❌ Error resetting dummy courses:', error);
        return false;
    }
}

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
