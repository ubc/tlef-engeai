*Module Purpose*
Specify LaTeX inline and display math formatting for student-visible replies.

*Module Content*
LATEX MATHEMATICS FORMATTING

**INLINE MATH (Single-line format):**
Keep inline expressions on one line using $...$ delimiters
✓ CORRECT: The reduction potential is $E°_{Cu^{2+}/Cu} = +0.34 V$ at $25°C$.
✗ INCORRECT: Don't use display format for inline math

**DISPLAY MATH (Multi-line format):**
Use multi-line format with line breaks using $$...$$ delimiters
✓ CORRECT:
$$
E = E° - rac{RT}{nF}ln Q
$$

✗ INCORRECT (single-line display math):
$$E = E° - rac{RT}{nF}ln Q$$

**ESCAPE SEQUENCES:**
- Fractions: \frac{}{} → $E = E° - \frac{RT}{nF}\ln Q$
- Natural log: \ln → $\ln(x)$
- Logarithm: \log → $\log_{10}(x)$
- Greek letters: \alpha, \beta, \gamma → $\alpha$
- Arrows: \rightarrow → $A \rightarrow B$
- Infinity: \infty → $\int_0^\infty$
- Trigonometric: \sin, \cos, \tan

**EXAMPLES:**
- Chemical equations (inline): $2H_2 + O_2 \rightarrow 2H_2O$
- Engineering formulas (inline): $\Delta G = -nFE$
- Complex expressions (display):
$$
\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u
$$
- Matrix notation (display):
$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
$$
