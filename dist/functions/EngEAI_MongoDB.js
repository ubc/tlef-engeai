"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngEAI_MongoDB = void 0;
const mongodb_1 = require("mongodb");
const dotenv = __importStar(require("dotenv"));
const types_1 = require("./types");
const unique_id_generator_1 = require("./unique-id-generator");
const chat_prompts_1 = require("./chat-prompts");
dotenv.config();
class EngEAI_MongoDB {
    constructor() {
        // Course management methods
        this.postActiveCourse = (course) => __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if course already exists - prevent duplicates
                const existingCourse = yield this.getActiveCourse(course.id);
                if (existingCourse) {
                    console.log(`⚠️ Course with id ${course.id} already exists, skipping creation`);
                    return;
                }
                //use singleton's DB
                const courseName = course.courseName;
                // Generate course code if it doesn't exist
                let courseCode;
                if (course.courseCode) {
                    // Use existing courseCode if provided
                    courseCode = course.courseCode;
                }
                else {
                    // Generate new course code with uniqueness check
                    let attempts = 0;
                    const maxAttempts = 10;
                    let codeDate = course.date;
                    do {
                        courseCode = this.idGenerator.courseCodeID(courseName, codeDate);
                        const existingCourseWithCode = yield this.getCourseCollection().findOne({ courseCode: courseCode });
                        if (!existingCourseWithCode) {
                            // Code is unique, break out of loop
                            break;
                        }
                        // Code exists, try with slightly modified date (add milliseconds)
                        attempts++;
                        codeDate = new Date(codeDate.getTime() + attempts);
                        console.log(`[COURSE-CODE] Duplicate code found, retrying with modified date (attempt ${attempts})`);
                    } while (attempts < maxAttempts);
                    if (attempts >= maxAttempts) {
                        console.error(`[COURSE-CODE] ⚠️ Failed to generate unique course code after ${maxAttempts} attempts`);
                        // Still use the generated code (very low probability of collision)
                    }
                    console.log(`[COURSE-CODE] Generated course code: ${courseCode} for course: ${courseName}`);
                }
                //create users collection (idempotent - won't throw if exists)
                const userCollection = `${courseName}_users`;
                try {
                    yield this.db.createCollection(userCollection);
                }
                catch (error) {
                    // Ignore NamespaceExists error (collection already exists)
                    if (error.codeName !== 'NamespaceExists') {
                        throw error;
                    }
                }
                //create flags collection (idempotent - won't throw if exists)
                const flagsCollection = `${courseName}_flags`;
                try {
                    yield this.db.createCollection(flagsCollection);
                }
                catch (error) {
                    // Ignore NamespaceExists error (collection already exists)
                    if (error.codeName !== 'NamespaceExists') {
                        throw error;
                    }
                }
                //create memory-agent collection (idempotent - won't throw if exists)
                const memoryAgentCollection = `${courseName}_memory-agent`;
                try {
                    yield this.db.createCollection(memoryAgentCollection);
                }
                catch (error) {
                    // Ignore NamespaceExists error (collection already exists)
                    if (error.codeName !== 'NamespaceExists') {
                        throw error;
                    }
                }
                // Store collection names and course code in course document
                const courseWithCollections = Object.assign(Object.assign({}, course), { courseCode: courseCode, collections: {
                        users: userCollection,
                        flags: flagsCollection,
                        memoryAgent: memoryAgentCollection
                    } });
                yield this.getCourseCollection().insertOne(courseWithCollections);
                // Create indexes for optimal performance
                try {
                    const indexResult = yield this.createFlagIndexes(courseName);
                    if (indexResult.success) {
                        console.log(`✅ Created ${indexResult.indexesCreated.length} indexes for course: ${courseName}`);
                    }
                    else {
                        console.warn(`⚠️ Some indexes failed to create for course: ${courseName}`, indexResult.errors);
                    }
                }
                catch (indexError) {
                    console.error(`❌ Error creating indexes for course ${courseName}:`, indexError);
                    // Don't fail course creation if index creation fails
                }
            }
            catch (error) {
                console.error('Error creating collections and schemas:', error);
                // Re-throw the error so callers know it failed
                throw error;
            }
        });
        this.getActiveCourse = (id) => __awaiter(this, void 0, void 0, function* () {
            return yield this.getCourseCollection().findOne({ id: id });
        });
        this.getActiveCourseByCode = (courseCode) => __awaiter(this, void 0, void 0, function* () {
            return yield this.getCourseCollection().findOne({ courseCode: courseCode });
        });
        this.getCourseByName = (name) => __awaiter(this, void 0, void 0, function* () {
            // Try exact match first
            let course = yield this.getCourseCollection().findOne({ courseName: name });
            // If no exact match, try case-insensitive search
            if (!course) {
                course = yield this.getCourseCollection().findOne({
                    courseName: { $regex: new RegExp(`^${name.replace(/\s+/g, '\\s*')}$`, 'i') }
                });
            }
            return course;
        });
        this.getAllActiveCourses = () => __awaiter(this, void 0, void 0, function* () {
            return yield this.getCourseCollection().find({}).toArray();
        });
        this.updateActiveCourse = (id, updateData) => __awaiter(this, void 0, void 0, function* () {
            const result = yield this.getCourseCollection().findOneAndUpdate({ id: id }, { $set: Object.assign(Object.assign({}, updateData), { updatedAt: Date.now().toString() }) }, { returnDocument: 'after' });
            return result;
        });
        this.deleteActiveCourse = (course) => __awaiter(this, void 0, void 0, function* () {
            yield this.getCourseCollection().deleteOne({ id: course.id });
        });
        /**
         * Remove a courseId from all users' coursesEnrolled array in active-users collection
         * @param courseId - The course ID to remove from all users
         * @returns Promise with number of users modified
         */
        this.removeCourseFromAllUsers = (courseId) => __awaiter(this, void 0, void 0, function* () {
            try {
                const activeUsersCollection = this.db.collection('active-users');
                const updateResult = yield activeUsersCollection.updateMany({ coursesEnrolled: { $in: [courseId] } }, { $pull: { coursesEnrolled: courseId } });
                console.log(`✅ Removed course ${courseId} from ${updateResult.modifiedCount} user(s) in active-users`);
                return updateResult.modifiedCount;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`❌ Error removing course from active-users:`, errorMessage);
                throw error;
            }
        });
        /**
         * Drop a collection from the database
         * @param collectionName - The name of the collection to drop
         * @returns Promise with success status
         */
        this.dropCollection = (collectionName) => __awaiter(this, void 0, void 0, function* () {
            try {
                const collectionExists = yield this.db.listCollections({ name: collectionName }).hasNext();
                if (collectionExists) {
                    yield this.db.dropCollection(collectionName);
                    console.log(`✅ Successfully dropped collection: ${collectionName}`);
                    return { success: true };
                }
                else {
                    console.log(`⚠️ Collection ${collectionName} does not exist, skipping drop`);
                    return { success: true }; // Not an error if collection doesn't exist
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`❌ Error dropping collection ${collectionName}:`, errorMessage);
                return { success: false, error: errorMessage };
            }
        });
        // Learning objectives methods
        this.addLearningObjective = (courseId, topicOrWeekId, contentId, learningObjective) => __awaiter(this, void 0, void 0, function* () {
            console.log('🎯 [MONGODB] addLearningObjective called with:', { courseId, topicOrWeekId, contentId, learningObjective });
            const result = yield this.getCourseCollection().findOneAndUpdate({
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId
            }, {
                $push: {
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': learningObjective
                },
                $set: { updatedAt: Date.now().toString() }
            }, {
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after'
            });
            console.log('✅ [MONGODB] addLearningObjective result:', result);
            return result;
        });
        this.updateLearningObjective = (courseId, topicOrWeekId, contentId, objectiveId, updateData) => __awaiter(this, void 0, void 0, function* () {
            const result = yield this.getCourseCollection().findOneAndUpdate({
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId,
                'topicOrWeekInstances.items.learningObjectives.id': objectiveId
            }, {
                $set: {
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].LearningObjective': updateData.LearningObjective,
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].updatedAt': Date.now().toString(),
                    updatedAt: Date.now().toString()
                }
            }, {
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId },
                    { 'objective.id': objectiveId }
                ],
                returnDocument: 'after'
            });
            return result;
        });
        this.deleteLearningObjective = (courseId, topicOrWeekId, contentId, objectiveId) => __awaiter(this, void 0, void 0, function* () {
            console.log('🗑️ [MONGODB] deleteLearningObjective called with:', { courseId, topicOrWeekId, contentId, objectiveId });
            const result = yield this.getCourseCollection().findOneAndUpdate({
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': contentId
            }, {
                $pull: {
                    'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': { id: objectiveId }
                },
                $set: { updatedAt: Date.now().toString() }
            }, {
                arrayFilters: [
                    { 'instance.id': topicOrWeekId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after'
            });
            console.log('✅ [MONGODB] deleteLearningObjective result:', result);
            return result;
        });
        /**
         * Get all learning objectives for an entire course
         * @param courseId - The course ID
         * @returns Promise<LearningObjective[]> - All learning objectives across all topic/week instances and items
         */
        this.getAllLearningObjectives = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course || !course.topicOrWeekInstances) {
                return [];
            }
            const allObjectives = [];
            // Iterate through all topic/week instances and items to collect learning objectives
            for (const instance of course.topicOrWeekInstances) {
                if (instance.items) {
                    for (const item of instance.items) {
                        if (item.learningObjectives && item.learningObjectives.length > 0) {
                            allObjectives.push(...item.learningObjectives);
                        }
                    }
                }
            }
            return allObjectives;
        });
        // Flag report methods
        // Cache for collection names to avoid repeated database lookups
        this.collectionNamesCache = new Map();
        this.createFlagReport = (flagReport) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(001)
            console.log('🏴 Creating flag report:', flagReport.id, 'for course:', flagReport.courseName);
            //END DEBUG LOG : DEBUG-CODE(001)
            try {
                const flagsCollection = yield this.getFlagsCollection(flagReport.courseName);
                const result = yield flagsCollection.insertOne(flagReport);
                //START DEBUG LOG : DEBUG-CODE(009)
                console.log('🏴 Flag report created successfully:', flagReport.id, 'MongoDB ID:', result.insertedId);
                //END DEBUG LOG : DEBUG-CODE(009)
                return result;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(010)
                console.error('🏴 Error creating flag report:', flagReport.id, 'Error:', error);
                //END DEBUG LOG : DEBUG-CODE(010)
                throw new Error(`Failed to create flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        this.getAllFlagReports = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(002)
            console.log('🏴 Getting flag reports for course:', courseName);
            //END DEBUG LOG : DEBUG-CODE(002)
            const flagsCollection = yield this.getFlagsCollection(courseName);
            return yield flagsCollection.find({}).toArray();
        });
        this.getFlagReport = (courseName, flagId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(003)
            console.log('🏴 Getting flag report:', flagId, 'for course:', courseName);
            //END DEBUG LOG : DEBUG-CODE(003)
            const flagsCollection = yield this.getFlagsCollection(courseName);
            return yield flagsCollection.findOne({ id: flagId });
        });
        this.updateFlagReport = (courseName, flagId, updateData) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(004)
            console.log('🏴 Updating flag report:', flagId, 'for course:', courseName, 'with data:', updateData);
            //END DEBUG LOG : DEBUG-CODE(004)
            try {
                const flagsCollection = yield this.getFlagsCollection(courseName);
                // Add updatedAt timestamp
                const updateWithTimestamp = Object.assign(Object.assign({}, updateData), { updatedAt: new Date() });
                // If response is undefined/null, set it to empty string
                if (updateData.response === undefined || updateData.response === null) {
                    updateWithTimestamp.response = '';
                }
                //START DEBUG LOG : DEBUG-CODE(011)
                console.log('🏴 About to update with query:', { id: flagId });
                console.log('🏴 About to update with data:', { $set: updateWithTimestamp });
                //END DEBUG LOG : DEBUG-CODE(011)
                const result = yield flagsCollection.findOneAndUpdate({ id: flagId }, { $set: updateWithTimestamp }, { returnDocument: 'after' });
                //START DEBUG LOG : DEBUG-CODE(012)
                console.log('🏴 Update result:', result);
                //END DEBUG LOG : DEBUG-CODE(012)
                return result;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(013)
                console.error('🏴 Error updating flag report:', flagId, 'Error:', error);
                //END DEBUG LOG : DEBUG-CODE(013)
                throw new Error(`Failed to update flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        this.deleteFlagReport = (courseName, flagId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(005)
            console.log('🏴 Deleting flag report:', flagId, 'for course:', courseName);
            //END DEBUG LOG : DEBUG-CODE(005)
            const flagsCollection = yield this.getFlagsCollection(courseName);
            return yield flagsCollection.deleteOne({ id: flagId });
        });
        this.deleteAllFlagReports = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(006)
            console.log('🏴 Deleting all flag reports for course:', courseName);
            //END DEBUG LOG : DEBUG-CODE(006)
            const flagsCollection = yield this.getFlagsCollection(courseName);
            return yield flagsCollection.deleteMany({});
        });
        // =====================================
        // ========= FLAG STATUS MANAGEMENT ====
        // =====================================
        /**
         * Validates flag status transition
         * @param currentStatus - Current status of the flag
         * @param newStatus - Desired new status
         * @returns Validation result
         */
        this.validateStatusTransition = (currentStatus, newStatus) => {
            //START DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION)
            console.log(`[MONGODB] 🔄 Validating status transition: ${currentStatus} -> ${newStatus}`);
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION)
            // Valid statuses
            const validStatuses = ['unresolved', 'resolved'];
            // Check if new status is valid
            if (!validStatuses.includes(newStatus)) {
                return {
                    isValid: false,
                    error: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`
                };
            }
            // Check if current status is valid
            if (!validStatuses.includes(currentStatus)) {
                return {
                    isValid: false,
                    error: `Invalid current status: ${currentStatus}. Must be one of: ${validStatuses.join(', ')}`
                };
            }
            // Status transition rules
            const validTransitions = {
                'unresolved': ['resolved'], // unresolved can only go to resolved
                'resolved': ['unresolved'] // resolved can go back to unresolved (for corrections)
            };
            if (!validTransitions[currentStatus].includes(newStatus)) {
                return {
                    isValid: false,
                    error: `Invalid transition: ${currentStatus} -> ${newStatus}. Valid transitions: ${validTransitions[currentStatus].join(', ')}`
                };
            }
            //START DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION-SUCCESS)
            console.log(`[MONGODB] ✅ Status transition validated: ${currentStatus} -> ${newStatus}`);
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-STATUS-TRANSITION-SUCCESS)
            return { isValid: true };
        };
        /**
         * Updates flag status with validation and audit trail
         * @param courseName - The name of the course
         * @param flagId - The ID of the flag to update
         * @param newStatus - The new status
         * @param response - Optional instructor response
         * @param instructorId - ID of the instructor making the change
         * @returns Updated flag report
         */
        this.updateFlagStatus = (courseName, flagId, newStatus, response, instructorId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
            console.log(`[MONGODB] 🔄 Updating flag status: ${flagId} to ${newStatus} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS)
            try {
                const flagsCollection = yield this.getFlagsCollection(courseName);
                // Get current flag to validate transition
                const currentFlag = yield flagsCollection.findOne({ id: flagId });
                if (!currentFlag) {
                    throw new Error(`Flag not found: ${flagId}`);
                }
                // Validate status transition
                const validation = this.validateStatusTransition(currentFlag.status, newStatus);
                if (!validation.isValid) {
                    throw new Error(validation.error);
                }
                // Prepare update data
                const updateData = {
                    status: newStatus,
                    updatedAt: new Date()
                };
                // Add response if provided
                if (response !== undefined) {
                    updateData.response = response;
                }
                // Add audit information
                if (instructorId) {
                    updateData.lastUpdatedBy = instructorId;
                    updateData.lastUpdatedAt = new Date();
                }
                // Update the flag
                const result = yield flagsCollection.findOneAndUpdate({ id: flagId }, { $set: updateData }, { returnDocument: 'after' });
                if (!result) {
                    throw new Error(`Failed to update flag: ${flagId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-SUCCESS)
                console.log(`[MONGODB] ✅ Flag status updated successfully: ${flagId} -> ${newStatus}`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-SUCCESS)
                return result;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
                console.error(`[MONGODB] 🚨 Error updating flag status:`, error);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-FLAG-STATUS-ERROR)
                throw error;
            }
        });
        /**
         * Gets flag statistics for a course
         * @param courseName - The name of the course
         * @returns Flag statistics
         */
        this.getFlagStatistics = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS)
            console.log(`[MONGODB] 📊 Getting flag statistics for course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS)
            try {
                const flagsCollection = yield this.getFlagsCollection(courseName);
                // Get all flags
                const allFlags = yield flagsCollection.find({}).toArray();
                // Basic counts
                const total = allFlags.length;
                const unresolved = allFlags.filter(f => f.status === 'unresolved').length;
                const resolved = allFlags.filter(f => f.status === 'resolved').length;
                // Count by type
                const byType = {};
                allFlags.forEach(flag => {
                    byType[flag.flagType] = (byType[flag.flagType] || 0) + 1;
                });
                // Count by status
                const byStatus = {};
                allFlags.forEach(flag => {
                    byStatus[flag.status] = (byStatus[flag.status] || 0) + 1;
                });
                // Recent activity
                const now = new Date();
                const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const recentActivity = {
                    last24Hours: allFlags.filter(f => f.createdAt >= last24Hours).length,
                    last7Days: allFlags.filter(f => f.createdAt >= last7Days).length,
                    last30Days: allFlags.filter(f => f.createdAt >= last30Days).length
                };
                const stats = {
                    total,
                    unresolved,
                    resolved,
                    byType,
                    byStatus,
                    recentActivity
                };
                //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-RESULT)
                console.log(`[MONGODB] 📊 Flag statistics retrieved:`, stats);
                //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-RESULT)
                return stats;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
                console.error(`[MONGODB] 🚨 Error getting flag statistics:`, error);
                //END DEBUG LOG : DEBUG-CODE(GET-FLAG-STATS-ERROR)
                throw error;
            }
        });
        // =====================================
        // ========= DATABASE VALIDATION =======
        // =====================================
        /**
         * Validates flag collection structure and integrity
         * @param courseName - The name of the course
         * @returns Validation result with details
         */
        this.validateFlagCollection = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS)
            console.log('🔍 [MONGODB] Validating flag collection for course:', courseName);
            //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS)
            try {
                const flagsCollection = yield this.getFlagsCollection(courseName);
                const issues = [];
                // Get all flags for validation
                const allFlags = yield flagsCollection.find({}).toArray();
                // Validate each flag document
                let invalidDocuments = 0;
                for (const flag of allFlags) {
                    const validation = this.validateFlagDocument(flag);
                    if (!validation.isValid) {
                        invalidDocuments++;
                        issues.push(`Flag ${flag.id}: ${validation.issues.join(', ')}`);
                    }
                }
                // Get statistics
                const totalFlags = allFlags.length;
                const unresolvedFlags = allFlags.filter(f => f.status === 'unresolved').length;
                const resolvedFlags = allFlags.filter(f => f.status === 'resolved').length;
                const isValid = invalidDocuments === 0;
                //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-RESULT)
                console.log('🔍 [MONGODB] Flag collection validation result:', {
                    isValid,
                    totalFlags,
                    unresolvedFlags,
                    resolvedFlags,
                    invalidDocuments,
                    issuesCount: issues.length
                });
                //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-RESULT)
                return {
                    isValid,
                    issues,
                    stats: {
                        totalFlags,
                        unresolvedFlags,
                        resolvedFlags,
                        invalidDocuments
                    }
                };
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-ERROR)
                console.error('🔍 [MONGODB] Error validating flag collection:', error);
                //END DEBUG LOG : DEBUG-CODE(VALIDATE-FLAGS-ERROR)
                throw new Error(`Flag collection validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        /**
         * Validates a single flag document structure
         * @param flagDocument - The flag document to validate
         * @returns Validation result
         */
        this.validateFlagDocument = (flagDocument) => {
            const issues = [];
            // Required fields validation
            const requiredFields = ['id', 'courseName', 'date', 'flagType', 'reportType', 'chatContent', 'userId', 'status', 'createdAt', 'updatedAt'];
            for (const field of requiredFields) {
                if (flagDocument[field] === undefined || flagDocument[field] === null) {
                    issues.push(`Missing required field: ${field}`);
                }
            }
            // Type validation
            if (flagDocument.id && typeof flagDocument.id !== 'string') {
                issues.push('Field "id" must be a string');
            }
            if (flagDocument.userId && typeof flagDocument.userId !== 'number') {
                issues.push('Field "userId" must be a number');
            }
            if (flagDocument.status && !['unresolved', 'resolved'].includes(flagDocument.status)) {
                issues.push('Field "status" must be "unresolved" or "resolved"');
            }
            if (flagDocument.flagType && !['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other'].includes(flagDocument.flagType)) {
                issues.push('Field "flagType" has invalid value');
            }
            // Date validation
            if (flagDocument.date && !(flagDocument.date instanceof Date)) {
                issues.push('Field "date" must be a Date object');
            }
            if (flagDocument.createdAt && !(flagDocument.createdAt instanceof Date)) {
                issues.push('Field "createdAt" must be a Date object');
            }
            if (flagDocument.updatedAt && !(flagDocument.updatedAt instanceof Date)) {
                issues.push('Field "updatedAt" must be a Date object');
            }
            return {
                isValid: issues.length === 0,
                issues
            };
        };
        /**
         * Creates database indexes for optimal flag query performance
         * @param courseName - The name of the course
         * @returns Promise with index creation results
         */
        this.createFlagIndexes = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
            console.log('📊 [MONGODB] Creating indexes for flag collection:', courseName);
            //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES)
            try {
                const flagsCollection = yield this.getFlagsCollection(courseName);
                const indexesCreated = [];
                const errors = [];
                // Define indexes for optimal query performance
                const indexDefinitions = [
                    {
                        name: 'status_createdAt',
                        spec: { status: 1, createdAt: -1 },
                        description: 'Primary query index for unresolved flags sorted by newest first'
                    },
                    {
                        name: 'userId',
                        spec: { userId: 1 },
                        description: 'User lookup index for flags by specific user'
                    },
                    {
                        name: 'courseName_status',
                        spec: { courseName: 1, status: 1 },
                        description: 'Course-specific flag filtering'
                    },
                    {
                        name: 'flagType_status',
                        spec: { flagType: 1, status: 1 },
                        description: 'Filter flags by type'
                    }
                ];
                // Create each index
                for (const indexDef of indexDefinitions) {
                    try {
                        yield flagsCollection.createIndex(indexDef.spec, {
                            name: indexDef.name,
                            background: true // Create index in background to avoid blocking
                        });
                        indexesCreated.push(indexDef.name);
                        //START DEBUG LOG : DEBUG-CODE(INDEX-CREATED)
                        console.log('📊 [MONGODB] Created index:', indexDef.name, '-', indexDef.description);
                        //END DEBUG LOG : DEBUG-CODE(INDEX-CREATED)
                    }
                    catch (indexError) {
                        const errorMsg = `Failed to create index ${indexDef.name}: ${indexError instanceof Error ? indexError.message : 'Unknown error'}`;
                        errors.push(errorMsg);
                        console.error('📊 [MONGODB]', errorMsg);
                    }
                }
                const success = errors.length === 0;
                //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-RESULT)
                console.log('📊 [MONGODB] Index creation result:', {
                    success,
                    indexesCreated: indexesCreated.length,
                    errors: errors.length
                });
                //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-RESULT)
                return {
                    success,
                    indexesCreated,
                    errors
                };
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-ERROR)
                console.error('📊 [MONGODB] Error creating indexes:', error);
                //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-ERROR)
                throw new Error(`Index creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        this.addContentItem = (courseId, topicOrWeekId, contentItem) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log('📝 Adding content item to course:', courseId, 'topic/week instance:', topicOrWeekId);
                const course = yield this.getActiveCourse(courseId);
                if (!course) {
                    return { success: false, error: 'Course not found' };
                }
                const instance = (_a = course.topicOrWeekInstances) === null || _a === void 0 ? void 0 : _a.find((d) => d.id === topicOrWeekId);
                if (!instance) {
                    return { success: false, error: 'Topic/Week instance not found' };
                }
                // Initialize items array if it doesn't exist
                if (!instance.items) {
                    instance.items = [];
                }
                // Add the new content item
                instance.items.push(contentItem);
                // Update the course in the database
                const result = yield this.updateActiveCourse(courseId, course);
                if (result && result.ok) {
                    return { success: true, data: contentItem };
                }
                else {
                    return { success: false, error: 'Failed to save content item to database' };
                }
            }
            catch (error) {
                console.error('Error adding content item:', error);
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });
        this.addAdditionalMaterial = (courseId, topicOrWeekId, itemId, material) => __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('📄 Adding additional material to course:', courseId, 'topic/week instance:', topicOrWeekId, 'item:', itemId);
                const result = yield this.getCourseCollection().findOneAndUpdate({
                    id: courseId,
                    'topicOrWeekInstances.id': topicOrWeekId,
                    'topicOrWeekInstances.items.id': itemId
                }, {
                    $push: {
                        'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': material
                    },
                    $set: { updatedAt: Date.now().toString() }
                }, {
                    arrayFilters: [
                        { 'instance.id': topicOrWeekId },
                        { 'item.id': itemId }
                    ],
                    returnDocument: 'after'
                });
                console.log('✅ Additional material added successfully');
                return result;
            }
            catch (error) {
                console.error('Error adding additional material:', error);
                throw error;
            }
        });
        this.clearAllAdditionalMaterials = (courseId) => __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🗑️ Clearing all additional materials from course:', courseId);
                const result = yield this.getCourseCollection().findOneAndUpdate({ id: courseId }, {
                    $unset: {
                        'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': 1
                    },
                    $set: { updatedAt: Date.now().toString() }
                }, {
                    arrayFilters: [
                        { 'instance.id': { $exists: true } }, // Match all topic/week instances that have an id
                        { 'item.id': { $exists: true } } // Match all items that have an id
                    ],
                    returnDocument: 'after'
                });
                console.log('✅ All additional materials cleared successfully');
                return result;
            }
            catch (error) {
                console.error('Error clearing additional materials:', error);
                throw error;
            }
        });
        /**
         * Find a user by userId in a specific course and return user details
         * @param courseName - The name of the course
         * @param userId - The userId to look up (string format)
         * @returns User object with name and affiliation if found, null otherwise
         * NOTE: PUID is not returned for privacy - only userId is used
         */
        this.findUserByUserId = (courseName, userId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
            console.log(`[MONGODB] 🔍 Finding user with userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const user = yield userCollection.findOne({ userId: userId });
                if (user) {
                    //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                    console.log(`[MONGODB] ✅ Found user:`, { name: user.name, userId: user.userId, affiliation: user.affiliation });
                    //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-SUCCESS)
                    return {
                        name: user.name,
                        affiliation: user.affiliation,
                        userId: user.userId
                    };
                }
                else {
                    //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                    console.log(`[MONGODB] ❌ User with userId ${userId} not found in course ${courseName}`);
                    //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-NOT-FOUND)
                    return null;
                }
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
                console.error(`[MONGODB] 🚨 Error finding user with userId ${userId}:`, error);
                //END DEBUG LOG : DEBUG-CODE(FIND-USER-BY-ID-ERROR)
                throw error;
            }
        });
        /**
         * Batch lookup multiple users by their userIds
         * @param courseName - The name of the course
         * @param userIds - Array of userIds to look up (string format)
         * @returns Map of userId to user details
         * NOTE: PUID is not returned for privacy - only userId is used
         */
        this.batchFindUsersByUserIds = (courseName, userIds) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
            console.log(`[MONGODB] 🔍 Batch finding ${userIds.length} users in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const users = yield userCollection.find({ userId: { $in: userIds } }).toArray();
                const userMap = new Map();
                for (const user of users) {
                    userMap.set(user.userId, {
                        name: user.name,
                        affiliation: user.affiliation,
                        userId: user.userId
                    });
                }
                //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
                console.log(`[MONGODB] ✅ Batch lookup found ${userMap.size} out of ${userIds.length} users`);
                //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-RESULT)
                return userMap;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
                console.error(`[MONGODB] 🚨 Error in batch user lookup:`, error);
                //END DEBUG LOG : DEBUG-CODE(BATCH-FIND-USERS-ERROR)
                throw error;
            }
        });
        /**
         * Get flag reports with resolved user names
         * @param courseName - The name of the course
         * @returns Array of flag reports with user names resolved
         */
        this.getFlagReportsWithUserNames = (courseName) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
            console.log(`[MONGODB] 🔍 Getting flag reports with user names for course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES)
            try {
                // Get all flag reports
                const flagReports = yield this.getAllFlagReports(courseName);
                if (flagReports.length === 0) {
                    return [];
                }
                // Extract unique userIds
                const userIds = [...new Set(flagReports.map(flag => flag.userId))];
                // Batch lookup users
                const userMap = yield this.batchFindUsersByUserIds(courseName, userIds);
                // Combine flag reports with user information
                // NOTE: PUID is not included for privacy
                const flagsWithNames = flagReports.map(flag => {
                    const userInfo = userMap.get(flag.userId);
                    return Object.assign(Object.assign({}, flag), { userName: (userInfo === null || userInfo === void 0 ? void 0 : userInfo.name) || 'Unknown User', userAffiliation: (userInfo === null || userInfo === void 0 ? void 0 : userInfo.affiliation) || 'Unknown' });
                });
                //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
                console.log(`[MONGODB] ✅ Retrieved ${flagsWithNames.length} flag reports with user names`);
                //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-RESULT)
                return flagsWithNames;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
                console.error(`[MONGODB] 🚨 Error getting flag reports with user names:`, error);
                //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-ERROR)
                throw error;
            }
        });
        /**
         * Find a student by userId in a specific course
         * @param courseName - The name of the course (e.g., "APSC 099")
         * @param userId - The userId of the student (string format)
         * @returns User object if found, null otherwise
         */
        this.findStudentByUserId = (courseName, userId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID)
            console.log(`[MONGODB] 🔍 Finding student with userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const student = yield userCollection.findOne({ userId: userId });
                if (student) {
                    //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-SUCCESS)
                    console.log(`[MONGODB] ✅ Found existing student:`, student);
                    //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-SUCCESS)
                }
                else {
                    //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-NOT-FOUND)
                    console.log(`[MONGODB] ❌ Student with userId ${userId} not found in course ${courseName}`);
                    //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-NOT-FOUND)
                }
                return student;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-ERROR)
                console.error(`[MONGODB] 🚨 Error finding student with userId ${userId}:`, error);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-BY-USERID-ERROR)
                throw error;
            }
        });
        /**
         * @deprecated Use findStudentByUserId instead. This method is kept for backward compatibility during migration.
         * Find a student by PUID in a specific course
         * @param courseName - The name of the course (e.g., "APSC 099")
         * @param puid - The PUID of the student
         * @returns User object if found, null otherwise
         */
        this.findStudentByPUID = (courseName, puid) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
            console.log(`[MONGODB] 🔍 Finding student with PUID: ${puid} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const student = yield userCollection.findOne({ puid: puid });
                if (student) {
                    //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
                    console.log(`[MONGODB] ✅ Found existing student:`, student);
                    //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-SUCCESS)
                }
                else {
                    //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
                    console.log(`[MONGODB] ❌ Student with PUID ${puid} not found in course ${courseName}`);
                    //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-NOT-FOUND)
                }
                return student;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
                console.error(`[MONGODB] 🚨 Error finding student with PUID ${puid}:`, error);
                //END DEBUG LOG : DEBUG-CODE(FIND-STUDENT-ERROR)
                throw error;
            }
        });
        /**
         * Create a new student in a specific course
         * @param courseName - The name of the course (e.g., "APSC 099")
         * @param userData - The user data to create
         * @returns Created user object
         */
        this.createStudent = (courseName, userData) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
            console.log(`[MONGODB] 🚀 Creating new student in course: ${courseName}`, userData);
            //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                // Generate unique ID for the student (using course-specific ID)
                const studentId = this.idGenerator.userID(userData);
                // Create student object WITHOUT puid (privacy - only userId is stored)
                const _a = userData, { puid } = _a, userDataWithoutPuid = __rest(_a, ["puid"]);
                const newStudent = Object.assign(Object.assign({}, userDataWithoutPuid), { id: studentId, createdAt: new Date(), updatedAt: new Date() });
                const result = yield userCollection.insertOne(newStudent);
                //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
                console.log(`[MONGODB] ✅ Created new student with ID: ${studentId} (userId: ${newStudent.userId})`);
                //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-SUCCESS)
                return newStudent;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
                console.error(`[MONGODB] 🚨 Error creating student:`, error);
                //END DEBUG LOG : DEBUG-CODE(CREATE-STUDENT-ERROR)
                throw error;
            }
        });
        // =====================================
        // ========= CHAT MANAGEMENT ===========
        // =====================================
        /**
         * Get all chats for a specific user by userId
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @returns Array of Chat objects (excluding soft-deleted chats)
         */
        this.getUserChats = (courseName, userId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
            console.log(`[MONGODB] 📋 Getting chats for user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const user = yield userCollection.findOne({ userId: userId });
                if (!user) {
                    //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                    console.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
                    //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-NO-USER)
                    return [];
                }
                const allChats = user.chats || [];
                // Filter out soft-deleted chats (where isDeleted === true)
                // Chats without isDeleted field are treated as active (backward compatibility)
                const activeChats = allChats.filter((chat) => !chat.isDeleted);
                //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
                console.log(`[MONGODB] ✅ Found ${activeChats.length} active chats (${allChats.length - activeChats.length} deleted) for user`);
                //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-SUCCESS)
                return activeChats;
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
                console.error(`[MONGODB] 🚨 Error getting user chats:`, error);
                //END DEBUG LOG : DEBUG-CODE(GET-USER-CHATS-ERROR)
                throw error;
            }
        });
        /**
         * Get chat metadata for a specific user by userId (without full message history)
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @returns Array of chat metadata objects (excluding soft-deleted chats)
         */
        this.getUserChatsMetadata = (courseName, userId) => __awaiter(this, void 0, void 0, function* () {
            console.log(`[MONGODB] 📊 Getting chat metadata for user userId: ${userId} in course: ${courseName}`);
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const user = yield userCollection.findOne({ userId: userId });
                if (!user) {
                    console.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
                    return [];
                }
                const allChats = user.chats || [];
                // Filter out soft-deleted chats and transform to metadata
                const activeChatsMetadata = allChats
                    .filter((chat) => !chat.isDeleted)
                    .map((chat) => ({
                    id: chat.id,
                    courseName: chat.courseName,
                    itemTitle: chat.itemTitle,
                    isPinned: chat.isPinned,
                    pinnedMessageId: chat.pinnedMessageId,
                    messageCount: chat.messages ? chat.messages.length : 0,
                    lastMessageTimestamp: chat.messages && chat.messages.length > 0
                        ? chat.messages[chat.messages.length - 1].timestamp
                        : 0
                }))
                    .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp); // Sort by most recent first
                console.log(`[MONGODB] ✅ Found ${activeChatsMetadata.length} active chat metadata for user`);
                return activeChatsMetadata;
            }
            catch (error) {
                console.error(`[MONGODB] 🚨 Error getting user chat metadata:`, error);
                throw error;
            }
        });
        /**
         * Add a new chat to a user's chats array
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chat - The chat object to add
         */
        this.addChatToUser = (courseName, userId, chat) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
            console.log(`[MONGODB] ➕ Adding chat ${chat.id} to user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId }, {
                    $push: { chats: chat },
                    $set: { updatedAt: new Date() }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`User not found with userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
                console.log(`[MONGODB] ✅ Chat added successfully to user`);
                //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
                console.error(`[MONGODB] 🚨 Error adding chat to user:`, error);
                //END DEBUG LOG : DEBUG-CODE(ADD-CHAT-TO-USER-ERROR)
                throw error;
            }
        });
        /**
         * Update an existing chat in user's chats array
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat to update
         * @param chat - The updated chat object
         */
        this.updateUserChat = (courseName, userId, chatId, chat) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
            console.log(`[MONGODB] 🔄 Updating chat ${chatId} for user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId, 'chats.id': chatId }, {
                    $set: {
                        'chats.$': chat,
                        updatedAt: new Date()
                    }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
                console.log(`[MONGODB] ✅ Chat updated successfully`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
                console.error(`[MONGODB] 🚨 Error updating user chat:`, error);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-USER-CHAT-ERROR)
                throw error;
            }
        });
        /**
         * Add a message to a specific chat in user's chats array
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat
         * @param message - The message to add
         */
        this.addMessageToChat = (courseName, userId, chatId, message) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
            console.log(`[MONGODB] 💬 Adding message to chat ${chatId} for user userId: ${userId}`);
            //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId, 'chats.id': chatId }, {
                    $push: { 'chats.$.messages': message },
                    $set: { updatedAt: new Date() }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
                console.log(`[MONGODB] ✅ Message added to chat successfully`);
                //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
                console.error(`[MONGODB] 🚨 Error adding message to chat:`, error);
                //END DEBUG LOG : DEBUG-CODE(ADD-MESSAGE-TO-CHAT-ERROR)
                throw error;
            }
        });
        /**
         * Update chat title in user's chats array
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat to update
         * @param newTitle - The new title for the chat
         */
        this.updateChatTitle = (courseName, userId, chatId, newTitle) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
            console.log(`[MONGODB] 📝 Updating chat title for chat ${chatId} to "${newTitle}" for user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId, 'chats.id': chatId }, {
                    $set: {
                        'chats.$.itemTitle': newTitle,
                        updatedAt: new Date()
                    }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
                console.log(`[MONGODB] ✅ Chat title updated successfully to "${newTitle}"`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
                console.error(`[MONGODB] 🚨 Error updating chat title:`, error);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-TITLE-ERROR)
                throw error;
            }
        });
        /**
         * Update chat pin status
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat to update pin status for
         * @param isPinned - Boolean indicating if chat should be pinned
         */
        this.updateChatPinStatus = (courseName, userId, chatId, isPinned) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN)
            console.log(`[MONGODB] 📌 Updating chat pin status for chat ${chatId} to ${isPinned} for user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId, 'chats.id': chatId }, {
                    $set: {
                        'chats.$.isPinned': isPinned,
                        updatedAt: new Date()
                    }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-SUCCESS)
                console.log(`[MONGODB] ✅ Chat pin status updated successfully to ${isPinned}`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-ERROR)
                console.error(`[MONGODB] 🚨 Error updating chat pin status:`, error);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-CHAT-PIN-ERROR)
                throw error;
            }
        });
        /**
         * Mark a chat as deleted (soft delete) instead of removing it
         * This preserves chat history for audit/analytics while hiding it from users
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat to mark as deleted
         */
        this.markChatAsDeleted = (courseName, userId, chatId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
            console.log(`[MONGODB] 🗑️ Marking chat ${chatId} as deleted for user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId, 'chats.id': chatId }, {
                    $set: {
                        'chats.$.isDeleted': true,
                        updatedAt: new Date()
                    }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
                console.log(`[MONGODB] ✅ Chat ${chatId} marked as deleted successfully`);
                //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
                console.error(`[MONGODB] 🚨 Error marking chat as deleted:`, error);
                //END DEBUG LOG : DEBUG-CODE(MARK-CHAT-DELETED-ERROR)
                throw error;
            }
        });
        /**
         * Delete a chat from user's chats array (HARD DELETE - kept for backward compatibility)
         * @deprecated Use markChatAsDeleted() instead for soft delete
         * @param courseName - The name of the course
         * @param userId - The userId of the user (string format)
         * @param chatId - The ID of the chat to delete
         */
        this.deleteChatFromUser = (courseName, userId, chatId) => __awaiter(this, void 0, void 0, function* () {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
            console.log(`[MONGODB] 🗑️ Deleting chat ${chatId} from user userId: ${userId} in course: ${courseName}`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER)
            try {
                const userCollection = yield this.getUserCollection(courseName);
                const result = yield userCollection.updateOne({ userId: userId }, {
                    $pull: { chats: { id: chatId } },
                    $set: { updatedAt: new Date() }
                });
                if (result.matchedCount === 0) {
                    throw new Error(`User not found with userId: ${userId}`);
                }
                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
                console.log(`[MONGODB] ✅ Chat deleted successfully from user`);
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-SUCCESS)
            }
            catch (error) {
                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
                console.error(`[MONGODB] 🚨 Error deleting chat from user:`, error);
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-FROM-USER-ERROR)
                throw error;
            }
        });
        /**
         * Find a global user by PUID
         */
        this.findGlobalUserByPUID = (puid) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            return yield collection.findOne({ puid: puid });
        });
        /**
         * Find a global user by userId
         * Preferred method to avoid PUID usage in API endpoints
         *
         * @param userId - The userId to look up (string format)
         * @returns GlobalUser object if found, null otherwise
         */
        this.findGlobalUserByUserId = (userId) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            return yield collection.findOne({ userId: userId });
        });
        /**
         * Create a new global user
         */
        this.createGlobalUser = (userData) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            const newUser = {
                name: userData.name,
                puid: userData.puid,
                userId: userData.userId,
                coursesEnrolled: userData.coursesEnrolled || [],
                affiliation: userData.affiliation,
                status: userData.status || 'active',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            yield collection.insertOne(newUser);
            return newUser;
        });
        /**
         * Add a course to global user's enrolled courses
         */
        this.addCourseToGlobalUser = (puid, courseId) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            yield collection.updateOne({ puid: puid }, {
                $addToSet: { coursesEnrolled: courseId },
                $set: { updatedAt: new Date() }
            });
        });
        /**
         * Update global user
         */
        this.updateGlobalUser = (puid, updateData) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            const result = yield collection.findOneAndUpdate({ puid: puid }, {
                $set: Object.assign(Object.assign({}, updateData), { updatedAt: new Date() })
            }, { returnDocument: 'after' });
            return result;
        });
        /**
         * Update a global user's affiliation by userId
         */
        this.updateGlobalUserAffiliation = (userId, affiliation) => __awaiter(this, void 0, void 0, function* () {
            const collection = this.getGlobalUserCollection();
            const result = yield collection.findOneAndUpdate({ userId: userId }, {
                $set: {
                    affiliation: affiliation,
                    updatedAt: new Date()
                }
            }, { returnDocument: 'after' });
            if (!result) {
                throw new Error(`GlobalUser with userId ${userId} not found`);
            }
            return result;
        });
        /**
         * Create a new memory agent entry for a user
         * @param courseName - The name of the course
         * @param entry - The memory agent entry to create
         */
        this.createMemoryAgentEntry = (courseName, entry) => __awaiter(this, void 0, void 0, function* () {
            console.log(`[MONGODB] 🧠 Creating memory agent entry for userId: ${entry.userId} in course: ${courseName}`);
            try {
                const memoryAgentCollection = yield this.getMemoryAgentCollection(courseName);
                yield memoryAgentCollection.insertOne(entry);
                console.log(`[MONGODB] ✅ Memory agent entry created successfully for userId: ${entry.userId}`);
            }
            catch (error) {
                // Handle duplicate key error (MongoDB error code 11000) - entry already exists
                // This can happen in race conditions, so we treat it as idempotent success
                if (error.code === 11000 || error.code === 11001) {
                    console.log(`[MONGODB] ℹ️ Memory agent entry already exists for userId: ${entry.userId} (duplicate key error - treating as success)`);
                    return; // Idempotent - entry exists, which is what we want
                }
                console.error(`[MONGODB] 🚨 Error creating memory agent entry:`, error);
                throw error;
            }
        });
        /**
         * Get memory agent entry for a specific user (READ-ONLY)
         * Does NOT create entries - use initializeMemoryAgentForUser or ensureMemoryAgentEntryExists for creation
         * @param courseName - The name of the course
         * @param userId - The user ID
         * @returns Memory agent entry if found, null if not found
         */
        this.getMemoryAgentEntry = (courseName, userId) => __awaiter(this, void 0, void 0, function* () {
            console.log(`[MONGODB] 🔍 Getting memory agent entry for userId: ${userId} in course: ${courseName}`);
            try {
                const memoryAgentCollection = yield this.getMemoryAgentCollection(courseName);
                const entry = yield memoryAgentCollection.findOne({ userId: userId });
                if (entry) {
                    console.log(`[MONGODB] ✅ Found memory agent entry for userId: ${userId}`);
                }
                else {
                    console.log(`[MONGODB] ⚠️ Memory agent entry not found for userId: ${userId}`);
                }
                return entry;
            }
            catch (error) {
                console.error(`[MONGODB] 🚨 Error getting memory agent entry:`, error);
                throw error;
            }
        });
        /**
         * Update struggle words for a user's memory agent entry
         * @param courseName - The name of the course
         * @param userId - The user ID
         * @param struggleTopics - Array of struggle words to update
         */
        this.updateMemoryAgentStruggleWords = (courseName, userId, struggleTopics) => __awaiter(this, void 0, void 0, function* () {
            console.log(`[MONGODB] 🔄 Updating struggle words for userId: ${userId} in course: ${courseName}`);
            console.log(`[MONGODB] 📝 New struggle words:`, struggleTopics);
            try {
                const memoryAgentCollection = yield this.getMemoryAgentCollection(courseName);
                const result = yield memoryAgentCollection.findOneAndUpdate({ userId: userId }, {
                    $set: {
                        struggleTopics: struggleTopics,
                        updatedAt: new Date()
                    }
                }, { returnDocument: 'after' });
                if (!result) {
                    throw new Error(`Memory agent entry not found for userId: ${userId}`);
                }
                console.log(`[MONGODB] ✅ Struggle words updated successfully for userId: ${userId}`);
            }
            catch (error) {
                console.error(`[MONGODB] 🚨 Error updating struggle words:`, error);
                throw error;
            }
        });
        /**
         * Initialize memory agent entry for a user when CourseUser is created
         * @param courseName - The name of the course
         * @param userId - The user ID
         * @param name - The user's name
         * @param affiliation - The user's affiliation ('student' or 'faculty')
         */
        this.initializeMemoryAgentForUser = (courseName, userId, name, affiliation) => __awaiter(this, void 0, void 0, function* () {
            console.log(`[MONGODB] 🧠 Initializing memory agent for userId: ${userId} in course: ${courseName}`);
            try {
                // Check if entry already exists (idempotent check)
                const existingEntry = yield this.getMemoryAgentEntry(courseName, userId);
                if (existingEntry) {
                    console.log(`[MONGODB] ℹ️ Memory agent entry already exists for userId: ${userId}, skipping initialization (idempotent)`);
                    return;
                }
                // Map affiliation to role
                const role = this.mapAffiliationToRole(affiliation);
                // Create new entry with empty struggle words
                const newEntry = {
                    name: name,
                    userId: userId,
                    role: role,
                    struggleTopics: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                // createMemoryAgentEntry handles duplicate key errors gracefully (idempotent)
                yield this.createMemoryAgentEntry(courseName, newEntry);
                console.log(`[MONGODB] ✅ Memory agent initialized successfully for userId: ${userId} with role: ${role}`);
            }
            catch (error) {
                // If error is not a duplicate key error, throw it
                // Duplicate key errors are already handled in createMemoryAgentEntry
                console.error(`[MONGODB] 🚨 Error initializing memory agent:`, error);
                throw error;
            }
        });
        // Initial Assistant Prompt management methods
        /**
         * Get all initial assistant prompts for a course
         * @param courseId - The course ID
         * @returns Array of initial assistant prompts
         */
        this.getInitialAssistantPrompts = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            return course.collectionOfInitialAssistantPrompts || [];
        });
        /**
         * Get the selected initial assistant prompt for a course
         * Uses MongoDB query with $elemMatch for O(1) complexity
         * @param courseId - The course ID
         * @returns The selected prompt or null if none selected
         */
        this.getSelectedInitialAssistantPrompt = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getCourseCollection().findOne({
                id: courseId,
                'collectionOfInitialAssistantPrompts.isSelected': true
            }, {
                projection: {
                    'collectionOfInitialAssistantPrompts.$': 1
                }
            });
            if (!course) {
                return null;
            }
            const courseData = course;
            const prompts = courseData.collectionOfInitialAssistantPrompts || [];
            // MongoDB $ projection returns array with matching element, so we get the first one
            return prompts.length > 0 ? prompts[0] : null;
        });
        /**
         * Create a new initial assistant prompt for a course
         * @param courseId - The course ID
         * @param prompt - The prompt to create
         */
        this.createInitialAssistantPrompt = (courseId, prompt) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const prompts = course.collectionOfInitialAssistantPrompts || [];
            prompts.push(prompt);
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: prompts } });
        });
        /**
         * Update an existing initial assistant prompt
         * @param courseId - The course ID
         * @param promptId - The prompt ID to update
         * @param updates - Partial prompt data to update
         */
        this.updateInitialAssistantPrompt = (courseId, promptId, updates) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const prompts = course.collectionOfInitialAssistantPrompts || [];
            const promptIndex = prompts.findIndex(p => p.id === promptId);
            if (promptIndex === -1) {
                throw new Error(`Prompt with id ${promptId} not found`);
            }
            prompts[promptIndex] = Object.assign(Object.assign({}, prompts[promptIndex]), updates);
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: prompts } });
        });
        /**
         * Delete an initial assistant prompt
         * Prevents deletion of the default prompt and auto-selects default if deleted prompt was selected
         * @param courseId - The course ID
         * @param promptId - The prompt ID to delete
         */
        this.deleteInitialAssistantPrompt = (courseId, promptId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const prompts = course.collectionOfInitialAssistantPrompts || [];
            // Find the prompt to delete
            const promptToDelete = prompts.find(p => p.id === promptId);
            if (!promptToDelete) {
                throw new Error(`Prompt with id ${promptId} not found`);
            }
            // Prevent deletion of default prompt
            if (promptToDelete.isDefault || promptToDelete.id === types_1.DEFAULT_PROMPT_ID) {
                throw new Error('Cannot delete the default system prompt');
            }
            // Check if the prompt being deleted was selected
            const wasSelected = promptToDelete.isSelected;
            // Filter out the deleted prompt
            const filteredPrompts = prompts.filter(p => p.id !== promptId);
            // If the deleted prompt was selected, select the default prompt
            if (wasSelected) {
                const defaultPrompt = filteredPrompts.find(p => p.isDefault || p.id === types_1.DEFAULT_PROMPT_ID);
                if (defaultPrompt) {
                    // Ensure default exists (will create if missing)
                    yield this.ensureDefaultPromptExists(courseId, course.courseName);
                    // Select the default prompt
                    const updatedPrompts = filteredPrompts.map(p => (Object.assign(Object.assign({}, p), { isSelected: (p.isDefault || p.id === types_1.DEFAULT_PROMPT_ID) ? true : false })));
                    yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } });
                }
                else {
                    // No default exists, just remove the deleted prompt
                    yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } });
                }
            }
            else {
                // Just remove the deleted prompt
                yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } });
            }
        });
        /**
         * Select an initial assistant prompt as active (atomic update)
         * Sets all prompts to isSelected: false, then sets the target prompt to isSelected: true
         * @param courseId - The course ID
         * @param promptId - The prompt ID to select
         */
        this.selectInitialAssistantPrompt = (courseId, promptId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const prompts = course.collectionOfInitialAssistantPrompts || [];
            const promptIndex = prompts.findIndex(p => p.id === promptId);
            if (promptIndex === -1) {
                throw new Error(`Prompt with id ${promptId} not found`);
            }
            // Atomic update: set all to false, then target to true
            const updatedPrompts = prompts.map((p, index) => (Object.assign(Object.assign({}, p), { isSelected: index === promptIndex })));
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } });
        });
        /**
         * Ensure the default prompt exists for a course
         * Creates it if missing, and selects it if no other prompt is selected
         * @param courseId - The course ID
         * @param courseName - The course name (for logging)
         */
        this.ensureDefaultPromptExists = (courseId, courseName) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const prompts = course.collectionOfInitialAssistantPrompts || [];
            // Check if default prompt already exists
            const defaultPrompt = prompts.find(p => p.isDefault || p.id === types_1.DEFAULT_PROMPT_ID);
            if (!defaultPrompt) {
                // Create default prompt
                const newDefaultPrompt = {
                    id: types_1.DEFAULT_PROMPT_ID,
                    title: 'Default Welcome Message',
                    content: chat_prompts_1.INITIAL_ASSISTANT_MESSAGE,
                    dateCreated: new Date(),
                    isSelected: prompts.length === 0 || !prompts.some(p => p.isSelected), // Select if no other prompt is selected
                    isDefault: true
                };
                prompts.push(newDefaultPrompt);
                yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: prompts } });
                console.log(`✅ Created default prompt for course: ${courseName || courseId}`);
            }
            else {
                // Default exists, but ensure it's selected if no other prompt is selected
                const hasSelectedPrompt = prompts.some(p => p.isSelected && !p.isDefault && p.id !== types_1.DEFAULT_PROMPT_ID);
                if (!hasSelectedPrompt && !defaultPrompt.isSelected) {
                    // No other prompt is selected, select the default
                    const updatedPrompts = prompts.map(p => (Object.assign(Object.assign({}, p), { isSelected: (p.isDefault || p.id === types_1.DEFAULT_PROMPT_ID) ? true : false })));
                    yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } });
                    console.log(`✅ Auto-selected default prompt for course: ${courseName || courseId}`);
                }
            }
        });
        // ===========================================
        // ========= SYSTEM PROMPT ITEMS ============
        // ===========================================
        /**
         * Get all system prompt items for a course
         * @param courseId - The course ID
         * @returns Array of system prompt items (both appended and not appended)
         */
        this.getSystemPromptItems = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            return course.collectionOfSystemPromptItems || [];
        });
        /**
         * Get the base system prompt item for a course
         * @param courseId - The course ID
         * @returns The base system prompt item or null if not found
         */
        this.getBaseSystemPrompt = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const items = yield this.getSystemPromptItems(courseId);
            return items.find(item => item.componentType === 'base' || item.id === types_1.DEFAULT_BASE_PROMPT_ID) || null;
        });
        /**
         * Get only appended custom system prompt items (for use in getSystemPrompt)
         * @param courseId - The course ID
         * @returns Array of appended custom system prompt items
         */
        this.getAppendedSystemPromptItems = (courseId) => __awaiter(this, void 0, void 0, function* () {
            const items = yield this.getSystemPromptItems(courseId);
            return items.filter(item => item.isAppended && item.componentType === 'custom');
        });
        /**
         * Create a new system prompt item for a course
         * @param courseId - The course ID
         * @param item - The system prompt item to create
         */
        this.createSystemPromptItem = (courseId, item) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const items = course.collectionOfSystemPromptItems || [];
            items.push(item);
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfSystemPromptItems: items } });
        });
        /**
         * Update an existing system prompt item
         * @param courseId - The course ID
         * @param itemId - The item ID to update
         * @param updates - Partial item data to update
         */
        this.updateSystemPromptItem = (courseId, itemId, updates) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const items = course.collectionOfSystemPromptItems || [];
            const itemIndex = items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) {
                throw new Error(`System prompt item with id ${itemId} not found`);
            }
            items[itemIndex] = Object.assign(Object.assign({}, items[itemIndex]), updates);
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfSystemPromptItems: items } });
        });
        /**
         * Delete a system prompt item
         * Prevents deletion of default components (base, learning objectives, struggle topics)
         * @param courseId - The course ID
         * @param itemId - The item ID to delete
         */
        this.deleteSystemPromptItem = (courseId, itemId) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const items = course.collectionOfSystemPromptItems || [];
            // Find the item to delete
            const itemToDelete = items.find(item => item.id === itemId);
            if (!itemToDelete) {
                throw new Error(`System prompt item with id ${itemId} not found`);
            }
            // Prevent deletion of default components
            if (itemToDelete.componentType && ['base', 'learning-objectives', 'struggle-topics'].includes(itemToDelete.componentType)) {
                throw new Error(`Cannot delete the default ${itemToDelete.componentType} component`);
            }
            // Filter out the deleted item
            const filteredItems = items.filter(item => item.id !== itemId);
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfSystemPromptItems: filteredItems } });
        });
        /**
         * Toggle append status of a system prompt item
         * @param courseId - The course ID
         * @param itemId - The item ID to toggle
         * @param append - Whether to append (true) or remove (false)
         */
        this.toggleSystemPromptItemAppend = (courseId, itemId, append) => __awaiter(this, void 0, void 0, function* () {
            yield this.updateSystemPromptItem(courseId, itemId, { isAppended: append });
        });
        /**
         * Save multiple append status changes at once
         * @param courseId - The course ID
         * @param changes - Array of changes with itemId and append status
         */
        this.saveSystemPromptAppendChanges = (courseId, changes) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const items = course.collectionOfSystemPromptItems || [];
            // Create a map of changes for quick lookup
            const changesMap = new Map(changes.map(change => [change.itemId, change.append]));
            // Update items with new append status
            const updatedItems = items.map(item => {
                if (changesMap.has(item.id)) {
                    return Object.assign(Object.assign({}, item), { isAppended: changesMap.get(item.id) });
                }
                return item;
            });
            yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfSystemPromptItems: updatedItems } });
        });
        /**
         * Ensure the three default system prompt components exist for a course
         * Creates them if missing
         * @param courseId - The course ID
         * @param courseName - The course name (for logging)
         */
        this.ensureDefaultSystemPromptComponents = (courseId, courseName) => __awaiter(this, void 0, void 0, function* () {
            const course = yield this.getActiveCourse(courseId);
            if (!course) {
                throw new Error(`Course with id ${courseId} not found`);
            }
            const items = course.collectionOfSystemPromptItems || [];
            const existingIds = new Set(items.map(item => item.id));
            const dateCreated = new Date();
            // Ensure base system prompt exists
            if (!existingIds.has(types_1.DEFAULT_BASE_PROMPT_ID)) {
                const basePrompt = {
                    id: types_1.DEFAULT_BASE_PROMPT_ID,
                    title: 'Base System Prompt',
                    content: chat_prompts_1.SYSTEM_PROMPT,
                    dateCreated: dateCreated,
                    isAppended: true, // Always included
                    isDefault: true,
                    componentType: 'base'
                };
                items.push(basePrompt);
                console.log(`✅ Created default base system prompt for course: ${courseName || courseId}`);
            }
            // Ensure learning objectives component exists
            if (!existingIds.has(types_1.DEFAULT_LEARNING_OBJECTIVES_ID)) {
                const learningObjectives = {
                    id: types_1.DEFAULT_LEARNING_OBJECTIVES_ID,
                    title: 'Learning Objectives',
                    content: '<learningobjectives></learningobjectives>', // Placeholder for regex replacement
                    dateCreated: dateCreated,
                    isAppended: true, // Always included
                    isDefault: true,
                    componentType: 'learning-objectives'
                };
                items.push(learningObjectives);
                console.log(`✅ Created default learning objectives component for course: ${courseName || courseId}`);
            }
            // Ensure struggle topics component exists
            if (!existingIds.has(types_1.DEFAULT_STRUGGLE_TOPICS_ID)) {
                const struggleTopics = {
                    id: types_1.DEFAULT_STRUGGLE_TOPICS_ID,
                    title: 'Struggle Topics',
                    content: '<strugglewords></strugglewords>', // Placeholder for regex replacement
                    dateCreated: dateCreated,
                    isAppended: true, // Always included
                    isDefault: true,
                    componentType: 'struggle-topics'
                };
                items.push(struggleTopics);
                console.log(`✅ Created default struggle topics component for course: ${courseName || courseId}`);
            }
            // Update database if any items were added
            const courseData = course;
            const existingItems = courseData.collectionOfSystemPromptItems || [];
            if (items.length > existingItems.length) {
                yield this.getCourseCollection().updateOne({ id: courseId }, { $set: { collectionOfSystemPromptItems: items } });
            }
        });
        this.idGenerator = unique_id_generator_1.IDGenerator.getInstance();
        this.client = new mongodb_1.MongoClient(EngEAI_MongoDB.MONGO_URI, {
            authSource: process.env.MONGO_AUTH_SOURCE
        });
    }
    static getInstance() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!EngEAI_MongoDB.instance) {
                EngEAI_MongoDB.instance = new EngEAI_MongoDB();
                // Connect to MongoDB
                try {
                    yield EngEAI_MongoDB.instance.client.connect();
                    EngEAI_MongoDB.instance.db = EngEAI_MongoDB.instance.client.db(process.env.MONGO_DB_NAME);
                    console.log('✅ MongoDB connected successfully');
                }
                catch (error) {
                    console.error('❌ Failed to connect to MongoDB:', error);
                    throw new Error(`MongoDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            return EngEAI_MongoDB.instance;
        });
    }
    /**
     * Get the active course list collection
     */
    getCourseCollection() {
        return this.db.collection(EngEAI_MongoDB.activeCourseListCollection);
    }
    testConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.db.admin().ping();
                return true;
            }
            catch (error) {
                console.error('❌ MongoDB connection test failed:', error);
                return false;
            }
        });
    }
    /**
     * Get collection names for a course, either from stored course document or computed fallback
     * @param courseName - The name of the course
     * @returns Object with users, flags, and memoryAgent collection names
     */
    getCollectionNames(courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check cache first
            if (this.collectionNamesCache.has(courseName)) {
                return this.collectionNamesCache.get(courseName);
            }
            try {
                // Fetch course document from active-course-list
                const course = yield this.getCourseByName(courseName);
                // If course exists and has collections field with all required keys, use stored names
                if (course && course.collections &&
                    course.collections.users &&
                    course.collections.flags &&
                    course.collections.memoryAgent) {
                    const collectionNames = {
                        users: course.collections.users,
                        flags: course.collections.flags,
                        memoryAgent: course.collections.memoryAgent
                    };
                    // Cache the result
                    this.collectionNamesCache.set(courseName, collectionNames);
                    return collectionNames;
                }
            }
            catch (error) {
                console.warn(`[MONGODB] Warning: Could not fetch course document for ${courseName}, using computed collection names:`, error);
            }
            // Fallback to computed collection names (backward compatibility)
            const computedNames = {
                users: `${courseName}_users`,
                flags: `${courseName}_flags`,
                memoryAgent: `${courseName}_memory-agent`
            };
            // Cache the computed names
            this.collectionNamesCache.set(courseName, computedNames);
            return computedNames;
        });
    }
    /**
     * Get the flags collection for a specific course
     * @param courseName - the name of the course
     * @returns the flags collection
     */
    getFlagsCollection(courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            const collections = yield this.getCollectionNames(courseName);
            return this.db.collection(collections.flags);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.client.close();
                console.log('✅ MongoDB connection closed');
            }
            catch (error) {
                console.error('❌ Error closing MongoDB connection:', error);
                throw error;
            }
        });
    }
    // =====================================
    // ========= USER MANAGEMENT ===========
    // =====================================
    /**
     * Get the user collection for a specific course
     * @param courseName - The name of the course (e.g., "APSC 099")
     * @returns Collection instance for the course users
     */
    getUserCollection(courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            const collections = yield this.getCollectionNames(courseName);
            return this.db.collection(collections.users);
        });
    }
    // ===========================================
    // ========= GLOBAL USER MANAGEMENT =========
    // ===========================================
    /**
     * Get the global users collection
     */
    getGlobalUserCollection() {
        return this.db.collection(EngEAI_MongoDB.activeUsersCollection);
    }
    // ===========================================
    // ========= MEMORY AGENT MANAGEMENT =========
    // ===========================================
    /**
     * Get the memory-agent collection for a specific course
     * @param courseName - The name of the course (e.g., "APSC 099")
     * @returns Collection instance for the course memory-agent entries
     */
    getMemoryAgentCollection(courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            const collections = yield this.getCollectionNames(courseName);
            return this.db.collection(collections.memoryAgent);
        });
    }
    /**
     * Map affiliation to role for memory agent
     * @param affiliation - The user's affiliation ('student' or 'faculty')
     * @returns The corresponding role ('Student', 'instructor', or 'TA')
     */
    mapAffiliationToRole(affiliation) {
        if (affiliation === 'student') {
            return 'Student';
        }
        // For now, map 'faculty' to 'instructor'
        // TODO: Add logic to distinguish between 'instructor' and 'TA' if needed
        return 'instructor';
    }
}
exports.EngEAI_MongoDB = EngEAI_MongoDB;
EngEAI_MongoDB.activeCourseListCollection = 'active-course-list';
EngEAI_MongoDB.activeUsersCollection = 'active-users';
EngEAI_MongoDB.MONGO_URI = `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(process.env.MONGO_PASSWORD || '')}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
