/**
 * Fetches course Mongo backup ZIP (GET `/api/courses/:courseId/course-backup.zip`) and triggers download.
 */

export async function fetchCourseMongoBackupZip(courseId: string): Promise<void> {
    const url = `/api/courses/${encodeURIComponent(courseId)}/course-backup.zip`;
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
            /* ignore non-JSON */
        }
        throw new Error(msg);
    }

    const buf = await response.arrayBuffer();
    const blob = new Blob([buf], { type: 'application/zip' });

    const cd = response.headers.get('Content-Disposition');
    let filename = 'course-backup.zip';
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
