// public/scripts/services/inactivity-tracker.ts

/**
 * Inactivity Tracker — server-directed idle poll loop
 *
 * Polls GET /api/user/activity on client.pollAfterMs only; shows modal or logs out
 * from client.uiAction. DOM input sends debounced POST { userActivity: true }.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-14
 * @version: 2.0.0
 * @description: Dumb client for backend-driven session idle UX.
 */

import type { InactivityTrackerConfig, SessionIdleStatusResponse } from '../types.js';
import { showInactivityWarningModal } from '../ui/modal-overlay.js';

const INACTIVITY_EXPIRED_CODE = 'INACTIVITY_EXPIRED';
const INACTIVITY_LOGOUT_URL = '/auth/logout';

class InactivityTracker {
    private static instance: InactivityTracker | null = null;

    private activityDebounceMs = 100;
    private activityDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private pollInFlight = false;
    private isTracking = false;
    private warningModalOpen = false;

    private clickHandler: ((e: MouseEvent) => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private keypressHandler: ((e: KeyboardEvent) => void) | null = null;
    private visibilityHandler: (() => void) | null = null;

    private constructor(config?: InactivityTrackerConfig) {
        if (config?.activityDebounceMs !== undefined) {
            this.activityDebounceMs = config.activityDebounceMs;
        }
    }

    public static getInstance(config?: InactivityTrackerConfig): InactivityTracker {
        if (!InactivityTracker.instance) {
            InactivityTracker.instance = new InactivityTracker(config);
        }
        return InactivityTracker.instance;
    }

    public start(): void {
        if (this.isTracking) {
            return;
        }
        this.isTracking = true;
        this.setupActivityListeners();
        this.setupVisibilityListener();
        void this.pollCycle();
    }

    public stop(): void {
        this.isTracking = false;
        this.clearPollTimer();
        this.clearActivityDebounce();
        this.removeActivityListeners();
        this.removeVisibilityListener();
        this.warningModalOpen = false;
    }

    private clearPollTimer(): void {
        if (this.pollTimer !== null) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private clearActivityDebounce(): void {
        if (this.activityDebounceTimer !== null) {
            clearTimeout(this.activityDebounceTimer);
            this.activityDebounceTimer = null;
        }
    }

    private schedulePoll(pollAfterMs: number): void {
        this.clearPollTimer();
        if (!this.isTracking || pollAfterMs <= 0) {
            return;
        }
        this.pollTimer = setTimeout(() => {
            void this.pollCycle();
        }, pollAfterMs);
    }

    private async pollCycle(): Promise<void> {
        if (!this.isTracking || this.pollInFlight) {
            return;
        }
        this.pollInFlight = true;
        try {
            const response = await this.fetchActivity('GET');
            if (!response) {
                this.schedulePoll(5000);
                return;
            }
            await this.applyClientDirective(response);
        } finally {
            this.pollInFlight = false;
        }
    }

    private async fetchActivity(method: 'GET' | 'POST', body?: object): Promise<SessionIdleStatusResponse | null> {
        try {
            const response = await fetch('/api/user/activity', {
                method,
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });

            let data: SessionIdleStatusResponse | null = null;
            try {
                data = await response.json() as SessionIdleStatusResponse;
            } catch {
                data = null;
            }

            if (response.status === 401 && data?.code === INACTIVITY_EXPIRED_CODE) {
                this.handleForceLogout();
                return null;
            }

            if (!response.ok || !data?.client) {
                return null;
            }

            return data;
        } catch {
            return null;
        }
    }

    private async applyClientDirective(data: SessionIdleStatusResponse): Promise<void> {
        const { client } = data;

        if (client.uiAction === 'show_inactivity_warning') {
            void this.showWarningModal(client.warningCountdownSec ?? 60);
        }

        if (client.uiAction === 'force_logout') {
            this.handleForceLogout();
            return;
        }

        this.schedulePoll(client.pollAfterMs);
    }

    private async showWarningModal(remainingSeconds: number): Promise<void> {
        if (this.warningModalOpen) {
            return;
        }
        this.warningModalOpen = true;

        const result = await showInactivityWarningModal(remainingSeconds, () => {
            void this.sendActivityHeartbeat();
        });

        this.warningModalOpen = false;

        if (result.action === 'stay-active') {
            return;
        }

        if (result.action === 'timeout') {
            this.handleForceLogout();
            return;
        }
    }

    private handleForceLogout(): void {
        this.stop();
        window.location.replace(INACTIVITY_LOGOUT_URL);
    }

    private async sendActivityHeartbeat(): Promise<void> {
        if (this.pollInFlight) {
            return;
        }
        this.pollInFlight = true;
        try {
            const response = await this.fetchActivity('POST', { userActivity: true });
            if (response) {
                await this.applyClientDirective(response);
            }
        } finally {
            this.pollInFlight = false;
        }
    }
    
    /**
     * Set up activity detection event listeners
     */
    private setupActivityListeners(): void {
        // Click handler
        this.clickHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.onDomActivity();
        };

        this.keydownHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.onDomActivity();
        };

        this.keypressHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.onDomActivity();
        };

        document.addEventListener('click', this.clickHandler, true);
        document.addEventListener('keydown', this.keydownHandler, true);
        document.addEventListener('keypress', this.keypressHandler, true);
    }

    private removeActivityListeners(): void {
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler, true);
            this.clickHandler = null;
        }
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        if (this.keypressHandler) {
            document.removeEventListener('keypress', this.keypressHandler, true);
            this.keypressHandler = null;
        }
    }

    private setupVisibilityListener(): void {
        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible' && this.isTracking && !this.pollInFlight) {
                void this.pollCycle();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    private removeVisibilityListener(): void {
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
    }

    private onDomActivity(): void {
        this.clearActivityDebounce();
        this.activityDebounceTimer = setTimeout(() => {
            void this.sendActivityHeartbeat();
        }, this.activityDebounceMs);
    }
}

/**
 * startInactivityTracking - begin server-directed idle poll loop on authenticated pages
 *
 * @param config - optional activityDebounceMs (default 100)
 */
export function startInactivityTracking(config?: InactivityTrackerConfig): void {
    InactivityTracker.getInstance(config).start();
}

export function stopInactivityTracking(): void {
    InactivityTracker.getInstance().stop();
}

/** @deprecated Use startInactivityTracking */
export const inactivityTracker = {
    start: (config?: InactivityTrackerConfig) => startInactivityTracking(config),
    stop: () => stopInactivityTracking(),
};
