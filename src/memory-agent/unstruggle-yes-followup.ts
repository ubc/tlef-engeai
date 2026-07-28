/**
 * UnstruggleYesFollowup — post-unstruggle Yes practice suggestion
 *
 * Forked LLM call after the student confirms mastery of a struggle topic:
 * pick up to three catalog learning-objective texts, then resolve published
 * scenario questions for the chat UI. Owns schema, prompts, and the follow-up function.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: Unstruggle Yes → LO text selection → published scenario suggestions.
 */

import { z } from 'zod';
import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { LearningObjectiveForLLM, ScenarioSuggestionForChat } from '../types/shared';
import {
    getRandomYesNoScenariosMessage,
    getRandomYesWithScenariosMessage,
} from './unstruggle-responses';
import { isDeveloperMode, getMockUnstruggleYesFollowup } from '../helpers/developer-mode';
import { appendScenarioSuggestionsTag } from '../utils/message-utils';
import { appLogger } from '../utils/logger';

const llmModule = new LLMModule(loadConfig().llmConfig);

// =====================================================
// Structured LLM output schema
// =====================================================

/** Zod schema for the forked unstruggle-Yes LLM response. */
export const unstruggleYesFollowupResponseSchema = z.object({
    learningObjectiveTexts: z.array(z.string()).max(3),
});

export type UnstruggleYesFollowupResponse = z.infer<typeof unstruggleYesFollowupResponseSchema>;

/**
 * filterVerbatimObjectiveTexts - keep only catalog-exact LO texts (trimmed), max 3, deduped.
 *
 * @param rawTexts - LLM (or mock) objective text candidates
 * @param allowedTexts - course catalog texts allowed as exact matches
 * @returns Validated objective texts in first-seen order
 */
export function filterVerbatimObjectiveTexts(
    rawTexts: string[],
    allowedTexts: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];
    for (const raw of rawTexts) {
        const trimmed = raw.trim();
        if (!trimmed || !allowedTexts.has(trimmed) || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= 3) break;
    }
    return validated;
}

// =====================================================
// Prompt builders
// =====================================================

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
    return escapeXmlText(value).replace(/"/g, '&quot;');
}

/**
 * formatLearningObjectiveCatalog - format the learning objective catalog for the LLM
 * 
 * Example output:
 * 
 * <course_learning_objective_catalog>
 *   <learning_objective topic="Topic 1" item="Item 1">Text 1</learning_objective>
 *   <learning_objective topic="Topic 2" item="Item 2">Text 2</learning_objective>
 *   <learning_objective topic="Topic 3" item="Item 3">Text 3</learning_objective>
 * </course_learning_objective_catalog>
 *
 * @param catalog - deduped course learning objectives for verbatim selection
 * @returns XML-wrapped catalog string
 * 
 */
function formatLearningObjectiveCatalog(catalog: LearningObjectiveForLLM[]): string {
    if (catalog.length === 0) {
        return '<course_learning_objective_catalog>\n</course_learning_objective_catalog>';
    }
    const lines = ['<course_learning_objective_catalog>'];
    for (const row of catalog) {
        lines.push(
            `  <learning_objective topic="${escapeXmlAttr(row.topicOrWeekTitle)}" item="${escapeXmlAttr(row.itemTitle)}">${escapeXmlText(row.text)}</learning_objective>`
        );
    }
    lines.push('</course_learning_objective_catalog>');
    return lines.join('\n');
}

/**
 * buildUnstruggleYesFollowupSystemPrompt - system prompt for post-unstruggle Yes LO selection.
 *
 * @param clearedStruggleTopic - struggle label the student just confirmed
 * @param catalog - deduped course learning objectives for verbatim selection
 * @returns System prompt string with embedded XML catalog
 */
export function buildUnstruggleYesFollowupSystemPrompt(
    clearedStruggleTopic: string,
    catalog: LearningObjectiveForLLM[]
): string {
    const catalogBlock = formatLearningObjectiveCatalog(catalog);

    return `# Unstruggle yes follow-up — learning objective selection

## Purpose
The student confirmed they are confident with a struggle topic. Your only job is to select up to three learning objective texts from the course catalog that best support follow-up practice scenario questions related to that topic and the recent conversation.

Do NOT write encouragement or chat prose. The application supplies the student-facing message separately.

## Cleared struggle topic
${clearedStruggleTopic}

## Course learning objective catalog
${catalogBlock}

## Output
Return JSON with one field:
- \`learningObjectiveTexts\`: array of 0–3 strings

## Rules
- Each string in \`learningObjectiveTexts\` MUST match a catalog \`<learning_objective>\` body text exactly (verbatim copy).
- Pick objectives semantically related to the cleared struggle topic and the conversation excerpt.
- Prefer objectives that are natural next steps for practice, not the exact same wording as the struggle label unless clearly appropriate.
- Return an empty array if nothing in the catalog is a reasonable match.
- Do NOT invent objectives not present in the catalog.
- Do NOT return topic titles, item titles, or internal ids — only the objective text strings.`;
}

