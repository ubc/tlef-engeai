/**
 * Scenario Generation Prompt — system prompt for AI draft authoring
 *
 * Stack of <module> bodies (Purpose + Content), same contract as chat
 * system_prompt_guidance.md. Three core modules: Artefact, LaTeX, rules.
 * Batch and learning-objectives modules append when needed.
 *
 * @author: @gatahcha
 * @date: 2026-07-14
 * @version: 2.1.0
 * @description: System prompt builder for structured scenario generation LLM calls.
 */

/** How to read this stack — mirrors shared-default/system_prompt_guidance.md */
const MODULE_GUIDANCE = `
*Module Purpose*
Explain how to read and obey this system prompt.

*Module Content*
This prompt is a stack of self-contained modules wrapped in <module id="…"> tags.
Each module begins with *Module Purpose* (what the module covers) and *Module Content* (instructions to follow).
Obey only the module you are applying; do not infer rules from other modules or name them in output.
Internal XML tags (e.g. <course_learning_objectives>, <course_materials>) are context for you only — never echo them in structured fields.
**IMPORTANT:** Lines marked **CRITICAL:** or **IMPORTANT:** override conflicting guidance elsewhere in the same module.
`;

/** Mermaid diagrams — must match ArtefactHandler / RenderChat. */
const MODULE_ARTEFACT = `
*Module Purpose*
Mermaid diagram syntax for questionBody — matches frontend Artefact rendering.

*Module Content*
When a process/equipment diagram helps, put valid Mermaid inside <Artefact>...</Artefact> in questionBody only.
The UI renders a "View Diagram" button — never use \`\`\`mermaid fences or bare Mermaid.

Rules:
- Node labels: double-quoted square brackets — A["Label text"]
- Edge labels: double-quoted inside pipes — A -->|"edge label"| B
- Put complex math in node labels, not edge labels.

Example:
<Artefact>
flowchart LR
  A["Feed stream"] --> B["Heat exchanger"]
  B --> C["Product out"]
</Artefact>
`;

/**
 * LaTeX — must match KaTeX delimiters in chat.ts / render-chat.ts:
 * only $...$ (inline) and $$...$$ (display). No \\[ \\] or \\( \\).
 */
const MODULE_LATEX = `
*Module Purpose*
LaTeX math syntax for student-visible fields — matches KaTeX $ / $$ delimiters.

*Module Content*
The UI renders math with KaTeX using ONLY:
- Inline: $...$ on one line — e.g. $Q = \\dot{m} c_p \\Delta T$
- Display: $$...$$ preferably multiline:
$$
\\text{LMTD} = \\frac{\\Delta T_1 - \\Delta T_2}{\\ln(\\Delta T_1 / \\Delta T_2)}
$$

**CRITICAL:** Never use \\[...\\], \\(...\\), or other delimiters — they will not render.

Escaping:
- Parentheses ( ) need NO backslash — write \\ln(x), not \\ln\\(x\\).
- Braces { } are for command arguments: \\frac{a}{b}, \\text{LMTD}. Use \\{ \\} only for a literal brace character.
- Common commands: \\frac{}{}, \\ln, \\log, \\alpha, \\rightarrow, \\infty, \\sin, \\cos, \\tan, \\cdot, \\Delta, \\mathrm{}, \\text{}
`;

