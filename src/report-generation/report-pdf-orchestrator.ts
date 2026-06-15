/**
 * report-pdf-orchestrator.ts
 * @description Selects PDF builder by phase and coordinates document generation.
 */

import { FullReportPdfBuilder } from './builders/full-report-pdf-builder';
import { PrototypeReportPdfBuilder } from './builders/prototype-report-pdf-builder';
import type { IReportPdfBuilder } from './interfaces';
import type { ReportBuildInput, ReportPdfOutput, ReportPdfPhase } from './types';

function resolveBuilder(phase: ReportPdfPhase): IReportPdfBuilder {
    if (phase === 'full') {
        return new FullReportPdfBuilder();
    }
    return new PrototypeReportPdfBuilder();
}

/** Builds struggle-topic PDF for the given phase (default prototype). */
export async function buildReportPdf(input: ReportBuildInput): Promise<ReportPdfOutput> {
    const phase = input.phase === 'full' ? 'full' : 'prototype';
    const builder = resolveBuilder(phase);
    return builder.build({ ...input, phase });
}

/** Normalizes query param to supported phase; unknown values fall back to prototype. */
export function parseReportPdfPhase(raw: string | undefined): ReportPdfPhase {
    if (raw === 'full') {
        return 'full';
    }
    return 'prototype';
}
