/**
 * Prompt worked examples — synthetic demonstrations of good output
 *
 * Written by the team from invented texts. Examples show the shape and specificity we
 * want; they are never real student writing.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Versioned few-shot examples for the analyzer and writer prompts.
 */

export const PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.0.0';

export const ANALYZER_EXAMPLES = [
    'Example text (synthetic): "Metals conduct heat. Copper is used in pans. Because of this, heat spreads evenly."',
    'Good finding: { "primaryFunction": "organizational", "languageLevel": "clause_word", "ruleIds": ["O10"], "evidence": [{ "quote": "Copper is used in pans." }], "observation": "Theme shifts from the class (metals) to a specific metal (copper) without linking them.", "functionalInterpretation": "The reader must infer that copper is one of the metals, which weakens the classifying thread." }',
    'Weak finding (avoid): { "observation": "The paragraph could flow better." } — names no clause, no Theme, no pattern.'
].join('\n');

export const WRITER_STANDARD_EXAMPLES = [
    'Passage (synthetic): "A thermometer is a thing that tells you how hot it is."',
    'Good annotation: { "rationale": "This definition gives \\"thing\\" as the class, so the reader learns nothing about what kind of object a thermometer is.", "revisionGuidance": "Replace \\"thing\\" with the class of object it belongs to, then add the feature that distinguishes it from others in that class." }',
    'Vague annotation (avoid): { "rationale": "The definition is informal.", "revisionGuidance": "Make it more academic." }',
    'Good revision goal: { "skillTag": "identify", "goal": "Write a formal definition of the entity.", "action": "State the class the entity belongs to, then one feature that sets it apart." }'
].join('\n');

export const WRITER_GLOBAL_EXAMPLE = [
    'Text (synthetic) explains how rain forms step by step instead of classifying types of precipitation.',
    '{ "diagnosisStatement": "Precipitation is an excellent entity for a classifying report. However, this text explains how rain forms, step by step, rather than describing the types of precipitation, so it is not yet a descriptive report.", "whatToKeep": ["Precipitation as the entity", "Accurate terms such as condensation"], "rewriteDirection": "Rewrite the paragraph as a descriptive report: open with a formal definition of precipitation, state its main types, then describe each type in turn in the present tense." }'
].join('\n');
