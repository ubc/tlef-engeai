// public/scripts/feature/pathway-library.ts

/**
 * Pathway Library instructor feature — list/edit/reorder/enable/delete course pathways.
 */

import type { activeCourse, GuidedPathway, PathwayCta, PathwayEvaluationPromptConfig } from '../types.js';
import { getCourseIdFromURL } from '../utils/url-parser.js';
import {
    createPathway,
    deletePathway,
    getPathwayEvaluationPrompt,
    listPathways,
    reorderPathways,
    resetPathwayEvaluationPrompt,
    resetPathways,
    updatePathway,
    updatePathwayEvaluationPrompt,
} from '../api/pathways-api.js';
import { showConfirmModal, showSimpleErrorModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

const DEFAULT_TITLE = 'Untitled';

const EVAL_PROMPT_CAUTION =
    'This Guided Pathway System prompt is carefully curated by the EngE-AI developers. Changing it can weaken safety and relevance classification for Guided Pathways. Prefer editing pathway trigger descriptions above unless you need a course-specific shell. You can Reset to platform defaults at any time.';

let pathways: GuidedPathway[] = [];
let courseId = '';
let dragIndex: number | null = null;
let flipBusy = false;
let evaluationPrompt: PathwayEvaluationPromptConfig | null = null;
let evaluationPromptLoadedBody = '';
let evaluationPromptCautionAcked = false;
let evaluationPromptCautionInFlight = false;
let evaluationPromptSuppressFocusUntil = 0;

function prefersReducedMotion(): boolean {
    return (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

/**
 * initializePathwayLibrary - Mount Pathway Library UI into the loaded component HTML.
 *
 * @param course - Current active course (id preferred; falls back to URL)
 */
export async function initializePathwayLibrary(course: activeCourse): Promise<void> {
    courseId = course?.id || getCourseIdFromURL() || '';
    if (!courseId) {
        setStatus('Missing course id.');
        return;
    }

    const addBtn = document.getElementById('pathway-library-add-btn');
    addBtn?.addEventListener('click', onAddPathway);

    const stylesClose = document.getElementById('pathway-cta-styles-close');
    stylesClose?.addEventListener('click', hideStylesPanel);

    const stylesPanel = document.getElementById('pathway-cta-styles-panel');
    stylesPanel?.addEventListener('click', (e) => {
        if (e.target === stylesPanel) hideStylesPanel();
    });

    wireKebab();
    wireEvaluationPromptPanel();

    await reload();
    replaceFeatherIcons();
}

function replaceFeatherIcons(): void {
    const feather = (window as any).feather;
    if (feather?.replace) feather.replace();
}

function wireKebab(): void {
    const kebabBtn = document.getElementById('pathway-library-kebab-btn');
    const menu = document.getElementById('pathway-library-kebab-menu');
    if (!kebabBtn || !menu) return;

    kebabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !menu.classList.contains('hidden');
        closeKebab();
        if (!open) {
            menu.classList.remove('hidden');
            kebabBtn.setAttribute('aria-expanded', 'true');
        }
    });

    menu.querySelectorAll('[data-kebab-action]').forEach((item) => {
        item.addEventListener('click', () => {
            const action = (item as HTMLElement).dataset.kebabAction;
            closeKebab();
            if (action === 'reset') void onResetDefaults();
        });
    });

    document.addEventListener('click', (e) => {
        const root = document.getElementById('pathway-library-kebab');
        if (root && !root.contains(e.target as Node)) closeKebab();
    });
}

function closeKebab(): void {
    const menu = document.getElementById('pathway-library-kebab-menu');
    const btn = document.getElementById('pathway-library-kebab-btn');
    menu?.classList.add('hidden');
    btn?.setAttribute('aria-expanded', 'false');
}

async function onResetDefaults(): Promise<void> {
    const result = await showConfirmModal(
        'Reset to defaults',
        'Reset the Pathway Library to platform defaults? Your course-specific pathway edits will be discarded.',
        'Reset',
        'Cancel',
        'danger'
    );
    if (result.action !== 'reset') return;

    setStatus('Resetting…');
    try {
        pathways = await resetPathways(courseId);
        renderList();
        await loadEvaluationPrompt();
        setStatus('');
        showSuccessToast('Pathways reset to platform defaults');
    } catch (error: any) {
        setStatus('');
        showErrorToast(error?.message || 'Failed to reset pathways');
    }
}

async function reload(): Promise<void> {
    setStatus('Loading…');
    try {
        pathways = await listPathways(courseId);
        renderList();
        await loadEvaluationPrompt();
        setStatus('');
    } catch (error: any) {
        setStatus('');
        showErrorToast(error?.message || 'Failed to load pathways');
    }
}

function applyEvaluationPromptToUi(config: PathwayEvaluationPromptConfig): void {
    evaluationPrompt = config;
    evaluationPromptLoadedBody = config.body;
    const textarea = document.getElementById('pathway-eval-prompt-textarea') as HTMLTextAreaElement | null;
    if (textarea) textarea.value = config.body;
}

async function loadEvaluationPrompt(): Promise<void> {
    const config = await getPathwayEvaluationPrompt(courseId);
    applyEvaluationPromptToUi(config);
}

async function confirmEvaluationPromptCaution(): Promise<boolean> {
    if (evaluationPromptCautionAcked) return true;
    if (evaluationPromptCautionInFlight) return false;
    evaluationPromptCautionInFlight = true;
    try {
        const result = await showConfirmModal(
            'Edit curated Guided Pathway System prompt?',
            EVAL_PROMPT_CAUTION,
            'Continue editing',
            'Cancel',
            'primary'
        );
        if (result.action !== 'continue-editing') {
            evaluationPromptSuppressFocusUntil = Date.now() + 400;
            return false;
        }
        evaluationPromptCautionAcked = true;
        return true;
    } finally {
        evaluationPromptCautionInFlight = false;
    }
}

function setEvaluationPromptExpanded(open: boolean): void {
    const section = document.getElementById('pathway-eval-prompt');
    const toggle = document.getElementById('pathway-eval-prompt-toggle');
    const body = document.getElementById('pathway-eval-prompt-body');
    if (!section || !toggle || !body) return;

    section.classList.toggle('is-expanded', open);
    toggle.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
        body.removeAttribute('inert');
    } else {
        body.setAttribute('inert', '');
    }
    replaceFeatherIcons();
}

