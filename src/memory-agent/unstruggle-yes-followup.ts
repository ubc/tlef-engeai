/**
 * unstruggle-yes-followup.ts
 *
 * Forked LLM call after unstruggle Yes: pick learning objective texts and resolve published scenarios.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { LearningObjectiveForLLM, ScenarioSuggestionForChat } from '../types/shared';
import {
    buildUnstruggleYesFollowupSystemPrompt,
    buildUnstruggleYesFollowupUserTurn,
} from './unstruggle-yes-followup-prompt';
import {
    filterVerbatimObjectiveTexts,
    unstruggleYesFollowupResponseSchema,
} from './unstruggle-yes-followup-schema';
import {
    getRandomYesNoScenariosMessage,
    getRandomYesWithScenariosMessage,
} from './unstruggle-responses';
import { isDeveloperMode, getMockUnstruggleYesFollowup } from '../helpers/developer-mode';
import { appendScenarioSuggestionsTag } from '../utils/message-utils';
import { appLogger } from '../utils/logger';

export interface UnstruggleYesFollowupInput {
    userId: string;
    courseName: string;
    clearedStruggleTopic: string;
    recentMessages: string;
}

export interface UnstruggleYesFollowupResult {
    displayText: string;
    scenarioSuggestions: ScenarioSuggestionForChat[];
    learningObjectiveTexts: string[];
}

/**
 * dedupeLearningObjectiveCatalog - one row per trimmed LO text (first occurrence wins).
 */
export function dedupeLearningObjectiveCatalog(
    rows: Array<{
        objectiveId: string;
        text: string;
        topicOrWeekTitle: string;
        itemTitle: string;
    }>
): LearningObjectiveForLLM[] {
    const seen = new Set<string>();
    const catalog: LearningObjectiveForLLM[] = [];
    for (const row of rows) {
        const text = row.text.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        catalog.push({
            text,
            topicOrWeekTitle: row.topicOrWeekTitle,
            itemTitle: row.itemTitle,
        });
    }
    return catalog;
}

export class UnstruggleYesFollowupService {
    private llmModule: LLMModule;

    constructor(config: AppConfig) {
        this.llmModule = new LLMModule(config.llmConfig);
    }

    /**
     * suggestPracticeAfterUnstruggleYes - LLM picks LO texts; backend resolves published scenario questions.
     */
    public async suggestPracticeAfterUnstruggleYes(
        input: UnstruggleYesFollowupInput
    ): Promise<UnstruggleYesFollowupResult> {
        const topic = input.clearedStruggleTopic.trim();
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getCourseByName(input.courseName);
        if (!course?.id) {
            return this.noScenariosResult(topic);
        }

        const rawCatalog = await mongoDB.getAllLearningObjectivesWithIds(course.id);
        const catalog = dedupeLearningObjectiveCatalog(rawCatalog);
        const allowedTexts = new Set(catalog.map((row) => row.text));

        let objectiveTexts: string[] = [];

        if (isDeveloperMode()) {
            const mock = getMockUnstruggleYesFollowup(catalog);
            objectiveTexts = filterVerbatimObjectiveTexts(mock.learningObjectiveTexts, allowedTexts);
            appLogger.log('[UNSTRUGGLE-YES] Developer mode — using mock LO text selection');
        } else if (catalog.length === 0) {
            return this.noScenariosResult(topic);
        } else {
            const systemPrompt = buildUnstruggleYesFollowupSystemPrompt(topic, catalog);
            const userTurn = buildUnstruggleYesFollowupUserTurn(input.recentMessages);
            const messages: Message[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userTurn },
            ];

            try {
                const response = await this.llmModule.sendStructuredConversation(
                    messages,
                    unstruggleYesFollowupResponseSchema,
                    { structuredOutputName: 'unstruggle_yes_followup' }
                );
                objectiveTexts = filterVerbatimObjectiveTexts(
                    response?.parsed?.learningObjectiveTexts ?? [],
                    allowedTexts
                );


                // print the objective texts
                appLogger.log('\n\n--------------------------------------------------\n\n');
                appLogger.log('[UNSTRUGGLE-YES] Objective texts:', objectiveTexts);
                appLogger.log('\n\n--------------------------------------------------\n\n');
            } catch (error) {
                appLogger.error('[UNSTRUGGLE-YES] LLM follow-up failed:', error);
                return this.noScenariosResult(topic);
            }
        }

        let scenarioSuggestions: ScenarioSuggestionForChat[] = [];
        if (objectiveTexts.length > 0) {
            scenarioSuggestions = await mongoDB.findPublishedScenariosByObjectiveTexts(
                input.courseName,
                objectiveTexts,
                3
            );
        }

        const messageText =
            scenarioSuggestions.length > 0
                ? getRandomYesWithScenariosMessage(topic)
                : getRandomYesNoScenariosMessage(topic);

        const displayText =
            scenarioSuggestions.length > 0
                ? appendScenarioSuggestionsTag(messageText, scenarioSuggestions)
                : messageText;

        return { displayText, scenarioSuggestions, learningObjectiveTexts: objectiveTexts };
    }

    private noScenariosResult(topic: string): UnstruggleYesFollowupResult {
        return {
            displayText: getRandomYesNoScenariosMessage(topic),
            scenarioSuggestions: [],
            learningObjectiveTexts: [],
        };
    }
}

const appConfig = loadConfig();
export const unstruggleYesFollowup = new UnstruggleYesFollowupService(appConfig);
