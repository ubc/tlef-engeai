/**
 * material-name.ts
 *
 * Default material names for the upload modal: a picked file names the material, so staff
 * only type a name when they want a different one.
 */

/**
 * Returns the file name without its last extension, trimmed.
 *
 * A dotfile such as `.env` keeps its whole name instead of becoming empty.
 *
 * @param fileName - The picked file's name, e.g. `Week 3 Lecture.pdf`
 * @returns The suggested material name, e.g. `Week 3 Lecture`
 */
export function materialNameFromFileName(fileName: string): string {
    const trimmed = fileName.trim();
    const dot = trimmed.lastIndexOf('.');
    return dot > 0 ? trimmed.slice(0, dot).trim() : trimmed;
}

/**
 * Decides the name field's value after a file is picked.
 *
 * The name follows the file while it is empty or still holds the name this helper filled
 * in last; once the user types their own name it is never replaced.
 *
 * @param currentName - What the name field holds now
 * @param autoFilledName - The name last filled from a file, or `null` if none was
 * @param pickedFileName - The newly picked file's name, or `null` when the pick was cleared
 * @returns The value the name field should hold
 */
export function nameAfterFilePick(
    currentName: string,
    autoFilledName: string | null,
    pickedFileName: string | null
): string {
    if (pickedFileName === null) return currentName;
    const userOwnsName = currentName.trim() !== '' && currentName !== autoFilledName;
    return userOwnsName ? currentName : materialNameFromFileName(pickedFileName);
}