function wireEvaluationPromptPanel(): void {
    const toggle = document.getElementById('pathway-eval-prompt-toggle');
    const textarea = document.getElementById('pathway-eval-prompt-textarea') as HTMLTextAreaElement | null;
    const saveBtn = document.getElementById('pathway-eval-prompt-save');
    const resetBtn = document.getElementById('pathway-eval-prompt-reset');

    setEvaluationPromptExpanded(false);

    toggle?.addEventListener('click', () => {
        const section = document.getElementById('pathway-eval-prompt');
        const open = !section?.classList.contains('is-expanded');
        setEvaluationPromptExpanded(!!open);
    });

    textarea?.addEventListener('focus', () => {
        if (evaluationPromptCautionAcked) return;
        if (evaluationPromptCautionInFlight) return;
        if (Date.now() < evaluationPromptSuppressFocusUntil) {
            textarea.blur();
            return;
        }
        void confirmEvaluationPromptCaution().then((ok) => {
            if (!ok) textarea.blur();
        });
    });

    saveBtn?.addEventListener('click', () => {
        void onSaveEvaluationPrompt();
    });

    resetBtn?.addEventListener('click', () => {
        void onResetEvaluationPrompt();
    });
}

async function onSaveEvaluationPrompt(): Promise<void> {
    const textarea = document.getElementById('pathway-eval-prompt-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;
    const next = textarea.value.trim();
    if (!next) {
        showErrorToast('Guided Pathway System prompt cannot be empty');
        return;
    }
    if (next === evaluationPromptLoadedBody.trim()) {
        showSuccessToast('No changes to save');
        return;
    }
    if (!(await confirmEvaluationPromptCaution())) return;

    const confirmSave = await showConfirmModal(
        'Save Guided Pathway System prompt?',
        'Save this course-specific classifier shell? Pathway trigger cards above are still inserted at runtime via {{pathway_trigger_sections}}.',
        'Save',
        'Cancel',
        'primary'
    );
    if (confirmSave.action !== 'save') return;

    try {
        const saved = await updatePathwayEvaluationPrompt(courseId, next);
        applyEvaluationPromptToUi(saved);
        showSuccessToast('Guided Pathway System prompt saved');
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to save Guided Pathway System prompt');
    }
}

async function onResetEvaluationPrompt(): Promise<void> {
    const result = await showConfirmModal(
        'Reset Guided Pathway System prompt',
        'Restore the developer-curated platform default classifier shell for this course?',
        'Reset',
        'Cancel',
        'danger'
    );
    if (result.action !== 'reset') return;

    try {
        const reset = await resetPathwayEvaluationPrompt(courseId);
        applyEvaluationPromptToUi(reset);
        showSuccessToast('Guided Pathway System prompt reset to platform default');
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to reset Guided Pathway System prompt');
    }
}

function setStatus(text: string): void {
    const el = document.getElementById('pathway-library-status');
    if (el) el.textContent = text;
}

function renderList(): void {
    const list = document.getElementById('pathway-library-list');
    const empty = document.getElementById('pathway-library-empty');
    const blockTpl = document.getElementById('pathway-block-template') as HTMLTemplateElement | null;
    if (!list || !blockTpl) return;

    list.innerHTML = '';
    if (empty) empty.hidden = pathways.length > 0;

    pathways.forEach((pathway, index) => {
        const node = blockTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector('.pathway-block') as HTMLElement;
        article.dataset.pathwayId = pathway.id;
        applyEnabledVisual(article, pathway.enabled !== false);

        const titleText = article.querySelector('.pathway-block__title-text') as HTMLElement;
        const titleInput = article.querySelector('.pathway-block__title-input') as HTMLInputElement;
        const titleEditBtn = article.querySelector('.pathway-block__title-edit') as HTMLButtonElement;
        titleText.textContent = pathway.title || DEFAULT_TITLE;
        titleInput.value = pathway.title || DEFAULT_TITLE;

        wireTitleEditing(article, titleText, titleInput, titleEditBtn);

        const header = article.querySelector('.pathway-block__header') as HTMLElement;
        header.addEventListener('click', (e) => {
            if (article.classList.contains('is-editing-title')) return;
            const target = e.target as HTMLElement;
            if (target.closest('.pathway-block__drag-handle')) return;
            if (target.closest('.pathway-block__header-controls')) return;
            if (target.closest('.pathway-block__expand')) return;
            // title-text / edit / input stopPropagation; empty wrap space bubbles here
            toggleExpanded(article);
        });

        const trigger = article.querySelector('.pathway-block__trigger') as HTMLTextAreaElement;
        trigger.value = pathway.triggerDescription;

        const response = article.querySelector('.pathway-block__response') as HTMLTextAreaElement;
        response.value = pathway.assistantResponse;

        const ctaList = article.querySelector('.pathway-block__cta-list') as HTMLElement;
        pathway.ctas.forEach((cta) => appendCtaRow(ctaList, cta, pathway.id, article));

        article.querySelector('.pathway-block__add-cta')?.addEventListener('click', () => {
            void onAddCta(article, pathway.id, ctaList);
        });

        article.querySelector('.pathway-block__see-styles')?.addEventListener('click', showStylesPanel);

        const expandBtn = article.querySelector('.pathway-block__expand') as HTMLButtonElement;
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (article.classList.contains('is-editing-title')) return;
            toggleExpanded(article);
        });

        const upBtn = article.querySelector('.pathway-block__up') as HTMLButtonElement;
        const downBtn = article.querySelector('.pathway-block__down') as HTMLButtonElement;
        upBtn.disabled = index === 0;
        downBtn.disabled = index === pathways.length - 1;
        upBtn.addEventListener('click', () => void movePathway(pathway.id, -1));
        downBtn.addEventListener('click', () => void movePathway(pathway.id, 1));

        article.querySelector('.pathway-block__remove')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void onRemove(pathway.id);
        });

        article.querySelector('.pathway-block__toggle-enabled')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void onToggleEnabled(article, pathway.id);
        });

        article.querySelector('.pathway-block__save')?.addEventListener('click', () => {
            void onSave(article, pathway.id);
        });

        attachCardDrag(article, index, pathway.id, list);

        list.appendChild(node);
    });

    replaceFeatherIcons();
}

