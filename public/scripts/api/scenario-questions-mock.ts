// public/scripts/api/scenario-questions-mock.ts

/**
 * scenario-questions-mock.ts
 *
 * In-memory mock store for instructor Scenario Questions UI (P1 mock phase).
 * No network calls — swap for scenario-questions-api.ts when backend fields land.
 */

import {
    ScenarioQuestionStatus,
    ScenarioSubQuestionType,
    ScenarioDifficulty,
    ScenarioQuestionExtended,
    ScenarioSubQuestionExtended,
    ScenarioMockGenerateRequest,
    ScenarioPartId
} from '../types.js';
import { partIdFromIndex, SUB_QUESTION_TYPE_LABELS } from '../feature/scenario-answer-flashcard.js';

const GENERATE_DELAY_MS = 800;

/** Per-course in-memory question store. */
const storeByCourse = new Map<string, ScenarioQuestionExtended[]>();
let nextId = 100;

const E401_QUESTION_BODY = `You are the shift engineer at a chemical plant. Heat exchanger **E-401** is a shell-and-tube unit heating process water with condensing steam. Design data:

| Stream | Flow | Inlet T | Outlet T (design) |
|--------|------|---------|-------------------|
| Water (tube side) | 120 t/h | 25 °C | 85 °C |
| Steam (shell side) | condensate | 150 °C | 150 °C (saturated) |

Design duty: **2.5 MW**. Assume constant $c_{p,\\text{water}} = 4.18\\ \\mathrm{kJ\\,kg^{-1}\\,K^{-1}}$ and $c_{p,\\text{condensate}} = 4.2\\ \\mathrm{kJ\\,kg^{-1}\\,K^{-1}}$. Condensate flow is set by the 2.5 MW duty.

Using the design data above, estimate the required heat-transfer area and the design log mean temperature difference (LMTD) for E-401 at clean conditions. Show your energy balance and area equation clearly.`;

const E401_PART_A_PROMPT = `Using the design data above, estimate the required heat-transfer area and the design log mean temperature difference (LMTD) for E-401 at clean conditions. Show your energy balance and area equation clearly. Assume constant specific heat capacities: $c_{p,\\text{water}} = 4.18\\ \\mathrm{kJ\\,kg^{-1}\\,K^{-1}}$, $c_{p,\\text{condensate}} = 4.2\\ \\mathrm{kJ\\,kg^{-1}\\,K^{-1}}$, and condensate flow is set by the 2.5 MW duty.`;

const E401_PART_A_ANSWER = `## Step 1: Energy balance on water side

$$Q = \\dot{m}_w c_{p,w} (T_{out} - T_{in}) = \\frac{120000}{3600} \\times 4180 \\times (85 - 25) \\approx 8.36\\ \\text{MW}$$

Check against design duty 2.5 MW — use design duty as given: $Q = 2.5\\ \\text{MW}$.

## Step 2: Condensate flow from latent heat

$$\\dot{m}_{cond} = \\frac{Q}{h_{fg}} \\approx \\frac{2500}{2257} \\approx 1.11\\ \\text{kg/s}$$

## Step 3: LMTD (counter-current)

$$\\Delta T_1 = 150 - 85 = 65\\ \\text{K},\\quad \\Delta T_2 = 150 - 25 = 125\\ \\text{K}$$

$$\\text{LMTD} = \\frac{65 - 125}{\\ln(65/125)} \\approx 91.8\\ \\text{K}$$

## Step 4: Area with assumed $U_{clean} = 850\\ \\mathrm{W\\,m^{-2}\\,K^{-1}}$

$$A = \\frac{Q}{U \\cdot \\text{LMTD}} = \\frac{2.5 \\times 10^6}{850 \\times 91.8} \\approx 32\\ \\text{m}^2$$`;

const E401_PART_B_PROMPT = `The outlet water is 78 °C instead of 85 °C with the same flows and inlet temperatures. Calculate the actual heat duty and an effective $U$ (or fouling resistance) compared to design. Then list at least four physically plausible root causes for a gradual 10-day decline. Rank them by likelihood given the symptoms.`;

