// src/routes/chat.ts
import express, { Request, Response } from 'express';
const router = express.Router();

// Enhanced engineering responses with realistic content and detailed Mermaid diagrams
const predefinedResponses = [
  // Welcome message
  {
    keywords: ['hi', 'hello', 'hey', 'start', 'welcome'],
    reply: "Hello! Welcome to EngE-AI, your intelligent learning companion for Chemical and Materials Engineering! 🎓 I'm here to help you understand complex engineering concepts, solve problems, and visualize processes through interactive diagrams. Whether you're working on thermodynamics, heat transfer, materials science, reaction engineering, or process design, I'm ready to guide you through your learning journey. What would you like to explore today?",
    artefact: null
  },

  // Thermodynamics responses
  {
    keywords: ['thermodynamics', 'first law', 'energy balance', 'enthalpy', 'entropy'],
    reply: "Thermodynamics is fundamental to chemical engineering! Let me explain the key concepts and show you a process diagram. The First Law of Thermodynamics states that energy cannot be created or destroyed, only converted from one form to another. For any system, ΔU = Q - W, where ΔU is internal energy change, Q is heat added, and W is work done by the system. In chemical processes, we often work with enthalpy (H = U + PV) for constant pressure processes. The diagram shows a typical thermodynamic cycle with state changes.",
    artefact: {
      type: 'mermaid',
      source: `graph TB
  A[State 1: T₁, P₁, H₁] -->|"Heat Addition<br/>Q₁₂ = m·Cp·ΔT"| B[State 2: T₂, P₁, H₂]
  B -->|"Adiabatic Expansion<br/>PV^γ = constant"| C[State 3: T₃, P₂, H₃]
  C -->|"Heat Rejection<br/>Q₃₄ = m·Cp·ΔT"| D[State 4: T₄, P₂, H₄]
  D -->|"Adiabatic Compression<br/>Work Input W"| A
  
  subgraph "Energy Balance"
    E["ΔU = Q - W<br/>H = U + PV<br/>dS ≥ dQ/T"]
  end
  
  subgraph "Process Parameters"
    F["γ = Cp/Cv<br/>Cp - Cv = R<br/>η = W_net/Q_in"]
  end`
    }
  },

  {
    keywords: ['gibbs', 'free energy', 'chemical potential', 'equilibrium'],
    reply: "Gibbs Free Energy (G = H - TS) is crucial for determining spontaneity and equilibrium in chemical processes! When ΔG < 0, a process is spontaneous. At equilibrium, ΔG = 0. For chemical reactions, we use ΔG = ΔG° + RT ln(Q), where Q is the reaction quotient. The diagram shows how Gibbs energy changes affect phase equilibrium and reaction spontaneity.",
    artefact: {
      type: 'mermaid',
      source: `graph TD
  A["Reactants<br/>G₁"] -->|"ΔG = ΔH - TΔS"| B{{"ΔG < 0?<br/>Spontaneous?"}}
  B -->|"Yes, ΔG < 0"| C["Products<br/>G₂ < G₁"]
  B -->|"No, ΔG > 0"| D["Non-spontaneous<br/>Requires Energy Input"]
  B -->|"ΔG = 0"| E["Equilibrium<br/>Keq = exp(-ΔG°/RT)"]
  
  subgraph "Phase Equilibrium"
    F["Gas ⇌ Liquid<br/>μᵍ = μˡ"] 
    G["Liquid ⇌ Solid<br/>ΔG_fusion = 0"]
  end
  
  subgraph "Temperature Effects"
    H["High T: -TΔS dominates<br/>Low T: ΔH dominates"]
  end
  
  E --> F
  C --> I["ΔG° = -RT ln(Keq)<br/>Large Keq = Favorable"]`
    }
  },

  {
    keywords: ['heat transfer', 'conduction', 'convection', 'radiation', 'fourier'],
    reply: "Heat transfer occurs through three mechanisms: conduction (Fourier's Law: q = -kA∇T), convection (Newton's Law: q = hAΔT), and radiation (Stefan-Boltzmann: q = εσAT⁴). In process equipment, we design for optimal heat transfer while considering pressure drop and fouling. The overall heat transfer coefficient (U) combines all resistances in series.",
    artefact: {
      type: 'mermaid',
      source: `graph LR
  A["Hot Fluid<br/>T_h = 150°C"] --> B["Tube Wall"]
  B --> C["Cold Fluid<br/>T_c = 50°C"]
  
  subgraph "Heat Transfer Mechanisms"
    D["Conduction<br/>q = -kA(dT/dx)<br/>Fourier's Law"]
    E["Convection<br/>q = hAΔT<br/>Newton's Law"]
    F["Radiation<br/>q = εσA(T₁⁴-T₂⁴)<br/>Stefan-Boltzmann"]
  end
  
  subgraph "Thermal Resistances"
    G["1/U = 1/h₁ + δ/k + 1/h₂<br/>+ Rf1 + Rf2"]
    H["Rf = Fouling Resistance"]
  end
  
  subgraph "Dimensionless Numbers"
    I["Nu = hL/k (Nusselt)<br/>Re = ρvL/μ (Reynolds)<br/>Pr = Cpμ/k (Prandtl)"]
  end`
    }
  },

  // Materials Science responses
  {
    keywords: ['crystal structure', 'crystallography', 'unit cell', 'lattice', 'bravais'],
    reply: "Crystal structures define how atoms arrange in crystalline materials! There are 7 crystal systems and 14 Bravais lattices. The unit cell is the smallest repeating unit that describes the entire crystal. Key parameters include lattice constants (a, b, c) and angles (α, β, γ). Understanding crystal structure helps predict material properties like strength, conductivity, and optical behavior.",
    artefact: {
      type: 'mermaid',
      source: `graph TB
  A["Crystal Structure"] --> B["7 Crystal Systems"]
  A --> C["14 Bravais Lattices"]
  A --> D["Unit Cell Parameters"]
  
  B --> E["Cubic<br/>a=b=c, α=β=γ=90°"]
  B --> F["Tetragonal<br/>a=b≠c, α=β=γ=90°"]
  B --> G["Orthorhombic<br/>a≠b≠c, α=β=γ=90°"]
  B --> H["Hexagonal<br/>a=b≠c, α=β=90°, γ=120°"]
  
  C --> I["Simple Cubic<br/>Coordination: 6"]
  C --> J["Body-Centered Cubic<br/>Coordination: 8"]
  C --> K["Face-Centered Cubic<br/>Coordination: 12"]
  
  D --> L["Lattice Constants<br/>a, b, c"]
  D --> M["Angles<br/>α, β, γ"]
  D --> N["Atomic Positions<br/>(x,y,z) coordinates"]
  
  subgraph "Common Structures"
    O["NaCl: Cubic<br/>Diamond: Cubic<br/>Graphite: Hexagonal"]
  end`
    }
  },

  {
    keywords: ['phase diagram', 'phase equilibrium', 'lever rule', 'eutectic', 'solidification'],
    reply: "Phase diagrams show equilibrium relationships between phases at different temperatures and compositions! The lever rule helps determine phase fractions: fraction of phase α = (C₀ - Cβ)/(Cα - Cβ). Eutectic points represent the lowest melting temperature for a given composition. Understanding phase diagrams is crucial for alloy design and processing.",
    artefact: {
      type: 'mermaid',
      source: `graph TD
  A["Temperature"] --> B["Liquidus Line"]
  A --> C["Solidus Line"]
  A --> D["Eutectic Point"]
  
  subgraph "Phase Regions"
    E["Liquid (L)<br/>Single Phase"]
    F["L + α<br/>Two Phase"]
    G["α + β<br/>Two Phase"]
    H["Pure α<br/>Single Phase"]
  end
  
  subgraph "Lever Rule Application"
    I["Fraction α = (C₀ - Cβ)/(Cα - Cβ)"]
    J["Fraction β = (Cα - C₀)/(Cα - Cβ)"]
  end
  
  B --> E
  C --> F
  D --> K["Lowest Melting Point<br/>T_eutectic"]
  
  subgraph "Cooling Process"
    L["Liquid"] --> M["L + Primary α"]
    M --> N["α + β Eutectic"]
    N --> O["Final Microstructure"]
  end`
    }
  },

  // Heat Exchanger Design
  {
    keywords: ['heat exchanger', 'shell tube', 'LMTD', 'effectiveness', 'NTU'],
    reply: "Shell-and-tube heat exchangers are workhorses in chemical plants! Design involves calculating heat duty (Q = mcpΔT), selecting appropriate flow configuration, and determining size using LMTD or ε-NTU method. Key design parameters include tube diameter, length, pitch, baffle spacing, and number of passes. TEMA standards provide design guidelines for industrial applications.",
    artefact: {
      type: 'mermaid',
      source: `graph LR
  A["Hot Fluid In<br/>T₁ = 120°C<br/>ṁ = 10 kg/s"] --> B["Shell Side"]
  B --> C["Hot Fluid Out<br/>T₂ = 80°C"]
  
  D["Cold Fluid In<br/>t₁ = 20°C<br/>ṁ = 8 kg/s"] --> E["Tube Side"]
  E --> F["Cold Fluid Out<br/>t₂ = 60°C"]
  
  subgraph "Heat Transfer Design"
    G["Q = UAΔTlm<br/>Q = ṁcp(T₁-T₂)"]
    H["LMTD = (ΔT₁-ΔT₂)/ln(ΔT₁/ΔT₂)"]
    I["ε = Q/(Qmax)<br/>NTU = UA/(ṁcp)min"]
  end
  
  subgraph "Physical Design"
    J["Tube Dia: 3/4 inch<br/>Length: 16 ft<br/>Triangular Pitch"]
    K["Baffle Spacing<br/>Shell Diameter<br/>Tube Passes"]
  end
  
  subgraph "TEMA Types"
    L["Front Head: A,B,C<br/>Shell: E,F,G,H<br/>Rear Head: L,M,N"]
  end
  
  B -.-> E
  E -.-> B`
    }
  },

  // Reaction Engineering
  {
    keywords: ['reactor design', 'CSTR', 'PFR', 'reaction kinetics', 'arrhenius'],
    reply: "Reactor design combines reaction kinetics with mass and energy balances! For a CSTR: V/Q = Cao·X/(rA), while for PFR: V/Q = ∫(dX/rA). The Arrhenius equation (k = Ae^(-E/RT)) describes temperature dependence of reaction rates. Selectivity and yield optimization requires understanding reaction networks and residence time distributions.",
    artefact: {
      type: 'mermaid',
      source: `graph TD
  A["Feed<br/>CAo, T₀, Q"] --> B{{"Reactor Type?"}}
  
  B -->|"Well Mixed"| C["CSTR<br/>V/Q = CAo·X/(-rA)"]
  B -->|"Plug Flow"| D["PFR<br/>V/Q = ∫dX/(-rA)"]
  B -->|"Batch"| E["Batch<br/>t = CAo∫dX/(-rA)"]
  
  subgraph "Kinetics"
    F["Rate Law: -rA = kCA^n"]
    G["Arrhenius: k = Ae^(-E/RT)"]
    H["Selectivity: S = rB/rC"]
  end
  
  subgraph "Design Equations"
    I["Conversion: X = (CAo-CA)/CAo"]
    J["Yield: Y = FB/FAo"]
    K["Space Time: τ = V/Q"]
  end
  
  C --> L["Product<br/>CA, T, Q"]
  D --> L
  E --> L
  
  subgraph "Multiple Reactions"
    M["Series: A→B→C<br/>Parallel: A→B, A→C"]
  end`
    }
  },

  // Separation Processes
  {
    keywords: ['distillation', 'mccabe thiele', 'separation', 'raoult', 'activity'],
    reply: "Distillation separates components based on vapor-liquid equilibrium! The McCabe-Thiele method graphically determines theoretical stages using equilibrium curve and operating lines. Raoult's Law (yi = xiPi°/P) applies to ideal systems, while real systems require activity coefficients. Column design involves material balance, energy balance, and hydraulic considerations.",
    artefact: {
      type: 'mermaid',
      source: `graph TB
  A["Feed<br/>F, zF, TF"] --> B["Distillation Column"]
  B --> C["Distillate<br/>D, xD"]
  B --> D["Bottoms<br/>B, xB"]
  
  subgraph "McCabe-Thiele"
    E["Equilibrium Curve<br/>y = f(x)"]
    F["Rectifying Line<br/>y = (R/(R+1))x + xD/(R+1)"]
    G["Stripping Line<br/>y = (L'/V')x - BxB/V'"]
    H["q-line<br/>Slope = q/(q-1)"]
  end
  
  subgraph "VLE Relations"
    I["Raoult's Law<br/>yi = xi·Pi°/P"]
    J["Activity Coefficient<br/>yi = γi·xi·Pi°/P"]
    K["Relative Volatility<br/>α = (y/x)A/(y/x)B"]
  end
  
  subgraph "Column Design"
    L["Material Balance<br/>F = D + B"]
    M["Number of Stages<br/>Efficiency<br/>Diameter"]
    N["Reflux Ratio<br/>R = L/D"]
  end
  
  E --> H
  F --> H
  G --> H`
    }
  },

  // Process Control
  {
    keywords: ['control', 'PID', 'feedback', 'process control', 'dynamics'],
    reply: "Process control maintains desired operating conditions despite disturbances! PID controllers use proportional (Kc), integral (τI), and derivative (τD) actions. The transfer function relates output to input: G(s) = Y(s)/X(s). Stability analysis uses Bode plots and Root Locus. Modern control includes feedforward, cascade, and model predictive control strategies.",
    artefact: {
      type: 'mermaid',
      source: `graph LR
  A["Setpoint<br/>SP"] --> B["Controller<br/>PID"]
  B --> C["Valve<br/>Actuator"]
  C --> D["Process<br/>G(s)"]
  D --> E["Measured Variable<br/>PV"]
  E --> F["Transmitter<br/>H(s)"]
  F --> G["Error<br/>e = SP - PV"]
  G --> B
  
  subgraph "PID Controller"
    H["Proportional: Kc·e"]
    I["Integral: (Kc/τI)∫e dt"]
    J["Derivative: Kc·τD·de/dt"]
    K["Output: u = Kc(e + 1/τI∫e dt + τD·de/dt)"]
  end
  
  subgraph "Process Dynamics"
    L["First Order: τ·dy/dt + y = Kp·u"]
    M["Second Order + Dead Time"]
    N["Transfer Function: G(s)"]
  end
  
  subgraph "Tuning Methods"
    O["Ziegler-Nichols<br/>Cohen-Coon<br/>IMC"]
  end
  
  D --> P["Disturbance<br/>Load Changes"]`
    }
  },

  // Mass Transfer
  {
    keywords: ['mass transfer', 'diffusion', 'absorption', 'adsorption', 'fick'],
    reply: "Mass transfer describes the movement of chemical species! Fick's First Law (J = -D∇C) relates flux to concentration gradient. In equipment design, we use mass transfer coefficients: NA = kL·a·(C*-C). Common applications include absorption, stripping, extraction, and adsorption. The analogy between heat, mass, and momentum transfer helps in correlations.",
    artefact: {
      type: 'mermaid',
      source: `graph TD
  A["Gas Phase<br/>yA, Gas Film"] --> B["Interface<br/>Equilibrium"]
  B --> C["Liquid Phase<br/>xA, Liquid Film"]
  
  subgraph "Fick's Laws"
    D["First Law: J = -D(dC/dx)"]
    E["Second Law: ∂C/∂t = D(∂²C/∂x²)"]
  end
  
  subgraph "Two-Film Theory"
    F["Gas Film: NA = kG(yA - yAi)"]
    G["Liquid Film: NA = kL(xAi - xA)"]
    H["Overall: NA = KG(yA - y*A)"]
  end
  
  subgraph "Equipment"
    I["Packed Column<br/>HTU, NTU"]
    J["Tray Column<br/>Murphree Efficiency"]
    K["Membrane<br/>Permeability"]
  end
  
  subgraph "Dimensionless Groups"
    L["Sherwood: Sh = kL/D"]
    M["Schmidt: Sc = μ/(ρD)"]
    N["Peclet: Pe = vL/D"]
  end
  
  A -.-> B
  B -.-> C`
    }
  },

  // Polymer Science
  {
    keywords: ['polymer', 'polymerization', 'molecular weight', 'tacticity', 'crystallinity'],
    reply: "Polymers are large molecules formed by repeating monomer units! Polymerization mechanisms include addition (chain growth) and condensation (step growth). Key properties depend on molecular weight distribution, tacticity (stereochemistry), and crystallinity. Processing conditions affect final polymer structure and properties through temperature, pressure, and cooling rate control.",
    artefact: {
      type: 'mermaid',
      source: `stateDiagram-v2
  [*] --> Initiation
  
  state "Chain Growth" as growth {
    Initiation --> Propagation: R* + M
    Propagation --> Propagation: Growing Chain
    Propagation --> Termination: Various Mechanisms
  }
  
  Termination --> [*]
  
  state "Molecular Weight" as mw {
    [*] --> NumberAverage: Mn
    [*] --> WeightAverage: Mw
    NumberAverage --> PDI: Mw/Mn
    WeightAverage --> PDI
  }
  
  state "Structure" as struct {
    [*] --> Tacticity
    [*] --> Crystallinity
    Tacticity --> Isotactic
    Tacticity --> Syndiotactic
    Tacticity --> Atactic
    Crystallinity --> Semicrystalline
    Crystallinity --> Amorphous
  }
  
  note right of growth
    Rate Laws:
    Rp = kp[M][R*]
    Rt = kt[R*]²
  end note
  
  note left of struct
    Properties depend on:
    - Chain length
    - Branching
    - Cross-linking
  end note`
    }
  },

  // Fluid Mechanics
  {
    keywords: ['fluid mechanics', 'reynolds', 'pressure drop', 'pump', 'bernoulli'],
    reply: "Fluid mechanics governs flow in pipes, pumps, and process equipment! The Reynolds number (Re = ρVD/μ) determines flow regime: laminar (Re < 2100) or turbulent (Re > 4000). Bernoulli's equation relates pressure, velocity, and elevation. For pipe flow, the Darcy-Weisbach equation calculates pressure drop: ΔP = f(L/D)(ρV²/2).",
    artefact: {
      type: 'mermaid',
      source: `graph LR
  A["Reservoir<br/>P₁, z₁, V₁≈0"] --> B["Pipe<br/>L, D, ε/D"]
  B --> C["Exit<br/>P₂, z₂, V₂"]
  
  subgraph "Bernoulli Equation"
    D["P₁/ρ + V₁²/2 + gz₁ = P₂/ρ + V₂²/2 + gz₂ + hf"]
  end
  
  subgraph "Pressure Drop"
    E["Major Loss: hf = f(L/D)(V²/2g)"]
    F["Minor Loss: hm = K(V²/2g)"]
    G["Friction Factor: f = f(Re, ε/D)"]
  end
  
  subgraph "Flow Regimes"
    H["Laminar: Re < 2100<br/>f = 64/Re"]
    I["Transition: 2100 < Re < 4000"]
    J["Turbulent: Re > 4000<br/>Colebrook Equation"]
  end
  
  subgraph "Pump System"
    K["NPSH Available > NPSH Required"]
    L["System Curve vs Pump Curve"]
    M["Efficiency = (ρgQH)/Power"]
  end
  
  A --> D
  B --> E
  C --> F`
    }
  },

  // Error handling for unrecognized queries
  {
    keywords: ['default'],
    reply: "I apologize, but I don't quite understand your question. 🤔 Could you please rephrase it or be more specific about what you'd like to learn? I'm here to help with Chemical Engineering and Materials Science topics including:\n\n• Thermodynamics and Energy Balances\n• Heat and Mass Transfer\n• Reaction Engineering and Kinetics\n• Separation Processes (Distillation, Absorption)\n• Materials Science and Crystal Structures\n• Process Control and Dynamics\n• Fluid Mechanics and Transport Phenomena\n\nFeel free to ask about any of these topics, and I'll do my best to explain with clear examples and diagrams! 😊",
    artefact: null
  }
];

