import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration - Point to our backend server, not Qdrant directly
const API_ENDPOINT = 'http://localhost:8020/api/qdrant/documents';
const TEST_FILE = '../test/file-test/chemistry-concepts.txt';

async function uploadToBackend(textContent: string) {
    try {
        console.log('Sending request to backend...');
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

        const responseText = await response.text();
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        console.log('Raw response:', responseText);

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            console.error('Error Body:', responseText);
            return;
        }

        const result = JSON.parse(responseText);
        console.log('Successfully uploaded document:', result);
        return result;
    } catch (error) {
        console.error('Failed to upload to backend:', error);
    }
}

// Function to read text from a file
async function uploadFileToBackend(filePath: string) {
    try {
        const absolutePath = path.join(__dirname, filePath);
        console.log('Reading file from:', absolutePath);
        
        const content = fs.readFileSync(absolutePath, 'utf-8');
        console.log('File content length:', content.length);
        console.log('First 100 characters:', content.substring(0, 100));
        
        await uploadToBackend(content);
    } catch (error) {
        console.error('Failed to read or upload file:', error);
    }
}

// Run both tests
async function runTests() {
    console.log('\n=== Testing direct text upload ===');
    await uploadToBackend('This is a test sentence to upload through our backend.');

    console.log('\n=== Testing file upload ===');
    await uploadFileToBackend(TEST_FILE);
}

// Execute tests
console.log('Starting Qdrant backend tests...');
runTests().then(() => {
    console.log('Tests completed.');
}).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});