function wireTitleEditing(
    article: HTMLElement,
    titleText: HTMLElement,
    titleInput: HTMLInputElement,
    titleEditBtn: HTMLButtonElement
): void {
    let pendingExpandTimer: number | null = null;

    const enterEdit = (e?: Event) => {
        e?.stopPropagation();
        e?.preventDefault();
        if (pendingExpandTimer !== null) {
            window.clearTimeout(pendingExpandTimer);
            pendingExpandTimer = null;
        }
        article.classList.add('is-editing-title');
        titleInput.value = titleText.textContent?.trim() || DEFAULT_TITLE;
        titleInput.focus();
        titleInput.select();
    };

    const exitEdit = () => {
        const next = titleInput.value.trim() || DEFAULT_TITLE;
        titleText.textContent = next;
        titleInput.value = next;
        article.classList.remove('is-editing-title');
    };

    titleEditBtn.addEventListener('click', enterEdit);

    // Single click expands; double-click edits (debounce so dblclick does not toggle twice)
    titleText.addEventListener('click', (e) => {
        e.stopPropagation();
        if (article.classList.contains('is-editing-title')) return;
        if (pendingExpandTimer !== null) window.clearTimeout(pendingExpandTimer);
        pendingExpandTimer = window.setTimeout(() => {
            pendingExpandTimer = null;
            toggleExpanded(article);
        }, 250);
    });

    titleText.addEventListener('dblclick', enterEdit);

    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            exitEdit();
        } else if (e.key === 'Escape') {
            titleInput.value = titleText.textContent?.trim() || DEFAULT_TITLE;
            article.classList.remove('is-editing-title');
        }
    });
    titleInput.addEventListener('blur', () => {
        if (article.classList.contains('is-editing-title')) exitEdit();
    });
}

