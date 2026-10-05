/**
 * Prompt worked examples — synthetic demonstrations of good output
 *
 * Written by the team from invented texts. Examples show the shape and specificity we
 * want; they are never real student writing.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.2.0
 * @description: Versioned few-shot examples for the analyzer and writer prompts.
 */

export const PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.2.0';

/** Socratic question rules shared by the writer, technical and redraft prompts (D-153). */
export const SOCRATIC_QUESTION_RULES = [
    'Questions (required): every revision goal has exactly one guidedQuestion and a questionScope.',
    'The question helps the student find the change themselves, so the writing stays theirs. It sits beside the action; it does not replace it.',
    'questionScope "whole": a question about the whole submission — its purpose, its reader, or how it moves from stage to stage. At least one goal must have one.',
    'questionScope "part": a question about the one stage or passage the goal addresses. Name the stage or quote a few of the student\'s own words.',
    'Never ask a yes/no question (no question starting with is, are, was, were, do, does, did, can, could, should, would, will, have, has, had, or their negatives such as isn\'t or doesn\'t). Ask what, which, how or why.',
    'Never put the answer in the question ("Did you forget to add a definition?"). Use the same plain words as the rest of the feedback.'
].join('\n');

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
    'Plain version of the same point: { "rationale": "\\"First\\" starts a list of steps in time order. That explains how sound travels, but a descriptive report describes what sound is.", "revisionGuidance": "Remove the time words (first, then, finally). Write sentences that say what each type of sound is or has, using the present tense.", "guidedQuestion": "What should a reader know about precipitation before reading about its types?" }',
    'Good revision goal (part): { "skillTag": "identify", "goal": "Write a clear definition of a thermometer.", "action": "Say which group of objects it belongs to, then give one feature that makes it different.", "guidedQuestion": "In your first sentence, what group of objects does a thermometer belong to?", "questionScope": "part" }',
    'Good revision goal (whole): { "skillTag": "reader", "goal": "Plan the report for a reader who is new to thermometers.", "action": "List what that reader must know first, second and third, and check your stages follow that order.", "guidedQuestion": "Who will read your report, and what do they need to know before anything else?", "questionScope": "whole" }',
    'Weak question (avoid): "Is your definition clear?" — a yes/no question. "Did you forget the class word?" — gives the answer away.'
].join('\n');

export const WRITER_GLOBAL_EXAMPLE = [
    'Text (synthetic) explains how rain forms step by step instead of describing the types of precipitation.',
    '{ "diagnosisStatement": "Precipitation is a good topic for a descriptive report, and you use accurate words such as condensation. But your paragraph explains how rain forms, step by step. A descriptive report instead says what precipitation is and describes its types.", "whatToKeep": ["Precipitation as your topic", "Accurate terms such as condensation"], "rewriteDirection": "1. Start with one sentence that says what precipitation is.\\n2. Name its main types (rain, snow, sleet, hail).\\n3. Describe each type in turn, using the present tense." }'
].join('\n');
