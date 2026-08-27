# Agentic Engineering



The Agentic Engineering page outlines the suggested disciplines on how you can utilize AI-Assisted Coding Tools effectively and responsibly. This Chapter might be the core of the documentation this would not be a knowledge based, but more like into a mindset for software engineers in the AI era. This page is more into an informal page rather than a formal documentation. By the end of this page, you should be familiar with:

1. Vibe Coding vs Agentic Engineering
2. Spec Driven Development
3. Self-Discipline in the AI Era for SWE
4. Recommendation

Prerequisistes: Scope

Relevant sources: https://www.ibm.com/think/topics/agentic-engineering, https://www.youtube.com/watch?v=2n41YjR5QfU&t=7s, https://www.ibm.com/think/topics/vibe-coding

## Vibe Coding VS Agentic Engineering

`Vibe coding` was coined by Andrej Karpathy, well-known AI researcheer, where the programmers delegate the development tasks using AI through prompting, focusing on the product rather than the code itself. This truly revolutionize Software Engineering discipline, as you may ship products as fast as possible, knowing just the feature is just completed. What is so wrong with that ? 

### The Big Question Mark

The main question is if we can be responsible with the result through vibe coding for a real user ? Even if it works, does it correctly and optimizedly scalable or what if there are human’s involved in the product ? Or It is our responsibility to flawlessly develop the app before it reaches the user. 

With the latest AI models, You may develop an app in 10X speeds, and it worked well. However, if you find a bug, can you resolve the bug in 10X speed as well ? Or the bug is just unsolvable ? Even if it is solvable, then did you collaborate with AI to solve it, or the AI did the entire debugging for you ? Does not it sounds like you are not independent on your own thoughts ?   

Or you ended up in the doing everything is wrong and you need to comeback to the past commits. There should be a self-regulated boundaries on how massive you can use AI just to boost your outcome, while avoiding the slops, while still maintain your skills.

### Mitigation: Agentic Engineering

To mitigate this unstructured question, agentic engineering is a principle that would holds you from this massive slops, where you should supervise the end-to-end processes while you and your AI-tools engineered your the app.This include the problem statement, decision making, system design (per-feature), code quality, testing, until the end-to-end integration. This is known as human in the loop system

AI is there to boost your productivity, not delegating or even replacing your role. By doing so, you are expected not lose your engineering judgement on your software design.

## Spec Driven Development

Before a feature is implemented, you should consider the logistical requirements of the feature such as Problem, potential solution, and how it fist to the past implementation. This brainstorming process really useful for:

1. Yourself: You are responsibly aware about what are you currently building, or you may came across other potential solution that fits your challenge.
2. AI-Assisted coding Tools: May scan the current state and help them decide the best outcome
3. Peers: Documentation help them know the progress, and may give some inputs

Designing the spec of your feature enables you to maturely develop your ideas. You may put the specs anywhere that is noticable by your peers or supervisor (github project item is a great place too). I put the template of a spec feature as follows:

```yaml
# {Title}

## Problem
{What is your current problem, and why is that a problem. Who is the user ? what component is problematic ? }

{You may want to describe this, as clear and concise as possible}

## Why this is important?
{Why do you think having this feature implemented is important ? You may describe the implication, along with the pros and cons}

## In-Scope
{What components are in the scope of the project, you may need to be specific perhaps the project also involves anoter feature components}

## Out of scope
{List of out-of-scope components}

## Optional: Potential Solution
{List of short description of solutions along with the pros and cons}

```

We expect we have clear description by having this description in place. This will help us to create a descision on the design system on the specs, and AI-Assisted Coding Tools Provide an in-planted feature so-called Plan Mode.

## Plan Mode

AI-Assisted Coding tools such as cursor, claude code and cursor has its embedded plan mode feature on the app. It allows the agent to walk though to your code base, libraries, and comments you made to give you an overview about your current state and what necessary changes should be made. You may use the spec you design from the previous stage to be the base line of the input of the plan mode.

If the AI thinks that your implementation invites a bug / indecisive action, they mostly will ask you list of questions to clarify about the implementation, ensuring that the AI has its context to plan out your feature.

The clearer, and the more specific the prompt is, the more beautiful and accurate the plan will be, but how specific out prompt on the plan more will be ? There is no specific answer to this. 

Once the plan is complete, you should review the plan and consider if the plan is fits to your needs. They may create the plan, but you should not delegate your judgement. You may need to take a looks on the RBAC system on the middleware, space and time complexity, the scope of the test, and other meticulous stuff. 

If something does not fits to your end, you may ask them to compare with another solution as well. In this phase, you are also able to create a feedback loop so your plan can be more precise. The key point before your plan is final, you should be able to be responsible for the outcome. 

