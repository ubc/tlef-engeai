# Agentic Engineering

```prerequisites
- [Scope](/docs/logistics/scope)

```

```relevant sources
- [Agentic Engineering — IBM](https://www.ibm.com/think/topics/agentic-engineering)
- [Agentic Engineering overview — YouTube](https://www.youtube.com/watch?v=2n41YjR5QfU&t=7s)
- [Vibe Coding — IBM](https://www.ibm.com/think/topics/vibe-coding)

```

This page introduces practices for using AI-assisted coding tools effectively and responsibly. It focuses not only on technical knowledge but also on the engineering judgment needed when developing software with AI agents.

The discussion is intentionally informal and reflective. By the end of the page, you should understand:

1. The difference between Vibe Coding and Agentic Engineering
2. Spec-Driven Development
3. The importance of self-discipline when using AI for software engineering
4. Recommended practices for working with AI-assisted coding tools

## From Vibe Coding to Agentic Engineering

`Vibe coding` is a term coined by Andrej Karpathy, a well-known AI researcher. It describes a development approach in which a programmer relies heavily on AI-generated code through natural-language prompts. The programmer focuses primarily on achieving the desired product outcome rather than understanding or directing every implementation detail.

This approach can help developers create software quickly. However, it also makes reviewing, testing, and maintaining the resulting code especially important. What risks arise when speed becomes the primary goal?

### The Big Question Mark

The central question is whether you can take responsibility for the results of vibe coding when you develop products for real people. Even if an application works, will it scale correctly and efficiently? What happens if it affects someone’s health or safety? Can you be responsible for designing and testing the application comprehensively before it reaches users?

With newer AI models, you may be able to develop an application incredibly quickly—perhaps ten times faster—and it may work well. However, if you find a bug, can you resolve it ten times faster as well, or will it be difficult to understand and fix? Even if the bug is solvable, did you collaborate with AI to solve it, or did AI perform the entire debugging process for you? If AI did all the work, are you still exercising your own engineering judgment?

You could also make incorrect changes and eventually need to return to an earlier commit. For this reason, you should set boundaries around how you use AI. These self-imposed boundaries can help you improve your productivity without becoming careless or losing important skills. For example, you might require a written specification, an approved plan, human review, automated tests, and manual validation before accepting AI-generated code.

### Mitigation: Agentic Engineering

Agentic Engineering provides a way to address these concerns. It means supervising the entire development process, including requirements, planning, implementation, testing, and release, while you and your AI tools build the application together. This includes defining the problem, making design decisions, ensuring code quality, testing the result, and completing end-to-end integration.

This approach follows a `human-in-the-loop` model. In a human-in-the-loop system, a person remains responsible for reviewing the requirements, design decisions, generated code, tests, and final outcome before release.

AI should amplify your productivity, not replace your role as a developer. When you use AI, you are still expected to understand the software, exercise engineering judgment, and take responsibility for the result.

## Spec-Driven Development

Before implementing a feature, define the problem, the requirements, the potential solution, and how the feature fits into the existing application. This process is called Spec-Driven Development. Writing a specification helps in several ways:

1. **For you:** You become more aware of what you are building and may discover other solutions that better fit the problem.
2. **For AI-assisted coding tools:** The tools can inspect the current state of the application and help determine an appropriate implementation.
3. **For your peers:** The specification helps them understand your work and provide useful feedback.

Designing a feature specification also helps you make decisions deliberately. Store the specification where your peers or supervisor can easily find it, such as a GitHub issue or project item. A feature specification can use the following format:

```md
# {Title}

## Problem
{What problem are you trying to solve? Why does it matter? Who is affected? Which component is involved?}

{Describe the problem as clearly and concisely as possible.}

## Why is this important?
{Why is implementing this feature important? Describe the implications, along with the advantages and disadvantages.}

## In Scope
{Which components are within the project scope? Be specific, especially when the feature affects multiple related components.}

## Out of Scope
{List the components that are outside the project scope.}

## Potential Solutions (Optional)
{List brief descriptions of potential solutions, along with their advantages and disadvantages.}

```

Having this specification in place helps you and your team make design decisions based on the specification. It also gives AI-assisted coding tools the context they need before planning an implementation.

## Plan Mode

AI-assisted coding tools such as Cursor, Claude Code, and Codex include Plan Mode features. In this mode, an agent reviews the codebase and proposes a plan that summarizes the current state, required changes, and implementation considerations. You can use the specification from the previous stage as the foundation for the plan.

If the agent identifies a possible bug or an uncertain design decision, it may ask you several questions about the implementation. Answering these questions gives the agent the context it needs to create a useful plan.

