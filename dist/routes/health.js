"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const router = (0, express_1.Router)();
// GET /api/health - Health check endpoint
router.get('/', (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const instance = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        // Test the connection by pinging the database
        yield instance['db'].admin().ping();
        res.status(200).json({
            success: true,
            data: {
                status: 'healthy',
                database: 'connected',
                connectionState: 1,
                timestamp: Date.now().toString()
            }
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            error: 'Database connection unhealthy'
        });
    }
})));
exports.default = router;
