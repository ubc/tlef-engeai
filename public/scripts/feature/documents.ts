// Wait for DOM and all scripts to load
window.addEventListener('load', (): void => {
    console.log('Window loaded, initializing accordions...');

    interface AccordionOptions {
        allowMultiple?: boolean;
    }

    class DocumentAccordion {
        private weekAccordions: HTMLElement[];
        private lectureItems: HTMLElement[];
        
        constructor() {
            this.weekAccordions = Array.from(document.querySelectorAll('.week-accordion-item'));
            this.lectureItems = Array.from(document.querySelectorAll('.lecture-item'));
            
            console.log(`Found ${this.weekAccordions.length} week accordions`);
            console.log(`Found ${this.lectureItems.length} lecture items`);
            
            this.init();
        }

        private init(): void {
            if (this.weekAccordions.length === 0) {
                console.error('No week accordions found! Check your HTML structure.');
                return;
            }

            // Initialize feather icons FIRST so our arrow rotation targets the replaced <svg> nodes
            this.initFeatherIcons();

            this.initWeekAccordions();
            this.initLectureAccordions();
            
            console.log('Accordion initialization complete');
        }

        private initWeekAccordions(): void {
            this.weekAccordions.forEach((weekItem: HTMLElement, index: number) => {
                const titleBar = weekItem.querySelector('.title-bar') as HTMLElement;
                const uploadContent = weekItem.querySelector('.upload-content') as HTMLElement;
                
                if (!titleBar || !uploadContent) {
                    console.error(`Week accordion ${index} missing required elements`);
                    return;
                }

                // Make sure it's clickable
                titleBar.style.cursor = 'pointer';
                titleBar.style.userSelect = 'none';
                
                // Remove any existing listeners
                const newTitleBar = titleBar.cloneNode(true) as HTMLElement;
                titleBar.parentNode?.replaceChild(newTitleBar, titleBar);
                
                // Add click listener
                newTitleBar.addEventListener('click', (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`Week accordion ${index} clicked`);
                    this.toggleWeek(weekItem);
                });

                // Initialize first week as open
                if (index === 0) {
                    uploadContent.classList.add('active');
                    this.updateArrowIcon(newTitleBar, true);
                }
            });
        }

        private initLectureAccordions(): void {
            this.lectureItems.forEach((lectureItem: HTMLElement, index: number) => {
                const titleElement = lectureItem.querySelector('.lecture-item-title') as HTMLElement;
                
                if (!titleElement) {
                    console.error(`Lecture item ${index} missing title element`);
                    return;
                }

                // Make sure it's clickable
                titleElement.style.cursor = 'pointer';
                titleElement.style.userSelect = 'none';
                
                // Remove any existing listeners
                const newTitleElement = titleElement.cloneNode(true) as HTMLElement;
                titleElement.parentNode?.replaceChild(newTitleElement, titleElement);
                
                // Add click listener
                newTitleElement.addEventListener('click', (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`Lecture item ${index} clicked`);
                    this.toggleLecture(lectureItem);
                });

                // Start all lecture accordions collapsed by default; user opens on click
            });
        }

        private toggleWeek(weekItem: HTMLElement): void {
            const uploadContent = weekItem.querySelector('.upload-content') as HTMLElement;
            const titleBar = weekItem.querySelector('.title-bar') as HTMLElement;
            
            if (!uploadContent || !titleBar) return;

            const isActive = uploadContent.classList.contains('active');
            
            if (isActive) {
                uploadContent.classList.remove('active');
                this.updateArrowIcon(titleBar, false);
                // When collapsing a week, also collapse any open lecture accordions within it
                const nestedLectures = weekItem.querySelectorAll('.lecture-item');
                nestedLectures.forEach((lecture: Element) => {
                    const contentElements = (lecture as HTMLElement).querySelectorAll('.learning-objectives, .file-upload');
                    contentElements.forEach((el: Element) => el.classList.remove('lecture-active'));
                    const lectureTitle = (lecture as HTMLElement).querySelector('.lecture-item-title') as (HTMLElement | null);
                    if (lectureTitle) {
                        this.updateArrowIcon(lectureTitle, false);
                    }
                });
                console.log('Week collapsed');
            } else {
                // Single-open behavior: close other weeks first
                this.weekAccordions.forEach((otherWeek: HTMLElement) => {
                    if (otherWeek === weekItem) return;
                    const otherContent = otherWeek.querySelector('.upload-content') as (HTMLElement | null);
                    const otherTitle = otherWeek.querySelector('.title-bar') as (HTMLElement | null);
                    if (otherContent && otherContent.classList.contains('active')) {
                        otherContent.classList.remove('active');
                        if (otherTitle) this.updateArrowIcon(otherTitle, false);
                        // Also collapse all lectures within the closed week
                        const otherLectures = otherWeek.querySelectorAll('.lecture-item');
                        otherLectures.forEach((lecture: Element) => {
                            const contentElements = (lecture as HTMLElement).querySelectorAll('.learning-objectives, .file-upload');
                            contentElements.forEach((el: Element) => el.classList.remove('lecture-active'));
                            const lectureTitle = (lecture as HTMLElement).querySelector('.lecture-item-title') as (HTMLElement | null);
                            if (lectureTitle) {
                                this.updateArrowIcon(lectureTitle, false);
                            }
                        });
                    }
                });

                uploadContent.classList.add('active');
                this.updateArrowIcon(titleBar, true);
                console.log('Week expanded');
            }
        }

        private toggleLecture(lectureItem: HTMLElement): void {
            const contentElements = lectureItem.querySelectorAll('.learning-objectives, .file-upload');
            const titleElement = lectureItem.querySelector('.lecture-item-title') as HTMLElement;
            
            if (contentElements.length === 0 || !titleElement) return;

            const isActive = contentElements[0].classList.contains('lecture-active');
            
            // Determine week container to enforce single-open within the same week
            const parentWeek = lectureItem.closest('.week-accordion-item') as (HTMLElement | null);

            if (!isActive) {
                // We are opening this lecture: close all sibling lectures within the same week
                const siblingLectures = (parentWeek ?? document).querySelectorAll('.lecture-item');
                siblingLectures.forEach((sibling: Element) => {
                    if (sibling === lectureItem) return;
                    // Only close siblings that are within the same week container
                    if (parentWeek && !parentWeek.contains(sibling)) return;
                    const sibContent = (sibling as HTMLElement).querySelectorAll('.learning-objectives, .file-upload');
                    sibContent.forEach((el: Element) => el.classList.remove('lecture-active'));
                    const sibTitle = (sibling as HTMLElement).querySelector('.lecture-item-title') as (HTMLElement | null);
                    if (sibTitle) this.updateArrowIcon(sibTitle, false);
                });
            }

            contentElements.forEach((element: Element) => {
                if (isActive) {
                    element.classList.remove('lecture-active');
                } else {
                    element.classList.add('lecture-active');
                }
            });

            this.updateArrowIcon(titleElement, !isActive);
            console.log(isActive ? 'Lecture collapsed' : 'Lecture expanded');
        }

        private updateArrowIcon(element: HTMLElement, isOpen: boolean): void {
            // Prefer Feather's replaced SVG icon if available
            const svgArrow = element.querySelector('svg.feather.feather-arrow-down') as (SVGElement | null);
            if (svgArrow) {
                svgArrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                svgArrow.style.transition = 'transform 0.3s ease';
                return;
            }

            // Fallback to the original <i data-feather> element (pre-replacement)
            const legacyIcon = element.querySelector('[data-feather="arrow-down"]') as (HTMLElement | null);
            if (legacyIcon) {
                legacyIcon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                legacyIcon.style.transition = 'transform 0.3s ease';
            }
        }

        private initFeatherIcons(): void {
            try {
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                    console.log('Feather icons initialized');
                } else {
                    console.warn('Feather icons not available');
                }
            } catch (error) {
                console.error('Error initializing Feather icons:', error);
            }
        }
    }

    // Initialize the accordion
    try {
        const accordion = new DocumentAccordion();
        (window as any).accordion = accordion; // For debugging
    } catch (error) {
        console.error('Failed to initialize accordion:', error);
    }
});