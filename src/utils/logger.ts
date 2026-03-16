/**
 * @fileoverview AppLogger - Singleton logger activated only when SAML_ENVIRONMENT is LOCAL or STAGING.
 *
 * When SAML_ENVIRONMENT is PRODUCTION, all log methods are no-ops.
 * When SAML_ENVIRONMENT is LOCAL, STAGING, or undefined, all methods output via console.log.
 *
 * Implements LoggerInterface from ubc-genai-toolkit-core for compatibility with toolkit modules.
 */

import type { LoggerInterface } from 'ubc-genai-toolkit-core';

/**
 * AppLogger class implements the LoggerInterface from ubc-genai-toolkit-core.
 */
class AppLogger implements LoggerInterface {
    private static instance: AppLogger | null = null;

    private get isActive(): boolean {
        return process.env.SAML_ENVIRONMENT !== 'PRODUCTION';
    }

    /**
     * Returns the singleton instance of AppLogger.
     */
    static getInstance(): AppLogger {
        if (AppLogger.instance === null) {
            AppLogger.instance = new AppLogger();
        }
        return AppLogger.instance;
    }

    /**
     * Logs a message to the console.
     */
    log(...args: unknown[]): void {
        if (this.isActive) {
            console.log(...args);
        }
    }

    /**
     * Logs a debug message to the console.
     */
    debug(message: string, metadata?: Record<string, any>): void {
        if (this.isActive) {
            console.log(message, metadata ?? '');
        }
    }

    /**
     * Logs an info message to the console.
     */
    info(message: string, metadata?: Record<string, any>): void {
        if (this.isActive) {
            console.log(message, metadata ?? '');
        }
    }

    warn(message: string, metadata?: unknown): void {
        if (this.isActive) {
            console.log(message, metadata ?? '');
        }
    }

    /**
     * Logs an error message to the console.
     */
    error(message: string, metadata?: unknown): void {
        if (this.isActive) {
            console.log(message, metadata ?? '');
        }
    }
}

export const appLogger = AppLogger.getInstance();
