// public/scripts/feature/settings.ts
/**
 * Settings — course capability toggles for instructors and platform admins.
 *
 * Owns Writing Feedback, Memory Agent, and Guided Pathway enablement. Dispatches
 * `course-feature-changed` after each successful PATCH so the sidebar and
 * dashboard can refresh without a full reload.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.0.0
 * @description: Instructor Settings view for course feature capabilities.
 */

import { activeCourse, CourseFeatures, InstructorInfo } from '../types.js';
import { showErrorModal } from '../ui/modal-overlay.js';
import { renderFeatherIcons } from '../api/api.js';

type FeatureKey = keyof CourseFeatures;

const FEATURE_ENDPOINTS: Record<FeatureKey, string> = {
    writingFeedback: 'writing-feedback',
    memoryAgent: 'memory-agent',
    guidedPathway: 'guided-pathway'
};

const FEATURE_INPUT_IDS: Record<FeatureKey, string> = {
    writingFeedback: 'settingsWritingFeedback',
    memoryAgent: 'settingsMemoryAgent',
    guidedPathway: 'settingsGuidedPathway'
};

/**
 * Initializes the Settings page with current course capability checkboxes.
 *
 * @param currentClass - Active course whose features are edited
 */
export async function initializeSettings(currentClass: activeCourse): Promise<void> {
    renderFeatherIcons();

    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
        if (input) {
            input.checked = currentClass.features?.[key]?.enabled === true;
        }
    }

    const saveBtn = document.getElementById('saveCourseFeatures') as HTMLButtonElement | null;
    const statusEl = document.getElementById('settingsFeatureStatus');

    const currentUserResponse = await fetch('/auth/current-user', { credentials: 'same-origin' });
    const currentUserData = currentUserResponse.ok ? await currentUserResponse.json() : {};
    const currentUser = currentUserData.globalUser;
    const instructorIds = (currentClass.instructors ?? []).map((item: string | InstructorInfo) =>
        typeof item === 'string' ? item : item.userId
    );
    const canManage = Boolean(
        currentUser?.isAdmin === true || instructorIds.includes(currentUser?.userId)
    );

    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
        if (input) input.disabled = !canManage;
    }
    if (saveBtn) saveBtn.disabled = !canManage;
    if (!canManage && statusEl) {
        statusEl.textContent = 'Only an instructor or platform admin can change these settings.';
    }

    saveBtn?.addEventListener('click', async () => {
        if (!canManage) return;
        saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

        try {
            const keys = Object.keys(FEATURE_ENDPOINTS) as FeatureKey[];
            for (const key of keys) {
                const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement;
                const desired = input.checked;
                const already = currentClass.features?.[key]?.enabled === true;
                if (desired === already) continue;

                const response = await fetch(
                    `/api/courses/${encodeURIComponent(currentClass.id)}/features/${FEATURE_ENDPOINTS[key]}`,
                    {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: desired })
                    }
                );
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || `Failed to update ${key}`);

                currentClass.features = result.data?.features ?? {
                    ...currentClass.features,
                    [key]: { enabled: desired }
                };
                window.dispatchEvent(new CustomEvent('course-feature-changed', {
                    detail: { feature: key, enabled: desired }
                }));
            }
            if (statusEl) statusEl.textContent = 'Feature settings saved.';
        } catch (error) {
            for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
                const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
                if (input) input.checked = currentClass.features?.[key]?.enabled === true;
            }
            await showErrorModal(
                'Save Failed',
                error instanceof Error ? error.message : 'Failed to save feature settings.'
            );
            if (statusEl) statusEl.textContent = 'Feature settings were not changed.';
        } finally {
            saveBtn.disabled = !canManage;
        }
    });

    document.getElementById('settings-back-btn')?.addEventListener('click', () => {
        window.history.back();
    });
}
