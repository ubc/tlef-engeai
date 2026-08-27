# Agentic Engineering


```prerequisites
- [Scope](/docs/logistics/scope)

```

```relevant readings
https://www.ibm.com/think/topics/agentic-engineering, https://www.youtube.com/watch?v=2n41YjR5QfU&t=7s, https://www.ibm.com/think/topics/vibe-coding

```


The Agentic Engineering page outlines recommended practices for using AI-assisted coding tools effectively and responsibly. This page may be the core of the documentation because it focuses not only on knowledge but also on the mindset software engineers need in the era of AI agents. This page uses an informal and reflective style rather than the style of formal documentation. By the end of this page, you should be familiar with:

1. From Vibe Coding to Agentic Engineering
2. Spec-Driven Development
3. Self-Discipline in the AI Era for Software Engineering
4. Recommendation

## From Vibe Coding to Agentic Engineering

`Vibe coding` is a term coined by Andrej Karpathy, a well-known AI researcher. It describes a development approach in which a programmer relies heavily on AI-generated code through natural-language prompts and focuses primarily on achieving the desired product outcome rather than understanding or directing every implementation detail. This approach can help developers create software quickly, but it also increases the importance of reviewing, testing, and maintaining the resulting code. What risks arise when speed becomes the primary goal?

### The Big Question Mark

The main question is whether we can be responsible for the results of vibe coding when developing a product for real users. Even if the application works, will it scale correctly and efficiently? What if the product affects a person’s health or safety? Is it our responsibility as the developer to design and test the app comprehensively before it reaches users?

With the latest AI models, you may be able to develop an app incredibly fast—perhaps ten times faster—and it may work well. However, if you find a bug, can you resolve it ten times faster as well, or will it be unsolvable? Even if it is solvable, did you collaborate with AI to solve it, or did AI perform the entire debugging process for you? Does that mean you are no longer exercising independent judgment?

Or could you end up doing everything incorrectly and needing to return to earlier commits? There should be self-regulated boundaries around how extensively you use AI to improve your output while avoiding sloppiness and maintaining your skills. For example, these boundaries may include requiring a written specification, an approved plan, human review, automated tests, and manual validation before accepting AI-generated code.


### Mitigation: Agentic Engineering

To address these unstructured questions, agentic engineering is a principle that helps prevent these problems. It requires you to supervise the end-to-end process while you and your AI tools engineer the app. This includes defining the problem, making decisions, designing the system for each feature, ensuring code quality, testing, and completing end-to-end integration. This is known as a human-in-the-loop system. A human-in-the-loop system means that a person remains responsible for reviewing the requirements, design decisions, generated code, tests, and final outcome before release.

AI is there to boost your productivity, not to delegate or replace your role. By using AI, you are expected to retain your engineering judgment in software design.

## Spec-Driven Development

Before a feature is implemented, consider its requirements, such as the problem, potential solution, and fit with the existing implementation. This brainstorming process is useful for:

1. Yourself: You become aware of what you are building and may discover other potential solutions that fit your challenge.
2. AI-assisted coding tools: They can scan the current state and help determine an appropriate outcome.
3. Peers: Documentation helps them understand your progress and provide input.

Designing a feature specification enables you to develop your ideas more deliberately. You can place the specification anywhere that is noticeable to your peers or supervisor; a GitHub project item is a good option. The template for a feature specification is as follows:

```md
# {Title}

## Problem
{What is your current problem, and why is it a problem? Who is the user? Which component is problematic?}

{You may want to describe this as clearly and concisely as possible.}

## Why is this important?
{Why do you think implementing this feature is important? You may describe the implications, along with the pros and cons.}

## In-Scope
{Which components are within the project scope? You may need to be specific; perhaps the project also involves other feature components.}

## Out of Scope
{List the components that are out of scope.}

## Optional: Potential Solution
{List brief descriptions of potential solutions, along with their pros and cons.}

```

Having this description in place helps us make design decisions based on the specification. AI-assisted coding tools also provide an integrated feature called Plan Mode.

## Plan Mode

AI-assisted coding tools such as Cursor, Claude Code, and Codex have embedded plan-mode features. These features allow the agent to examine your codebase, libraries, and comments to provide an overview of the current state and the necessary changes. You may use the specification from the previous stage as the basis for the plan-mode input.

If the AI determines that your implementation may introduce a bug or an uncertain decision, it may ask you a list of questions about the implementation. This helps ensure that the AI has enough context to plan your feature.

The clearer and more specific the prompt is, the more useful and accurate the plan will be. However, how specific should the prompt be? There is no single answer to this question.

