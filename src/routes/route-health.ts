import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';

const router = Router();

/**
 * GET /
 * Health check endpoint. Verifies MongoDB connection.
 *
 * @route GET /api/health
 * @returns {object} { success: boolean, data?: { status, database, connectionState, timestamp }, error?: string }
 * @response 200 - Healthy, database connected
 * @response 503 - Database connection unhealthy
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        // Test the connection by pinging the database
        await instance['db'].admin().ping();
        
        res.status(200).json({
            success: true,
            data: {
                status: 'healthy',
                database: 'connected',
                connectionState: 1,
                timestamp: Date.now().toString()
            }
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: 'Database connection unhealthy'
        });
    }
}));

export default router;
