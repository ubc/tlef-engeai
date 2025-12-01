/**
 * Type declarations for passport-ubcshib
 * Custom UBC Shibboleth SAML 2.0 authentication strategy for Passport.js
 */

declare module 'passport-ubcshib' {
    import { Strategy as SamlStrategy } from 'passport-saml';
    import { Request } from 'express';

    export interface UbcShibStrategyOptions {
        issuer: string;
        callbackUrl: string;
        entryPoint?: string;
        logoutUrl?: string;
        metadataUrl?: string;
        cert?: string;
        privateKeyPath?: string;
        attributeConfig?: string[];
        enableSLO?: boolean;
        validateInResponseTo?: boolean;
        acceptedClockSkewMs?: number;
        signatureAlgorithm?: string;
        digestAlgorithm?: string;
        identifierFormat?: string;
    }

    export interface UbcShibProfile {
        nameID: string;
        nameIDFormat: string;
        sessionIndex?: string;
        attributes?: Record<string, string | string[]>;
    }

    export type UbcShibVerifyCallback = (profile: UbcShibProfile, done: (error: any, user?: any) => void) => void;

    export class Strategy extends SamlStrategy {
        constructor(options: UbcShibStrategyOptions, verify: UbcShibVerifyCallback);
        logout(req: Request, callback: (err: any, requestUrl?: string | null) => void): void;
    }

    export interface UbcConfig {
        LOCAL: {
            entryPoint: string;
            logoutUrl: string;
            metadataUrl: string;
        };
        STAGING: {
            entryPoint: string;
            logoutUrl: string;
            metadataUrl: string;
        };
        PRODUCTION: {
            entryPoint: string;
            logoutUrl: string;
            metadataUrl: string;
        };
    }

    export const UBC_CONFIG: UbcConfig;

    export function ensureAuthenticated(options?: { loginUrl?: string }): (req: Request, res: any, next: any) => void;

    export function conditionalAuth(checkFn: (req: Request) => boolean): (req: Request, res: any, next: any) => void;

    export function logout(returnUrl?: string): (req: Request, res: any) => void;

    export function loadPrivateKey(keyPath: string): string | null;

    export function fetchIdPCertificate(metadataUrl: string): Promise<string>;

    export function extractCertFromMetadata(metadataXml: string): string;
}

