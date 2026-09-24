# Socratic tutoring style: from rigid questioning to adaptive scaffolding

## Purpose

This is an analysis and recommendation document. It does **not** change the current prompt, runtime bridge, detector, or UI.

The question is not whether the tutor should reveal answers immediately. It is how it should respond when questioning is no longer helping a student make progress. A tutor that indefinitely asks smaller questions can turn guided discovery into an interrogation loop. A tutor that gives the full solution too early can remove the thinking that the student needs to practise.

The recommended direction is **adaptive scaffolding**: retain student ownership of the target reasoning, while increasing the amount and specificity of help when the conversation provides evidence that the student is blocked.

## Executive conclusion

The current Socratic rules overcorrect toward answer withholding:

- exactly one question mark;
- no lists;
- at most three sentences before the question;
- no worked steps, derivation, procedure, or formula that the student could have produced;
- after the third support rung, keep using a different single step rather than changing strategy.

These rules may prevent the specific lecture failures seen in the logs, but they do not distinguish **productive struggle** from **unproductive impasse**. They also prohibit useful tutoring moves such as:

- showing a partially completed equation and asking the learner to finish it;
- using display math to make an expression readable;
- giving a brief explanation after the learner has made the relevant attempt;
- summarizing a misconception before asking for a correction;
- changing to a worked-example-plus-completion task after repeated failure.

The better policy is not “Socratic or explanatory.” It is a **continuum of support**:

```text
Student attempt
    ↓
Prompt / question
    ↓
Targeted hint or representation
    ↓
Partial worked step
    ↓
Short worked example + student completes an analogous step
    ↓
Direct explanation only when needed, followed by a transfer check
    ↓
Fade support when the student can explain or apply the idea
```

The tutor should move **up** this ladder on evidence of impasse and move **down** it on evidence of understanding. The invariant is not “never state an equation”; it is: **the student must still perform and explain the target reasoning before the topic is treated as understood.**

## What the research supports

### 1. Scaffolding includes demonstration, not only questions

Wood, Bruner, and Ross describe scaffolding as enabling a learner to accomplish something beyond what they could do unaided. Their six functions include reducing the degrees of freedom, marking critical features, controlling frustration, and demonstration. Demonstration is not a failure of tutoring; it is a legitimate scaffold when it completes or idealizes part of an attempted solution.

Implication for EngE-AI: after repeated evidence that a learner cannot begin a step, the tutor can model **one meaningful step** or present a partial representation. It should then hand responsibility for the next meaningful step back to the student.

