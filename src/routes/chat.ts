// src/routes/chat.ts
import express, { Request, Response } from 'express';
const router = express.Router();

// Five distinct engineering responses that pair with Mermaid artefacts
const predefinedResponses = [
  {
    reply:
      'Ammonia Synthesis (Haber-Bosch) process flow. The artefact outlines key units: feed prep, compressor, reactor loop with recycle and purge, and refrigeration for NH3 condensation.',
    artefact: {
      type: 'mermaid',
      source: `flowchart LR\n  A[Air] -->|N2| B(Compressor)\n  G[Natural Gas] --> H[Reformer]\n  H --> I[Shift/CO2 Removal]\n  I -->|H2| B\n  B --> C[Reactor Loop]\n  C --> D[Cool/Separate NH3]\n  D -->|NH3| E((Product))\n  D --> F{Recycle/Purge}\n  F -- Recycle --> C\n  F -- Purge --> W[Inerts Vent]`
    }
  },
  {
    reply:
      'Binary Distillation column with McCabe-Thiele steps. The artefact shows equilibrium curve, operating lines, and theoretical stages for separation.',
    artefact: {
      type: 'mermaid',
      source: `flowchart TD\n  A[Feed zF] --> B{q-line}\n  B --> C[Rectifying Line]\n  C --> D[Stages...]\n  D --> E[Stripping Line]\n  C -.->|xD| X[(Distillate)]\n  E -.->|xB| Y[(Bottoms)]\n  %% Schematic block, not to scale`
    }
  },
  {
    reply:
      'Polymerization Kinetics: sequence of initiation, propagation, and termination. The sequence diagram tracks radical species interactions.',
    artefact: {
      type: 'mermaid',
      source: `sequenceDiagram\n  participant I as Initiator\n  participant M as Monomer\n  participant R as Radical Chain\n  I->>R: Initiation (R*)\n  R->>M: Propagation (add M)\n  loop Chain Growth\n    R->>M: R* + M -> R*\n  end\n  R-->>R: Termination (combination/disproportionation)`
    }
  },
  {
    reply:
      'Corrosion Passivation model: state transitions between Active, Passive, and Transpassive regimes under varying potential.',
    artefact: {
      type: 'mermaid',
      source: `stateDiagram-v2\n  [*] --> Active\n  Active --> Passive: Film forms\n  Passive --> Transpassive: Film breakdown\n  Transpassive --> Active: Repassivation\n  Passive --> [*]`
    }
  },
  {
    reply:
      'Battery Electrode Materials: simplified ER-style relation between Cathode, Anode, and Electrolyte components for materials selection.',
    artefact: {
      type: 'mermaid',
      source: `erDiagram\n  CATHODE ||--o{ MATERIAL : uses\n  ANODE   ||--o{ MATERIAL : uses\n  ELECTROLYTE ||--o{ SOLVENT : contains\n  MATERIAL {\n    string name\n    float capacity\n  }\n  SOLVENT {\n    string name\n    float dielectric\n  }`
    }
  }
];

router.post('/message', (req: any, res: any) => {
    const userMessage = req.body.message;
    console.log('Received message:', userMessage);

    // Select a random response with artefact
    const randomIndex = Math.floor(Math.random() * predefinedResponses.length);
    const picked = predefinedResponses[randomIndex];

    // Simulate a short delay
    setTimeout(() => {
        res.json({ reply: picked.reply, timestamp: Date.now(), artefact: picked.artefact });
    }, 500);
});

export default router;
