/**
 * Writing Feedback contracts — canonical records and service boundaries
 *
 * Defines the domain vocabulary shared by orchestration, persistence, Canvas adapters,
 * model generation, and PDF rendering. These types contain no HTTP or Mongo behavior and
 * keep student-facing output separate from internal provenance and staff-only review data.
 *
 * Split by area into the sibling files below; import from this folder, never from a part, so
 * callers do not depend on where a type lives.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.2.0
 * @description: Owns the staff-only Writing Feedback domain and port contracts.
 */

export type { QuestionScope } from '../language/socratic-questions';
export * from './assignment';
export * from './canvas';
export * from './feedback';
export * from './review-release';
