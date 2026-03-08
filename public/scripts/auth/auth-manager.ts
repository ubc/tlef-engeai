// public/scripts/auth/auth-manager.ts

/**
 * auth-manager.ts
 * 
 * @author: EngE-AI Team
 * @date: 2025-01-27
 * @latest frontend version: 1.0.6
 * @description: Manages authentication UI (login/logout buttons, user info). Integrates with AuthService; fetches /auth/config for SAML availability.
 */

import { authService } from '../services/auth-service.js';
import type { AuthState, AuthUser } from '../types.js';


/**
 * AuthManager
 * methods:
 *   - initializeElements: Binds DOM refs (login-prompt, user-info, auth-loading, buttons)
 *   - setupEventListeners: Runs setup on DOMContentLoaded or immediately if DOM ready
 *   - fetchAuthConfig: Fetches /auth/config for samlAvailable
 *   - setupClickHandlers: Wires login, loginCWL, logout to authService
 *   - setupAuthStateListener: Subscribes to auth state changes, calls updateUI
 *   - updateUI: Shows loading, authenticated, or unauthenticated based on state
 *   - showLoading: Hides prompt/userInfo, shows auth-loading
 *   - showAuthenticated: Displays user name, affiliation, userId
 *   - showUnauthenticated: Shows login prompt, hides userInfo
 */
class AuthManager {
    private loginPrompt: HTMLElement | null = null;
    private userInfo: HTMLElement | null = null;
    private authLoading: HTMLElement | null = null;
    private loginBtn: HTMLElement | null = null;
    private loginCwlBtn: HTMLElement | null = null;
    private logoutBtn: HTMLElement | null = null;
    private userDetails: HTMLElement | null = null;
    private samlAvailable: boolean = true; // Default to true

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.fetchAuthConfig();
    }

    /**
     * Initialize DOM elements
     */
    private initializeElements(): void {
        this.loginPrompt = document.getElementById('login-prompt');
        this.userInfo = document.getElementById('user-info');
        this.authLoading = document.getElementById('auth-loading');
        this.loginBtn = document.getElementById('login-btn');
        this.loginCwlBtn = document.getElementById('login-cwl-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.userDetails = document.getElementById('user-details');
    }

    /**
     * Setup event listeners
     * Note: Modules run deferred, so DOMContentLoaded may have already fired.
     * We run setup immediately if DOM is ready, otherwise wait for DOMContentLoaded.
     */
    private setupEventListeners(): void {
        const runSetup = async () => {
            this.setupClickHandlers();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runSetup);
        } else {
            runSetup();
        }
    }
    /**
     * Fetch authentication configuration from backend
     */
    private async fetchAuthConfig(): Promise<void> {
        try {
            const response = await fetch('/auth/config');
            const data = await response.json();
            this.samlAvailable = data.samlAvailable;

        } catch (error) {
            // Default to true if config fetch fails
            this.samlAvailable = true;
        }
    }

    /**
     * Setup click handlers for authentication buttons
     */
    private setupClickHandlers(): void {
        if (this.loginBtn) {
            this.loginBtn.addEventListener('click', () => {
                authService.login();
            });
        }

        if (this.loginCwlBtn) {
            this.loginCwlBtn.addEventListener('click', () => {
                authService.loginCWL();
            });
        }

        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                authService.logout();
            });
        }
    }

    /**
     * Setup authentication state listener
     */
    private setupAuthStateListener(): void {
        authService.addListener((state: AuthState) => {
            this.updateUI(state);
        });
    }

    /**
     * Update UI based on authentication state
     * @param state AuthState — Current auth state (isLoading, isAuthenticated, user)
     */
    private updateUI(state: AuthState): void {

        if (state.isLoading) {
            this.showLoading();
        } else if (state.isAuthenticated && state.user) {
            this.showAuthenticated(state.user);
        } else {
            this.showUnauthenticated();
        }
    }

    /**
     * Show loading state
     */
    private showLoading(): void {

        if (this.loginPrompt) this.loginPrompt.style.display = 'none';
        if (this.userInfo) this.userInfo.style.display = 'none';
        if (this.authLoading) this.authLoading.style.display = 'block';
    }

    /**
     * Show authenticated state
     * @param user AuthUser — Authenticated user (name, affiliation, userId)
     */
    private showAuthenticated(user: AuthUser): void {
        if (this.loginPrompt) this.loginPrompt.style.display = 'none';
        if (this.authLoading) this.authLoading.style.display = 'none';
        if (this.userInfo) this.userInfo.style.display = 'block';

        if (this.userDetails) {
            this.userDetails.innerHTML = `
                <div class="user-details-content">
                    <p><strong>Name:</strong> ${user.name}</p>
                    <p><strong>Affiliation:</strong> ${user.affiliation}</p>
                    <p><strong>User ID:</strong> ${user.userId}</p>
                </div>
            `;
        }
    }

    /**
     * Show unauthenticated state
     */
    private showUnauthenticated(): void {

        if (this.userInfo) this.userInfo.style.display = 'none';
        if (this.authLoading) this.authLoading.style.display = 'none';
        if (this.loginPrompt) this.loginPrompt.style.display = 'block';
    }
}

// Initialize authentication manager
const authManager = new AuthManager();

export default authManager;