The clearer and more specific your prompt is, the more useful and accurate the plan is likely to be. There is no single correct level of detail. Include enough information for the agent to understand the feature, its constraints, and the outcome you expect.

After the plan is complete, review it carefully. The agent may create the plan, but you should not delegate your judgment. For example, you may need to examine the role-based access control (RBAC) system in the middleware, time and space complexity, test scope, and other important implementation details.

If the plan does not meet your needs, ask the agent to compare it with another solution or revise it. Continue revising the plan with the agent until it becomes sufficiently precise. Before approving the plan, you should be able to take responsibility for the proposed outcome.

Once implementation begins, review the code carefully and confirm that it matches the specification and approved plan. Adding clear comments can make the code easier to debug and help your peers understand it.

Although this process takes more time at the beginning, it can lead to results that are easier to maintain and more accurate over the long term. It also helps you retain your engineering judgment and use your AI tools more efficiently. The appendix contains a suggested Plan Mode workflow. Using skills and rules can improve the agent’s planning and implementation accuracy.

## Skills and Rules

Skills and rules are two ways to guide an AI coding agent. A skill is a reusable set of instructions that may be available globally or within a project. A rule is an instruction that defines how the agent should behave while working in a specific codebase.

Skills and rules provide the coding agent with more relevant context. They can help the agent create better plans and more reliable implementations. Keep each skill or rule as concise as possible while still covering important edge cases and priorities. For more information, see the [Cursor rules documentation](https://cursor.com/docs/rules).

Rules are primarily configured through Cursor’s project rules, but other tools use their own instruction files. If another tool should follow the same guidance, explicitly reference or copy the relevant rules in a file that the tool recognizes, such as `AGENTS.md` or `CLAUDE.md`.

The suggested format for a skill or rule is:

```md
# {Title of the Rule or Skill}

{Description, along with its priority}

## List of Responsibilities
{Responsibilities, along with their descriptions}

## Checklists
{Checklists to follow}

```

## Recommendations

The tools and practices discussed above, such as specifications, Plan Mode, skills, and rules, can be useful, but this page may become outdated as AI providers release new features. Treat the page as a starting point and continue checking whether the recommended tools and workflows still fit your needs.

Because AI tools are changing rapidly, set aside time to review updates and adjust your software engineering practices. You may forget knowledge or lose proficiency in important skills. To maintain your programming ability, schedule time both to use AI and to work without it. The purpose of AI is to improve your productivity, not to replace your responsibility as the developer.

## Conclusion: Discipline in the AI Era

The main purpose of using AI-assisted coding tools is to produce software that remains correct and maintainable in both the short and long term. Vibe Coding has expanded what software engineers can accomplish, but we must remain responsible for the software we ship.

Agentic Engineering helps you develop an application alongside AI without giving up your role as the developer. When developing a feature, create spec-driven documentation that describes the problem, scope, and potential solution. Then use Plan Mode to work with your AI tools on an implementation blueprint. A human-in-the-loop process is essential for producing reliable outcomes. Skills and rules can support you during planning and development.

Finally, maintain good engineering habits: research current developments, continue building your technical skills, and review AI-generated work carefully. By following these practices, you can use AI responsibly while strengthening your skills and adapting to AI-assisted development.

## Appendix: Plan Creation

Before creating the plan, give the coding agent enough context about what you intend to build. This helps it understand the goal and scope. The specification created in the previous stage is a useful source of context. An example prompt is:

```md
--- Feature Spec
# {Title}

## Problem
{What is your current problem, and why is it a problem? Who is the user? Which component is problematic?}

{Describe the problem as clearly and concisely as possible.}

## Why is this important?
{Why is implementing this feature important? Describe the implications, along with the advantages and disadvantages.}

## In-Scope
{Which components are within the project scope? Be specific, especially if the project includes related feature components.}

## Out of Scope
{List the components that are outside the project scope.}

## Optional: Potential Solution
{List brief descriptions of potential solutions, along with their advantages and disadvantages.}

---

Would you create an implementation plan? Please consider factors such as RBAC, time and space complexity, testing, and user experience.

Please list all the files you plan to change, along with the methods that will be affected. If you have questions, ask them before proceeding. Do not begin implementation until you understand and approve the plan.
```

Review the agent’s questions and answer them until it proposes an implementation plan that fits your needs. Then evaluate the plan, paying attention to the endpoints, database fields, and RBAC. If you find anything unclear or unusual, ask the AI to clarify it or make your own suggestion.

Once you are satisfied with the plan, ask the agent about specific implementation details to confirm that the plan is sufficiently detailed.

Then ask the agent to implement the feature. Once the feature is implemented, test its behavior across both the backend and frontend.