// Function to find the best matching response
function findBestResponse(userMessage: string) {
  const message = userMessage.toLowerCase();
  
  // Check for exact keyword matches first
  for (const response of predefinedResponses) {
    if (response.keywords.some(keyword => message.includes(keyword))) {
      return response;
    }
  }
  
  // If no match found, return default response
  return predefinedResponses[predefinedResponses.length - 1];
}

// Enhanced chat endpoint with realistic processing
router.post('/message', (req: any, res: any) => {
    try {
        const userMessage = req.body.message;
        console.log('Received message:', userMessage);

        // Validate input
        if (!userMessage || typeof userMessage !== 'string') {
            return res.status(400).json({ 
                error: 'Invalid message format',
                timestamp: Date.now() 
            });
        }

        // Find appropriate response based on message content
        const selectedResponse = findBestResponse(userMessage);

        // Simulate realistic processing time (0.5-2 seconds)
        const processingTime = Math.random() * 1500 + 500;

        setTimeout(() => {
            const response = {
                reply: selectedResponse.reply,
                timestamp: Date.now(),
                artefact: selectedResponse.artefact,
                messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                processingTime: Math.round(processingTime)
            };

            res.json(response);
        }, processingTime);

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({
            error: 'Internal server error',
            reply: "I'm sorry, but I encountered an error while processing your request. Please try again, and if the problem persists, please report it to your instructor.",
            timestamp: Date.now()
        });
    }
});

