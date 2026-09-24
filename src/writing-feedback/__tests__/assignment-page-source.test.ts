/**
 * @fileoverview Source guard for the per-assignment page. Every one of these invariants is
 * about navigation — which page owns which controls, what the address bar says, and where
 * Back leads — and all of it needs a DOM the Jest project does not have. So the shape is
 * pinned by reading the source, the way the other Writing Feedback frontend guards do.
 *
 * What this protects: an assignment's submissions were once a dropdown inside its card on
 * the queue. A course in production can carry hundreds of submissions per assignment, so
 * they moved to a page of their own, and the queue went back to being a list of assignments.
 */

import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

const feature = (file: string) =>
    fs.readFileSync(path.join(REPO_ROOT, 'public', 'scripts', 'feature', file), 'utf8');

const shell = fs.readFileSync(
    path.join(REPO_ROOT, 'public', 'components', 'writing-feedback', 'writing-feedback.html'),
    'utf8'
);
const queue = feature('writing-feedback.ts');
const page = feature('writing-feedback-assignment-page.ts');
const shared = feature('writing-feedback-shared.ts');
const rubric = feature('writing-feedback-rubric.ts');
const review = feature('writing-feedback-review.ts');
const css = fs.readFileSync(
    path.join(REPO_ROOT, 'public', 'styles', 'instructor-components', 'writing-feedback.css'),
    'utf8'
);

describe('assignment queue', () => {
    it('opens the assignment page instead of expanding the card', () => {
        expect(queue).toContain('openAssignmentPage(assignment.id)');
        // The disclosure contract is what made the card a dropdown. Nothing on the queue
        // expands any more, so no card may claim it does.
        expect(queue).not.toContain('aria-expanded');
        expect(queue).not.toContain('aria-controls');
        expect(queue).not.toContain('expandDisclosure');
    });

    it('keeps only what identifies an assignment, plus delete', () => {
        // Sync, the rubric link, and the submission list all act on one assignment, so they
        // belong on that assignment's page; the card would otherwise grow back into a panel.
        expect(queue).toContain('assignmentOriginText(assignment)');
        expect(queue).toContain('submission${submissionCount === 1 ? \'\' : \'s\'}');
        expect(queue).toContain('Delete assignment "${assignment.title}"');
        expect(queue).not.toContain("'Sync submissions'");
        expect(queue).not.toContain("'Edit rubric'");
        expect(queue).not.toContain('+ Add submission (manually)');
        expect(queue).not.toContain('renderBatchBar');
    });

    it('leaves no assignment in the address once the queue is on screen', () => {
        // A stale wfAssignment would send the next Back/Forward to a page staff had left.
        expect(queue).toContain("setQueryState({ wfSubmission: null, wfView: null, wfAssignment: null }, mode)");
    });
});

