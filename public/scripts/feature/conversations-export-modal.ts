/**
 * Instructor modal to choose TXT vs JSON, then download bulk conversation ZIP from the monitor export API.
 */

const COURSE_SUMMARY_CSS_ID = 'course-summary-stylesheet';
const COURSE_SUMMARY_CSS_HREF = '/styles/instructor-components/course-summary.css';

function ensureCourseSummaryStylesheet(): void {
    if (document.getElementById(COURSE_SUMMARY_CSS_ID)) {
        return;
    }
    const link = document.createElement('link');
    link.id = COURSE_SUMMARY_CSS_ID;
    link.rel = 'stylesheet';
    link.href = COURSE_SUMMARY_CSS_HREF;
    document.head.appendChild(link);
}

export type ConversationExportFormat = 'txt' | 'json';

/**
 * GET `/api/courses/monitor/:courseId/conversations-export.zip` and triggers browser download.
 */
export async function fetchConversationExportZip(courseId: string, format: ConversationExportFormat): Promise<void> {
    const url = `/api/courses/monitor/${encodeURIComponent(courseId)}/conversations-export.zip?format=${format}`;
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/zip' }
    });

    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
            const data = (await response.json()) as { error?: string };
            if (data?.error) msg = data.error;
        } catch {
            /* ignore non-JSON error bodies */
        }
        throw new Error(msg);
    }

    const buf = await response.arrayBuffer();
    const blob = new Blob([buf], { type: 'application/zip' });

    const cd = response.headers.get('Content-Disposition');
    let filename = `course-conversations-${format}.zip`;
    if (cd) {
        const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
        if (star?.[1]) {
            filename = decodeURIComponent(star[1]);
        } else {
            const plain = cd.match(/filename="([^"]+)"/);
            if (plain?.[1]) filename = plain[1];
        }
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
}

/**
 * Opens overlay for format selection; starts download on confirm.
 */
export function openConversationExportFormatModal(courseId: string): void {
    ensureCourseSummaryStylesheet();

    const overlay = document.createElement('div');
    overlay.className = 'course-summary-overlay conversation-export-format-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'conversation-export-title');
    overlay.innerHTML = `
    <div class="course-summary-modal conversation-export-format-modal">
      <div class="course-summary-modal__header">
        <div>
          <p class="course-summary-modal__eyebrow">Export</p>
          <h2 id="conversation-export-title">Download student conversations</h2>
          <p class="conversation-export-format-desc">Choose how files inside the ZIP are formatted.</p>
        </div>
        <button type="button" class="course-summary-modal__close conversation-export-close" aria-label="Close">×</button>
      </div>
      <div class="conversation-export-format-body">
        <label class="conversation-export-radio">
          <input type="radio" name="conversation-export-format" value="txt" checked />
          <span>Plain text (.txt) — same layout as Monitor single-chat download</span>
        </label>
        <label class="conversation-export-radio">
          <input type="radio" name="conversation-export-format" value="json" />
          <span>Structured JSON (.json) — full projected row per chat</span>
        </label>
      </div>
      <div class="conversation-export-format-actions">
        <button type="button" class="conversation-export-cancel-btn">Cancel</button>
        <button type="button" class="conversation-export-download-btn">Download</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (): void => {
        overlay.classList.remove('show');
        document.body.classList.remove('modal-open');
        setTimeout(() => overlay.remove(), 250);
    };

    overlay.querySelector('.conversation-export-close')?.addEventListener('click', close);
    overlay.querySelector('.conversation-export-cancel-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close();
    });

    overlay.querySelector('.conversation-export-download-btn')?.addEventListener('click', async () => {
        const selected = overlay.querySelector(
            'input[name="conversation-export-format"]:checked'
        ) as HTMLInputElement | null;
        const format = (selected?.value === 'json' ? 'json' : 'txt') as ConversationExportFormat;
        const dlBtn = overlay.querySelector('.conversation-export-download-btn') as HTMLButtonElement;
        dlBtn.disabled = true;
        try {
            await fetchConversationExportZip(courseId, format);
            close();
        } catch (err) {
            alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            dlBtn.disabled = false;
        }
    });
}
