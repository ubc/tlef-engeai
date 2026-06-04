/**
 * Assembles the full LLM system prompt XML for a course and conversation mode.
 *
 * Order: instructor modules only; learning objectives are injected into course main intro at assembly.
 */

import {
    ConversationModeId,
    CourseSystemPromptConfig,
    LearningObjectiveForDisplay,
    ModeSystemPromptState,
    SystemPromptModule,
} from '../../types/shared';
import { buildSystemPromptXml } from './system-prompt-xml';
import { getPlatformInstructorModules } from './system-prompt-defaults-loader';

export const COURSE_MAIN_INTRO_MODULE_ID = 'course main intro';
export const COURSE_LEARNING_OBJECTIVES_PLACEHOLDER = '{{course_learning_objectives}}';

const EMPTY_LEARNING_OBJECTIVES_BLOCK = '<course_learning_objectives></course_learning_objectives>';

export interface AssembleCourseSystemPromptInput {
    mode: ConversationModeId;
    courseName?: string;
    learningObjectives?: LearningObjectiveForDisplay[];
    config?: CourseSystemPromptConfig | null;
}

/**
 * Builds the XML system message sent to the LLM for a chat session.
 */
export function assembleCourseSystemPrompt(input: AssembleCourseSystemPromptInput): string {
    const mode = input.mode;
    const modeState = input.config?.modes?.[mode];

    const modules: SystemPromptModule[] = [];
    const instructorModules = resolveInstructorModules(mode, modeState);
    const loBlock = formatRuntimeLearningObjectives(input.learningObjectives);

    for (let index = 0; index < instructorModules.length; index++) {
        const mod = instructorModules[index];
        const body =
            mod.id === COURSE_MAIN_INTRO_MODULE_ID
                ? injectLearningObjectivesIntoCourseMainIntro(mod.body, loBlock)
                : mod.body;
        modules.push({
            id: mod.id,
            body,
            sortOrder: index,
        });
    }

    return buildSystemPromptXml(mode, modules);
}

/**
 * Resolves instructor modules for API display (excludes system/runtime modules).
 */
export function resolveInstructorModulesForDisplay(
    mode: ConversationModeId,
    modeState?: ModeSystemPromptState
): SystemPromptModule[] {
    return resolveInstructorModules(mode, modeState);
}

function resolveInstructorModules(
    mode: ConversationModeId,
    modeState?: ModeSystemPromptState
): SystemPromptModule[] {
    if (!modeState || modeState.usePlatformDefault) {
        return getPlatformInstructorModules(mode);
    }
    const sorted = [...(modeState.modules ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return sorted.map((m, index) => ({
        id: m.id,
        body: m.body,
        sortOrder: index,
    }));
}

/**
 * Replaces {{course_learning_objectives}} or appends the LO block at end of course main intro.
 */
export function injectLearningObjectivesIntoCourseMainIntro(body: string, loBlock: string): string {
    if (body.includes(COURSE_LEARNING_OBJECTIVES_PLACEHOLDER)) {
        return body.replace(COURSE_LEARNING_OBJECTIVES_PLACEHOLDER, loBlock);
    }
    return `${body.trim()}\n\n${loBlock}`;
}

function formatRuntimeLearningObjectives(
    learningObjectives: LearningObjectiveForDisplay[] | undefined
): string {
    if (!learningObjectives || learningObjectives.length === 0) {
        return EMPTY_LEARNING_OBJECTIVES_BLOCK;
    }

    let content = '<course_learning_objectives>\n';
    learningObjectives.forEach((obj, index) => {
        content += `${index + 1}. [${obj.topicOrWeekTitle ?? ''} - ${obj.itemTitle ?? ''}]: ${obj.LearningObjective}\n`;
    });
    content += '</course_learning_objectives>';
    return content;
}
