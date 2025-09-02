
/**
 * ===========================================
 * ========= MONGODB DATABASE MANAGER =======
 * ===========================================
 *
 * This module provides MongoDB integration for the EngE-AI platform's course management system.
 * It implements a singleton pattern for database connections and provides CRUD operations
 * for active course management within the educational platform.
 *
 * Key Features:
 * - Singleton MongoDB connection management with authentication
 * - Active course list database operations (CRUD)
 * - Course schema validation with Mongoose ODM
 * - Environment-based configuration for database credentials
 * - Express.js router integration for RESTful API endpoints
 *
 * Database Structure:
 * - Database: active-course-list-db
 * - Collection: active-course-list
 * - Schema: Course with id, name, description, timestamps
 *
 * Environment Variables Required:
 * - MONGO_USERNAME: MongoDB authentication username
 * - MONGO_PASSWORD: MongoDB authentication password
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import express, { Request, Response } from 'express';
const router = express.Router();
export default router;
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ActiveCourseListDB } from '../functions/types';
dotenv.config();


export class EngEAI_MongoDB {

    private static instance: EngEAI_MongoDB;
    private static activeCourseListDatabase: string = 'active-course-list-db';
    private static activeCourseListCollection: string = 'active-course-list';
    private static MONGO_URL = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017`;
    private activeCourses = [];
    
    constructor() {
    }

    /**
     * Get the singleton instance of the EngEAI_MongoDB class
     */
    public static async getInstance(): Promise<EngEAI_MongoDB> {
        if (!EngEAI_MongoDB.instance) {
            EngEAI_MongoDB.instance = new EngEAI_MongoDB();
            
            // Only connect if not already connected
            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(EngEAI_MongoDB.MONGO_URL, {
                    authSource: 'admin',
                });
            }
        }
        return EngEAI_MongoDB.instance;
    }

    //set course schema
    private courseSchema = mongoose.model('courselist', new mongoose.Schema({
        id: { type: String, required: true },
        name: { type: String, required: true }, // should be unique
        frameType: { type: String, required: true, enum: ['byWeek', 'byTopic'] },
        tilesNumber: { type: Number, required: true },
        date: { type: Date, required: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    }, { collection: EngEAI_MongoDB.activeCourseListCollection }));

    /**
     * post active course, creates a database and collection for the course
     * 
     * it sets up the following collections and schemas:
     * - users
     * - messages
     * - learning objectives
     * - flag reports
     * 
     * @param course - the active course to post
     * @returns void
     */
    public postActiveCourse = async (course: ActiveCourseListDB) => {

        try {
        
            await this.courseSchema.create(course);

            //create DB called this course's name
            const dbName = course.name;
    
            //create users collection, schema, push a random user into the collection, and remove it after 1 second
            //helps to ensure that the DB and collection is created
            const userCollection = `${dbName}_users`;
            const userSchema = mongoose.model(userCollection, new mongoose.Schema({
                id: { type: String, required: true },
                name: { type: String, required: true },
                UBCID: { type: String, required: true },
                role: { type: String, required: true, enum: ['student', 'instructor', 'teaching assistant'] },
                createdAt: { type: Date, default: Date.now },
                updatedAt: { type: Date, default: Date.now },
            }, { collection: userCollection }));
            userSchema.createCollection();
    
            //create messages collection
            //message follows the same schema as the chat messages
            const messagesCollection = `${dbName}_messages`;
            const messagesSchema = mongoose.model(
                messagesCollection, new mongoose.Schema({
                    id: { type: String, required: true },
                    sender: { type: String, required: true },
                    userId: { type: Number, required: true },
                    courseName: { type: String, required: true },
                    isPinned: { type: Boolean, required: true },
                    isFlag: { type: Boolean, required: true },
                    content: { type: String, required: true },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now },
                }, { collection: messagesCollection })
            );
            messagesSchema.createCollection();
    
            //create documents collection
            const learningObjectivesCollection = `${dbName}_learningObjectives`;
            const learningObjectivesSchema = mongoose.model(
                learningObjectivesCollection, new mongoose.Schema({
                    id: { type: String, required: true },
                    name: { type: String, required: true },
                    content: { type: String, required: true },
                    courseName: { type: String, required: true },
                    subcontentTitle: { type: String, required: true },
                    contentTitle: { type: String, required: true },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now },
                }, { collection: learningObjectivesCollection })
            );
    
            learningObjectivesSchema.createCollection();
    
            //create flags collection
            const flagsCollection = `${dbName}_flags`;
            const flagReportSchema = mongoose.model(
                flagsCollection, new mongoose.Schema({
                    id: { type: String, required: true },
                    timestamp: { type: String, required: true },
                    flagType: { type: String, required: true },
                    reportType: { type: String, required: true },
                    chatContent: { type: String, required: true },
                    userId: { type: Number, required: true },
                    status: { type: String, required: true },
                    response: { type: String, required: false },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now },
                }, { collection: flagsCollection })
            );
            flagReportSchema.createCollection();
        
        } catch (error) {
            console.error('Error creating collections and schemas:', error);
        }
    }
        
    /**
     * Delete an active course from the database
     * @param course - the course to delete
     * @returns Promise<void>
     */
    public deleteActiveCourse = async (course: ActiveCourseListDB) => {
        await this.courseSchema.deleteOne({ id: course.id });
    }

    /**
     * Get an active course by its ID
     * @param id - the course ID to search for
     * @returns Promise<any> - the course document or null if not found
     */
    public getActiveCourse = async (id: string) => {
        return await this.courseSchema.findOne({ id: id });
    }

    /**
     * Get a course by its name
     * @param name - the course name to search for
     * @returns Promise<any> - the course document or null if not found
     */
    public getCourseByName = async (name: string) => {
        return await this.courseSchema.findOne({ name: name });
    }

    /**
     * Get all active courses from the database
     * @returns Promise<any[]> - array of all course documents
     */
    public getAllActiveCourses = async () => {
        return await this.courseSchema.find();
    }

    /**
     * Update an active course in the database
     * @param id - the course ID to update
     * @param updateData - the data to update
     * @returns Promise<any> - the updated course document
     */
    public updateActiveCourse = async (id: string, updateData: Partial<ActiveCourseListDB>) => {
        return await this.courseSchema.findOneAndUpdate(
            { id: id },
            { ...updateData, updatedAt: new Date() },
            { new: true }
        );
    }

}