function readTitleFromBlock(article: HTMLElement): string {
    if (article.classList.contains('is-editing-title')) {
        const input = article.querySelector('.pathway-block__title-input') as HTMLInputElement | null;
        return input?.value.trim() || DEFAULT_TITLE;
    }
    const text = article.querySelector('.pathway-block__title-text') as HTMLElement | null;
    return text?.textContent?.trim() || DEFAULT_TITLE;
}

function ctasEqual(a: PathwayCta[], b: PathwayCta[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((cta, i) => {
        const other = b[i];
        return (
            cta.id === other.id &&
            cta.label === other.label &&
            cta.url === other.url &&
            cta.color === other.color
        );
    });
}

/** True when the open form differs from the last saved pathway snapshot. */
function isPathwayDirty(article: HTMLElement, pathwayId: string): boolean {
    const saved = pathways.find((p) => p.id === pathwayId);
    if (!saved) return false;
    const title = readTitleFromBlock(article);
    const triggerDescription = (article.querySelector('.pathway-block__trigger') as HTMLTextAreaElement)
        .value;
    const assistantResponse = (article.querySelector('.pathway-block__response') as HTMLTextAreaElement)
        .value;
    const ctas = readCtasFromBlock(article);
    return (
        title !== (saved.title || DEFAULT_TITLE) ||
        triggerDescription !== saved.triggerDescription ||
        assistantResponse !== saved.assistantResponse ||
        !ctasEqual(ctas, saved.ctas)
    );
}

async function confirmIfDirty(article: HTMLElement, pathwayId: string): Promise<boolean> {
    if (!isPathwayDirty(article, pathwayId)) return true;
    const result = await showConfirmModal(
        'Unsaved changes',
        'You have unsaved changes on this pathway. Continue without saving?',
        'Continue',
        'Cancel',
        'primary'
    );
    return result.action === 'continue';
}

async function onAddCta(article: HTMLElement, pathwayId: string, ctaList: HTMLElement): Promise<void> {
    if (!(await confirmIfDirty(article, pathwayId))) return;
    appendCtaRow(
        ctaList,
        {
            id: `cta-${Date.now()}`,
            label: '',
            url: '',
            color: '#4d7a2f',
        },
        pathwayId,
        article,
        true
    );
}

function animateCtaRowIn(row: HTMLElement): void {
    if (prefersReducedMotion()) return;
    row.classList.add('pathway-cta-row--enter');
    // Force reflow so the enter state is painted before transitioning out.
    void row.offsetHeight;
    requestAnimationFrame(() => {
        row.classList.remove('pathway-cta-row--enter');
    });
}

async function animateCtaRowOut(row: HTMLElement): Promise<void> {
    if (prefersReducedMotion()) {
        row.remove();
        return;
    }
    row.classList.add('pathway-cta-row--leave');
    await new Promise<void>((resolve) => {
        const done = () => {
            row.removeEventListener('transitionend', done);
            resolve();
        };
        row.addEventListener('transitionend', done);
        setTimeout(done, 280);
    });
    row.remove();
}

function toggleExpanded(article: HTMLElement): void {
    const expanded = article.classList.toggle('is-expanded');
    const btn = article.querySelector('.pathway-block__expand') as HTMLButtonElement | null;
    btn?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn?.setAttribute('aria-label', expanded ? 'Collapse pathway' : 'Expand pathway');
}

function attachCardDrag(article: HTMLElement, index: number, pathwayId: string, list: HTMLElement): void {
    const handle = article.querySelector('.pathway-block__drag-handle') as HTMLButtonElement | null;
    if (!handle) return;

    handle.addEventListener('mousedown', () => {
        article.draggable = true;
    });
    handle.addEventListener('mouseup', () => {
        article.draggable = false;
    });

    article.addEventListener('dragstart', (event) => {
        if (!article.draggable) {
            event.preventDefault();
            return;
        }
        dragIndex = index;
        handle.setAttribute('aria-grabbed', 'true');
        article.classList.add('pathway-block--dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', pathwayId);
        }
    });

    article.addEventListener('dragend', () => {
        dragIndex = null;
        handle.setAttribute('aria-grabbed', 'false');
        article.draggable = false;
        article.classList.remove('pathway-block--dragging');
        list.querySelectorAll('.pathway-block--drop-target').forEach((el) => {
            el.classList.remove('pathway-block--drop-target');
        });
    });

    article.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (dragIndex !== null && dragIndex !== index) {
            article.classList.add('pathway-block--drop-target');
        }
    });

    article.addEventListener('dragleave', () => {
        article.classList.remove('pathway-block--drop-target');
    });

    article.addEventListener('drop', (event) => {
        event.preventDefault();
        article.classList.remove('pathway-block--drop-target');
        if (dragIndex === null || dragIndex === index) return;
        void applyReorder(dragIndex, index);
    });
}

