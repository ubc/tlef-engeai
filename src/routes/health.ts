import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';

const router = Router();

// GET /api/health - Health check endpoint
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
