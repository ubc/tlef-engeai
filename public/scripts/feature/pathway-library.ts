// public/scripts/feature/pathway-library.ts

/**
 * Pathway Library instructor feature — list/edit/reorder/delete course pathways.
 */

import type { activeCourse, GuidedPathway, PathwayCta, PathwayCtaStyle } from '../types.js';
import { getCourseIdFromURL } from '../utils/url-parser.js';
import {
    createPathway,
    deletePathway,
    listPathways,
    reorderPathways,
    updatePathway,
} from '../api/pathways-api.js';
import { showConfirmModal, showSimpleErrorModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

let pathways: GuidedPathway[] = [];
let courseId = '';

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

    await reload();
}

async function reload(): Promise<void> {
    setStatus('Loading…');
    try {
        pathways = await listPathways(courseId);
        renderList();
        setStatus('');
    } catch (error: any) {
        setStatus('');
        showErrorToast(error?.message || 'Failed to load pathways');
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

        const enabled = article.querySelector('.pathway-block__enabled') as HTMLInputElement;
        enabled.checked = pathway.enabledGlobally;

        const trigger = article.querySelector('.pathway-block__trigger') as HTMLTextAreaElement;
        trigger.value = pathway.triggerDescription;

        const response = article.querySelector('.pathway-block__response') as HTMLTextAreaElement;
        response.value = pathway.assistantResponse;

        const ctaList = article.querySelector('.pathway-block__cta-list') as HTMLElement;
        pathway.ctas.forEach((cta) => appendCtaRow(ctaList, cta));

        article.querySelector('.pathway-block__add-cta')?.addEventListener('click', () => {
            appendCtaRow(ctaList, {
                id: `cta-${Date.now()}`,
                label: '',
                url: '',
                style: 'primary',
            });
        });

        article.querySelector('.pathway-block__see-styles')?.addEventListener('click', showStylesPanel);

        const upBtn = article.querySelector('.pathway-block__up') as HTMLButtonElement;
        const downBtn = article.querySelector('.pathway-block__down') as HTMLButtonElement;
        upBtn.disabled = index === 0;
        downBtn.disabled = index === pathways.length - 1;
        upBtn.addEventListener('click', () => void movePathway(pathway.id, -1));
        downBtn.addEventListener('click', () => void movePathway(pathway.id, 1));

        article.querySelector('.pathway-block__remove')?.addEventListener('click', () => {
            void onRemove(pathway.id);
        });

        article.querySelector('.pathway-block__save')?.addEventListener('click', () => {
            void onSave(article, pathway.id);
        });

        list.appendChild(node);
    });
}

function appendCtaRow(container: HTMLElement, cta: PathwayCta): void {
    const tpl = document.getElementById('pathway-cta-row-template') as HTMLTemplateElement | null;
    if (!tpl) return;
    const node = tpl.content.cloneNode(true) as DocumentFragment;
    const row = node.querySelector('.pathway-cta-row') as HTMLElement;
    row.dataset.ctaId = cta.id;

    const label = row.querySelector('.pathway-cta-row__label') as HTMLInputElement;
    const url = row.querySelector('.pathway-cta-row__url') as HTMLInputElement;
    const style = row.querySelector('.pathway-cta-row__style') as HTMLSelectElement;
    label.value = cta.label;
    url.value = cta.url;
    style.value = cta.style;

    row.querySelector('.pathway-cta-row__delete')?.addEventListener('click', () => {
        row.remove();
    });

    container.appendChild(node);
}

function readCtasFromBlock(article: HTMLElement): PathwayCta[] {
    const rows = article.querySelectorAll('.pathway-cta-row');
    const ctas: PathwayCta[] = [];
    rows.forEach((row, index) => {
        const el = row as HTMLElement;
        const label = (el.querySelector('.pathway-cta-row__label') as HTMLInputElement).value.trim();
        const url = (el.querySelector('.pathway-cta-row__url') as HTMLInputElement).value.trim();
        const style = (el.querySelector('.pathway-cta-row__style') as HTMLSelectElement)
            .value as PathwayCtaStyle;
        if (!label && !url) return;
        ctas.push({
            id: el.dataset.ctaId || `cta-${Date.now()}-${index}`,
            label,
            url,
            style,
        });
    });
    return ctas;
}

async function onSave(article: HTMLElement, pathwayId: string): Promise<void> {
    const status = article.querySelector('.pathway-block__save-status') as HTMLElement | null;
    if (status) status.textContent = 'Saving…';
    try {
        const enabled = (article.querySelector('.pathway-block__enabled') as HTMLInputElement).checked;
        const triggerDescription = (article.querySelector('.pathway-block__trigger') as HTMLTextAreaElement)
            .value;
        const assistantResponse = (article.querySelector('.pathway-block__response') as HTMLTextAreaElement)
            .value;
        const ctas = readCtasFromBlock(article);
        const updated = await updatePathway(courseId, pathwayId, {
            enabledGlobally: enabled,
            triggerDescription,
            assistantResponse,
            ctas,
        });
        pathways = pathways.map((p) => (p.id === pathwayId ? updated : p));
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
            enabledGlobally: true,
            triggerDescription: '',
            assistantResponse: '',
            ctas: [],
        });
        pathways.push(created);
        renderList();
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

async function movePathway(pathwayId: string, delta: number): Promise<void> {
    const index = pathways.findIndex((p) => p.id === pathwayId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= pathways.length) return;
    const ordered = [...pathways];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);
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

function showStylesPanel(): void {
    const panel = document.getElementById('pathway-cta-styles-panel');
    if (panel) panel.hidden = false;
}

function hideStylesPanel(): void {
    const panel = document.getElementById('pathway-cta-styles-panel');
    if (panel) panel.hidden = true;
}
