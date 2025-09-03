// Render the onboarding flow

/**
 * Renders the onboarding page and orchestrates the 7-step onboarding flow:
 * 1) Getting Started
 * 2) Course Name
 * 3) Instructor Name
 * 4) Teaching Assistant Name
 * 5) Course Frame
 * 6) Content Count
 * 7) Finalization
 *
 * After successful completion, the gathered class metadata (activeClass) is persisted
 * and the user is redirected to the documents page.
 *
 * Notes:
 * - The provided instructorClass object is only mutated after final confirmation.
 *
 * @param instructorClass - Class metadata accumulated during onboarding
 * @returns void
 *
 * @author: gatahcha
 * @date: 2025-08-24
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { activeClass, ContentDivision, CourseContent, onBoardingScreen} from "../../../src/functions/types.js";

export const renderOnboarding = async ( instructorClass : activeClass ): Promise<void> => {

    console.log("renderOnboarding is called");
    let debugNumber = 0;
    //display carrousel
    let currentScreen : onBoardingScreen = onBoardingScreen.GettingStarted;
    const totalScreen = 7;

    const currentClass : activeClass = {
        id: '',
        date: new Date(),
        onBoarded: false,
        name: '',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 0,
        divisions: []
    }

    const container = document.getElementById('main-content-area');

    console.log("container is : " + container);
    if (!container) return;

    console.log("loadComponentHTML is called");
    return loadComponentHTML('onboarding')
        .then( html => {
            debugNumber = 1;
            container.innerHTML = html;
            return new Promise(resolve => requestAnimationFrame(resolve));
        } )
        .then( () => {
            debugNumber = 2;
            updateUI();
            return new Promise(resolve => requestAnimationFrame(resolve));
        } )
        .then( () => {
            debugNumber = 3;
            setEventListeners();
        } )
        .catch( () => {
            console.log("DEBUG #22 number : " + debugNumber);
        } 
    );

    /** ########################################################## */
    /** #####################  FUNCTIONS  ###################### */
    /** ########################################################## */

    /**
     * Add an instructor to the internal currentClass data structure,
     * then re-render the instructor list components.
     */
    function addInstructor() : void {

        // Find the appropriate input element for adding an instructor
        let inputEl: HTMLInputElement | null;;
        let instructorName;
        switch ( currentScreen ) {
            case onBoardingScreen.InstructorName:
                inputEl = document.getElementById('instructorInput') as HTMLInputElement;
                break;
            case onBoardingScreen.Finalization:
                inputEl = document.getElementById('instructorInputFinal') as HTMLInputElement;
                break;
            default:
                inputEl = null;
        }
        if (!inputEl) return;

        // Read the input value
        instructorName = inputEl.value.trim();

        if (!instructorName || instructorName === '') {
            showAlertModal("please input the valid instructor")
            return;
        }

        // Persist to current class state
        currentClass.instructors.push(instructorName);
        inputEl.value = '';

        // Re-render instructor components
        renderInstructor();
    }

    /**
     * Remove an instructor from currentClass and re-render the lists.
     * @param name Name of the instructor to remove
     */
    function removeInstructor(name : string) : void {
        const index = currentClass.instructors.indexOf(name);
        if (index > -1) {
            currentClass.instructors.splice(index, 1);
            renderInstructor();
        } 
    }

    /**
     * Add a teaching assistant to currentClass and re-render the lists.
     */
    function addTA() : void {

        let inputEl: HTMLInputElement | null;;
        let taName;
        
        switch ( currentScreen ) {
            case onBoardingScreen.TAName:
                inputEl = document.getElementById('taInput') as HTMLInputElement;
                break;
            case onBoardingScreen.Finalization:
                inputEl = document.getElementById('taInputFinal') as HTMLInputElement;
                break;
            default:
                inputEl = null;
        }

        if (!inputEl) return;
        taName = inputEl.value.trim();
        currentClass.teachingAssistants.push(taName);
        inputEl.value = ''

        renderTA();

    }

    /**
     * Remove a teaching assistant from currentClass and re-render the lists.
     * @param name Name of the teaching assistant to remove
     */
    function removeTA(name : string) : void {
        const index = currentClass.teachingAssistants.indexOf(name);
        if (index > -1) {
            currentClass.teachingAssistants.splice(index, 1);
            renderTA();
        } 
    }


    /** ########################################################## */
    /** ##############  RENDER AND UPDATES  ###################### */
    /** ########################################################## */

    /**
     * Activate the current screen and deactivate all others.
     */
    function updateUI() : void {

        //element variables
        const allScreenEl = document.querySelectorAll('.screen');

        //deactivate all screen components
        allScreenEl.forEach(element => {
            element.classList.remove('active');
        });

        const screenId = `screen-${currentScreen}`;
        let screenElement = document.getElementById(screenId);
        
        if (screenElement) {
            screenElement.classList.add('active');
        } 
        else {
            screenElement = document.getElementById('screen-1');
            if (screenElement) screenElement.classList.add('active');
        }
    }

    
    /**
     * Render instructor chips for both the entry step and the confirmation step.
     */
    function renderInstructor() : void {
        
        // Render for both the instructor input page and the confirmation page
        let instructorListEl : HTMLElement| null = document.getElementById('instructorsList');
        let instructorListFinalEl : HTMLElement| null = document.getElementById('instructorsListFinal');

        if (!instructorListEl) return;
        instructorListEl.innerHTML = "";

        if (!instructorListFinalEl) return;
        instructorListFinalEl.innerHTML = "";

        // Empty-state message when no instructors are present
        if (currentClass.instructors.length === 0) {
            let emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.textContent = "No Instructor added yet";
            instructorListEl.appendChild(emptyDiv);

            let emptyDivCopy = emptyDiv.cloneNode(true);
            instructorListFinalEl.appendChild(emptyDivCopy);
        }
        else {
            currentClass.instructors.forEach( name => {

                const tagSpan = document.createElement('span');
                tagSpan.className = 'class-item-tag'
                tagSpan.appendChild(document.createTextNode(name + ''));

                //add remove button
                const removeBtn = document.createElement('button');
                removeBtn.textContent = 'x';
                removeBtn.addEventListener('click', () => removeInstructor(name) );

                tagSpan.appendChild(removeBtn);
                instructorListEl.appendChild(tagSpan);

                //adding to the confirmation page
                const tagSpanCopy = tagSpan.cloneNode(true) as HTMLElement;
                const cloneRemoveButton = tagSpanCopy.querySelector('button');
                if (!cloneRemoveButton) {
                    return;
                }
                cloneRemoveButton.addEventListener( 'click', ()=>removeInstructor(name) );
                instructorListFinalEl.appendChild(tagSpanCopy);

            } );
        }

    }


    /**
     * Render teaching assistant chips for both the entry step and the confirmation step.
     */
    function renderTA() : void {
        
        // Render for both the TA input page and the confirmation page
        let TAListEl : HTMLElement| null = document.getElementById('tasList');
        let TAListFinalEl : HTMLElement| null = document.getElementById('tasListFinal');

        if (!TAListEl) return;
        TAListEl.innerHTML = "";

        if (!TAListFinalEl) return;
        TAListFinalEl.innerHTML = "";

        // Empty-state message when no TAs are present
        if (currentClass.teachingAssistants.length === 0) {
            let emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.textContent = "No TA added yet";
            TAListEl.appendChild(emptyDiv);

            let emptyDivCopy = emptyDiv.cloneNode(true);
            TAListFinalEl.appendChild(emptyDivCopy);
        }
        else {
            currentClass.teachingAssistants.forEach( name => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'class-item-tag'
                tagSpan.appendChild(document.createTextNode(name + ''));

                //add remove button
                const removeBtn = document.createElement('button');
                removeBtn.textContent = 'x';
                removeBtn.addEventListener('click', () => removeTA(name) ); // Fixed: was removeInstructor

                tagSpan.appendChild(removeBtn);
                TAListEl.appendChild(tagSpan);

                // Add to the confirmation page
                const tagSpanCopy = tagSpan.cloneNode(true) as HTMLElement;
                const cloneRemoveButton = tagSpanCopy.querySelector('button');
                if (!cloneRemoveButton) {
                    return;
                }
                cloneRemoveButton.addEventListener( 'click', ()=>removeTA(name) );
                TAListFinalEl.appendChild(tagSpanCopy);
            } );
        }
    }

    /**
     * Validate the current step, persist values into currentClass, and advance the flow.
     */
    function nextScreen() : void {

        switch(currentScreen) {
            case onBoardingScreen.CourseName:
                const classnameBox = document.getElementById('className') as HTMLInputElement;
                const classNameStr = classnameBox.value;
                if (classNameStr && classNameStr !== '') {
                    currentClass.name = classNameStr;
                    
                    // Reflect the value on the confirmation page
                    const classNameFinalEl = document.getElementById('classNameFinal') as HTMLInputElement;
                    classNameFinalEl.value = currentClass.name;

                    break; 
                } 
                showAlertModal('please enter the valid course name');
                return;
            case onBoardingScreen.InstructorName:
                if (currentClass.instructors.length > 0) break;
                // Require at least one instructor
                showAlertModal("At least one instructor is required");
                return;
            case onBoardingScreen.TAName:
                if (currentClass.teachingAssistants.length > 0) break;
                // Require at least one teaching assistant
                showAlertModal("At least one Teaching Assistant is required");
                return;
            case onBoardingScreen.CourseFrame:
                // Course frame invariant: must be one of the two radio options
                const frameElement = document.querySelector('input[name="division"]:checked') as HTMLInputElement ;
                if (!frameElement) return;
                currentClass.frameType = frameElement.value === 'byWeek' ? 'byWeek' : 'byTopic';
                
                // Reflect the value on the confirmation page
                const manageOptionFinalEl = document.querySelector(`input[name="manageSelect"][value="${currentClass.frameType}"]`) as HTMLInputElement;
                if (!manageOptionFinalEl) return;
                manageOptionFinalEl.checked = true;
                break;
            case onBoardingScreen.ContentNumber:
                const contentNumberEl = document.getElementById('countInput') as HTMLInputElement;
                if(!contentNumberEl) return;
                const contentNumberStr = contentNumberEl.value.trim();
                const contentNumber = parseInt(contentNumberStr);
                currentClass.tilesNumber = contentNumber;

                // Reflect the value on the confirmation page
                const countInputFinalEl = document.getElementById('countInputFinal') as HTMLInputElement;
                if (!countInputFinalEl) return;
                countInputFinalEl.value = currentClass.tilesNumber.toString();

                break;
            default:
                console.log("DEBUG #29 : nextScreen");
        }
        
        // Advance to the next screen
        if (currentScreen < totalScreen) transitionToScreen( currentScreen + 1, 'next' );
    }


    /**
     * Navigate to the previous screen if available.
     */
    function backScreen() : void {
        if (currentScreen > 1) transitionToScreen(currentScreen - 1, 'left' );
    }


    /**
     * Validate all fields on the confirmation step, persist into the provided
     * instructorClass, and dispatch the completion event.
     */
    async function finalConfirmation() {

        // Check the course name
        const courseNameConfirmEl = document.getElementById("classNameFinal") as HTMLInputElement;
        if (!courseNameConfirmEl) return; 
        const courseNameConfirm = courseNameConfirmEl.value;
        if (!courseNameConfirm || courseNameConfirm === '' ){
            showAlertModal("Please inpt the valid course number");
            return;
        }

        currentClass.name = courseNameConfirm;

        // Ensure at least one instructor exists (list already maintained in currentClass)
        if (currentClass.instructors.length === 0) {
            showAlertModal("At least one insturctor is required");
            return;
        } 

        // Ensure at least one teaching assistant exists (list already maintained in currentClass)
        if (currentClass.teachingAssistants.length === 0) {
            showAlertModal("At least one teaching assistant is required");
            return;
        }

        // Validate the number of topics/weeks is within 1-52
        const numTopicEl = document.getElementById('countInputFinal') as HTMLInputElement;
        const numTopicValue = parseInt(numTopicEl.value);

        //check numvalue topic based on the content division type
        if (currentClass.frameType === 'byWeek') {
            if (numTopicValue > 14 || numTopicValue==0) {
                showAlertModal("Number of topics/weeks must be between 1 and 14");
                return;
            }
        }
        else {
            if (numTopicValue > 52 || numTopicValue==0) {
                showAlertModal("Number of topics/weeks must be between 1 and 52");
                return;
            }
        }

        currentClass.tilesNumber = numTopicValue;

        currentClass.onBoarded = true;

        // POST currentClass to the database (handled by backend)
        try {
            console.log("posting currentClass to the database");
            console.log("currentClass is : ", currentClass);
            const postedCurrentClass = await postCurrentClassToDatabase(currentClass);
            Object.assign(currentClass, postedCurrentClass);
            Object.assign(instructorClass, postedCurrentClass);
            console.log("postedCurrentClass is : ", postedCurrentClass);
            
        } catch (error) {
            console.error('Error posting currentClass to the database:', error);
            showAlertModal('Error posting currentClass to the database');
            currentClass.onBoarded = false;
            return;
        } finally {
            Object.assign(instructorClass, currentClass);
            window.dispatchEvent(new CustomEvent('onboardingComplete'));
        }
    }



    /**
     * Animate the transition between screens and update the currentScreen value.
     */
    function transitionToScreen (targetScreen : onBoardingScreen, direction : 'next' | 'left') {
        const currentScreenEl = document.getElementById(`screen-${currentScreen}`);
        const targetScreenEl = document.getElementById(`screen-${targetScreen}`);

        if (!currentScreenEl) return;
        if (!targetScreenEl) return;

        // Remove any existing animation classes
        currentScreenEl.className = "screen active";
        targetScreenEl.className = "screen";

        // Add animation classes based on direction
        if (direction === 'next') {
            currentScreenEl.classList.add('slide-out-left');
            targetScreenEl.classList.add('slide-in-right');
        }
        else {
            currentScreenEl.classList.add('slide-out-right');
            targetScreenEl.classList.add('slide-in-left');
        }



        // Clean up after the animation completes
        setTimeout( () => {
            currentScreenEl.classList.remove('active');
            currentScreenEl.className = 'screen';
            targetScreenEl.className = 'screen active';
            currentScreen = targetScreen;
        }, 400 ) 


    }

    /** ########################################################## */
    /** #################  EVENT LISTENERS  ###################### */
    /** ########################################################## */
    
    /**
     * Set up all event listeners required across onboarding pages.
     */
    function setEventListeners() : void {
        initPageButtonEventListeners();
        SetPageThreeEventListeners();
        setPageFourEventListeners();
        setPageSevenEventListeners();
    }
    
    /**
     * Set up event listeners for page 3, including:
     * - Pressing Enter in the input adds the entered value
     */
    function SetPageThreeEventListeners () : void {
        const addInstructorBtn = document.getElementById('instructorAddBtn');
        if (!addInstructorBtn) return;
        addInstructorBtn.addEventListener('click', addInstructor);

        const instructorInputEl = document.getElementById('instructorInput') as HTMLInputElement;
        if (!instructorInputEl) return;
        instructorInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation
                addInstructor();
            }
        });
    }

    /**
     * Set up event listeners for page 4 (Teaching Assistant entry).
     */
    function setPageFourEventListeners () : void {
        const addTABtn = document.getElementById('taAddBtn');
        if (!addTABtn) {
            return;
        }
        addTABtn.addEventListener('click', addTA);

        const taInputEl  = document.getElementById('taInput');
        if (!taInputEl) return;
        taInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addTA();
            }
        });

    }

    /**
     * Set up event listeners for page 7 (Final confirmation and submission).
     */
    function setPageSevenEventListeners () {

        // Set event listeners for the instructor and TA inputs
        const instructorInputList = document.getElementById('instructorInputFinal') as HTMLInputElement;
        if (!instructorInputList) return;
        instructorInputList.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addInstructor();
            }
        })

        const taInputFinalList = document.getElementById('taInputFinal');
        if (!taInputFinalList) return;
        taInputFinalList.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addTA();
            }
        })

        // Add button listeners on the confirmation page (instructor)
        const addInstructorBtnFinal = document.getElementById('instructorAddBtnFinal');
        if (!addInstructorBtnFinal) {
            return;
        }
        addInstructorBtnFinal.addEventListener('click', addInstructor);

        // Add button listeners on the confirmation page (TA)
        const addTABtn = document.getElementById('taAddBtnFinal');
        if (!addTABtn) {
            return;
        }
        addTABtn.addEventListener('click', addTA);

        // Finalize submission
        const finalSubmissionBtn = document.getElementById('submitOnboarding');
        if (!finalSubmissionBtn) {
            showAlertModal("final submission button is problematic, check again");
            return;
        }

        finalSubmissionBtn.addEventListener('click', async () => await finalConfirmation() );

        return;
    }

    /**
     * Initialize the Next/Back navigation button listeners for all pages.
     */
    function initPageButtonEventListeners () : void {
        // Add event listeners to navigate pages
        // Remove inline onClick handlers on buttons (handled via JS here)
        const nextScreenBtns = document.querySelectorAll('.btn-next');
        const backScreenBtns = document.querySelectorAll('.btn-back');

        nextScreenBtns.forEach(button => {
            button.addEventListener('click', nextScreen);
        });
        backScreenBtns.forEach(button => {
            button.addEventListener('click', backScreen);
        });
        
    }

    /**
     * Display a simple alert modal with provided text content.
     * @param textContent Message to show in the modal
     */
    function showAlertModal(textContent: string): void {
        // Create modal overlay
        const modalEl = document.createElement('div');
        modalEl.className = 'modal-overlay';

        // Create alert modal container
        const alertModalEl = document.createElement('div');
        alertModalEl.className = 'alert-modal';

        // Create alert header
        const alertHeaderEl = document.createElement('div');
        alertHeaderEl.className = 'alert-header';
        
        const headerTextEl = document.createElement('p');
        headerTextEl.textContent = 'ALERT!';
        alertHeaderEl.appendChild(headerTextEl);

        // Create modal content
        const modalContentEl = document.createElement('div');
        modalContentEl.className = 'modal-content';
        
        // Create content text
        const contentTextEl = document.createElement('p');
        contentTextEl.textContent = textContent;
        
        // Create close button
        const closeButtonEl = document.createElement('button');
        closeButtonEl.id = 'close-modal';
        closeButtonEl.className = 'close-modal';
        closeButtonEl.textContent = 'Okay';
        
        // Add close functionality
        closeButtonEl.addEventListener('click', () => {
            modalEl.remove(); // Remove the entire modal from DOM
        });

        // Append content elements to modal content
        modalContentEl.appendChild(contentTextEl);
        modalContentEl.appendChild(closeButtonEl);

        // Append header and content to alert modal
        alertModalEl.appendChild(alertHeaderEl);
        alertModalEl.appendChild(modalContentEl);

        // Append alert modal to overlay
        modalEl.appendChild(alertModalEl);

        // Add modal to document body
        document.body.appendChild(modalEl);

        // Show the modal (assumes a .show CSS class is defined)
        modalEl.classList.add('show'); // or modalEl.style.display = 'flex';
    }

    /**
     * return the currentClass from backend
     */
    async function postCurrentClassToDatabase(currentClass: activeClass): Promise<activeClass> {

        console.log("postCurrentClassToDatabase is called");
        console.log("currentClass is : ", currentClass);

        const response = await fetch('/api/mongodb/courses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentClass)
        });

        console.log("response is : ", response);
        
        if (!response.ok) {
            throw new Error('Failed to post currentClass to the database');
        }
        
        const result = await response.json();
        return result.data as activeClass;
    }
}