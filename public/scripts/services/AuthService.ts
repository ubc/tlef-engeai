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
     * Check authentication status from server with improved session handling
     */
    public async checkAuthStatus(): Promise<void> {
        this.setLoading(true);
        
        try {
            //START DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-CHECK)
            console.log('[FRONTEND-AUTH] 🔍 Checking authentication status...');
            //END DEBUG LOG : DEBUG-CODE(FRONTEND-AUTH-CHECK)
            
            // Wait for session to be established (especially after SAML callback)
            await this.waitForSessionEstablishment();
            
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
     * Wait for session to be properly established
     * This is especially important after SAML callback redirects
     */
    private async waitForSessionEstablishment(): Promise<void> {
        // Check if we just came from a SAML callback by looking at the URL or referrer
        const isPostLogin = window.location.search.includes('saml') || 
                           document.referrer.includes('/auth/') || 
                           window.location.pathname === '/';
        
        if (isPostLogin) {
            console.log('[FRONTEND-AUTH] ⏳ Post-login detected, waiting for session establishment...');
            
            // Wait for session to be established with retry logic
            const maxAttempts = 5;
            let attempt = 0;
            
            while (attempt < maxAttempts) {
                try {
                    // Try a quick auth check to see if session is ready
                    const testResponse = await fetch('/auth/me', { 
                        method: 'HEAD', // Use HEAD to avoid parsing JSON
                        cache: 'no-cache'
                    });
                    
                    if (testResponse.ok) {
                        console.log('[FRONTEND-AUTH] ✅ Session appears to be established');
                        return;
                    }
                } catch (error) {
                    console.log(`[FRONTEND-AUTH] ⏳ Session not ready yet (attempt ${attempt + 1}/${maxAttempts})`);
                }
                
                attempt++;
                if (attempt < maxAttempts) {
                    await this.delay(200); // Wait 200ms between attempts
                }
            }
            
            console.log('[FRONTEND-AUTH] ⚠️ Session establishment timeout, proceeding anyway...');
        }
    }

    /**
     * Utility function to add delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Initiate login (now goes directly to instructor mode)
     */
    public login(): void {
        //START DEBUG LOG : DEBUG-CODE(FRONTEND-LOGIN)
        console.log('[FRONTEND-AUTH] 🚀 Going directly to instructor mode...');
        //END DEBUG LOG : DEBUG-CODE(FRONTEND-LOGIN)
        window.location.href = '/pages/instructor-mode.html';
    }

    /**
     * Logout user (now goes back to home)
     */
    public logout(): void {
        //START DEBUG LOG : DEBUG-CODE(FRONTEND-LOGOUT)
        console.log('[FRONTEND-AUTH] 🚪 Going back to home...');
        //END DEBUG LOG : DEBUG-CODE(FRONTEND-LOGOUT)
        window.location.href = '/';
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
     * Check authentication and handle redirect if not authenticated
     * @param intendedPage - The page the user intended to visit
     * @param pageName - Name of the page for logging purposes (e.g., 'STUDENT-MODE', 'INSTRUCTOR-MODE')
     * @returns Promise<boolean> - always returns true in demo mode
     */
    public async checkAuthenticationAndRedirect(intendedPage: string, pageName: string): Promise<boolean> {
        console.log(`[${pageName}] 🎭 DEMO MODE: No authentication required`);
        
        try {
            await this.checkAuthStatus();
            const authState = this.getAuthState();
            
            console.log(`[${pageName}] ✅ Demo mode - user always authenticated`);
            console.log('=====================================');
            console.log('🔐 Authentication Source: Demo Mode');
            console.log('👨‍💼 Full Name:', `${authState.user?.firstName} ${authState.user?.lastName}`);
            console.log('📧 Username:', authState.user?.username);
            console.log('🏫 Affiliation:', authState.user?.affiliation);
            console.log('🆔 PUID (Personal University ID):', authState.user?.puid);
            console.log('⏰ Authentication Time:', new Date().toISOString());
            console.log('🌐 Current Page:', window.location.pathname);
            console.log('🔗 User Agent:', navigator.userAgent);
            console.log('=====================================');
            console.log(`[${pageName}] 📋 Complete User Object:`, authState.user);
            
            return true;
        } catch (error) {
            console.error(`[${pageName}] 🚨 Demo mode - authentication check failed but continuing anyway:`, error);
            return true; // Always allow access in demo mode
        }
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
