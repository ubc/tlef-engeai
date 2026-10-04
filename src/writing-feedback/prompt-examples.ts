/**
 * Prompt worked examples — synthetic demonstrations of good output
 *
 * Written by the team from invented texts. Examples show the shape and specificity we
 * want; they are never real student writing.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.1.0
 * @description: Versioned few-shot examples for the analyzer and writer prompts.
 */

export const PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.1.0';

export const ANALYZER_EXAMPLES = [
    'Example text (synthetic): "Metals conduct heat. Copper is used in pans. Because of this, heat spreads evenly."',
    'Good finding: { "primaryFunction": "organizational", "languageLevel": "clause_word", "ruleIds": ["O10"], "evidence": [{ "quote": "Copper is used in pans." }], "observation": "Theme shifts from the class (metals) to a specific metal (copper) without linking them.", "functionalInterpretation": "The reader must infer that copper is one of the metals, which weakens the classifying thread." }',
    'Weak finding (avoid): { "observation": "The paragraph could flow better." } — names no clause, no Theme, no pattern.'
].join('\n');

export const WRITER_STANDARD_EXAMPLES = [
    'Passage (synthetic): "A thermometer is a thing that tells you how hot it is."',
    'Good annotation: { "rationale": "The word \\"thing\\" does not tell the reader what kind of object a thermometer is.", "revisionGuidance": "Replace \\"thing\\" with the group of objects a thermometer belongs to. Then add one feature that makes it different from others in that group." }',
    'Vague annotation (avoid): { "rationale": "The definition is informal.", "revisionGuidance": "Make it more academic." }',
    'Abstract annotation (avoid): { "rationale": "The Theme and temporal marker establish the first event in a chronological explanation.", "revisionGuidance": "Use timeless-present relational clauses to describe each type." } — correct, but the student cannot tell what to change.',
    'Plain version of the same point: { "rationale": "\\"First\\" starts a list of steps in time order. That explains how sound travels, but a descriptive report describes what sound is.", "revisionGuidance": "Remove the time words (first, then, finally). Write sentences that say what each type of sound is or has, using the present tense." }',
    'Good revision goal: { "skillTag": "identify", "goal": "Write a clear definition of a thermometer.", "action": "Say which group of objects it belongs to, then give one feature that makes it different." }'
].join('\n');

export const WRITER_GLOBAL_EXAMPLE = [
    'Text (synthetic) explains how rain forms step by step instead of describing the types of precipitation.',
    '{ "diagnosisStatement": "Precipitation is a good topic for a descriptive report, and you use accurate words such as condensation. But your paragraph explains how rain forms, step by step. A descriptive report instead says what precipitation is and describes its types.", "whatToKeep": ["Precipitation as your topic", "Accurate terms such as condensation"], "rewriteDirection": "1. Start with one sentence that says what precipitation is.\\n2. Name its main types (rain, snow, sleet, hail).\\n3. Describe each type in turn, using the present tense." }'
].join('\n');