Source: Wood, Bruner, & Ross (1976), “The Role of Tutoring in Problem Solving,” [PDF](https://sachafund.wordpress.com/wp-content/uploads/2018/10/wood_et_al-1976-journal_of_child_psychology_and_psychiatry.pdf).

### 2. Effective support is contingent and fades

Scaffolding research describes support as contingent: more support when performance shows a learner is blocked; less support when performance shows competence. Dialogue tutoring research likewise describes proactive scaffolding that adjusts the complexity and expression of help based on the learner’s apparent zone of proximal development, then transfers responsibility back as they succeed.

Implication for EngE-AI: a fixed “one question forever” rule is not adaptive. The next response should depend on the last student contribution, not merely on the fact that the conversation is in Socratic mode.

Source: Albacete et al. (2018), “Providing Proactive Scaffolding During Tutorial Dialogue,” [PDF](https://www.cs.cmu.edu/~bmclaren/pubs/AlbaceteEtAl-ProvidingProactiveScaffoldingDuringTutorialDialogue-AIED2018.pdf).

### 3. Worked examples and problem solving can be complementary

Research on tutored problem solving and worked examples finds that adaptive fading of examples can outperform fixed fading or problem solving alone. The relevant distinction is not “an example is always bad”; it is whether the learner is asked to self-explain and then complete the next analogous step as support fades.

Implication for EngE-AI: after an impasse, a short **worked micro-example** can be appropriate. It should not be the student’s whole problem solved for them. It should isolate the blocking move, then require an analogous move with the student’s own data.

Source: Salden, Aleven, Renkl, & Schwonke (2008), “Worked Examples and Tutored Problem Solving,” [abstract](https://doi.org/10.1111/j.1756-8765.2008.01011.x).

### 4. More granular dialogue is not automatically better

VanLehn’s review found a plateau: step-based intelligent tutoring systems and human tutors showed broadly similar effectiveness in the reviewed studies. This does **not** prove that a fixed step policy is ideal; it does show that arbitrarily making questions smaller or more numerous is not itself a learning strategy.

Implication for EngE-AI: the goal should be a useful learning step, not the smallest possible question. One well-chosen partial representation or explanation may be better than several increasingly narrow questions.

Source: VanLehn (2011), “The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems, and Other Tutoring Systems,” [abstract](https://www.tandfonline.com/doi/abs/10.1080/00461520.2011.611369).

### 5. AI Socratic tutoring needs a condition for revealing help

Recent work on generative-AI Socratic tutoring frames the method as helping students reflect on errors, break down the problem, and construct a solution before revealing a full solution. Its operational criterion for escalation is whether the learner can articulate the root cause and a coherent solution path.

Implication for EngE-AI: “full explanation” should be a controlled escalation, not an automatic response to a named struggle topic and not something permanently forbidden. The tutor needs evidence that the student has attempted the target reasoning, plus a later check that they can use it.

Source: “When Generative AI Meets Socratic Method,” *Journal of Computer Assisted Learning*, [article](https://doi.org/10.1002/jcal.70210).

## Diagnosis of the current Socratic prompt

### The real problem

The prior logs show a genuine failure: the tutor gave a full chemistry lecture, then attached one question. That is not Socratic simply because it ends in a question.

However, the current remedy uses **format proxies** as though they were pedagogical rules:

| Current restriction | Why it is too rigid |
|---|---|
| Exactly one question mark | A learner may benefit from a brief explanation followed by a check; punctuation count cannot determine whether the learner owns the reasoning. |
| No lists | A concise two-item comparison can reduce cognitive load; an entire solution outline is the actual concern. |
| No display math | Display math is a representation, not an answer. It can make a formula readable and can be used in a completion task. |
| No formula the student could have produced | A learner may need to see a formula after attempting it, then explain why it applies. |
| Stay on rung 3 indefinitely | This creates the loop the policy is intended to avoid. Repeated impasse should cause a deliberate change in support, not more of the same. |

### A concrete inconsistency to resolve before any further changes

`socratic_conversation.md` currently says display math **may** be used. But:

- its own checklist says no `$$` display math;
- `struggle-topics-bridge.ts` says “no `$$` display math”;
- `findSocraticShapeViolations` flags any `$$` as a violation.

That is an internally contradictory contract. No learner-facing behavior should be changed until the product decision is explicit: display math is either permitted for a purposeful scaffold, or it is not. The research supports permitting it.

## Recommended policy: adaptive guided tutoring

### Preserve this invariant

> Do not treat a topic as learned because the tutor explained it. Treat it as learned only after the student independently explains, completes, or applies the target reasoning.

This protects student ownership without requiring the tutor to withhold every representation or explanation.

### Replace format rules with reasoning rules

The following policy is a proposed replacement direction; it is not an implementation instruction.

| Learner evidence | Tutor move | What is allowed | What remains required from the student |
|---|---|---|---|
| A plausible first attempt | Prompt reflection | Ask about an assumption, comparison, or consequence | Revise or justify the attempt |
| A specific misconception | Mark the critical feature | Name the relevant contrast, counterexample, or condition | State why the original claim fails |
| “I don’t know” once | Reduce degrees of freedom | One smaller question, choice, diagram, or concrete case | Answer the reduced task |
| “I don’t know” again / no usable attempt | Give a targeted hint | One fact, a partial equation, or a labelled representation | Complete or interpret the missing part |
| Repeated block on the same target step | Model and fade | Show one solved micro-step or analogous micro-example, possibly with display math | Complete the next analogous step with their own data |
| Still blocked after scaffold | Explain briefly, then return responsibility | A concise explanation of the blocking principle | Solve or explain one transfer item |
| Accurate explanation or application | Fade support | Ask a broader application question or offer practice | Apply without the former scaffold |

The tutor may use LaTex, lists, a table, or a diagram when the representation reduces unnecessary cognitive load. The constraint is scope: a scaffold should reveal **only enough of the path to make the next student contribution possible**.

## Example: weak-base pH without an interrogation loop

### Too rigid

> Tutor: What ion appears when ammonia reacts with water?  
> Student: I don’t know.  
> Tutor: What is the product on the right-hand side?  
> Student: I don’t know.  
> Tutor: Which product contains oxygen and hydrogen?  

The questions become smaller, but the learner has no usable representation and the exchange becomes frustrating.

### Adaptive scaffold

> Tutor: Ammonia reacts with water to form ammonium and hydroxide:  
>
> $$
> \mathrm{NH_3 + H_2O \rightleftharpoons NH_4^+ + OH^-}
> $$
>
> Which product in this equation tells us the solution is basic?

If the learner answers `OH⁻`:

> Tutor: Exactly. The calculation’s first target is therefore $[\mathrm{OH}^-]$. Here is the equilibrium relation with the concentration you need left blank:  
>
> $$
> K_b = \frac{[\mathrm{NH_4^+}][\mathrm{OH^-}]}{[\mathrm{NH_3}]}
> $$
>
> Which quantity in that expression do we need to determine before converting to pOH?

This is still guided learning: the tutor has removed notation-search and recall barriers, but the student identifies the target quantity and must carry out the next move.

If the learner cannot continue after this scaffold:

> Tutor: I’ll show the equilibrium setup once, then you will use the same setup with your given concentration. The key idea is that the change in $\mathrm{OH^-}$ is the same size as the change in $\mathrm{NH_4^+}$. What symbol would you put for that shared change?

The tutor models the blocked conceptual relationship, not the entire answer.

## Proposed prompt design, at a high level

Rather than a binary “Socratic versus interpretive” switch, use an explicit support state for the **current concept**:

```text
attempt → prompt → hint → partial model → micro-example → explanation → transfer check
                         ↑                                      ↓
                         └────── fade when evidence improves ───┘
```

The state must be based on evidence in the conversation, not merely on the number of turns. Useful evidence includes:

- whether the student made an attempt;
- whether the attempt identifies the relevant quantity, principle, or relation;
- whether the student repeats the same non-answer;
- whether the student can explain why a step applies;
- whether the student can apply the idea to a new value or case.

### Minimal prompt changes to evaluate later

1. Remove the display-math prohibition and make mathematical representations explicitly permitted when they serve a partial scaffold.
2. Replace “exactly one question mark” with “ask one primary task at a time.” A response may include a short explanation or representation, but should not demand several independent student actions.
3. Replace “no lists” with “do not present the entire solution as a multi-step procedure before the student has attempted the target reasoning.”
4. Replace “stay on rung 3 indefinitely” with a defined escalation: after repeated failure on the same target step, provide a micro-example or short explanation, then require a transfer response.
5. Separate **student ownership** from **answer withholding** in all prompt modules. Student ownership is verified by a later explanation or application; it is not guaranteed by asking more questions.

## What needs runtime support later

Prompt wording alone cannot reliably know whether the student has failed the same step twice, accepted a hint, or completed a transfer check. The current system already has a related problem: practice and unstruggle state are inferred from chat history rather than stored as a small per-chat learning state.

Before implementing adaptive escalation, define a minimal runtime state model:

```text
currentConcept
supportLevel: prompt | hint | partialModel | microExample | explanation
lastTargetStep
consecutiveImpasses
studentEvidence: attempted | identified | explained | applied
```

This state should be reset or faded only by observable evidence, such as a correct explanation or application. It should not be conflated with the persistent struggle-topic list, whose purpose is long-term support routing.

## Evaluation plan

Do not evaluate success by whether the model follows a punctuation rule. Evaluate with representative conversation fixtures:

1. **Productive attempt:** student makes a nearly correct claim; tutor identifies the precise gap and asks for a correction.
2. **First impasse:** student says “I don’t know”; tutor reduces the task without supplying the final answer.
3. **Repeated impasse:** student remains blocked; tutor supplies a partial representation or micro-example and asks for an analogous completion.
4. **Post-scaffold transfer:** student uses the principle on a new value or case.
5. **Mathematical notation:** display math is used as a readable partial scaffold, not a full answer.
6. **Off-list topic:** the tutor uses adaptive guided tutoring without accidentally treating the student's wording as a stored struggle label.

For each fixture, judge:

- Did the student have a meaningful next contribution?
- Did the tutor reveal only the blocking step, rather than the full procedure?
- Did support increase after impasse and fade after demonstrated understanding?
- Could the student plausibly explain or apply the idea without copying the tutor?
- Did the interaction remain respectful rather than becoming an interrogation?

## Recommended next decision

Approve the pedagogical invariant and escalation policy first:

1. **Allow mathematical formatting and partial representations.**
2. **Use contingent support, not permanent answer withholding.**
3. **Require student explanation or transfer after support.**

Then design the smallest runtime state needed to make escalation consistent. Do not make another prompt-only tightening pass until that decision is made; the existing punctuation, list, and display-math rules demonstrate why format constraints are a poor substitute for evidence-based tutoring state.

## Sources

1. Wood, D., Bruner, J. S., & Ross, G. (1976). *The Role of Tutoring in Problem Solving*. [PDF](https://sachafund.wordpress.com/wp-content/uploads/2018/10/wood_et_al-1976-journal_of_child_psychology_and_psychiatry.pdf).
2. Albacete, P., et al. (2018). *Providing Proactive Scaffolding During Tutorial Dialogue*. [PDF](https://www.cs.cmu.edu/~bmclaren/pubs/AlbaceteEtAl-ProvidingProactiveScaffoldingDuringTutorialDialogue-AIED2018.pdf).
3. Salden, R. J. C. M., Aleven, V., Renkl, A., & Schwonke, R. (2008). *Worked Examples and Tutored Problem Solving: Redundant or Synergistic Forms of Support?* [DOI](https://doi.org/10.1111/j.1756-8765.2008.01011.x).
4. VanLehn, K. (2011). *The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems, and Other Tutoring Systems*. [DOI](https://www.tandfonline.com/doi/abs/10.1080/00461520.2011.611369).
5. “When Generative AI Meets Socratic Method: Investigating Programming Learning Dynamics Through Behaviours, Interaction Qualities and Perceptions.” [DOI](https://doi.org/10.1002/jcal.70210).
