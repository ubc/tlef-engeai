# EngE-AI Development Tasks

## Project Overview
AI-powered study assistant platform for engineering students with RAG integration and Canvas embedding.

## Current Status
- ✅ Basic instructor mode interface
- ✅ Document upload functionality
- ✅ RAG integration with Qdrant
- ✅ Chat interface with streaming responses
- 🔄 Document management improvements needed


##CATCHES 
- The TS-JS translation is done automatically, you do not need to write any code in any dist folder
YOu can access the terminal only to see if the file is properly compiled

## High Priority Tasks

### 1. Document Management Improvements

 - [X] **Remove description in the learning objectives**
   - Previously, learning objerctive has both title and the description. I want you cemove the description and title thing, and replace it with just learning objective. Just IT
   - TO do so, make usre you properly modify
     - 1. Data Structure
     - 2. View on the onboardind
     - 3. View on the document menu
     - 4. Backend integration
     - 5. Anything related with that
     - 6. Change the title in to just learning objective
     - 7. Remove all component or part that is related to the description of learnign objective, e.g CSS, or anything  related

  - [X] **Clicking add or remove learning objective in both onboarding and the document will both trigger to the database**
    - Please make an API Call for this learning objective, both post, get and delete
    - Mkase sure the rendering follows the proper asynchronous flows
  
### UI IMPROVEMENT
  - [] Switching error to modal overlay
    - Some of the front end error are displayed using console.log or console.error. I want you to use the modal overlay what I have defined and use it to display the rror
    - I want you to resolve the rubberband issue in the onboarding ,Why is that can happend

### DEBUG SETUP

- [X] **Create a pseudoclass**
  - Make an active course in the database, so called "APSC 099 : Engineering for Kindergarten", what uses bytopic division with 10 modules. Each modules will have learnign objectives (2 - 3). Make it creative and structurized. Make sure this class's obboarding stages are true.This dummy example is singleton inside the database. Meaning that when the nodeJS is setup, ou check if this course is available in the database. if not, then you make on.
  - I also want to ask you to make abother dummy couse "APSC 080", where the course is setteled, but the document onboarding has not been done yet, so if my PI went to this class, you expect him to see the bashboard of the document onboarding.
  - Make sure that all method in this dummy example is done in one file an in the database, the document is a singleton, meaning it only can be created once. 
  - Make sure you edit the index.html that follows this newly created classes and its description, you know the description should shows : "course onboarding view" (APSC 080), "Setteled COurse" (APSC 099), so that my PI has access to see the interface. 
  - Make sure you have a reset button where this button is cabale to reset the value for both APSC 080 and APSC 099 to its original value (the thing that I expain to you for subpoint 1 and subpoint 2). So this reset button also located in the index.html and it should be able to remove APSC 080 and APSC 099 and upload again with the origin value that we have discuss. 


 - [X] **IMPLEMENT RAG from UBC-genai-toolkit-rag**
   - Look at the UBC-genai-toolkit-rag module, we knwo that i have made the tempfiles, so essentially after you write the file in the tempfiles, I want you to upload that file to the rag, using the module that has been decalared in the UBC-genai-toolkit-rag module
   - before you make the implementation, please make a proper workflow so that the implementation can be done in the least itteration.
   - Eventually, you obviously need to remove the file from the tempfiles. So I need you to make a fucntion that remove this file in the temp files, and I want the line where you demove that file is commented out as easier for me to debug the file. 
   - Make sure you state the datastructure properly.


  - [] Implement Chat conversation
    - Now We are going to create the chat Interface. I want you to read the ubc-genai-toolkit-llm and chatapp.ts. Let me know What you see. Tell me what is your strategy.
    - Right Now, I just want you to so that the chat is properly interact wiht the LLM (Do not implement RAG yet).
   

## Medium Priority Tasks

## Low Priority Tasks


## Bug Fixes

### Current Issues
- [ ] **Document upload endpoint mismatch**
  - RAGService.ts uses `/api/qdrant/documents`
  - Should use `/api/rag/documents/*`
  - Status: Identified
  - Priority: High

- [ ] **TypeScript compilation workflow**
  - Manual compilation required
  - Files not auto-compiling
  - Status: Identified
  - Priority: High

## Development Notes

### Next Session Goals
1. Fix document upload endpoint mismatch
2. Implement document search functionality
3. Test complete document workflow

### Architecture Decisions
- Using TypeScript for frontend
- RAG integration with Qdrant
- MongoDB for data persistence
- Canvas iframe embedding

### Code Standards
- Follow existing TypeScript patterns
- Use proper error handling
- Maintain Canvas compatibility
- Document all functions with JSDoc

---

## Task Status Legend
- ✅ Completed
- 🔄 In Progress
- ⏳ Pending
- ❌ Blocked
- 🐛 Bug

## Priority Levels
- **High**: Critical for MVP
- **Medium**: Important for functionality
- **Low**: Nice to have features
