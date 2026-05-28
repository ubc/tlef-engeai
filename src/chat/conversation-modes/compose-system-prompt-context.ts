/**
 * Context for assembling a system prompt with course overlays.
 *
 * @latest app version: 1.2.9.11
 */

import { LearningObjectiveForDisplay, SystemPromptItem } from '../../types/shared';

export interface SystemPromptBuildContext {
    baseSystemPrompt?: string;
    courseName?: string;
    learningObjectives?: LearningObjectiveForDisplay[];
    appendedSystemPromptItems?: SystemPromptItem[];
    debug?: boolean;
}