describe('assignment page', () => {
    it('is addressable, so a reload and a shared link both land on it', () => {
        expect(page).toContain("setQueryState({ wfView: 'assignment', wfAssignment: assignmentId, wfSubmission: null }, 'push')");
        expect(queue).toContain("if (requestedView === 'assignment' && requestedAssignment)");
        expect(queue).toContain('await openAssignmentPage(requestedAssignment)');
        expect(shell).toContain('id="wf-view-assignment"');
        expect(shared).toContain("element('wf-view-assignment').hidden = view !== 'assignment'");
    });

    it('owns every action that acts on one assignment', () => {
        expect(page).toContain("'Sync submissions'");
        expect(page).toContain('+ Add submission (manually)');
        expect(page).toContain('views.showRubric(assignment.id)');
        expect(page).toContain('views.showReview(submission.id)');
    });

    it('gathers the three assignment-wide actions into one header group', () => {
        // Generate, Sync, and the rubric all act on the assignment rather than on any one
        // submission, and they carry the workspace's header-button treatment to say so.
        const header = page.match(/function renderHeader[\s\S]*?\n}/)?.[0] ?? '';
        expect(header).toContain('renderBatchStart(assignment, { onChanged: refresh })');
        expect(header).toContain("sync.className = 'wf-header-btn'");
        expect(header).toContain("rubric.className = 'wf-header-btn'");
        // Nothing to generate for, so the action would only be there to be refused.
        expect(header).toContain('if (submissions?.length) controls.append(renderBatchStart');
    });

    it('re-reads the list from the server after anything changes it', () => {
        // Reopening the page is the refresh. Because the address already names this page,
        // the push degrades to a replace and no history entry is stacked up per action.
        expect(page).toContain('const refresh = async (): Promise<void> => { await openAssignmentPage(assignment.id); };');
        expect(page).toContain('renderBatchBar(assignment, submissions, { onChanged: refresh })');
        expect(page).toContain('onResolved: async () => openAssignmentPage(assignment.id)');
    });

    it('still renders a way out when the submissions fail to load', () => {
        // An early throw would leave the view holding only "Loading submissions…", with no
        // back button and no retry.
        expect(page).toContain('renderPage(root, assignment, null);');
        expect(page).toContain("createButton('Retry', 'secondary', async () => openAssignmentPage(assignment.id))");
    });
});

describe('navigation between pages', () => {
    it('returns the rubric and the review to the assignment they belong to', () => {
        expect(rubric).toContain("await returnToAssignment(assignment.id);");
        expect(review).toContain('await returnToAssignment(submission.assignmentId);');
        expect(rubric).toContain("}, 'Back to assignment');");
        expect(review).toContain("}, 'Back to assignment');");
    });

    it('steps back through history when the assignment page is the entry behind this one', () => {
        // Rebuilding the page instead would lose the scroll position of a long submission
        // list and leave the browser's Forward pointing at the page just left.
        expect(shared).toContain("params.get('wfView') === 'assignment' && params.get('wfAssignment') === assignmentId");
        expect(shared).toContain('window.history.back();');
    });

    it('restores the scroll position of both list pages on Back', () => {
        expect(queue).toContain("page === 'assignment' ? 'wf-view-assignment' : null");
    });
});

describe('batch generation controls', () => {
    const batch = feature('writing-feedback-batch.ts');

    it('keeps the start action and the progress strip from being on screen together', () => {
        // Starting a run is meaningless while one is running, and a strip reporting nothing is
        // a tinted empty band above the list — which is what sent the action to the header.
        expect(batch).toContain('bar.hidden = !text;');
        expect(batch).toContain('if (startControl?.isConnected) startControl.hidden = Boolean(text);');
        // display:flex would otherwise beat the hidden attribute.
        expect(css).toMatch(/\.wf-batch-bar\[hidden\]\s*\{\s*display:\s*none;/);
    });

    it('leaves Stop with the progress it belongs to', () => {
        const bar = batch.match(/export function renderBatchBar[\s\S]*?\n}/)?.[0] ?? '';
        expect(bar).toContain("createButton('Stop generating'");
        expect(bar).not.toContain("createButton('Generate feedback for all submissions'");
    });
});

describe('shared setup panel', () => {
    it('rests outside every view, so re-rendering a page cannot destroy it', () => {
        expect(shell).toContain('id="wf-action-panel-home"');
        expect(shared).toContain("element<HTMLElement>('wf-action-panel-home').append(panel)");
        // The assignment page replaces its children on every render, so it must put the
        // panel back before doing so.
        expect(page).toContain('await closeActionPanel(false);');
    });

    it('opens inside whichever page asked for it', () => {
        expect(shared).toContain('if (panel.parentElement !== host) host.append(panel)');
        expect(queue).toContain("const ACTION_MOUNT_ID = 'wf-landing-action-mount'");
        expect(page).toContain("const ACTION_MOUNT_ID = 'wf-assignment-action-mount'");
        expect(shell).toContain('id="wf-landing-action-mount"');
    });
});
