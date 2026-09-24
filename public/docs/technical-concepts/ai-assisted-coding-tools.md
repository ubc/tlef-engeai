# AI-Assisted Coding Tools

```prerequisites

- [Agentic Engineering](/docs/logistics/agentic-engineering)
- Familiarity with an AI-assisted coding tool such as Cursor, Claude Code, or Codex

```

```relevant sources

- [AI Agent Skills, Explained Simply](https://medium.com/@tahirbalarabe2/ai-agent-skills-explained-simply-4010f6d9db92)
- [Best Practices I Learned for AI-Assisted Coding](https://statistician-in-stilettos.medium.com/best-practices-i-learned-for-ai-assisted-coding-70ff7359d403)

```


Cursor has been used extensively throughout EngE-AI development because it allows us to develop the app through manual code editing and review, as well as agent-based development, in the same environment.

The main focus is not whether Cursor is always the best tool, but how AI tools can be used effectively in app development. This includes defining feature requirements, checking generated code, and validating changes before accepting them.

This page explains how AI-assisted coding tools can be used in EngE-AI development. It covers:


1. Tools and Interface Tradeoffs.
2. Agent Rules.
3. Agent Skills.
4. Plan Mode.
5. Suggested Practice.
6. Conclusions.


## Tools and Interface Tradeoffs

This comparison helps developers choose an AI-assisted coding tool and interface based on the task, workflow, and amount of code review required. We briefly compare three common tools—Cursor, Claude Code, and Codex—and three interface styles: IDE, CLI, and Agentic Windows, which provide separate workspaces for AI-assisted development. This comparison helps developers choose a tool and interface based on the task, workflow, and amount of code review required.

### Tools Comparison

**Similarities**: All three tools provide development-focused features, such as planning, debugging, and skills. They support command-line, agent-based, or IDE-integrated workflows, although the available interfaces differ by tool. They generally provide generous quotas for their respective internal models, produce mostly accurate output when working with vanilla TypeScript, and have broadly comparable prices for their lowest subscription tiers.

| Tool | Pros | Cons |
|---|---|---|
| **Cursor** | It has its own dedicated IDE, so there is no requirement to open a third-party IDE such as VS Code. It has fast throughput for internal models. | It is memory-hungry, particularly in Agentic Windows. It is limited to external models, including OpenAI and Anthropic models. |
| **Codex** | It provides a generous quota for OpenAI frontier models. It may be used for purposes other than coding. | You may need to open VS Code to validate the changes. It has slow throughput on high-end models. |
| **Claude Code** | It provides exposure to Anthropic’s smartest models. It may be used for purposes other than coding. | It has slow throughput for medium- to high-level models. It might be suitable for well-defined plans, skills, and rules, but less favourable for debugging frontend components. You may also need to open VS Code to validate the changes, which requires additional memory. |

This comparison may be biased because it is based on EngE-AI’s development experience. However, all three tools have supported EngE-AI development, and the most suitable choice depends largely on personal preference. Other tools, such as Devin and Kimi, are also available, but this page focuses on the three tools used in EngE-AI development. Let’s compare CLI, IDE, and Agentic Windows interfaces.

### Interface Comparison

| Interface | Pros | Cons |
|---|---|---|
| **CLI** | It uses the least memory and CPU. It is slightly faster for file I/O operations and is well suited to short, deterministic tasks. | Its interface might be less intuitive, and long descriptions might be harder to review in the terminal. |
| **IDE** | It is the most versatile option: you can edit and validate code while prompting directly through the sidebar. You may also spin up multiple agents simultaneously within one project. | It might use more memory and be less intuitive for longer descriptions. |
| **Agentic Windows** | Best for running multiple agents across several projects. It is suitable when you want to focus on feature specifications and descriptions rather than directly editing the code. | It uses more memory and may be less suitable when you need to inspect and maintain code directly. |

After considering the similarities and differences between tools and interface options, we expect that you can make an informed judgment when choosing a tool and interface.

## Agent Rules

```developer-note

Let’s consider a thought experiment:

We want to implement a feature. We defined the deliverables and design decisions, prepared a clear prompt, and sent it to an AI coding agent. The feature works as expected, but the generated code does not follow appropriate coding standards. It may contain unnecessary repetition, excessive comments, or unintuitive syntax. As a result, the code is harder to maintain, and we must spend additional time restructuring it. This is where agent rules become useful.


```

Agent rules should be configured carefully to avoid unnecessary repetition. In EngE-AI’s agent rules, we organize the rules around seven agent personas, each with specific responsibilities:

