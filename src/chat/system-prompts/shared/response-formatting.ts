/**
 * Response formatting
 */

export const RESPONSE_FORMATTING_SECTION = `
===========================================
TEXT & LIST FORMATTING RULES
===========================================

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

CRITICAL: The frontend renderer will automatically apply CSS classes (response-list, response-list-ordered) for styling.


===========================================
LATEX MATHEMATICS FORMATTING
===========================================

**INLINE MATH (Single-line format):**
Keep inline expressions on one line using $...$ delimiters
✓ CORRECT: The reduction potential is $E°_{Cu^{2+}/Cu} = +0.34 V$ at $25°C$.
✗ INCORRECT: Don't use display format for inline math

**DISPLAY MATH (Multi-line format):**
Use multi-line format with line breaks using $$...$$ delimiters
✓ CORRECT:
$$
E = E° - \frac{RT}{nF}\ln Q
$$

✗ INCORRECT (single-line display math):
$$E = E° - \frac{RT}{nF}\ln Q$$

**ESCAPE SEQUENCES:**
- Fractions: \\frac{}{} → $E = E° - \\frac{RT}{nF}\\ln Q$
- Natural log: \\ln → $\\ln(x)$
- Logarithm: \\log → $\\log_{10}(x)$
- Greek letters: \\alpha, \\beta, \\gamma → $\\alpha$
- Arrows: \\rightarrow → $A \\rightarrow B$
- Infinity: \\infty → $\\int_0^\\infty$
- Trigonometric: \\sin, \\cos, \\tan

**EXAMPLES:**
- Chemical equations (inline): $2H_2 + O_2 \\rightarrow 2H_2O$
- Engineering formulas (inline): $\\Delta G = -nFE$
- Complex expressions (display):
$$
\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u
$$
- Matrix notation (display):
$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
$$


===========================================
MERMAID DIAGRAM FORMATTING
===========================================

**CRITICAL MERMAID SYNTAX RULES:**
1. Close all node labels with square brackets: [Label]
2. Enclose ALL text inside square brackets in DOUBLE QUOTES: ["Label text"]
3. Enclose ALL edge labels in DOUBLE QUOTES within pipes: |"Edge label"|
4. Avoid complex math in edge labels (causes parser errors)

**CORRECT EXAMPLES:**
- Node: A["Nernst Equation"] ✓
- Edge: A -->|"calculates potential"| B ✓
- Complex math in nodes: H["E = E° - (RT/nF)·ln(Q)"] ✓

**INCORRECT EXAMPLES:**
- Node without quotes: A[Label] ✗
- Edge with unquoted math: A -->|E = E° - (RT/nF)·ln(Q)| B ✗
- Complex formula in edge label: A -->|"E = E° - (RT/nF)·ln(Q)"| B ✗ (put in node instead)

**ARTIFACT USAGE:**
<Artefact>
graph TD
    A["Input Node"]
    B["Process Node"]
    C["Output Node"]
    A -->|"flows to"| B
    B -->|"produces"| C
</Artefact>

The diagram will display with a "View Diagram" button for students to interact with.


===========================================`;
