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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { loadComponentHTML } from "../functions/api.js";
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
 * @param context Optional context information about where the about page was opened from
 * @returns Promise<void>
 */
export const renderAbout = (context) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Load the about component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }
        const html = yield loadComponentHTML('about');
        container.innerHTML = html;
        // Wait for DOM to be ready
        yield new Promise(resolve => requestAnimationFrame(resolve));
        // Initialize feather icons
        if (typeof window.feather !== 'undefined') {
            window.feather.replace();
        }
        // Initialize the about page interface
        yield initializeAboutPage();
    }
    catch (error) {
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
});
// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================
/**
 * Initializes the about page interface with event listeners
 */
function initializeAboutPage() {
    return __awaiter(this, void 0, void 0, function* () {
        // Set up event listeners
        bindEventListeners();
    });
}
// ===========================================
// EVENT HANDLERS
// ===========================================
/**
 * Binds all event listeners for the about page interface
 */
function bindEventListeners() {
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
function handleBackClick() {
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
function validateAboutPage() {
    const container = document.getElementById('main-content-area');
    const aboutContainer = container === null || container === void 0 ? void 0 : container.querySelector('.about-container');
    const backBtn = document.getElementById('about-back-btn');
    return !!(container && aboutContainer && backBtn);
}
