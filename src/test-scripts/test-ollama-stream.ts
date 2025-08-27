import fetch from 'node-fetch';

const API_ENDPOINT = 'http://localhost:8020/api/ollama/chat';

async function testOllamaStream() {
    const payload = {
        model: 'llama3.1:latest',
        messages: [
            {
                role: 'user',
                content: 'Why is the sky blue?',
            },
        ],
    };

    try {
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

        for await (const chunk of response.body) {
            try {
                const chunkStr = chunk.toString();
                const json = JSON.parse(chunkStr);
                if (json.message && json.message.content) {
                    process.stdout.write(json.message.content);
                }
                if (json.done && json.done === true) {
                    console.log('\n\nStream finished.');
                }
            } catch (e) {
                console.error('Error parsing chunk:', e);
                console.log('Received chunk:', chunk.toString());
            }
        }
    } catch (error) {
        console.error('Failed to connect to the server:', error);
    }
}

testOllamaStream();
