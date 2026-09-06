# Front-End Engineering

```prerequisites

- Basic familiarity with HTML and CSS
- Basic familiarity with TypeScript or JavaScript
- [Main Architecture](/docs/technical-concepts/main-architecture)
- A basic understanding of browser developer tools

```

```relevant sources

- [Main Architecture](/docs/technical-concepts/main-architecture)
- [Agentic Engineering](/docs/logistics/agentic-engineering)
- [AI-Assisted Coding Tools](/docs/technical-concepts/ai-assisted-coding-tools)
- [ISO 9241-210: Human-Centred Design](https://www.iso.org/standard/77520.html)
- [Digital.gov: Wireframing](https://digital.gov/guides/research-collaboration/designing/wireframing)
- [MDN: HTML Accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML)
- [MDN: Media Query Fundamentals](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Media_queries)

```

This guide explains how to plan, build, and verify front-end features in EngE-AI. It is written for developers working with the project’s vanilla TypeScript, HTML, and CSS architecture.

You will learn how to:

1. Identify the user and their goal.
2. Create a useful wireframe before coding.
3. Reuse EngE-AI’s existing visual and interaction patterns.
4. Design responsive and accessible interfaces.
5. Plan onboarding, loading, empty, error, and completion states.
6. Use AI-assisted coding tools while reviewing their output carefully.

By the end of this guide, you should be able to turn a feature idea into a clear, responsive, and verifiable front-end implementation.

## User Centered Design

User-centered design (UCD) is an iterative approach to building software around the user’s goals, context, abilities, and constraints. It begins by understanding who the user is and what they need to accomplish, then turns that understanding into interface flows, content, layouts, and interactions. The design is evaluated and refined to ensure that users can complete their tasks clearly, efficiently, and accessibly.

In EngE-AI, UCD helps developers make decisions before and during implementation. It influences the wording of buttons, the structure of a page, the order of actions, the responsive layout, the onboarding experience, and the way errors are communicated.

### Identify the User and Their Goal

Before developing a feature, identify:

- the user’s role, such as student, instructor, teaching assistant, or administrator;
- the user’s primary goal;
- the task they need to complete;
- the context in which they use the feature;
- the knowledge they already have;
- their permissions and responsibilities;
- possible accessibility or device constraints; and
- what successful completion looks like.

The goal is not to collect unnecessary personal information. Details such as age, background, or previous app experience should only be included when they affect the design of the feature.

### Create a Lightweight Persona

A persona is a short, realistic representation of a user who interacts with the feature. It should focus on the user’s role, task, and needs rather than becoming a detailed biography.

For a small EngE-AI feature, the following template is usually sufficient:

```yaml
Role:
Primary goal:
Main task:
Usage context:
Relevant knowledge:
Possible constraints:
Accessibility considerations:
Required permissions:
Definition of success:
Open assumptions:
```

The persona should lead to a design decision. For example, if the student may be unfamiliar with the interface, the page should use clear labels, visible instructions, and a predictable next action.

### Map the User’s Task

After identifying the user, describe the task from beginning to end:

1. How does the user enter the feature?
2. What information do they need before starting?
3. What is the primary action?
4. What feedback does the interface provide?
5. What happens when information is missing or invalid?
6. What happens when the task succeeds?
7. Where does the user go next?

This flow should include more than the ideal successful path. Loading, empty, error, permission, and completion states are part of the user experience.

### Validate and Improve

UCD is an ongoing process rather than a one-time planning step. Before implementation, review the persona and wireframe with a supervisor, teammate, or intended user when possible. After implementation, test whether the user can complete the task as expected.

During review, ask:

- Can the user identify the purpose of the page?
- Can they find the primary action?
- Do labels and instructions make sense?
- Can they recover from an error?
- Does the feature work at relevant screen sizes?
- Can it be used with a keyboard?
- Are loading, empty, and completion states understandable?
- Does the interface expose only the actions appropriate to the user’s role?

Keep facts, assumptions, and unanswered questions separate. If a design decision is based on an assumption, record it and validate it when possible.

## Styling Fundamentals

Styling fundamentals in EngE-AI refer to the visual and interaction principles that make a page clear, consistent, and easy to use. Styling includes more than colors and decoration; it also covers typography, spacing, layout, visual hierarchy, buttons, forms, navigation, feedback messages, and the way components respond to user actions. Here are EngE-AI's main color pallete:

| Color Name (Color Palette Color Code) | Description |
| --- | --- |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#4d7a2f;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> CHBE green (`#4d7a2f`) | Primary EngE-AI brand and action accent. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#2F5F8F;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> UBC blue (`#2F5F8F`) | Supporting institutional color and secondary emphasis. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#1B365D;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Navy blue (`#1B365D`) | Deep supporting color for strong contrast and structure. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#ECE5DD;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Warm background (`#ECE5DD`) | Secondary surface for cards, panels, and grouped content. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#f7f7f7;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Sidebar background (`#f7f7f7`) | Light surface used to separate sidebar navigation from the main content. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#fcfcfc;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Chat background (`#fcfcfc`) | Main light surface used by chat and application content areas. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#b8b8b8;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Border (`#b8b8b8`) | Borders and dividers that define component boundaries. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#efefef;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Hover background (`#efefef`) | Subtle background change for hover and highlighted interaction states. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#333333;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Primary text (`#333333`) | Main text color for readable content and headings. |
| <span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background-color:#6c757d;border:1px solid #777;border-radius:2px;vertical-align:-0.1em;margin-right:0.35rem;"></span> Secondary text (`#6c757d`) | Supporting text such as metadata, hints, and less prominent descriptions. |

