// IDGenerator.test.ts
import assert from "node:assert";
import { IDGenerator } from "../functions/unique-id-generator";
import { activeCourse, ContentDivision, courseItem, LearningObjective, AdditionalMaterial } from "../functions/types";
import { frameType } from "../functions/types";
const generator = new IDGenerator();

// Mock data
const mockClass: activeCourse = {
  id: '12345',
  courseName: "CHBE241",
  date: new Date("2025-09-01"),
  instructors: ['John Doe'],
  teachingAssistants: ['Jane Doe'],
  onBoarded: true,
  frameType: 'byWeek',
  tilesNumber: 10,
  divisions: []
};

const mockContent: ContentDivision = { 
    id: '12345', 
    courseName: "CHBE241",
    title: "Thermodynamics", 
    date: new Date("2025-09-02"), 
    published: true,
    items: [],
    createdAt: new Date("2025-09-02"),
    updatedAt: new Date("2025-09-02")
};

const mockSubContent: courseItem = { 
    id: '12345', 
    title: "Entropy Laws",
    courseName: "CHBE241",
    divisionTitle: "Thermodynamics",
    itemTitle: "Entropy Laws",
    date: new Date("2025-09-03"),
    completed: false,
    learningObjectives: [],
    additionalMaterials: [],
    createdAt: new Date("2025-09-03"),
    updatedAt: new Date("2025-09-03")
};

const mockObjective: LearningObjective = { 
    id: '12345', 
    content: "Apply the second law of thermodynamics to a real-world problem",
    courseName: "CHBE241",
    divisionTitle: "Thermodynamics",
    itemTitle: "Entropy Laws",
    subcontentTitle: "Apply Second Law",
    createdAt: new Date("2025-09-04"),
    updatedAt: new Date("2025-09-04")
};

const mockUpload: AdditionalMaterial = { 
    id: '12345', 
    name: "Lecture Notes", 
    date: new Date("2025-09-05"), 
    courseName: "CHBE241", 
    divisionTitle: "Thermodynamics",
    itemTitle: "Entropy Laws",
    sourceType: "text", 
    uploaded: false, 
    text: "Thermodynamics",
    createdAt: new Date("2025-09-05"),
    updatedAt: new Date("2025-09-05")
};

// Run tests
function runTests() {

  const testCase = "C";
  const testCaseId = generator.hash48hex(testCase);
  assert.match(testCaseId, /^[0-9a-f]{12}$/, "testCaseId should be 12-char hex");


  const courseId = generator.courseID(mockClass);
  console.log("Generated courseID:", courseId);
  assert.match(courseId, /^[0-9a-f]{12}$/, "courseID should be 12-char hex");

  const contentId1 = generator.contentID(mockContent, mockClass.courseName);
  const contentId2 = generator.contentID(mockContent, mockClass.courseName);
  assert.strictEqual(contentId1, contentId2, "contentID should be deterministic");

  const subId = generator.subContentID(mockSubContent, mockContent.title, mockClass.courseName);
  assert.match(subId, /^[0-9a-f]{12}$/, "subContentID should be 12-char hex");

  const objectiveId1 = generator.learningObjectiveID(
    mockObjective, mockSubContent.title, mockContent.title, mockClass.courseName
  );
  const objectiveId2 = generator.learningObjectiveID(
    mockObjective, mockSubContent.title, mockContent.title, mockClass.courseName
  );
  assert.strictEqual(objectiveId1, objectiveId2, "learningObjectiveID should be deterministic");

  const uploadId = generator.uploadContentID(mockUpload, mockSubContent.title, mockContent.title, mockClass.courseName);
  assert.match(uploadId, /^[0-9a-f]{12}$/, "uploadContentID should be 12-char hex");

  const uniqueId1 = generator.uniqueIDGenerator("foo");
  const uniqueId2 = generator.uniqueIDGenerator("bar");
  assert.notStrictEqual(uniqueId1, uniqueId2, "different inputs should not collide easily");

  console.log("✅ All IDGenerator tests passed!");
}

runTests();
