

/**
 * This file contains the functions for the documents page.
 * 
 * @author: @gatahcha
 * @date: 2025-08-25
 * @version: 1.0.0
 * @description: This file contains the functions for the documents page.
 * 
 * @param currentClass the currently active class
 * @returns null
 */

/**
 * This file contains the functions for the documents page.
 * 
 * @param currentClass the currently active class
 * @returns null
 */

import { 
    TopicOrWeekInstance, 
    TopicOrWeekItem, 
    AdditionalMaterial,
    AdditionalMaterialUpload,
    activeCourse
} from '../types.js';
import { uploadRAGContent } from '../services/rag-service.js';
import { DocumentUploadModule } from '../services/document-upload-module.js';
import type { InstructorStruggleTopic, UploadResult } from '../types.js';
import { openUploadModal, openStruggleTopicsReviewModal, openLearningObjectivesEditModal, openDivisionReorderModal, showSimpleErrorModal, showUploadLoadingModal, showInputModal, showSuccessModal, showErrorModal, showTitleUpdateLoadingModal, showDeletionSuccessModal, closeModal, showCustomModal } from '../ui/modal-overlay.js';
import { installInvokerCommandFallback, onDialogOpenCommand, showDialogAndWait } from '../ui/dialog.js';
import { buildCatalogSectionForItem } from './catalog-section.js';
import { showToast, showSuccessToast } from '../ui/toast-notification.js';
import { renderFeatherIcons } from '../api/api.js';
import { isBrowserCourseFeatureEnabled } from '../utils/course-features.js';
import { runCourseMaterialCopy } from './course-material-copy.js';
import { fetchCourse } from '../api/course-material-copy-api.js';

// Feature flag for scheduled publish - set to true to enable
const SCHEDULED_PUBLISH_ENABLED = true;

function setSchedulePanelError(el: HTMLElement, message: string): void {
    const text = message.trim();
    el.textContent = text;
    el.hidden = text.length === 0;
}

/** Shared confirm dialog in documents-instructor.html for every week/topic, section and document delete button. */
const DELETE_DIALOG_ID = 'documents-delete-dialog';

/** What a delete button removes; the dialog reads it to word the confirmation and pick the request. */
type DeleteDialogKind = 'instance' | 'section' | 'material' | 'all-documents';

/** Listeners on the page's dialogs from the last page init, removed when the page initializes again. */
let dialogListeners: AbortController | null = null;

/**
 * setDeleteDialogInvoker — makes `button` open the shared delete dialog for `kind`.
 * The button must also carry the ids that kind needs (see `prepareDeleteDialog`).
 */
function setDeleteDialogInvoker(button: HTMLButtonElement, kind: DeleteDialogKind): void {
    button.setAttribute('commandfor', DELETE_DIALOG_ID);
    button.setAttribute('command', 'show-modal');
    button.dataset.deleteKind = kind;
}

/** Shared result dialog in documents-instructor.html, shown after any delete on this page. */
const DELETION_RESULT_DIALOG_ID = 'documents-deletion-result-dialog';

/**
 * showDeletionResultDialog — reports how many chunks a delete removed, per document, and
 * resolves once the instructor closes the report. Focus starts on its heading.
 *
 * @param deletedDocuments - Each deleted document's name and chunk count
 * @param totalChunksDeleted - Chunks removed across all of them
 */
async function showDeletionResultDialog(
    deletedDocuments: { name: string; chunksDeleted: number }[],
    totalChunksDeleted: number
): Promise<void> {
    const dialog = document.getElementById(DELETION_RESULT_DIALOG_ID);
    if (!(dialog instanceof HTMLDialogElement)) {
        await showDeletionSuccessModal(deletedDocuments, totalChunksDeleted);
        return;
    }

    // 1. Heading: the outcome in a few words
    const heading = document.getElementById(`${DELETION_RESULT_DIALOG_ID}-heading`);
    if (heading) {
        heading.textContent = totalChunksDeleted === 0
            ? 'No chunks were deleted'
            : `${totalChunksDeleted} chunk(s) deleted successfully`;
    }

    // 2. Body: per-document breakdown; textContent because document names are instructor-entered
    const body = document.getElementById(`${DELETION_RESULT_DIALOG_ID}-body`);
    if (body) {
        body.replaceChildren();
        if (deletedDocuments.length > 0) {
            const list = document.createElement('ul');
            list.className = 'app-dialog__list';
            for (const doc of deletedDocuments) {
                const li = document.createElement('li');
                li.textContent = `${doc.name}: ${doc.chunksDeleted} ${doc.chunksDeleted === 1 ? 'chunk' : 'chunks'}`;
                list.appendChild(li);
            }
            body.appendChild(list);
        } else {
            const p = document.createElement('p');
            p.textContent = totalChunksDeleted === 0
                ? 'No documents with chunks were found to delete.'
                : `${totalChunksDeleted} chunk(s) were removed from the vector database.`;
            body.appendChild(p);
        }
    }

    // 3. Open and wait for it to close
    await showDialogAndWait(dialog);
}

/** Shared message dialog in documents-instructor.html. */
const MESSAGE_DIALOG_ID = 'documents-message-dialog';

/** Publish dialogs in documents-instructor.html; a week's status button opens the one for its state. */
const PUBLISH_DIALOG_ID = 'publish-dialog';
const SCHEDULED_PUBLISH_DIALOG_ID = 'scheduled-publish-dialog';
const CANCEL_SCHEDULE_DIALOG_ID = 'cancel-schedule-dialog';
const MOVE_TO_DRAFT_DIALOG_ID = 'move-to-draft-dialog';

/**
 * showDocumentsMessageDialog — shows a short message (e.g. a failed request) and resolves once the
 * instructor closes it. Focus starts on its heading and returns to the previous control afterwards.
 * Being a native dialog, it stacks above any other open dialog; a ModalOverlay would sit beneath
 * one and be unusable.
 *
 * @param title - Dialog heading
 * @param message - The message; shown as text, never HTML
 */
async function showDocumentsMessageDialog(title: string, message: string): Promise<void> {
    const dialog = document.getElementById(MESSAGE_DIALOG_ID);
    if (!(dialog instanceof HTMLDialogElement)) {
        await showSimpleErrorModal(message, title);
        return;
    }
    const heading = document.getElementById(`${MESSAGE_DIALOG_ID}-heading`);
    const messageEl = document.getElementById(`${MESSAGE_DIALOG_ID}-message`);
    if (heading) heading.textContent = title;
    if (messageEl) messageEl.textContent = message;
    await showDialogAndWait(dialog);
}

// In-memory store for the course data
let courseData: TopicOrWeekInstance[] = [];

