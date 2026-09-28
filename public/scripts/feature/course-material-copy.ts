/**
 * course-material-copy.ts
 * @description "Copy materials from another course": pick a course the instructor teaches, confirm
 * (a warning when this course's own materials will be replaced), run the copy, report the outcome.
 *
 * Shared by the Documents page and Document Setup; each caller refreshes its own view afterwards.
 */

import type { activeCourse, CopyCourseMaterialsResult, MaterialCopySourceCourse } from '../types.js';
import { copyCourseMaterials, fetchMaterialCopySources } from '../api/course-material-copy-api.js';
import {
    closeModal,
    showContentLoadingModal,
    showCustomModal,
    showInfoModal,
    showSimpleErrorModal
} from '../ui/modal-overlay.js';

function countMaterials(course: activeCourse): number {
    let count = 0;
    for (const instance of course.topicOrWeekInstances || []) {
        for (const item of instance.items || []) {
            count += (item.additionalMaterials || []).filter((m) => m && m.deleted !== true).length;
        }
    }
    return count;
}

function plural(count: number, one: string, many: string = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

function describeSource(source: MaterialCopySourceCourse): string {
    const unit = source.frameType === 'byWeek' ? 'week' : 'topic';
    return `${source.courseName} (${plural(source.topicOrWeekCount, unit)}, ${plural(source.materialCount, 'document')})`;
}

function paragraph(text: string, className?: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.textContent = text;
    if (className) p.className = className;
    return p;
}

async function pickSource(sources: MaterialCopySourceCourse[]): Promise<MaterialCopySourceCourse | null> {
    const body = document.createElement('div');
    body.className = 'material-copy-picker';
    body.appendChild(paragraph(
        'Copies the weeks or topics, learning objectives, struggle topics and documents. '
    ));

    const label = document.createElement('label');
    label.className = 'material-copy-picker__label';
    label.htmlFor = 'material-copy-source';
    label.textContent = 'Copy from';
    const select = document.createElement('select');
    select.id = 'material-copy-source';
    select.className = 'material-copy-picker__select';
    for (const source of sources) {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = describeSource(source);
        select.appendChild(option);
    }
    body.append(label, select);

    setTimeout(() => select.focus(), 100);
    const result = await showCustomModal({
        type: 'info',
        title: 'Copy Materials From Another Course',
        content: body,
        buttons: [
            { text: 'Cancel', type: 'secondary', closeOnClick: true },
            { text: 'Continue', type: 'primary', closeOnClick: true }
        ]
    });
    if (result.action !== 'continue') return null;
    return sources.find((s) => s.id === select.value) ?? null;
}

async function confirmCopy(target: activeCourse, source: MaterialCopySourceCourse): Promise<boolean> {
    const existing = countMaterials(target);
    if (existing === 0 && (target.topicOrWeekInstances || []).length === 0) {
        return true;
    }
    const layout = target.frameType === 'byWeek' ? 'weeks' : 'topics';
    const replaced = existing > 0
        ? `This deletes all ${plural(existing, 'document')} in ${target.courseName}, along with its ${layout}, learning objectives and struggle topics, and replaces them with copies from ${source.courseName}.`
        : `This replaces the ${layout}, learning objectives and struggle topics in ${target.courseName} with copies from ${source.courseName}.`;
    const body = document.createElement('div');
    body.append(paragraph(replaced), paragraph('This cannot be undone.'));
    // Built from text nodes: string content is rendered as HTML and course names are user-entered.
    const result = await showCustomModal({
        type: 'warning',
        title: 'Replace This Course\'s Materials?',
        content: body,
        buttons: [
            { text: 'Cancel', type: 'secondary', closeOnClick: true },
            { text: 'Replace Materials', type: 'danger', closeOnClick: true }
        ]
    });
    return result.action === 'replace-materials';
}

async function reportResult(source: MaterialCopySourceCourse, result: CopyCourseMaterialsResult): Promise<void> {
    const body = document.createElement('div');
    body.appendChild(paragraph(
        `Copied ${plural(result.materialsCopied, 'document')} across ${plural(result.topicsOrWeeksCopied, source.frameType === 'byWeek' ? 'week' : 'topic')} from ${source.courseName}.`
    ));
    if (result.skippedMaterials.length > 0) {
        body.appendChild(paragraph(
            `${plural(result.skippedMaterials.length, 'document')} could not be copied because ${result.skippedMaterials.length === 1 ? 'its' : 'their'} content was not found. Upload ${result.skippedMaterials.length === 1 ? 'it' : 'them'} again:`
        ));
        const list = document.createElement('ul');
        list.className = 'material-copy-picker__skipped';
        for (const skipped of result.skippedMaterials) {
            const li = document.createElement('li');
            li.textContent = `${skipped.name} — ${skipped.topicOrWeekTitle}, ${skipped.itemTitle}`;
            list.appendChild(li);
        }
        body.appendChild(list);
    }
    await showCustomModal({
        type: 'success',
        title: 'Materials Copied',
        content: body,
        buttons: [{ text: 'OK', type: 'primary', closeOnClick: true }]
    });
}

/**
 * runCourseMaterialCopy — walks the instructor through copying another course's materials into `target`.
 *
 * @param target - Course being copied into
 * @returns The copy's outcome, or `null` when the instructor cancelled, had nothing to copy from,
 *   or the copy failed (the error has already been shown)
 */
export async function runCourseMaterialCopy(target: activeCourse): Promise<CopyCourseMaterialsResult | null> {
    let sources: MaterialCopySourceCourse[];
    try {
        sources = await fetchMaterialCopySources(target.id);
    } catch (error) {
        await showSimpleErrorModal((error as Error).message, 'Could Not Load Courses');
        return null;
    }
    if (sources.length === 0) {
        await showInfoModal(
            'No Courses to Copy From',
            'You are not an instructor of any other course with weeks or topics set up.'
        );
        return null;
    }

    const source = await pickSource(sources);
    if (!source || !(await confirmCopy(target, source))) return null;

    void showContentLoadingModal({
        title: 'Copying Materials',
        line1: 'Copying materials...',
        line2: 'This can take a minute for a large course. Please keep this page open.'
    });
    let result: CopyCourseMaterialsResult;
    try {
        result = await copyCourseMaterials(target.id, source.id);
    } catch (error) {
        closeModal();
        await showSimpleErrorModal((error as Error).message, 'Copy Failed');
        return null;
    }
    closeModal();
    await reportResult(source, result);
    return result;
}
