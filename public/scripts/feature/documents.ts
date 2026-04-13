

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
    activeCourse
} from '../types.js';
import { uploadRAGContent } from '../services/rag-service.js';
import { DocumentUploadModule } from '../services/document-upload-module.js';
import type { UploadResult } from '../types.js';
import { showConfirmModal, openUploadModal, showSimpleErrorModal, showDeleteConfirmationModal, showUploadLoadingModal, showInputModal, showSuccessModal, showErrorModal, showTitleUpdateLoadingModal, showDeletionSuccessModal, closeModal, showCustomModal } from '../ui/modal-overlay.js';
import { showToast, showSuccessToast } from '../ui/toast-notification.js';
import { renderFeatherIcons } from '../api/api.js';

// Feature flag for scheduled publish - set to true to enable
const SCHEDULED_PUBLISH_ENABLED = true;

function setSchedulePanelError(el: HTMLElement, message: string): void {
    const text = message.trim();
    el.textContent = text;
    el.hidden = text.length === 0;
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

    /**
     * Shared date/time row controls for publish modals (draft schedule and reschedule).
     */
    function createScheduleDateTimeControls(
        tw: TopicOrWeekInstance,
        idSuffix: string
    ): {
        panel: HTMLElement;
        dateInput: HTMLInputElement;
        hourSel: HTMLSelectElement;
        minSel: HTMLSelectElement;
        amPm: HTMLSelectElement;
        errEl: HTMLElement;
    } {
        const panel = document.createElement('div');
        panel.className = 'publish-modal-schedule-panel';

        const dateRow = document.createElement('div');
        dateRow.style.display = 'flex';
        dateRow.style.flexDirection = 'column';
        dateRow.style.gap = '4px';
        const dateLabel = document.createElement('label');
        dateLabel.textContent = 'Date';
        dateLabel.setAttribute('for', `sched-date-${idSuffix}`);
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.id = `sched-date-${idSuffix}`;
        dateInput.className = 'modal-input-field';
        dateInput.style.width = '100%';
        dateRow.appendChild(dateLabel);
        dateRow.appendChild(dateInput);
        panel.appendChild(dateRow);

        const timeRow = document.createElement('div');
        timeRow.style.display = 'flex';
        timeRow.style.flexWrap = 'wrap';
        timeRow.style.alignItems = 'center';
        timeRow.style.gap = '8px';
        const timeLbl = document.createElement('span');
        timeLbl.textContent = 'Time';
        timeRow.appendChild(timeLbl);

        const hourSel = document.createElement('select');
        hourSel.className = 'modal-input-field';
        for (let hr = 1; hr <= 12; hr++) {
            const opt = document.createElement('option');
            opt.value = String(hr);
            opt.textContent = String(hr);
            hourSel.appendChild(opt);
        }

        const minSel = document.createElement('select');
        minSel.className = 'modal-input-field';
        for (let m = 0; m < 60; m++) {
            const opt = document.createElement('option');
            const label = m < 10 ? `0${m}` : String(m);
            opt.value = String(m);
            opt.textContent = label;
            minSel.appendChild(opt);
        }

        const amPm = document.createElement('select');
        amPm.className = 'modal-input-field';
        const amOpt = document.createElement('option');
        amOpt.value = 'am';
        amOpt.textContent = 'AM';
        const pmOpt = document.createElement('option');
        pmOpt.value = 'pm';
        pmOpt.textContent = 'PM';
        amPm.appendChild(amOpt);
        amPm.appendChild(pmOpt);

        timeRow.appendChild(hourSel);
        timeRow.appendChild(document.createTextNode(':'));
        timeRow.appendChild(minSel);
        timeRow.appendChild(amPm);
        panel.appendChild(timeRow);

        const existing = getScheduledDate(tw);
        const base = existing ?? new Date(Date.now() + MIN_SCHEDULE_LEAD_MS + 120_000);
        const y = base.getFullYear();
        const mo = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${mo}-${d}`;
        const h24 = base.getHours();
        const isPmInit = h24 >= 12;
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        hourSel.value = String(h12);
        minSel.value = String(base.getMinutes());
        amPm.value = isPmInit ? 'pm' : 'am';

        const errEl = document.createElement('p');
        errEl.className = 'publish-modal-schedule-error';
        errEl.setAttribute('aria-live', 'polite');
        errEl.style.color = 'var(--color-eng-red, #c00)';
        errEl.style.fontSize = '0.875rem';
        errEl.style.margin = '0';
        setSchedulePanelError(errEl, '');
        panel.appendChild(errEl);

        return { panel, dateInput, hourSel, minSel, amPm, errEl };
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

    function buildPublishSummaryBody(tw: TopicOrWeekInstance, mode: 'publish' | 'unpublish'): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.lineHeight = '1.5';
        const p = document.createElement('p');
        p.style.marginBottom = '0.75rem';
        p.textContent =
            mode === 'publish'
                ? 'Students will see this week or topic in the course when it is published.'
                : 'Students will no longer see this week or topic until you publish it again.';
        wrap.appendChild(p);
        const h = document.createElement('p');
        h.style.fontWeight = '600';
        h.style.marginBottom = '0.35rem';
        h.textContent = tw.title;
        wrap.appendChild(h);
        const ul = document.createElement('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '1.25rem';
        for (const item of tw.items) {
            const li = document.createElement('li');
            li.textContent = item.itemTitle || item.title || 'Untitled section';
            ul.appendChild(li);
        }
        wrap.appendChild(ul);
        return wrap;
    }

    function syncTopicOrWeekPublishHeader(wrapper: HTMLElement, tw: TopicOrWeekInstance): void {
        const pubBtn = wrapper.querySelector('.publish-status-btn') as HTMLButtonElement | null;
        const metaEdited = wrapper.querySelector('.topic-or-week-meta-edited') as HTMLElement | null;
        const metaSched = wrapper.querySelector('.topic-or-week-meta-schedule') as HTMLElement | null;
        if (!pubBtn || !metaEdited || !metaSched) return;

        const published = !!tw.published;
        const sched = getScheduledDate(tw);
        const isScheduled = !published && sched !== null;

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
        showCustomModal({
            type: 'info',
            title: 'Scheduled Publishing Coming Soon',
            content: createComingSoonContent(),
            maxWidth: '480px',
            buttons: [
                { text: 'Got it', type: 'primary', closeOnClick: true }
            ]
        });
    }

    function createComingSoonContent(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '1rem';

        const message = document.createElement('p');
        message.style.margin = '0';
        message.style.lineHeight = '1.6';
        message.textContent = 'We\'re working on adding the ability to schedule when your content publishes. For now, you can publish content immediately.';
        wrapper.appendChild(message);

        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'clock');
        icon.style.width = '24px';
        icon.style.height = '24px';
        icon.style.marginTop = '0.5rem';
        wrapper.appendChild(icon);

        return wrapper;
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

    function updatePublishDraftPrimaryLabel(schedulePanelOpen: boolean, tw: TopicOrWeekInstance): void {
        const primary = document.querySelector('.modal-overlay.show .modal-btn-primary') as HTMLButtonElement | null;
        if (!primary) return;
        if (!schedulePanelOpen) {
            primary.textContent = 'Publish now';
            return;
        }
        primary.textContent = getScheduledDate(tw) ? 'Update schedule' : 'Schedule now';
    }

    /**
     * Modal when a draft topic/week already has a scheduled publish: show summary, reschedule (blue), cancel, close.
     */
    async function openScheduledTopicModal(tw: TopicOrWeekInstance, wrapper: HTMLElement): Promise<void> {
        const sched = getScheduledDate(tw);
        if (!sched) {
            await openPublishDraftModal(tw, wrapper);
            return;
        }

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'publish-draft-modal-body';

        const intro = document.createElement('p');
        intro.style.marginBottom = '0.75rem';
        intro.textContent =
            'This topic/week is scheduled to publish automatically. You can reschedule or cancel the scheduled publish.';
        bodyWrap.appendChild(intro);

        const h = document.createElement('p');
        h.style.fontWeight = '600';
        h.style.marginBottom = '0.35rem';
        h.textContent = tw.title;
        bodyWrap.appendChild(h);

        const summary = document.createElement('p');
        summary.className = 'scheduled-publish-summary-line';
        summary.style.marginBottom = '0.75rem';
        summary.style.fontSize = '0.95rem';
        summary.textContent = `Scheduled for: ${formatScheduleLine(sched)}`;
        bodyWrap.appendChild(summary);

        let schedulePanelOpen = false;
        const rescheduleBtn = document.createElement('button');
        rescheduleBtn.type = 'button';
        rescheduleBtn.className = 'schedule-reschedule-trigger';
        rescheduleBtn.setAttribute('aria-expanded', 'false');
        const rescheduleIcon = document.createElement('i');
        rescheduleIcon.setAttribute('data-feather', 'calendar');
        const rescheduleLabel = document.createElement('span');
        rescheduleLabel.textContent = 'Reschedule';
        rescheduleBtn.appendChild(rescheduleIcon);
        rescheduleBtn.appendChild(rescheduleLabel);
        bodyWrap.appendChild(rescheduleBtn);

        const controls = createScheduleDateTimeControls(tw, `${tw.id}-resched`);
        const { panel, dateInput, hourSel, minSel, amPm, errEl } = controls;

        const applyRow = document.createElement('div');
        applyRow.style.marginTop = '10px';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'schedule-apply-time-btn';
        applyBtn.textContent = 'Apply new time';
        applyRow.appendChild(applyBtn);
        panel.appendChild(applyRow);

        bodyWrap.appendChild(panel);

        rescheduleBtn.addEventListener('click', () => {
            schedulePanelOpen = !schedulePanelOpen;
            rescheduleBtn.setAttribute('aria-expanded', schedulePanelOpen ? 'true' : 'false');
            panel.classList.toggle('publish-modal-schedule-panel--open', schedulePanelOpen);
            if (!schedulePanelOpen) {
                setSchedulePanelError(errEl, '');
            }
            queueMicrotask(() => renderFeatherIcons());
        });

        applyBtn.addEventListener('click', async () => {
            if (!SCHEDULED_PUBLISH_ENABLED) {
                showScheduleComingSoonModal();
                return;
            }
            setSchedulePanelError(errEl, '');
            const when = buildLocalDateFromParts(
                dateInput.value,
                parseInt(hourSel.value, 10),
                parseInt(minSel.value, 10),
                amPm.value === 'pm'
            );
            if (!when) {
                setSchedulePanelError(errEl, 'Please choose a valid date and time.');
                return;
            }
            if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
                setSchedulePanelError(errEl, 'Choose a time at least one minute from now.');
                return;
            }
            const r = await patchTopicSchedule(tw, when.toISOString());
            if (!r.ok) {
                setSchedulePanelError(errEl, r.error || 'Failed to save schedule.');
                return;
            }
            syncTopicOrWeekPublishHeader(wrapper, tw);
            renderFeatherIcons();
            showToast(`Updated schedule to ${formatScheduleLine(when)}`, 3500, 'top-right');
            closeModal('scheduled-topic');
        });

        const modalPromise = showCustomModal({
            type: 'info',
            title: 'Scheduled publish',
            content: bodyWrap,
            maxWidth: '480px',
            buttons: [
                { text: 'Close', type: 'secondary', closeOnClick: true },
                {
                    text: 'Cancel schedule',
                    type: 'danger',
                    closeOnClick: false,
                    action: async () => {
                        const result = await showConfirmModal(
                            'Cancel schedule?',
                            'This removes the scheduled publish time. You can publish or set a new time later.',
                            'Cancel schedule',
                            'Keep'
                        );
                        if (result.action !== 'cancel-schedule') return;
                        const r = await patchTopicSchedule(tw, null);
                        if (!r.ok) {
                            await showSimpleErrorModal(r.error || 'Could not cancel schedule.', 'Schedule');
                            return;
                        }
                        syncTopicOrWeekPublishHeader(wrapper, tw);
                        renderFeatherIcons();
                        showToast('Scheduled publish cancelled.', 2500, 'top-right');
                        closeModal('scheduled-topic');
                    }
                }
            ]
        });

        queueMicrotask(() => renderFeatherIcons());
        await modalPromise;
    }

    async function openPublishDraftModal(tw: TopicOrWeekInstance, wrapper: HTMLElement): Promise<void> {
        let schedulePanelOpen = getScheduledDate(tw) !== null;

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'publish-draft-modal-body';

        const intro = document.createElement('p');
        intro.style.marginBottom = '0.75rem';
        intro.textContent =
            'Students will see this week or topic in the course when it is published.';
        bodyWrap.appendChild(intro);

        const h = document.createElement('p');
        h.style.fontWeight = '600';
        h.style.marginBottom = '0.35rem';
        h.textContent = tw.title;
        bodyWrap.appendChild(h);

        const ul = document.createElement('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '1.25rem';
        for (const item of tw.items) {
            const li = document.createElement('li');
            li.textContent = item.itemTitle || item.title || 'Untitled section';
            ul.appendChild(li);
        }
        bodyWrap.appendChild(ul);

        const scheduleTrigger = document.createElement('button');
        scheduleTrigger.type = 'button';
        scheduleTrigger.className = 'publish-modal-calendar-trigger';
        scheduleTrigger.setAttribute('aria-expanded', schedulePanelOpen ? 'true' : 'false');
        const calIcon = document.createElement('i');
        calIcon.setAttribute('data-feather', 'calendar');
        const calLabel = document.createElement('span');
        calLabel.textContent = 'Schedule for later';
        scheduleTrigger.appendChild(calIcon);
        scheduleTrigger.appendChild(calLabel);
        bodyWrap.appendChild(scheduleTrigger);

        const controlsDraft = createScheduleDateTimeControls(tw, `${tw.id}-draft`);
        const panel = controlsDraft.panel;
        if (schedulePanelOpen) {
            panel.classList.add('publish-modal-schedule-panel--open');
        }
        const { dateInput, hourSel, minSel, amPm, errEl } = controlsDraft;
        bodyWrap.appendChild(panel);

        const initialPrimary =
            schedulePanelOpen ? (getScheduledDate(tw) ? 'Update schedule' : 'Schedule now') : 'Publish now';

        scheduleTrigger.addEventListener('click', () => {
            schedulePanelOpen = !schedulePanelOpen;
            scheduleTrigger.setAttribute('aria-expanded', schedulePanelOpen ? 'true' : 'false');
            panel.classList.toggle('publish-modal-schedule-panel--open', schedulePanelOpen);
            if (!schedulePanelOpen) {
                setSchedulePanelError(errEl, '');
            }
            updatePublishDraftPrimaryLabel(schedulePanelOpen, tw);
        });

        const modalPromise = showCustomModal({
            type: 'info',
            title: 'Publish topic/week?',
            content: bodyWrap,
            maxWidth: '480px',
            buttons: [
                { text: 'Cancel', type: 'secondary', closeOnClick: true },
                {
                    text: initialPrimary,
                    type: 'primary',
                    closeOnClick: false,
                    action: async () => {
                        if (!schedulePanelOpen) {
                            const r = await patchTopicPublished(tw, true);
                            if (!r.ok) {
                                await showSimpleErrorModal(r.error || 'Failed to publish.', 'Publish');
                                return;
                            }
                            syncTopicOrWeekPublishHeader(wrapper, tw);
                            renderFeatherIcons();
                            showToast(`Published "${tw.title}"`, 3000, 'top-right');
                            closeModal('publish-now');
                            return;
                        }

                        // Schedule panel is open - user clicked "Schedule now" button
                        if (!SCHEDULED_PUBLISH_ENABLED) {
                            showScheduleComingSoonModal();
                            return;
                        }

                        setSchedulePanelError(errEl, '');
                        const when = buildLocalDateFromParts(
                            dateInput.value,
                            parseInt(hourSel.value, 10),
                            parseInt(minSel.value, 10),
                            amPm.value === 'pm'
                        );
                        if (!when) {
                            setSchedulePanelError(errEl, 'Please choose a valid date and time.');
                            return;
                        }
                        if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
                            setSchedulePanelError(errEl, 'Choose a time at least one minute from now.');
                            return;
                        }
                        const r = await patchTopicSchedule(tw, when.toISOString());
                        if (!r.ok) {
                            setSchedulePanelError(errEl, r.error || 'Failed to save schedule.');
                            return;
                        }
                        syncTopicOrWeekPublishHeader(wrapper, tw);
                        renderFeatherIcons();
                        showToast(`Scheduled "${tw.title}" to publish ${formatScheduleLine(when)}`, 3500, 'top-right');
                        closeModal('publish-now');
                    }
                }
            ]
        });

        queueMicrotask(() => {
            renderFeatherIcons();
            updatePublishDraftPrimaryLabel(schedulePanelOpen, tw);
        });

        await modalPromise;
    }

    async function openPublishDecisionModal(tw: TopicOrWeekInstance, wrapper: HTMLElement): Promise<void> {
        if (tw.published) {
            const body = buildPublishSummaryBody(tw, 'unpublish');
            const result = await showCustomModal({
                type: 'warning',
                title: 'Move to draft?',
                content: body,
                maxWidth: '480px',
                buttons: [
                    { text: 'Cancel', type: 'secondary', closeOnClick: true },
                    { text: 'Move to draft', type: 'danger', closeOnClick: true }
                ]
            });
            if (result.action !== 'move-to-draft') return;
            const r = await patchTopicPublished(tw, false);
            if (!r.ok) {
                await showSimpleErrorModal(r.error || 'Failed to update.', 'Publish');
                return;
            }
            syncTopicOrWeekPublishHeader(wrapper, tw);
            renderFeatherIcons();
            showToast(`"${tw.title}" is now a draft.`, 2800, 'top-right');
            return;
        }

        if (getScheduledDate(tw)) {
            await openScheduledTopicModal(tw, wrapper);
            return;
        }
        await openPublishDraftModal(tw, wrapper);
    }

    /**
     * Render the documentPage
     * 
     * @returns null
     */
    function renderDocumentsPage() {
        const container = document.getElementById('documents-container');
        if (!container) return;

        //return; //for debugging purposes, do not change this line

        // Clear existing children
        while (container.firstChild) container.removeChild(container.firstChild);

        // Append each topic/week instance element
        courseData.forEach((instance_topicOrWeek) => {
            const el = createDivisionElement(instance_topicOrWeek);
            container.appendChild(el);
        });
        
        // Render feather icons (including rename icons)
        renderFeatherIcons();
    }

    /**
     * Create a topic/week instance (week/topic) section element
     * 
     * @param instance_topicOrWeek the topic/week instance to create an element for
     * @returns the created element
     */
    function createDivisionElement(instance_topicOrWeek: TopicOrWeekInstance): HTMLElement {

        // create the wrapper for the topic/week instance
        const wrapper = document.createElement('div');
        wrapper.className = 'topic-or-week-instance';

        // create the header for the topic/week instance
        const header = document.createElement('div');
        header.className = 'topic-or-week-header';
        header.setAttribute('data-topic-or-week-instance', instance_topicOrWeek.id);
        // Layout: make header a flexible row so left area can grow
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';

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
        const titleText = document.createElement('span');
        titleText.textContent = instance_topicOrWeek.title;
        title.appendChild(titleText);
        
        // Create rename icon (handled via delegated listener in setupEventListeners)
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-topic-or-week-instance-id', instance_topicOrWeek.id);
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        title.appendChild(renameIcon);
        
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
        // Right side does not grow
        right.style.flex = '0 0 auto';

        // Add Session badge/button
        const addSessionBadge = document.createElement('div');
        addSessionBadge.className = 'content-status status-add-session';
        addSessionBadge.setAttribute('title', 'Add Section');
        addSessionBadge.setAttribute('aria-label', 'Add Section');
        const addSectionIcon = document.createElement('i');
        addSectionIcon.setAttribute('data-feather', 'plus');
        const addSectionText = document.createElement('span');
        addSectionText.className = 'status-text';
        addSectionText.textContent = 'Add Section';
        addSessionBadge.appendChild(addSectionIcon);
        addSessionBadge.appendChild(addSectionText);
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
        const statusText = document.createElement('span');
        statusText.className = 'status-text';
        statusText.textContent = 'Draft';
        publishBtn.appendChild(statusIcon);
        publishBtn.appendChild(statusText);
        publishBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void openPublishDecisionModal(instance_topicOrWeek, wrapper);
        });

        // Expand icon (arrow)
        const expandIcon = document.createElement('div');
        expandIcon.className = 'expand-icon';
        expandIcon.id = `icon-${instance_topicOrWeek.id}`;
        expandIcon.textContent = '▼';

        // Delete instance badge
        const deleteInstanceBadge = document.createElement('div');
        deleteInstanceBadge.className = 'content-status status-delete-instance';
        deleteInstanceBadge.setAttribute('data-action', 'delete-instance');
        deleteInstanceBadge.setAttribute('data-topic-or-week-instance-id', instance_topicOrWeek.id);
        deleteInstanceBadge.setAttribute('title', 'Delete');
        deleteInstanceBadge.setAttribute('aria-label', 'Delete');
        const deleteInstanceIcon = document.createElement('i');
        deleteInstanceIcon.setAttribute('data-feather', 'trash-2');
        const deleteInstanceText = document.createElement('span');
        deleteInstanceText.className = 'status-text';
        deleteInstanceText.textContent = 'Delete';
        deleteInstanceBadge.appendChild(deleteInstanceIcon);
        deleteInstanceBadge.appendChild(deleteInstanceText);
        deleteInstanceBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTopicOrWeekInstance(instance_topicOrWeek);
        });

        right.appendChild(addSessionBadge);
        right.appendChild(publishBtn);
        right.appendChild(deleteInstanceBadge);
        right.appendChild(expandIcon);

        // append the left and right sides to the header
        header.appendChild(left);
        header.appendChild(right);

        // create the content for the topic/week instance
        const contentEl = document.createElement('div');
        contentEl.className = 'topic-or-week-item';
        contentEl.id = `content-topic-or-week-instance-${instance_topicOrWeek.id}`;

        //TODO: append all the content of the topic/week instance.
        instance_topicOrWeek.items.forEach((content) => {
            const item = buildContentItemDOM(instance_topicOrWeek.id, content);
            contentEl.appendChild(item);
        });


        // append the header and the content to the wrapper
        wrapper.appendChild(header);
        wrapper.appendChild(contentEl);
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
        const addDivisionBtn = document.getElementById('add-division-btn');
        const deleteAllDivisionsBtn = document.getElementById('delete-all-divisions-btn');
        
        // Update button text based on frameType
        if (currentClass.frameType === 'byWeek') {
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Week';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Weeks';
            }
        } else if (currentClass.frameType === 'byTopic') {
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Topic';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Topics';
            }
        }
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

            // Topic/Week Instance header toggles (accordion)
            const divisionHeader = target.closest('.topic-or-week-header') as HTMLElement | null;
            if (divisionHeader) {
                const topicOrWeekId = divisionHeader.getAttribute('data-topic-or-week-instance') || '0';
                if (!topicOrWeekId) return;
                // console.log('🔍 TOPIC/WEEK INSTANCE CLICKED - Topic/Week ID:', topicOrWeekId); // 🟡 HIGH: Topic/Week ID exposure
                toggleDivision(topicOrWeekId);
                return;
            }

            // Objectives accordion toggles
            const objectivesHeader = target.closest('.objectives-header') as HTMLElement | null;
            if (objectivesHeader) {
                const topicOrWeekId = objectivesHeader.getAttribute('data-topic-or-week-instance') || '0';
                const contentId = objectivesHeader.getAttribute('data-content') || '0';
                if (!topicOrWeekId || !contentId) return;
                toggleObjectives(topicOrWeekId, contentId);
                return;
            }

            // Handle delete section clicks FIRST (before other button handling)
            const deleteSectionElement = target.closest('.status-delete-section') as HTMLElement | null;
            if (deleteSectionElement && deleteSectionElement.dataset.action === 'delete-section') {
                event.stopPropagation();
                //START DEBUG LOG : DEBUG-CODE(014)
                // console.log('🗑️ Delete section clicked via event delegation'); // 🟢 MEDIUM: UI interaction
                //END DEBUG LOG : DEBUG-CODE(014)
                const sectionTopicOrWeekId = deleteSectionElement.dataset.topicOrWeekInstanceId || '0';
                const sectionContentId = deleteSectionElement.dataset.contentId || '0';
                deleteSection(sectionTopicOrWeekId, sectionContentId);
                return; // Prevent further event handling
            }

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
                    const objectiveItem = button.closest('.objective-item');
                    const headerElement = objectiveItem?.querySelector('.objective-header') as HTMLElement | null;
                    const topicOrWeekId = button.dataset.week || headerElement?.dataset.topicOrWeekInstance || '0';
                    const contentId = button.dataset.content || headerElement?.dataset.content || '0';
                    const objectiveIndex = parseInt(headerElement?.dataset.objective || '-1', 10);

                    switch (action) {
                        case 'add':
                            addObjective(topicOrWeekId, contentId);
                            return; // Prevent further event handling
                        case 'edit':
                            event.stopPropagation();
                            editObjective(topicOrWeekId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'delete':
                            event.stopPropagation();
                            deleteObjective(topicOrWeekId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'save':
                            event.stopPropagation();
                            saveObjective(topicOrWeekId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'cancel':
                            event.stopPropagation();
                            cancelEdit(topicOrWeekId, contentId);
                            return; // Prevent further event handling
                        case 'delete-material':
                            event.stopPropagation();
                            // For additional materials, get IDs from the content item container
                            const additionalMaterialRow = button.closest('.additional-material') as HTMLElement | null;
                            const contentItem = button.closest('.content-item') as HTMLElement | null;
                            if (!contentItem) return;
                            
                            const contentItemId = contentItem.id; // content-item-topicOrWeekId-contentId
                            const ids = contentItemId.split('-'); // ['content', 'item', 'topicOrWeekId', 'contentId']
                            const materialTopicOrWeekId = ids[2] || '0';
                            const materialContentId = ids[3] || '0';
                            
                            deleteAdditionalMaterial(materialTopicOrWeekId, materialContentId, button.dataset.materialId || '');
                            return; // Prevent further event handling
                    }
                }
            }

            // Individual objective item toggles
            const objectiveHeader = target.closest('.objective-header') as HTMLElement | null;
            if (objectiveHeader) {
                const topicOrWeekId = objectiveHeader.getAttribute('data-topic-or-week-instance') || '0';
                const contentId = objectiveHeader.getAttribute('data-content') || '0';
                const objectiveIndex = parseInt(objectiveHeader.getAttribute('data-objective') || '-1', 10);
                if (!topicOrWeekId || !contentId || objectiveIndex < 0) return;
                toggleObjectiveItem(topicOrWeekId, contentId, objectiveIndex);
                return;
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
                container.appendChild(el);
                // Re-render icons for newly added elements
                renderFeatherIcons();
            }

            // Update control panel labels (if frame type-dependent)
            updateDivisionButtonLabels(currentClass);

            // console.log('✅ Topic/Week instance added successfully'); // 🟢 MEDIUM: Success logging
        } catch (error) {
            console.error('❌ Exception caught while adding topic/week instance:', error);
            await showSimpleErrorModal('An error occurred while adding the topic/week instance. Please try again.', 'Add Topic/Week Instance Error');
        }
    }

    // Add event listener for delete all documents button
    const deleteAllDocumentsBtn = document.getElementById('delete-all-documents-btn');
    if (deleteAllDocumentsBtn) {
        // Remove any existing event listeners to prevent accumulation
        const existingDeleteHandler = (deleteAllDocumentsBtn as any)._deleteAllHandler;
        if (existingDeleteHandler) {
            deleteAllDocumentsBtn.removeEventListener('click', existingDeleteHandler);
            // console.log('🔧 Removed existing delete all documents handler'); // 🟢 MEDIUM: Handler management
        }

        // Create the delete handler function
        const deleteHandler = async () => {
            await deleteAllDocuments();
        };

        // Store the handler reference and add the event listener
        (deleteAllDocumentsBtn as any)._deleteAllHandler = deleteHandler;
        deleteAllDocumentsBtn.addEventListener('click', deleteHandler);
        // console.log('🔧 Added delete all documents handler'); // 🟢 MEDIUM: Handler management
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
    async function handleUploadMaterial(material: any): Promise<{ success: boolean; chunksGenerated?: number } | void> {
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
            const additionalMaterial: AdditionalMaterial = {
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
            
            // Return success info instead of showing modal here
            // The upload modal handler will show the success modal after closing the upload modal
            return { success: true, chunksGenerated: uploadResult.chunksGenerated };
            
        } catch (error) {
            console.error('Error in upload process:', error);
            await showSimpleErrorModal('An error occurred during upload. Please try again.', 'Upload Error');
            throw error; // Re-throw so modal handler can catch it
        }
    }

    /**
     * Toggle the expansion state of a topic/week instance
     * 
     * @param topicOrWeekId the id of the topic/week instance to toggle
     * @returns null
     */
    function toggleDivision(topicOrWeekId: string) {
        const content = document.getElementById(`content-topic-or-week-instance-${topicOrWeekId}`);
        const icon = document.getElementById(`icon-${topicOrWeekId}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Toggle the expansion state of the objectives for a content item
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns null
     */
    function toggleObjectives(topicOrWeekId: string, contentId: string) {
        const content = document.getElementById(`objectives-${topicOrWeekId}-${contentId}`);
        const icon = document.getElementById(`obj-icon-${topicOrWeekId}-${contentId}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Toggle the expansion state of an objective item
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    function toggleObjectiveItem(topicOrWeekId: string, contentId: string, index: number) {
        const content = document.getElementById(`objective-content-${topicOrWeekId}-${contentId}-${index}`);
        const icon = document.getElementById(`item-icon-${topicOrWeekId}-${contentId}-${index}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
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
     * Edit an learning objective
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    function editObjective(topicOrWeekId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(036)
        // console.log('✏️ editObjective called with topicOrWeekId:', topicOrWeekId, 'contentId:', contentId, 'index:', index); // 🟡 HIGH: Function parameters exposure
        //END DEBUG LOG : DEBUG-CODE(036)
        
        const objective = courseData.find(d => d.id === topicOrWeekId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (!objective) {
            //START DEBUG LOG : DEBUG-CODE(037)
            console.error('❌ Objective not found for edit - topicOrWeekId:', topicOrWeekId, 'contentId:', contentId, 'index:', index);
            //END DEBUG LOG : DEBUG-CODE(037)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(038)
        console.log('✅ Found objective to edit:', objective.LearningObjective);
        //END DEBUG LOG : DEBUG-CODE(038)

        let contentDiv = document.getElementById(`objective-content-${topicOrWeekId}-${contentId}-${index}`) as HTMLElement | null;
        if (!contentDiv) {
            // If the target container doesn't exist (e.g., due to markup changes), create it on demand
            const headerEl = document.querySelector(
                `.objective-header[data-topic-or-week-instance="${topicOrWeekId}"][data-content="${contentId}"][data-objective="${index}"]`
            ) as HTMLElement | null;
            const itemEl = headerEl?.parentElement as HTMLElement | null; // .objective-item
            if (!itemEl) {
                console.error('❌ Could not locate objective item container to create edit region.');
                return;
            }
            contentDiv = document.createElement('div');
            contentDiv.className = 'objective-content';
            contentDiv.id = `objective-content-${topicOrWeekId}-${contentId}-${index}`;
            itemEl.appendChild(contentDiv);
        }

        //START DEBUG LOG : DEBUG-CODE(040)
        console.log('✅ Found content div, creating edit form...');
        //END DEBUG LOG : DEBUG-CODE(040)

        // Clear and build edit form via DOM APIs
        while (contentDiv.firstChild) contentDiv.removeChild(contentDiv.firstChild);

        const form = document.createElement('div');
        form.className = 'edit-form';

        const objectiveInput = document.createElement('input');
        objectiveInput.type = 'text';
        objectiveInput.className = 'edit-input';
        objectiveInput.id = `edit-title-${topicOrWeekId}-${contentId}-${index}`;
        objectiveInput.value = objective.LearningObjective;

        const actions = document.createElement('div');
        actions.className = 'edit-actions';
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-btn';
        saveBtn.dataset.action = 'save';
        saveBtn.dataset.week = String(topicOrWeekId);
        saveBtn.dataset.content = String(contentId);
        saveBtn.dataset.objective = String(index);
        saveBtn.textContent = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.dataset.action = 'cancel';
        cancelBtn.dataset.week = String(topicOrWeekId);
        cancelBtn.dataset.content = String(contentId);
        cancelBtn.textContent = 'Cancel';
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);

        form.appendChild(objectiveInput);
        form.appendChild(actions);

        contentDiv.appendChild(form);
        contentDiv.classList.add('expanded');
        // Ensure visible during editing
        contentDiv.style.display = 'block';
        
        //START DEBUG LOG : DEBUG-CODE(041)
        console.log('✅ Edit form created and added to DOM successfully');
        //END DEBUG LOG : DEBUG-CODE(041)
    }

    /**
     * Save the edited objective
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    async function saveObjective(topicOrWeekId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(026)
        console.log('💾 saveObjective called with topicOrWeekId:', topicOrWeekId, 'contentId:', contentId, 'index:', index);
        //END DEBUG LOG : DEBUG-CODE(026)
        
        const learningObjective = (document.getElementById(`edit-title-${topicOrWeekId}-${contentId}-${index}`) as HTMLInputElement).value.trim();

        if (!learningObjective) {
            await showSimpleErrorModal('Learning objective cannot be empty.', 'Validation Error');
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(027)
        console.log('📝 Updated learning objective text:', learningObjective);
        //END DEBUG LOG : DEBUG-CODE(027)

        const objective = courseData.find(d => d.id === topicOrWeekId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (!objective || !currentClass) {
            //START DEBUG LOG : DEBUG-CODE(028)
            console.error('❌ Objective or currentClass not found - objective:', !!objective, 'currentClass:', !!currentClass);
            //END DEBUG LOG : DEBUG-CODE(028)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(029)
        console.log('✅ Found objective to update:', objective.id, 'currentClass:', currentClass.courseName);
        //END DEBUG LOG : DEBUG-CODE(029)

        const updateData = {
            LearningObjective: learningObjective
        };

        try {
            if (!courseId) {
                console.error('❌ Cannot update learning objective: courseId is missing');
                await showSimpleErrorModal('Cannot update learning objective: Course ID is missing.', 'Error');
                return;
            }
            //START DEBUG LOG : DEBUG-CODE(030)
            console.log('📡 Making API call to update learning objective...');
            console.log('🌐 API URL:', `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives/${objective.id}`);
            console.log('📦 Request body:', { updateData: updateData });
            //END DEBUG LOG : DEBUG-CODE(030)
            
            // Call backend API to update learning objective
            const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives/${objective.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    updateData: updateData
                })
            });

            //START DEBUG LOG : DEBUG-CODE(031)
            console.log('📡 API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(031)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(032)
            console.log('📡 API Response body:', result);
            //END DEBUG LOG : DEBUG-CODE(032)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(033)
                console.log('✅ Learning objective updated successfully in database');
                //END DEBUG LOG : DEBUG-CODE(033)
                
                // Reload learning objectives from database to ensure consistency
                await loadLearningObjectives(topicOrWeekId, contentId);
                console.log('Learning objective updated successfully');
            } else {
                //START DEBUG LOG : DEBUG-CODE(034)
                console.error('❌ API returned error:', result.error);
                //END DEBUG LOG : DEBUG-CODE(034)
                await showSimpleErrorModal('Failed to update learning objective: ' + result.error, 'Update Learning Objective Error');
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(035)
            console.error('❌ Exception caught while updating learning objective:', error);
            //END DEBUG LOG : DEBUG-CODE(035)
            console.error('Error updating learning objective:', error);
            await showSimpleErrorModal('An error occurred while updating the learning objective. Please try again.', 'Update Learning Objective Error');
        }
    }

    /**
     * Cancel the edit of an objective
     * 
     * @param topicOrWeekId the id of the topic/week instance
     * @param contentId the id of the content item
     * @returns null
     */
    function cancelEdit(topicOrWeekId: string, contentId: string) {
        refreshContentItem(topicOrWeekId, contentId);
    }

    async function deleteObjective(topicOrWeekId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(042)
        console.log('🗑️ deleteObjective called with topicOrWeekId:', topicOrWeekId, 'contentId:', contentId, 'index:', index);
        console.log('🔍 Current class available:', !!currentClass);
        console.log('🔍 Current class ID:', currentClass?.id);
        console.log('🔍 Current class name:', currentClass?.courseName);
        //END DEBUG LOG : DEBUG-CODE(042)
        
        // Get the objective to show its name in confirmation
        const content = courseData.find(d => d.id === topicOrWeekId)
                                        ?.items.find(c => c.id === contentId);
        const objective = content?.learningObjectives[index];
        
        if (!objective) {
            //START DEBUG LOG : DEBUG-CODE(043)
            console.error('❌ Objective not found for deletion - topicOrWeekId:', topicOrWeekId, 'contentId:', contentId, 'index:', index);
            //END DEBUG LOG : DEBUG-CODE(043)
            return;
        }
        
        //START DEBUG LOG : DEBUG-CODE(044)
        console.log('✅ Found objective to delete:', objective.LearningObjective);
        //END DEBUG LOG : DEBUG-CODE(044)
        
        // Show confirmation modal
        const result = await showDeleteConfirmationModal(
            'Learning Objective',
            objective?.LearningObjective
        );
        
        //START DEBUG LOG : DEBUG-CODE(045)
        console.log('📋 Delete confirmation result:', result);
        //END DEBUG LOG : DEBUG-CODE(045)

        if (result.action === 'delete') {
            //START DEBUG LOG : DEBUG-CODE(046)
            console.log('✅ User confirmed deletion, proceeding with API call...');
            //END DEBUG LOG : DEBUG-CODE(046)
            
            const content = courseData.find(d => d.id === topicOrWeekId)
                                        ?.items.find(c => c.id === contentId);
            const objective = content?.learningObjectives[index];
            
            if (!content || !objective || !currentClass) {
                //START DEBUG LOG : DEBUG-CODE(047)
                console.error('❌ Missing data for deletion - content:', !!content, 'objective:', !!objective, 'currentClass:', !!currentClass);
                //END DEBUG LOG : DEBUG-CODE(047)
                return;
            }

            try {
                if (!courseId) {
                    console.error('❌ Cannot delete learning objective: courseId is missing');
                    await showSimpleErrorModal('Cannot delete learning objective: Course ID is missing.', 'Error');
                    return;
                }
                //START DEBUG LOG : DEBUG-CODE(048)
                console.log('📡 Making API call to delete learning objective...');
                console.log('🌐 API URL:', `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives/${objective.id}`);
                //END DEBUG LOG : DEBUG-CODE(048)
                
                // Call backend API to delete learning objective
                const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives/${objective.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                //START DEBUG LOG : DEBUG-CODE(049)
                console.log('📡 Delete API Response status:', response.status, response.statusText);
                //END DEBUG LOG : DEBUG-CODE(049)

                const result = await response.json();
                
                //START DEBUG LOG : DEBUG-CODE(050)
                console.log('📡 Delete API Response body:', result);
                //END DEBUG LOG : DEBUG-CODE(050)
                
                if (result.success) {
                    //START DEBUG LOG : DEBUG-CODE(051)
                    console.log('✅ Learning objective deleted successfully from database');
                    //END DEBUG LOG : DEBUG-CODE(051)
                    
                    // Reload learning objectives from database to ensure consistency
                    await loadLearningObjectives(topicOrWeekId, contentId);
                    console.log('Learning objective deleted successfully');
                } else {
                    //START DEBUG LOG : DEBUG-CODE(052)
                    console.error('❌ API returned error:', result.error);
                    //END DEBUG LOG : DEBUG-CODE(052)
                    await showSimpleErrorModal('Failed to delete learning objective: ' + result.error, 'Delete Learning Objective Error');
                }
            } catch (error) {
                //START DEBUG LOG : DEBUG-CODE(053)
                console.error('❌ Exception caught while deleting learning objective:', error);
                //END DEBUG LOG : DEBUG-CODE(053)
                console.error('Error deleting learning objective:', error);
                await showSimpleErrorModal('An error occurred while deleting the learning objective. Please try again.', 'Delete Learning Objective Error');
            }
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
                newIcon.style.transform = 'rotate(180deg)';
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
        const item = document.createElement('div');
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
        const titleText = document.createElement('span');
        titleText.textContent = content.title;
        title.appendChild(titleText);
        
        // Create rename icon (handled via delegated listener in setupEventListeners)
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-topic-or-week-instance-id', topicOrWeekId);
        renameIcon.setAttribute('data-item-id', content.id);
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        title.appendChild(renameIcon);
        
        const statusRow = document.createElement('div');
        statusRow.className = 'content-status-row';
        // Right side does not grow
        statusRow.style.flex = '0 0 auto';
        const deleteBadge = document.createElement('div');
        deleteBadge.className = 'content-status status-delete-section';
        deleteBadge.setAttribute('title', 'Delete Section');
        deleteBadge.setAttribute('aria-label', 'Delete Section');
        deleteBadge.dataset.action = 'delete-section';
        const deleteSectionIcon = document.createElement('i');
        deleteSectionIcon.setAttribute('data-feather', 'trash-2');
        const deleteSectionText = document.createElement('span');
        deleteSectionText.className = 'status-text';
        deleteSectionText.textContent = 'Delete Section';
        deleteBadge.appendChild(deleteSectionIcon);
        deleteBadge.appendChild(deleteSectionText);
        deleteBadge.dataset.topicOrWeekInstanceId = topicOrWeekId;
        deleteBadge.dataset.contentId = content.id;
        statusRow.appendChild(deleteBadge);
        header.appendChild(title);
        header.appendChild(statusRow);

        // Delete badge will be handled by event delegation in setupEventListeners()
        // No direct event listener needed - prevents double event listeners

        // Objectives
        const objectivesContainer = document.createElement('div');
        objectivesContainer.className = 'learning-objectives';

        // create the accordion for the objectives
        const accordion = document.createElement('div');
        accordion.className = 'objectives-accordion';

        // create the header for the objectives
        const headerRow = document.createElement('div');
        headerRow.className = 'objectives-header';
        headerRow.setAttribute('data-topic-or-week-instance', String(topicOrWeekId));
        headerRow.setAttribute('data-content', String(content.id));

        // create the title for the objectives
        const headerTitle = document.createElement('div');
        headerTitle.className = 'objectives-title';
        headerTitle.textContent = 'Learning Objectives';

        // create the count for the objectives
        const headerCount = document.createElement('div');
        headerCount.className = 'objectives-count';
        const countSpan = document.createElement('span');
        countSpan.id = `count-${topicOrWeekId}-${content.id}`;
        countSpan.textContent = String(content.learningObjectives.length);

        // create the expand icon for the objectives
        const countText = document.createTextNode(' objectives ');
        const expandSpan = document.createElement('span');
        expandSpan.className = 'expand-icon';
        expandSpan.id = `obj-icon-${topicOrWeekId}-${content.id}`;
        expandSpan.textContent = '▼';

        // append the count, text, and expand icon to the header
        headerCount.appendChild(countSpan);
        headerCount.appendChild(countText);
        headerCount.appendChild(expandSpan);

        // append the title and count to the header
        headerRow.appendChild(headerTitle);
        headerRow.appendChild(headerCount);

        // create the content for the objectives
        const objectivesContent = document.createElement('div');
        objectivesContent.className = 'objectives-content';
        objectivesContent.id = `objectives-${topicOrWeekId}-${content.id}`;
        objectivesContent.appendChild(createObjectivesListElement(topicOrWeekId, content.id));

        // Add event listener for delete badge
        deleteBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSection(topicOrWeekId, content.id);
        });
        accordion.appendChild(headerRow);
        accordion.appendChild(objectivesContent);
        objectivesContainer.appendChild(accordion);

        // Upload
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'document-upload';
        const uploadArea = document.createElement('div');
        uploadArea.className = 'upload-area';
        const uploadText = document.createElement('div');
        uploadText.className = 'upload-text';
        uploadText.textContent = ' + Upload your document here';
        uploadArea.appendChild(uploadText);
        uploadWrap.appendChild(uploadArea);

        const materialsEl = createAdditionalMaterialsElement(content);

        item.appendChild(header);
        item.appendChild(objectivesContainer);
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

    async function deleteSection(topicOrWeekId: string, contentId: string) {
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        if (!instance_topicOrWeek) return;
        
        const content = instance_topicOrWeek.items.find(c => c.id === contentId);
        if (!content) return;
        
        // Show confirmation modal
        const result = await showDeleteConfirmationModal('Section', content.title || 'Section');
        
        // If user cancelled, don't proceed
        if (result.action !== 'delete') {
            return;
        }
        
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
                        await showDeletionSuccessModal(deletedDocuments, totalChunksDeleted);
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
     * Delete a topic/week instance (week or topic) after confirmation
     * @param instance_topicOrWeek the topic/week instance to delete
     */
    async function deleteTopicOrWeekInstance(instance_topicOrWeek: TopicOrWeekInstance) {
        const divisionLabel = currentClass.frameType === 'byWeek' ? 'Week' : 'Topic';
        const result = await showDeleteConfirmationModal(divisionLabel, instance_topicOrWeek.title);

        if (result.action !== 'delete') {
            return;
        }

        if (!courseId) {
            await showErrorModal('Error', 'Course ID is missing. Cannot delete topic/week instance.');
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

                // Remove from DOM
                const header = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${instance_topicOrWeek.id}"]`);
                const wrapper = header?.closest('.topic-or-week-instance');
                if (wrapper?.parentElement) {
                    wrapper.parentElement.removeChild(wrapper);
                }

                setTimeout(async () => {
                    const deletedDocuments = resultData.data?.deletedDocuments;
                    const totalChunksDeleted = resultData.data?.totalChunksDeleted;
                    if (Array.isArray(deletedDocuments) && typeof totalChunksDeleted === 'number') {
                        await showDeletionSuccessModal(deletedDocuments, totalChunksDeleted);
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
            await showErrorModal('Error', `Failed to delete ${divisionLabel.toLowerCase()}: ${errorMessage}`);
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
    function enterEditMode(topicOrWeekId: string, itemId: string | null, currentTitle: string): void {
        let titleSpan: HTMLElement | null = null;
        let titleContainer: HTMLElement | null = null;
        
        if (itemId) {
            // Editing an item title
            titleSpan = document.querySelector(`#content-item-${topicOrWeekId}-${itemId} .content-title span`) as HTMLElement | null;
            titleContainer = document.querySelector(`#content-item-${topicOrWeekId}-${itemId} .content-title`) as HTMLElement | null;
        } else {
            // Editing a topic/week instance title
            titleSpan = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .topic-or-week-title span`) as HTMLElement | null;
            titleContainer = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .topic-or-week-title`) as HTMLElement | null;
        }
        
        if (!titleSpan || !titleContainer) {
            console.error('Title element not found for edit mode');
            return;
        }
        
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
        
        // Replace span with input
        titleSpan.replaceWith(input);
        renameIcon.replaceWith(buttonContainer);
        
        // Focus and select input text
        input.focus();
        input.select();
        
        // Re-render feather icons
        renderFeatherIcons();
        
        // Handle OK button click
        okButton.addEventListener('click', async (e) => {
            e.stopPropagation();
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
        });
        
        // Handle Cancel button click
        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            exitEditMode(topicOrWeekId, itemId, originalTitle);
        });
        
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
                okButton.click();
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
        let titleContainer: HTMLElement | null = null;
        
        if (itemId) {
            titleContainer = document.querySelector(`#content-item-${topicOrWeekId}-${itemId} .content-title`) as HTMLElement | null;
        } else {
            titleContainer = document.querySelector(`.topic-or-week-header[data-topic-or-week-instance="${topicOrWeekId}"] .topic-or-week-title`) as HTMLElement | null;
        }
        
        if (!titleContainer) return;
        
        // Find input field
        const input = titleContainer.querySelector('.title-edit-input') as HTMLInputElement | null;
        const buttonContainer = titleContainer.querySelector('.edit-mode-buttons') as HTMLElement | null;
        
        if (!input || !buttonContainer) return;
        
        // Remove escape handler if exists
        const escapeHandler = (buttonContainer as any)._escapeHandler;
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
        }
        
        // Create title span
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        
        // Create rename icon
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-topic-or-week-instance-id', topicOrWeekId);
        if (itemId) {
            renameIcon.setAttribute('data-item-id', itemId);
        }
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        
        // Replace input with span and restore rename icon (handled via delegated listener)
        input.replaceWith(titleSpan);
        buttonContainer.replaceWith(renameIcon);
        
        // Re-render feather icons
        renderFeatherIcons();
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
            del.className = 'action-btn delete-btn';
            del.dataset.action = 'delete-material';
            del.dataset.materialId = m.id;
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
     * Delete an additional material
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

        // Get the material to show its name in confirmation
        const material = content.additionalMaterials.find(m => m.id === materialId);
        const result = await showDeleteConfirmationModal(
            'Document',
            material?.name || 'this document'
        );
        
        if (result.action === 'delete') {
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
                await showDeletionSuccessModal([{ name: materialName, chunksDeleted }], chunksDeleted);
            } catch (error) {
                console.error('Error deleting document:', error);
                await showSimpleErrorModal('An error occurred while deleting the document. Please try again.', 'Delete Document Error');
            }
        } else {
            console.log('🗑️ Document deletion cancelled by user');
        }
    }

    // Build the Objectives list + Add form via DOM APIs
    function createObjectivesListElement(topicOrWeekId: string, contentId: string): HTMLElement {

        // create the wrapper for the objectives
        const wrapper = document.createElement('div');
        const instance_topicOrWeek = courseData.find(d => d.id === topicOrWeekId);
        const content = instance_topicOrWeek?.items.find((c: TopicOrWeekItem) => c.id === contentId);
        if (!content) return wrapper;

        // create the list of objectives
        content.learningObjectives.forEach((obj, index) => {
            const item = document.createElement('div');
            item.className = 'objective-item';

            // create the header for the objective
            const header = document.createElement('div');
            header.className = 'objective-header';
            header.setAttribute('data-topic-or-week-instance', String(topicOrWeekId));
            header.setAttribute('data-content', String(contentId));
            header.setAttribute('data-objective', String(index));

            // create the title for the objective
            const title = document.createElement('div');
            title.className = 'objective-title';
            title.textContent = obj.LearningObjective;

            const actions = document.createElement('div');
            actions.className = 'objective-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit-btn';
            editBtn.dataset.action = 'edit';
            editBtn.textContent = 'Edit';

            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn delete-btn';
            delBtn.dataset.action = 'delete';
            delBtn.textContent = 'Delete';

            const expand = document.createElement('span');
            expand.className = 'expand-icon';
            expand.id = `item-icon-${topicOrWeekId}-${contentId}-${index}`;
            expand.textContent = '▼';

            // append the edit, delete, and expand icon to the actions
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            actions.appendChild(expand);

            // append the title and actions to the header
            header.appendChild(title);
            header.appendChild(actions);

            // append the header to the item
            item.appendChild(header);
            wrapper.appendChild(item);
        });

        // create the wrapper for the add objective form
        const addWrap = document.createElement('div');
        addWrap.className = 'add-objective';

        // create the form for the add objective
        const addForm = document.createElement('div');
        addForm.className = 'add-objective-form';

        // create the objective label for the add objective form
        const objectiveLabel = document.createElement('div');
        objectiveLabel.className = 'input-label';
        objectiveLabel.textContent = 'Learning Objective:';

        // create the objective input for the add objective form
        const objectiveInput = document.createElement('input');
        objectiveInput.type = 'text';
        objectiveInput.className = 'objective-title-input';
        objectiveInput.id = `new-title-${topicOrWeekId}-${contentId}`;
        objectiveInput.placeholder = 'Enter the learning objective...';

        // create the add button for the add objective form
        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.dataset.action = 'add';
        addBtn.dataset.week = String(topicOrWeekId);
        addBtn.dataset.content = String(contentId);
        addBtn.textContent = 'Add Objective';

        // append the objective input and add button to the form
        addForm.appendChild(objectiveLabel);
        addForm.appendChild(objectiveInput);
        addForm.appendChild(addBtn);
        addWrap.appendChild(addForm);
        wrapper.appendChild(addWrap);

        return wrapper;
    }

    /**
     * Delete all documents from both MongoDB and Qdrant
     */
    async function deleteAllDocuments(): Promise<void> {
        try {
            // Show confirmation modal
            const result = await showDeleteConfirmationModal(
                'All Documents',
                `all documents from the RAG database for course "${currentClass.courseName}"`
            );

            if (result.action !== 'delete') {
                console.log('Delete all documents cancelled by user');
                return;
            }

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
            await showDeletionSuccessModal(deletedDocuments, totalChunksDeleted);

        } catch (error) {
            console.error('Error deleting all documents:', error);
            await showSimpleErrorModal(`Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`, 'Delete Error');
        }
    }

    // Initial render and listeners after all nested helpers exist (Intl formatters, syncTopicOrWeekPublishHeader, etc.)
    renderDocumentsPage();
    setupEventListeners();
}