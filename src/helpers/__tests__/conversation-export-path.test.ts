import {
    assignMonitorExportFolderPerStudent,
    monitorExportUniqueStudentFolder,
    sanitizeZipPathSegment
} from '../conversation-export-path';

describe('conversation-export-path monitor folders', () => {
    it('assignMonitorExportFolderPerStudent disambiguates duplicate display names', () => {
        const students = [
            { studentName: 'Alex', userId: 'u-1' },
            { studentName: 'Alex', userId: 'u-2' }
        ];
        const map = assignMonitorExportFolderPerStudent(students);
        expect(map.get('u-1')).toBe(sanitizeZipPathSegment('Alex'));
        expect(map.get('u-2')).toBe(`${sanitizeZipPathSegment('Alex')}-${sanitizeZipPathSegment('u-2')}`);
    });

    it('monitorExportUniqueStudentFolder increments per basename like roster walk', () => {
        const counts = new Map<string, number>();
        const a = monitorExportUniqueStudentFolder('Pat', 'a', counts);
        const b = monitorExportUniqueStudentFolder('Pat', 'b', counts);
        expect(a).toBe(sanitizeZipPathSegment('Pat'));
        expect(b).toBe(`${sanitizeZipPathSegment('Pat')}-${sanitizeZipPathSegment('b')}`);
    });
});
