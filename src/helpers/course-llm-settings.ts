/**
 * Course LLM settings — thin re-exports from ModelSelectionService.
 *
 * Prefer importing from `src/dashboard-setting/model-selection-service` for new code.
 * Kept so older import paths continue to resolve during the migration.
 *
 * @description: Compatibility façade over the dashboard-setting singleton.
 */

export {
    DEFAULT_COURSE_LLM_SETTINGS,
    isCourseLlmModelId,
    isAppReasoningLevel,
    ModelSelectionService,
} from '../dashboard-setting/model-selection-service';
