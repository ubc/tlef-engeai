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

export interface InactivityTrackerConfig {
    warningTimeoutMs?: number; // Default: 4 minutes
    logoutTimeoutMs?: number;   // Default: 5 minutes
    serverSyncIntervalMs?: number; // Default: 30 seconds
    activityDebounceMs?: number;   // Default: 100ms
}

export interface ActivityData {
    lastActivityTime: number;
    serverLastActivityTime?: number;
    currentTime: number;
}

export type InactivityEvent = 'warning' | 'logout' | 'activity-reset';

export class InactivityTracker {
    private static instance: InactivityTracker | null = null;
    
    private warningTimeoutMs: number = 4 * 60 * 1000; // 4 minutes
    private logoutTimeoutMs: number = 5 * 60 * 1000; // 5 minutes
    private serverSyncIntervalMs: number = 30 * 1000; // 30 seconds
    private activityDebounceMs: number = 100; // 100ms
    
    private lastActivityTime: number = Date.now();
    private serverLastActivityTime: number | null = null;
    private warningTimer: NodeJS.Timeout | null = null;
    private logoutTimer: NodeJS.Timeout | null = null;
    private serverSyncTimer: NodeJS.Timeout | null = null;
    private activityDebounceTimer: NodeJS.Timeout | null = null;
    
    private isTracking: boolean = false;
    private isPaused: boolean = false;
    private warningShown: boolean = false;
    
    private eventListeners: Map<InactivityEvent, Set<(data?: any) => void>> = new Map();
    
