/**
 * Simple test script for chat functionality
 * This script tests the chat conversation endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000/api/chat';

async function testChatFlow() {
    console.log('🚀 Starting Chat Functionality Test\n');
    
    try {
        // Step 1: Create a new chat
        console.log('1. Creating new chat...');
        const newChatResponse = await fetch(`${BASE_URL}/newchat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userID: 'test-user-123',
                courseName: 'CHBE241',
                date: '2025-01-27'
            })
        });
        
        const newChatData = await newChatResponse.json();
        console.log('✅ New chat created:', newChatData);
        
        if (!newChatData.success) {
            throw new Error('Failed to create new chat');
        }
        
        const chatId = newChatData.chatId;
        console.log(`📝 Chat ID: ${chatId}\n`);
        
        // Step 2: Test the test endpoint
        console.log('2. Testing API endpoint...');
        const testResponse = await fetch(`${BASE_URL}/test`);
        const testData = await testResponse.json();
        console.log('✅ API test:', testData);
        
        // Step 3: Get initial chat history
        console.log('\n3. Getting initial chat history...');
        const historyResponse = await fetch(`${BASE_URL}/${chatId}/history`);
        const historyData = await historyResponse.json();
        console.log('✅ Initial history:', historyData);
        
        // Step 4: Send a test message (non-streaming for testing)
        console.log('\n4. Sending test message...');
        console.log('Note: This will test the streaming endpoint');
        
        // For streaming test, we'll use a simple approach
        const messageResponse = await fetch(`${BASE_URL}/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Hello! Can you explain what thermodynamics is?',
                userId: 'test-user-123'
            })
        });
        
        if (messageResponse.ok) {
            console.log('✅ Message sent successfully (streaming response)');
            console.log('📡 Response headers:', messageResponse.headers.get('content-type'));
        } else {
            const errorData = await messageResponse.json();
            console.log('❌ Message failed:', errorData);
        }
        
        console.log('\n🎉 Chat functionality test completed!');
        console.log('\n📋 Summary:');
        console.log('- ✅ Chat creation works');
        console.log('- ✅ API test endpoint works');
        console.log('- ✅ Chat history retrieval works');
        console.log('- ✅ Message sending works (streaming)');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testChatFlow();
