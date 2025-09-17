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

import { EngEAI_MongoDB } from '../routes/mongo-app';
import { IDGenerator } from '../functions/unique-id-generator';
import { activeCourse, ContentDivision, LearningObjective, AdditionalMaterial } from '../functions/types';

const idGenerator = IDGenerator.getInstance();

/**
 * Creates APSC 060 - Engineering Society (Flag Setup Course)
 * This course has completed course and content setup but needs flag setup
 */
async function createAPSC060(): Promise<activeCourse> {
    const courseId = idGenerator.uniqueIDGenerator('APSC060-Engineering-Society');
    const now = new Date();
    
    const course: activeCourse = {
        id: courseId,
        date: now,
        courseName: 'APSC 060: Engineering Society',
        courseSetup: true,
        contentSetup: true, // Completed onboarding
        flagSetup: false, // Needs flag setup
        monitorSetup: false, // Not yet set up
        instructors: [
            'Dr. Emily Rodriguez',
            'Prof. David Thompson'
        ],
        teachingAssistants: [
            'Sarah Chen',
            'Michael Johnson',
            'Lisa Wang'
        ],
        frameType: 'byWeek',
        tilesNumber: 14,
        divisions: []
    };

    // Create 14 weekly modules with learning objectives
    const weeklyModules = [
        {
            title: 'Week 1: Introduction to Engineering Society',
            objectives: [
                'Understand the role of engineering in society',
                'Explore the history of engineering professions',
                'Identify key engineering organizations and societies'
            ]
        },
        {
            title: 'Week 2: Professional Ethics and Responsibility',
            objectives: [
                'Learn about engineering codes of ethics',
                'Understand professional responsibility to society',
                'Analyze ethical dilemmas in engineering practice'
            ]
        },
        {
            title: 'Week 3: Engineering and Public Policy',
            objectives: [
                'Explore how engineering influences public policy',
                'Understand the role of engineers in government',
                'Analyze case studies of engineering policy decisions'
            ]
        },
        {
            title: 'Week 4: Sustainability and Environmental Impact',
            objectives: [
                'Understand sustainable engineering practices',
                'Learn about environmental impact assessment',
                'Explore green engineering solutions'
            ]
        },
        {
            title: 'Week 5: Engineering and Social Justice',
            objectives: [
                'Examine how engineering affects different communities',
                'Understand equity, diversity, and inclusion in engineering',
                'Explore engineering solutions for social challenges'
            ]
        },
        {
            title: 'Week 6: Technology and Society',
            objectives: [
                'Analyze the societal impact of new technologies',
                'Understand the digital divide and accessibility',
                'Explore responsible innovation practices'
            ]
        },
        {
            title: 'Week 7: Engineering Communication',
            objectives: [
                'Learn effective communication with non-technical audiences',
                'Understand the importance of public engagement',
                'Practice presenting engineering concepts clearly'
            ]
        },
        {
            title: 'Week 8: Engineering and Global Development',
            objectives: [
                'Explore engineering solutions for global challenges',
                'Understand appropriate technology concepts',
                'Analyze international engineering projects'
            ]
        },
        {
            title: 'Week 9: Risk Management and Safety',
            objectives: [
                'Learn about risk assessment in engineering projects',
                'Understand safety regulations and standards',
                'Explore case studies of engineering failures'
            ]
        },
        {
            title: 'Week 10: Engineering and Innovation',
            objectives: [
                'Understand the innovation process in engineering',
                'Explore intellectual property and patents',
                'Learn about technology transfer and commercialization'
            ]
        },
        {
            title: 'Week 11: Engineering and Education',
            objectives: [
                'Explore the role of engineers in education',
                'Understand STEM outreach and mentorship',
                'Learn about engineering education policy'
            ]
        },
        {
            title: 'Week 12: Engineering and Healthcare',
            objectives: [
                'Examine the intersection of engineering and healthcare',
                'Understand medical device regulation',
                'Explore biomedical engineering applications'
            ]
        },
        {
            title: 'Week 13: Engineering and Transportation',
            objectives: [
                'Analyze transportation systems and their societal impact',
                'Understand smart city concepts',
                'Explore future transportation technologies'
            ]
        },
        {
            title: 'Week 14: Capstone Project - Engineering for Society',
            objectives: [
                'Design a solution to a real-world societal challenge',
                'Apply engineering principles to social problems',
                'Present findings to the engineering community'
            ]
        }
    ];

    // Create divisions and learning objectives
    for (let i = 0; i < 14; i++) {
        const module = weeklyModules[i];
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
        flagSetup: true, // Completed flag setup
        monitorSetup: true, // Completed monitor setup
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
        
        // Create APSC 060 (Flag Setup Course)
        const apsc060 = await createAPSC060();
        await createOrUpdateCourse(apsc060);
        
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
        const apsc060Id = idGenerator.uniqueIDGenerator('APSC060-Engineering-Society');
        
        await deleteCourse(apsc099Id);
        await deleteCourse(apsc080Id);
        await deleteCourse(apsc060Id);
        
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
export async function getDummyCourses(): Promise<{ apsc099: activeCourse | null, apsc080: activeCourse | null, apsc060: activeCourse | null }> {
    try {
        const apsc099Id = idGenerator.uniqueIDGenerator('APSC099-Engineering-Kindergarten');
        const apsc080Id = idGenerator.uniqueIDGenerator('APSC080-Introduction-Engineering');
        const apsc060Id = idGenerator.uniqueIDGenerator('APSC060-Engineering-Society');
        
        const instance = await EngEAI_MongoDB.getInstance();
        
        const apsc099 = await instance.getActiveCourse(apsc099Id) as activeCourse | null;
        const apsc080 = await instance.getActiveCourse(apsc080Id) as activeCourse | null;
        const apsc060 = await instance.getActiveCourse(apsc060Id) as activeCourse | null;
        
        return { apsc099, apsc080, apsc060 };
    } catch (error) {
        console.error('Error getting dummy courses:', error);
        return { apsc099: null, apsc080: null, apsc060: null };
    }
}
