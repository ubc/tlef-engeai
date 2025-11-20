/**
 * Authentication Manager
 * 
 * Manages authentication UI and integrates with AuthService
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { authService, AuthState, User } from './services/AuthService.js';

console.log('🚀 AUTH MANAGER SCRIPT LOADING...');

class AuthManager {
    private loginPrompt: HTMLElement | null = null;
    private userInfo: HTMLElement | null = null;
    private authLoading: HTMLElement | null = null;
    private loginBtn: HTMLElement | null = null;
    private logoutBtn: HTMLElement | null = null;
    private userDetails: HTMLElement | null = null;

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupAuthStateListener();
    }

    /**
     * Initialize DOM elements
     */
    private initializeElements(): void {
        this.loginPrompt = document.getElementById('login-prompt');
        this.userInfo = document.getElementById('user-info');
        this.authLoading = document.getElementById('auth-loading');
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.userDetails = document.getElementById('user-details');

        //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-ELEMENTS)
        console.log('[AUTH-MANAGER] 🔧 Initializing DOM elements...');
        console.log('Login prompt:', this.loginPrompt);
        console.log('User info:', this.userInfo);
        console.log('Auth loading:', this.authLoading);
        console.log('Login btn:', this.loginBtn);
        console.log('Logout btn:', this.logoutBtn);
        console.log('User details:', this.userDetails);
        //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-ELEMENTS)
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        document.addEventListener('DOMContentLoaded', async () => {
            //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-DOM-READY)
            console.log('[AUTH-MANAGER] 📄 DOM Content Loaded');
            //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-DOM-READY)
            
            this.setupClickHandlers();
            await this.handlePostLoginRedirect();
        });
    }

    /**
     * Handle post-login redirect to intended page
     * NOTE: This method is now simplified - no longer handles redirects
     * Users will need to manually navigate to protected pages after login
     */
    private async handlePostLoginRedirect(): Promise<void> {
        // No longer handling redirects - following saml-example-app approach
        console.log('[AUTH-MANAGER] 📄 Post-login redirect handling disabled - user should manually navigate to intended pages');
    }

    /**
     * Setup click handlers for authentication buttons
     */
    private setupClickHandlers(): void {
        if (this.loginBtn) {
            this.loginBtn.addEventListener('click', () => {
                //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-LOGIN-CLICK)
                console.log('[AUTH-MANAGER] 🔐 Login button clicked');
                //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-LOGIN-CLICK)
                authService.login();
            });
        }

        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-LOGOUT-CLICK)
                console.log('[AUTH-MANAGER] 🚪 Logout button clicked');
                //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-LOGOUT-CLICK)
                authService.logout();
            });
        }
    }

    /**
     * Setup authentication state listener
     */
    private setupAuthStateListener(): void {
        authService.addListener((state: AuthState) => {
            //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-STATE-CHANGE)
            console.log('[AUTH-MANAGER] 🔄 Authentication state changed:', state);
            //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-STATE-CHANGE)
            this.updateUI(state);
        });
    }

    /**
     * Update UI based on authentication state
     */
    private updateUI(state: AuthState): void {
        //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-UPDATE-UI)
        console.log('[AUTH-MANAGER] 🎨 Updating UI with state:', state);
        //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-UPDATE-UI)

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
        //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-LOADING)
        console.log('[AUTH-MANAGER] ⏳ Showing loading state');
        //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-LOADING)

        if (this.loginPrompt) this.loginPrompt.style.display = 'none';
        if (this.userInfo) this.userInfo.style.display = 'none';
        if (this.authLoading) this.authLoading.style.display = 'block';
    }

    /**
     * Show authenticated state
     */
    private showAuthenticated(user: User): void {
        //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-AUTHENTICATED)
        console.log('[AUTH-MANAGER] ✅ Showing authenticated state for user:', user);
        //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-AUTHENTICATED)

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
        //START DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-UNAUTHENTICATED)
        console.log('[AUTH-MANAGER] ❌ Showing unauthenticated state');
        //END DEBUG LOG : DEBUG-CODE(AUTH-MANAGER-SHOW-UNAUTHENTICATED)

        if (this.userInfo) this.userInfo.style.display = 'none';
        if (this.authLoading) this.authLoading.style.display = 'none';
        if (this.loginPrompt) this.loginPrompt.style.display = 'block';
    }
}

// Initialize authentication manager
console.log('Auth manager script loaded');
const authManager = new AuthManager();

export default authManager;