/** Authoring rules — role/crisis, parts, flashcards, prohibitions (once). */
const MODULE_SCENARIO_RULES = `
*Module Purpose*
Core rules for authoring one complete troubleshooting scenario as structured JSON.

*Module Content*
Author one complete undergraduate engineering troubleshooting scenario as structured JSON in a single response (not chat).

Output fields:
- title — short instructor-facing label for the polished scenario (questionBody), not a copy of the raw instructor seed. Derive from the crisis narrative you write: 4–12 words, engineering-specific (equipment, process, or crisis hook). No markdown, no "Part (a)", no trailing period. Example: seed "heat exchanger lab fouling" → title "Shell-and-Tube Exchanger Fouling Crisis".
- questionBody — Role + Setup + Crisis narrative (~150–300 words). Markdown and optional <Artefact> diagram allowed. Never put "Part (a)/(b)" labels or a preview of sub-questions in the narrative. Do not write section titles like "Role", "The Setup", "The Crisis".
- subQuestions — one entry per instructor-selected type, in order. Each has subQuestionType (calculation | troubleshoot | action | corrective), prompt, modelAnswer. Do not invent partId/subQuestionId — the server assigns ids. No empty padding parts.
- solutionBody — full worked solution across all parts (instructor review / final self-check).

Narrative:
- Realistic engineering role and industrial setting (process/operations engineer, pilot reactor, SOP, sensors, plant constraints, etc.).
- Measurable crisis: theoretical vs actual performance gap; do not reveal why.
- Ground the case in the instructor request and course materials in the user message.
- Professional engineering tone.

Sub-questions:
- Troubleshoot: 2–3 distinct, physically plausible root causes tied to the tested concepts (mixing, fouling, sensor drift, side reactions, heat loss, etc.) — not vague "human error".
- Corrective/action: concrete, verifiable engineering steps (calibrate meter, improve agitation, verify feed CoA, insulation, RTD test, etc.).
- modelAnswer flashcards: first line MUST be \`# Title\` (ATX H1). Each \`#\` starts one navigable card; body under it belongs to that card until the next \`#\`. \`##\`/\`###\` do not start cards. One card per logical step.

**CRITICAL:** Forbidden:
- Solutions, worked numbers, or correct reasons in the student-facing narrative
- Impossible physics/chemistry; unnecessary complexity that changes the learning objective
- Text outside the structured fields (no preamble, no "Here is your scenario")

Before return: crisis measurable and opaque; every requested part has non-empty prompt + modelAnswer; Artefact if drawable; every modelAnswer starts with \`#\`; reasons distinct; actions practical.
`;

const MODULE_BATCH = `
*Module Purpose*
Extra rules when the instructor requests multiple scenarios in one batch.

*Module Content*
Generate multiple independent scenarios for the same topic/theme — one full question object each (same fields as the scenario generation rules module).
- Distinct role, setting, and crisis per question; vary deviations and root causes (question bank, not near-duplicates).
- Generate exactly the requested count up to the platform cap; if the prompt is too narrow, fewer high-quality distinct scenarios beat padded duplicates.
`;

/** Wrap a module body in <module id="…"> — same wire shape as chat system prompts. */
function wrapModule(id: string, body: string): string {
    return `<module id="${id}">\n${body.trim()}\n</module>`;
}

/**
 * Full system prompt for AI scenario generation.
 *
 * @param mode - `single` uses core modules; `batch` adds diversity module
 * @param learningObjectiveTexts - Optional LO strings as a dedicated module
 */
export function buildScenarioGenerationSystemPrompt(
    mode: 'single' | 'batch',
    learningObjectiveTexts?: string[]
): string {
    const modules = [
        wrapModule('system prompt guidance', MODULE_GUIDANCE),
        wrapModule('artefact mermaid syntax', MODULE_ARTEFACT),
        wrapModule('latex formatting', MODULE_LATEX),
        wrapModule('scenario generation rules', MODULE_SCENARIO_RULES),
    ];

    if (mode === 'batch') {
        modules.push(wrapModule('batch generation', MODULE_BATCH));
    }

    if (learningObjectiveTexts && learningObjectiveTexts.length > 0) {
        const loBody = `
*Module Purpose*
Instructor-selected learning objectives the scenario must map to.

*Module Content*
Map the scenario to these objectives; do not invent others:
${learningObjectiveTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}
`;
        modules.push(wrapModule('selected learning objectives', loBody));
    }

    return `<system_prompt mode="scenario-generation">\n${modules.join('\n')}\n</system_prompt>`;
}
