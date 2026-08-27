# AI-Assisted Coding Tools

```prerequisites

- [Agentic Engineering](/docs/logistics/agentic-engineering)
- Familiarity with an AI-assisted coding tool such as Cursor, Claude Code, or Codex

```

```relevant readings

- [AI Agent Skills, Explained Simply](https://medium.com/@tahirbalarabe2/ai-agent-skills-explained-simply-4010f6d9db92)
- [Best Practices I Learned for AI-Assisted Coding](https://statistician-in-stilettos.medium.com/best-practices-i-learned-for-ai-assisted-coding-70ff7359d403)

```


Cursor has been used extensively throughout EngE-AI development because it allows us to develop the app through manual code editing and review, as well as agentic development, within the same ecosystem.

The important thing is not whether Cursor is always the best tool, but how AI tools can be used effectively in app development. This includes defining feature requirements, checking generated code, and validating changes before accepting them.

This page explains how AI-assisted coding tools can be used in EngE-AI development. It covers:


1. Tools and Interface Tradeoffs
2. AI Agent Rules
3. AI Agent Skills
4. Plan Mode
5. Suggested Practice
6. Conclusion


## Tools and Interface Tradeoffs

This comparison helps developers choose an AI-assisted coding tool and interface based on the task, workflow, and amount of code review required. We briefly compare three common tools—Cursor, Claude Code, and Codex—and three interface styles: IDE, CLI, and agent windows. The following comparison does not identify which tool is better; instead, it provides information to help you make an informed choice.

### Tools Comparison

**Similarities**: All three tools provide development-focused features, such as planning, debugging, and skills. They support command-line, agent-based, or IDE-integrated workflows, although the available interfaces differ by tool. They generally provide generous quotas for their respective internal models, produce mostly accurate output when working with vanilla TypeScript, and have broadly comparable prices for their lowest subscription tiers.

| Tool | Pros | Cons |
|---|---|---|
| **Cursor** | It has its own dedicated IDE, so there is no requirement to open a third-party IDE such as VS Code. It has fast throughput for internal models. | It is memory-hungry, particularly in Agent Windows. It is stingy with external models, including OpenAI and Anthropic models. |
| **Codex** | It provides a generous quota for OpenAI frontier models. It may be used for purposes other than coding. | You may need to open VS Code to validate the changes. It has slow throughput on high-end models. |
| **Claude Code** | It provides exposure to Anthropic’s smartest models. It may be used for purposes other than coding. | It has slow throughput for medium- to high-level models. It might be suitable for well-defined plans, skills, and rules, but less favourable for debugging front-end components. You may also need to open VS Code to validate the changes, which requires additional memory. |

This comparison may be biased because it is based on EngE-AI’s development experience. However, all three tools have supported EngE-AI development, and the most suitable choice depends largely on personal preference. Other tools, such as Devin and Kimi, are also available, but this page focuses on the three tools used in EngE-AI development. Let’s compare CLI, IDE, and Agent Windows interfaces.

### Interface Comparison

**Similarities**: All three interfaces serve similar purposes: they help you complete your tasks.

Now, let’s compare their strengths.

| Interface | Pros | Cons |
|---|---|---|
| **CLI** | It uses the least memory and CPU. It is slightly faster for file I/O operations and is well suited to short, deterministic tasks. | Its interface might not be intuitive, and long descriptions might be harder to read. |
| **IDE** | It is the most versatile option: you can edit and validate code while prompting directly through the sidebar. You may also spin up multiple agents simultaneously within one project. | It might use more memory and be less intuitive for longer descriptions. |
| **Agentic Windows** | It is best for spinning up multiple agents simultaneously across several projects. It provides the best user experience if you want to focus on feature specifications and descriptions rather than the code itself. | It has the highest memory usage and requires customization if you mainly use VS Code. It may not be the best option if code maintainability is necessary. |

After considering the similarities and differences between tools and interface options, we hope you can make an informed judgment when choosing an option.

## Agent Rules

```developer-note

Let’s consider a thought experiment: We want to implement a feature.

We have defined the deliverables and design decisions, prepared a clear prompt, and sent it to an AI coding agent. You wait, and the AI correctly implements the feature. It works as expected, but the generated code does not follow appropriate coding standards, such as avoiding repetition, unnecessary comments, or unintuitive syntax. As a result, the code is no longer maintainable. You may need to restructure the code using either an AI agent or manual changes, which takes extra time. This is where agent rules become useful.

```

Agent rules should be configured carefully to avoid unnecessary repetition. In EngE-AI’s agent rules, we divide the agents into seven personas:

| Agent persona | Responsibility |
|---|---|
| **Kernel** | Defines the principles and expectations that guide every agent, including responsibility, separation of roles, and verification. |
| **Orchestrator** | Coordinates communication between worker agents and the prompter, asks for clarification when necessary, and ensures that the requirements are complete. |
| **System Architect** | Designs the communication and integration between the front end, back end, database, and external sources while considering the user experience. |
| **Front-End** | Designs the interface and writes front-end code. This agent is responsible only for the front end. |
| **Backend** | Writes and maintains back-end code. This agent is responsible only for the back end. |
| **Prompt-Engineer** | Evaluates the system prompts, AI-assisted prompts, and prompt bridges used by the application. |
| **Tester and Review Team** | Reviews the code and identifies missed edge cases or vulnerabilities while the agent is still working on the feature. |

Each of these agent personas has its own specialized rules, which are attached to that persona. Rules are not automatically portable across tools; each tool may require a supported instruction file or an explicit reference to the project rules. See `.cursor/rules` for further clarification.

## Agent Skills

Agent skills help address the limitation that agent rules may be restricted to a single project. Nevertheless, agent rules and agent skills have similar purposes: they direct the agent through instructions.

The main difference, however, is how these two are managed by the application: agent rules are applied only to the dedicated project, whereas skills are embedded in the agent’s platform. You may need to take additional steps to view skill descriptions; see the platform settings for more information.

Skills contain straightforward descriptions of an agent’s behaviour, along with checklists. Some useful skills are built into the application, such as `/plan` and `/code-review`.

You can create your own dedicated skills using `/create-skills`, depending on your chosen platform. You can describe the agent’s behaviour manually or ask an AI tool to configure the description.

You can also attach skills developed by other developers. Popular skills include `ponytails` by Dietrich Gebert and team and `UI UX ProMax` by NextLevelBuilder and team. See the sources for more information.

## Plan Mode

While implementing a feature, you may have a complete prompt description, along with well-structured agent skills or rules, and still find bugs or poorly written code produced by the coding agent. This may happen if your prompt is not specific enough for the agent to understand. As a result, the code may lose maintainability or be poorly integrated with other features. **Important note:** A coding assistant will only do what your prompt asks it to do.

We can use plan mode to address this issue. Plan mode scans the current implementation related to your prompt and performs a thorough evaluation of the in-scope and out-of-scope requirements that should be satisfied. You can also request a diagram to explain the plan in detail.

If the agent identifies an incomplete requirement, it may ask questions. You can define how detailed those questions should be.

Plan mode is highly recommended when starting a new feature or modifying an existing one. It provides a thorough plan, including its sources, judgments, explanations, and to-do list. You may want to review the plan and the relevant implementation before asking the agent to build the feature.

If you are dissatisfied with any part of the plan, you can provide feedback and ask the agent to adjust it. This creates a feedback loop in plain English.

## Suggested Practices

Every developer has their own style when using AI-assisted coding tools. To help ensure the correctness of an implementation, we suggest the following practices:

1. Define your problem
Define the problem and its audience before starting development. This step is important for avoiding overlooked edge cases.

2. Define your requirements and constraints
Once the problem and audience are correctly defined, think through the feature’s requirements and constraints, such as important attributes, data structures, or limitations. Be specific about the requirements and constraints, particularly when addressing edge cases. You may want to write this in a GitHub project board or issue and ask other people or your supervisor to review the requirements before beginning implementation.

``` developer-note
Developer note: You might want to set the requirements aside for 24 hours to reduce bias or identify additional ideas and edge cases.
```

3. Create your Plan
Ask your agent to create a plan, usually in a Markdown file, that defines how the feature should be implemented. This is a key step before any code is written. You may want the plan to address the following:
    1. Which new files will be created or changed?
    2. What is the overall architecture of the feature, including any new endpoints and their role-based access control?
    3. Which edge cases should be tested?
    4. Which automated and manual tests should be covered?
    5. After the code is generated, can you take responsibility for the output? Is the code structure maintainable? Do you understand the syntax?
    
If any part of the plan does not fit your needs, provide feedback and explain how you want the changes to be made. By maintaining a human-in-the-loop system, we expect more accurate output from the coding agent.
    
Although plan mode, rules, and skills may consume additional tokens, implementation correctness is a higher priority than token cost.
    

## Conclusion

Overall, we have discussed the purpose of AI-assisted coding tools, the advantages and disadvantages of well-known AI-assisted coding tools and interfaces, agent rules and skills, plan mode, and suggested practices.

By using these practices, we hope to make development more accurate, productive, and efficient rather than relying on hunch-based implementation. This content is based largely on EngE-AI developer experience, so some information may be inaccurate or biased.