| Agent persona | Responsibility |
|---|---|
| **Kernel** | Defines the principles and expectations that guide every agent, including responsibility, separation of roles, and verification. |
| **Orchestrator** | Coordinates communication between worker agents and the person providing requirements, asks for clarification when necessary, and ensures that the requirements are complete. |
| **System Architect** | Designs the communication and integration between the frontend, backend, database, and external services while considering the user experience. |
| **Front-End** | Designs the interface and writes frontend code. This agent is responsible only for the frontend. |
| **Backend** | Writes and maintains backend code. This agent is responsible only for the backend. |
| **Prompt-Engineer** | Evaluates the system prompts, AI-assisted prompts, and prompt bridges used by the application. |
| **Tester and Reviewer** | Reviews the implementation, identifies missed edge cases or vulnerabilities, and provides feedback before the feature is approved. |

Each of these agent personas has its own specialized rules file. These rules define the responsibilities and limits of that persona. Rules are not automatically portable across tools. Each tool may require a specific instruction file or an explicit reference to the project rules. See `.cursor/rules` for details.

## Agent Skills

Agent skills help address the limitation that agent rules may be restricted to a single project. Nevertheless, agent rules and agent skills have similar purposes: they direct the agent through instructions.

The main difference is how these two are loaded by the AI coding platform: Agent rules are usually applied to a specific project, while skills may be available across multiple projects through the platform.

Skills provide reusable instructions and checklists for an agent. Some platforms include built-in commands or skills, such as `/plan` and `/code-review`.

You can create your own dedicated skills using `/create-skills`, depending on your chosen platform. You can describe the agent’s behaviour manually or ask an AI tool to configure the description.

You can also attach skills developed by other developers. Popular skills include [**Ponytail**](https://github.com/DietrichGebert/ponytail) by Dietrich Gebert and their team and [**UI UX ProMax**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) by NextLevelBuilder and their team.

## Plan Mode

While implementing a feature, you may provide a detailed prompt description and well-structured agent skills or rules and still find bugs or poorly written code. This can happen if your prompt does not clearly describe the requirements, constraints, or expected outcome. As a result, the code may become difficult to maintain or be poorly integrated with other features. **Important note:** A coding assistant may not infer requirements that are missing from your prompt or project context.

We can use Plan Mode to address this issue. Plan Mode reviews the current implementation related to your prompt and evaluates the in-scope and out-of-scope requirements to determine the solution. You can also request a diagram to explain the plan in detail.

If the agent identifies an incomplete requirement, it may ask questions. You can ask the agent to ask concise questions or to provide a more detailed list of questions before implementation.

Plan Mode is highly recommended when starting a new feature or modifying an existing one. A useful plan may include the relevant files, design decisions, assumptions, risks, explanations, and implementation tasks. You may want to review the plan and the relevant implementation before asking the agent to build the feature.

If you are dissatisfied with any part of the plan, you can provide feedback and ask the agent to adjust it. This allows you to provide feedback in natural language and ask the agent to revise the plan.

## Suggested Practices

Every developer has their own style when using AI-assisted coding tools. To help ensure the correctness of an implementation, we suggest the following practices:

1. Define your problem
Define the problem and the targeted audience before starting development. This step is important for avoiding overlooked edge cases.

2. Define your requirements and constraints
Once the problem and audience are correctly defined, think through the feature’s requirements and constraints, such as data structures, data fields, and other limitations. Be specific about the requirements and constraints, particularly when addressing edge cases. You may want to write this in a GitHub project board or issue and ask your peers or your supervisor to review the requirements before beginning implementation.

```developer-note

Developer note: You might want to set the requirements aside for 24 hours before implementation to reduce bias or identify additional ideas and edge cases.

```

3. Create your plan
Ask your agent to create a plan, usually in a Markdown file, that defines how the feature should be implemented. This is a key step before any code is written. You may want the plan to address the following:
    1. Which new files will be created or changed?
    2. What is the overall architecture of the feature, including any new endpoints and the role and permissions required to access them?
    3. Which edge cases should be tested?
    4. Which automated and manual tests should be covered?
    5. After the code is generated, can you understand, review, test, and approve it? Is the code structure maintainable?
    
If any part of the plan does not fit your needs, provide feedback and explain how you want the changes to be made. Maintaining a human-in-the-loop process helps you identify incorrect assumptions and improve the implementation before accepting it.
    
Although Plan Mode, rules, and skills may consume additional tokens, implementation correctness is a higher priority than minimizing usage.
