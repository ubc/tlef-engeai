"use strict";
/**
 * USER MANAGEMENT API
 *
 * Handles user-related API endpoints for the new user management system
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const user_utils_1 = require("../functions/user-utils");
const router = express_1.default.Router();
/**
 * GET /api/user/current
 *
 * Get current CourseUser from session
 */
router.get('/current', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentCourse = req.session.currentCourse;
        const globalUser = req.session.globalUser;
        if (!currentCourse || !globalUser) {
            return res.status(404).json({ error: 'No current course or user found' });
        }
        // Get CourseUser from course-specific collection using userId (not PUID)
        const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        const courseUser = yield mongoDB.findStudentByUserId(currentCourse.courseName, globalUser.userId);
        if (!courseUser) {
            return res.status(404).json({ error: 'CourseUser not found' });
        }
        // Sanitize globalUser to remove PUID before sending to frontend
        // PUID is stored in session/backend but must NEVER be exposed to frontend
        return res.json({
            courseUser,
            globalUser: (0, user_utils_1.sanitizeGlobalUserForFrontend)(globalUser),
            currentCourse
        });
    }
    catch (error) {
        console.error('[USER-CURRENT] Error:', error);
        return res.status(500).json({
            error: 'Failed to get current user'
        });
    }
})));
/**
 * POST /api/user/update-onboarding
 *
 * Updates CourseUser's onboarding status
 */
router.post('/update-onboarding', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, courseName, userOnboarding } = req.body;
        if (!userId || !courseName) {
            return res.status(400).json({
                success: false,
                error: 'userId and courseName are required'
            });
        }
        console.log(`[UPDATE-ONBOARDING] Updating user ${userId} in course ${courseName}`);
        const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        const userCollection = mongoDB.db.collection(`${courseName}_users`);
        const result = yield userCollection.findOneAndUpdate({ userId: userId }, {
            $set: {
                userOnboarding: userOnboarding,
                updatedAt: new Date()
            }
        }, { returnDocument: 'after' });
        if (result) {
            console.log(`[UPDATE-ONBOARDING] ✅ Onboarding status updated`);
            return res.json({
                success: true,
                courseUser: result
            });
        }
        else {
            console.error(`[UPDATE-ONBOARDING] ❌ User not found`);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
    }
    catch (error) {
        console.error('[UPDATE-ONBOARDING] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update onboarding status'
        });
    }
})));
/**
 * POST /api/user/activity
 *
 * Updates server-side last activity timestamp for cross-tab synchronization
 * Used by InactivityTracker to sync inactivity state across multiple tabs
 */
router.post('/activity', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { lastActivityTime } = req.body;
        const currentTime = Date.now();
        // Update session with last activity time
        // Use the client's lastActivityTime if provided and recent, otherwise use current server time
        let serverLastActivityTime;
        if (lastActivityTime && typeof lastActivityTime === 'number') {
            // Use client's timestamp if it's reasonable (within last 10 minutes)
            const timeDiff = Math.abs(currentTime - lastActivityTime);
            if (timeDiff < 10 * 60 * 1000) {
                serverLastActivityTime = lastActivityTime;
            }
            else {
                // Client timestamp seems off, use server time
                serverLastActivityTime = currentTime;
            }
        }
        else {
            // No client timestamp provided, use server time
            serverLastActivityTime = currentTime;
        }
        // Store in session for cross-tab synchronization
        req.session.lastActivityTime = serverLastActivityTime;
        // Return current server time and last activity time for client sync
        return res.json({
            success: true,
            currentTime: currentTime,
            serverLastActivityTime: serverLastActivityTime,
            lastActivityTime: serverLastActivityTime // Alias for compatibility
        });
    }
    catch (error) {
        console.error('[USER-ACTIVITY] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update activity timestamp'
        });
    }
})));
exports.default = router;
