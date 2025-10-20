/**
 * ABOUT PAGE MODULE
 * 
 * This module handles the about page display for both student and instructor modes.
 * It provides information about the EngE-AI platform, team members, and features.
 * 
 * FEATURES:
 * - Two-column layout matching onboarding design
 * - Platform description and mission
 * - Team member listing (7 placeholder names)
 * - Key features overview
 * - Technology stack information
 * - Back button navigation
 * - Feather icons integration
 * 
 * @author: AI Assistant
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";

// Declare feather for TypeScript
declare const feather: any;

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the about page and orchestrates the complete flow.
 * 
 * This function:
 * 1. Loads the about page HTML component
 * 2. Sets up event listeners for navigation
 * 3. Initializes feather icons
 * 4. Handles back button functionality
 * 
 * @returns Promise<void>
 */
export const renderAbout = async (): Promise<void> => {
    console.log("ℹ️ Loading about page...");
    
    try {
        // Load the about component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        const html = await loadComponentHTML('about');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Initialize feather icons
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the about page interface
        await initializeAboutPage();

    } catch (error) {
        console.error("❌ Error during about page initialization:", error);
        // Fallback: show simple error message
        const container = document.getElementById('main-content-area');
        if (container) {
            container.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <h2>Error Loading About Page</h2>
                    <p>Unable to load the about page. Please try again later.</p>
                    <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: var(--color-chbe-green); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Refresh Page
                    </button>
                </div>
            `;
        }
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the about page interface with event listeners
 */
async function initializeAboutPage(): Promise<void> {
    console.log("🎯 Initializing about page interface...");

    // Set up event listeners
    bindEventListeners();

    console.log("✅ About page interface initialized successfully");
}

// ===========================================
// EVENT HANDLERS
// ===========================================

/**
 * Binds all event listeners for the about page interface
 */
function bindEventListeners(): void {
    // Back button
    const backBtn = document.getElementById('about-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', handleBackClick);
    }

    // ESC key support for back navigation
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            handleBackClick();
        }
    });
}

/**
 * Handles back button click
 */
function handleBackClick(): void {
    console.log("🔙 Returning to previous view...");
    
    // Clear the main content area
    const container = document.getElementById('main-content-area');
    if (container) {
        container.innerHTML = '';
    }
    
    // Dispatch event to notify that we're returning to the main interface
    // This will allow the main mode scripts to continue with normal functionality
    const event = new CustomEvent('about-page-closed', { 
        detail: { timestamp: Date.now() } 
    });
    window.dispatchEvent(event);
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Validates that the about page is properly loaded
 * 
 * @returns True if about page is valid
 */
function validateAboutPage(): boolean {
    const container = document.getElementById('main-content-area');
    const aboutContainer = container?.querySelector('.about-container');
    const backBtn = document.getElementById('about-back-btn');
    
    return !!(container && aboutContainer && backBtn);
}