You should meticulously review the code, and make sure if the outcome is really fits based on the description. You may want to add comments to the implementation to ease debugging or help your peers.

Even this takes more time to develop with, you may create the outcome to be faster and more accurate along with your needs (even you coding styles), while also you not losing your judgement and saves up tokens. You may want to see our appendix, so see the suggested flow of using the plan mode. 

One way to make the both coding agent and plan mode accurate is through skills and Rules.

## Skills and Rules

Skills and Rules are two essential component in developing a software during AI-Assisted Era. It gives you more discipline on how the AI can be thoroughly harnessed by providing specific commands or description throughout the development. Skills differ than the rules as skills are description that embedded to the app (can be done for globally or only for the project), while rules are agentic commands that located on the porject diurectory itself.

Having skills and Rules in place is super useful, to create more accurate context to the coding agent. It helps us to make both accurate plan and correct implementation. Noetheless, how large a skills would be while ensuring the correctness ? The rule of thumb is that you make the description as concise as possible while also covering all the strict cases along with its priority. See https://cursor.com/docs/rules for more.

Rules are mostly for Cursor, how about other tools ? Other tools such as codex or claude code may read cursor rules as long as there are clear description on their project agentic description, such as `AGENTS.md` or `CLAUDE.md` .

The suggested skills / rules are outlines as follows:

```yaml
# {Title of Rules / Skills }

{Description, along with priority}

## List of Responsibilities
{responsibilites along with its description}

## Checklists
{adhered checklists}

```

## Discipline during the AI Period

The listed feature above are just the helpful features configured by the providers, or even this reading might be outdated later considering new feature that would be shipped in the future.

Acquiring new knowledge is should be a priority, particularly in the massive AI-ERA. There are tons and tons of new feature coming to game and you should give some of your spare time to keep up with the updates, and adjust your habit in engineering your software.

You might lost or rust some of your knowledge from the past, and obviously you do not want to rust, or even lost your skills in programming. As you may concerned that software eigneering discipline is self-regrated, you should be able to wisely schedule yourself if you when you want to utilize AI or do it manually. Again, the main key of using AI is to boost the productivity, not replacing yourself as the human / orchestrator.

## Conclusion: Discipline during the AI Period

The key point of using AI-Assisted coding tools is to help us to get it correct and maintanable for both long term and short term. Vibe coding truely revolutionize how a software engineering prospects could be, nevertheless, we should be able to be responsisble with the outcome that we ship eventually.

Agentic Engineering is a framework to help you develop your app, alongside with AI - not to replace your role as the developer. When you are developing your feature, you need to conduct a spec-driven documentation, where you evaluate thoroughly your problem, scopes, and perhaps your solution. Then, you move to plan mode, where you and your Agentic tools will design the blueprint of your system on the implementation. Human in the loop is required to make accurate outsome. AI Skills and Rules will help you during your planning and development.

Lastly, important disciplines should br maintained such as regularly researching for the current updates, while also expand and keeping up with your own skills. By having all the components in place, you can responsibly using AI, while honing yur skills, while adjusting yoruself with AI.

## Appendix: Plan Creation

This is the plan that i usually used to create the plan

### Step 1: Give the AI Context

Before the plan is created, we should give the AI enough context on what we are about to build. This is important, so they can surely know what are the main intention as well as the scope, the spec we created before would be a good resource in the context. The example of the prompt could be:

```yaml
--- Feature Spec
# {Title}

## Problem
{What is your current problem, and why is that a problem. Who is the user ? what component is problematic ? }

{You may want to describe this, as clear and concise as possible}

## Why this is important?
{Why do you think having this feature implemented is important ? You may describe the implication, along with the pros and cons}

## In-Scope
{What components are in the scope of the project, you may need to be specific perhaps the project also involves anoter feature components}

## Out of scope
{List of out-of-scope components}

## Optional: Potential Solution
{List of short description of solutions along with the pros and cons}

---

Would you mind to create an implementation plan, please consider any necessary components such as the RBAC, time and space complexity, and user experience.
Please list all the fiule that you are about to chagne along with the methods. If you have any question please ask me question, until you feel convertable about the implementation plan. 
```

Then the agent will lists you question to clarify to fits your needs, until the agent eventually propose the plan. Then you should evaluate the given plan, please pay attention to the lists of endpoints, database attributes, RBAC, if you find somethign peculiar, please ask the AI to clariy or make your own suggestion.

After you are fix with the plan, please ask the agent about several nitty gritties of the implementation, just to clarify if the implementation is specific enough.

The you can ask the agent to implement. Once the feature is implemented, you might want to test the behaviour on the back