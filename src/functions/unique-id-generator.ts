

/**
 * ===========================================
 * ========= ID GENERATION ALGORITHM ========
 * ===========================================
 *
 * All IDs are generated using a two-step xxHash32 process:
 *
 * Step 1: Hash the input string with seed -> Convert to hex
 * Step 2: Hash the result again with same seed -> Convert to hex
 * Step 3: Concatenate and take first 12 characters
 *
 * This double-hashing approach provides:
 * - Collision resistance: Extremely low probability of duplicates
 * - Deterministic output: Same input always produces same ID
 * - Fixed length: All IDs are exactly 12 hexadecimal characters
 * - Scalability: Supports billions of unique items per level
 *
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-28
 * 
 */


import { 
    activeCourse, 
    ContentDivision, 
    courseItem, 
    LearningObjective, 
    AdditionalMaterial, 
    UserDB
} from "./types";

/**
 * ===========================================
 * ========= IDGENERATOR CLASS ==============
 * ===========================================
 *
 * The core ID generation engine for EngE-AI's hierarchical content system.
 * This class provides deterministic, collision-resistant unique identifier generation
 * for all levels of the course content hierarchy using xxHash32 double-hashing.
 *
 * @class IDGenerator
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Create generator with consistent seed for reproducible IDs
 * const generator = new IDGenerator('12345');
 *
 * // Generate IDs for different content levels
 * const courseId = generator.courseID(course);
 * const contentId = generator.contentID(content, 'CHBE241');
 * ```
 */
export class IDGenerator {


    /**
     * Creates a new IDGenerator instance for deterministic ID generation.
     *
     * @constructor
     */
    constructor() {
        
    }

    /**
     * Generates a unique Course ID using the formula:
     * coursename + "-" + coursebuilddate -> uniqueIDGenerator
     *
     * @param currentClass - The active class/course object containing name and date
     * @returns A 12-character hexadecimal string representing the unique course ID
     */
    courseID(currentCourse : activeCourse) : string {
        const courseName = currentCourse.courseName;
        const courseDate = currentCourse.date.toISOString().split('T')[0];

        const hashInput = courseName + "-" + courseDate;
        console.log(hashInput);

        return this.uniqueIDGenerator(hashInput);
    }


    /**
     * Generates a unique Content ID using the formula:
     * contenttitle + "-" + coursename + "-" + contentbuilddate -> uniqueIDGenerator
     *
     *
     * @param content - The content division object containing title and date information
     * @param courseName - The name of the parent course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique content ID
     */
    contentID(content: ContentDivision, courseName: string): string {
        const contentTitle = content.title;
        const contentDate = content.date.toISOString().split('T')[0];
        const hashInput = contentTitle + "-" + courseName + "-" + contentDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique SubContent ID using the formula:
     * subcontenttitle + "-" + contenttitle + "-" + coursename + "-" + subcontentbuilddate -> uniqueIDGenerator
     *
     * @param subContent - The course content object containing title and date information
     * @param contentTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique subcontent ID
     */
    subContentID(subContent: courseItem, contentTitle: string, courseName: string): string {
        const subContentTitle = subContent.title;
        const subContentDate = subContent.date.toISOString().split('T')[0];
        const hashInput = subContentTitle + "-" + contentTitle + "-" + courseName + "-" + subContentDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Learning Objective ID using the formula:
     * learningobjectivestitle + "-" + subcontenttitle + "-" + contenttitle + "-" + coursename + "-" + learningobjectivebuilddate -> uniqueIDGenerator
     *
     * @param learningObjective - The learning objective object containing title and date information
     * @param subContentTitle - The title of the parent subcontent
     * @param contentTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique learning objective ID
     */
    learningObjectiveID(learningObjective: LearningObjective, subContentTitle: string, contentTitle: string, courseName: string): string {
        const learningObjectiveTitle = learningObjective.content;
        const learningObjectiveDate = learningObjective.createdAt.toISOString().split('T')[0];
        const hashInput = learningObjectiveTitle + "-" + subContentTitle + "-" + contentTitle + "-" + courseName + "-" + learningObjectiveDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Upload Content ID using the formula:
     * uploadcontenttitle + "-" + subcontenttitle + "-" + contenttitle + "-" + coursename + "-" + uploadcontentdate -> uniqueIDGenerator
     *
     * @param uploadContent - The additional material/upload content object containing name and date information
     * @param subContentTitle - The title of the parent subcontent
     * @param contentTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique upload content ID
     */
    uploadContentID(uploadContent: AdditionalMaterial, subContentTitle: string, contentTitle: string, courseName: string): string {
        const uploadContentTitle = uploadContent.name;
        const uploadContentDate = uploadContent.date.toISOString().split('T')[0];
        const hashInput = uploadContentTitle + "-" + subContentTitle + "-" + contentTitle + "-" + courseName + "-" + uploadContentDate;

        return this.uniqueIDGenerator(hashInput);
    }

        /**
     * Core ID generation method using double xxHash32 hashing.
     *
     * This is the fundamental hashing algorithm used by all ID generation methods.
     * It implements a two-step hashing process for enhanced collision resistance:
     * 1. Hash input string with seed
     * 2. Hash the result again with same seed
     * 3. Concatenate and truncate to 12 characters
     *
     * @private
     * @param input - The string to be hashed
     * @returns A 12-character hexadecimal string (collision-resistant ID)
     *
     * @example
     * ```typescript
     * const generator = new IDGenerator('12345');
     * const id = generator.uniqueIDGenerator('test-input');
     * // Returns: "cd8ce4888b16"
     * ```
     *
     * @internal This method is called internally by all public ID generation methods
     */
    uniqueIDGenerator(input : string) : string {
        const hashResult = this.hash48hex(input);
        return hashResult;
    }

    /**
     * 48-bit non-cryptographic hash in TypeScript
     * @param input - The string to be hashed
     * @returns A 12-character hexadecimal string (collision-resistant ID)
     */
    hash48hex(input: string): string {
        const data = new TextEncoder().encode(input);
      
        // Two independent 32-bit lanes
        let h1 = 0x9e3779b9 | 0;
        let h2 = 0x85ebca6b | 0;
      
        for (const b of data) {
          // Lane 1 (murmur-ish)
          h1 ^= b;
          h1 = Math.imul(h1, 0x85ebca6b);
          h1 ^= h1 >>> 13;
          h1 = Math.imul(h1, 0xc2b2ae35);
          h1 ^= h1 >>> 16;
      
          // Lane 2 (different constants/rotations)
          let x = (h2 ^ (b + 0x9e3779b9)) | 0;
          x = Math.imul(x, 0x27d4eb2d);
          x ^= x >>> 15;
          x = Math.imul(x, 0x165667b1);
          x ^= x >>> 17;
          h2 = x | 0;
        }
      
        const lo32 = h1 >>> 0;            // 32 low bits
        const hi16 = (h2 >>> 0) & 0xffff; // 16 high bits
        const value48 = hi16 * 0x100000000 + lo32; // (hi16 << 32) + lo32, exact in JS number
      
        return value48.toString(16).padStart(12, "0");
    }

    /**
     * Generates a unique User ID using the formula:
     * UBCID + "-" + name + "-" + role + "-" + activeCourseName -> uniqueIDGenerator
     *
     * @param user - The user object containing UBCID, name, role, and active course name
     * @returns A 12-character hexadecimal string representing the unique user ID
     */
    userID(user: UserDB): string {
        const hashInput = user.UBCID + "-" + user.name + "-" + user.role + "-" + user.activeCourseName;
        return this.uniqueIDGenerator(hashInput);
    }
      
}
