# Scope

EngE-AI is a vanilla Typescript application supported by preconfigured UBC's infrastrcuture and shared development tools. This page outlines your responsibilities as a developer, the system maintained by the project team, and the boundaries of your role throughout your development phase. This page covers:

1. Maintained Areas
2. Continuos integration and Continuous Delivery
3. GenAI toolkits
4. Out of Responisbilities
5. Recommendations
6. Conclusion

## Maintained Areas

EngE-AI runs on UBC-supported infrastructure, which provides the hosting environment for the application adn its supporting services. These services may include the application server, mongo and vector database, UBC authentication integration. 

Both the [staging](https://engeai.staging.apps.ltic.ubc.ca/) and [production](https://engeai.apps.ltic.ubc.ca/) environments are both hosted under UBC’s infrastructure. The next section explains how code moves through local development, staging, and production.

The project's software infrastructure has been pre-configured. As a developer you are responsible includees:

1. **Implementating and maintaining on the application code** 
   
   Develop features in the project repository and ensure that your code builds and  runs both locally and in the deployed environments. Use the projects documented `Node.JS`  and `npm versions` to reduce environment-related problems.


2. **Using apporved dependencies**
   
   Use libraries approved for the porject, including UBC's LTIC-maintained libraries where they meet the porject's need. Consult to your supervisor before adding a new dependency so that the security, maintanance, and suitability can be thoroughly assessed.


3. **Explaining and Justifying technical decision**
    
    AI-Assisted Coding Tools can speed-up implementaion, but developers remain responsible for understanding, testing, and explaining the code they introduce. You may document the reasoning behind significant technical decision, and consult to your supervisor. We will discuss further in [Agentic Engineering](/docs/logistics/agentic-engineering) page further.

## Development and Deployment Workflow

EngE-AI uses three environments to support safe development and release: **Local**, **Staging**, **Production**. Each environment serves different purposes.

Work is developed and tested locally before it is reviewed and merged. A merge to main automatically deploys the current vrsion to the staging environment. production deployment only after the staged version has been reviewed and approved.

### Local

Local environment is where you develop and internally test changes before sharing it to the team.

While in the local development phases, consider these steps:

1. you should create a well-defined problems and solutions before heading to the implementation (see [Agentic Engineering](/docs/logistics/agentic-engineering) for more). This helps other team member review your work and porvide useful context for AI-Assisted development.

2. Create a new feature branch from the current main branch. Do not develop directlu on main, as it is the shared integration branch.

3. Test yuur changes before opening a pull request. Run relevant automated test and manual testing for your feature, including edge cases.

4. Ensure the application builds successfully and that your local Node.js and npm versions match the project’s documented requirements.

5. Add diagnostic logging when it is need as breakpoints. This is useful to investigate problem throughout your development phases. Use `app.logger` rather than `console.log`. `app.logger` is set to log only for both staging and local, and disabled during the production (see [`logger.ts`](https://github.com/ubc/tlef-engeai/blob/main/src/utils/logger.ts) for more).

6. Do not commit any secret values to the github repository


Overall, you are responsible for anything inside the repo (including scripts, packages, .env attributes). If your new feature requires new environemtn variables or deployment configuration, document the required names and purpose for your developer

### Staging Environment

The staging environment helps to identify bug before release reach production. Perform manual testing, and address relevant edge cases before the feature is made available to real users. 

You may use diagnostic logging set during on the repo local development to ease your debugging or testing process in staging. You may ask your supervisor to give you latest log for your debugging purposes.

if there are updates on the `.env` file, inform your supervisor and clearly list the required variables. Check names, formats, and values very carefully. 

Describe the feature and its expected behaviour to your supervisor during staging testing. This creates the opportunity to confirm assumptions and to acquire multiple perspective.

After staged version confidently passes the necessary manual testing, ask your supervisor to approve for manual deployment in the production environment.

### Production

Production is where you you expect the user to use your app. The app prod version should address all encountered bugs and the users expectedly use the app seamlessly.

The users might still be able to find a bug on our app, even a small culprits. As a developer, you should be able to hypothesize the source of the bug, and fix it as soon as possible. 

```developer-note
The bug could be as simple as typos, or npm package incompatibility. Hard-to-debug culprits could be race conditions, or type differences. Please keep in mind about these cases, and this is where your judgement is required!
```

Overall, there are three stages of development environment: **Local**, **Staging**, and **Production**, which they are set for development convenience and quality control.

## UBC LTIC’s GenAI ToolKit adn Example App

UBC LTIC group has provided several GenAI toolkit (npm packages) and some example app corresponded to each toolkits.

### Toolkits

You are required to use UBC LTIC’s GenAI Toolkit for major components of the app to avoid any malicious or unknown dependecies. 

There are several provided GenAI Provided Toolkits such as: 

1. [**ubc-genai-toolkit-llm**](https://www.npmjs.com/package/ubc-genai-toolkit-llm): Manages conversational structure for multiple provider (see [Conversation](/docs/features/conversation) for more)
2. [**ubc-genai-toolkit-document-parsing**](https://www.npmjs.com/package/ubc-genai-toolkit-document-parsing): Standardized interface for transtating docs file from PDF, DOCX, PPT to text
3. [**ubc-genai-toolkit-rag**](https://www.npmjs.com/package/ubc-genai-toolkit-rag): Manages RAG operation, like chunking and embedding, and how to connect it to Qdrant
4. [**Passport-UBC-SHIB**](https://www.npmjs.com/package/passport-ubcshib): UBC’s passport JS strategy

For the upcoming documentation, these libraries are likely to be the prerequisites of the [technical contents](/docs/technical-concepts/main-architecture).

You should ask if your supervisor if external third party is about to be added. The supervisor may recommned better dependencies instead.

### Example app

Example app are provided For almost every of the toolkit as you should comprehend how the toolkits are used, or giving the AI agent better context on the Toolkit. You *Must* be familiarize with the toolkit before heading to the implementation. The example app is a good sandboxed system for learning purposes.

The example app can be either inside the toolkit’s github repo, or a seperate repo. Consult to your supervisor for better clarification.

## Out of Responsibilities

As the GenAI developer you should understand the boundarie of your role. You are not responsible for:

- Debug any thing inside the Infrastructure such as `time out`, unavailable service, etc
- Develop the toolkit (unless your supervisor ask you todo so)
- UBC’s server maintanance
- Managing LLM API keys or resolving problems with unavailable LLM provider credentials

If the app runs slowly or become unavailable, first determine whether the cause is the aplication code (uncompiled or inefficient queries), or external dependencies or UBC infrestructure. Share the collected evidence to your supervisor, so the issue can be handled appropriately.

## Recommendation

While developing the app, we should consider these steps:


1. Whether do you are developing a new feature, or maintaining a feature, do you need a new library ? 
    1. No, Go to step 2
    2. Yes, Go to step 3
2. If you need a new library, you should look if the library is already prepared one for you
    1. if the library is provided by UBC LTIC, then please use it, then go to step 3
    2. If no, please consult with your supervisor, and go to step 3
3. Please use the best practice on developing your software and features. In the next chapter ([Agentic Engineering](/docs/logistics/agentic-engineering)), we discuss further how to harness AI-Assisted Coding Platform discipline to boost your productivity.

## Conclusion

As a GenAI developer, you are responsibile for building and maintaining EngE-AI’s feature reliably, securely, within your role's boundaries.This includes following the project workflow, testing changes before release, using approved tools and dependencies, and communicating configuration or infrastructure concerns to your supervisor.

The next Chapter introduces [Agentic Engineering](/docs/logistics/agentic-engineering): The practices and principles for using AI-Assisted coding tools responsibly.