async function applyReorder(from: number, to: number): Promise<void> {
    if (from < 0 || to < 0 || from >= pathways.length || to >= pathways.length) return;
    const ordered = [...pathways];
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    try {
        pathways = await reorderPathways(
            courseId,
            ordered.map((p) => p.id)
        );
        renderList();
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to reorder');
    }
}

function appendCtaRow(
    container: HTMLElement,
    cta: PathwayCta,
    pathwayId: string,
    article: HTMLElement,
    animate = false
): void {
    const tpl = document.getElementById('pathway-cta-row-template') as HTMLTemplateElement | null;
    if (!tpl) return;
    const node = tpl.content.cloneNode(true) as DocumentFragment;
    const row = node.querySelector('.pathway-cta-row') as HTMLElement;
    row.dataset.ctaId = cta.id;

    const label = row.querySelector('.pathway-cta-row__label') as HTMLInputElement;
    const url = row.querySelector('.pathway-cta-row__url') as HTMLInputElement;
    const color = row.querySelector('.pathway-cta-row__color') as HTMLInputElement;
    label.value = cta.label;
    url.value = cta.url;
    const rawColor =
        cta.color ||
        ({
            primary: '#4d7a2f',
            secondary: '#2f5f8f',
            tertiary: '#1b365d',
            quaternary: '#f1f1f1',
            link: '#2f5f8f',
        } as Record<string, string>)[(cta as PathwayCta & { style?: string }).style || ''] ||
        '#4d7a2f';
    color.value = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : '#4d7a2f';

    row.querySelector('.pathway-cta-row__delete')?.addEventListener('click', () => {
        void (async () => {
            if (!(await confirmIfDirty(article, pathwayId))) return;
            await animateCtaRowOut(row);
        })();
    });

    container.appendChild(node);
    if (animate) animateCtaRowIn(row);
}

