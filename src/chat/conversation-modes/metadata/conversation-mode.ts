/**
 * Abstract conversation mode — prompt assembly via module registry.
 *
 */

import { appendCourseContext } from '../append-course-context';
import { SystemPromptBuildContext } from '../compose-system-prompt-context';
import { renderPromptModule } from '../shared/prompt-module-registry';
import { ConversationModeMeta, ConversationModePromptModule } from './conversation-mode-types';

export abstract class ConversationMode {
    abstract readonly meta: ConversationModeMeta;

    getPromptModuleIds(): ConversationModePromptModule[] {
        return [...this.meta.promptModules];
    }

    getTeachingMethodologySection(): string {
        return '';
    }

    getPracticeQuestionsSection(): string {
        return '';
    }

    getDiagramGuidanceSection(): string {
        return '';
    }

    buildSystemPrompt(ctx: SystemPromptBuildContext): string {
        if (ctx.baseSystemPrompt?.trim()) {
            return appendCourseContext(ctx.baseSystemPrompt, ctx);
        }

        const parts: string[] = [];
        for (const moduleId of this.getPromptModuleIds()) {
            const section = renderPromptModule(moduleId, this);
            if (section.trim()) {
                parts.push(section);
            }
        }
        return appendCourseContext(parts.join('\n\n'), ctx);
    }

    abstract formatRagPrompt(context: string, userMessage: string): string;

    abstract getWelcomeMessage(studentName?: string): string;
}
