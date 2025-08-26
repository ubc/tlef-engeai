import fetch from 'node-fetch';
import fs from 'fs';

const API_ENDPOINT = 'http://localhost:6340/api/documents';

async function uploadToQdrant(textContent: string) {
    try {
        const payload = {
            text: textContent,
        };

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error('Error Body:', errorBody);
            return;
        }

        const result = await response.json();
        console.log('Successfully uploaded document:', result);
    } catch (error) {
        console.error('Failed to upload to Qdrant:', error);
    }
}

// Function to read text from a file
async function uploadFileToQdrant(filePath: string) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        await uploadToQdrant(content);
    } catch (error) {
        console.error('Failed to read or upload file:', error);
    }
}

// Example usage:
// 1. Upload a direct text string
// uploadToQdrant('This is a test sentence to upload to Qdrant.');

// 2. Upload content from a file (uncomment and specify path to use)
// uploadFileToQdrant('/Users/charisma/Work/GenAI-Dev_UBC-TLEF/projects/tlef-engeai/src/test/file-test/chemistry-concepts.txt');
