

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
    TopicOrWeekInstance, 
    TopicOrWeekItem, 
    LearningObjective, 
    AdditionalMaterial, 
    CourseUser
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
 * const topicOrWeekId = generator.topicOrWeekID(instance, 'CHBE241');
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
     * Generates a unique Topic/Week Instance ID using the formula:
     * topicOrWeekTitle + "-" + coursename + "-" + instanceBuildDate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     *
     * @param topicOrWeekInstance - The topic or week instance object containing title and date information
     * @param courseName - The name of the parent course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique topic/week instance ID
     */
    topicOrWeekID(topicOrWeekInstance: TopicOrWeekInstance, courseName: string): string {
        const topicOrWeekTitle = topicOrWeekInstance.title;
        const instanceDate = topicOrWeekInstance.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = topicOrWeekTitle + "-" + courseName + "-" + instanceDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Item ID using the formula:
     * itemtitle + "-" + topicOrWeekTitle + "-" + coursename + "-" + itembuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param topicOrWeekItem - The course content object containing title and date information
     * @param topicOrWeekTitle - The title of the parent topic or week instance
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique item ID
     */
    itemID(topicOrWeekItem: TopicOrWeekItem, topicOrWeekTitle: string, courseName: string): string {
        const itemTitle = topicOrWeekItem.title;
        const itemDate = topicOrWeekItem.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = itemTitle + "-" + topicOrWeekTitle + "-" + courseName + "-" + itemDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Learning Objective ID using the formula:
     * learningobjectivestitle + "-" + itemtitle + "-" + topicOrWeekTitle + "-" + coursename + "-" + learningobjectivebuilddate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param learningObjective - The learning objective object containing title and date information
     * @param itemTitle - The title of the parent course item
     * @param topicOrWeekTitle - The title of the parent topic or week instance
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique learning objective ID
     */
    learningObjectiveID(learningObjective: LearningObjective, itemTitle: string, topicOrWeekTitle: string, courseName: string): string {
        const learningObjectiveTitle = learningObjective.LearningObjective;
        const learningObjectiveDate = learningObjective.createdAt.toISOString(); // Full ISO string with milliseconds
        const hashInput = learningObjectiveTitle + "-" + itemTitle + "-" + topicOrWeekTitle + "-" + courseName + "-" + learningObjectiveDate;

        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique Upload Content ID using the formula:
     * uploadcontenttitle + "-" + itemtitle + "-" + topicOrWeekTitle + "-" + coursename + "-" + uploadcontentdate (full ISO string with milliseconds) -> uniqueIDGenerator
     *
     * @param additionalMaterial - The additional material/upload content object containing name and date information
     * @param itemTitle - The title of the parent course item
     * @param topicOrWeekTitle - The title of the parent topic or week instance
     * @param courseName - The name of the course for hierarchical uniqueness
     * @returns A 12-character hexadecimal string representing the unique upload content ID
     */
    uploadContentID(additionalMaterial: AdditionalMaterial, itemTitle: string, topicOrWeekTitle: string, courseName: string): string {
        const uploadContentTitle = additionalMaterial.name;
        const uploadContentDate = additionalMaterial.date.toISOString(); // Full ISO string with milliseconds
        const hashInput = uploadContentTitle + "-" + itemTitle + "-" + topicOrWeekTitle + "-" + courseName + "-" + uploadContentDate;

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
     * first20CharsOfAIMessage + "-" + userId + "-" + courseName + "-" + dateString -> uniqueIDGenerator
     * 
     * @param aiMessageText - The AI message text that was flagged (first 20 characters will be used)
     * @param userId - The user ID who created the flag
     * @param courseName - The name of the course
     * @param date - The date of the flag (full ISO string with milliseconds)
     * @returns A 12-character hexadecimal string representing the unique flag ID
     */
    flagIDGenerator(aiMessageText: string, userId: string, courseName: string, date: Date): string {
        // Extract first 20 characters from AI message text
        const firstTwentyChars = aiMessageText.substring(0, 20).trim();
        const dateString = date.toISOString(); // Full ISO string with milliseconds
        const hashInput = firstTwentyChars + "-" + userId + "-" + courseName + "-" + dateString;
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
     * Generates a unique User ID for GlobalUser using the formula:
     * puid + "-" + name + "-" + affiliation + "-global" -> uniqueIDGenerator
     * 
     * This generates a userId that is consistent across all courses for a user.
     * The userId is stored in GlobalUser and then referenced in CourseUser.
     *
     * @param puid - Privacy-focused Unique Identifier
     * @param name - User's full name
     * @param affiliation - User's affiliation ('student' | 'faculty')
     * @returns A 12-character hexadecimal string representing the unique user ID
     */
    globalUserID(puid: string, name: string, affiliation: string): string {
        const hashInput = puid + "-" + name + "-" + affiliation + "-global";
        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * Generates a unique 6-character uppercase alphanumeric course code using the formula:
     * courseName + "-" + date.toISOString() -> uniqueIDGenerator -> convert to 6-char uppercase alphanumeric
     * 
     * This generates a course code that can be shared with students for PIN-based course entry.
     * The code is deterministic based on course name and creation date.
     *
     * @param courseName - The name of the course
     * @param date - The date when the course was created
     * @returns A 6-character uppercase alphanumeric string (A-Z, 0-9)
     */
    courseCodeID(courseName: string, date: Date): string {
        const hashInput = courseName + "-" + date.toISOString();
        const hexResult = this.uniqueIDGenerator(hashInput);
        
        // Convert 12-character hex to 6-character uppercase alphanumeric
        // Take pairs of hex digits (0-255) and map to alphanumeric (0-9, A-Z = 36 chars)
        let courseCode = '';
        
        for (let i = 0; i < 6; i++) {
            // Take pairs of hex characters
            const hexPair = hexResult.substring(i * 2, (i * 2) + 2);
            const decimalValue = parseInt(hexPair, 16); // 0-255
            const alphanumericIndex = decimalValue % 36; // 0-35
            
            if (alphanumericIndex < 10) {
                // 0-9: use digits
                courseCode += alphanumericIndex.toString();
            } else {
                // 10-35: use letters A-Z
                courseCode += String.fromCharCode(65 + (alphanumericIndex - 10)); // A-Z
            }
        }
        
        return courseCode;
    }

    /**
     * Generates a unique Initial Assistant Prompt ID using the formula:
     * title + "-" + courseName + "-" + date.toISOString() -> uniqueIDGenerator
     *
     * @param title - The title of the initial assistant prompt
     * @param courseName - The name of the course
     * @param date - The date when the prompt was created
     * @returns A 12-character hexadecimal string representing the unique prompt ID
     */
    initialAssistantPromptID(title: string, courseName: string, date: Date): string {
        const dateString = date.toISOString(); // Full ISO string with milliseconds
        const hashInput = title + "-" + courseName + "-" + dateString;
        return this.uniqueIDGenerator(hashInput);
    }

    /**
     * @deprecated Use globalUserID instead. This method is kept for backward compatibility
     * but CourseUser no longer contains puid, so this method cannot work correctly.
     * 
     * Generates a unique User ID using the formula:
     * puid + "-" + name + "-" + role + "-" + activeCourseName -> uniqueIDGenerator
     *
     * @param userDB - The user object containing puid, name, role, and active course name
     * @returns A 12-character hexadecimal string representing the unique user ID
     */
    userID(userDB: CourseUser): string {
        // This method is deprecated - CourseUser no longer has puid
        // Use globalUserID instead for generating userId from GlobalUser data
        const hashInput = userDB.name + "-" + userDB.affiliation + "-" + userDB.courseName;
        return this.uniqueIDGenerator(hashInput);
    }
      
}
