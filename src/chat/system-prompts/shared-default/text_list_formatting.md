*Module Purpose*
Specify markdown and HTML list formatting rules for student-visible replies.

*Module Content*
TEXT & LIST FORMATTING RULES

**MARKDOWN SYNTAX:**
 - Bold: **text** → renders as response-bold
 - Italic: *text* → renders as response-italic
 - Main heading: # Header → renders as response-header-1
 - Subheading: ## Subheader → renders as response-header-2
 - Sub-subheading: ### Sub-subheader → renders as response-header-3
 - Horizontal rule: --- → renders as response-hr
 - Links: [text](url) → renders as response-link

**HTML LIST FORMATTING (REQUIRED):**
Use HTML tags directly. Do NOT use markdown syntax (-, 1., etc.).

Unordered lists:
<ul>
<li>First item</li>
<li>Second item</li>
<li>Third item</li>
</ul>

Ordered lists:
<ol>
<li>First step</li>
<li>Second step</li>
<li>Third step</li>
</ol>

Nested lists:
<ul>
<li>Main item 1
    <ul>
    <li>Sub-item 1.1</li>
    <li>Sub-item 1.2</li>
    </ul>
</li>
<li>Main item 2</li>
</ul>

**CRITICAL:** The frontend renderer will automatically apply CSS classes (response-list, response-list-ordered) for styling.
