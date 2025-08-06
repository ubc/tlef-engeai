// public/scripts/student-mode.ts

declare const feather: {
    replace: () => void;
};

document.addEventListener('DOMContentLoaded', () => {
    const disclaimerLink = document.querySelector('.disclaimer a');
    const body = document.body;
    let modalLoaded = false;

    const loadAndShowModal = () => {
        if (modalLoaded) {
            const modal = document.getElementById('disclaimer-modal');
            const backdrop = document.querySelector('.modal-backdrop');
            if (modal && backdrop) {
                modal.classList.add('visible');
                backdrop.classList.add('visible');
            }
            return;
        }

        fetch('/components/disclaimer.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(html => {
                body.insertAdjacentHTML('beforeend', html);
                modalLoaded = true;
                
                const modal = document.getElementById('disclaimer-modal');
                const backdrop = document.querySelector('.modal-backdrop');
                const closeModalBtn = modal?.querySelector('.close-modal');
                
                if (modal && backdrop && closeModalBtn) {
                    feather.replace();

                    const hideModal = () => {
                        modal.classList.remove('visible');
                        backdrop.classList.remove('visible');
                    };

                    closeModalBtn.addEventListener('click', hideModal);
                    backdrop.addEventListener('click', hideModal);
                    
                    modal.classList.add('visible');
                    backdrop.classList.add('visible');
                }
            })
            .catch(error => console.error('Error loading disclaimer component:', error));
    };

    if (disclaimerLink) {
        disclaimerLink.addEventListener('click', (e: Event) => { // Changed MouseEvent to Event
            e.preventDefault();
            loadAndShowModal();
        });
    }
});