/**
 * ===========================================
 * ========= EXPRESS ROUTES SETUP ===========
 * ===========================================
 */

// Middleware for error handling
const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
    (req: Request, res: Response) => {
        Promise.resolve(fn(req, res))
            .catch((error) => {
                console.error('Error in MongoDB route:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            });
    };

// Validation middleware
const validateCourse = (req: Request, res: Response, next: Function) => {
    const course = req.body;
    
    if (!course) {
        return res.status(400).json({
            success: false,
            error: 'Request body is required'
        });
    }

    if (!course.id || typeof course.id !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Course ID is required and must be a string'
        });
    }

    if (!course.name || typeof course.name !== 'string' || course.name.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Course name is required and must be a non-empty string'
        });
    }

    if (!course.frameType || !['byWeek', 'byTopic'].includes(course.frameType)) {
        return res.status(400).json({
            success: false,
            error: 'Frame type is required and must be either "byWeek" or "byTopic"'
        });
    }

    if (!course.tilesNumber || typeof course.tilesNumber !== 'number' || course.tilesNumber < 0) {
        return res.status(400).json({
            success: false,
            error: 'Tiles number is required and must be a positive number'
        });
    }

    if (!course.date || !(course.date instanceof Date) && !Date.parse(course.date)) {
        return res.status(400).json({
            success: false,
            error: 'Date is required and must be a valid date'
        });
    }

    next();
};

// Routes

// POST /api/mongodb/courses - Create a new course
router.post('/courses', validateCourse, asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const courseData: ActiveCourseListDB = {
            ...req.body,
            date: new Date(req.body.date)
        };
        
        await instance.postActiveCourse(courseData);
        res.status(201).json({
            success: true,
            data: courseData,
            message: 'Course created successfully'
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate')) {
            res.status(409).json({
                success: false,
                error: 'Course with this ID already exists'
            });
        } else {
            throw error;
        }
    }
}));

// GET /api/mongodb/courses - Get all courses
router.get('/courses', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    const courses = await instance.getAllActiveCourses();
    
    res.status(200).json({
        success: true,
        data: courses,
        count: courses.length
    });
}));

// GET /api/mongodb/courses/:id - Get course by ID
router.get('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    const course = await instance.getActiveCourse(req.params.id);
    
    if (!course) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    res.status(200).json({
        success: true,
        data: course
    });
}));

// GET /api/mongodb/courses/name/:name - Get course by name
router.get('/courses/name/:name', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    const course = await instance.getCourseByName(req.params.name);
    
    if (!course) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    res.status(200).json({
        success: true,
        data: course
    });
}));

// PUT /api/mongodb/courses/:id - Update course
router.put('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    // First check if course exists
    const existingCourse = await instance.getActiveCourse(req.params.id);
    if (!existingCourse) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    // Update the course
    const updateData = req.body;
    const updatedCourse = await instance.updateActiveCourse(req.params.id, updateData);
    
    res.status(200).json({
        success: true,
        data: updatedCourse,
        message: 'Course updated successfully'
    });
}));

// DELETE /api/mongodb/courses/:id - Delete course
router.delete('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    // First check if course exists
    const existingCourse = await instance.getActiveCourse(req.params.id);
    if (!existingCourse) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    // Delete the course
    await instance.deleteActiveCourse(existingCourse as ActiveCourseListDB);
    
    res.status(200).json({
        success: true,
        message: 'Course deleted successfully'
    });
}));

// Health check endpoint
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const connectionState = mongoose.connection.readyState;
        
        res.status(200).json({
            success: true,
            data: {
                status: 'healthy',
                database: 'connected',
                connectionState: connectionState,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: 'Database connection unhealthy'
        });
    }
}));