// Function to initialize the documents page
export async function initializeDocumentsPage( currentClass : activeCourse) {
        // Validate and store courseId in closure - critical for all API calls
        let courseId: string | null = null;
        
        // Try to get courseId from the passed parameter
        if (currentClass && currentClass.id) {
            courseId = currentClass.id;
        }
        // Fallback to window.currentClass if available
        else if (typeof window !== 'undefined' && (window as any).currentClass && (window as any).currentClass.id) {
            courseId = (window as any).currentClass.id;
            currentClass = (window as any).currentClass; // Update currentClass reference
        }
        // Last resort: try to get from session
        else {
            try {
                const sessionResponse = await fetch('/api/course/current');
                if (sessionResponse.ok) {
                    const sessionData = await sessionResponse.json();
                    if (sessionData.success && sessionData.data && sessionData.data.courseId) {
                        courseId = sessionData.data.courseId;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Could not fetch course from session:', e);
            }
        }
        
        // Validate courseId exists before proceeding
        if (!courseId || courseId.trim() === '') {
            await showSimpleErrorModal('Cannot load documents: Course ID is missing. Please refresh the page or return to course selection.', 'Initialization Error');
            return;
        }

        // console.log(`✅ [DOCUMENTS] Initializing with courseId: ${courseId}`); // 🟢 MEDIUM: Course ID exposure
        
        // Update currentClass.id if it was missing
        if (!currentClass.id) {
            currentClass.id = courseId;
        }

        // Sync from server so refresh reflects latest divisions/items
        await syncCourseFromServer();
        // Build initial in-memory data (prefers server divisions)
        loadClassroomData(currentClass);
        
        // Update button labels based on frameType
        updateDivisionButtonLabels(currentClass);
        
        // Load learning objectives from database for all content items
        await loadAllLearningObjectives();
        // Struggle-topic catalog API is gated by Memory Agent — skip when off (use embedded course payload).
        if (isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent')) {
            await loadAllStruggleTopics();
        }

    /**
     * Generate initial data based according to the currentClass
     * 
     * @param currentClass the currently active class
     */
    function loadClassroomData( currentClass : activeCourse ) {
        // If server provided topic/week instances, trust them completely
        if (currentClass.topicOrWeekInstances && currentClass.topicOrWeekInstances.length > 0) {
            courseData = currentClass.topicOrWeekInstances;
            return;
        }

        // Fallback to generating defaults based on tilesNumber when no topic/week instances are present
        const total = currentClass.tilesNumber;
        courseData = [];
        for (let i = 0; i < total; i++) {
            const defaultInstance: TopicOrWeekInstance = {
                id: String(i + 1),
                date: new Date(),
                title: currentClass.frameType === 'byWeek' ? `Week ${i + 1}` : `Topic ${i + 1}`,
                courseName: currentClass.courseName,
                published: false,
                items: [
                    {
                        id: String(i + 1),
                        date: new Date(),
                        title: currentClass.frameType === 'byWeek' ? `Lecture ${i + 1}` : `Session ${i + 1}`,
                        courseName: currentClass.courseName,
                        topicOrWeekTitle: currentClass.frameType === 'byWeek' ? `Week ${i + 1}` : `Topic ${i + 1}`,
                        itemTitle: currentClass.frameType === 'byWeek' ? `Lecture ${i + 1}` : `Session ${i + 1}`,
                        learningObjectives: [],
                        instructorStruggleTopics: [],
                        additionalMaterials: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            courseData.push(defaultInstance);
        }
    }

    async function syncCourseFromServer(): Promise<void> {
        try {
            if (!courseId) return;
            const res = await fetch(`/api/courses/${courseId}`);
            if (!res.ok) {
                console.warn('⚠️ Failed to fetch latest course from server:', res.status, res.statusText);
                return;
            }
            const payload = await res.json();
            if (payload && payload.success && payload.data) {
                const course = payload.data;
                // Update currentClass with latest topic/week instances count and data
                currentClass.topicOrWeekInstances = course.topicOrWeekInstances || currentClass.topicOrWeekInstances;
                currentClass.tilesNumber = (course.topicOrWeekInstances && course.topicOrWeekInstances.length) ? course.topicOrWeekInstances.length : currentClass.tilesNumber;
            }
        } catch (e) {
            console.warn('⚠️ Exception fetching latest course:', e);
        }
    }

    const MIN_SCHEDULE_LEAD_MS = 60_000;

    function parseTopicDate(value: unknown): Date | null {
        if (value == null) return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }
        const d = new Date(String(value));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function getScheduledDate(tw: TopicOrWeekInstance): Date | null {
        const v = tw.scheduledPublishAt;
        if (v == null || v === '') return null;
        return parseTopicDate(v);
    }

    // Do not mix dateStyle/timeStyle with hour/minute/hour12 — that throws "Invalid option" in many engines.
    const topicMetaDateFmt = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    const topicScheduleFmt = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    function formatTopicMetaEdited(d: Date): string {
        return topicMetaDateFmt.format(d);
    }

    function formatScheduleLine(d: Date): string {
        return topicScheduleFmt.format(d);
    }

    /**
     * How long to wait after closing a dialog before showing its confirmation toast.
     * Closing returns focus to the button that opened the dialog, and VoiceOver drops a
     * live-region update that arrives while it is announcing that focus change.
     */
    const TOAST_AFTER_DIALOG_CLOSE_MS = 500;

    /**
     * Shows a success toast once a just-closed dialog's focus change has been announced.
     *
     * @param message - The toast text
     */
    function showSuccessToastAfterDialogClose(message: string): void {
        setTimeout(() => showSuccessToast(message), TOAST_AFTER_DIALOG_CLOSE_MS);
    }

    function buildLocalDateFromParts(dateYmd: string, hour12: number, minute: number, isPm: boolean): Date | null {
        const segs = dateYmd.split('-').map((x) => parseInt(x, 10));
        if (segs.length !== 3 || segs.some((n) => Number.isNaN(n))) return null;
        const [y, mo, day] = segs;
        let hour24: number;
        if (hour12 === 12) {
            hour24 = isPm ? 12 : 0;
        } else {
            hour24 = isPm ? hour12 + 12 : hour12;
        }
        return new Date(y, mo - 1, day, hour24, minute, 0, 0);
    }

    /** The date/time controls inside a publish dialog (`{prefix}-date`, `{prefix}-hour`, …). */
    interface ScheduleControls {
        trigger: HTMLButtonElement;
        panel: HTMLElement;
        dateInput: HTMLInputElement;
        hourSel: HTMLSelectElement;
        minSel: HTMLSelectElement;
        amPm: HTMLSelectElement;
        errEl: HTMLElement;
    }

    /**
     * Finds a publish dialog's schedule controls in documents-instructor.html and fills the hour
     * and minute options the first time.
     *
     * @param prefix - The dialog id the controls' ids start with
     */
    function getScheduleControls(prefix: string): ScheduleControls | null {
        const byId = <T extends HTMLElement>(suffix: string) => document.getElementById(`${prefix}-${suffix}`) as T | null;
        const trigger = byId<HTMLButtonElement>('schedule-trigger');
        const panel = byId<HTMLElement>('schedule-panel');
        const dateInput = byId<HTMLInputElement>('date');
        const hourSel = byId<HTMLSelectElement>('hour');
        const minSel = byId<HTMLSelectElement>('minute');
        const amPm = byId<HTMLSelectElement>('ampm');
        const errEl = byId<HTMLElement>('schedule-error');
        if (!trigger || !panel || !dateInput || !hourSel || !minSel || !amPm || !errEl) return null;

        if (hourSel.options.length === 0) {
            for (let hr = 1; hr <= 12; hr++) {
                hourSel.add(new Option(String(hr), String(hr)));
            }
            for (let m = 0; m < 60; m++) {
                minSel.add(new Option(m < 10 ? `0${m}` : String(m), String(m)));
            }
        }
        return { trigger, panel, dateInput, hourSel, minSel, amPm, errEl };
    }

    /** Sets the controls to `tw`'s scheduled time, or a couple of minutes from now, and clears errors. */
    function resetScheduleControls(controls: ScheduleControls, tw: TopicOrWeekInstance): void {
        const base = getScheduledDate(tw) ?? new Date(Date.now() + MIN_SCHEDULE_LEAD_MS + 120_000);
        const mo = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        controls.dateInput.value = `${base.getFullYear()}-${mo}-${d}`;
        const h24 = base.getHours();
        controls.hourSel.value = String(h24 % 12 === 0 ? 12 : h24 % 12);
        controls.minSel.value = String(base.getMinutes());
        controls.amPm.value = h24 >= 12 ? 'pm' : 'am';
        setSchedulePanelError(controls.errEl, '');
    }

    function setSchedulePanelOpen(controls: ScheduleControls, open: boolean): void {
        controls.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        controls.panel.classList.toggle('publish-modal-schedule-panel--open', open);
        if (!open) setSchedulePanelError(controls.errEl, '');
    }

    /** The chosen time, or `null` after showing why it can't be used. */
    function readScheduleTime(controls: ScheduleControls): Date | null {
        setSchedulePanelError(controls.errEl, '');
        const when = buildLocalDateFromParts(
            controls.dateInput.value,
            parseInt(controls.hourSel.value, 10),
            parseInt(controls.minSel.value, 10),
            controls.amPm.value === 'pm'
        );
        if (!when) {
            setSchedulePanelError(controls.errEl, 'Please choose a valid date and time.');
            return null;
        }
        if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
            setSchedulePanelError(controls.errEl, 'Choose a time at least one minute from now.');
            return null;
        }
        return when;
    }

    function mergeTopicFromServerResponse(tw: TopicOrWeekInstance, data: Record<string, unknown>): void {
        if (typeof data.published === 'boolean') {
            tw.published = data.published;
        }
        if ('scheduledPublishAt' in data) {
            const s = data.scheduledPublishAt;
            tw.scheduledPublishAt = s == null ? null : String(s);
        }
        if (data.updatedAt != null) {
            const u = parseTopicDate(data.updatedAt);
            if (u) tw.updatedAt = u;
        }
    }

    /** Fills a publish dialog's week/topic name and section list (`{prefix}-name`, `{prefix}-sections`). */
    function fillPublishSummary(prefix: string, tw: TopicOrWeekInstance): void {
        const name = document.getElementById(`${prefix}-name`);
        const sections = document.getElementById(`${prefix}-sections`);
        if (name) name.textContent = tw.title;
        if (sections) {
            sections.replaceChildren(
                ...tw.items.map((item) => {
                    const li = document.createElement('li');
                    li.textContent = item.itemTitle || item.title || 'Untitled section';
                    return li;
                })
            );
        }
    }

    function syncTopicOrWeekPublishHeader(wrapper: HTMLElement, tw: TopicOrWeekInstance): void {
        const pubBtn = wrapper.querySelector('.publish-status-btn') as HTMLButtonElement | null;
        const metaEdited = wrapper.querySelector('.topic-or-week-meta-edited') as HTMLElement | null;
        const metaSched = wrapper.querySelector('.topic-or-week-meta-schedule') as HTMLElement | null;
        if (!pubBtn || !metaEdited || !metaSched) return;

        const published = !!tw.published;
        const sched = getScheduledDate(tw);
        const isScheduled = !published && sched !== null;

        // The button opens the dialog for the week's current state
        pubBtn.setAttribute(
            'commandfor',
            published ? MOVE_TO_DRAFT_DIALOG_ID : isScheduled ? SCHEDULED_PUBLISH_DIALOG_ID : PUBLISH_DIALOG_ID
        );
        pubBtn.setAttribute('command', 'show-modal');

        pubBtn.classList.remove('status-published', 'status-draft', 'status-scheduled');
        if (published) {
            pubBtn.classList.add('status-published');
            pubBtn.setAttribute('aria-label', 'Published');
            pubBtn.setAttribute('title', 'Published — click to change');
        } else if (isScheduled) {
            pubBtn.classList.add('status-scheduled');
            const label = formatScheduleLine(sched!);
            pubBtn.setAttribute('aria-label', `Scheduled — ${label}`);
            pubBtn.setAttribute('title', `Scheduled — click to reschedule or cancel (${label})`);
        } else {
            pubBtn.classList.add('status-draft');
            pubBtn.setAttribute('aria-label', 'Draft');
            pubBtn.setAttribute('title', 'Draft — click to publish or schedule');
        }

        const textEl = pubBtn.querySelector('.status-text');
        const featherName = published ? 'check' : isScheduled ? 'calendar' : 'file-text';
        let icon = pubBtn.querySelector('i[data-feather]') as HTMLElement | null;
        if (!icon) {
            const beforeText = textEl ?? null;
            const stale = beforeText?.previousElementSibling;
            if (stale?.tagName?.toLowerCase() === 'svg') {
                stale.remove();
            }
            icon = document.createElement('i');
            if (beforeText) {
                pubBtn.insertBefore(icon, beforeText);
            } else {
                pubBtn.appendChild(icon);
            }
        }
        icon.setAttribute('data-feather', featherName);
        if (textEl) {
            textEl.textContent = published ? 'Published' : isScheduled ? 'Scheduled' : 'Draft';
        }

        const uAt = parseTopicDate(tw.updatedAt);
        metaEdited.textContent = uAt ? `Last edited: ${formatTopicMetaEdited(uAt)}` : '';

        if (isScheduled && sched) {
            metaSched.textContent = `Scheduled for: ${formatScheduleLine(sched)}`;
            metaSched.style.display = 'block';
        } else {
            metaSched.textContent = '';
            metaSched.style.display = 'none';
        }
    }

    function showScheduleComingSoonModal(): void {
        void showDocumentsMessageDialog(
            'Scheduled Publishing Coming Soon',
            'We\'re working on adding the ability to schedule when your content publishes. For now, you can publish content immediately.'
        );
    }

    async function patchTopicSchedule(tw: TopicOrWeekInstance, isoOrNull: string | null): Promise<{ ok: boolean; error?: string }> {
        if (!courseId) return { ok: false, error: 'Course ID is missing' };
        const res = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${tw.id}/publish-schedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ scheduledPublishAt: isoOrNull })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: (result as { error?: string }).error || res.statusText };
        }
        if ((result as { success?: boolean }).success && (result as { data?: Record<string, unknown> }).data) {
            mergeTopicFromServerResponse(tw, (result as { data: Record<string, unknown> }).data);
        }
        return { ok: true };
    }

    async function patchTopicPublished(tw: TopicOrWeekInstance, published: boolean): Promise<{ ok: boolean; error?: string }> {
        if (!courseId) return { ok: false, error: 'Course ID is missing' };
        const res = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${tw.id}/published`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ published })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: (result as { error?: string }).error || res.statusText };
        }
        if ((result as { success?: boolean }).success && (result as { data?: Record<string, unknown> }).data) {
            mergeTopicFromServerResponse(tw, (result as { data: Record<string, unknown> }).data);
        }
        return { ok: true };
    }

    // ----- Publish dialogs: native <dialog>s in documents-instructor.html -----
    // A week's status button opens the dialog for its state (see syncTopicOrWeekPublishHeader);
    // each dialog's `command` handler fills it in for that week, and its buttons act on it.

    /** The week the open publish dialog is about. */
    interface PublishTarget {
        tw: TopicOrWeekInstance;
        wrapper: HTMLElement;
    }

    let publishTarget: PublishTarget | null = null;
    let scheduledTarget: PublishTarget | null = null;
    let moveToDraftTarget: PublishTarget | null = null;

    /** The week a status button belongs to. */
    function findPublishTarget(invoker: Element): PublishTarget | null {
        const wrapper = invoker.closest<HTMLElement>('.topic-or-week-instance');
        const id = wrapper?.querySelector('.topic-or-week-header')?.getAttribute('data-topic-or-week-instance');
        const tw = courseData.find((d) => d.id === id);
        return wrapper && tw ? { tw, wrapper } : null;
    }

    /** Matches the publish dialog's main button to whether its schedule panel is open. */
    function syncPublishPrimaryLabel(controls: ScheduleControls, tw: TopicOrWeekInstance): void {
        const primary = document.getElementById(`${PUBLISH_DIALOG_ID}-primary`);
        if (!primary) return;
        const open = controls.trigger.getAttribute('aria-expanded') === 'true';
        primary.textContent = !open ? 'Publish now' : getScheduledDate(tw) ? 'Update schedule' : 'Schedule now';
    }

    /**
     * Fills "Publish topic/week?" for `target`.
     *
     * @param openSchedulePanel - Start with "Schedule for later" expanded (e.g. "Publish later" after an upload)
     */
    function preparePublishDialog(target: PublishTarget, openSchedulePanel = false): boolean {
        const controls = getScheduleControls(PUBLISH_DIALOG_ID);
        if (!controls) return false;
        publishTarget = target;
        fillPublishSummary(PUBLISH_DIALOG_ID, target.tw);
        resetScheduleControls(controls, target.tw);
        setSchedulePanelOpen(controls, openSchedulePanel || getScheduledDate(target.tw) !== null);
        syncPublishPrimaryLabel(controls, target.tw);
        return true;
    }

    /** Fills "Scheduled publish" for `target`; `false` when it is no longer scheduled. */
    function prepareScheduledPublishDialog(target: PublishTarget): boolean {
        const sched = getScheduledDate(target.tw);
        const controls = getScheduleControls(SCHEDULED_PUBLISH_DIALOG_ID);
        if (!sched || !controls) return false;
        scheduledTarget = target;
        const name = document.getElementById(`${SCHEDULED_PUBLISH_DIALOG_ID}-name`);
        const when = document.getElementById(`${SCHEDULED_PUBLISH_DIALOG_ID}-when`);
        if (name) name.textContent = target.tw.title;
        if (when) when.textContent = `Scheduled for: ${formatScheduleLine(sched)}`;
        resetScheduleControls(controls, target.tw);
        setScheduledPanelOpen(controls, false);
        return true;
    }

    /** Opening "Reschedule" swaps "Cancel schedule" for "Apply new time". */
    function setScheduledPanelOpen(controls: ScheduleControls, open: boolean): void {
        setSchedulePanelOpen(controls, open);
        const cancelBtn = document.getElementById(`${SCHEDULED_PUBLISH_DIALOG_ID}-cancel-schedule`);
        const applyBtn = document.getElementById(`${SCHEDULED_PUBLISH_DIALOG_ID}-apply`);
        if (cancelBtn) cancelBtn.hidden = open;
        if (applyBtn) applyBtn.hidden = !open;
    }

    function prepareMoveToDraftDialog(target: PublishTarget): boolean {
        moveToDraftTarget = target;
        fillPublishSummary(MOVE_TO_DRAFT_DIALOG_ID, target.tw);
        return true;
    }

    /**
     * Opens "Publish topic/week?" from code (after an upload) and resolves once it closes.
     *
     * @param options.openSchedulePanel - Start with "Schedule for later" expanded
     */
    async function openPublishDraftModal(
        tw: TopicOrWeekInstance,
        wrapper: HTMLElement,
        options: { openSchedulePanel?: boolean } = {}
    ): Promise<void> {
        const dialog = document.getElementById(PUBLISH_DIALOG_ID);
        if (!(dialog instanceof HTMLDialogElement)) return;
        if (!preparePublishDialog({ tw, wrapper }, options.openSchedulePanel === true)) return;
        await showDialogAndWait(dialog);
    }

    /**
     * Wires the four publish dialogs. Listeners stop when `signal` aborts (the page re-initializes).
     */
    function wirePublishDialogs(signal: AbortSignal): void {
        const publishDialog = document.getElementById(PUBLISH_DIALOG_ID);
        const scheduledDialog = document.getElementById(SCHEDULED_PUBLISH_DIALOG_ID);
        const cancelScheduleDialog = document.getElementById(CANCEL_SCHEDULE_DIALOG_ID);
        const moveToDraftDialog = document.getElementById(MOVE_TO_DRAFT_DIALOG_ID);
        const publishControls = getScheduleControls(PUBLISH_DIALOG_ID);
        const scheduledControls = getScheduleControls(SCHEDULED_PUBLISH_DIALOG_ID);
        const publishPrimary = document.getElementById(`${PUBLISH_DIALOG_ID}-primary`) as HTMLButtonElement | null;
        const applyBtn = document.getElementById(`${SCHEDULED_PUBLISH_DIALOG_ID}-apply`) as HTMLButtonElement | null;
        if (
            !(publishDialog instanceof HTMLDialogElement) ||
            !(scheduledDialog instanceof HTMLDialogElement) ||
            !(cancelScheduleDialog instanceof HTMLDialogElement) ||
            !(moveToDraftDialog instanceof HTMLDialogElement) ||
            !publishControls ||
            !scheduledControls ||
            !publishPrimary ||
            !applyBtn
        ) {
            console.error('Publish dialog markup is missing from the Documents page.');
            return;
        }

        // 1. Status buttons open the dialog for their week
        const openFor = (prepare: (target: PublishTarget) => boolean) => (invoker: HTMLButtonElement) => {
            const target = findPublishTarget(invoker);
            return target ? prepare(target) : false;
        };
        onDialogOpenCommand(publishDialog, openFor((t) => preparePublishDialog(t)), signal);
        onDialogOpenCommand(scheduledDialog, openFor(prepareScheduledPublishDialog), signal);
        onDialogOpenCommand(moveToDraftDialog, openFor(prepareMoveToDraftDialog), signal);

        // 2. "Publish topic/week?": publish now, or schedule when the panel is open
        publishControls.trigger.addEventListener(
            'click',
            () => {
                const open = publishControls.trigger.getAttribute('aria-expanded') !== 'true';
                setSchedulePanelOpen(publishControls, open);
                if (publishTarget) syncPublishPrimaryLabel(publishControls, publishTarget.tw);
            },
            { signal }
        );
        publishPrimary.addEventListener(
            'click',
            async () => {
                const target = publishTarget;
                if (!target) return;
                const { tw, wrapper } = target;
                const scheduling = publishControls.trigger.getAttribute('aria-expanded') === 'true';
                let when: Date | null = null;
                if (scheduling) {
                    if (!SCHEDULED_PUBLISH_ENABLED) {
                        showScheduleComingSoonModal();
                        return;
                    }
                    when = readScheduleTime(publishControls);
                    if (!when) return;
                }

                publishPrimary.disabled = true;
                try {
                    if (when) {
                        const r = await patchTopicSchedule(tw, when.toISOString());
                        if (!r.ok) {
                            setSchedulePanelError(publishControls.errEl, r.error || 'Failed to save schedule.');
                            return;
                        }
                    } else {
                        const r = await patchTopicPublished(tw, true);
                        if (!r.ok) {
                            await showDocumentsMessageDialog('Publish', r.error || 'Failed to publish.');
                            return;
                        }
                    }
                    syncTopicOrWeekPublishHeader(wrapper, tw);
                    renderFeatherIcons();
                    // Close first: screen readers ignore the toast region while a modal dialog is open
                    publishDialog.close();
                    showSuccessToastAfterDialogClose(
                        when ? `Scheduled "${tw.title}" to publish ${formatScheduleLine(when)}.` : `Published "${tw.title}".`
                    );
                } finally {
                    publishPrimary.disabled = false;
                }
            },
            { signal }
        );

        // 3. "Scheduled publish": reschedule (Apply new time); Cancel schedule opens its own dialog
        scheduledControls.trigger.addEventListener(
            'click',
            () => {
                const open = scheduledControls.trigger.getAttribute('aria-expanded') !== 'true';
                setScheduledPanelOpen(scheduledControls, open);
            },
            { signal }
        );
        applyBtn.addEventListener(
            'click',
            async () => {
                const target = scheduledTarget;
                if (!target) return;
                if (!SCHEDULED_PUBLISH_ENABLED) {
                    showScheduleComingSoonModal();
                    return;
                }
                const when = readScheduleTime(scheduledControls);
                if (!when) return;
                applyBtn.disabled = true;
                try {
                    const r = await patchTopicSchedule(target.tw, when.toISOString());
                    if (!r.ok) {
                        setSchedulePanelError(scheduledControls.errEl, r.error || 'Failed to save schedule.');
                        return;
                    }
                    syncTopicOrWeekPublishHeader(target.wrapper, target.tw);
                    renderFeatherIcons();
                    scheduledDialog.close();
                    showSuccessToastAfterDialogClose(`Updated schedule to ${formatScheduleLine(when)}.`);
                } finally {
                    applyBtn.disabled = false;
                }
            },
            { signal }
        );

        // 4. "Cancel schedule?": confirmed → remove the schedule, then close "Scheduled publish" too
        cancelScheduleDialog.addEventListener(
            'command',
            () => {
                cancelScheduleDialog.returnValue = '';
            },
            { signal }
        );
        cancelScheduleDialog.addEventListener(
            'close',
            async () => {
                const target = scheduledTarget;
                if (cancelScheduleDialog.returnValue !== 'cancel-schedule' || !target) return;
                const r = await patchTopicSchedule(target.tw, null);
                if (!r.ok) {
                    await showDocumentsMessageDialog('Schedule', r.error || 'Could not cancel schedule.');
                    return;
                }
                syncTopicOrWeekPublishHeader(target.wrapper, target.tw);
                renderFeatherIcons();
                scheduledDialog.close();
                showSuccessToastAfterDialogClose('Scheduled publish cancelled.');
            },
            { signal }
        );

        // 5. "Move to draft?": confirmed → unpublish after the dialog has closed
        moveToDraftDialog.addEventListener(
            'close',
            async () => {
                const target = moveToDraftTarget;
                moveToDraftTarget = null;
                if (moveToDraftDialog.returnValue !== 'move-to-draft' || !target) return;
                const r = await patchTopicPublished(target.tw, false);
                if (!r.ok) {
                    await showDocumentsMessageDialog('Publish', r.error || 'Failed to update.');
                    return;
                }
                syncTopicOrWeekPublishHeader(target.wrapper, target.tw);
                renderFeatherIcons();
                // A fast response would otherwise land on the dialog's focus change
                showSuccessToastAfterDialogClose(`"${target.tw.title}" is now a draft.`);
            },
            { signal }
        );
    }

    /**
     * Reports a finished upload and, when its topic/week is still a draft, asks whether to keep it
     * as a draft, publish now, or schedule a publish. Students' chat only draws on published
     * topic/weeks, so without this prompt new material silently stays unused.
     *
     * Publish state belongs to the whole topic/week, so the prompt names it rather than the file.
     *
     * @param tw - Topic/week the material was uploaded into
     * @param materialName - Title the instructor gave the uploaded material
     * @param chunksGenerated - Searchable chunks stored for the material
     */
    async function promptPublishAfterUpload(
        tw: TopicOrWeekInstance,
        materialName: string,
        chunksGenerated: number
    ): Promise<void> {
        const uploadedLine = `"${materialName}" was uploaded.`;
        const header = document.querySelector(
            `.topic-or-week-header[data-topic-or-week-instance="${CSS.escape(tw.id)}"]`
        );
        const wrapper = header?.closest('.topic-or-week-instance') as HTMLElement | null;

        // 1. Already live or already scheduled: nothing to decide, so confirm without interrupting.
        if (tw.published) {
            showSuccessToast(`${uploadedLine} "${tw.title}" is published, so students can use it now.`);
            return;
        }
        const sched = getScheduledDate(tw);
        if (sched) {
            showSuccessToast(`${uploadedLine} It will reach students when "${tw.title}" publishes ${formatScheduleLine(sched)}.`);
            return;
        }

        // 2. Draft: ask. Closing the modal any other way keeps the draft, the same as "Keep as draft".
        const body = document.createElement('div');
        body.style.lineHeight = '1.5';
        const uploaded = document.createElement('p');
        uploaded.style.marginBottom = '0.75rem';
        uploaded.textContent = uploadedLine;
        body.appendChild(uploaded);
        const draftNote = document.createElement('p');
        draftNote.style.margin = '0';
        draftNote.textContent =
            `"${tw.title}" is a draft, so EngE-AI can't reference its materials in chats yet. ` +
            'Click "Publish now" to make all sections in ' + 
            `"${tw.title}" visible, including "${materialName}".`;
        body.appendChild(draftNote);

        const result = await showCustomModal({
            type: 'success',
            title: 'Upload complete',
            content: body,
            maxWidth: '520px',
            buttons: [
                { text: 'Keep as draft', type: 'secondary', closeOnClick: true },
                { text: 'Publish later', type: 'secondary', closeOnClick: true },
                { text: 'Publish now', type: 'primary', closeOnClick: true }
            ]
        });

        if (result.action === 'publish-later') {
            if (!wrapper) return;
            await openPublishDraftModal(tw, wrapper, { openSchedulePanel: true });
            return;
        }
        if (result.action !== 'publish-now') return;

        const r = await patchTopicPublished(tw, true);
        if (!r.ok) {
            await showSimpleErrorModal(r.error || 'Failed to publish.', 'Publish');
            return;
        }
        if (wrapper) {
            syncTopicOrWeekPublishHeader(wrapper, tw);
            renderFeatherIcons();
        }
        showSuccessToast(`Published "${tw.title}".`);
    }

    function prefersReducedMotion(): boolean {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function playListCardAppear(el: HTMLElement): void {
        el.classList.add('topic-or-week-instance--is-appearing');
        el.addEventListener(
            'animationend',
            (event) => {
                if (event.target !== el || event.animationName !== 'topic-or-week-appear') return;
                el.classList.remove('topic-or-week-instance--is-appearing');
            },
            { once: true }
        );
    }

    /**
     * Render the documentPage
     * 
     * @returns null
     */
    function renderDocumentsPage(animateEnter = false) {
        const container = document.getElementById('documents-container');
        if (!container) return;

        //return; //for debugging purposes, do not change this line

        // Clear existing children
        while (container.firstChild) container.removeChild(container.firstChild);

        // Append each topic/week instance element
        const shouldAnimate = animateEnter && !prefersReducedMotion();
        courseData.forEach((instance_topicOrWeek) => {
            const el = createDivisionElement(instance_topicOrWeek);
            if (shouldAnimate) playListCardAppear(el);
            container.appendChild(el);
        });
        
        // Render feather icons (including rename icons)
        renderFeatherIcons();
    }

    /**
     * Builds the pencil button that renames a week/topic or a section in place.
     * Clicks are handled by the delegated listener in setupEventListeners, which reads the
     * data attributes; the visible icon is decorative and the hidden text names the target.
     *
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - The section ID, or null for the topic/week title itself
     * @param title - The current title, used in the button's accessible name
     * @returns The rename button
     */
    function createRenameButton(topicOrWeekId: string, itemId: string | null, title: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rename-icon';
        button.setAttribute('data-topic-or-week-instance-id', topicOrWeekId);
        if (itemId) {
            button.setAttribute('data-item-id', itemId);
        }

        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'edit-2');
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'visually-hidden';
        name.textContent = getRenameButtonName(topicOrWeekId, itemId, title);
        button.appendChild(name);

        return button;
    }

    /**
     * Builds the accessible name of a rename button. Section buttons also name their week/topic,
     * because section titles such as "Slides" repeat across weeks.
     *
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - The section ID, or null for the topic/week title itself
     * @param title - The current title of the section or topic/week
     * @returns e.g. "Edit Section Name (Slides) (Week 1)" or "Edit Week Name (Week 1)"
     */
    function getRenameButtonName(topicOrWeekId: string, itemId: string | null, title: string): string {
        if (!itemId) {
            const targetLabel = currentClass.frameType === 'byWeek' ? 'Week' : 'Topic';
            return `Edit ${targetLabel} Name (${title})`;
        }
        return `Edit Section Name${getSectionNameSuffix(topicOrWeekId, title)}`;
    }

    /**
     * Builds the hidden text that section buttons append to their visible label, naming both the
     * section and its week/topic, because section titles such as "Slides" repeat across weeks.
     *
     * @param topicOrWeekId - The ID of the section's topic/week instance
     * @param sectionTitle - The current section title
     * @returns e.g. " (Slides) (Week 1)", or " (Slides)" if the topic/week is not in local data
     */
    function getSectionNameSuffix(topicOrWeekId: string, sectionTitle: string): string {
        const parentTitle = courseData.find((instance) => instance.id === topicOrWeekId)?.title;
        return parentTitle ? ` (${sectionTitle}) (${parentTitle})` : ` (${sectionTitle})`;
    }

    /**
     * Create a topic/week instance (week/topic) section element
     * 
     * @param instance_topicOrWeek the topic/week instance to create an element for
     * @returns the created element
     */
    function createDivisionElement(instance_topicOrWeek: TopicOrWeekInstance): HTMLElement {

        // create the wrapper for the topic/week instance
        const wrapper = document.createElement('li');
        wrapper.className = 'topic-or-week-instance';

        // create the header for the topic/week instance
        const header = document.createElement('div');
        header.className = 'topic-or-week-header';
        header.setAttribute('data-topic-or-week-instance', instance_topicOrWeek.id);
        // Layout is a CSS grid (documents.css) so the opened <details> content can span below

        // create the left side of the header
        // display the title and the completed status of the topic/week instance
        const left = document.createElement('div');
        // Left grows, prevents overflow clipping
        left.style.flex = '1 1 auto';
        left.style.minWidth = '0';
        const title = document.createElement('div');
        title.className = 'topic-or-week-title';
        // Title row as flex so input and buttons align and expand nicely
        title.style.display = 'flex';
        title.style.alignItems = 'center';
        title.style.gap = '8px';
        
        // Create title text span
        const titleText = document.createElement('h2');
        titleText.classList.add('topic-or-week-title-heading');
        // The disclosure <summary> takes its accessible name from this id
        titleText.id = `topic-or-week-heading-${instance_topicOrWeek.id}`;
        // Focus target for scripts (e.g. after a neighbouring week is deleted); not in the tab order
        titleText.tabIndex = -1;
        titleText.textContent = instance_topicOrWeek.title;
        title.appendChild(titleText);
        
        title.appendChild(createRenameButton(instance_topicOrWeek.id, null, instance_topicOrWeek.title));
        
        const status = document.createElement('div');
        status.className = 'completion-status';

        const totalSections = instance_topicOrWeek.items.length;
        status.textContent = totalSections === 1 ? '1 section' : `${totalSections} sections`;

        const meta = document.createElement('div');
        meta.className = 'topic-or-week-meta';
        const metaEdited = document.createElement('div');
        metaEdited.className = 'topic-or-week-meta-line topic-or-week-meta-edited';
        const metaSched = document.createElement('div');
        metaSched.className = 'topic-or-week-meta-line topic-or-week-meta-schedule';
        meta.appendChild(metaEdited);
        meta.appendChild(metaSched);

        left.appendChild(title);
        left.appendChild(status);
        left.appendChild(meta);

        // create the right side of the header (add session, publish status, delete, expand)
        const right = document.createElement('div');
        right.className = 'topic-or-week-status';

        // Add Session badge/button
        const addSessionBadge = document.createElement('button');
        addSessionBadge.type = 'button';
        addSessionBadge.className = 'content-status status-add-session';
        const addSectionIcon = document.createElement('i');
        addSectionIcon.setAttribute('data-feather', 'plus');
        addSectionIcon.setAttribute('aria-hidden', 'true');
        const addSectionText = document.createElement('span');
        addSectionText.className = 'status-text';
        addSectionText.textContent = 'Add Section';
        const addSectionTextVisuallyHidden = document.createElement('span');
        addSectionTextVisuallyHidden.className = 'visually-hidden';
        addSectionTextVisuallyHidden.textContent = ` (${instance_topicOrWeek.title})`;
        addSessionBadge.appendChild(addSectionIcon);
        addSessionBadge.appendChild(addSectionText);
        addSessionBadge.appendChild(addSectionTextVisuallyHidden);
        // Prevent header toggle when clicking Add Section
        addSessionBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            addSection(instance_topicOrWeek);
        });

        const publishBtn = document.createElement('button');
        publishBtn.type = 'button';
        publishBtn.className = 'content-status publish-status-btn status-draft';
        const statusIcon = document.createElement('i');
        statusIcon.setAttribute('data-feather', 'file-text');
        statusIcon.setAttribute('aria-hidden', 'true');
        const statusText = document.createElement('span');
        statusText.className = 'status-text';
        statusText.textContent = 'Draft';
        publishBtn.appendChild(statusIcon);
        publishBtn.appendChild(statusText);
        // Opens the publish dialog for this week's state: commandfor is set in syncTopicOrWeekPublishHeader

        // Disclosure: the <summary> holds only the arrow and is named by the week heading;
        // the week's sections live inside <details> so the browser owns open/closed state
        const disclosure = document.createElement('details');
        disclosure.className = 'topic-or-week-disclosure';
        const disclosureSummary = document.createElement('summary');
        disclosureSummary.className = 'expand-icon';
        disclosureSummary.setAttribute('aria-labelledby', titleText.id);
        // The arrow rotates on its own element: a transform on <summary> would become the
        // containing block for its header-wide click area (::after) and shrink it to the arrow
        const disclosureArrow = document.createElement('span');
        disclosureArrow.className = 'topic-or-week-disclosure-arrow';
        disclosureArrow.textContent = '▼';
        disclosureSummary.appendChild(disclosureArrow);
        disclosure.appendChild(disclosureSummary);

        // Delete instance badge
        const deleteInstanceBadge = document.createElement('button');
        deleteInstanceBadge.type = 'button';
        deleteInstanceBadge.className = 'content-status status-delete-instance';
        deleteInstanceBadge.setAttribute('data-action', 'delete-instance');
        deleteInstanceBadge.setAttribute('data-topic-or-week-instance-id', instance_topicOrWeek.id);
        setDeleteDialogInvoker(deleteInstanceBadge, 'instance');
        const deleteInstanceIcon = document.createElement('i');
        deleteInstanceIcon.setAttribute('data-feather', 'trash-2');
        deleteInstanceIcon.setAttribute('aria-hidden', 'true');
        const deleteInstanceText = document.createElement('span');
        deleteInstanceText.className = 'status-text';
        deleteInstanceText.textContent = 'Delete';
        const deleteInstanceTextVisuallyHidden = document.createElement('span');
        deleteInstanceTextVisuallyHidden.className = 'visually-hidden';
        deleteInstanceTextVisuallyHidden.textContent = ` (${instance_topicOrWeek.title})`;
        deleteInstanceBadge.appendChild(deleteInstanceIcon);
        deleteInstanceBadge.appendChild(deleteInstanceText);
        deleteInstanceBadge.appendChild(deleteInstanceTextVisuallyHidden);

        right.appendChild(addSessionBadge);
        right.appendChild(publishBtn);
        right.appendChild(deleteInstanceBadge);
        right.appendChild(disclosure);

        // create the content for the topic/week instance
        const contentEl = document.createElement('ul');
        contentEl.className = 'topic-or-week-item';
        contentEl.id = `content-topic-or-week-instance-${instance_topicOrWeek.id}`;

        instance_topicOrWeek.items.forEach((content) => {
            const item = buildContentItemDOM(instance_topicOrWeek.id, content);
            contentEl.appendChild(item);
        });
        disclosure.appendChild(contentEl);

        // append the left and right sides to the header
        header.appendChild(left);
        header.appendChild(right);

        wrapper.appendChild(header);
        syncTopicOrWeekPublishHeader(wrapper, instance_topicOrWeek);
        return wrapper;
    }


    /**
     * Update division control panel button labels based on frameType
     * 
     * @param currentClass the currently active class
     */
    function updateDivisionButtonLabels(currentClass: activeCourse): void {
        // Get references to the control panel buttons
        const arrangeOrderBtn = document.getElementById('arrange-order-btn');
        const addDivisionBtn = document.getElementById('add-division-btn');
        const deleteAllDivisionsBtn = document.getElementById('delete-all-divisions-btn');
        
        // Update button text based on frameType
        if (currentClass.frameType === 'byWeek') {
            if (arrangeOrderBtn) {
                arrangeOrderBtn.textContent = 'Arrange Weeks';
            }
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Week';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Weeks';
            }
        } else if (currentClass.frameType === 'byTopic') {
            if (arrangeOrderBtn) {
                arrangeOrderBtn.textContent = 'Arrange Topics';
            }
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Topic';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Topics';
            }
        }
    }

    function applyDivisionOrder(orderedIds: string[]): void {
        const byId = new Map(courseData.map((d) => [d.id, d]));
        courseData = orderedIds
            .map((id) => byId.get(id))
            .filter((instance): instance is TopicOrWeekInstance => instance !== undefined);
        currentClass.topicOrWeekInstances = courseData;
    }

    async function openDivisionReorderForPage(): Promise<void> {
        if (!courseId) {
            await showErrorModal('Error', 'Course ID is missing. Cannot reorder weeks/topics.');
            return;
        }

        const frameType = currentClass.frameType === 'byTopic' ? 'byTopic' : 'byWeek';
        await openDivisionReorderModal({
            courseId,
            frameType,
            instances: courseData.map((instance) => ({
                id: instance.id,
                title: instance.title,
                sectionCount: instance.items?.length ?? 0,
            })),
            onSave: async (result) => {
                if (result.changed) {
                    applyDivisionOrder(result.orderedIds);
                    renderDocumentsPage();
                    showSuccessToastAfterDialogClose(
                        frameType === 'byWeek' ? 'Week order updated.' : 'Topic order updated.'
                    );
                }
            },
        });
    }

    /**
     * Setup all event listeners for the page (delegated, with safety checks)
     * 
     * @returns null    
     */
    function setupEventListeners() {
        const container = document.getElementById('documents-container');
        if (!container) return;

        // Remove any existing event listeners to prevent accumulation
        const existingHandler = (container as any)._documentsClickHandler;
        if (existingHandler) {
            container.removeEventListener('click', existingHandler);
            // console.log('🔧 Removed existing documents click handler'); // 🟢 MEDIUM: Handler management
        }

        // Create the click handler function
        const clickHandler = (event: Event) => {
            const target = event.target as HTMLElement;
            
            // PRIORITY: Handle inline edit controls BEFORE any header toggles
            // a) Pen icon (rename)
            const earlyRenameIcon = target.closest('.rename-icon') as HTMLElement | null;
            if (earlyRenameIcon) {
                event.stopPropagation();
                let topicOrWeekId = earlyRenameIcon.getAttribute('data-topic-or-week-instance-id') || '';
                let itemId = earlyRenameIcon.getAttribute('data-item-id') || '';

                // Derive from nearest containers if attributes are missing (feather replacement case)
                const contentItem = earlyRenameIcon.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-'); // content-item-topicOrWeekId-contentId
                    if (!topicOrWeekId && ids[2]) topicOrWeekId = ids[2];
                    if (!itemId && ids[3]) itemId = ids[3];
                }
                if (!topicOrWeekId) {
                    const header = earlyRenameIcon.closest('.topic-or-week-header') as HTMLElement | null;
                    if (header) topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '';
                }
                if (!topicOrWeekId) return;

                if (itemId) {
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    const item = instance_topicOrWeek?.items.find(i => i.id === itemId);
                    if (item) enterEditMode(topicOrWeekId, itemId, item.title);
                } else {
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    if (instance_topicOrWeek) enterEditMode(topicOrWeekId, null, instance_topicOrWeek.title);
                }
                return; // Avoid header toggle
            }

            // b) OK button during edit
            const earlyOk = target.closest('.edit-ok-button') as HTMLElement | null;
            if (earlyOk) {
                event.stopPropagation();
                const contentItem = earlyOk.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-');
                    const topicOrWeekId = ids[2] || '0';
                    const itemId = ids[3] || '0';
                    const input = contentItem.querySelector('.title-edit-input') as HTMLInputElement | null;
                    if (!input) return;
                    const newTitle = input.value.trim();
                    if (!newTitle) { showErrorModal('Validation Error', 'Section name cannot be empty.'); return; }
                    if (newTitle.length > 100) { showErrorModal('Validation Error', 'Section name is too long (max 100 characters).'); return; }
                    saveTitleChange(topicOrWeekId, itemId, newTitle);
                } 
                
                else {
                    const header = earlyOk.closest('.topic-or-week-header') as HTMLElement | null;
                    if (!header) return;

                    const topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '0';
                    const titleWrap = header.querySelector('.topic-or-week-title') as HTMLElement | null;

                    const input = titleWrap?.querySelector('.title-edit-input') as HTMLInputElement | null;
                    if (!input) return;
                    const newTitle = input.value.trim();


                    if (!newTitle) { showErrorModal('Validation Error', 'Division name cannot be empty.'); return; }
                    if (newTitle.length > 100) { showErrorModal('Validation Error', 'Division name is too long (max 100 characters).'); return; }
                    saveTitleChange(topicOrWeekId, null, newTitle);
                }
                return; // Avoid header toggle
            }

            // c) Cancel button during edit
            const earlyCancel = target.closest('.edit-cancel-button') as HTMLElement | null;
            if (earlyCancel) {
                event.stopPropagation();
                const contentItem = earlyCancel.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-');
                    const topicOrWeekId = ids[2] || '0';
                    const itemId = ids[3] || '0';
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    const item = instance_topicOrWeek?.items.find(i => i.id === itemId);
                    if (instance_topicOrWeek && item) exitEditMode(topicOrWeekId, itemId, item.title);
                } else {
                    const header = earlyCancel.closest('.topic-or-week-header') as HTMLElement | null;
                    if (!header) return;
                    const topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '0';
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    if (instance_topicOrWeek) exitEditMode(topicOrWeekId, null, instance_topicOrWeek.title);
                }
                return; // Avoid header toggle
            }

            // Objectives accordion toggles
            const objectivesHeader = target.closest('.objectives-header') as HTMLElement | null;
            if (objectivesHeader && !objectivesHeader.closest('.struggle-topics')) {
                const editBtn = target.closest('.catalog-edit-btn') as HTMLButtonElement | null;
                if (editBtn) {
                    event.stopPropagation();
                    const topicOrWeekId =
                        editBtn.dataset.week ||
                        objectivesHeader.getAttribute('data-topic-or-week-instance') ||
                        '0';
                    const contentId =
                        editBtn.dataset.content || objectivesHeader.getAttribute('data-content') || '0';
                    if (!topicOrWeekId || !contentId) return;
                    void openLearningObjectivesEditForSection(topicOrWeekId, contentId);
                    return;
                }

                const topicOrWeekId = objectivesHeader.getAttribute('data-topic-or-week-instance') || '0';
                const contentId = objectivesHeader.getAttribute('data-content') || '0';
                if (!topicOrWeekId || !contentId) return;
                toggleObjectives(topicOrWeekId, contentId);
                return;
            }

            const struggleHeader = target.closest('.struggle-topics .objectives-header') as HTMLElement | null;
            if (struggleHeader) {
                // Memory Agent off: section is shaded; mutate actions are disabled (expand still allowed).
                if (struggleHeader.closest('.struggle-topics--inactive')) {
                    const editBtn = target.closest('.catalog-edit-btn') as HTMLButtonElement | null;
                    if (editBtn) {
                        event.stopPropagation();
                        return;
                    }
                }

                const editBtn = target.closest('.catalog-edit-btn') as HTMLButtonElement | null;
                if (editBtn) {
                    event.stopPropagation();
                    const topicOrWeekId =
                        editBtn.dataset.week ||
                        struggleHeader.getAttribute('data-topic-or-week-instance') ||
                        '0';
                    const contentId =
                        editBtn.dataset.content || struggleHeader.getAttribute('data-content') || '0';
                    if (!topicOrWeekId || !contentId) return;
                    void openStruggleTopicsEditForSection(topicOrWeekId, contentId);
                    return;
                }

                const topicOrWeekId = struggleHeader.getAttribute('data-topic-or-week-instance') || '0';
                const contentId = struggleHeader.getAttribute('data-content') || '0';
                if (!topicOrWeekId || !contentId) return;
                toggleStruggleTopics(topicOrWeekId, contentId);
                return;
            }

            // Buttons that open a dialog (Delete Section, Delete document) are handled by the dialog
            if (target.closest('button[commandfor]')) return;

        // Handle rename/edit buttons FIRST (before header clicks)
        // 1) Rename icon click (pen)
        const renameIconEl = target.closest('.rename-icon') as HTMLElement | null;
        if (renameIconEl) {
            event.stopPropagation();
            // Attributes on icon may be lost after feather replacement; derive robustly
            let topicOrWeekId = renameIconEl.getAttribute('data-topic-or-week-instance-id') || '';
            let itemId = renameIconEl.getAttribute('data-item-id') || '';

            // Try to derive from nearest content item if missing
            const contentItem = renameIconEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                    const ids = contentItem.id.split('-'); // content-item-topicOrWeekId-contentId
                    if (!topicOrWeekId && ids[2]) topicOrWeekId = ids[2];
                if (!itemId && ids[3]) itemId = ids[3];
            }

            // For topic/week instance header, derive from closest topic-or-week-header
            if (!topicOrWeekId) {
                const header = renameIconEl.closest('.topic-or-week-header') as HTMLElement | null;
                if (header) {
                    topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '';
                }
            }

            if (!topicOrWeekId) return;

            if (itemId) {
                // Item title edit
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                const item = instance_topicOrWeek?.items.find(i => i.id === itemId);
                if (item) {
                    enterEditMode(topicOrWeekId, itemId, item.title);
                }
            } else {
                // Topic/Week title edit
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                if (instance_topicOrWeek) {
                    enterEditMode(topicOrWeekId, null, instance_topicOrWeek.title);
                }
            }
            return; // Prevent header toggle
        }

        // 2) OK button (check) during edit mode
        const okButtonEl = target.closest('.edit-ok-button') as HTMLElement | null;
        if (okButtonEl) {
            event.stopPropagation();
            // Determine context (division vs item) via closest containers
            const contentItem = okButtonEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                // Item OK
                const ids = contentItem.id.split('-'); // content-item-topicOrWeekId-contentId
                const topicOrWeekId = ids[2] || '0';
                const itemId = ids[3] || '0';
                const input = contentItem.querySelector('.title-edit-input') as HTMLInputElement | null;
                if (!input) return;
                const newTitle = input.value.trim();
                if (!newTitle) { showErrorModal('Validation Error', 'Section name cannot be empty.'); return; }
                if (newTitle.length > 100) { showErrorModal('Validation Error', 'Section name is too long (max 100 characters).'); return; }
                saveTitleChange(topicOrWeekId, itemId, newTitle);
            } else {
                // Topic/Week Instance OK
                const header = okButtonEl.closest('.topic-or-week-header') as HTMLElement | null;
                if (!header) return;
                const topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '0';
                const titleWrap = header.querySelector('.topic-or-week-title') as HTMLElement | null;
                const input = titleWrap?.querySelector('.title-edit-input') as HTMLInputElement | null;
                if (!input) return;
                const newTitle = input.value.trim();
                if (!newTitle) { showErrorModal('Validation Error', 'Topic/Week name cannot be empty.'); return; }
                if (newTitle.length > 100) { showErrorModal('Validation Error', 'Topic/Week name is too long (max 100 characters).'); return; }
                saveTitleChange(topicOrWeekId, null, newTitle);
            }
            return; // Prevent header toggle
        }

        // 3) Cancel button (x) during edit mode
        const cancelButtonEl = target.closest('.edit-cancel-button') as HTMLElement | null;
        if (cancelButtonEl) {
            event.stopPropagation();
            const contentItem = cancelButtonEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                const ids = contentItem.id.split('-');
                const topicOrWeekId = ids[2] || '0';
                const itemId = ids[3] || '0';
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                const item = instance_topicOrWeek?.items.find(i => i.id === itemId);
                if (instance_topicOrWeek && item) {
                    exitEditMode(topicOrWeekId, itemId, item.title);
                }
            } else {
                const header = cancelButtonEl.closest('.topic-or-week-header') as HTMLElement | null;
                if (!header) return;
                const topicOrWeekId = header.getAttribute('data-topic-or-week-instance') || '0';
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                if (instance_topicOrWeek) {
                    exitEditMode(topicOrWeekId, null, instance_topicOrWeek.title);
                }
            }
            return; // Prevent header toggle
        }

        // Handle actions on buttons FIRST (before header clicks)
            const button = target.closest('button') as HTMLButtonElement | null;
            if (button) {
                const action = button.dataset.action;
                if (action) {
                    const inStruggleSection = !!button.closest('.struggle-topics');
                    const topicOrWeekId = button.dataset.week || '0';
                    const contentId = button.dataset.content || '0';

                    if (inStruggleSection && action === 'add') {
                        if (button.closest('.struggle-topics--inactive')) return;
                        addStruggleTopic(topicOrWeekId, contentId);
                        return;
                    }

                    if (!inStruggleSection && action === 'add') {
                        addObjective(topicOrWeekId, contentId);
                        return;
                    }

                }
            }
            
            // Upload area -> open modal
            const uploadArea = target.closest('.upload-area');
            if (uploadArea) {
                const contentItem = uploadArea.closest('.content-item') as HTMLElement | null;
                if (!contentItem) return;
                const ids = contentItem.id.split('-'); // content-item-topicOrWeekId-contentId
                const topicOrWeekId = ids[2] || '0';
                const contentId = ids[3] || '0';
                if (!topicOrWeekId || !contentId) return;
                openUploadModal(topicOrWeekId, contentId, handleUploadMaterial);
                    return;
            }

            // Content item click -> log item info
            const contentItem = target.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                const ids = contentItem.id.split('-'); // content-item-topicOrWeekId-contentId
                const topicOrWeekId = ids[2] || '0';
                const contentId = ids[3] || '0';
                if (!topicOrWeekId || !contentId) return;
                return;
            }
        };

        // Store the handler reference and add the event listener
        (container as any)._documentsClickHandler = clickHandler;
        container.addEventListener('click', clickHandler);

        const existingDblHandler = (container as any)._documentsDblClickHandler;
        if (existingDblHandler) {
            container.removeEventListener('dblclick', existingDblHandler);
        }

        const dblClickHandler = (event: Event) => {
            const target = event.target as HTMLElement;
            if (target.closest('.add-objective, button, input, textarea, select, a')) {
                return;
            }

            const panel = target.closest('.objectives-content.expanded') as HTMLElement | null;
            if (!panel) return;

            const contentItem = panel.closest('.content-item') as HTMLElement | null;
            if (!contentItem) return;

            const ids = contentItem.id.split('-');
            const topicOrWeekId = ids[2] || '0';
            const contentId = ids[3] || '0';
            if (!topicOrWeekId || !contentId) return;

            const kind = panel.dataset.catalogKind;
            if (kind === 'struggle-topics') {
                void openStruggleTopicsEditForSection(topicOrWeekId, contentId);
            } else {
                void openLearningObjectivesEditForSection(topicOrWeekId, contentId);
            }
        };

        (container as any)._documentsDblClickHandler = dblClickHandler;
        container.addEventListener('dblclick', dblClickHandler);
    }

    // ----- Divisions (Week/Topic) management -----
    async function addDivision(): Promise<void> {
        try {
            if (!currentClass) {
                console.error('❌ No current class found for adding division');
                return;
            }

            // Compute next numeric id (server will compute as well; client uses server response)
            const existingNumericIds = courseData
                .map(d => parseInt(d.id, 10))
                .filter(n => !Number.isNaN(n));
            const nextIdNum = (existingNumericIds.length ? Math.max(...existingNumericIds) : 0) + 1;

            if (!courseId) {
                console.error('❌ Cannot add division: courseId is missing');
                await showSimpleErrorModal('Cannot add division: Course ID is missing.', 'Error');
                return;
            }
            // console.log('📡 Making API call to add topic/week instance...'); // 🟢 MEDIUM: API call logging

            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                // Send optional title; server may override to ensure consistency
                body: JSON.stringify({
                    title: currentClass.frameType === 'byWeek' ? `Week ${nextIdNum}` : `Topic ${nextIdNum}`
                })
            });

            // console.log('📡 Add Division API Response status:', response.status, response.statusText); // 🟢 MEDIUM: HTTP status logging

            // Handle unauthorized gracefully
            if (response.status === 401 || response.status === 403) {
                await showSimpleErrorModal('You are not authorized to add divisions. Please sign in as an instructor.', 'Authorization Error');
                return;
            }

            const result = await response.json();

            if (!result.success) {
                await showSimpleErrorModal('Failed to add division: ' + (result.error || 'Unknown error'), 'Add Division Error');
                return;
            }

            const createdInstance: TopicOrWeekInstance = result.data;

            // Update local state
            courseData.push(createdInstance);

            // Append to DOM
            const container = document.getElementById('documents-container');
            if (container) {
                const el = createDivisionElement(createdInstance);
                if (!prefersReducedMotion()) playListCardAppear(el);
                container.appendChild(el);
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                renderFeatherIcons();
                const addedLabel =
                    currentClass.frameType === 'byWeek' ? 'week' : 'topic';
                showSuccessToast(`Added ${addedLabel} "${createdInstance.title}".`);
            }

            // Update control panel labels (if frame type-dependent)
            updateDivisionButtonLabels(currentClass);

            // console.log('✅ Topic/Week instance added successfully'); // 🟢 MEDIUM: Success logging
        } catch (error) {
            console.error('❌ Exception caught while adding topic/week instance:', error);
            await showSimpleErrorModal('An error occurred while adding the topic/week instance. Please try again.', 'Add Topic/Week Instance Error');
        }
    }

    function getDivisionLabel(): 'Week' | 'Topic' {
        return currentClass.frameType === 'byWeek' ? 'Week' : 'Topic';
    }

    /**
     * Words the shared delete dialog for the button opening it and returns the delete to run if
     * the instructor confirms, or `null` (keeping the dialog closed) when the item is gone.
     *
     * Buttons carry: `instance` → `data-topic-or-week-instance-id`; `section` → that plus
     * `data-content-id`; `material` → `data-material-id`, inside its `.content-item`;
     * `all-documents` → nothing more (static buttons in documents-instructor.html).
     */
    function prepareDeleteDialog(invoker: HTMLButtonElement): (() => Promise<void>) | null {
        const kind = invoker.dataset.deleteKind as DeleteDialogKind | undefined;
        let itemType = '';
        let itemName = '';
        let heading: string;
        let message: string;
        let runDelete: () => Promise<void>;

        // 1. Find what the button deletes in the current course data
        if (kind === 'instance') {
            const instance = courseData.find((d) => d.id === invoker.dataset.topicOrWeekInstanceId);
            if (!instance) return null;
            itemType = getDivisionLabel();
            itemName = instance.title;
            runDelete = () => deleteTopicOrWeekInstance(instance);
        } else if (kind === 'section') {
            const topicOrWeekId = invoker.dataset.topicOrWeekInstanceId ?? '';
            const contentId = invoker.dataset.contentId ?? '';
            const section = courseData.find((d) => d.id === topicOrWeekId)?.items.find((c) => c.id === contentId);
            if (!section) return null;
            itemType = 'Section';
            itemName = section.title || 'Section';
            runDelete = () => deleteSection(topicOrWeekId, contentId);
        } else if (kind === 'material') {
            // content-item-{topicOrWeekId}-{contentId}
            const ids = (invoker.closest('.content-item')?.id ?? '').split('-');
            const topicOrWeekId = ids[2] ?? '';
            const contentId = ids[3] ?? '';
            const materialId = invoker.dataset.materialId ?? '';
            const material = courseData
                .find((d) => d.id === topicOrWeekId)
                ?.items.find((c) => c.id === contentId)
                ?.additionalMaterials?.find((m) => m.id === materialId);
            if (!material) return null;
            itemType = 'Document';
            itemName = material.name || 'this document';
            runDelete = () => deleteAdditionalMaterial(topicOrWeekId, contentId, materialId);
        } else if (kind === 'all-documents') {
            runDelete = () => deleteAllDocuments();
        } else {
            return null;
        }

        // 2. Word the dialog; textContent because titles are instructor-entered
        if (kind === 'all-documents') {
            heading = 'Delete All Documents';
            message =
                `Are you sure you want to delete all documents from the RAG database for the course "${currentClass.courseName}"? This action cannot be undone.`;
        } else {
            heading = `Delete ${itemType}`;
            message = `Are you sure you want to delete this ${itemType.toLowerCase()} "${itemName}"? This action cannot be undone.`;
        }
        const headingEl = document.getElementById(`${DELETE_DIALOG_ID}-heading`);
        const messageEl = document.getElementById(`${DELETE_DIALOG_ID}-message`);
        if (headingEl) headingEl.textContent = heading;
        if (messageEl) messageEl.textContent = message;
        return runDelete;
    }

    // Native dialogs: listeners from a previous init are dropped before wiring again
    installInvokerCommandFallback();
    dialogListeners?.abort();
    dialogListeners = new AbortController();
    const dialogSignal = dialogListeners.signal;
    wirePublishDialogs(dialogSignal);

    // Shared delete dialog: opened by commandfor buttons; deletes on close when "Delete" was chosen
    const deleteDialog = document.getElementById(DELETE_DIALOG_ID);
    if (deleteDialog instanceof HTMLDialogElement) {
        const signal = dialogSignal;
        let pendingDelete: (() => Promise<void>) | null = null;

        onDialogOpenCommand(
            deleteDialog,
            (invoker) => {
                pendingDelete = prepareDeleteDialog(invoker);
                return pendingDelete !== null;
            },
            signal
        );
        deleteDialog.addEventListener(
            'close',
            () => {
                const runDelete = pendingDelete;
                pendingDelete = null;
                if (deleteDialog.returnValue === 'delete' && runDelete) {
                    void runDelete();
                }
            },
            { signal }
        );
    }


    // COMMENTED OUT: Add event listener for nuclear clear button
    /*
    const nuclearClearBtn = document.getElementById('nuclear-clear-btn');
    if (nuclearClearBtn) {
        // Remove any existing event listeners to prevent accumulation
        const existingNuclearHandler = (nuclearClearBtn as any)._nuclearHandler;
        if (existingNuclearHandler) {
            nuclearClearBtn.removeEventListener('click', existingNuclearHandler);
            // console.log('🔧 Removed existing nuclear clear handler'); // 🟢 MEDIUM: Handler management
        }

        // Create the nuclear clear handler function
        const nuclearHandler = async () => {
            await nuclearClearDocuments();
        };

        // Store the handler reference and add the event listener
        (nuclearClearBtn as any)._nuclearHandler = nuclearHandler;
        nuclearClearBtn.addEventListener('click', nuclearHandler);
        // console.log('🔧 Added nuclear clear handler'); // 🟢 MEDIUM: Handler management
    }

    // COMMENTED OUT: Add event listener for wipe MongoDB button
    const wipeMongoDBBtn = document.getElementById('wipe-mongodb-btn');
    if (wipeMongoDBBtn) {
        // Remove any existing event listeners to prevent accumulation
        const existingWipeMongoDBHandler = (wipeMongoDBBtn as any)._wipeMongoDBHandler;
        if (existingWipeMongoDBHandler) {
            wipeMongoDBBtn.removeEventListener('click', existingWipeMongoDBHandler);
            // console.log('🔧 Removed existing wipe MongoDB handler'); // 🟢 MEDIUM: Handler management
        }

        // Create the wipe MongoDB handler function
        const wipeMongoDBHandler = async () => {
            await wipeMongoDBCollections();
        };

        // Store the handler reference and add the event listener
        (wipeMongoDBBtn as any)._wipeMongoDBHandler = wipeMongoDBHandler;
        wipeMongoDBBtn.addEventListener('click', wipeMongoDBHandler);
        // console.log('🔧 Added wipe MongoDB handler'); // 🟢 MEDIUM: Handler management
    }
    */

    // Add event listener for arrange order button
    const arrangeOrderBtn = document.getElementById('arrange-order-btn');
    if (arrangeOrderBtn) {
        const existingArrangeHandler = (arrangeOrderBtn as any)._arrangeOrderHandler;
        if (existingArrangeHandler) {
            arrangeOrderBtn.removeEventListener('click', existingArrangeHandler);
        }

        const arrangeOrderHandler = async () => {
            await openDivisionReorderForPage();
        };

        (arrangeOrderBtn as any)._arrangeOrderHandler = arrangeOrderHandler;
        arrangeOrderBtn.addEventListener('click', arrangeOrderHandler);
    }

    // Add event listener for add division (Week/Topic) button
    const addDivisionBtn = document.getElementById('add-division-btn');
    if (addDivisionBtn) {
        const existingAddDivisionHandler = (addDivisionBtn as any)._addDivisionHandler;
        if (existingAddDivisionHandler) {
            addDivisionBtn.removeEventListener('click', existingAddDivisionHandler);
            // console.log('🔧 Removed existing add division handler'); // 🟢 MEDIUM: Handler management
        }

        const addDivisionHandler = async () => {
            await addDivision();
        };

        (addDivisionBtn as any)._addDivisionHandler = addDivisionHandler;
        addDivisionBtn.addEventListener('click', addDivisionHandler);
        // console.log('🔧 Added add division handler'); // 🟢 MEDIUM: Handler management
    }

    // Copy materials from another course (replaces this course's materials)
    const copyMaterialsBtn = document.getElementById('copy-materials-btn');
    if (copyMaterialsBtn) {
        const copyHandler = async () => {
            const result = await runCourseMaterialCopy(currentClass);
            if (!result) return;
            try {
                // Update the shared course object in place: instructor mode holds the same reference.
                Object.assign(currentClass, await fetchCourse(currentClass.id));
            } catch (error) {
                await showSimpleErrorModal('The materials were copied, but the page could not refresh. Reload the page to see them.', 'Reload Needed');
                return;
            }
            courseData = currentClass.topicOrWeekInstances || [];
            updateDivisionButtonLabels(currentClass);
            renderDocumentsPage(true);
        };
        // Drop the listener from an earlier initialization of this page, as the other panel buttons do.
        const previous = (copyMaterialsBtn as any)._copyMaterialsHandler;
        if (previous) {
            copyMaterialsBtn.removeEventListener('click', previous);
        }
        (copyMaterialsBtn as any)._copyMaterialsHandler = copyHandler;
        copyMaterialsBtn.addEventListener('click', copyHandler);
    }

    // Division overflow dropdown (mobile): trigger click on hidden desktop buttons
    const overflowTrigger = document.querySelector('.division-actions-overflow-mobile .overflow-trigger');
    const overflowDropdown = document.querySelector('.division-actions-overflow-mobile .overflow-dropdown');
    const overflowItems = document.querySelectorAll('.overflow-dropdown-item');
    if (overflowTrigger && overflowDropdown) {
        overflowTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            overflowDropdown.classList.toggle('show');
            overflowTrigger.setAttribute('aria-expanded', overflowDropdown.classList.contains('show') ? 'true' : 'false');
        });
        overflowItems.forEach((item) => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                // The menu hides on click, so move focus to its trigger first; a dialog this item
                // opens returns focus there when it closes
                (overflowTrigger as HTMLElement).focus();
                const triggerId = (item as HTMLElement).dataset.triggerId;
                if (triggerId) {
                    const target = document.getElementById(triggerId);
                    target?.click();
                }
                overflowDropdown.classList.remove('show');
                overflowTrigger?.setAttribute('aria-expanded', 'false');
            });
        });
        overflowDropdown.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => {
            overflowDropdown.classList.remove('show');
            overflowTrigger?.setAttribute('aria-expanded', 'false');
        });
    }

    // --- Event Handler Functions ---

    /**
     * Handles the upload of additional materials using DocumentUploadModule
     * 
     * @param material - The material object from the upload modal
     * @returns Promise<void>
     */
    async function handleUploadMaterial(material: any): Promise<{
        success: boolean;
        chunksGenerated?: number;
        generatedStruggleTopics?: InstructorStruggleTopic[];
        skipSuccessModal?: boolean;
        afterSuccess?: () => void | Promise<void>;
    } | void> {
    // console.log('🔍 HANDLE UPLOAD MATERIAL CALLED - FUNCTION STARTED'); // 🟢 MEDIUM: Function start logging
        
        try {
            // Get the topic/week instance and the content item
            // Support both old 'divisionId' and new 'topicOrWeekId' for backward compatibility
            const topicOrWeekId = material.topicOrWeekId || material.divisionId;
            if (!topicOrWeekId) {
                console.error('❌ Topic/Week ID not found in material:', material);
                await showSimpleErrorModal('Topic/Week ID is missing. Please try again.', 'Upload Error');
                return;
            }
            
            const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
            // console.log('  - instance_topicOrWeek found:', !!instance_topicOrWeek); // 🟢 MEDIUM: Data validation
            
            if (!instance_topicOrWeek) {
                console.error('❌ Topic/Week instance not found for topicOrWeekId:', topicOrWeekId);
                await showSimpleErrorModal('Topic/Week instance not found. Please try again.', 'Upload Error');
                return;
            }
            
            const contentItem = instance_topicOrWeek.items.find(c => c.id === material.itemId);
            // console.log('  - contentItem found:', !!contentItem); // 🟢 MEDIUM: Data validation
            
            if (!contentItem) {
                console.error('❌ Content item not found for itemId:', material.itemId, 'in topic/week:', instance_topicOrWeek.title);
                await showSimpleErrorModal('Content item not found. Please try again.', 'Upload Error');
                return;
            }
            if (!contentItem.additionalMaterials) contentItem.additionalMaterials = [];

            // Create the additional material object
            const additionalMaterial: AdditionalMaterialUpload = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: material.name,
                courseName: currentClass.courseName,
                topicOrWeekTitle: instance_topicOrWeek.title,
                itemTitle: contentItem.title,
                sourceType: material.sourceType,
                file: material.file,
                text: material.text,
                fileName: material.fileName,
                date: new Date(),
                // Add these three lines:
    courseId: courseId || '',
    topicOrWeekId: topicOrWeekId,
    itemId: material.itemId
            };

            console.log('🔍 CREATING DOCUMENT UPLOAD MODULE');
            console.log('  - additionalMaterial:', additionalMaterial);
            
            // Use DocumentUploadModule for upload
            const uploadModule = new DocumentUploadModule((progress, stage) => {
                console.log(`Upload progress: ${progress}% - ${stage}`);
                // You could update a progress bar here if needed
            });

            console.log('🔍 CALLING UPLOAD MODULE.uploadDocument');
            const uploadResult: UploadResult = await uploadModule.uploadDocument(additionalMaterial);
            console.log('🔍 UPLOAD RESULT:', uploadResult);
            
            if (!uploadResult.success) {
                console.error(`Upload failed: ${uploadResult.error}`);
                await showSimpleErrorModal(`Failed to upload content: ${uploadResult.error}`, 'Upload Error');
                return;
            }

            if (!uploadResult.document) {
                console.error('Upload succeeded but no document returned');
                await showSimpleErrorModal('Upload succeeded but no document was returned. Please try again.', 'Upload Error');
                return;
            }

            // Add the uploaded document to the content item
            contentItem.additionalMaterials.push(uploadResult.document);

            // Refresh the content item
            refreshContentItem(material.topicOrWeekId, material.itemId);

            console.log('Material uploaded successfully:', uploadResult.document);
            console.log(`Generated ${uploadResult.chunksGenerated} chunks in Qdrant`);

            const generatedCount = uploadResult.generatedStruggleTopics?.length ?? 0;
            const memoryAgentOn = isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent');
            const sectionTitle = `${instance_topicOrWeek.title} / ${contentItem.title}`;
            const reviewTopicOrWeekId = topicOrWeekId;
            const reviewItemId = material.itemId;

            const reviewStruggleTopics =
                memoryAgentOn && generatedCount > 0 && courseId
                    ? async () => {
                              await loadStruggleTopics(reviewTopicOrWeekId, reviewItemId);
                              const refreshedTopics =
                                  courseData
                                      .find((d) => d.id === reviewTopicOrWeekId)
                                      ?.items.find((c) => c.id === reviewItemId)
                                      ?.instructorStruggleTopics ?? uploadResult.generatedStruggleTopics ?? [];

                              await openStruggleTopicsReviewModal({
                                  sectionTitle,
                                  courseId,
                                  topicOrWeekId: reviewTopicOrWeekId,
                                  itemId: reviewItemId,
                                  topics: refreshedTopics,
                                  onSave: async () => {
                                      await loadStruggleTopics(reviewTopicOrWeekId, reviewItemId);
                                      showSuccessToastAfterDialogClose('Struggle topics updated.');
                                  },
                                  returnFocus: () =>
                                      findCatalogEditButton('struggle-topics', reviewTopicOrWeekId, reviewItemId),
                              });
                          }
                    : undefined;
            const uploadedMaterialName = uploadResult.document.name || material.name;
            const chunksGenerated = uploadResult.chunksGenerated ?? 0;

            // The publish prompt reports the upload itself, so it replaces the generic success modal.
            // Struggle-topic review follows only when Memory Agent is on and topics were generated.
            return {
                success: true,
                chunksGenerated: uploadResult.chunksGenerated,
                generatedStruggleTopics: uploadResult.generatedStruggleTopics,
                skipSuccessModal: true,
                afterSuccess: async () => {
                    await promptPublishAfterUpload(instance_topicOrWeek, uploadedMaterialName, chunksGenerated);
                    if (reviewStruggleTopics) {
                        await reviewStruggleTopics();
                    }
                },
            };

        } catch (error) {
            console.error('Error in upload process:', error);
            await showSimpleErrorModal('An error occurred during upload. Please try again.', 'Upload Error');
            throw error; // Re-throw so modal handler can catch it
        }
    }

    /**
     * Toggle the expansion state of the objectives for a content item
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns null
     */
    function setCatalogExpandIconState(icon: HTMLElement, expanded: boolean): void {
        icon.classList.toggle('catalog-expand-icon--expanded', expanded);
    }

    function toggleObjectives(topicOrWeekId: string, contentId: string) {
        const content = document.getElementById(`objectives-${topicOrWeekId}-${contentId}`);
        const icon = document.getElementById(`obj-icon-${topicOrWeekId}-${contentId}`);
        if (!content || !icon) return;
        content.classList.toggle('expanded');
        setCatalogExpandIconState(icon, content.classList.contains('expanded'));
    }

    /**
     * Load learning objectives from database for all content items
     * 
     * @returns Promise<void>
     */
    async function loadAllLearningObjectives(): Promise<void> {
        if (!currentClass) return;

        try {
            // Load learning objectives for each division and content item
            for (const instance_topicOrWeek of courseData) {
                for (const contentItem of instance_topicOrWeek.items) {
                    await loadLearningObjectives(instance_topicOrWeek.id, contentItem.id);
                }
            }
        } catch (error) {
            console.error('Error loading all learning objectives:', error);
        }
    }

    /**
     * Load learning objectives from database for a specific content item
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns Promise<void>
     */
    async function loadLearningObjectives(topicOrWeekId: string, contentId: string): Promise<void> {
        if (!courseId) {
            console.error('❌ [DOCUMENTS] Cannot load learning objectives: courseId is missing');
            return;
        }

        try {
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives`, {
                method: 'GET'
            });
            const result = await response.json();
            
            if (result.success) {
                // Find the topic/week instance and content item
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                const content = instance_topicOrWeek?.items.find(c => c.id === contentId);
                
                if (content) {
                    // Update the learning objectives in local data
                    content.learningObjectives = result.data || [];
                    // Refresh the UI
                    refreshContentItem(topicOrWeekId, contentId);
                }
            } else {
                console.error('Failed to load learning objectives:', result.error);
                await showSimpleErrorModal('Failed to load learning objectives: ' + result.error, 'Load Learning Objectives Error');
            }
        } catch (error) {
            console.error('Error loading learning objectives:', error);
            await showSimpleErrorModal('An error occurred while loading learning objectives. Please try again.', 'Load Learning Objectives Error');
        }
    }

    /**
     * Add a new objective to a content item
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns null
     */
    async function addObjective(topicOrWeekId: string, contentId: string) {
        //START DEBUG LOG : DEBUG-CODE(015)
        console.log('🎯 addObjective called with topicOrWeekId:', topicOrWeekId, 'contentId:', contentId);
        // console.log('🔍 Current class available:', !!currentClass); // 🟢 MEDIUM: Data availability check
        // console.log('🔍 Current class ID:', currentClass?.id); // 🟡 HIGH: Course ID exposure
        // console.log('🔍 Current class name:', currentClass?.courseName); // 🟡 HIGH: Course name exposure
        //END DEBUG LOG : DEBUG-CODE(015)
        
        const objectiveInput = document.getElementById(`new-title-${topicOrWeekId}-${contentId}`) as HTMLInputElement | null;
        if (!objectiveInput) {
            //START DEBUG LOG : DEBUG-CODE(016)
            console.error('❌ Objective input element not found for topicOrWeekId:', topicOrWeekId, 'contentId:', contentId);
            //END DEBUG LOG : DEBUG-CODE(016)
            return;
        }

        // get the learning objective from the input field
        const learningObjective = objectiveInput.value.trim();
        if (!learningObjective) {
            await showSimpleErrorModal('Please fill in the learning objective.', 'Validation Error');
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(017)
        // console.log('📝 Learning objective text:', learningObjective); // 🟡 HIGH: Learning objective content exposure
        //END DEBUG LOG : DEBUG-CODE(017)

        // find the topic/week instance and the content item
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        const content = instance_topicOrWeek?.items.find(c => c.id === contentId);
        if (!content || !currentClass) {
            //START DEBUG LOG : DEBUG-CODE(018)
            console.error('❌ Content or currentClass not found - content:', !!content, 'currentClass:', !!currentClass);
            //END DEBUG LOG : DEBUG-CODE(018)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(019)
        // console.log('✅ Found content item:', content.title, 'currentClass:', currentClass.courseName); // 🟡 HIGH: Content title and course name exposure
        //END DEBUG LOG : DEBUG-CODE(019)

        const newObjective = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            LearningObjective: learningObjective,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            if (!courseId) {
                console.error('❌ Cannot add learning objective: courseId is missing');
                await showSimpleErrorModal('Cannot add learning objective: Course ID is missing.', 'Error');
                return;
            }
            //START DEBUG LOG : DEBUG-CODE(020)
            console.log('📡 Making API call to add learning objective...');
            // console.log('📦 Request body:', { learningObjective: newObjective }); // 🟡 HIGH: Learning objective content exposure
            //END DEBUG LOG : DEBUG-CODE(020)
            
            // Call backend API to add learning objective
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    learningObjective: newObjective
                })
            });

            //START DEBUG LOG : DEBUG-CODE(021)
            console.log('📡 API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(021)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(022)
            //END DEBUG LOG : DEBUG-CODE(022)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(023)
                // console.log('✅ Learning objective added successfully to database'); // 🟢 MEDIUM: Database operation success
                //END DEBUG LOG : DEBUG-CODE(023)
                
                // Clear the input field
                objectiveInput.value = '';
                // Reload learning objectives from database to ensure consistency
                await loadLearningObjectives(topicOrWeekId, contentId);
                // console.log('Learning objective added successfully'); // 🟢 MEDIUM: Operation success
            } else {
                //START DEBUG LOG : DEBUG-CODE(024)
                console.error('❌ API returned error:', result.error);
                //END DEBUG LOG : DEBUG-CODE(024)
                await showSimpleErrorModal('Failed to add learning objective: ' + result.error, 'Add Learning Objective Error');
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(025)
            console.error('❌ Exception caught while adding learning objective:', error);
            //END DEBUG LOG : DEBUG-CODE(025)
            console.error('Error adding learning objective:', error);
            await showSimpleErrorModal('An error occurred while adding the learning objective. Please try again.', 'Add Learning Objective Error');
        }
    }

    /**
     * Refresh a single content item instead of the whole page
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns null
     */
    function refreshContentItem(topicOrWeekId: string, contentId: string) {
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        const content = instance_topicOrWeek?.items.find(c => c.id === contentId);
        const itemContainer = document.getElementById(`content-item-${topicOrWeekId}-${contentId}`);
        if (!instance_topicOrWeek || !content || !itemContainer) return;
        
        // Preserve accordion state before rebuilding
        const objectivesContent = document.getElementById(`objectives-${topicOrWeekId}-${contentId}`);
        const wasExpanded = objectivesContent?.classList.contains('expanded') || false;
        const struggleContent = document.getElementById(`struggle-${topicOrWeekId}-${contentId}`);
        const struggleWasExpanded = struggleContent?.classList.contains('expanded') || false;
        
        // Rebuild via DOM and replace
        const built = buildContentItemDOM(topicOrWeekId, content);
        const parent = itemContainer.parentElement;
        if (!parent) return;
        parent.replaceChild(built, itemContainer);
        
        // Restore accordion state after rebuilding
        if (wasExpanded) {
            const newObjectivesContent = document.getElementById(`objectives-${topicOrWeekId}-${contentId}`);
            const newIcon = document.getElementById(`obj-icon-${topicOrWeekId}-${contentId}`);
            if (newObjectivesContent && newIcon) {
                newObjectivesContent.classList.add('expanded');
                setCatalogExpandIconState(newIcon, true);
            }
        }
        if (struggleWasExpanded) {
            const newStruggleContent = document.getElementById(`struggle-${topicOrWeekId}-${contentId}`);
            const newStruggleIcon = document.getElementById(`struggle-icon-${topicOrWeekId}-${contentId}`);
            if (newStruggleContent && newStruggleIcon) {
                newStruggleContent.classList.add('expanded');
                setCatalogExpandIconState(newStruggleIcon, true);
            }
        }

        // Render Feather icons for the newly replaced content (including rename icon)
        renderFeatherIcons();
    }

    /**
     * Build a content item DOM node (helper for refresh)
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param content the content item to build the DOM for
     * @returns the created element
     */
    function buildContentItemDOM(topicOrWeekId: string, content: TopicOrWeekItem): HTMLElement {
        // Reuse the createContentItemElement pattern used at page render time
        const item = document.createElement('li');
        item.className = 'content-item';
        item.id = `content-item-${topicOrWeekId}-${content.id}`;
        // Header
        const header = document.createElement('div');
        header.className = 'content-header';
        // Layout: make header a flexible row so left area can grow
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';
        const title = document.createElement('div');
        title.className = 'content-title';
        // Title row as flex so input and buttons align and expand nicely
        title.style.display = 'flex';
        title.style.alignItems = 'center';
        title.style.gap = '8px';
        // Left grows, prevents overflow clipping
        title.style.flex = '1 1 auto';
        title.style.minWidth = '0';
        
        // Create title text span
        const titleText = document.createElement('h3');
        titleText.classList.add('content-title-heading');
        titleText.textContent = content.title;
        title.appendChild(titleText);
        
        title.appendChild(createRenameButton(topicOrWeekId, content.id, content.title));
        
        const statusRow = document.createElement('div');
        statusRow.className = 'content-status-row';
        // Right side does not grow
        statusRow.style.flex = '0 0 auto';
        const deleteBadge = document.createElement('button');
        deleteBadge.type = 'button';
        deleteBadge.className = 'content-status status-delete-section';
        deleteBadge.dataset.action = 'delete-section';
        const deleteSectionIcon = document.createElement('i');
        deleteSectionIcon.setAttribute('data-feather', 'trash-2');
        deleteSectionIcon.setAttribute('aria-hidden', 'true');
        const deleteSectionText = document.createElement('span');
        deleteSectionText.className = 'status-text';
        deleteSectionText.textContent = 'Delete Section';
        const deleteSectionTextVisuallyHidden = document.createElement('span');
        deleteSectionTextVisuallyHidden.className = 'visually-hidden';
        deleteSectionTextVisuallyHidden.textContent = getSectionNameSuffix(topicOrWeekId, content.title);
        deleteBadge.appendChild(deleteSectionIcon);
        deleteBadge.appendChild(deleteSectionText);
        deleteBadge.appendChild(deleteSectionTextVisuallyHidden);
        deleteBadge.dataset.topicOrWeekInstanceId = topicOrWeekId;
        deleteBadge.dataset.contentId = content.id;
        setDeleteDialogInvoker(deleteBadge, 'section');
        statusRow.appendChild(deleteBadge);
        header.appendChild(title);
        header.appendChild(statusRow);

        // Objectives + struggle topics (shared catalog sections)
        const catalogTargetName = getSectionNameSuffix(topicOrWeekId, content.title);
        const objectivesContainer = buildCatalogSectionForItem(
            'learning-objectives',
            topicOrWeekId,
            content.id,
            content.learningObjectives.map((obj) => ({
                id: obj.id,
                label: obj.LearningObjective,
            })),
            catalogTargetName
        );

        const struggleContainer = buildCatalogSectionForItem(
            'struggle-topics',
            topicOrWeekId,
            content.id,
            (content.instructorStruggleTopics ?? []).map((topic) => ({
                id: topic.id,
                label: topic.struggleTopic,
            })),
            catalogTargetName
        );
        applyStruggleTopicsInactiveState(struggleContainer);

        // Upload
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'document-upload';
        // A real button so keyboard users can open the upload modal; clicks go through the delegated listener.
        // Accessible name: "Upload your document here (Slides) (Week 1)"
        const uploadArea = document.createElement('button');
        uploadArea.type = 'button';
        uploadArea.className = 'upload-area';
        const uploadText = document.createElement('span');
        uploadText.className = 'upload-text';
        const uploadPlus = document.createElement('span');
        uploadPlus.setAttribute('aria-hidden', 'true');
        uploadPlus.textContent = '+ ';
        uploadText.appendChild(uploadPlus);
        uploadText.appendChild(document.createTextNode('Upload your document here'));
        const uploadTargetName = document.createElement('span');
        uploadTargetName.className = 'visually-hidden';
        uploadTargetName.textContent = getSectionNameSuffix(topicOrWeekId, content.title);
        uploadArea.appendChild(uploadText);
        uploadArea.appendChild(uploadTargetName);
        uploadWrap.appendChild(uploadArea);

        const materialsEl = createAdditionalMaterialsElement(content);

        item.appendChild(header);
        item.appendChild(objectivesContainer);
        // Always show Struggle Topics; shade + hint when Memory Agent is off.
        item.appendChild(struggleContainer);
        item.appendChild(uploadWrap);
        // Append uploaded files list directly under the upload box
        if (materialsEl) item.appendChild(materialsEl);
        return item;
    }

    // ----- Sections management -----
    async function addSection(instance_topicOrWeek: TopicOrWeekInstance) {
        
        if (!currentClass) {
            //START DEBUG LOG : DEBUG-CODE(055)
            console.error('❌ No current class found for adding section');
            //END DEBUG LOG : DEBUG-CODE(055)
            return;
        }

        // Prepare minimal payload; server assigns IDs and timestamps
        const newContentTitle = `New Section ${instance_topicOrWeek.items.length + 1}`;
        const minimalContentPayload = {
            title: newContentTitle,
            learningObjectives: [],
            instructorStruggleTopics: [],
            additionalMaterials: []
        };

        try {
            if (!courseId) {
                await showSimpleErrorModal('Cannot add section: Course ID is missing.', 'Error');
                return;
            }
            //START DEBUG LOG : DEBUG-CODE(056)
            console.log('📡 Making API call to add section...');
            console.log('🌐 API URL:', `/api/courses/${courseId}/topic-or-week-instances/${instance_topicOrWeek.id}/items`);
            console.log('📦 Request body:', { contentItem: minimalContentPayload });
            //END DEBUG LOG : DEBUG-CODE(056)
            
            // Call backend API to add the section
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${instance_topicOrWeek.id}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contentItem: minimalContentPayload
                })
            });

            //START DEBUG LOG : DEBUG-CODE(057)
            console.log('📡 Add Section API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(057)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(058)
            console.log('📡 Add Section API Response body:', result);
            //END DEBUG LOG : DEBUG-CODE(058)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(059)
                console.log('✅ Section added successfully to database');
                //END DEBUG LOG : DEBUG-CODE(059)
                
                // Use server-returned item (ensures IDs and timestamps are consistent)
                const createdItem: TopicOrWeekItem = result.data;
                // Add to local data only after successful database save
                instance_topicOrWeek.items.push(createdItem);
                
                // Append to DOM
                const container = document.getElementById(`content-topic-or-week-instance-${instance_topicOrWeek.id}`);
                if (!container) return;
                const built = buildContentItemDOM(instance_topicOrWeek.id, createdItem);
                container.appendChild(built);
                
                // Render feather icons for the newly added section (including edit title button)
                renderFeatherIcons();
                
                // Update header completion count
                updateDivisionCompletion(instance_topicOrWeek.id);

                const divisionLabel = currentClass.frameType === 'byWeek' ? 'Week' : 'Topic';
                showToast(
                    `A new section was added to ${divisionLabel} "${instance_topicOrWeek.title}".`,
                    3500,
                    'top-right'
                );

                console.log('Section added successfully');
            } else {
                await showSimpleErrorModal('Failed to add section: ' + result.error, 'Add Section Error');
            }
        } catch (error) {
            await showSimpleErrorModal('An error occurred while adding the section. Please try again.', 'Add Section Error');
        }
    }

    /**
     * Deletes a section the instructor has already confirmed in the delete dialog.
     */
    async function deleteSection(topicOrWeekId: string, contentId: string) {
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        if (!instance_topicOrWeek) return;

        // Check if courseId exists
        if (!courseId) {
            await showErrorModal('Error', 'Course ID is missing. Cannot delete section.');
            return;
        }
        
        try {
            // Call backend API to delete the section
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to delete section: ${response.statusText}`);
            }
            
            const resultData = await response.json();
            
            if (resultData.success) {
                // Remove from local state
                instance_topicOrWeek.items = instance_topicOrWeek.items.filter(c => c.id !== contentId);
                
                // Remove from DOM
                const item = document.getElementById(`content-item-${topicOrWeekId}-${contentId}`);
                if (item && item.parentElement) {
                    item.parentElement.removeChild(item);
                }
                
                // Update completion status
                updateDivisionCompletion(topicOrWeekId);
                
                // Show success message (add small delay to ensure previous modal is fully closed)
                setTimeout(async () => {
                    const deletedDocuments = resultData.data?.deletedDocuments;
                    const totalChunksDeleted = resultData.data?.totalChunksDeleted;
                    if (Array.isArray(deletedDocuments) && typeof totalChunksDeleted === 'number') {
                        await showDeletionResultDialog(deletedDocuments, totalChunksDeleted);
                    } else {
                        await showSuccessModal('Success', 'Section deleted successfully.');
                    }
                }, 100);
            } else {
                throw new Error(resultData.error || 'Failed to delete section');
            }
        } catch (error) {
            console.error('Error deleting section:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            await showErrorModal('Error', `Failed to delete section: ${errorMessage}`);
        }
    }

    /**
     * Picks where focus goes once `wrapper` (a week/topic) is removed: the previous week's heading,
     * else the next one's when it was the first week, else the Add button when it was the only week.
     */
    function findFocusTargetAfterRemovingDivision(wrapper: Element): HTMLElement | null {
        const wrappers = Array.from(document.querySelectorAll('#documents-container .topic-or-week-instance'));
        const index = wrappers.indexOf(wrapper);
        const neighbour = index > 0 ? wrappers[index - 1] : wrappers[index + 1];
        return (
            neighbour?.querySelector<HTMLElement>('h2.topic-or-week-title-heading') ??
            document.getElementById('add-division-btn')
        );
    }

    /**
     * Deletes a topic/week instance (week or topic) the instructor has already confirmed in the delete dialog.
     * @param instance_topicOrWeek the topic/week instance to delete
     */
    async function deleteTopicOrWeekInstance(instance_topicOrWeek: TopicOrWeekInstance) {
        const divisionLabel = getDivisionLabel();

        if (!courseId) {
            await showDocumentsMessageDialog('Error', 'Course ID is missing. Cannot delete topic/week instance.');
            return;
        }

        try {
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${instance_topicOrWeek.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to delete ${divisionLabel.toLowerCase()}: ${response.statusText}`);
            }

            const resultData = await response.json();

            if (resultData.success) {
                // Remove from local state
                courseData = courseData.filter(d => d.id !== instance_topicOrWeek.id);
                currentClass.topicOrWeekInstances = courseData;
                currentClass.tilesNumber = courseData.length;

                // Remove from DOM, moving focus off the deleted week's Delete button first
                const header = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${instance_topicOrWeek.id}"]`);
                const wrapper = header?.closest('.topic-or-week-instance');
                const focusTarget = wrapper ? findFocusTargetAfterRemovingDivision(wrapper) : null;
                if (wrapper?.parentElement) {
                    wrapper.parentElement.removeChild(wrapper);
                }
                // Before the success modal opens, so it returns focus here when it closes
                focusTarget?.focus();

                setTimeout(async () => {
                    const deletedDocuments = resultData.data?.deletedDocuments;
                    const totalChunksDeleted = resultData.data?.totalChunksDeleted;
                    if (Array.isArray(deletedDocuments) && typeof totalChunksDeleted === 'number') {
                        await showDeletionResultDialog(deletedDocuments, totalChunksDeleted);
                    } else {
                        await showSuccessModal('Success', `${divisionLabel} deleted successfully.`);
                    }
                }, 100);
            } else {
                throw new Error(resultData.error || `Failed to delete ${divisionLabel.toLowerCase()}`);
            }
        } catch (error) {
            console.error('Error deleting topic/week instance:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            await showDocumentsMessageDialog('Error', `Failed to delete ${divisionLabel.toLowerCase()}: ${errorMessage}`);
        }
    }

    function updateDivisionCompletion(topicOrWeekId: string) {
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        if (!instance_topicOrWeek) return;
        const totalSections = instance_topicOrWeek.items.length;
        const container = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .completion-status`) as HTMLElement | null;
        if (container) container.textContent = totalSections === 1 ? '1 section' : `${totalSections} sections`;
    }

    /**
     * Enter edit mode for a topic/week instance or item title
     * 
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - Optional item ID (if editing an item title)
     * @param currentTitle - The current title text
     */
    /**
     * Finds the title row and its heading (week/topic h2 or section h3) for inline renaming.
     *
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - The section ID, or null for the topic/week title itself
     * @returns The title container and heading, or nulls when not rendered
     */
    function findEditableTitle(
        topicOrWeekId: string,
        itemId: string | null
    ): { titleContainer: HTMLElement | null; heading: HTMLElement | null } {
        const titleContainer = itemId
            ? document.querySelector<HTMLElement>(`#content-item-${topicOrWeekId}-${itemId} .content-title`)
            : document.querySelector<HTMLElement>(
                  `.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .topic-or-week-title`
              );
        const heading = titleContainer?.querySelector<HTMLElement>(
            itemId ? '.content-title-heading' : '.topic-or-week-title-heading'
        ) ?? null;
        return { titleContainer: titleContainer ?? null, heading };
    }

    function enterEditMode(topicOrWeekId: string, itemId: string | null, currentTitle: string): void {
        const { titleContainer, heading } = findEditableTitle(topicOrWeekId, itemId);

        if (!heading || !titleContainer) {
            console.error('Title element not found for edit mode');
            return;
        }
        // Already editing this title
        if (titleContainer.querySelector('.title-edit-input')) return;
        
        // Store original title for cancel
        const originalTitle = currentTitle;
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'title-edit-input';
        // Allow input to expand to available width
        input.style.minWidth = '0';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.flex = '1 1 auto';
        input.style.padding = '4px 8px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';
        input.style.fontSize = 'inherit';
        input.style.fontFamily = 'inherit';
        
        // Find the rename icon and replace with OK/Cancel buttons
        const renameIcon = titleContainer.querySelector('.rename-icon') as HTMLElement | null;
        if (!renameIcon) return;
        
        // Ensure title container is flex so input can grow next to buttons
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '8px';

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'edit-mode-buttons';
        buttonContainer.style.display = 'inline-flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginLeft = '8px';
        buttonContainer.style.alignItems = 'center';
        
        // Create OK button (check icon)
        const okButton = document.createElement('i');
        okButton.setAttribute('data-feather', 'check');
        okButton.className = 'edit-ok-button';
        okButton.style.cursor = 'pointer';
        okButton.style.width = '16px';
        okButton.style.height = '16px';
        okButton.style.color = '#4CAF50';
        okButton.title = 'Save';
        
        // Create Cancel button (x icon)
        const cancelButton = document.createElement('i');
        cancelButton.setAttribute('data-feather', 'x');
        cancelButton.className = 'edit-cancel-button';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.width = '16px';
        cancelButton.style.height = '16px';
        cancelButton.style.color = '#f44336';
        cancelButton.title = 'Cancel';
        
        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);
        
        // Hide the heading rather than replacing it: its id names the week's disclosure
        // <summary> (aria-labelledby), and it is restored with the saved text on exit
        heading.hidden = true;
        heading.after(input);
        renameIcon.replaceWith(buttonContainer);
        
        // Focus and select input text
        input.focus();
        input.select();
        
        // Re-render feather icons. This swaps the <i> buttons for <svg>s, so their clicks are
        // handled by the delegated listener in setupEventListeners, not listeners on these nodes.
        renderFeatherIcons();
        
        const submitTitleEdit = async (): Promise<void> => {
            const newTitle = input.value.trim();
            
            // Validate input
            if (!newTitle) {
                await showErrorModal('Validation Error', `${itemId ? 'Section' : 'Division'} name cannot be empty.`);
                input.focus();
                return;
            }
            
            if (newTitle.length > 100) {
                await showErrorModal('Validation Error', `${itemId ? 'Section' : 'Division'} name is too long (max 100 characters).`);
                input.focus();
                return;
            }
            
            // Only proceed if title changed
            if (newTitle === originalTitle) {
                exitEditMode(topicOrWeekId, itemId, originalTitle);
                return;
            }
            
            // Save the title change
            await saveTitleChange(topicOrWeekId, itemId, newTitle);
        };
        
        // Handle Escape key
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                exitEditMode(topicOrWeekId, itemId, originalTitle);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Handle Enter key
        input.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                await submitTitleEdit();
            }
        });
        
        // Store escape handler on button container for cleanup
        (buttonContainer as any)._escapeHandler = escapeHandler;
    }
    
    /**
     * Exit edit mode and restore display mode
     * 
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - Optional item ID (if editing an item title)
     * @param title - The title to display
     */
    function exitEditMode(topicOrWeekId: string, itemId: string | null, title: string): void {
        const { titleContainer, heading } = findEditableTitle(topicOrWeekId, itemId);
        
        if (!titleContainer || !heading) return;
        
        // Find input field
        const input = titleContainer.querySelector('.title-edit-input') as HTMLInputElement | null;
        const buttonContainer = titleContainer.querySelector('.edit-mode-buttons') as HTMLElement | null;
        
        if (!input || !buttonContainer) return;
        
        // Remove escape handler if exists
        const escapeHandler = (buttonContainer as any)._escapeHandler;
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
        }
        
        // Show the heading with the current title and restore the rename button
        const renameButton = createRenameButton(topicOrWeekId, itemId, title);
        heading.textContent = title;
        heading.hidden = false;
        input.remove();
        buttonContainer.replaceWith(renameButton);
        // The text box that had focus is gone; return keyboard users to the control they started from
        renameButton.focus();

        // Buttons name their target in hidden text, e.g. "Delete (Week 1)"; keep it in step
        const actionRow = itemId
            ? document.querySelector(`#content-item-${topicOrWeekId}-${itemId} .content-status-row`)
            : document.querySelector(
                  `.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .topic-or-week-status`
              );
        if (itemId) {
            const sectionItem = document.getElementById(`content-item-${topicOrWeekId}-${itemId}`);
            if (sectionItem) updateSectionButtonNames(sectionItem, topicOrWeekId, title);
        } else {
            actionRow?.querySelectorAll(':scope > button > .visually-hidden').forEach((hiddenName) => {
                hiddenName.textContent = ` (${title})`;
            });
        }

        // Section buttons name their week/topic, so a week/topic rename must update them too
        if (!itemId) {
            document
                .querySelectorAll<HTMLElement>(
                    `.rename-icon[data-topic-or-week-instance-id="${topicOrWeekId}"][data-item-id]`
                )
                .forEach((sectionButton) => {
                    const sectionId = sectionButton.getAttribute('data-item-id')!;
                    const sectionTitle = sectionButton
                        .closest('.content-title')
                        ?.querySelector('.content-title-heading')?.textContent ?? '';
                    const hiddenName = sectionButton.querySelector('.visually-hidden');
                    if (hiddenName) {
                        hiddenName.textContent = getRenameButtonName(topicOrWeekId, sectionId, sectionTitle);
                    }
                });
            document
                .querySelectorAll<HTMLElement>(
                    `.status-delete-section[data-topic-or-week-instance-id="${topicOrWeekId}"]`
                )
                .forEach((deleteButton) => {
                    const sectionItem = deleteButton.closest<HTMLElement>('.content-item');
                    const sectionTitle = sectionItem?.querySelector('.content-title-heading')?.textContent ?? '';
                    if (sectionItem) updateSectionButtonNames(sectionItem, topicOrWeekId, sectionTitle);
                });
        }

        // Re-render feather icons
        renderFeatherIcons();
    }

    /**
     * Rewrites the " (section) (week)" hidden text on a section's Delete Section and Upload buttons and its
     * Learning Objectives / Struggle Topics Edit buttons after the section or its week/topic is renamed.
     *
     * @param sectionItem - The section's `.content-item` element
     * @param topicOrWeekId - The ID of the section's topic/week instance
     * @param sectionTitle - The current section title
     */
    function updateSectionButtonNames(sectionItem: HTMLElement, topicOrWeekId: string, sectionTitle: string): void {
        const targetName = getSectionNameSuffix(topicOrWeekId, sectionTitle);
        sectionItem
            .querySelectorAll(
                '.content-status-row > button > .visually-hidden, .catalog-edit-btn > .catalog-edit-target, .upload-area > .visually-hidden'
            )
            .forEach((hiddenName) => {
                hiddenName.textContent = targetName;
            });
    }
    
    /**
     * Save title change via API
     * 
     * @param topicOrWeekId - The ID of the topic/week instance
     * @param itemId - Optional item ID (if updating an item title)
     * @param newTitle - The new title to save
     */
    async function saveTitleChange(topicOrWeekId: string, itemId: string | null, newTitle: string): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for saving title');
            return;
        }
        
        // Show loading modal (don't await - it stays open until we close it)
        showTitleUpdateLoadingModal(itemId ? 'Section' : 'Division');
        
        try {
            let response: Response;
            let responseData: any;
            
            if (itemId) {
                // Update item title
                console.log(`📝 Saving item ${itemId} in topic/week instance ${topicOrWeekId} with new title: "${newTitle}"`);
                
                if (!courseId) {
                    throw new Error('Course ID is missing');
                }
                response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${itemId}/title`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        title: newTitle
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to rename section: ${response.statusText}`);
                }
                
                responseData = await response.json();
                
                if (responseData.success) {
                    // Find and update item in local data
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    const item = instance_topicOrWeek?.items.find((i: TopicOrWeekItem) => i.id === itemId);
                    if (item) {
                        // Update title from backend response if available
                        const updatedTitle = responseData.data?.title || newTitle;
                        item.title = updatedTitle;
                        item.itemTitle = updatedTitle;
                        
                        // Close loading modal before exiting edit mode
                        closeModal('success');
                        showSuccessToast(`Topic item title updated to "${updatedTitle}"`, 3000);
                        
                        // Exit edit mode with backend title
                        exitEditMode(topicOrWeekId, itemId, updatedTitle);
                        
                    }
                } else {
                    throw new Error(responseData.error || 'Failed to rename section');
                }
            } else {
                // Update topic/week instance title
                console.log(`📝 Saving topic/week instance ${topicOrWeekId} with new title: "${newTitle}"`);
                
                if (!courseId) {
                    throw new Error('Course ID is missing');
                }
                response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/title`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        title: newTitle
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to rename division: ${response.statusText}`);
                }
                
                responseData = await response.json();
                
                if (responseData.success) {
                    // Find and update topic/week instance in local data
                    const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                    if (instance_topicOrWeek) {
                        // Update title from backend response if available
                        const updatedTitle = responseData.data?.title || newTitle;
                        instance_topicOrWeek.title = updatedTitle;
                        
                        // Close loading modal before exiting edit mode
                        closeModal('success');
                        showSuccessToast(`Topic/week title updated to "${updatedTitle}"`, 3000);
                        
                        // Exit edit mode with backend title
                        exitEditMode(topicOrWeekId, null, updatedTitle);
                        
                        console.log('✅ Topic/Week instance title saved successfully');
                    }
                } else {
                    throw new Error(responseData.error || 'Failed to rename division');
                }
            }
            
        } catch (error) {
            // Close loading modal on error
            closeModal('error');
            
            const errorMessage = error instanceof Error ? error.message : 'Failed to save title. Please try again.';
            await showErrorModal('Error', errorMessage);
            
            // Don't exit edit mode on error - let user try again
        }
    }

    /**
     * Rename a topic/week instance - enters inline edit mode
     * 
     * @param instance_topicOrWeek - The topic/week instance to rename
     */
    async function renameDivision(instance_topicOrWeek: TopicOrWeekInstance): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for renaming topic/week instance');
            return;
        }

        // Enter inline edit mode
        enterEditMode(instance_topicOrWeek.id, null, instance_topicOrWeek.title);
    }

    /**
     * Rename a course item (section) - enters inline edit mode
     * 
     * @param topicOrWeekId - The ID of the topic/week instance containing the item
     * @param item - The item to rename
     */
    async function renameItem(topicOrWeekId: string, item: TopicOrWeekItem): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for renaming item');
            return;
        }

        // Enter inline edit mode
        enterEditMode(topicOrWeekId, item.id, item.title);
    }

    // Make functions globally available for inline event handlers if needed,
    // but the delegated event listener is the primary method.
    // Example: (window as any).toggleWeek = toggleWeek;

    // ----- Additional Materials (front-end only) -----

    /**
     * Build the additional materials container via DOM APIs
     * 
     * @param content the content item to build the DOM for
     * @returns the created element
     */
    function createAdditionalMaterialsElement(content: TopicOrWeekItem): HTMLElement | null {
        const items = content.additionalMaterials || [];
        if (items.length === 0) return null;

        const wrap = document.createElement('div');
        wrap.className = 'additional-materials';

        items.forEach((m: AdditionalMaterial) => {
            const row = document.createElement('div');
            row.className = 'additional-material';
            row.setAttribute('data-material-id', m.id);

            const title = document.createElement('div');
            title.className = 'am-title';
            title.textContent = m.name;

            // Show actual filename if it's a file upload
            const fileName = document.createElement('div');
            fileName.className = 'am-filename';
            if (m.sourceType === 'file' && m.fileName) {
                fileName.textContent = `📄 ${m.fileName}`;
                fileName.style.fontSize = '0.9em';
                fileName.style.color = '#666';
                fileName.style.marginTop = '2px';
            } else {
                fileName.style.display = 'none';
            }

            const meta = document.createElement('div');
            meta.className = 'am-meta';
            meta.textContent = m.sourceType === 'file' ? 'File' : m.sourceType === 'url' ? 'URL' : 'Text';

            const actions = document.createElement('div');
            actions.className = 'am-actions';
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'action-btn delete-btn';
            del.dataset.action = 'delete-material';
            del.dataset.materialId = m.id;
            setDeleteDialogInvoker(del, 'material');
            del.textContent = 'Delete';
            actions.appendChild(del);

            row.appendChild(title);
            row.appendChild(fileName);
            row.appendChild(meta);
            row.appendChild(actions);
            wrap.appendChild(row);
        });

        return wrap;
    }

    /**
     * Deletes an additional material the instructor has already confirmed in the delete dialog.
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param materialId the id of the material to delete
     * @returns null
     */
    async function deleteAdditionalMaterial(
        divisionId: string,
        contentId: string,
        materialId: string
    ) {

        console.log('DEBUG #11');
        // get the division and the content item
        const division = courseData.find(d => d.id === divisionId);
        if (!division) {
            //print the divisionId
            console.log('DEBUG #11.1', divisionId);
            await showSimpleErrorModal('Division not found', 'Delete Material Error');
            return;
        }

        const content = division.items.find(c => c.id === contentId);
        if (!content || !content.additionalMaterials) {
            await showSimpleErrorModal('Content not found', 'Delete Material Error');
            return;
        }

        const material = content.additionalMaterials.find(m => m.id === materialId);

        try {
            // Call backend API to soft delete from MongoDB
            if (!courseId) {
                console.error('❌ Cannot delete material: courseId is missing');
                await showSimpleErrorModal('Cannot delete material: Course ID is missing.', 'Error');
                return;
            }
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${divisionId}/items/${contentId}/materials/${materialId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (!result.success) {
                await showSimpleErrorModal('Failed to delete document: ' + result.error, 'Delete Document Error');
                return;
            }
            
            // Remove from local array after successful backend deletion
            content.additionalMaterials = content.additionalMaterials.filter(m => m.id !== materialId);
            refreshContentItem(divisionId, contentId);
            console.log('DEBUG #12 - Document deleted successfully');

            // Show deletion success modal with chunk count
            const materialName = result.data?.materialName ?? material?.name ?? 'Document';
            const chunksDeleted = result.data?.chunksDeleted ?? 0;
            await showDeletionResultDialog([{ name: materialName, chunksDeleted }], chunksDeleted);
        } catch (error) {
            console.error('Error deleting document:', error);
            await showSimpleErrorModal('An error occurred while deleting the document. Please try again.', 'Delete Document Error');
        }
    }

    /**
     * The section's current Edit button for a catalog (rebuilt whenever the section re-renders),
     * used as the focus target when a catalog dialog closes.
     */
    function findCatalogEditButton(
        kind: 'learning-objectives' | 'struggle-topics',
        topicOrWeekId: string,
        contentId: string
    ): HTMLElement | null {
        return document.querySelector<HTMLElement>(
            `.catalog-edit-btn[data-catalog-kind="${CSS.escape(kind)}"]` +
                `[data-week="${CSS.escape(topicOrWeekId)}"][data-content="${CSS.escape(contentId)}"]`
        );
    }

    async function openLearningObjectivesEditForSection(topicOrWeekId: string, contentId: string): Promise<void> {
        if (!courseId) {
            await showSimpleErrorModal('Cannot edit learning objectives: Course ID is missing.', 'Edit Learning Objectives');
            return;
        }

        const instance_topicOrWeek = courseData.find((d) => d.id === topicOrWeekId);
        const content = instance_topicOrWeek?.items.find((c: TopicOrWeekItem) => c.id === contentId);
        if (!instance_topicOrWeek || !content) {
            await showSimpleErrorModal('Could not find this section.', 'Edit Learning Objectives');
            return;
        }

        await loadLearningObjectives(topicOrWeekId, contentId);
        const objectives = content.learningObjectives ?? [];
        const sectionTitle = `${instance_topicOrWeek.title} / ${content.title}`;

        await openLearningObjectivesEditModal({
            sectionTitle,
            courseId,
            topicOrWeekId,
            itemId: contentId,
            objectives,
            onSave: async () => {
                await loadLearningObjectives(topicOrWeekId, contentId);
                showSuccessToastAfterDialogClose('Learning objectives updated.');
            },
            returnFocus: () => findCatalogEditButton('learning-objectives', topicOrWeekId, contentId),
        });
    }

    async function openStruggleTopicsEditForSection(topicOrWeekId: string, contentId: string): Promise<void> {
        if (!isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent')) return;
        if (!courseId) {
            await showSimpleErrorModal('Cannot edit struggle topics: Course ID is missing.', 'Edit Struggle Topics');
            return;
        }

        const instance_topicOrWeek = courseData.find((d) => d.id === topicOrWeekId);
        const content = instance_topicOrWeek?.items.find((c: TopicOrWeekItem) => c.id === contentId);
        if (!instance_topicOrWeek || !content) {
            await showSimpleErrorModal('Could not find this section.', 'Edit Struggle Topics');
            return;
        }

        await loadStruggleTopics(topicOrWeekId, contentId);
        const topics = content.instructorStruggleTopics ?? [];
        const sectionTitle = `${instance_topicOrWeek.title} / ${content.title}`;

        await openStruggleTopicsReviewModal({
            sectionTitle,
            courseId,
            topicOrWeekId,
            itemId: contentId,
            topics,
            onSave: async () => {
                await loadStruggleTopics(topicOrWeekId, contentId);
                showSuccessToastAfterDialogClose('Struggle topics updated.');
            },
            returnFocus: () => findCatalogEditButton('struggle-topics', topicOrWeekId, contentId),
        });
    }

    /**
     * Toggle the struggle-topics accordion expand/collapse for a content item.
     *
     * @param topicOrWeekId - Topic/week instance id
     * @param contentId - Content item id
     */
    function toggleStruggleTopics(topicOrWeekId: string, contentId: string) {
        const content = document.getElementById(`struggle-${topicOrWeekId}-${contentId}`);
        const icon = document.getElementById(`struggle-icon-${topicOrWeekId}-${contentId}`);
        if (!content || !icon) return;
        content.classList.toggle('expanded');
        setCatalogExpandIconState(icon, content.classList.contains('expanded'));
    }

    /**
     * Shade Struggle Topics when Memory Agent is off; restore interactive controls when on.
     *
     * @param container - Root `.struggle-topics` element from the catalog builder
     */
    function applyStruggleTopicsInactiveState(container: HTMLElement): void {
        const inactive = !isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent');
        const header = container.querySelector('.objectives-header') as HTMLElement | null;
        const twId = header?.getAttribute('data-topic-or-week-instance') || '0';
        const contentId = header?.getAttribute('data-content') || '0';
        const hintId = `struggle-topics-inactive-hint-${twId}-${contentId}`;
        container.classList.toggle('struggle-topics--inactive', inactive);

        if (inactive) {
            container.setAttribute('aria-disabled', 'true');
            container.setAttribute('tabindex', '0');
            container.setAttribute('aria-describedby', hintId);
            if (!document.getElementById(hintId)) {
                const hint = document.createElement('span');
                hint.id = hintId;
                hint.className = 'struggle-topics-inactive-hint';
                hint.setAttribute('role', 'tooltip');
                hint.textContent = 'Memory Agent is deactivated';
                container.appendChild(hint);
            }
            container.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
                btn.disabled = true;
            });
            container.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
                input.disabled = true;
            });
        } else {
            container.removeAttribute('aria-disabled');
            container.removeAttribute('tabindex');
            container.removeAttribute('aria-describedby');
            document.getElementById(hintId)?.remove();
        }
    }

    /**
     * Load instructor struggle topics from the API for every section on the page.
     *
     * @returns Promise<void>
     */
    async function loadAllStruggleTopics(): Promise<void> {
        if (!currentClass) return;
        if (!isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent')) return;
        try {
            for (const instance_topicOrWeek of courseData) {
                for (const contentItem of instance_topicOrWeek.items) {
                    await loadStruggleTopics(instance_topicOrWeek.id, contentItem.id);
                }
            }
        } catch (error) {
            console.error('Error loading all struggle topics:', error);
        }
    }

    /**
     * Load instructor struggle topics for one section and refresh its DOM.
     *
     * GET `/api/courses/:courseId/.../struggle-topics` → updates `content.instructorStruggleTopics`.
     * Quietly skips when Memory Agent is off (403) — catalog already comes from course sync.
     *
     * @param topicOrWeekId - Topic/week instance id
     * @param contentId - Content item id
     * @returns Promise<void>
     */
    async function loadStruggleTopics(topicOrWeekId: string, contentId: string): Promise<void> {
        if (!courseId) return;
        if (!isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent')) return;
        try {
            const response = await fetch(
                `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/struggle-topics`,
                { method: 'GET' }
            );
            const result = await response.json();
            if (result.success) {
                const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
                const content = instance_topicOrWeek?.items.find(c => c.id === contentId);
                if (content) {
                    content.instructorStruggleTopics = result.data || [];
                    refreshContentItem(topicOrWeekId, contentId);
                }
            } else if (response.status === 403 || result.feature === 'memoryAgent') {
                // Feature gated — do not block Documents with an error modal.
                return;
            } else {
                await showSimpleErrorModal('Failed to load struggle topics: ' + result.error, 'Load Struggle Topics Error');
            }
        } catch (error) {
            console.error('Error loading struggle topics:', error);
            await showSimpleErrorModal('An error occurred while loading struggle topics. Please try again.', 'Load Struggle Topics Error');
        }
    }

    /**
     * POST a new instructor struggle topic for a section (instructor catalog label).
     *
     * @param topicOrWeekId - Topic/week instance id
     * @param contentId - Content item id
     */
    async function addStruggleTopic(topicOrWeekId: string, contentId: string) {
        if (!isBrowserCourseFeatureEnabled(currentClass, 'memoryAgent')) return;
        const input = document.getElementById(`new-struggle-${topicOrWeekId}-${contentId}`) as HTMLInputElement | null;
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            await showSimpleErrorModal('Please fill in the struggle topic.', 'Validation Error');
            return;
        }
        const content = courseData.find(d => d.id === topicOrWeekId)?.items.find(c => c.id === contentId);
        if (!content || !currentClass || !courseId) return;

        const newTopic = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            struggleTopic: text,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            const response = await fetch(
                `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/struggle-topics`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ struggleTopic: newTopic })
                }
            );
            const result = await response.json();
            if (result.success) {
                input.value = '';
                await loadStruggleTopics(topicOrWeekId, contentId);
            } else {
                await showSimpleErrorModal('Failed to add struggle topic: ' + result.error, 'Add Struggle Topic Error');
            }
        } catch (error) {
            console.error('Error adding struggle topic:', error);
            await showSimpleErrorModal('An error occurred while adding the struggle topic. Please try again.', 'Add Struggle Topic Error');
        }
    }

    /**
     * Deletes all documents from both MongoDB and Qdrant once the instructor has confirmed in the
     * shared delete dialog.
     */
    async function deleteAllDocuments(): Promise<void> {
        try {
            console.log('🗑️ Starting wipe of all RAG documents for current course...');

            // Use the stored courseId from closure
            if (!courseId) {
                throw new Error('Course ID not found');
            }

            // Call the new wipe-all API endpoint with courseId
            console.log('🔍 WIPE ALL DOCUMENTS - Request Details:');
            console.log('  URL:', `/api/rag/wipe-all?courseId=${courseId}`);
            console.log('  Method: DELETE');
            console.log('  Course ID:', courseId);
            
            const response = await fetch(`/api/rag/wipe-all?courseId=${courseId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin'
            });

            console.log('🔍 WIPE ALL DOCUMENTS - Response Details:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', Object.fromEntries(response.headers.entries()));
            console.log('  Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
                const responseText = await response.text();
                console.log('🔍 WIPE ALL DOCUMENTS - Error Response Body (raw):');
                console.log('  Raw Response:', responseText);
                
                try {
                    const errorData = JSON.parse(responseText);
                    console.log('🔍 WIPE ALL DOCUMENTS - Error Response Body (parsed):');
                    console.log('  Parsed Error:', errorData);
                    throw new Error(errorData.message || errorData.details || `HTTP ${response.status}`);
                } catch (parseError) {
                    console.log('🔍 WIPE ALL DOCUMENTS - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
                }
            }

            const responseText = await response.text();
            console.log('🔍 WIPE ALL DOCUMENTS - Success Response Body (raw):');
            console.log('  Raw Response:', responseText);
            
            let result_data;
            try {
                result_data = JSON.parse(responseText);
                console.log('🔍 WIPE ALL DOCUMENTS - Success Response Body (parsed):');
                console.log('  Parsed Result:', result_data);
            } catch (parseError) {
                console.log('🔍 WIPE ALL DOCUMENTS - JSON Parse Error:');
                console.log('  Parse Error:', parseError);
                throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
            }
            console.log('✅ RAG database wipe completed:', result_data);

            // Clear all additional materials from local data
            courseData.forEach(division => {
                division.items.forEach(item => {
                    item.additionalMaterials = [];
                });
            });

            // Refresh the UI to show empty state
            renderDocumentsPage();

            // Show deletion success modal with document and chunk breakdown
            const deletedDocuments = result_data.data?.deletedDocuments ?? [];
            const totalChunksDeleted = result_data.data?.totalChunksDeleted ?? 0;
            await showDeletionResultDialog(deletedDocuments, totalChunksDeleted);

        } catch (error) {
            console.error('Error deleting all documents:', error);
            await showSimpleErrorModal(`Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`, 'Delete Error');
        }
    }

    // Initial render and listeners after all nested helpers exist (Intl formatters, syncTopicOrWeekPublishHeader, etc.)
    renderDocumentsPage(true);
    setupEventListeners();
}
