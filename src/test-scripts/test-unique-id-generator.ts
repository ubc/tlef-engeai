import { IDGenerator } from '../functions/unique-id-generator';
import { activeClass, ContentDivision, CourseContent, LearningObjective, AdditionalMaterial } from '../functions/types';

// Test function to check if a string is a valid hexadecimal
function isValidHex(str: string): boolean {
    const hexRegex = /^[0-9A-Fa-f]+$/;
    return hexRegex.test(str);
}

// Test function to check if two generated IDs are different
function areIDsDifferent(id1: string, id2: string): boolean {
    return id1 !== id2;
}

// Test uniqueIDGenerator function
function testUniqueIDGenerator() {
    console.log('\n=== Testing uniqueIDGenerator ===');
    
    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility
    
    // Test case 1: Basic string input
    const test1Input = 'test-string-1';
    const test1Result = generator.uniqueIDGenerator(test1Input);
    console.log(`Test 1 - Input: "${test1Input}"`);
    console.log(`Output: ${test1Result}`);
    console.log(`Length check: ${test1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(test1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different string input
    const test2Input = 'test-string-2';
    const test2Result = generator.uniqueIDGenerator(test2Input);
    console.log(`\nTest 2 - Input: "${test2Input}"`);
    console.log(`Output: ${test2Result}`);
    console.log(`Length check: ${test2Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(test2Result) ? 'PASS' : 'FAIL'}`);
    console.log(`Uniqueness check: ${areIDsDifferent(test1Result, test2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Special characters
    const test3Input = 'test@#$%^&*()';
    const test3Result = generator.uniqueIDGenerator(test3Input);
    console.log(`\nTest 3 - Input with special characters: "${test3Input}"`);
    console.log(`Output: ${test3Result}`);
    console.log(`Length check: ${test3Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(test3Result) ? 'PASS' : 'FAIL'}`);
}

// Test courseID function
function testCourseID() {
    console.log('\n=== Testing courseID ===');
    
    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility

    // Test case 1: Regular course name and date
    const course1: activeClass = {
        id: '1',
        name: 'CHBE241',
        date: new Date('2024-03-15'),
        onBoarded: true,
        instructors: ['Dr. Smith'],
        teachingAssistants: ['TA One'],
        frameType: 'byWeek',
        tilesNumber: 12,
        content: []
    };
    const course1Result = generator.courseID(course1);
    console.log(`Test 1 - Course: ${course1.name}, Date: ${course1.date.toISOString()}`);
    console.log(`Output: ${course1Result}`);
    console.log(`Length check: ${course1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(course1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different course, same date
    const course2: activeClass = {
        id: '2',
        name: 'MTRL251',
        date: new Date('2024-03-15'),
        onBoarded: true,
        instructors: ['Dr. Jones'],
        teachingAssistants: ['TA Two'],
        frameType: 'byTopic',
        tilesNumber: 8,
        content: []
    };
    const course2Result = generator.courseID(course2);
    console.log(`\nTest 2 - Course: ${course2.name}, Date: ${course2.date.toISOString()}`);
    console.log(`Output: ${course2Result}`);
    console.log(`Uniqueness check: ${areIDsDifferent(course1Result, course2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Same course, different date
    const course3: activeClass = {
        id: '3',
        name: 'CHBE241',
        date: new Date('2024-03-16'),
        onBoarded: true,
        instructors: ['Dr. Smith'],
        teachingAssistants: ['TA One'],
        frameType: 'byWeek',
        tilesNumber: 12,
        content: []
    };
    const course3Result = generator.courseID(course3);
    console.log(`\nTest 3 - Course: ${course3.name}, Date: ${course3.date.toISOString()}`);
    console.log(`Output: ${course3Result}`);
    console.log(`Uniqueness check (different date): ${areIDsDifferent(course1Result, course3Result) ? 'PASS' : 'FAIL'}`);
}

// Test contentID function
function testContentID() {
    console.log('\n=== Testing contentID ===');

    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility

    // Test case 1: Basic content division
    const content1: ContentDivision = {
        id: 'content1',
        title: 'Week 1 - Introduction',
        date: new Date('2024-03-15'),
        published: true,
        content: []
    };
    const content1Result = generator.contentID(content1, 'CHBE241');
    console.log(`Test 1 - Content: "${content1.title}", Course: "CHBE241", Date: ${content1.date.toISOString()}`);
    console.log(`Output: ${content1Result}`);
    console.log(`Length check: ${content1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(content1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different content, same course and date
    const content2: ContentDivision = {
        id: 'content2',
        title: 'Week 2 - Fundamentals',
        date: new Date('2024-03-15'),
        published: true,
        content: []
    };
    const content2Result = generator.contentID(content2, 'CHBE241');
    console.log(`\nTest 2 - Content: "${content2.title}", Course: "CHBE241", Date: ${content2.date.toISOString()}`);
    console.log(`Output: ${content2Result}`);
    console.log(`Uniqueness check: ${areIDsDifferent(content1Result, content2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Same content, different course
    const content3Result = generator.contentID(content1, 'MTRL251');
    console.log(`\nTest 3 - Content: "${content1.title}", Course: "MTRL251", Date: ${content1.date.toISOString()}`);
    console.log(`Output: ${content3Result}`);
    console.log(`Uniqueness check (different course): ${areIDsDifferent(content1Result, content3Result) ? 'PASS' : 'FAIL'}`);
}

// Test subContentID function
function testSubContentID() {
    console.log('\n=== Testing subContentID ===');

    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility

    // Test case 1: Basic subcontent
    const subContent1: CourseContent = {
        id: 'sub1',
        title: 'Lecture 1.1 - Basic Concepts',
        date: new Date('2024-03-15'),
        completed: false,
        learningObjectives: [],
        additionalMaterials: []
    };
    const subContent1Result = generator.subContentID(subContent1, 'Week 1 - Introduction', 'CHBE241');
    console.log(`Test 1 - SubContent: "${subContent1.title}", Content: "Week 1 - Introduction", Course: "CHBE241"`);
    console.log(`Output: ${subContent1Result}`);
    console.log(`Length check: ${subContent1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(subContent1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different subcontent, same hierarchy
    const subContent2: CourseContent = {
        id: 'sub2',
        title: 'Lecture 1.2 - Advanced Concepts',
        date: new Date('2024-03-15'),
        completed: false,
        learningObjectives: [],
        additionalMaterials: []
    };
    const subContent2Result = generator.subContentID(subContent2, 'Week 1 - Introduction', 'CHBE241');
    console.log(`\nTest 2 - SubContent: "${subContent2.title}", Content: "Week 1 - Introduction", Course: "CHBE241"`);
    console.log(`Output: ${subContent2Result}`);
    console.log(`Uniqueness check: ${areIDsDifferent(subContent1Result, subContent2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Same subcontent, different content
    const subContent3Result = generator.subContentID(subContent1, 'Week 2 - Fundamentals', 'CHBE241');
    console.log(`\nTest 3 - SubContent: "${subContent1.title}", Content: "Week 2 - Fundamentals", Course: "CHBE241"`);
    console.log(`Output: ${subContent3Result}`);
    console.log(`Uniqueness check (different content): ${areIDsDifferent(subContent1Result, subContent3Result) ? 'PASS' : 'FAIL'}`);
}

// Test learningObjectiveID function
function testLearningObjectiveID() {
    console.log('\n=== Testing learningObjectiveID ===');

    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility

    // Test case 1: Basic learning objective
    const learningObj1: LearningObjective = {
        id: 'lo1',
        title: 'Understand basic chemical processes',
        date: new Date('2024-03-15'),
        description: 'Students will understand the fundamental chemical processes',
        uploaded: false
    };
    const learningObj1Result = generator.learningObjectiveID(
        learningObj1,
        'Lecture 1.1 - Basic Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`Test 1 - Learning Obj: "${learningObj1.title}"`);
    console.log(`Hierarchy: "Lecture 1.1" -> "Week 1" -> "CHBE241", Date: ${learningObj1.date.toISOString()}`);
    console.log(`Output: ${learningObj1Result}`);
    console.log(`Length check: ${learningObj1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(learningObj1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different learning objective, same hierarchy
    const learningObj2: LearningObjective = {
        id: 'lo2',
        title: 'Apply chemical principles to real-world scenarios',
        date: new Date('2024-03-15'),
        description: 'Students will apply chemical principles to real-world scenarios',
        uploaded: false
    };
    const learningObj2Result = generator.learningObjectiveID(
        learningObj2,
        'Lecture 1.1 - Basic Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`\nTest 2 - Learning Obj: "${learningObj2.title}"`);
    console.log(`Same hierarchy and date as Test 1`);
    console.log(`Output: ${learningObj2Result}`);
    console.log(`Uniqueness check: ${areIDsDifferent(learningObj1Result, learningObj2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Same learning objective, different subcontent
    const learningObj3Result = generator.learningObjectiveID(
        learningObj1,
        'Lecture 1.2 - Advanced Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`\nTest 3 - Same Learning Obj, Different SubContent: "Lecture 1.2"`);
    console.log(`Output: ${learningObj3Result}`);
    console.log(`Uniqueness check (different subcontent): ${areIDsDifferent(learningObj1Result, learningObj3Result) ? 'PASS' : 'FAIL'}`);
}

// Test uploadContentID function
function testUploadContentID() {
    console.log('\n=== Testing uploadContentID ===');

    const generator = new IDGenerator('12345'); // Using a fixed seed for reproducibility

    // Test case 1: Basic upload content
    const uploadContent1: AdditionalMaterial = {
        id: 'upload1',
        name: 'Chemical Process Flow Diagram.pdf',
        date: new Date('2024-03-15'),
        sourceType: 'file',
        uploaded: false
    };
    const uploadContent1Result = generator.uploadContentID(
        uploadContent1,
        'Lecture 1.1 - Basic Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`Test 1 - Upload: "${uploadContent1.name}"`);
    console.log(`Hierarchy: "Lecture 1.1" -> "Week 1" -> "CHBE241", Date: ${uploadContent1.date.toISOString()}`);
    console.log(`Output: ${uploadContent1Result}`);
    console.log(`Length check: ${uploadContent1Result.length === 12 ? 'PASS' : 'FAIL'}`);
    console.log(`Hex format check: ${isValidHex(uploadContent1Result) ? 'PASS' : 'FAIL'}`);

    // Test case 2: Different upload, same hierarchy
    const uploadContent2: AdditionalMaterial = {
        id: 'upload2',
        name: 'Reference Materials.pdf',
        date: new Date('2024-03-15'),
        sourceType: 'file',
        uploaded: false
    };
    const uploadContent2Result = generator.uploadContentID(
        uploadContent2,
        'Lecture 1.1 - Basic Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`\nTest 2 - Upload: "${uploadContent2.name}"`);
    console.log(`Same hierarchy and date as Test 1`);
    console.log(`Output: ${uploadContent2Result}`);
    console.log(`Uniqueness check: ${areIDsDifferent(uploadContent1Result, uploadContent2Result) ? 'PASS' : 'FAIL'}`);

    // Test case 3: Same upload, different subcontent
    const uploadContent3Result = generator.uploadContentID(
        uploadContent1,
        'Lecture 1.2 - Advanced Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`\nTest 3 - Same Upload, Different SubContent: "Lecture 1.2"`);
    console.log(`Output: ${uploadContent3Result}`);
    console.log(`Uniqueness check (different subcontent): ${areIDsDifferent(uploadContent1Result, uploadContent3Result) ? 'PASS' : 'FAIL'}`);

    // Test case 4: Different source types
    const uploadContent4: AdditionalMaterial = {
        id: 'upload4',
        name: 'Online Tutorial Link',
        date: new Date('2024-03-15'),
        sourceType: 'url',
        url: 'https://example.com/tutorial',
        uploaded: false
    };
    const uploadContent4Result = generator.uploadContentID(
        uploadContent4,
        'Lecture 1.1 - Basic Concepts',
        'Week 1 - Introduction',
        'CHBE241'
    );
    console.log(`\nTest 4 - Upload: "${uploadContent4.name}" (URL source type)`);
    console.log(`Output: ${uploadContent4Result}`);
    console.log(`Uniqueness check (different source type): ${areIDsDifferent(uploadContent1Result, uploadContent4Result) ? 'PASS' : 'FAIL'}`);
}

// Test hierarchical uniqueness across all ID types
function testHierarchicalUniqueness() {
    console.log('\n=== Testing Hierarchical Uniqueness ===');

    const generator = new IDGenerator('12345');

    // Create sample objects with same base data but different types
    const course: activeClass = {
        id: 'course1',
        name: 'CHBE241',
        date: new Date('2024-03-15'),
        onBoarded: true,
        instructors: ['Dr. Smith'],
        teachingAssistants: ['TA One'],
        frameType: 'byWeek',
        tilesNumber: 12,
        content: []
    };

    const content: ContentDivision = {
        id: 'content1',
        title: 'CHBE241',
        date: new Date('2024-03-15'),
        published: true,
        content: []
    };

    const subContent: CourseContent = {
        id: 'sub1',
        title: 'CHBE241',
        date: new Date('2024-03-15'),
        completed: false,
        learningObjectives: [],
        additionalMaterials: []
    };

    const learningObj: LearningObjective = {
        id: 'lo1',
        title: 'Learning Objective: Basic Concepts',
        date: new Date('2024-03-15'),
        description: 'Students will understand basic concepts',
        uploaded: false
    };

    const uploadContent: AdditionalMaterial = {
        id: 'upload1',
        name: 'Course Materials Document.pdf',
        date: new Date('2024-03-15'),
        sourceType: 'file',
        uploaded: false
    };

    // Generate IDs for each level
    const courseId = generator.courseID(course);
    const contentId = generator.contentID(content, 'CHBE241');
    const subContentId = generator.subContentID(subContent, 'Week 1', 'CHBE241');
    const learningObjId = generator.learningObjectiveID(learningObj, 'Lecture 1', 'Week 1', 'CHBE241');
    const uploadId = generator.uploadContentID(uploadContent, 'Lecture 1', 'Week 1', 'CHBE241');

    console.log(`Course ID: ${courseId}`);
    console.log(`Content ID: ${contentId}`);
    console.log(`SubContent ID: ${subContentId}`);
    console.log(`Learning Objective ID: ${learningObjId}`);
    console.log(`Upload Content ID: ${uploadId}`);

    // Check that all IDs are unique
    const allIds = [courseId, contentId, subContentId, learningObjId, uploadId];
    const uniqueIds = new Set(allIds);
    console.log(`\nAll IDs are unique: ${uniqueIds.size === allIds.length ? 'PASS' : 'FAIL'}`);
    console.log(`Total unique IDs: ${uniqueIds.size} out of ${allIds.length}`);
}

// Run all tests
console.log('Starting unique-id-generator tests...');
testUniqueIDGenerator();
testCourseID();
testContentID();
testSubContentID();
testLearningObjectiveID();
testUploadContentID();
testHierarchicalUniqueness();
console.log('\nAll tests completed.');
