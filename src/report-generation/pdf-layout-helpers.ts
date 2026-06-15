/**
 * pdf-layout-helpers.ts
 * @description Shared PDFKit layout utilities for report sections.
 */

import type { ReportRenderContext } from './types';

/** Bottom Y coordinate inside page margins. */
export function getContentBottomY(doc: ReportRenderContext['doc']): number {
    return doc.page.height - doc.page.margins.bottom;
}

/** Starts a new page when the remaining vertical space is insufficient. */
export function ensureVerticalSpace(doc: ReportRenderContext['doc'], requiredHeight: number): void {
    const bottomY = getContentBottomY(doc);
    if (doc.y + requiredHeight > bottomY) {
        doc.addPage();
    }
}

/** Forces a new page before each student except the first (section loop already starts a fresh page). */
export function startStudentPage(doc: ReportRenderContext['doc'], isFirstStudent: boolean): void {
    if (!isFirstStudent) {
        doc.addPage();
    }
}
