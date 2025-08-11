// src/routes/chat.ts
import express, { Request, Response } from 'express';
const router = express.Router();

const longResponse1 = (
    "Great question. Let’s walk through this carefully and model a structured way to think about it. First, restate the problem in your own words and identify the knowns, unknowns, and any constraints that might limit feasible solutions. This clarifies the scope and ensures we are solving the right problem, not a symptom. Next, list relevant principles or governing equations from your course materials. For engineering analysis, this might include conservation laws, constitutive relationships, or empirical correlations. If terminology is fuzzy, define terms explicitly so you avoid mixing concepts (for instance, distinguishing assumptions from boundary conditions). Now sketch a quick diagram—even a mental one—labeling inputs, outputs, reference frames, and interfaces. Visual structure reveals hidden assumptions and often suggests checks on dimensional consistency. From there, propose a hypothesis for how the system behaves, and translate that hypothesis into a small set of equations. Keep the model minimal at first: too many parameters can obscure insight. Compute, then sanity-check: do units balance, are magnitudes plausible, and do trends align with intuition and physical limits? If results look off, iterate by revisiting assumptions—ask which one, if relaxed, would most change the outcome. Document each iteration so your reasoning trail is explicit and reproducible. Finally, synthesize what the numbers mean: translate quantitative results into qualitative guidance, state limitations, and outline next steps (e.g., refine parameters, validate experimentally, or compare against a benchmark case). This disciplined loop—clarify, model, compute, validate, reflect—builds both accuracy and confidence. Even if you don’t land on a final answer immediately, you will surface the most impactful uncertainties and turn a vague question into a concrete plan of action."
);

const longResponse2 = (
    "To build intuition, anchor the concept to energy and information flows. Imagine the system as a set of reservoirs and resistances: inputs accumulate or dissipate depending on paths and losses. In thermodynamics, for instance, view each control volume through conservation lenses—mass, momentum, and energy—and then layer on the second law to constrain directionality and efficiency. Ask: where is energy stored, where is it transported, and where is it degraded into less useful forms? Map these pathways using simple block diagrams before adding algebraic detail. Next, consider characteristic scales: which timescales dominate the dynamics, and which length scales define gradients? Scale analysis often reveals which terms in an equation can be neglected, simplifying the model without sacrificing fidelity. Don’t forget uncertainty: identify the parameters you know poorly and test sensitivity by nudging them up and down to see how outcomes shift. If results are hypersensitive, you’ve pinpointed leverage points where better data will dramatically improve confidence. With a simplified, scale-aware model in hand, compute a baseline scenario and then run a few contrasting cases to learn trend directions—what happens if input doubles, a constraint tightens, or a loss mechanism is removed? Finally, translate your findings into practical guidance: specify operating ranges, safety margins, and trade-offs. Note not just what the math says, but why it behaves that way—tie outcomes back to first principles. This habit of linking structure, scales, uncertainty, and trends transforms abstract formulas into reliable engineering judgment."
);

const longResponse3 = (
    "Here’s a study workflow you can use to master problems like this in about thirty focused minutes. Minute 0–5: prime your memory by summarizing what the problem is asking without peeking at notes; write down the key givens, the target quantity, and any constraints. Minute 5–10: retrieve relevant frameworks from memory (laws, patterns, or canonical examples) and sketch a quick representation—a free-body diagram, process flow, or control volume. Minute 10–15: outline a minimal solution path in bullets, naming each step and what evidence validates it. Commit to the simplest plausible model first; resist the urge to overcomplicate. Minute 15–20: execute the plan, checking units and orders of magnitude as you go; if you get stuck, isolate the smallest missing piece and look it up deliberately rather than scanning everything. Minute 20–25: audit your result. Ask: does this scale with inputs the way I expect? What’s the limiting case? Where would this break in the real world? If any check fails, revise a single assumption and recompute. Minute 25–30: reflect and generalize. Capture the three most transferable insights (e.g., a pattern, a pitfall, and a check) in a short note. That reflection cementing loop compounds over time: every problem becomes a template that speeds up the next one. By practicing this deliberate cycle—summarize, retrieve, sketch, plan, execute, audit, reflect—you build both speed and depth, and your solutions become clearer, more reliable, and easier to communicate."
);

const predefinedResponses = [longResponse1, longResponse2, longResponse3];

router.post('/message', (req: any, res: any) => {
    const userMessage = req.body.message;
    console.log('Received message:', userMessage);

    // Select a random response
    const randomIndex = Math.floor(Math.random() * predefinedResponses.length);
    const reply = predefinedResponses[randomIndex];

    // Simulate a short delay
    setTimeout(() => {
        res.json({ reply, timestamp: Date.now() });
    }, 500);
});

export default router;
