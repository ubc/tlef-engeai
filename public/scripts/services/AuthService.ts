/**
 * Authentication Service
 * 
 * Handles frontend authentication state management and SAML integration
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

export interface User {
    username: string;
    firstName: string;
    lastName: string;
    affiliation: string;
    puid: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    user: User | null;
    isLoading: boolean;
}

export class AuthService {
    private authState: AuthState = {
        isAuthenticated: false,
        user: null,
        isLoading: false
    };

    private listeners: ((state: AuthState) => void)[] = [];

    constructor() {
        this.checkAuthStatus();
    }

    /**
     * Check authentication status from server
     */
    public async checkAuthStatus(): Promise<void> {
        this.setLoading(true);
        
        try {
            //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-CHECK)
            console.log('[FRONTEND-AUTH] 🔍 Checking authentication status...');
            //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-CHECK)
            
            const response = await fetch('/auth/me');
            //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-RESPONSE)
            console.log('[FRONTEND-AUTH] 📡 Server response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-RESPONSE)
            
            const data = await response.json();
            //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-DATA)
            console.log('[FRONTEND-AUTH] 📦 Complete server response data:', data);
            console.log('[FRONTEND-AUTH] 📋 Response structure:', {
                authenticated: data.authenticated,
                hasUser: !!data.user,
                userKeys: data.user ? Object.keys(data.user) : 'No user data'
            });
            //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-DATA)

            if (data.authenticated) {
                this.authState.isAuthenticated = true;
                this.authState.user = data.user;
                
                //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-SUCCESS)
                console.log('[FRONTEND-AUTH] ✅ LOGIN SUCCESSFUL!');
                console.log('[FRONTEND-AUTH] 👤 User information received from server:');
                console.log('  📝 Username:', data.user.username);
                console.log('  👨‍💼 Full Name:', data.user.firstName, data.user.lastName);
                console.log('  🏫 Affiliation:', data.user.affiliation);
                console.log('  🆔 PUID:', data.user.puid);
                console.log('[FRONTEND-AUTH] 💾 Stored in frontend state:', this.authState.user);
                //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-SUCCESS)
            } else {
                this.authState.isAuthenticated = false;
                this.authState.user = null;
                //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-FAIL)
                console.log('[FRONTEND-AUTH] ❌ User not authenticated');
                //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-FAIL)
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-ERROR)
            console.error('[FRONTEND-AUTH] 🚨 Error checking auth status:', error);
            //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-ERROR)
            this.authState.isAuthenticated = false;
            this.authState.user = null;
        } finally {
            this.setLoading(false);
            this.notifyListeners();
        }
    }

    /**
     * Initiate SAML login
     */
    public login(): void {
        //START DEBUG LOG : DEBUG-CODE(FRONTEND-LOGIN)
        console.log('[FRONTEND-AUTH] 🚀 Initiating SAML login...');
        //END DEBUG LOG : DEBUG-CODE(FRONTEND-LOGIN)
        window.location.href = '/auth/login';
    }

    /**
     * Logout user
     */
    public logout(): void {
        //START DEBUG LOG : DEBUG-CODE(FRONTEND-LOGOUT)
        console.log('[FRONTEND-AUTH] 🚪 Logging out user...');
        //END DEBUG LOG : DEBUG-CODE(FRONTEND-LOGOUT)
        window.location.href = '/auth/logout';
    }

    /**
     * Get current authentication state
     */
    public getAuthState(): AuthState {
        return { ...this.authState };
    }

    /**
     * Check if user is authenticated
     */
    public isAuthenticated(): boolean {
        return this.authState.isAuthenticated;
    }

    /**
     * Get current user
     */
    public getUser(): User | null {
        return this.authState.user;
    }

    /**
     * Check if authentication is loading
     */
    public isLoading(): boolean {
        return this.authState.isLoading;
    }

    /**
     * Add state change listener
     */
    public addListener(listener: (state: AuthState) => void): void {
        this.listeners.push(listener);
    }

    /**
     * Remove state change listener
     */
    public removeListener(listener: (state: AuthState) => void): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Set loading state
     */
    private setLoading(loading: boolean): void {
        this.authState.isLoading = loading;
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.getAuthState()));
    }
}

// Create singleton instance
export const authService = new AuthService();
