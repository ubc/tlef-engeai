

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
    User
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
 * const divisionId = generator.divisionID(division, 'CHBE241');
 * ```
 */
export class IDGenerator {
    private static instance: IDGenerator | null = null;

    /**
     * Creates a new IDGenerator instance for deterministic ID generation.
     * Private constructor to enforce singleton pattern.
     *
     * @constructor
     * @private
     */
    private constructor() {
        
    }

    /**
     * Gets the singleton instance of IDGenerator
     * 
     * @returns The singleton IDGenerator instance
     */
    public static getInstance(): IDGenerator {
        if (!IDGenerator.instance) {
            IDGenerator.instance = new IDGenerator();
        }
        return IDGenerator.instance;
    }

    /**
     * Generates a unique Course ID using the formula:
     * coursename + "-" + coursebuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param activeCourse - The active course object containing name and date
     * @returns A 12-character hexadecimal string representing the unique course ID
     */
    courseID(activeCourse : activeCourse) : string {
        const courseName = activeCourse.courseName;
        const courseDate = activeCourse.date.toISOString(); // Full ISO string with milliseconds

        const hashInput = courseName + "-" + courseDate;
        console.log(hashInput);

        return this.uniqueIDGenerator(hashInput);
    }


    /**
     * Generates a unique Division ID using the formula:
     * divisiontitle + "-" + coursename + "-" + divisionbuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     *
     * @param contentDivision - The content division object containing title and date information
     * @param courseName - The name of the parent course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique division ID
     */
    divisionID(contentDivision: ContentDivision, courseName: string): string {
        const divisionTitle = contentDivision.title;
        const divisionDate = contentDivision.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = divisionTitle + "-" + courseName + "-" + divisionDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Item ID using the formula:
     * itemtitle + "-" + divisiontitle + "-" + coursename + "-" + itembuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param courseItem - The course content object containing title and date information
     * @param divisionTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique item ID
     */
    itemID(courseItem: courseItem, divisionTitle: string, courseName: string): string {
        const itemTitle = courseItem.title;
        const itemDate = courseItem.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = itemTitle + "-" + divisionTitle + "-" + courseName + "-" + itemDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Learning Objective ID using the formula:
     * learningobjectivestitle + "-" + itemtitle + "-" + divisiontitle + "-" + coursename + "-" + learningobjectivebuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param learningObjective - The learning objective object containing title and date information
     * @param itemTitle - The title of the parent course item
     * @param divisionTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique learning objective ID
     */
    learningObjectiveID(learningObjective: LearningObjective, itemTitle: string, divisionTitle: string, courseName: string): string {
        const learningObjectiveTitle = learningObjective.LearningObjective;
        const learningObjectiveDate = learningObjective.createdAt.toISOString(); // Full ISO string with milliseconds
        const hashInput = learningObjectiveTitle + "-" + itemTitle + "-" + divisionTitle + "-" + courseName + "-" + learningObjectiveDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Upload Content ID using the formula:
     * uploadcontenttitle + "-" + itemtitle + "-" + divisiontitle + "-" + coursename + "-" + uploadcontentdate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param additionalMaterial - The additional material/upload content object containing name and date information
     * @param itemTitle - The title of the parent course item
     * @param divisionTitle - The title of the parent content division
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique upload content ID
     */
    uploadContentID(additionalMaterial: AdditionalMaterial, itemTitle: string, divisionTitle: string, courseName: string): string {
        const uploadContentTitle = additionalMaterial.name;
        const uploadContentDate = additionalMaterial.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = uploadContentTitle + "-" + itemTitle + "-" + divisionTitle + "-" + courseName + "-" + uploadContentDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Create a chatID given a user ID
     * 
     * @param userID - The user ID
     * @param courseName - The name of the course
     * @param date - The date of the chat (full ISO string with milliseconds)
     * @returns A 12-character hexadecimal string representing the unique chat ID
     */
    chatID(userID: string, courseName: string, date: Date): string {
        const dateString = date.toISOString(); // Full ISO string with milliseconds
        const hashInput = userID + "-" + courseName + "-" + dateString;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Create a messageID given the first 10 words of a message, chatID, and date
     * 
     * @param messageText - The message text to extract first 10 words from
     * @param chatID - The chat ID
     * @param date - The date of the message (full ISO string with milliseconds)
     * @returns A 12-character hexadecimal string representing the unique message ID
     */
    messageID(messageText: string, chatID: string, date: Date): string {
        // Extract first 10 words from message text
        const firstTenWords = messageText.split(' ').slice(0, 10).join(' ');
        const dateString = date.toISOString(); // Full ISO string with milliseconds
        const hashInput = firstTenWords + "-" + chatID + "-" + dateString;
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
     * Generates a unique flag ID using the formula:
     * flag_timestamp_randomsuffix_userId -> uniqueIDGenerator
     * 
     * @param userId - The user ID
     * @param courseName - The name of the course
     * @param date - The date of the flag (full ISO string with milliseconds)
     * @returns A 12-character hexadecimal string representing the unique flag ID
     */
    flagIDGenerator(userId: string, courseName: string, date: Date): string {
        const dateString = date.toISOString(); // Full ISO string with milliseconds
        const hashInput = "flag_" + userId + "-" + courseName + "-" + dateString;
        return this.uniqueIDGenerator(hashInput);
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
     * puid + "-" + name + "-" + role + "-" + activeCourseName -> uniqueIDGenerator
     *
     * @param userDB - The user object containing puid, name, role, and active course name
     * @returns A 12-character hexadecimal string representing the unique user ID
     */
    userID(userDB: User): string {
        const hashInput = userDB.puid + "-" + userDB.name + "-" + userDB.role + "-" + userDB.activeCourseName;
        return this.uniqueIDGenerator(hashInput);
    }
      
}