function readCtasFromBlock(article: HTMLElement): PathwayCta[] {
    const rows = article.querySelectorAll('.pathway-cta-row');
    const ctas: PathwayCta[] = [];
    rows.forEach((row, index) => {
        const el = row as HTMLElement;
        const label = (el.querySelector('.pathway-cta-row__label') as HTMLInputElement).value.trim();
        const url = (el.querySelector('.pathway-cta-row__url') as HTMLInputElement).value.trim();
        const color =
            (el.querySelector('.pathway-cta-row__color') as HTMLInputElement).value || '#4d7a2f';
        if (!label && !url) return;
        ctas.push({
            id: el.dataset.ctaId || `cta-${Date.now()}-${index}`,
            label,
            url,
            color,
        });
    });
    return ctas;
}

function applyEnabledVisual(article: HTMLElement, enabled: boolean): void {
    article.dataset.enabled = enabled ? 'true' : 'false';
    article.classList.toggle('pathway-block--inactive', !enabled);
    const badge = article.querySelector('.pathway-block__inactive-badge') as HTMLElement | null;
    if (badge) badge.hidden = enabled;
    const toggleBtn = article.querySelector('.pathway-block__toggle-enabled') as HTMLButtonElement | null;
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-checked', enabled ? 'true' : 'false');
        toggleBtn.title = enabled ? 'Active' : 'Inactive';
        toggleBtn.setAttribute('aria-label', enabled ? 'Pathway active' : 'Pathway inactive');
    }
}

function isArticleEnabled(article: HTMLElement): boolean {
    return article.dataset.enabled !== 'false';
}

async function onToggleEnabled(article: HTMLElement, pathwayId: string): Promise<void> {
    const nextEnabled = !isArticleEnabled(article);
    try {
        const updated = await updatePathway(courseId, pathwayId, { enabled: nextEnabled });
        pathways = pathways.map((p) => (p.id === pathwayId ? updated : p));
        applyEnabledVisual(article, updated.enabled !== false);
        showSuccessToast(updated.enabled ? 'Pathway activated' : 'Pathway deactivated');
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to update pathway status');
    }
}

async function onSave(article: HTMLElement, pathwayId: string): Promise<void> {
    const status = article.querySelector('.pathway-block__save-status') as HTMLElement | null;
    if (status) status.textContent = 'Saving…';
    try {
        const title = (article.querySelector('.pathway-block__title-input') as HTMLInputElement).value;
        const triggerDescription = (article.querySelector('.pathway-block__trigger') as HTMLTextAreaElement)
            .value;
        const assistantResponse = (article.querySelector('.pathway-block__response') as HTMLTextAreaElement)
            .value;
        const ctas = readCtasFromBlock(article);
        const updated = await updatePathway(courseId, pathwayId, {
            title,
            enabled: isArticleEnabled(article),
            triggerDescription,
            assistantResponse,
            ctas,
        });
        pathways = pathways.map((p) => (p.id === pathwayId ? updated : p));
        const titleText = article.querySelector('.pathway-block__title-text') as HTMLElement | null;
        const titleInput = article.querySelector('.pathway-block__title-input') as HTMLInputElement | null;
        if (titleText) titleText.textContent = updated.title;
        if (titleInput) titleInput.value = updated.title;
        applyEnabledVisual(article, updated.enabled !== false);
        article.classList.remove('is-editing-title');
        if (status) status.textContent = 'Saved';
        showSuccessToast('Pathway saved');
        setTimeout(() => {
            if (status) status.textContent = '';
        }, 1500);
    } catch (error: any) {
        if (status) status.textContent = '';
        showSimpleErrorModal(error?.message || 'Failed to save pathway');
    }
}