// Health check endpoint
router.get('/health', (req: any, res: any) => {
    res.json({
        status: 'healthy',
        service: 'EngE-AI Chat Service',
        version: '2.0.0',
        timestamp: Date.now()
    });
});

// Get available topics endpoint
router.get('/topics', (req: any, res: any) => {
    const topics = [
        {
            category: "Thermodynamics",
            subtopics: ["First & Second Laws", "Gibbs Free Energy", "Phase Equilibrium", "Chemical Potential"]
        },
        {
            category: "Heat Transfer", 
            subtopics: ["Conduction", "Convection", "Radiation", "Heat Exchangers"]
        },
        {
            category: "Materials Science",
            subtopics: ["Crystal Structures", "Phase Diagrams", "Mechanical Properties", "Electronic Properties"]
        },
        {
            category: "Reaction Engineering",
            subtopics: ["Reaction Kinetics", "Reactor Design", "Catalysis", "Selectivity & Yield"]
        },
        {
            category: "Separation Processes",
            subtopics: ["Distillation", "Absorption", "Extraction", "Membrane Separations"]
        },
        {
            category: "Process Control",
            subtopics: ["PID Controllers", "Process Dynamics", "Stability Analysis", "Advanced Control"]
        }
    ];
    
    res.json({
        topics,
        totalCategories: topics.length,
        timestamp: Date.now()
    });
});

export default router;