/**
 * buildUnstruggleYesFollowupUserTurn - wraps recent chat excerpt for the forked LLM call.
 *
 * @param recentMessages - recent conversation text (may be empty)
 * @returns XML-wrapped user turn
 */
export function buildUnstruggleYesFollowupUserTurn(recentMessages: string): string {
    if (!recentMessages.trim()) {
        return '<conversation_excerpt>\n(no prior messages)\n</conversation_excerpt>';
    }
    return `<conversation_excerpt>\n${recentMessages.trim()}\n</conversation_excerpt>`;
}

// =====================================================
// Follow-up function
// =====================================================

/** Input for the unstruggle-Yes follow-up fork. */
export interface UnstruggleYesFollowupInput {
    userId: string;
    courseName: string;
    clearedStruggleTopic: string;
    recentMessages: string;
}

/** Display text plus resolved scenario chips for the chat UI. */
export interface UnstruggleYesFollowupResult {
    displayText: string;
    scenarioSuggestions: ScenarioSuggestionForChat[];
    learningObjectiveTexts: string[];
}

/**
 * dedupeLearningObjectiveCatalog - one row per trimmed LO text (first occurrence wins).
 *
 * @param rows - raw Mongo learning-objective rows
 * @returns Catalog rows safe to send to the LLM
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

    // dedup the catalog
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

/** Encouragement-only result when no scenarios can be suggested. */
function noScenariosResult(topic: string): UnstruggleYesFollowupResult {
    return {
        displayText: getRandomYesNoScenariosMessage(topic),
        scenarioSuggestions: [],
        learningObjectiveTexts: [],
    };
}

/**
 * suggestPracticeAfterUnstruggleYes - LLM picks LO texts; backend resolves published scenarios.
 *
 * Returns `{ displayText, scenarioSuggestions, learningObjectiveTexts }`.
 * On missing course, empty catalog, or LLM failure, returns encouragement with no scenarios.
 *
 * @param input - user, course, cleared topic, and recent chat excerpt
 * @returns Chat display payload for the unstruggle-Yes path
 */
export async function suggestPracticeAfterUnstruggleYes(
    input: UnstruggleYesFollowupInput
): Promise<UnstruggleYesFollowupResult> {
    // Load course and learning-objective catalog
    const topic = input.clearedStruggleTopic.trim();
    const mongoDB = await EngEAI_MongoDB.getInstance();
    const course = await mongoDB.getCourseByName(input.courseName);
    if (!course?.id) {
        return noScenariosResult(topic);
    }

    // detemrine the allowed texts
    const rawCatalog = await mongoDB.getAllLearningObjectivesWithIds(course.id);
    const catalog = dedupeLearningObjectiveCatalog(rawCatalog);
    const allowedTexts = new Set(catalog.map((row) => row.text));

    // Select learning objective texts (mock, empty catalog, or LLM)
    let objectiveTexts: string[] = [];

    if (isDeveloperMode()) {
        const mock = getMockUnstruggleYesFollowup(catalog);
        objectiveTexts = filterVerbatimObjectiveTexts(mock.learningObjectiveTexts, allowedTexts);
        appLogger.log('[UNSTRUGGLE-YES] Developer mode — using mock LO text selection');
    } else if (catalog.length === 0) {
        return noScenariosResult(topic);
    } else {
        // Call structured LLM for verbatim LO selection
        const systemPrompt = buildUnstruggleYesFollowupSystemPrompt(topic, catalog);
        const userTurn = buildUnstruggleYesFollowupUserTurn(input.recentMessages);
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        try {
            const response = await llmModule.sendStructuredConversation(
                messages,
                unstruggleYesFollowupResponseSchema,
                { structuredOutputName: 'unstruggle_yes_followup' }
            );
            objectiveTexts = filterVerbatimObjectiveTexts(
                response?.parsed?.learningObjectiveTexts ?? [],
                allowedTexts
            );

            appLogger.log('[UNSTRUGGLE-YES] Objective texts:', objectiveTexts);
        } catch (error) {
            appLogger.error('[UNSTRUGGLE-YES] LLM follow-up failed:', error);
            return noScenariosResult(topic);
        }
    }

    // Resolve published scenarios for selected objective texts
    let scenarioSuggestions: ScenarioSuggestionForChat[] = [];
    if (objectiveTexts.length > 0) {
        scenarioSuggestions = await mongoDB.findPublishedScenariosByObjectiveTexts(
            input.courseName,
            objectiveTexts,
            3
        );
    }

    // Build student-facing message (with optional scenario chips tag)
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
