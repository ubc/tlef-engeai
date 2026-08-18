/**
 * Guided Pathway flag contracts
 *
 * HTTP handlers, chat orchestration, the Mongo facade, and Mongo delegates share
 * these contracts without importing types from the persistence implementation.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Persistence-neutral contracts for automatic Guided Pathway flags.
 */

import type {
    GuidedPathwayFlagOrigin,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView
} from '../types/shared';

/** Server-owned staff identity snapshot used for decisions, review, and reveal audit. */
export interface GuidedPathwayFlagReviewActor {
    userId: string;
    name: string;
}

/** Server-derived chat participant allowed to create an automatic flag. */
export interface GuidedPathwayFlagTriggerActor {
    origin: GuidedPathwayFlagOrigin;
    userId: string;
}

/** Input from the chat trigger path. Chat/request identifiers are hashed, never stored verbatim. */
export interface CreateGuidedPathwayFlagInput {
    courseId: string;
    courseName: string;
    pathwayId: string;
    pathwayTitle: string;
    messageText: string;
    actor: GuidedPathwayFlagTriggerActor;
    chatId: string;
    clientMessageId: string;
    triggeredAt?: Date;
}

/** Filters supported by the platform-wide administrator queue. */
export interface GuidedPathwayFlagListFilters {
    page?: number;
    pageSize?: number;
    status?: GuidedPathwayFlagStatus;
    reviewState?: GuidedPathwayFlagReviewState;
    courseId?: string;
    courseIds?: string[];
    pathwayId?: string;
    reviewer?: string;
    dateFrom?: Date;
    dateTo?: Date;
    escalatedFirst?: boolean;
    includeFacets?: boolean;
}

/** Result of an idempotent trigger insert. */
export interface CreateGuidedPathwayFlagResult {
    created: boolean;
    flag: GuidedPathwayFlagView;
}

/** Minimal persistence port used by failure-isolated chat orchestration. */
export interface GuidedPathwayFlagWriter {
    createGuidedPathwayFlag(input: CreateGuidedPathwayFlagInput): Promise<unknown>;
}
