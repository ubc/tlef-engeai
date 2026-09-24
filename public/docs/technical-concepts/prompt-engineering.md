# Prompt Engineering

```prerequisites
- [Agentic Engineering](/docs/logistics/agentic-engineering)
- [Main Architecture](/docs/technical-concepts/main-architecture)
- Basic familiarity with LLM and prompt construction
- [UBC GenAI LLM Toolkit](https://www.npmjs.com/package/ubc-genai-toolkit-llm)
- [UBC GenAI RAG Toolkit](https://www.npmjs.com/package/ubc-genai-toolkit-rag)
```

```relevant sources
- [OpenAI GPT-5 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5)
```

Prompt engineering is the practice of designing instructions and context so that a large language model produces useful, consistent, and appropriately constrained responses. In EngE-AI, prompt engineering includes more than writing a single instruction: it includes selecting a conversation mode, organizing prompt modules, adding course context, and validating the resulting behavior.

Clear prompt design can improve consistency and alignment, but it does not guarantee factual accuracy. Accuracy also depends on the model, the course materials, retrieval quality, application logic, and human review.

This page explains how prompts are constructed and maintained in EngE-AI. It covers:

1. Prompt layers
2. Socratic and Explanatory conversation modes
3. System prompt modules
4. Prompt-writing principles
5. RAG context and prompt bridges
6. Prompt editing, validation, and debugging

By the end of this page, you should be able to explain how EngE-AI builds a chat prompt, identify the purpose of its main prompt components, and follow the project workflow when changing or testing a prompt.

## Prompt Layers

In an inference call, prompt layers can be divided into three message roles:

| Role | Purpose in a chat request |
|---|---|
| `system` | Defines the assistant’s behavior, constraints, teaching approach, and course context. |
| `user` | Contains the student’s current message and, when available, retrieved course-material context. |
| `assistant` | Contains the model’s responses and previous assistant turns in the conversation history. |

## Conversation Modes

EngE-AI currently uses two conversation modes, each with its own prompt modules and RAG bridge.

| Mode | Main purpose | Typical behavior |
|---|---|---|
| **Socratic** | Help students discover an answer through guided reasoning. | Uses progressive questioning, asks one question at a time, and builds on the student’s response. |
| **Explanatory** | Help students understand a concept through direct explanation. | Explains the concept first, uses ordered steps and examples, and may ask one optional comprehension check. |

## System Prompt Modules

EngE-AI’s system prompt is a collection of self-contained modules wrapped in XML-like tags:

```xml
<system_prompt mode="socratic">
  <module id="system prompt guidance">
    <!-- Module instructions -->
  </module>
  <module id="course main intro">
    <!-- Course context and learning objectives -->
  </module>
</system_prompt>
```

The XML wrapper makes the module boundaries explicit. Meanwhile, Markdown is used inside each module because it is readable for developers and remains available to the model as literal prompt text. Both Markdown and XML wrappers are used because LLMs are trained on both syntaxes.

Each module follows this general format:

```md
*Module Purpose*
One sentence describing what this module instructs the model to do.

*Module Content*
Instructions, examples, and checklists.
```

Modules are organized into two groups:

- **Shared modules** apply to both modes, such as formatting, correctness, diagrams, and the course introduction.
- **Mode-specific modules** define the behavior of Socratic or Explanatory mode.


```developer-note

When writing a module:

1. State its purpose in one sentence.
2. Use direct, testable instructions.
3. Include examples when the expected response behavior is difficult to describe.
4. Add a checklist when the model must verify several conditions before responding.
5. Use `CRITICAL:` or `IMPORTANT:` when a requirement must take priority within the module.
6. Do not ask the model to expose internal XML tags or other implementation details in student-visible replies.

```

## Prompt-Writing Principles

### Be clear, concise, and precise without removing necessary context

Use direct verbs and precise adjectives or adverbs to describe the expected behavior, output, and limits. Define technical terms when they could be interpreted in more than one way. For example:

> "Ask one Socratic question at a time and wait for the student’s response before asking the next question."

This is more precise than saying “Use the Socratic method.”

Remove repetition, but do not remove information that the model needs to make a correct decision. The shortest instruction is not always the clearest instruction. For example, “Answer concisely” is brief but may be ambiguous. A longer instruction may be preferable when it defines the intended limit precisely.

Prefer:

> "Use as few words as possible while still giving a complete and correct answer."

```developer-note

The right balance depends on the behavior being requested. Review the output rather than assuming that fewer tokens automatically produce better prompts.

```

### Use few-shot examples deliberately

Few-shot prompting means providing examples that demonstrate the desired behavior. A useful example should be representative of a real case and should make the expected structure or level of detail clear.

When adding an example, consider:

- what behavior the example demonstrates;
- whether the example contains enough context to be understood;
- whether the example could accidentally encourage the model to copy irrelevant content; and
- whether a negative example is needed to show what the model must avoid.

### Use correct and consistent terminology

Typos can change meaning, tokenization, or retrieval results, especially when a technical term is important to the prompt or the student’s question. Please review spelling and grammar carefully, but do not assume that correcting a typo alone will resolve a model-behavior problem.

### Avoid contradictions and unsupported absolutes

Prompt modules should not give conflicting instructions. If a requirement must take priority, state the priority explicitly and test the behavior. Avoid claims such as “this guarantees accuracy” or “the model always follows this rule.” A prompt can guide behavior, but it cannot remove the need for retrieval checks, automated tests, and human review.

## RAG Context and Prompt Bridges

Retrieval-Augmented Generation (RAG) retrieves relevant course-material chunks before the LLM responds. EngE-AI places the retrieved material inside a `<course_materials>` context block and labels the boundaries of each document. The prompt bridge is located in the `user` message role, meaning that retrieval occurs when the user sends a message.

When no RAG material is retrieved, the assistant should state that limitation clearly before relying on general engineering knowledge. It should not invent chapter numbers, sections, quotations, or citations.

## Conclusion

In EngE-AI, the two main responsibilities in prompt engineering are designing and organizing clear instructions. The system prompt, RAG context, conversation mode, and message history each contribute to the final response. Understanding how these components interact makes it easier to write prompts that are clear, maintainable, and aligned with EngE-AI’s learning goals.