    private clickHandler: ((e: MouseEvent) => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private keypressHandler: ((e: KeyboardEvent) => void) | null = null;
    
    private constructor(config?: InactivityTrackerConfig) {
        if (config) {
            this.warningTimeoutMs = config.warningTimeoutMs ?? this.warningTimeoutMs;
            this.logoutTimeoutMs = config.logoutTimeoutMs ?? this.logoutTimeoutMs;
            this.serverSyncIntervalMs = config.serverSyncIntervalMs ?? this.serverSyncIntervalMs;
            this.activityDebounceMs = config.activityDebounceMs ?? this.activityDebounceMs;
        }
    }
    
    /**
     * Get singleton instance
     */
    public static getInstance(config?: InactivityTrackerConfig): InactivityTracker {
        if (!InactivityTracker.instance) {
            InactivityTracker.instance = new InactivityTracker(config);
        }
        return InactivityTracker.instance;
    }
    
    /**
     * Start tracking user activity
     */
    public start(): void {
        if (this.isTracking) {
            console.log('[INACTIVITY-TRACKER] ⚠️ Already tracking, ignoring start()');
            return;
        }
        
        console.log('[INACTIVITY-TRACKER] 🚀 Starting inactivity tracking...');
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
    public stop(): void {
        if (!this.isTracking) {
            return;
        }
        
        console.log('[INACTIVITY-TRACKER] 🛑 Stopping inactivity tracking...');
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
    public reset(): void {
        if (!this.isTracking) {
            return;
        }
        
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivityTime;
        
        // Only reset if significant time has passed (avoid excessive resets)
        if (timeSinceLastActivity < 1000) {
            return;
        }
        
        console.log('[INACTIVITY-TRACKER] 🔄 Resetting inactivity timers (activity detected)');
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
    public pause(): void {
        if (this.isPaused) {
            return;
        }
        
        console.log('[INACTIVITY-TRACKER] ⏸️ Pausing inactivity tracking...');
        this.isPaused = true;
        this.clearTimers();
    }
    
    /**
     * Resume tracking
     */
    public resume(): void {
        if (!this.isPaused) {
            return;
        }
        
        console.log('[INACTIVITY-TRACKER] ▶️ Resuming inactivity tracking...');
        this.isPaused = false;
        
        // Reset timers based on current lastActivityTime (which may have been updated while paused)
        this.resetTimers();
    }
    
    /**
     * Get remaining time until warning (in milliseconds)
     */
    public getRemainingTimeUntilWarning(): number {
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
    public getRemainingTimeUntilLogout(): number {
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
    public isWarningShown(): boolean {
        return this.warningShown;
    }
    
    /**
     * Add event listener
     */
    public on(event: InactivityEvent, callback: (data?: any) => void): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(callback);
    }
    
    /**
     * Remove event listener
     */
    public off(event: InactivityEvent, callback: (data?: any) => void): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    
    /**
     * Emit event to all listeners
     */
    private emit(event: InactivityEvent, data?: any): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[INACTIVITY-TRACKER] Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Set up activity detection event listeners
     */
    private setupActivityListeners(): void {
        // Click handler
        this.clickHandler = (e: MouseEvent) => {
            // Don't count clicks on modal overlays (to prevent reset during warning)
            const target = e.target as HTMLElement;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.handleActivity();
        };
        
        // Keyboard handlers (keydown and keypress for better coverage)
        this.keydownHandler = (e: KeyboardEvent) => {
            // Don't count keyboard input in modal overlays
            const target = e.target as HTMLElement;
            if (target.closest('.modal-overlay')) {
                return;
            }
            this.handleActivity();
        };
        
        this.keypressHandler = (e: KeyboardEvent) => {
            // Don't count keyboard input in modal overlays
            const target = e.target as HTMLElement;
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
    
    /**
     * Handle user activity (debounced)
     */
    private handleActivity(): void {
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
    private resetTimers(): void {
        // Clear existing timers
        this.clearTimers();
        
        if (!this.isTracking || this.isPaused) {
            return;
        }
        
        // Set warning timer (4 minutes)
        this.warningTimer = setTimeout(() => {
            if (!this.warningShown) {
                console.log('[INACTIVITY-TRACKER] ⚠️ Warning timeout reached (4 minutes)');
                this.warningShown = true;
                this.emit('warning', {
                    timestamp: Date.now(),
                    remainingTimeUntilLogout: this.logoutTimeoutMs - this.warningTimeoutMs
                });
            }
        }, this.warningTimeoutMs);
        
        // Set logout timer (5 minutes)
        this.logoutTimer = setTimeout(() => {
            console.log('[INACTIVITY-TRACKER] 🚪 Logout timeout reached (5 minutes)');
            this.emit('logout', { timestamp: Date.now() });
        }, this.logoutTimeoutMs);
    }
    
    /**
     * Clear inactivity timers
     */
    private clearTimers(): void {
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
    private startServerSync(): void {
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
    private stopServerSync(): void {
        if (this.serverSyncTimer) {
            clearInterval(this.serverSyncTimer);
            this.serverSyncTimer = null;
        }
    }
    
    /**
     * Sync activity state with server
     */
    private async syncWithServer(): Promise<void> {
        try {
            const response = await fetch('/api/user/activity', {
                method: 'POST',
                credentials: 'include',
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
            
            const data: ActivityData = await response.json();
            // Use serverLastActivityTime or fallback to lastActivityTime (alias)
            this.serverLastActivityTime = data.serverLastActivityTime || (data as any).lastActivityTime || null;
            
            // Check if server shows inactivity > 4 minutes (cross-tab sync)
            if (this.serverLastActivityTime) {
                const serverInactivityTime = Date.now() - this.serverLastActivityTime;
                
                // If server shows we've been inactive for > 4 minutes and we haven't shown warning yet
                if (serverInactivityTime > this.warningTimeoutMs && !this.warningShown) {
                    console.log('[INACTIVITY-TRACKER] ⚠️ Server sync detected inactivity > 4 minutes');
                    this.warningShown = true;
                    this.emit('warning', {
                        timestamp: Date.now(),
                        remainingTimeUntilLogout: this.logoutTimeoutMs - this.warningTimeoutMs,
                        fromServerSync: true
                    });
                }
                
                // If server shows we've been inactive for > 5 minutes
                if (serverInactivityTime > this.logoutTimeoutMs) {
                    console.log('[INACTIVITY-TRACKER] 🚪 Server sync detected inactivity > 5 minutes');
                    this.emit('logout', {
                        timestamp: Date.now(),
                        fromServerSync: true
                    });
                }
            }
        } catch (error) {
            // Continue with client-side timer if server sync fails
            console.warn('[INACTIVITY-TRACKER] ⚠️ Server sync error (continuing with client-side timer):', error);
        }
    }
}

// Export singleton instance getter
export const inactivityTracker = InactivityTracker.getInstance();

