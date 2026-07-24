/**
 * StruggleGenerationPrompt — instructor struggle-topic generation prompts
 *
 * System and user turns for post-upload catalog generation. Prompt body is
 * inlined here (formerly shared-default/struggle_generation.md).
 *
 * @author: EngE-AI Team
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: System prompt + user-turn builders for struggle-topic generation.
 */

/** System prompt body for instructor struggle-topic generation on material upload. */
const STRUGGLE_GENERATION_SYSTEM_PROMPT = `
*Module Purpose*
Generate instructor-catalog struggle-topic labels from newly uploaded course material, scoped to the current section only.

*Module Content*

You produce labels that instructors assign so the memory agent can detect when students struggle with specific engineering concepts. Each label must be ready for **verbatim** matching during live chat analysis.

## Label rules

- Write **specific** engineering concepts from the uploaded material — not broad course themes.
- Use **lowercase descriptive phrases** (MTRL-style), e.g. \`"ph and logarithmic relationships in the nernst equation"\`.
- Prefer concrete phenomena, equations, diagrams, and procedures over chapter titles.
- Do not output generic course titles, week numbers, or filenames.
- Do not output labels that are **semantic duplicates** of any \`<struggle_topic>\` under \`<prior_assigned_struggle_topics>\`, regardless of which chapter it was assigned in.
- Output **0 to 5** labels. Return an empty list when the material does not support distinct new struggle concepts.

## Good examples (MTRL-style)

- \`"nernst equation and its effect on cell potential"\`
- \`"galvanic cell components and schematic representation"\`
- \`"ph and logarithmic relationships in the nernst equation"\`
- \`"diagram of galvanic cell"\`
- \`"standard reduction potentials and the electrochemical series"\`

## Bad examples

- \`"thermodynamics"\` — too broad
- \`"Chapter 4"\` — not a concept
- \`"electrochemistry"\` — course-level title, not a specific struggle point
- \`"cell potential"\` when \`"nernst equation and its effect on cell potential"\` is already assigned — semantic duplicate / paraphrase of excluded topic

## How to read \`<prior_assigned_struggle_topics>\`

The user turn contains **one** exclusion/append context tag:

\`\`\`xml
<prior_assigned_struggle_topics info="Topic 8 — Electrochemistry / Lecture notes">
  <section topic_or_week="Topic 4" item="Tutorial">
    <struggle_topic>nernst equation and its effect on cell potential</struggle_topic>
  </section>
  <section topic_or_week="Topic 8" item="Lecture notes" info="current topic">
    <struggle_topic>diagram of galvanic cell</struggle_topic>
  </section>
</prior_assigned_struggle_topics>
\`\`\`

- **Root \`info\` attribute** — names the **section currently being processed** (topic/week title and item title). You may add new labels **only** for this section.
- **\`<section>\` elements** — group topics already assigned elsewhere or on the current section:
  - \`topic_or_week\` — chapter/week name
  - \`item\` — section name (e.g. Lecture notes, Tutorial)
  - \`info="current topic"\` — **only** on the \`<section>\` for the section being processed; lists **existing** labels there (append-only — do not duplicate or paraphrase them)
- Sections from earlier chapters **omit** \`info\`. They appear in **curriculum sequence** (earlier sections first). There is **no \`order\` attribute** — sequence is implicit in the list order.
- Each assigned label is a \`<struggle_topic>…</struggle_topic>\` text node under its \`<section>\`.

**CRITICAL — FIFO rule:** If a concept was already assigned in an **earlier** section, do **not** assign it again for the current section — even if the uploaded material covers it again.

**CRITICAL — Current section:** Topics under the section with \`info="current topic"\` are existing labels on **this** section. Do not duplicate or paraphrase them.

## Uploaded material

After the prior-topics block, \`<uploaded_material>\` contains the text extracted from the file the instructor just uploaded. When \`truncated="true"\`, the text was shortened for token limits — prioritize the most specific concepts still visible in the excerpt.

## Output contract

Return JSON: \`{ "struggleTopics": string[] }\` with 0–5 elements. Each element is a single lowercase descriptive label (max 300 characters) suitable for verbatim memory-agent matching.`;

// =====================================================
// Prompt builders
// =====================================================

/**
 * buildStruggleGenerationSystemPrompt - system prompt for post-upload struggle-topic generation.
 *
 * @returns Inlined rules + examples for structured LLM output
 */
export function buildStruggleGenerationSystemPrompt(): string {
    return STRUGGLE_GENERATION_SYSTEM_PROMPT;
}

/**
 * buildStruggleGenerationUserTurn - prior FIFO XML plus uploaded material excerpt.
 *
 * @param priorXml - Output of {@link formatPriorStruggleTopicsXml} (from struggle-topic-generator)
 * @param materialName - Display name of the uploaded material
 * @param extractedText - Parsed text from the new upload only
 * @param truncated - Whether extractedText was shortened for token limits
 * @returns XML user turn for the structured LLM call
 */
export function buildStruggleGenerationUserTurn(
    priorXml: string,
    materialName: string,
    extractedText: string,
    truncated: boolean
): string {
    const truncatedAttr = truncated ? 'true' : 'false';
    return [
        priorXml,
        `<uploaded_material material_name="${escapeXmlAttr(materialName)}" truncated="${truncatedAttr}">`,
        escapeXmlText(extractedText),
        '</uploaded_material>',
    ].join('\n');
}

/**
 * escapeXmlAttr - escape the XML attribute value
 * 
 * @param value - the value to escape
 * @returns the escaped value
 */
function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * escapeXmlText - escape the XML text value
 * 
 * @param value - the value to escape
 * @returns the escaped value
 */
function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