const E401_PART_B_ANSWER = `## Step 1: Actual duty at 78 °C outlet

$$Q_{actual} = \\dot{m}_w c_{p,w} (78 - 25) = \\frac{120000}{3600} \\times 4180 \\times 53 \\approx 7.38\\ \\text{MW}$$

Relative to design 2.5 MW target on same flows — effective duty fraction $\\approx 0.94$ of design if flows unchanged.

## Step 2: Effective U from $Q = U A \\text{LMTD}$

Hold $A$ and LMTD at design; solve $U_{eff} = Q_{actual}/(A \\cdot \\text{LMTD}) \\approx 0.94\\, U_{design}$.

Fouling: $\\frac{1}{U_{eff}} = \\frac{1}{U_{clean}} + R_f$ → estimate $R_f \\approx 0.00007\\ \\mathrm{m^2\\,K/W}$.

## Step 3: Ranked root causes (gradual 10-day decline, low outlet T)

1. **Tube-side fouling (scale/biofilm)** — most likely; reduces U gradually, fixed flows → lower outlet T.
2. **Partial tube blockage / distribution maldistribution** — reduces effective area.
3. **Steam pressure/control drift** — lower shell temperature reduces driving force.
4. **Instrument drift on outlet RTD** — possible but less likely if corroborated by duty calc.
5. **Air binding on steam side** — can develop slowly after maintenance.`;

const E401_PART_C_PROMPT = `Propose corrective actions to restore design outlet temperature. Prioritize by safety and operability; include one monitoring recommendation for the next 48 hours.`;

const E401_PART_C_ANSWER = `1. **Verify readings** — cross-check outlet RTD with portable TC; confirm steam pressure and condensate trap operation.
2. **Inspect steam trap / vent** — eliminate air binding; ensure condensate removal.
3. **Schedule cleaning** — chemical or mechanical tube cleaning if fouling confirmed by $U_{eff}$ trend.
4. **Monitor** — log $T_{out}$, steam pressure, and calculated duty every 4 h for 48 h; plot $U_{eff}$ to confirm recovery after intervention.`;

const FREEZER_QUESTION_BODY = `You are a **freezer engineer** at a food-processing facility. A new blast-freezer tunnel must bring packaged product from +5 °C to −18 °C within 25 minutes. The conveyor carries 2,400 kg/h of product with $c_p = 3.2\\ \\mathrm{kJ\\,kg^{-1}\\,K^{-1}}$. Ammonia refrigeration provides evaporation at −35 °C.

The plant manager reports uneven freezing in the center lanes and rising compressor discharge pressure over the past week.`;

