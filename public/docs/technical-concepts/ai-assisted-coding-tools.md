# AI Assisted Coding Tools

```prerequisites

- [Agentic Engineering](/docs/logistics/agentic-engineering)
- Familiarity with an AI-assisted coding tool such as Cursor, Claude Code, or Codex

```

```relevant readings

- [AI Agent Skills, Explained Simply](https://medium.com/@tahirbalarabe2/ai-agent-skills-explained-simply-4010f6d9db92)
- [Best Practices I Learned for AI-Assisted Coding](https://statistician-in-stilettos.medium.com/best-practices-i-learned-for-ai-assisted-coding-70ff7359d403)

```

The page discuss about

1. Why This matters for EngE-AI
2. Tool Tradeoffs
3. AI Agent Rules 
4. AI Agent Skills 
5. Plan Mode
6. Suggested Practice
7. Conclusion

## Why this Matters to EngE-AI

Cursor is the main AI-Assisted coding tools used throughout EngE-AI development. Cursor allows us to develop the app through manual code editing, and review, and agentic development within the same ecosystem.

The important thing is not Cursor is the always the best tools, but how AI tools can be optimally used for the project context. This includes developing the feature requirements, checking the generated code, and validating them before accepting the changes. 

## Tools and Interface Tradeoffs

Even Cursor is the tool that is used mainly to develop EngE-AI, many other AI-Assisted coding tools that are commonly used for software development. We briefly compare between 3 common tools: Cursor, Claude code, and Codex, and 3 different stylings: IDE, CLI, and agent windows. The following comparison does not discuss which tool is better, but you might want to have good judgement for opting the best tools given their pros and cons

### Tools Comparison

**Similarities**: All of them are supported with development-centered features: such as planning, debug, skills. All of them has their own CLI and Agentic views, or ide-chat sidebar feature. Generous quota on their own internal models. Mostly accurate judgement on Vanilla typescript. And ranging in the same price for the lowest subscription fee. May read other tools rules and skills.

**Cursor**:

Pros: Has thier own dedicated IDE, no requirement to open third party IDE (such as vscode), fast throughput on their internal models

Cons: Memory hungry (particularly in Agent Windows), Stingy on external models (OpenAI nor Anthropic Models).

**Codex**

Pros: Generous quota on OpenAI Frontier Models. May used for other-than coding purposes.

Cons: You may need to open VSCode to validate the changes. Slow throughput on high models

**Claude code**

Pros: Exposure to Anthropic’s smartest Models. May used for other-than coding purposes.

Cons: Slow throughput for their medium to high models (might be really good for well-defined plan, skills and rules, not really favourable for debugging front-end components). You also may need to open VSCode to validate the changes, which requires extra memory

The comparison above can be really bias, but we all tools are really supportive when it comes to EngE-AI Development-just the matter of personal preference. There are other tools as well, such as Devin or Kimi, but these three tools are have been used EngE-AI Development. Lets see the conparison between CLI vs IDE vs Agent Windows.

### Interface Comparison

**Similarities**: All performs similar purposes-help you complete your deliverabels of your task

Now, lets compare their strengths

**CLI**: 

Pros: Least memory and CPU usage, slightly rapid for file-IO operations. Realy good for short and deterministic tasks.

Cons: Interface might not be really intuitive, long description might be harder to read.

**IDE**: 

Pros: Most versatile option-can edit and validate the code, while also can prompt directly to the sidebar. May spin up multiple agent simultaneously on one project.

Const: Might cost memory usage, Less intuitive for longer description.

**Agentic Windows**

Pros: Best for spinning up multiple agents simulataneously across several projects, best user experience if you want to focus on the feature specs and description rather than the code itself.

Cons: Higest memory usage, Need accostumizstion if you mainly uses VSCode. May not the best if code maintanibility is necessary

As we have discuss the similarities and differences between some tools and interface option, we expect that you can have fair judgement when it comes to which tool and interface will you choose. 

## Agent Rules

Lets make a through experiment: we have set the deliverables, clear design decision, and necessary part of a clear prompt, and we sent to your AI Coding Agent. You wait, and Your AI is correctly implement the feature, and it works perfectly on your end. However, the generated code does not follow the proper coding standards, such as DRY, necessary comments, unintuitie synthax, etc, which truly make the code is not maintainable. You might need to rewrite or re-describe to the agent how would you like to structurize your code, and it takes extra time, and we obviously want to avoid it. This is when Agent rules takes place.

In cursor, you might want to configure your agent rules so unnecessary repetition can be avoided for maintanability purposes. In EngE-AI’s cursor rules we divide the agents into 5 personas:

