//render onboarding

import { getCallSites } from "util";
import { loadComponentHTML } from "../functions/api.js";
import { activeClass, onBoardingScreen} from "../functions/types.js";

export const renderOnboarding = async ( instructorClass : activeClass ): Promise<void> => {

    let debugNumber = 0;
    //display carrousel
    let currentScreen : onBoardingScreen = onBoardingScreen.GettingStarted;

    const currentClass : activeClass = {
        onBoarded : false,
        name: '',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 0,
    }

    const container = document.getElementById('main-content-area');
    if (!container) return;

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
        } );


    /**
     * FUNCTIONS 
     */


    function addInstructor() : void {

        //fincing HTML input element for add isnsturctor
        let inputEl: HTMLInputElement | null;;
        let instructorName;
        switch ( currentScreen ) {
            case onBoardingScreen.InstructorName:
                inputEl = document.getElementById('instructorInput') as HTMLInputElement;
                break;
            case onBoardingScreen.Finalization:
                inputEl = document.getElementById('instructorNameInput') as HTMLInputElement;
                break;
            default:
                inputEl = null;
        }
        if (!inputEl) return;

        // find the value 
        instructorName = inputEl.value.trim();

        if (!instructorName || instructorName === '') {
            alert("please input the correct instructor");
            return;
        }

        //push into the classList
        currentClass.instructors.push(instructorName);
        inputEl.value = '';

        //render isntructor's component
        renderInstructor();
    }

    function removeInstructor(name : string) : void {
        const index = currentClass.instructors.indexOf(name);
        if (index > -1) {
            currentClass.instructors.splice(index, 1);
            renderInstructor();
        } 
    }

    function addTA() : void {

        let inputEl: HTMLInputElement | null;;
        let taName;
        
        switch ( currentScreen ) {
            case onBoardingScreen.TAName:
                inputEl = document.getElementById('taInput') as HTMLInputElement;
                break;
            case onBoardingScreen.Finalization:
                inputEl = document.getElementById('taNameInput') as HTMLInputElement;
                break;
            default:
                console.log("DEBUG #28");
                inputEl = null;
        }

        console.log("DEBUG #27 : ");
        if (!inputEl) return;
        console.log("DEBUG #28 : ");
        taName = inputEl.value.trim();
        currentClass.teachingAssistants.push(taName);
        inputEl.value = ''

        renderTA();

    }

    function removeTA(name : string) : void {

        console.log("DEBUG #40");

        const index = currentClass.teachingAssistants.indexOf(name);
        if (index > -1) {
            currentClass.teachingAssistants.splice(index, 1);
            renderTA();
        } 
    }


    /**
     * RENDER AND UPDATES
     */

    function updateUI() : void {

        console.log("DEBUG #34");
        console.log(JSON.stringify(currentClass));

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
            console.log(`Screen element not found: screen-${currentScreen}`);
            screenElement = document.getElementById('screen-1');
            if (screenElement) screenElement.classList.add('active');
        }
    }
    
    function renderInstructor() : void {

        console.log("DEBUG #24 : + " + currentClass);
        
        //apply render instructor for both steps instructor input page + confirmation page
        let instructorListEl : HTMLElement| null = document.getElementById('instructorsList');
        let instructorListFinalEl : HTMLElement| null = document.getElementById('instructorsListFinal');

        if (!instructorListEl) return;
        instructorListEl.innerHTML = "";

        if (!instructorListFinalEl) return;
        instructorListFinalEl.innerHTML = "";

        //setting notification if there is no isntructor
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

                console.log("DEBUG #25 : name-" + name);

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
                    console.log("DEBUG #41 : " + "cloneRemoveButton Problematic");
                    return;
                }
                cloneRemoveButton.addEventListener( 'click', ()=>removeInstructor(name) );
                instructorListFinalEl.appendChild(tagSpanCopy);

            } );
        }

    }


    function renderTA() : void {
    
        //apply render TA for both steps TA input page + confirmation page
        let TAListEl : HTMLElement| null = document.getElementById('tasList');
        let TAListFinalEl : HTMLElement| null = document.getElementById('tasListFinal');

        if (!TAListEl) return;
        TAListEl.innerHTML = "";

        if (!TAListFinalEl) return;
        TAListFinalEl.innerHTML = "";

        //setting notification if there is no TA
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

                //adding to the confirmation page
                const tagSpanCopy = tagSpan.cloneNode(true) as HTMLElement;
                const cloneRemoveButton = tagSpanCopy.querySelector('button');
                if (!cloneRemoveButton) {
                    console.log("DEBUG #42 : " + "cloneRemoveButton Problematic \\ TA");
                    return;
                }
                cloneRemoveButton.addEventListener( 'click', ()=>removeTA(name) );
                TAListFinalEl.appendChild(tagSpanCopy);
            } );
        }
    }

    function nextScreen() : void {

        let screenCurrentEl : HTMLElement | null;
        let screenNextEl : HTMLElement | null;

        //setting exception pop up when citeria is not satisfied

        switch(currentScreen) {
            case onBoardingScreen.CourseName:
                const classnameBox = document.getElementById('className') as HTMLInputElement;
                const classNameStr = classnameBox.value;
                if (classNameStr && classNameStr !== '') {
                    currentClass.name = classNameStr;
                    
                    //change variables in the confirmation page
                    const classNameFinalEl = document.getElementById('classNameFinal') as HTMLInputElement;
                    classNameFinalEl.value = currentClass.name;

                    break; 
                } 
                alert('please enter the correct course number');
                return;
            case onBoardingScreen.InstructorName:
                if (currentClass.instructors.length > 0) break;
                //put pop up information that the number of instructor should be more than 1
                alert("number of instructor should be at least 1");
                return;
            case onBoardingScreen.TAName:
                if (currentClass.teachingAssistants.length > 0) break;
                //put pop up information that the number of instructor should be more than 1
                alert("number of TA should be morethan 1");
                return;
            case onBoardingScreen.CourseFrame:
                //course frame invariant : its either between those two options
                const frameElement = document.querySelector('input[name="division"]:checked') as HTMLInputElement ;
                if (!frameElement) return;
                currentClass.frameType = frameElement.value === 'byWeek' ? 'byWeek' : 'byTopic';
                
                //modifying value on the confirmation page
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

                //modifying value on the confirmation page
                const countInputFinalEl = document.getElementById('countInputFinal') as HTMLInputElement;
                if (!countInputFinalEl) return;
                countInputFinalEl.value = currentClass.tilesNumber.toString();

                break;
            default:
                console.log("DEBUG #29 : nextScreen");
        }
        
        //setting next screen
        switch(currentScreen){
            case onBoardingScreen.GettingStarted:
            case onBoardingScreen.CourseName:
            case onBoardingScreen.InstructorName:
            case onBoardingScreen.TAName:
            case onBoardingScreen.CourseFrame:
            case onBoardingScreen.ContentNumber:
                screenCurrentEl = document.getElementById(`screen-${currentScreen}`);
                screenNextEl = document.getElementById(`screen-${currentScreen + 1}`);
                break;
            default:
                screenCurrentEl = null;
                screenNextEl = null;
                alert("next screen is not found");
                break;
        }

        if (!screenCurrentEl) return;
        if (!screenNextEl) return;

        currentScreen++;
        updateUI();
    }


    function backScreen() : void {
    
        let screenCurrentEl : HTMLElement | null;
        let screenPrevEl : HTMLElement | null;

        switch(currentScreen){
            case onBoardingScreen.CourseName:
            case onBoardingScreen.InstructorName:
            case onBoardingScreen.TAName:
            case onBoardingScreen.CourseFrame:
            case onBoardingScreen.ContentNumber:
            case onBoardingScreen.Finalization:
                screenCurrentEl = document.getElementById(`screen-${currentScreen}`);
                screenPrevEl = document.getElementById(`screen-${currentScreen - 1}`);
                break;
            
            default:
                screenCurrentEl = null;
                screenPrevEl = null;
                alert("previous screen is not found");
                return;
        }

        if (!screenCurrentEl) return;
        if (!screenPrevEl) return;

        screenCurrentEl.classList.remove('active');
        screenPrevEl.classList.add('active');
        
        currentScreen--;
        updateUI();
    }

    function finalConfirmation() {

        //check the course name
        const courseNameConfirmEl = document.getElementById("classNameFinal") as HTMLInputElement;
        if (!courseNameConfirmEl) {
            alert("course name confirm element is problematic");
            return;
        }
        const courseNameConfirm = courseNameConfirmEl.value;
        if (!courseNameConfirm || courseNameConfirm === '' ){
            alert("course name confirm cannot be empty");
            return;
        }

        currentClass.name = courseNameConfirm;


        //check the instructor (the list is directly modifie in the currentClass.instructor)
        if (currentClass.instructors.length === 0) {
            alert("instrcutors cannot be 0");
            return;
        } 

        //check TA name (the list is directly modified from the currentclass.Teaching assistants);
        if (currentClass.teachingAssistants.length === 0) {
            alert("teaching assistant cannot be 0");
            return;
        }

        //check if number of topics or week cannot exceed 52 or lessthan 0
        const numTopicEl = document.getElementById('countInputFinal') as HTMLInputElement;
        const numTopicValue = parseInt(numTopicEl.value);

        if (numTopicValue > 52 || numTopicValue==0){
            alert("Topic / Week cannot exced 52");
            return;
        }

        currentClass.tilesNumber = numTopicValue;

        currentClass.onBoarded = true;

        //POST currentClass to database

        //wait until the response is 200 ok
        Object.assign(instructorClass, currentClass);

        window.dispatchEvent(new CustomEvent('onboardingComplete'));
    }

    /**
     * EVENT LISTENERS
     */
    //add event listener to the button

    function setEventListeners() : void {
        initPageButtonEventListeners();
        SetPageThreeEventListeners();
        setPageFourEventListeners();
        setPageFiveEventListeners();
        setPageSixEventListeners();
        setPageSevenEventListeners();
    }

    //PAGE 3
    function SetPageThreeEventListeners () : void {
        const addInstructorBtn = document.getElementById('instructorAddBtn');
        if (!addInstructorBtn) {
            alert("instructor add button is problematic")
            return;
        }
        addInstructorBtn.addEventListener('click', addInstructor);

        const instructorInputEl = document.getElementById('instructorInput') as HTMLInputElement;
        if (!instructorInputEl) return;
        instructorInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addInstructor();
            }
        });
    }

    function setPageFourEventListeners () : void {
        const addTABtn = document.getElementById('taAddBtn');
        if (!addTABtn) {
            alert("TS add button is problematic")
            return;
        }
        addTABtn.addEventListener('click', addTA);

        const taInputEl  = document.getElementById('taInput');
        if (!taInputEl) return;
        taInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTA();
            }
        });

    }

    function setPageFiveEventListeners () {
        
    }

    function setPageSixEventListeners () {

        return;
    }

    function setPageSevenEventListeners () {

        //add event listener at confirmation page to the instructor
        const addInstructorBtnFinal = document.getElementById('instructorAddBtnFinal');
        if (!addInstructorBtnFinal) {
            alert("instructorxxxx add button is problematic")
            return;
        }
        addInstructorBtnFinal.addEventListener('click', addInstructor);

        //add event listener at confirmation page to the TA
        const addTABtn = document.getElementById('taAddBtnFinal');
        if (!addTABtn) {
            alert("TS add button is problematic")
            return;
        }
        addTABtn.addEventListener('click', addTA);

        //finalize submission
        const finalSubmissionBtn = document.getElementById('submitOnboarding');
        if (!finalSubmissionBtn) {
            alert("final submission button is problematic, check again");
            return;
        }

        finalSubmissionBtn.addEventListener('click', finalConfirmation );

        return;
    }

    function initPageButtonEventListeners () {
        //add event listeners to next page
        //remove onCLick on every button
        const nextScreenBtns = document.querySelectorAll('.btn-next');
        const backScreenBtns = document.querySelectorAll('.btn-back');

        nextScreenBtns.forEach(button => {
            console.log("DEBUG #20");
            button.addEventListener('click', nextScreen);
        });
        backScreenBtns.forEach(button => {
            button.addEventListener('click', backScreen);
        });
    }
    
}