function buildSeedFixtures(topic1Id: string, topic2Id: string, courseId: string, courseName: string): ScenarioQuestionExtended[] {
    const now = new Date().toISOString();
    const base = {
        courseId,
        courseName,
        generatedBy: 'ai' as const,
        createdByUserId: 'mock-instructor',
        lastEditedByUserId: 'mock-instructor'
    };

    return [
        {
            ...base,
            id: 'sq-mock-freezer',
            topicOrWeekId: topic1Id,
            title: 'Freezer Engineer',
            status: 'published' as const,
            sourcePrompt: 'Blast freezer tunnel heat removal and uneven freezing',
            questionBody: FREEZER_QUESTION_BODY,
            solutionBody: 'Full solution across all four parts — see subquestion model answers.',
            difficulty: 'hard' as ScenarioDifficulty,
            expectedTimeMinutes: 35,
            learningObjectives: ['LO-10-1', 'LO-10-2'],
            subQuestions: [
                {
                    partId: 'a',
                    subQuestionType: 'calculation',
                    prompt: 'Calculate the required refrigeration duty (kW) to achieve the freezing target, assuming sensible cooling only for this estimate.',
                    modelAnswer: `$$Q = \\dot{m} c_p \\Delta T = \\frac{2400}{3600} \\times 3200 \\times 23 \\approx 49.1\\ \\text{kW}$$\n\nAdd latent heat of freezing in a full design; this is a baseline sensible-load estimate.`
                },
                {
                    partId: 'b',
                    subQuestionType: 'troubleshoot',
                    prompt: 'Center lanes freeze slower than edge lanes. List four plausible causes and rank by likelihood.',
                    modelAnswer: `1. **Airflow maldistribution** — most likely in tunnel freezers.\n2. **Overloaded center conveyor spacing** — higher thermal load.\n3. **Frosted evaporator coils (center section)** — reduces heat transfer.\n4. **Refrigerant feed imbalance** across coil circuits.`
                },
                {
                    partId: 'c',
                    subQuestionType: 'action',
                    prompt: 'Recommend immediate operational changes (no shutdown) to improve uniformity.',
                    modelAnswer: `Reduce belt loading in center lanes, verify fan speeds and defrost schedule, check coil frost balance, adjust product spacing SOP.`
                },
                {
                    partId: 'd',
                    subQuestionType: 'corrective',
                    prompt: 'If discharge pressure continues rising, what maintenance actions should be planned?',
                    modelAnswer: `Inspect condenser fouling, check refrigerant charge and non-condensables, verify compressor oil and suction superheat, schedule coil defrost performance audit.`
                }
            ],
            aiGenerationJobId: 'mock-job-1',
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
            publishedAt: now
        },
        {
            ...base,
            id: 'sq-mock-e401',
            topicOrWeekId: topic1Id,
            title: 'E-401 LMTD & fouling',
            status: 'draft' as const,
            sourcePrompt: E401_PART_A_PROMPT,
            questionBody: E401_QUESTION_BODY,
            solutionBody: E401_PART_A_ANSWER + '\n\n' + E401_PART_B_ANSWER + '\n\n' + E401_PART_C_ANSWER,
            difficulty: 'medium' as ScenarioDifficulty,
            expectedTimeMinutes: 25,
            learningObjectives: ['LO-10-1'],
            subQuestions: [
                {
                    partId: 'a',
                    subQuestionType: 'calculation',
                    prompt: E401_PART_A_PROMPT,
                    modelAnswer: E401_PART_A_ANSWER
                },
                {
                    partId: 'b',
                    subQuestionType: 'troubleshoot',
                    prompt: E401_PART_B_PROMPT,
                    modelAnswer: E401_PART_B_ANSWER
                },
                {
                    partId: 'c',
                    subQuestionType: 'action',
                    prompt: E401_PART_C_PROMPT,
                    modelAnswer: E401_PART_C_ANSWER
                }
            ],
            aiGenerationJobId: 'mock-job-2',
            sortOrder: 1,
            createdAt: now,
            updatedAt: now,
            publishedAt: null
        },
        {
            ...base,
            id: 'sq-mock-placeholder-topic2',
            topicOrWeekId: topic2Id,
            title: '__unused__',
            status: 'draft' as const,
            sourcePrompt: '',
            questionBody: '',
            solutionBody: '',
            difficulty: 'easy' as ScenarioDifficulty,
            expectedTimeMinutes: 15,
            learningObjectives: [],
            subQuestions: [],
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
            publishedAt: null
        }
    ].filter(q => q.title !== '__unused__') as ScenarioQuestionExtended[];
}

/**
 * initMockStore
 *
 * @param courseId - Active course id
 * @param topicOrWeekIds - Ordered topic/week instance ids from course
 * @param courseName - Display name for fixtures
 */
export function initMockStore(courseId: string, topicOrWeekIds: string[], courseName: string): void {
    if (storeByCourse.has(courseId)) return;
    const topic1 = topicOrWeekIds[0] ?? 'sq-fallback-topic-1';
    const topic2 = topicOrWeekIds[1] ?? 'sq-fallback-topic-2';
    storeByCourse.set(courseId, buildSeedFixtures(topic1, topic2, courseId, courseName));
}

