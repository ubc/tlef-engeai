import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const API_BASE = 'http://localhost:6340/api';  // Your backend server port
const TEST_FILE = '../test/file-test/chemistry-concepts.txt';

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
}

async function runTests() {
    const results: TestResult[] = [];

    console.log('Starting Qdrant router endpoint tests...\n');

    // Test 1: Upload document with valid content
    try {
        const testFilePath = path.join(__dirname, TEST_FILE);
        const content = fs.readFileSync(testFilePath, 'utf-8');

        const payload = {
            text: content,
        };
        
        const response = await fetch(`${API_BASE}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseData = await response.json();

        results.push({
            name: 'Upload Valid Document',
            passed: response.ok,
            details: responseData,
            error: !response.ok ? `HTTP error! status: ${response.status}` : undefined
        });
    } catch (error) {
        results.push({
            name: 'Upload Valid Document',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    // Test 2: Upload document with empty content (should fail validation)
    try {
        const response = await fetch(`${API_BASE}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: ''
            }),
        });

        const responseData = await response.json();

        results.push({
            name: 'Validation: Empty Content',
            passed: response.status === 400,  // Should fail with 400 Bad Request
            details: responseData,
            error: response.status !== 400 ? 'Expected 400 status code for empty content' : undefined
        });
    } catch (error) {
        results.push({
            name: 'Validation: Empty Content',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    // Test 3: Upload document with missing text field (should fail validation)
    try {
        const response = await fetch(`${API_BASE}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),  // Empty object, missing text field
        });

        const responseData = await response.json();

        results.push({
            name: 'Validation: Missing Text Field',
            passed: response.status === 400,  // Should fail with 400 Bad Request
            details: responseData,
            error: response.status !== 400 ? 'Expected 400 status code for missing text field' : undefined
        });
    } catch (error) {
        results.push({
            name: 'Validation: Missing Text Field',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    // Test 4: Upload document with wrong content type (should fail validation)
    try {
        const response = await fetch(`${API_BASE}/documents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: 123  // Number instead of string
            }),
        });

        const responseData = await response.json();

        results.push({
            name: 'Validation: Wrong Content Type',
            passed: response.status === 400,  // Should fail with 400 Bad Request
            details: responseData,
            error: response.status !== 400 ? 'Expected 400 status code for wrong content type' : undefined
        });
    } catch (error) {
        results.push({
            name: 'Validation: Wrong Content Type',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    // Print test results with more details
    console.log('Test Results:\n');
    results.forEach(result => {
        const status = result.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`${status} - ${result.name}`);
        if (!result.passed && result.error) {
            console.log(`   Error: ${result.error}`);
        }
        if (result.details) {
            console.log('   Response:', JSON.stringify(result.details, null, 2));
        }
        console.log('');  // Empty line between tests
    });

    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    console.log(`\nSummary: ${passedTests}/${totalTests} tests passed`);

    // Exit with error if any test failed
    if (passedTests < totalTests) {
        process.exit(1);
    }
}

// Run the tests
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});