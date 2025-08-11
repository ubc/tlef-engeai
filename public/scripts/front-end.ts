document.addEventListener('DOMContentLoaded', () => {
    const messageElement = document.getElementById('message');
    console.log('Test from the front-end.ts file');

    if (messageElement) {
        fetch('/api/example/hello')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then((data: { message: string }) => {
                messageElement.textContent = data.message;
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                messageElement.textContent = 'Failed to load message.';   
            });
    }
});
