/**
 * system-prompt-config-routes.ts
 *
 * Mongo-backed instructor system prompt config (v2) on `active-course-list.systemPromptConfig`.
 * Mounted from `route-mongo.ts` under `/api/courses`.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal, requireInstructorForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { conversationModePrompts } from '../../chat/compose-system-prompt';
import { appLogger } from '../../utils/logger';
import { systemPromptConfigApi } from '../../utils/system-prompt-config-api';
import { getPlatformInstructorModules, reloadPlatformDefaultsCache } from '../../chat/system-prompts/system-prompt-defaults-loader';

function invalidModeResponse(res: Response): Response {
    return res.status(400).json({ success: false, error: 'Invalid conversation mode' });
}

/**
 * Registers system prompt config v2 routes on the courses router.
 */
export function mountSystemPromptConfigRoutes(router: Router): void {
    /**
     * GET /:courseId/system-prompts/config
     * Full per-course config with displayModules for the instructor UI.
     */
    router.get(
        '/:courseId/system-prompts/config',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = req.params;
            const instance = await EngEAI_MongoDB.getInstance();
            const config = await instance.getSystemPromptConfig(courseId);
            res.json({ success: true, data: systemPromptConfigApi.enrichForInstructorApi(config) });
        })
    );

    /**
     * PUT /:courseId/system-prompts/config/modes/:mode
     * Autosave one mode (`modules`, `usePlatformDefault`).
     */
    router.put(
        '/:courseId/system-prompts/config/modes/:mode',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, mode } = req.params;
            if (!conversationModePrompts.isValidConversationMode(mode)) {
                return invalidModeResponse(res);
            }
            const { modules, usePlatformDefault } = req.body ?? {};
            if (modules !== undefined) {
                const err = systemPromptConfigApi.validateModules(modules);
                if (err) {
                    return res.status(400).json({ success: false, error: err });
                }
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const data = await instance.updateModeSystemPrompt(courseId, mode, {
                modules,
                usePlatformDefault,
            });
            res.json({ success: true, data: systemPromptConfigApi.enrichForInstructorApi(data) });
        })
    );

    /**
     * POST /:courseId/system-prompts/config/modes/:mode/reset
     * Reset one mode to platform defaults (Mongo snapshot + usePlatformDefault).
     */
    router.post(
        '/:courseId/system-prompts/config/modes/:mode/reset',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, mode } = req.params;
            if (!conversationModePrompts.isValidConversationMode(mode)) {
                return invalidModeResponse(res);
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const data = await instance.resetModeSystemPrompt(courseId, mode);
            res.json({ success: true, data: systemPromptConfigApi.enrichForInstructorApi(data) });
        })
    );

    /**
     * PUT /:courseId/system-prompts/config/default-conversation-mode
     * Default teaching mode for new student chats.
     */
    router.put(
        '/:courseId/system-prompts/config/default-conversation-mode',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = req.params;
            const { mode } = req.body ?? {};
            if (!conversationModePrompts.isValidConversationMode(mode)) {
                return invalidModeResponse(res);
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const data = await instance.setDefaultConversationMode(courseId, mode);
            res.json({ success: true, data: systemPromptConfigApi.enrichForInstructorApi(data) });
        })
    );

    /**
     * GET /:courseId/system-prompts/config/platform-modules/:mode
     * Read-only shipped instructor modules from platform JSON.
     */
    router.get(
        '/:courseId/system-prompts/config/platform-modules/:mode',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { mode } = req.params;
            if (!conversationModePrompts.isValidConversationMode(mode)) {
                return invalidModeResponse(res);
            }
            res.json({ success: true, modules: getPlatformInstructorModules(mode) });
        })
    );

    /**
     * POST /:courseId/system-prompts/config/validate-plain
     * Validates plain XML for the plain editor before save.
     */
    router.post(
        '/:courseId/system-prompts/config/validate-plain',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { xml } = req.body ?? {};
            if (typeof xml !== 'string') {
                return res.status(400).json({ success: false, error: 'xml string required' });
            }
            const result = systemPromptConfigApi.validatePlainXml(xml);
            res.json({ success: true, ...result });
        })
    );

    /**
     * POST /admin/system-prompt-defaults/reload
     * Reload platform default JSON/md from disk (global admin).
     */
    router.post(
        '/admin/system-prompt-defaults/reload',
        requireAdminGlobal,
        asyncHandlerWithAuth(async (_req: Request, res: Response) => {
            reloadPlatformDefaultsCache();
            appLogger.log('[ADMIN] Reloaded platform system prompt defaults from disk');
            res.json({ success: true, message: 'Platform defaults reloaded' });
        })
    );
}
