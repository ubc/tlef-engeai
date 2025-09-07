/**
 * Service for interacting with the Qdrant backend
/**
 * Service for interacting with the Qdrant backend
 */

import { AdditionalMaterial } from '../../../src/functions/types';

const BACKEND_ENDPOINT = `/api/qdrant/documents`;

/**
 * Uploads text content to Qdrant through the backend
 * @param content - The text content to upload
 * @returns Promise with the upload result
 */
export async function uploadRAGContent(content: AdditionalMaterial): Promise<any> {

    console.log('DEBUG #23 : Uploading text to Qdrant');
    try {
        const response = await fetch(BACKEND_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content
            })
        });

        console.log('DEBUG #24 : Qdrant response:', response);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to upload to Qdrant: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        console.log('DEBUG #25 : Qdrant result:', result);

        return result;
    } catch (error) {
        console.error('Error uploading to Qdrant:', error);
        throw error;
    }
}