```agent-note
Before creating new styles, inspect the existing page and component styles to identify reusable patterns, design tokens, and interaction behaviors. Avoid creating duplicate colors, spacing values, or components when an existing pattern can be reused. Confirm that the content is readable, important actions are clear, focus states are visible, color is not the only way to communicate meaning, and the interface remains usable with keyboard navigation and accessibility preferences.
```

```developer-note
When working on a component, refer to the CSS styles for the relevant page before creating or changing its styles. Use the browser’s Inspect tool to examine existing spacing, sizing, colors, and layout, and make manual adjustments when appropriate.

Chrome DevTools also provides the Lighthouse accessibility audit. Run the audit using the Accessibility category, then review the page manually and compare the component with other pages or sections. This helps identify issues that automated testing may not detect, such as unclear instructions, confusing interaction patterns, or inconsistent visual feedback.
```

## Wireframe

A wireframe is a low-fidelity representation of a page or feature. It shows the structure of the interface, the order of information, the main actions, and how users move through a task. A wireframe focuses on layout and functionality rather than final colors, images, or visual polish.

Before developing a new feature or changing an existing user flow, create a wireframe that shows:

1. the feature’s entry point
2. the user’s primary goal
3. the main content and actions
4. navigation between screens or sections
5. loading, empty, error, permission, and completion states
6. important validation messages
7. how the layout changes on smaller screens

You may use the official EngE-AI [Figma](https://www.figma.com/) wireframe to brainstorm an upcoming feature. Drafting the wireframe in Figma is useful because it provides:

- **You** Explore ideas and decide what the feature should do before implementation.
- **Project documentation:** Record the current design and track the feature’s progress.
- **Supervisor** Allow your supervisor and teammates to provide feedback on the proposed user flow and interface.

Please reach out to your supervisor when you need feedback. Early review can help identify unclear requirements, improve the wireframe, and reduce personal bias in design decisions.

```developer-note
When the wireframe is ready, you may connect the EngE-AI Figma file to your AI-assisted coding IDE through MCP. This can give the IDE more accurate context about the intended layout, components, and interactions.

For more information, see [Figma’s Guide to the Figma MCP Server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server).

```



## Responsive Design

EngE-AI uses a mobile-first approach so that users can access the application on phones, tablets, laptops, and desktop monitors. Responsive behavior is implemented mainly through CSS media queries, which adjust the layout when the available viewport width changes. Please consider there four responsive modes:

| Mode | Width | Typical behavior | Example Devices |
|---|---:|---|---|
| Compact mobile | ≤480px | Reduced padding, stacked controls, and single-column content | iPhone SE, Samsung Galaxy phone, or another small-to-medium Android phone |
| Mobile | 481–768px | Mobile navigation, collapsed sidebars, and one active panel | iPad mini in portrait orientation, a small Android tablet, or a phone in landscape orientation |
| Tablet / small desktop | 769–1023px | More visible navigation and wider content areas | Standard iPad in portrait orientation, an Android tablet in portrait orientation, or a small laptop |
| Desktop | ≥1024px | Multi-column layouts and expanded navigation | iPad or Android tablet in landscape orientation, MacBook, Windows laptop, or desktop monitor |


## Inspirational Resources

While developing your front end, you may want to visit these resources to search for inspiration. Some of the components are based on React and Tailwind CSS. However, your AI coding agent can easily translate React components into vanilla TypeScript. The sources are:

- [21st.dev](https://21st.dev/)
- [Ruixen UI](https://ruixen.com/)
- [React Bits](https://www.reactbits.dev/get-started/index)
- [Aceternity UI](https://ui.aceternity.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [MDN: Media queries](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Media_queries)
- [MDN: HTML accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML)

## Conclusion and Recommendation

Overall, Front end development is a crucial part while developing EngE-AI, this component directly interact with the user. To ensure the fluency, we adhere to user centered design (UCD) framework where the main development objecttive is merely for user. Additionally, we also discuss about wireframe, EngE-AI Styling, responsive design, and other inspirational resources

While developing the front end, please follow these steps:

1. Clearly define your problem as part of the agentic development process.
2. Determine the intended users and their corresponding behaviors. Create user personas, either mentally or in writing.
3. Create a wireframe for the newly implemented feature.
4. Integrate your wireframe into your coding agent, preferably by using plan mode.
5. Evaluate the outcome produced by your coding agent. For small changes, make the modifications manually. Otherwise, you may communicate directly with the coding agent or use plan mode.
6. While refining the styling, you may refer to free styling resources according to your preferences.
7. Adjust the responsive design and repeat step 5 as needed.

By the end of this page, you should have gained exposure to how EngE-AI pages are developed. Good luck.
