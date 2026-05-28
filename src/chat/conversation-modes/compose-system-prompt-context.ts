/**
 * Context for assembling a system prompt with course overlays.
 *
 */

import { LearningObjectiveForDisplay, SystemPromptItem } from '../../types/shared';

export interface SystemPromptBuildContext {
    baseSystemPrompt?: string;
    courseName?: string;
    learningObjectives?: LearningObjectiveForDisplay[];
    appendedSystemPromptItems?: SystemPromptItem[];
    debug?: boolean;
}