function getStore(courseId: string): ScenarioQuestionExtended[] {
    if (!storeByCourse.has(courseId)) {
        storeByCourse.set(courseId, []);
    }
    return storeByCourse.get(courseId)!;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function listQuestions(courseId: string): Promise<ScenarioQuestionExtended[]> {
    await delay(50);
    return [...getStore(courseId)].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getQuestion(courseId: string, questionId: string): Promise<ScenarioQuestionExtended> {
    await delay(30);
    const q = getStore(courseId).find(x => x.id === questionId);
    if (!q) throw new Error('Question not found.');
    return structuredClone(q);
}

export async function updateQuestion(
    courseId: string,
    questionId: string,
    patch: Partial<ScenarioQuestionExtended>
): Promise<ScenarioQuestionExtended> {
    await delay(100);
    const store = getStore(courseId);
    const idx = store.findIndex(x => x.id === questionId);
    if (idx < 0) throw new Error('Question not found.');
    const updated: ScenarioQuestionExtended = {
        ...store[idx],
        ...patch,
        id: store[idx].id,
        updatedAt: new Date().toISOString(),
        lastEditedByUserId: 'mock-instructor'
    };
    store[idx] = updated;
    return structuredClone(updated);
}

export async function patchStatus(
    courseId: string,
    questionId: string,
    status: ScenarioQuestionStatus
): Promise<ScenarioQuestionExtended> {
    const q = await getQuestion(courseId, questionId);
    const publishedAt = status === 'published' && !q.publishedAt ? new Date().toISOString() : q.publishedAt;
    return updateQuestion(courseId, questionId, { status, publishedAt: publishedAt ?? null });
}

/** Removes a scenario question from the in-memory store (mock delete). */
export async function deleteQuestion(courseId: string, questionId: string): Promise<void> {
    await delay(50);
    const store = getStore(courseId);
    const idx = store.findIndex(x => x.id === questionId);
    if (idx < 0) throw new Error('Question not found.');
    store.splice(idx, 1);
}

function buildSubsFromTypeMap(
    types: ScenarioSubQuestionType[],
    templates: Partial<Record<ScenarioSubQuestionType, { prompt: string; modelAnswer: string }>>,
    fallbackPrompt: string
): ScenarioSubQuestionExtended[] {
    return types.map((subQuestionType, i) => {
        const tpl = templates[subQuestionType] ?? genericSubTemplate(subQuestionType, fallbackPrompt);
        return {
            partId: partIdFromIndex(i) as ScenarioPartId,
            subQuestionType,
            prompt: tpl.prompt,
            modelAnswer: tpl.modelAnswer
        };
    });
}

const E401_DEMO_SUBS: Partial<Record<ScenarioSubQuestionType, { prompt: string; modelAnswer: string }>> = {
    calculation: { prompt: E401_PART_A_PROMPT, modelAnswer: E401_PART_A_ANSWER },
    troubleshoot: { prompt: E401_PART_B_PROMPT, modelAnswer: E401_PART_B_ANSWER },
    action: { prompt: E401_PART_C_PROMPT, modelAnswer: E401_PART_C_ANSWER }
};

const FREEZER_DEMO_SUBS: Partial<Record<ScenarioSubQuestionType, { prompt: string; modelAnswer: string }>> = {
    calculation: {
        prompt: 'Calculate the required refrigeration duty (kW) to achieve the freezing target, assuming sensible cooling only for this estimate.',
        modelAnswer: `$$Q = \\dot{m} c_p \\Delta T = \\frac{2400}{3600} \\times 3200 \\times 23 \\approx 49.1\\ \\text{kW}$$\n\nAdd latent heat of freezing in a full design; this is a baseline sensible-load estimate.`
    },
    troubleshoot: {
        prompt: 'Center lanes freeze slower than edge lanes. List four plausible causes and rank by likelihood.',
        modelAnswer: `1. **Airflow maldistribution** — most likely in tunnel freezers.\n2. **Overloaded center conveyor spacing** — higher thermal load.\n3. **Frosted evaporator coils (center section)** — reduces heat transfer.\n4. **Refrigerant feed imbalance** across coil circuits.`
    },
    action: {
        prompt: 'Recommend immediate operational changes (no shutdown) to improve uniformity.',
        modelAnswer: `Reduce belt loading in center lanes, verify fan speeds and defrost schedule, check coil frost balance, adjust product spacing SOP.`
    },
    corrective: {
        prompt: 'If discharge pressure continues rising, what maintenance actions should be planned?',
        modelAnswer: `Inspect condenser fouling, check refrigerant charge and non-condensables, verify compressor oil and suction superheat, schedule coil defrost performance audit.`
    }
};

function matchesHeatExchangerPrompt(prompt: string): boolean {
    return /\b(E-401|heat exchanger|shell-and-tube|LMTD)\b/i.test(prompt);
}

function matchesFreezerPrompt(prompt: string): boolean {
    return /\b(freezer|blast[- ]?freez|refrigeration)\b/i.test(prompt) || /−18|−?\s*18\s*°C|-18\s*°C/i.test(prompt);
}

function extractEquipmentLabel(prompt: string): string {
    const tagged = prompt.match(/\b([A-Z]-\d{2,4})\b/);
    if (tagged) return tagged[1];
    const named = prompt.match(/\b(heat exchanger|reactor|compressor|pump|column|freezer tunnel)\b/i);
    return named ? named[0] : 'the affected unit';
}

function summarizeSetupLines(prompt: string): string {
    const lines = prompt
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^\(?[a-d]\)/i.test(l) && !/^tasks?\s*for/i.test(l));
    const body = lines.slice(0, 6).join(' ').replace(/\s+/g, ' ').trim();
    return body || prompt.trim().replace(/\s+/g, ' ').slice(0, 400);
}

function extractCrisisSentence(prompt: string): string | null {
    const crisisPatterns = [
        /(?:recently|over the past|this week|operators report|manager reports)[^.!?]*[.!?]/i,
        /(?:instead of|rather than|dropped to|fallen to|only \d)[^.!?]*[.!?]/i,
        /(?:deviation|underperform|malfunction|uneven|rising|declining)[^.!?]*[.!?]/i
    ];
    for (const re of crisisPatterns) {
        const m = prompt.match(re);
        if (m) return m[0].trim();
    }
    return null;
}

function genericSubTemplate(
    subQuestionType: ScenarioSubQuestionType,
    sourcePrompt: string
): { prompt: string; modelAnswer: string } {
    const equipment = extractEquipmentLabel(sourcePrompt);
    const label = SUB_QUESTION_TYPE_LABELS[subQuestionType] ?? subQuestionType;

    switch (subQuestionType) {
        case 'calculation':
            return {
                prompt: `Using the design data in the scenario above, establish the baseline design calculation for ${equipment}. Show your governing equations, state assumptions clearly, and report a numerical result with units.`,
                modelAnswer: `## Step 1: Identify knowns and assumptions\n\nList flows, temperatures, pressures, and physical properties from the scenario.\n\n## Step 2: Governing equation\n\nWrite the energy/material balance or rate equation appropriate to ${equipment}.\n\n## Step 3: Numerical result\n\nSubstitute values, solve, and sanity-check units and magnitude.\n\n## Step 4: Design check\n\nCompare to the stated design target and note whether baseline performance is consistent.`
            };
        case 'troubleshoot':
            return {
                prompt: `Field data show a measurable deviation from design for ${equipment}. Quantify actual vs expected performance, then list at least **four physically plausible root causes**. Rank them by likelihood given a gradual onset and partially normal control-room indications.`,
                modelAnswer: `## Step 1: Actual vs design\n\nCalculate or estimate the actual duty/conversion/flow and compare to design.\n\n## Step 2: Effective parameter\n\nSolve for an effective $U$, efficiency, or similar if applicable.\n\n## Step 3: Ranked root causes\n\n1. **Fouling / degradation** — common for gradual decline.\n2. **Flow maldistribution or partial blockage** — reduces effective performance.\n3. **Control/instrument drift** — verify before major maintenance.\n4. **Upstream utility deviation** — steam pressure, cooling water, feed quality.\n5. **Mechanical wear** — seals, impellers, agitator, traps.\n\nState which symptoms support each ranking.`
            };
        case 'action':
            return {
                prompt: `Propose **immediate operational actions** the shift team can take to restore performance without a full shutdown. Prioritize safety and operability, and include one **monitoring recommendation** for the next 48 hours.`,
                modelAnswer: `1. **Verify field readings** — cross-check critical instruments before major interventions.\n2. **Stabilize operation** — adjust setpoints/loading within safe limits to protect downstream units.\n3. **Inspect accessible items** — traps, filters, bypasses, valve positions relevant to ${equipment}.\n4. **Monitor** — log key process variables every 4 h for 48 h and trend against design.`
            };
        case 'corrective':
            return {
                prompt: `If the deviation persists after shift-level actions, what **maintenance or engineering corrective steps** should be planned? Include inspection, cleaning/repair scope, and acceptance criteria.`,
                modelAnswer: `1. Plan controlled inspection during the next approved window.\n2. Schedule cleaning/replacement if fouling or wear is confirmed.\n3. Review control strategy and alarm limits.\n4. Document findings and update the preventive maintenance plan for ${equipment}.`
            };
        default:
            return {
                prompt: `${label}: Apply engineering judgment to ${equipment} using the scenario above.`,
                modelAnswer: `## Analysis\n\nApply the ${label.toLowerCase()} framework to the scenario.\n\n## Conclusion\n\nState actionable findings with units and assumptions.`
            };
    }
}

interface DemoGenerationOutput {
    title: string;
    questionBody: string;
    subQuestions: ScenarioSubQuestionExtended[];
}

/** ponytail: demo-quality scenario translation until real `/generate` API is wired in the instructor UI */
function buildDemoGenerationOutput(request: ScenarioMockGenerateRequest): DemoGenerationOutput {
    const { sourcePrompt, selectedTypes } = request;
    const trimmed = sourcePrompt.trim();

    if (matchesHeatExchangerPrompt(trimmed)) {
        const subQuestions = buildSubsFromTypeMap(selectedTypes, E401_DEMO_SUBS, trimmed);
        return {
            title: 'E-401 LMTD & fouling',
            questionBody: E401_QUESTION_BODY,
            subQuestions
        };
    }

    if (matchesFreezerPrompt(trimmed)) {
        const subQuestions = buildSubsFromTypeMap(selectedTypes, FREEZER_DEMO_SUBS, trimmed);
        return {
            title: 'Freezer Engineer',
            questionBody: FREEZER_QUESTION_BODY,
            subQuestions
        };
    }

    const equipment = extractEquipmentLabel(trimmed);
    const setup = summarizeSetupLines(trimmed);
    const crisis = extractCrisisSentence(trimmed)
        ?? `Over recent shifts, operators report performance drifting away from design at ${equipment}. Downstream units confirm the gap is real, but the root cause has not been isolated — some control-room indications still look normal.`;

    const questionBody = `You are the shift process engineer at an industrial facility. ${setup}\n\n${crisis}`;

    const subQuestions = buildSubsFromTypeMap(selectedTypes, {}, trimmed);

    const tag = equipment.match(/^[A-Z]-\d/i) ? `${equipment} performance drop` : `${capitalizeWords(equipment)} scenario`;
    return {
        title: tag.charAt(0).toUpperCase() + tag.slice(1),
        questionBody,
        subQuestions
    };
}

function capitalizeWords(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}

function demoTitleFromRequest(request: ScenarioMockGenerateRequest, demo: DemoGenerationOutput): string {
    const custom = request.title?.trim();
    if (custom && custom !== 'Untitled') return custom;
    return demo.title;
}

function difficultyToMinutes(difficulty: ScenarioDifficulty, partCount: number): number {
    const base = difficulty === 'hard' ? 30 : difficulty === 'medium' ? 20 : 15;
    return base + partCount * 5;
}

/**
 * generateQuestion
 *
 * Simulates AI generation with ~800ms delay; creates a draft with flexible parts.
 */
export async function generateQuestion(
    courseId: string,
    courseName: string,
    request: ScenarioMockGenerateRequest
): Promise<ScenarioQuestionExtended> {
    await delay(GENERATE_DELAY_MS);
    const store = getStore(courseId);
    const id = `sq-mock-gen-${++nextId}`;
    const now = new Date().toISOString();
    const demo = buildDemoGenerationOutput(request);
    const subQuestions = demo.subQuestions;
    const title = demoTitleFromRequest(request, demo);

    const question: ScenarioQuestionExtended = {
        id,
        courseId,
        courseName,
        topicOrWeekId: request.topicOrWeekId,
        title,
        status: 'draft',
        sourcePrompt: request.sourcePrompt,
        questionBody: demo.questionBody,
        solutionBody: subQuestions.map(sq => sq.modelAnswer).join('\n\n---\n\n'),
        subQuestions,
        generatedBy: 'ai',
        aiGenerationJobId: `mock-job-${nextId}`,
        sortOrder: store.filter(q => q.topicOrWeekId === request.topicOrWeekId).length,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        createdByUserId: 'mock-instructor',
        difficulty: request.difficulty,
        expectedTimeMinutes: difficultyToMinutes(request.difficulty, subQuestions.length),
        learningObjectives: []
    };

    store.push(question);
    return structuredClone(question);
}


/** Client-side publish validation for flexible parts. */
export function validatePublish(question: ScenarioQuestionExtended): string | null {
    if (!question.questionBody.trim()) return 'Base question narrative is required.';
    if (question.subQuestions.length < 1) return 'At least one subquestion is required.';
    for (const sq of question.subQuestions) {
        if (!sq.prompt.trim() || !sq.modelAnswer.trim()) {
            return `Part (${sq.partId}) needs both prompt and answer key.`;
        }
    }
    return null;
}

export function formatExpectedTime(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    return `${String(m).padStart(2, '0')}:00`;
}