async function onAddPathway(): Promise<void> {
    try {
        const created = await createPathway(courseId, {
            title: DEFAULT_TITLE,
            enabled: true,
            triggerDescription: '',
            assistantResponse: '',
            ctas: [],
        });
        pathways.push(created);
        renderList();
        const list = document.getElementById('pathway-library-list');
        const last = list?.querySelector('.pathway-block:last-child') as HTMLElement | null;
        if (last) {
            if (!prefersReducedMotion()) {
                last.classList.add('pathway-block--enter');
                void last.offsetHeight;
                requestAnimationFrame(() => {
                    last.classList.add('pathway-block--enter-active');
                    toggleExpanded(last);
                    const clearEnter = () => {
                        last.classList.remove('pathway-block--enter', 'pathway-block--enter-active');
                        last.removeEventListener('transitionend', clearEnter);
                    };
                    last.addEventListener('transitionend', clearEnter);
                    setTimeout(clearEnter, 320);
                });
            } else {
                toggleExpanded(last);
            }
        }
        showSuccessToast('Pathway added');
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to add pathway');
    }
}

async function onRemove(pathwayId: string): Promise<void> {
    const result = await showConfirmModal(
        'Remove pathway?',
        'This permanently deletes the pathway from this course.',
        'Remove',
        'Cancel',
        'danger'
    );
    if (result.action !== 'remove') return;
    try {
        await deletePathway(courseId, pathwayId);
        pathways = pathways.filter((p) => p.id !== pathwayId);
        renderList();
        showSuccessToast('Pathway removed');
    } catch (error: any) {
        showErrorToast(error?.message || 'Failed to remove pathway');
    }
}

/**
 * movePathway - Adjacent swap via ↑/↓ with FLIP slide animation, then persist order.
 */
async function movePathway(pathwayId: string, delta: number): Promise<void> {
    if (flipBusy) return;
    const index = pathways.findIndex((p) => p.id === pathwayId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= pathways.length) return;

    const list = document.getElementById('pathway-library-list');
    const cards = list ? Array.from(list.querySelectorAll('.pathway-block')) as HTMLElement[] : [];
    const a = cards[index];
    const b = cards[next];

    const ordered = [...pathways];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);

    const reduceMotion = prefersReducedMotion();

    if (a && b && !reduceMotion) {
        flipBusy = true;
        const firstA = a.getBoundingClientRect();
        const firstB = b.getBoundingClientRect();
        if (delta < 0) {
            list?.insertBefore(a, b);
        } else {
            list?.insertBefore(b, a);
        }
        const lastA = a.getBoundingClientRect();
        const lastB = b.getBoundingClientRect();
        const dxA = firstA.top - lastA.top;
        const dxB = firstB.top - lastB.top;
        a.style.transform = `translateY(${dxA}px)`;
        b.style.transform = `translateY(${dxB}px)`;
        a.classList.add('pathway-block--flip');
        b.classList.add('pathway-block--flip');
        // Force reflow then animate to identity
        void a.offsetHeight;
        a.style.transform = '';
        b.style.transform = '';
        await new Promise<void>((resolve) => {
            const done = () => {
                a.classList.remove('pathway-block--flip');
                b.classList.remove('pathway-block--flip');
                a.removeEventListener('transitionend', done);
                resolve();
            };
            a.addEventListener('transitionend', done);
            setTimeout(done, 320);
        });
        flipBusy = false;
    }

    try {
        pathways = await reorderPathways(
            courseId,
            ordered.map((p) => p.id)
        );
        renderList();
    } catch (error: any) {
        flipBusy = false;
        showErrorToast(error?.message || 'Failed to reorder');
        await reload();
    }
}

function showStylesPanel(): void {
    const panel = document.getElementById('pathway-cta-styles-panel');
    if (panel) panel.hidden = false;
}

function hideStylesPanel(): void {
    const panel = document.getElementById('pathway-cta-styles-panel');
    if (panel) panel.hidden = true;
}
