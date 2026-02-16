/**
 * Inactivity Tracker Service
 *
 * Tracks user activity (clicks and keyboard input) and manages inactivity timers.
 * Shows warning after 4 minutes of inactivity and logs out after 5 minutes total.
 * Supports cross-tab synchronization via server-side activity ping.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class InactivityTracker {
    constructor(config) {
        var _a, _b, _c, _d;
        this.warningTimeoutMs = 4 * 60 * 1000; // 4 minutes
        this.logoutTimeoutMs = 5 * 60 * 1000; // 5 minutes
        this.serverSyncIntervalMs = 30 * 1000; // 30 seconds
        this.activityDebounceMs = 100; // 100ms
        this.lastActivityTime = Date.now();
        this.serverLastActivityTime = null;
        this.warningTimer = null;
        this.logoutTimer = null;
        this.serverSyncTimer = null;
        this.activityDebounceTimer = null;
        this.isTracking = false;
        this.isPaused = false;
        this.warningShown = false;
        this.eventListeners = new Map();
        this.clickHandler = null;
        this.keydownHandler = null;
        this.keypressHandler = null;
        if (config) {
            this.warningTimeoutMs = (_a = config.warningTimeoutMs) !== null && _a !== void 0 ? _a : this.warningTimeoutMs;
            this.logoutTimeoutMs = (_b = config.logoutTimeoutMs) !== null && _b !== void 0 ? _b : this.logoutTimeoutMs;
            this.serverSyncIntervalMs = (_c = config.serverSyncIntervalMs) !== null && _c !== void 0 ? _c : this.serverSyncIntervalMs;
            this.activityDebounceMs = (_d = config.activityDebounceMs) !== null && _d !== void 0 ? _d : this.activityDebounceMs;
        }
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!InactivityTracker.instance) {
            InactivityTracker.instance = new InactivityTracker(config);
        }
        return InactivityTracker.instance;
    }
    /**
     * Start tracking user activity
     */
    start() {
        if (this.isTracking) {
            // console.log('[INACTIVITY-TRACKER] ⚠️ Already tracking, ignoring start()'); // 🟢 MEDIUM: State check logging
            return;
        }
        // console.log('[INACTIVITY-TRACKER] 🚀 Starting inactivity tracking...'); // 🟢 MEDIUM: Start operation logging
        this.isTracking = true;
        this.lastActivityTime = Date.now();
        this.warningShown = false;
        // Set up event listeners for activity detection
        this.setupActivityListeners();
        // Start server sync
        this.startServerSync();
        // Start timers
        this.resetTimers();
    }
    /**
     * Stop tracking user activity
     */
    stop() {
        if (!this.isTracking) {
            return;
        }
        // console.log('[INACTIVITY-TRACKER] 🛑 Stopping inactivity tracking...'); // 🟢 MEDIUM: Stop operation logging
        this.isTracking = false;
        // Remove event listeners
        this.removeActivityListeners();
        // Clear timers
        this.clearTimers();
        // Stop server sync
        this.stopServerSync();
    }
    /**
     * Reset inactivity timers (called when user activity is detected)
     */
    reset() {
        if (!this.isTracking) {
            return;
        }
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivityTime;
        // Only reset if significant time has passed (avoid excessive resets)
        if (timeSinceLastActivity < 1000) {
            return;
        }
        // console.log('[INACTIVITY-TRACKER] 🔄 Resetting inactivity timers (activity detected)'); // 🟢 MEDIUM: Reset operation logging
        this.lastActivityTime = now;
        this.warningShown = false;
        // Reset timers only if not paused (if paused, timers will be reset on resume)
        if (!this.isPaused) {
            this.resetTimers();
        }
        // Emit activity reset event
        this.emit('activity-reset', { timestamp: now });
    }
    /**
     * Pause tracking (e.g., when modal is shown)
     */
    pause() {
        if (this.isPaused) {
            return;
        }
        // console.log('[INACTIVITY-TRACKER] ⏸️ Pausing inactivity tracking...'); // 🟢 MEDIUM: Pause operation logging
        this.isPaused = true;
        this.clearTimers();
    }
    /**
     * Resume tracking
     */
    resume() {
        if (!this.isPaused) {
            return;
        }
        // console.log('[INACTIVITY-TRACKER] ▶️ Resuming inactivity tracking...'); // 🟢 MEDIUM: Resume operation logging
        this.isPaused = false;
        // Reset timers based on current lastActivityTime (which may have been updated while paused)
        this.resetTimers();
    }
    /**
     * Get remaining time until warning (in milliseconds)
     */
    getRemainingTimeUntilWarning() {
        if (!this.isTracking || this.isPaused) {
            return this.warningTimeoutMs;
        }
        const elapsed = Date.now() - this.lastActivityTime;
        const remaining = this.warningTimeoutMs - elapsed;
        return Math.max(0, remaining);
    }
    /**
     * Get remaining time until logout (in milliseconds)
     */
    getRemainingTimeUntilLogout() {
        if (!this.isTracking || this.isPaused) {
            return this.logoutTimeoutMs;
        }
        const elapsed = Date.now() - this.lastActivityTime;
        const remaining = this.logoutTimeoutMs - elapsed;
        return Math.max(0, remaining);
    }
    /**
     * Check if warning has been shown
     */
    isWarningShown() {
        return this.warningShown;
    }
    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }
    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    /**
     * Emit event to all listeners
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                }
                catch (error) {
                    console.error(`[INACTIVITY-TRACKER] Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    /**
     * Set up activity detection event listeners
     */
    setupActivityListeners() {
        // Click handler
        this.clickHandler = (e) => {
            // Don't count clicks on modal overlays (to prevent reset during warning)
            const target = e.target;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.handleActivity();
        };
        // Keyboard handlers (keydown and keypress for better coverage)
        this.keydownHandler = (e) => {
            // Don't count keyboard input in modal overlays
            const target = e.target;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.handleActivity();
        };
        this.keypressHandler = (e) => {
            // Don't count keyboard input in modal overlays
            const target = e.target;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.handleActivity();
        };
        // Add event listeners
        document.addEventListener('click', this.clickHandler, true);
        document.addEventListener('keydown', this.keydownHandler, true);
        document.addEventListener('keypress', this.keypressHandler, true);
    }
    /**
     * Remove activity detection event listeners
     */
    removeActivityListeners() {
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
    /**
     * Handle user activity (debounced)
     */
    handleActivity() {
        // Clear existing debounce timer
        if (this.activityDebounceTimer) {
            clearTimeout(this.activityDebounceTimer);
        }
        // Set new debounce timer
        this.activityDebounceTimer = setTimeout(() => {
            this.reset();
        }, this.activityDebounceMs);
    }
    /**
     * Reset inactivity timers
     */
    resetTimers() {
        // Clear existing timers
        this.clearTimers();
        if (!this.isTracking || this.isPaused) {
            return;
        }
        // Set warning timer (4 minutes)
        this.warningTimer = setTimeout(() => {
            if (!this.warningShown) {
                // console.log('[INACTIVITY-TRACKER] ⚠️ Warning timeout reached (4 minutes)'); // 🟢 MEDIUM: Timeout warning
                this.warningShown = true;
                this.emit('warning', {
                    timestamp: Date.now(),
                    remainingTimeUntilLogout: this.logoutTimeoutMs - this.warningTimeoutMs
                });
            }
        }, this.warningTimeoutMs);
        // Set logout timer (5 minutes)
        this.logoutTimer = setTimeout(() => {
            // console.log('[INACTIVITY-TRACKER] 🚪 Logout timeout reached (5 minutes)'); // 🟢 MEDIUM: Logout timeout
            this.emit('logout', { timestamp: Date.now() });
        }, this.logoutTimeoutMs);
    }
    /**
     * Clear inactivity timers
     */
    clearTimers() {
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }
        if (this.logoutTimer) {
            clearTimeout(this.logoutTimer);
            this.logoutTimer = null;
        }
        if (this.activityDebounceTimer) {
            clearTimeout(this.activityDebounceTimer);
            this.activityDebounceTimer = null;
        }
    }
    /**
     * Start server sync for cross-tab synchronization
     */
    startServerSync() {
        // Initial sync
        this.syncWithServer();
        // Set up periodic sync
        this.serverSyncTimer = setInterval(() => {
            this.syncWithServer();
        }, this.serverSyncIntervalMs);
    }
    /**
     * Stop server sync
     */
    stopServerSync() {
        if (this.serverSyncTimer) {
            clearInterval(this.serverSyncTimer);
            this.serverSyncTimer = null;
        }
    }
    /**
     * Sync activity state with server
     */
    syncWithServer() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch('/api/user/activity', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        lastActivityTime: this.lastActivityTime
                    })
                });
                if (!response.ok) {
                    console.warn('[INACTIVITY-TRACKER] ⚠️ Server sync failed:', response.status);
                    return;
                }
                const data = yield response.json();
                // Use serverLastActivityTime or fallback to lastActivityTime (alias)
                this.serverLastActivityTime = data.serverLastActivityTime || data.lastActivityTime || null;
                // Check if server shows inactivity > 4 minutes (cross-tab sync)
                if (this.serverLastActivityTime) {
                    const serverInactivityTime = Date.now() - this.serverLastActivityTime;
                    // If server shows we've been inactive for > 4 minutes and we haven't shown warning yet
                    if (serverInactivityTime > this.warningTimeoutMs && !this.warningShown) {
                        // console.log('[INACTIVITY-TRACKER] ⚠️ Server sync detected inactivity > 4 minutes'); // 🟢 MEDIUM: Server sync warning
                        this.warningShown = true;
                        this.emit('warning', {
                            timestamp: Date.now(),
                            remainingTimeUntilLogout: this.logoutTimeoutMs - this.warningTimeoutMs,
                            fromServerSync: true
                        });
                    }
                    // If server shows we've been inactive for > 5 minutes
                    if (serverInactivityTime > this.logoutTimeoutMs) {
                        // console.log('[INACTIVITY-TRACKER] 🚪 Server sync detected inactivity > 5 minutes'); // 🟢 MEDIUM: Server sync logout
                        this.emit('logout', {
                            timestamp: Date.now(),
                            fromServerSync: true
                        });
                    }
                }
            }
            catch (error) {
                // Continue with client-side timer if server sync fails
                console.warn('[INACTIVITY-TRACKER] ⚠️ Server sync error (continuing with client-side timer):', error);
            }
        });
    }
}
InactivityTracker.instance = null;
// Export singleton instance getter
export const inactivityTracker = InactivityTracker.getInstance();
