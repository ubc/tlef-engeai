/**
 * Summary editor — staff-editable summary sections for the review's Summary step (D-126)
 *
 * Holds the textareas for "What you did well", each criterion's feedback and the lens's
 * revision goals, per lens, and reads them back as a StaffSummaryEdit bound to the run they
 * were edited against.
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Editable summary sections and edit detection for Writing Feedback review.
 */

import {
    type StaffSummaryEdit,
    type WritingFeedbackLens,
    createButton,
    createText,
    field,
    textAreaControl
} from './writing-feedback-shared.js';

const MAX_STAFF_STRENGTHS = 5;

/** The model-derived values a lens's summary started from, for edit detection. */
export interface SummaryBaseline {
    strengths: string[];
    explanations: Record<string, string>;
    goals: string;
}

/**
 * seedSummaryText - numbered goals with their Socratic questions, as the student reads them.
 *
 * Mirrors the student PDF's revision-goal rendering (`writing-feedback-report.ts`) so staff
 * edit the goals in the shape the student receives them.
 *
 * @param goals - Revision goals from a run
 * @returns Plain text for the goals textarea
 */
export function seedSummaryText(goals: Array<{ goal: string; guidedQuestion: string }>): string {
    return goals
        .slice(0, 3)
        .map((goal, index) => `${index + 1}. ${goal.goal}\nAsk yourself: ${goal.guidedQuestion}`)
        .join('\n\n');
}

interface LensControls {
    strengthList?: HTMLElement;
    explanations: Map<string, HTMLTextAreaElement>;
    goals?: HTMLTextAreaElement;
}

/** Per-lens editable summary controls. */
export class SummaryEditor {
    private readonly lenses = new Map<WritingFeedbackLens, LensControls>();

    /**
     * @param markDirty - Called on every edit so leaving the page asks first
     */
    constructor(private readonly markDirty: () => void) {}

    private controls(lens: WritingFeedbackLens): LensControls {
        let entry = this.lenses.get(lens);
        if (!entry) {
            entry = { explanations: new Map() };
            this.lenses.set(lens, entry);
        }
        return entry;
    }

    /**
     * strengthsSection - "What you did well" with one textarea per strength.
     *
     * @param lens - Lens the strengths belong to
     * @param seed - Starting strengths (bound staff edit, else the run's)
     * @returns The section element
     */
    strengthsSection(lens: WritingFeedbackLens, seed: string[]): HTMLElement {
        const section = document.createElement('section');
        section.className = 'wf-feedback-section';
        section.append(createText('h3', 'What you did well'));
        const list = document.createElement('div');
        list.className = 'wf-summary-strengths';
        this.controls(lens).strengthList = list;

        const addButton = createButton('+ Add strength', 'quiet', async () => {
            addStrength('');
            this.markDirty();
        });
        const renumber = () => {
            list.querySelectorAll<HTMLLabelElement>(':scope > .wf-field > label').forEach((label, index) => {
                label.textContent = `Strength ${index + 1}`;
            });
            addButton.disabled = list.children.length >= MAX_STAFF_STRENGTHS;
        };
        const addStrength = (value: string) => {
            const textarea = textAreaControl(value, 2);
            textarea.addEventListener('input', this.markDirty);
            const row = field(`Strength ${list.children.length + 1}`, textarea);
            row.append(createButton('Remove', 'quiet', async () => {
                row.remove();
                renumber();
                this.markDirty();
            }));
            list.append(row);
            renumber();
        };
        seed.forEach(addStrength);
        section.append(list, addButton);
        renumber();
        return section;
    }

    /**
     * explanationField - the editable "Feedback" text for one criterion.
     *
     * @param lens - Lens the criterion belongs to
     * @param criterionId - Criterion id
     * @param seed - Starting explanation
     * @returns The field wrapper
     */
    explanationField(lens: WritingFeedbackLens, criterionId: string, seed: string): HTMLElement {
        const textarea = textAreaControl(seed, 4);
        textarea.addEventListener('input', this.markDirty);
        this.controls(lens).explanations.set(criterionId, textarea);
        return field('Feedback', textarea);
    }

    /**
     * goalsField - the lens's editable revision goals.
     *
     * @param lens - Lens the goals belong to
     * @param seed - Starting text
     * @param labelText - Field label
     * @param help - Field help text
     * @returns Wrapper and textarea
     */
    goalsField(lens: WritingFeedbackLens, seed: string, labelText: string, help: string): { wrapper: HTMLElement; textarea: HTMLTextAreaElement } {
        const textarea = textAreaControl(seed, 8);
        textarea.addEventListener('input', this.markDirty);
        this.controls(lens).goals = textarea;
        return { wrapper: field(labelText, textarea, help), textarea };
    }

    private strengths(lens: WritingFeedbackLens): string[] {
        return [...(this.controls(lens).strengthList?.querySelectorAll('textarea') ?? [])]
            .map((textarea) => textarea.value.trim())
            .filter(Boolean);
    }

    /**
     * isEdited - whether staff changed a lens's summary from the values it was drafted with.
     *
     * @param lens - Lens to check
     * @param baseline - Values from the latest run
     * @returns True when any strength, explanation or the goals text differs
     */
    isEdited(lens: WritingFeedbackLens, baseline: SummaryBaseline): boolean {
        const controls = this.controls(lens);
        const strengths = this.strengths(lens);
        if (strengths.length !== baseline.strengths.length
            || strengths.some((value, index) => value !== baseline.strengths[index].trim())) return true;
        for (const [criterion, textarea] of controls.explanations) {
            if (textarea.value.trim() !== (baseline.explanations[criterion] ?? '').trim()) return true;
        }
        return Boolean(controls.goals) && controls.goals!.value.trim() !== baseline.goals.trim();
    }

    /**
     * readEdit - the lens's summary as a bound StaffSummaryEdit.
     *
     * A blank explanation is omitted so the run's explanation still applies. The writing lens's
     * goals travel as `studentFeedback`, so only the technical lens sends goal text here.
     *
     * @param lens - Lens to read
     * @param runId - Latest run id for the lens
     * @returns Edit for the review save
     */
    readEdit(lens: WritingFeedbackLens, runId: string): StaffSummaryEdit {
        const controls = this.controls(lens);
        const goals = controls.goals?.value.trim();
        return {
            lens,
            feedbackRunId: runId,
            strengths: this.strengths(lens).slice(0, MAX_STAFF_STRENGTHS),
            criterionExplanations: [...controls.explanations]
                .map(([criterion, textarea]) => ({ criterion, explanation: textarea.value.trim() }))
                .filter(({ explanation }) => explanation.trim().length > 0),
            ...(lens === 'technical' && goals ? { revisionGoalsText: goals } : {})
        };
    }
}