Once the plan is complete, you should review it and consider whether it fits your needs. The agent may create the plan, but you should not delegate your judgment. You may need to examine the RBAC system in the middleware, time and space complexity, test scope, and other important details.

If something does not meet your needs, you may ask the agent to compare it with another solution. In this phase, you can create a feedback loop so that your plan becomes more precise. Before finalizing the plan, you should be able to take responsibility for the outcome.

You should review the code carefully and make sure that the outcome fits the description. You may want to add comments to the implementation to ease debugging or help your peers.

Although this process takes more time, it can produce results that are faster and more accurate while matching your needs and coding style. It also helps you retain your judgment and save tokens. See the appendix for a suggested plan-mode workflow.

One way to improve the accuracy of both the coding agent and plan mode is to use skills and rules.

## Skills and Rules

Skills and rules are two ways to guide an AI coding agent. A skill is a reusable set of instructions that may be available globally or within a project, depending on the platform. A rule is an instruction that defines how the agent should behave while working in a specific codebase.

Having skills and rules in place is useful for providing the coding agent with more accurate context. They help us create both accurate plans and correct implementations. Nevertheless, how large should a skill be while still ensuring correctness? As a rule of thumb, make the description as concise as possible while covering all edge cases and their priorities. See https://cursor.com/docs/rules for more information.

Rules are primarily configured through Cursor’s project rules, but other tools use their own instruction files. If another tool should follow the same guidance, explicitly reference or copy the relevant rules in a supported file, such as `AGENTS.md` or `CLAUDE.md`.

The suggested skills and rules are outlined as follows:

```md
# {Title of Rules / Skills }

{Description, along with its priority}

## List of Responsibilities
{Responsibilities, along with their descriptions}

## Checklists
{Checklists to follow}

```

## Recommendation

The tools and practices discussed above can be helpful, but this page may become outdated as providers release new features.

Acquiring new knowledge should be a priority, particularly in the rapidly changing AI era. New features are constantly being introduced, so you should set aside time to keep up with updates and adjust your software engineering practices.

You may lose or become rusty in some of the knowledge you acquired in the past, and you do not want to lose your programming skills. Because software engineering requires self-discipline, you should schedule when to use AI and when to work manually. Again, the main purpose of using AI is to boost productivity, not to replace you as the human orchestrator.

## Conclusion: Discipline during the AI Period

The key purpose of using AI-assisted coding tools is to help us produce correct and maintainable software in both the short and long term. Vibe coding has truly revolutionized the possibilities of software engineering; nevertheless, we must remain responsible for the outcomes we eventually ship.

Agentic Engineering is a principle to help you develop your app alongside AI—not to replace your role as the developer. When developing a feature, you should create spec-driven documentation that thoroughly evaluates the problem, scope, and potential solution. Then, you can move to plan mode, where you and your agentic tools design an implementation blueprint. A human-in-the-loop process is required to produce accurate outcomes. AI skills and rules can support you during planning and development.

Lastly, important disciplines should be maintained, such as regularly researching current updates and continuing to develop your skills. By putting all these components in place, you can use AI responsibly while honing your skills and adapting to AI-assisted development.

## Appendix: Plan Creation

Use the following process to create an implementation plan.

### Step 1: Give the AI Context

Before creating the plan, give the AI enough context about what you are going to build. This helps it understand the main intention and scope. The specification created in the previous stage is a useful resource for providing this context. An example prompt is:

```md
--- Feature Spec
# {Title}

## Problem
{What is your current problem, and why is it a problem? Who is the user? Which component is problematic?}

{You may want to describe this as clearly and concisely as possible.}

## Why is this important?
{Why do you think implementing this feature is important? You may describe the implications, along with the pros and cons.}

## In-Scope
{Which components are within the project scope? You may need to be specific; perhaps the project also involves other feature components.}

## Out of Scope
{List the components that are out of scope.}

## Optional: Potential Solution
{List brief descriptions of potential solutions, along with their pros and cons.}

---

Would you create an implementation plan? Please consider necessary components such as RBAC, time and space complexity, and user experience.
Please list all the files you plan to change, along with the methods that will be affected. If you have questions, ask them before proceeding. Do not begin implementation until you understand and approve the plan.
```

Review the agent’s questions and answer them until it proposes an implementation plan that fits your needs. Then evaluate the plan, paying attention to the endpoints, database attributes, and RBAC. If you find anything peculiar, ask the AI to clarify it or make your own suggestion.

Once you are satisfied with the plan, ask the agent about specific implementation details to clarify whether the plan is sufficiently detailed.

Then you can ask the agent to implement the feature. Once the feature is implemented, you should test its behaviour in the back end and front end.