- Kernel: every mindset that each agent should follows, such as responsibility, role seperation, verification, etc
- Orchestrator: The speaker man between the worker agent and the prompter: ask for further clarification and ensure the requiremnt completeness
- System Architect: Agent who design the comunication between FrontEnd, Backend, Database and External Sources, along with the user experience factor
- Front-End: Interface designer and FrontEnd Code writer-Agent Worker who only responible for Front-End
- Backend: Agent who responsible for Backend
- Prompt-Engineer: An agent who will evaluate system prompt, initialy assisted prompt, and prompt bridge we have.
- Tester and Read team: Evaluates the code, and attempt to determine the missed edge cases or vulnerabilities of the ferature while the agent is still on the conversation

Each of these agent personas has their own specialized rules that attached to each personas. Surprisingly coding tools in general (codex and claude code) are capable to reach to these documents. You may want to add an introdcutory messages in `AGENTS.MD`  (on how to use cursor rules universally). See `.cursor/rules` for further clarification. 

## Agent Skills

If cursor rules is limited to a project, we also can set rules in a skills. The main intention between skiils and rules are actually the same- description helper for more directed and expectable outcome. 

The main difference however how these two are managed by the application: while rules is explicitly mentioned in the project, skills are embedded inside the application, meaning you might need extra steps to see the description of the skills. 

Skiils usually contain of straighforward descriptions on how the skills should behave along with necessary checklists. There are some useful skills that has been embedded by the application such as `/plan` and `/code-review`

You can create you own dedicated skills using `/create-skills` (depends on your chosen tool), and you can decribe on how an agent should behave, you can create on your own or you can ask AI to configure it for you.

You also can attach skills that has been developed by other developers. The main popular skills are `ponytails` by Dietrich Gebert and team or `UI UX ProMax` by NextLevelBuilder and teams. See the sources for more information.

## Plan Mode

When you have all the prompt description ready, along with well structured agent skills or rules, you still find that there are some bugs or unproperly written code. This may happen if you prompt is not specific enough to for the agent to grasp. Turns out your code might loss maintaibnability, or even unproperly integrated with other features. **Important Note**: Coding Assistant Agent will only do what your prompt us to do.

So we need a feature that could evaluate adn clarify the prompt given our current implementation.

We have plan mode to resolve this issue. Plan mode works by scanning your current implementation related to your prompt, and make a throrough evaluation on the in-scope and out-of-scope requirements that should be satisfied. We can request for a diagram to throroughly explain to us about their plan. 

If the agent feels uncompleted requirement, they will ask for questions. You may define on how vary the question will be.

Plan mode is highly recomended for a newly initiated feature or developing an implemented feature. Plan mode gives you thorough description about your their sources, judgement, explanation, and to-do-lists. We may want to skim / read over the implementation before we request them to build.

IF you think that there are implementation that feels dissatisfied, you may ask them to adjust the plan accordingly. So, you have the ability to create a feedback loop changes in plain english. 

## Suggested Practices

We acknowledge that every developer has their own style while using AI Assisted coding tools. In order to ensure the correctness of the implementation, we suggest you as follows:

1. Define your problem
You should know what problem specifically that you are about to solve and the audience of the feature before moving to development. This steps is super important to avoid any unecessary edge cases.
2. Define your requirements
Once the problem is corrctly defined, along with the targetted audience. You might still need to think through what are the requirements of the feature. What are the important attributes / data structure. You may want to be really specific on this requirement, particularly to fill some edge cases. You might want to write this on girhub issue and let other poeple review this before heading to implementation.

Developer note: You might want to leave it for 24 hours to mitigate any bias on the requirement, or you might come through any ideas or edge cases.

1. Create your Plan
You can ask you Agent to create a plan (mostly in md file) defining how the feature should be implemented. This is our key steps before any code is written. You may want to consider these parts:
    1. What are new files / files that are about to be changed
    2. How is the architecture of the overall design of the feature, including the newly created end point, what are their Role Based Access Controll
    3. What are the Edge Cases that should be created
    4. What are the automated / manual test that should be cover
    5. Afte the code is generated Can you responsible for the output ? do you think the code structure is mainatable ? do you understand the synthax? 
    
    If there any part of the plan does not fits what you want, you might want to provide feedback on how you are about to make the changes. By creating this loops hopefully we can generate more accurate output from the AI generated code.
    
    It looks like using plan mode, rules and skills really cost us token througout the implementation. But implmentation correctness is highly more priorotize compared to toke cost.
    

## Conclusion

Overall, we have discussed about the essential of using AI-Assisted Coding Tools, Comparison between the pros and cons between well-known AI-Assisted Coding Tools and interfaces, Agent Rules and Skills, Plan mode, as well as the suggested practices. 

By having so, hopefully we can harness these tool to be more accurate, productive and faster, rhaterthan typical vibe coder that is hunch-based implementation. The content is mostly based on EngE-AI developer experience, some of the content might be innacurate or bias.
