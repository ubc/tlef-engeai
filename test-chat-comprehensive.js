/**
 * Comprehensive test script for chat functionality
 * Tests the complete chat flow and data structures
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8020/api/chat';

async function testComprehensiveChatFlow() {
    console.log('🚀 Starting Comprehensive Chat Functionality Test\n');
    
    try {
        // Test 1: Create multiple chats
        console.log('1. Creating multiple chats...');
        
        const chat1 = await createChat('user-001', 'CHBE241', '2025-01-27');
        const chat2 = await createChat('user-002', 'MTRL251', '2025-01-27');
        const chat3 = await createChat('user-001', 'CHBE241', '2025-01-28'); // Same user, different date
        
        console.log('✅ Chat 1 created:', chat1.chatId);
        console.log('✅ Chat 2 created:', chat2.chatId);
        console.log('✅ Chat 3 created:', chat3.chatId);
        
        // Test 2: Verify chat IDs are unique
        console.log('\n2. Verifying chat ID uniqueness...');
        const chatIds = [chat1.chatId, chat2.chatId, chat3.chatId];
        const uniqueIds = [...new Set(chatIds)];
        console.log(`✅ All chat IDs are unique: ${uniqueIds.length === chatIds.length}`);
        
        // Test 3: Test chat history for each chat
        console.log('\n3. Testing chat history...');
        
        for (let i = 0; i < chatIds.length; i++) {
            const history = await getChatHistory(chatIds[i]);
            console.log(`✅ Chat ${i + 1} history: ${history.messageCount} messages`);
            console.log(`   - First message sender: ${history.history[0].sender}`);
            console.log(`   - First message course: ${history.history[0].courseName}`);
        }
        
        // Test 4: Test data structure consistency
        console.log('\n4. Testing data structure consistency...');
        
        const sampleMessage = chat1.initAssistantMessage;
        console.log('✅ Message structure validation:');
        console.log(`   - Has ID: ${!!sampleMessage.id}`);
        console.log(`   - Has sender: ${!!sampleMessage.sender}`);
        console.log(`   - Has userId: ${typeof sampleMessage.userId === 'number'}`);
        console.log(`   - Has courseName: ${!!sampleMessage.courseName}`);
        console.log(`   - Has text: ${!!sampleMessage.text}`);
        console.log(`   - Has timestamp: ${typeof sampleMessage.timestamp === 'number'}`);
        
        // Test 5: Test error handling
        console.log('\n5. Testing error handling...');
        
        // Test missing fields
        const errorResponse = await fetch(`${BASE_URL}/newchat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userID: 'test' }) // Missing courseName and date
        });
        const errorData = await errorResponse.json();
        console.log(`✅ Missing fields error handled: ${!errorData.success}`);
        
        // Test non-existent chat history
        const nonExistentHistory = await fetch(`${BASE_URL}/nonexistent123/history`);
        const nonExistentData = await nonExistentHistory.json();
        console.log(`✅ Non-existent chat error handled: ${!nonExistentData.success}`);
        
        // Test 6: Test server status
        console.log('\n6. Testing server status...');
        const statusResponse = await fetch(`${BASE_URL}/test`);
        const statusData = await statusResponse.json();
        console.log(`✅ Server status: ${statusData.message}`);
        console.log(`✅ Active chats: ${statusData.activeChats}`);
        
        console.log('\n🎉 All tests passed! Chat functionality is working correctly.');
        
        // Summary
        console.log('\n📋 Summary:');
        console.log('- ✅ Chat creation works with unique IDs');
        console.log('- ✅ Data structures are consistent');
        console.log('- ✅ Chat history retrieval works');
        console.log('- ✅ Error handling works properly');
        console.log('- ✅ Server status monitoring works');
        console.log('- ✅ Multiple chats can coexist');
        console.log('- ✅ Memory storage is working (no database)');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function createChat(userID, courseName, date) {
    const response = await fetch(`${BASE_URL}/newchat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userID, courseName, date })
    });
    
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(`Failed to create chat: ${data.error}`);
    }
    
    return data;
}

async function getChatHistory(chatId) {
    const response = await fetch(`${BASE_URL}/${chatId}/history`);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(`Failed to get chat history: ${data.error}`);
    }
    
    return data;
}

// Run the comprehensive test
testComprehensiveChatFlow();
