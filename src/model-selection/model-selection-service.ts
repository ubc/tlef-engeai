/**
 * Model selection validation — catalog-derived id and app reasoning allowlists.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-05
 * @version: 2.0.0
 * @description: VALID_MODEL_IDS and VALID_REASONING_LEVELS (APP_REASONING_LEVELS) for ModelSelectionService.
 */

import { APP_REASONING_LEVELS, LLM_MODEL_CATALOG } from '../dashboard-setting/model-selection-list';
import type { AppReasoningLevel, CourseLlmModelId } from '../types/shared';

/** Valid model IDs derived from the server catalog. */
export const VALID_MODEL_IDS: readonly CourseLlmModelId[] = LLM_MODEL_CATALOG.map((e) => e.id);

/** App UI / PATCH / persistence reasoning levels (not the full provider catalog). */
export const VALID_REASONING_LEVELS: readonly AppReasoningLevel[] = APP_REASONING_LEVELS;
