// src/routes/chat.ts
import express, { Request, Response } from 'express';
const router = express.Router();

const predefinedResponses = [
    "That's a great question! Let's break it down...",
    "Interesting point. From an engineering perspective, you should consider...",
    "Could you elaborate on that? I'm not sure I understand the context.",
    "I believe the answer can be found in your course notes from Week 3, under 'Thermodynamics'.",
    "Let me think... Yes, the formula you're looking for is F = ma.",
    "I'm sorry, I don't have enough information on that specific topic.",
    "Have you considered the ethical implications of that solution?"
];

router.post('/message', (req: any, res: any) => {
    const userMessage = req.body.message;
    console.log('Received message:', userMessage);

    // Select a random response
    const randomIndex = Math.floor(Math.random() * predefinedResponses.length);
    const reply = predefinedResponses[randomIndex];

    // Simulate a short delay
    setTimeout(() => {
        res.json({ reply });
    }, 500);
});

export default router;
