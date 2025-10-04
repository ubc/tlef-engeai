/**
 * ===========================================
 * ========= DEMO MODE - HARDCODED RESPONSES =
 * ===========================================
 *
 * This module provides Express.js routes for the EngE-AI platform in DEMO MODE.
 * All LLM, RAG, and database functionality has been removed.
 *
 * Key Features:
 * - Hardcoded responses for 5 chemical engineering questions
 * - In-memory chat management (no persistence)
 * - Support for chat history tracking
 *
 * API Endpoints:
 * - POST /chat/newchat - Create new chat
 * - POST /chat/:chatId - Send message and get hardcoded response
 * - GET /chat/:chatId/history - Get chat history
 * - DELETE /chat/:chatId - Delete chat
 * - GET /test - Test endpoint for API validation
 *
 * @author: EngE-AI Team
 * @version: 3.0.0 (DEMO MODE)
 * @since: 2025-01-27
 *
 */

import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { ConsoleLogger, LoggerInterface } from 'ubc-genai-toolkit-core';
import { AppConfig, loadConfig } from './config';
import { IDGenerator } from '../functions/unique-id-generator';
import { ChatMessage, Chat } from '../functions/types';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';

// Load environment variables
dotenv.config();

const router = express.Router();

/**
 * Interface for chat initialization request
 */
interface initChatRequest {
    userID: string;
    courseName: string;
    date: Date;
    chatId: string;
    initAssistantMessage: ChatMessage;
    chatTitle: string;
}

const appConfig = loadConfig();


class ChatApp {
    private logger: LoggerInterface;
    private debug: boolean;
    private chatHistory : Map<string, ChatMessage[]>; // it maps chatId to chat history
    private chatID : string[];
    private chatIDGenerator: IDGenerator;
    private demoMode: boolean = true; // DEMO MODE ENABLED
    private demoQuestionIndex: Map<string, number> = new Map(); // Track which question to answer next per chat

    constructor(config: AppConfig) {
        this.logger = config.logger;
        this.debug = config.debug;
        this.chatHistory = new Map();
        this.chatID = [];
        this.chatIDGenerator = IDGenerator.getInstance();

        console.log('🎭 DEMO MODE ACTIVATED - All responses are hardcoded');
    }

    /**
     * DEMO MODE: Hardcoded chemical engineering questions and answers with keyword mapping
     */
    private getDemoResponse(userMessage: string, chatId: string): string {
        // Convert user message to lowercase for case-insensitive matching
        const message = userMessage.toLowerCase();

        // Define keyword mappings for each topic - STUDENT-LIKE QUESTIONS
        const keywordMappings = {
            // Material and Energy Balances
            material: ['how do i solve material balance problems'],
            
            // Reactor Design and Kinetics
            reactor: ['what is the difference between batch cstr and pfr reactors'],
            
            // Mass Transfer Operations
            massTransfer: ['can you explain ficks law with examples'],
            
            // Heat Transfer and Heat Exchangers
            heatTransfer: ['how do i calculate heat exchanger area using lmtd'],
            
            // Distillation and Separation Processes
            distillation: ['how do i use mccabe thiele method to find number of stages']
        };

        // Hardcoded chemical engineering questions with artefacts
        const demoResponses = {
            material: `Excellent question! Material and energy balances are the cornerstone of chemical engineering - they ensure conservation of mass and energy in all processes.

<Artefact>
graph TD
    A[Material & Energy Balances] --> B[Material Balance]
    A --> C[Energy Balance]

    B --> D[Conservation of Mass]
    B --> E[Component Balance]
    B --> F[Overall Balance]

    C --> G[Conservation of Energy]
    C --> H[First Law of Thermodynamics]

    D --> I[Steady State: Accumulation = 0]
    D --> J[Unsteady State: Accumulation ≠ 0]

    G --> K[Enthalpy Balance]
    K --> L["Q - W = ΔH + ΔKE + ΔPE"]

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style I fill:#c8e6c9
</Artefact>

**Material Balance Fundamentals:**

The general material balance equation (conservation of mass):
$$\\text{Input} - \\text{Output} + \\text{Generation} - \\text{Consumption} = \\text{Accumulation}$$

For **steady-state processes** (no accumulation):
$$\\text{Input} + \\text{Generation} = \\text{Output} + \\text{Consumption}$$

For **unsteady-state processes**:
$$\\frac{dM}{dt} = \\sum \\dot{m}_{in} - \\sum \\dot{m}_{out} + \\sum \\dot{m}_{gen} - \\sum \\dot{m}_{cons}$$

**Energy Balance Fundamentals:**

General energy balance for a control volume:
$$\\dot{Q} - \\dot{W} = \\frac{dE}{dt} + \\sum \\dot{m}_{out}\\left(h + \\frac{v^2}{2} + gz\\right)_{out} - \\sum \\dot{m}_{in}\\left(h + \\frac{v^2}{2} + gz\\right)_{in}$$

For steady-state with negligible kinetic and potential energy changes:
$$\\dot{Q} - \\dot{W} = \\sum \\dot{m}_{out}h_{out} - \\sum \\dot{m}_{in}h_{in}$$

**Key Applications:**
- Process design and optimization
- Equipment sizing
- Process control and safety analysis
- Environmental impact assessment

These balances are essential for designing efficient, safe, and environmentally responsible chemical processes!`,

            reactor: `Excellent! Chemical reactor design is fundamental to converting raw materials into valuable products efficiently and safely.

<Artefact>
graph TD
    A[Chemical Reactors] --> B[Batch Reactor]
    A --> C[CSTR]
    A --> D[PFR]

    B --> E[Closed System]
    B --> F[Unsteady State]
    B --> G["V(dCA/dt) = rA·V"]

    C --> H[Open System]
    C --> I[Well-Mixed]
    C --> J["V = FA0·X/(-rA)"]

    D --> K[Open System]
    D --> L[No Back-Mixing]
    D --> M["V = FA0∫₀ˣ(dX/-rA)"]

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style D fill:#c8e6c9
</Artefact>

**Reactor Design Equations:**

**Batch Reactor (Closed System):**
$$\\frac{dC_A}{dt} = r_A$$
$$t = \\int_{C_{A0}}^{C_A} \\frac{dC_A}{-r_A}$$

**CSTR (Continuous Stirred Tank Reactor):**
$$V = \\frac{F_{A0} X}{-r_A}$$
$$\\tau = \\frac{V}{v_0} = \\frac{C_{A0} X}{-r_A}$$

**PFR (Plug Flow Reactor):**
$$V = F_{A0} \\int_0^X \\frac{dX}{-r_A}$$
$$\\frac{dX}{dV} = \\frac{-r_A}{F_{A0}}$$

**Key Design Parameters:**
- **Conversion (X)**: Fraction of reactant converted to products
- **Space Time (τ)**: V/v₀, residence time in reactor
- **Reaction Rate (rA)**: Rate of consumption of reactant A
- **Volumetric Flow Rate (v₀)**: Feed flow rate

**Reactor Selection Criteria:**
- **Batch**: Small-scale, flexible production, precise control
- **CSTR**: Large-scale continuous production, uniform conditions
- **PFR**: High conversion, minimal back-mixing, tubular geometry

**Design Considerations:**
- Reaction kinetics and mechanism
- Heat and mass transfer requirements
- Safety and environmental factors
- Economic optimization

Proper reactor design ensures optimal conversion, selectivity, and process efficiency!`,

            massTransfer: `Perfect! Mass transfer is fundamental to separation processes and is driven by concentration gradients between phases.

<Artefact>
graph LR
    A[Mass Transfer] --> B[Molecular Diffusion]
    A --> C[Convective Transfer]

    B --> D["Fick's First Law"]
    D --> E["JA = -DAB(dCA/dx)"]

    C --> F[Forced Convection]
    C --> G[Natural Convection]

    A --> H[Two-Film Theory]
    H --> I[Gas Film Resistance]
    H --> J[Liquid Film Resistance]

    I --> K["1/KG = 1/kg + m/kl"]
    J --> K

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style H fill:#fff3e0
    style K fill:#c8e6c9
</Artefact>

**Fundamental Mass Transfer Equations:**

**Fick's First Law (Molecular Diffusion):**
$$J_A = -D_{AB} \\frac{dC_A}{dx}$$

Where:
- $J_A$ = molar flux of component A (mol/m²·s)
- $D_{AB}$ = binary diffusion coefficient (m²/s)
- $dC_A/dx$ = concentration gradient

**Mass Transfer Rate with Convection:**
$$N_A = k_c(C_A - C_A^*)$$

Where:
- $N_A$ = mass transfer rate (mol/m²·s)
- $k_c$ = mass transfer coefficient (m/s)
- $C_A^*$ = equilibrium concentration

**Two-Film Theory (Gas-Liquid Systems):**

Overall mass transfer coefficient:
$$\\frac{1}{K_G} = \\frac{1}{k_g} + \\frac{m}{k_l}$$

Where:
- $K_G$ = overall gas-phase mass transfer coefficient
- $k_g$ = gas-film mass transfer coefficient
- $k_l$ = liquid-film mass transfer coefficient
- $m$ = Henry's law constant (slope of equilibrium line)

**Key Applications:**
- **Absorption**: Gas-liquid contact for solute removal
- **Stripping**: Liquid-gas contact for solute recovery
- **Distillation**: Vapor-liquid equilibrium separation
- **Extraction**: Liquid-liquid separation processes

**Design Considerations:**
- Interfacial area for mass transfer
- Contact time and residence time
- Driving force (concentration difference)
- Mass transfer coefficients and resistances

Understanding mass transfer is essential for designing efficient separation equipment!`,

            heatTransfer: `Excellent! Heat transfer is crucial for process heating, cooling, and energy recovery in chemical plants.

<Artefact>
graph TD
    A[Heat Transfer] --> B[Conduction]
    A --> C[Convection]
    A --> D[Radiation]

    B --> E["Fourier's Law"]
    E --> F["q = -kA(dT/dx)"]

    C --> G["Newton's Law of Cooling"]
    G --> H["q = hA(Ts - T∞)"]

    D --> I["Stefan-Boltzmann Law"]
    I --> J["q = σεA(T⁴ - T∞⁴)"]

    A --> K[Heat Exchangers]
    K --> L[Shell & Tube]
    K --> M[Plate Heat Exchanger]
    K --> N[Double Pipe]

    L --> O["Q = UA·LMTD"]

    style A fill:#e1f5fe
    style K fill:#f3e5f5
    style O fill:#fff3e0
</Artefact>

**Fundamental Heat Transfer Equations:**

**Conduction (Fourier's Law):**
$$q = -kA \\frac{dT}{dx}$$

**Convection (Newton's Law of Cooling):**
$$q = hA(T_s - T_\\infty)$$

**Radiation (Stefan-Boltzmann Law):**
$$q = \\sigma \\epsilon A(T_s^4 - T_\\infty^4)$$

**Heat Exchanger Design:**

**Overall Heat Transfer Rate:**
$$Q = UA \\cdot LMTD$$

**Log Mean Temperature Difference (LMTD):**
$$LMTD = \\frac{\\Delta T_1 - \\Delta T_2}{\\ln(\\Delta T_1 / \\Delta T_2)}$$

Where:
- $\\Delta T_1 = T_{h,in} - T_{c,out}$
- $\\Delta T_2 = T_{h,out} - T_{c,in}$

**Overall Heat Transfer Coefficient:**
$$\\frac{1}{U} = \\frac{1}{h_i} + \\frac{x}{k} + \\frac{1}{h_o} + R_{foul}$$

Where:
- $U$ = overall heat transfer coefficient (W/m²·K)
- $h_i, h_o$ = inside and outside convection coefficients
- $x/k$ = conduction resistance through wall
- $R_{foul}$ = fouling resistance

**Heat Exchanger Types:**
- **Shell & Tube**: High pressure, large heat loads
- **Plate**: Compact, high efficiency, easy cleaning
- **Double Pipe**: Simple, low cost, small applications

**Design Considerations:**
- Temperature approach and pinch point analysis
- Pressure drop limitations
- Fouling and maintenance requirements
- Material compatibility and corrosion

Efficient heat transfer design maximizes energy recovery and minimizes operating costs!`,

            distillation: `Excellent! Distillation is the most widely used separation method in chemical engineering, based on differences in vapor pressures.

<Artefact>
graph TD
    A[Distillation] --> B[Binary Distillation]
    A --> C[Multicomponent Distillation]

    B --> D[McCabe-Thiele Method]
    D --> E[Operating Lines]
    D --> F[Equilibrium Curve]

    E --> G["Rectifying: y = R/(R+1)x + xD/(R+1)"]
    E --> H["Stripping: y = Ls/Vs x - B·xB/Vs"]
    F --> I["Equilibrium: y = αx/(1+(α-1)x)"]

    A --> J[Column Design]
    J --> K[Number of Stages]
    J --> L[Reflux Ratio]

    K --> M["N = f(R, α, xF, xD, xB)"]
    L --> N["R = L/D"]
    L --> O["Rmin = (xD - yF)/(yF - xF)"]

    style A fill:#e1f5fe
    style D fill:#f3e5f5
    style J fill:#fff3e0
    style L fill:#c8e6c9
</Artefact>

**Fundamental Distillation Concepts:**

**Relative Volatility:**
$$\\alpha = \\frac{y_A/x_A}{y_B/x_B} = \\frac{P_A^0}{P_B^0}$$

**Equilibrium Relationship (Ideal System):**
$$y = \\frac{\\alpha x}{1 + (\\alpha - 1)x}$$

**McCabe-Thiele Method:**

**Rectifying Section Operating Line:**
$$y = \\frac{R}{R+1}x + \\frac{x_D}{R+1}$$

**Stripping Section Operating Line:**
$$y = \\frac{L_s}{V_s}x - \\frac{B \\cdot x_B}{V_s}$$

**Feed Line (q-line):**
$$y = \\frac{q}{q-1}x - \\frac{x_F}{q-1}$$

Where:
- $R$ = reflux ratio (L/D)
- $x_D, x_B$ = distillate and bottoms compositions
- $\\alpha$ = relative volatility
- $q$ = feed quality parameter

**Minimum Reflux Ratio:**
$$R_{min} = \\frac{x_D - y_{feed}}{y_{feed} - x_{feed}}$$

**Minimum Number of Stages (Total Reflux):**
$$N_{min} = \\frac{\\ln[(x_D/(1-x_D)) \\cdot ((1-x_B)/x_B)]}{\\ln \\alpha}$$

**Design Parameters:**
- **Feed Stage Location**: Optimal feed tray position
- **Column Diameter**: Based on vapor velocity and flooding
- **Tray Efficiency**: Actual vs. theoretical stages
- **Pressure Drop**: Affects temperature and separation

**Column Internals:**
- **Trays**: Bubble cap, sieve, valve trays
- **Packing**: Random or structured packing materials
- **Distributors**: Ensure uniform liquid distribution

**Process Considerations:**
- **Azeotropes**: Constant boiling mixtures limiting separation
- **Heat Integration**: Energy recovery between streams
- **Control Strategy**: Maintaining product specifications

The McCabe-Thiele method provides a graphical approach to determine theoretical stages and optimize reflux ratio for efficient separation!`,
        };

        // Check for keyword matches
        for (const [topic, keywords] of Object.entries(keywordMappings)) {
            for (const keyword of keywords) {
                if (message.includes(keyword)) {
                    console.log(`🎯 DEMO MODE: Keyword "${keyword}" matched to topic: ${topic}`);
                    return demoResponses[topic as keyof typeof demoResponses];
                }
            }
        }

        // Fallback: If no keywords match, cycle through questions (original behavior)
        let questionIndex = this.demoQuestionIndex.get(chatId) || 0;
        const fallbackResponses = Object.values(demoResponses);
        const response = fallbackResponses[questionIndex % fallbackResponses.length];
        
        // Increment for next question
        this.demoQuestionIndex.set(chatId, questionIndex + 1);
        
        console.log(`🔄 DEMO MODE: No keyword match, using fallback response ${questionIndex + 1}`);
        return response;
    }

    /**
     * DEMO MODE: Send user message and get hardcoded response
     *
     * @param message - The user's message
     * @param chatId - The chat ID
     * @param userId - The user ID
     * @param courseName - The course name (not used in demo mode)
     * @param onChunk - Callback function (not used in demo mode)
     * @returns Promise<ChatMessage> - The complete assistant's response message
     */
    public async sendUserMessageStream(
        message: string,
        chatId: string,
        userId: string,
        courseName: string,
        onChunk: (chunk: string) => void
    ): Promise<ChatMessage> {
        // Validate chat exists
        if (!this.chatHistory.has(chatId)) {
            throw new Error('Chat not found');
        }

        // Check rate limiting (50 messages per chat)
        const chatHistory = this.chatHistory.get(chatId);
        if (chatHistory && chatHistory.length >= 50) {
            throw new Error('Rate limit exceeded: Maximum 50 messages per chat');
        }

        // Add user message to history
        this.addUserMessage(chatId, message, userId);

        // DEMO MODE: Return hardcoded response
        console.log('🎭 DEMO MODE: Generating hardcoded chemical engineering response...');
        const assistantResponse = this.getDemoResponse(message, chatId);

        // Add assistant response to history
        const assistantMessage = this.addAssistantMessage(chatId, assistantResponse);

        return assistantMessage;
    }

    public initializeConversation(userID: string, courseName: string, date: Date): initChatRequest {
        //create chatID from the user ID
        const chatId = this.chatIDGenerator.chatID(userID, courseName, date);

        this.chatID.push(chatId);
        this.chatHistory.set(chatId, []);

        // Add default assistant message and get it
        const initAssistantMessage = this.addDefaultAssistantMessage(chatId);

        // Set the course name on the assistant message
        initAssistantMessage.courseName = courseName;

        // Generate chat title from the first 10 words of the assistant message
        const chatTitle = "New Chat"; // Initial title, will be updated after first user message

        const initChatRequest: initChatRequest = {
            userID: userID,
            courseName: courseName,
            date: date,
            chatId: chatId,
            initAssistantMessage: initAssistantMessage,
            chatTitle: chatTitle
        }

        return initChatRequest;
    }

    /**
     * Generate chat title from first 10 words of message text
     *
     * @param messageText - The message text to extract title from
     * @returns string - The generated title
     */
    public generateChatTitle(messageText: string): string {
        // Split into words and take first 10 (or whatever is available)
        const words = messageText.split(/\s+/).filter(word => word.length > 0);
        const titleWords = words.slice(0, 10);
        
        return titleWords.join(' ');
    }

    /**
     * Add the default assistant welcome message to chat history
     *
     * @param chatId - The chat ID
     * @returns ChatMessage - The default welcome message
     */
    private addDefaultAssistantMessage(chatId: string): ChatMessage {
        const defaultMessageText = `Hello! I am EngE-AI, your AI companion for chemical, environmental, and materials engineering.

I'm here to help you understand fundamental chemical engineering concepts. Ask me anything about:

- Material and Energy Balances - Foundation of process analysis
- Reactor Design - Batch, CSTR, and PFR reactors
- Mass Transfer - Diffusion and separation processes
- Heat Transfer - Heat exchangers and thermal design
- Distillation - Separation and purification methods

<Artefact>
graph TD
    A[Chemical Engineering Fundamentals] --> B[Material Balance]
    A --> C[Energy Balance]
    A --> D[Transport Phenomena]

    B --> E[Conservation of Mass]
    C --> F[Conservation of Energy]
    D --> G[Heat Transfer]
    D --> H[Mass Transfer]
    D --> I[Momentum Transfer]

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#f3e5f5
    style D fill:#fff3e0
</Artefact>

What would you like to explore today?

**Note:** This is a demo mode with 5 predefined responses about core chemical engineering topics.`;

        // Generate message ID
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(defaultMessageText, chatId, currentDate);

        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'bot',
            userId: 0,
            courseName: '', // Will be set by the caller
            text: defaultMessageText,
            timestamp: Date.now()
        };

        // Add to chat history
        const existingHistory = this.chatHistory.get(chatId);
        if (existingHistory) {
            existingHistory.push(chatMessage);
        } else {
            this.chatHistory.set(chatId, [chatMessage]);
        }

        return chatMessage;
    }

    /**
     * Add a user message to chat history
     *
     * @param chatId - The chat ID
     * @param message - The user's message
     * @param userId - The user ID
     * @returns ChatMessage - The created user message
     */
    private addUserMessage(chatId: string, message: string, userId: string): ChatMessage {
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);

        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'user',
            userId: parseInt(userId) || 0,
            courseName: '',
            text: message,
            timestamp: Date.now()
        };

        const existingHistory = this.chatHistory.get(chatId);
        if (existingHistory) {
            existingHistory.push(chatMessage);
        } else {
            this.chatHistory.set(chatId, [chatMessage]);
        }

        return chatMessage;
    }

    /**
     * Add an assistant message to chat history
     *
     * @param chatId - The chat ID
     * @param message - The assistant's message
     * @returns ChatMessage - The created assistant message
     */
    private addAssistantMessage(chatId: string, message: string): ChatMessage {
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);

        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'bot',
            userId: 0,
            courseName: '',
            text: message,
            timestamp: Date.now()
        };

        const existingHistory = this.chatHistory.get(chatId);
        if (existingHistory) {
            existingHistory.push(chatMessage);
        } else {
            this.chatHistory.set(chatId, [chatMessage]);
        }

        return chatMessage;
    }

    /**
     * Get chat history for a specific chat
     * 
     * @param chatId - The chat ID
     * @returns ChatMessage[] - Array of messages in the chat
     */
    public getChatHistory(chatId: string): ChatMessage[] {
        return this.chatHistory.get(chatId) || [];
    }

    /**
     * Validate if a chat exists
     *
     * @param chatId - The chat ID to validate
     * @returns boolean - True if chat exists, false otherwise
     */
    public validateChatExists(chatId: string): boolean {
        return this.chatHistory.has(chatId);
    }

    /**
     * Delete a chat and all its associated data
     *
     * @param chatId - The chat ID to delete
     * @returns boolean - True if deletion was successful, false otherwise
     */
    public deleteChat(chatId: string): boolean {
        try {
            if (!this.validateChatExists(chatId)) {
                this.logger.warn(`Attempted to delete non-existent chat: ${chatId}`);
                return false;
            }

            // Remove from chat history map
            const historyDeleted = this.chatHistory.delete(chatId);

            // Remove from chatID array
            const index = this.chatID.indexOf(chatId);
            let arrayDeleted = false;
            if (index > -1) {
                this.chatID.splice(index, 1);
                arrayDeleted = true;
            }

            // Remove from demo question index
            this.demoQuestionIndex.delete(chatId);

            console.log(`🗑️ CHAT DELETION SUCCESSFUL:`);
            console.log(`   Chat ID: ${chatId}`);
            console.log(`   History deleted: ${historyDeleted}`);
            console.log(`   Array entry deleted: ${arrayDeleted}`);
            console.log(`   Remaining active chats: ${this.chatID.length}`);

            return true;

        } catch (error) {
            console.error(`🗑️ FAILED TO DELETE CHAT ${chatId}:`, error);
            return false;
        }
    }
}

const chatApp = new ChatApp(appConfig);

// console.log(`DEBUG #666: Chat exists: ${chatApp.validateChatExists('1234567890')}`);

/**
 * Load all chats for the authenticated user (REQUIRES AUTH)
 *
 * @returns Array of user's chats from MongoDB
 */
router.get('/user/chats', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        // DEMO MODE: Return empty chats array (no MongoDB connection)
        console.log('🎭 DEMO MODE: Returning empty chats array');

        res.json({
            success: true,
            chats: [] // Empty array for demo mode
        });

        /* ORIGINAL CODE (disabled in demo mode)
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten'; // Use full course name

        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)
        console.log('\n📂 LOADING USER CHATS:');
        console.log('='.repeat(50));
        console.log(`PUID: ${puid}`);
        console.log(`Course Name: ${courseName}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        // Load chats from MongoDB
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const chats = await mongoDB.getUserChats(courseName, puid);

        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)
        console.log(`✅ LOADED ${chats.length} CHATS FROM MONGODB`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)

        res.json({
            success: true,
            chats: chats
        });
        */

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        console.error('❌ ERROR LOADING USER CHATS:', error);
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        res.status(500).json({
            success: false,
            error: 'Failed to load user chats'
        });
    }
}));

/**
 * create an new chat for user (REQUIRES AUTH)
 * 
 * @param userID - The user ID
 * @param courseName - The name of the course
 * @param date - The date of the chat
 * @returns The new chat ID
 */
router.post('/newchat', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const userID = req.body.userID;
        const courseName = req.body.courseName;
        const date = new Date(); // the date is the current date inside the backend
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-001)
        console.log('\n🆕 NEW CHAT CREATION REQUEST:');
        console.log('='.repeat(50));
        console.log(`User ID: ${userID}`);
        console.log(`Course Name: ${courseName}`);
        console.log(`PUID from session: ${puid}`);
        console.log(`Date: ${date}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-001)
    
        
        if (!userID || !courseName || !date) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            console.log('❌ VALIDATION FAILED: Missing required fields for new chat');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userID, courseName, and date are required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-003)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-003)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        // Actually create the chat using the ChatApp class FIRST
        const initRequest = chatApp.initializeConversation(userID, courseName, date);
        const chatId = initRequest.chatId;
        
        // Use the proper welcome message from the backend (includes diagrams and course context)
        const backendWelcomeMessage = initRequest.initAssistantMessage;
        
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-004)
        console.log('\n✅ NEW CHAT CREATED IN MEMORY:');
        console.log('='.repeat(50));
        console.log(`Generated Chat ID: ${chatId}`);
        console.log(`Assistant Message ID: ${backendWelcomeMessage.id}`);
        console.log(`Generated Chat Title: "${initRequest.chatTitle}"`);
        console.log(`Assistant Message Preview: "${backendWelcomeMessage.text.substring(0, 100)}..."`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-004)
        
        // Create Chat object to save to MongoDB
        const newChat: Chat = {
            id: chatId,
            courseName: courseName,
            divisionTitle: '', // Empty for now, will be set by user later
            itemTitle: initRequest.chatTitle, // Use generated title from first 10 words
            messages: [backendWelcomeMessage], // Use the proper backend welcome message with diagrams
            isPinned: false,
            pinnedMessageId: null
        };

        // DEMO MODE: Skip MongoDB save
        console.log('🎭 DEMO MODE: Skipping MongoDB save - chat exists in memory only');

        /* ORIGINAL CODE (disabled in demo mode)
        // Save chat to MongoDB
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            await mongoDB.addChatToUser(courseName, puid, newChat);

            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
            console.log('✅ CHAT SAVED TO MONGODB SUCCESSFULLY');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-006)
            console.error('⚠️ WARNING: Failed to save chat to MongoDB:', dbError);
            console.log('Chat created in memory but not persisted to database');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-006)
            // Continue execution - chat is still in memory
        }
        */
        
        // Return the complete response with the proper backend welcome message
        res.json({ 
            success: true, 
            chatId: chatId,
            initAssistantMessage: backendWelcomeMessage,
            chat: newChat // Return full chat object for frontend
        });
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-007)
        console.error('❌ ERROR CREATING NEW CHAT:', error);
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-007)
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create new chat' 
        });
    }
}));

/**
 * Send message endpoint (REQUIRES AUTH) - Simple request-response, no streaming
 */
router.post('/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { message, userId, courseName } = req.body;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        console.log('\n💬 SENDING MESSAGE:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`User ID: ${userId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log(`Message: ${message.substring(0, 100)}...`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        
        // Validate input
        if (!message || !userId) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            console.log('❌ VALIDATION FAILED: Missing required fields');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Message and userId are required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
            console.log('❌ VALIDATION FAILED: Chat not found in memory');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // Check if this is the first user message (only welcome message exists)
        const chatHistory = chatApp.getChatHistory(chatId);
        const isFirstUserMessage = chatHistory && chatHistory.length <= 1; // Only welcome message exists

        // REAL AI COMMUNICATION (NO STREAMING - WAIT FOR COMPLETE RESPONSE)
        try {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            console.log('🤖 Waiting for AI response...');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            
            // Add 2-second delay to simulate AI thinking time
            console.log('⏳ Adding 2-second delay for realistic response...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Use the ChatApp's streaming method but don't stream to client - just wait for complete response
            const assistantMessage = await chatApp.sendUserMessageStream(
                message,
                chatId,
                userId,
                courseName || 'APSC 099',
                () => {} // Empty callback - we don't stream to client
            );

            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-006)
            console.log('✅ AI response received');
            console.log('📊 Response length:', assistantMessage.text.length, 'characters');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-006)

            // Update chat title if this was the first user message
            let updatedTitle = null;
            if (isFirstUserMessage) {
                updatedTitle = chatApp.generateChatTitle(assistantMessage.text);
                console.log('🔄 Updating chat title from "New Chat" to:', updatedTitle);
            }

            // Create the user message object (sendUserMessageStream adds it internally but we need to save it to DB)
            const currentDate = new Date();
            const idGenerator = IDGenerator.getInstance();
            const userMessageId = idGenerator.messageID(message, chatId, currentDate);
            
            const userMessage: ChatMessage = {
                id: userMessageId,
                sender: 'user',
                userId: parseInt(userId) || 0,
                courseName: courseName,
                text: message,
                timestamp: Date.now()
            };

            // DEMO MODE: Skip MongoDB save
            console.log('🎭 DEMO MODE: Skipping MongoDB save - messages exist in memory only');

            /* ORIGINAL CODE (disabled in demo mode)
            // Save both messages to MongoDB
            const mongoDB = await EngEAI_MongoDB.getInstance();

            try {
                // Save user message
                await mongoDB.addMessageToChat(courseName, puid, chatId, userMessage);

                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                console.log('✅ User message saved to MongoDB');
                console.log('   User message ID:', userMessage.id);
                console.log('   Text:', userMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-007)

                // Save assistant message
                await mongoDB.addMessageToChat(courseName, puid, chatId, assistantMessage);

                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                console.log('✅ Assistant message saved to MongoDB');
                console.log('   Assistant message ID:', assistantMessage.id);
                console.log('   Text:', assistantMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-008)

            } catch (dbError) {
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-009)
                console.error('⚠️ WARNING: Failed to save messages to MongoDB:', dbError);
                console.log('Messages in memory but not persisted to database');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-009)
                // Continue execution - messages are still in memory
            }
            */

            // Return the complete response (no streaming)
            res.json({ 
                success: true, 
                userMessage: userMessage,
                assistantMessage: assistantMessage,
                updatedTitle: updatedTitle // Include updated title if this was the first message
            });

        } catch (aiError) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-010)
            console.error('❌ AI Communication Error:', aiError);
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-010)
            
            return res.status(500).json({ 
                success: false, 
                error: aiError instanceof Error ? aiError.message : 'AI communication failed'
            });
        }

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        console.error('❌ ERROR IN SEND MESSAGE ENDPOINT:', error);
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to process message' 
        });
    }
}));

/**
 * Get chat history for a specific chat (REQUIRES AUTH)
 */
router.get('/:chatId/history', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // Get chat history
        const history = chatApp.getChatHistory(chatId);
        
        res.json({ 
            success: true, 
            chatId: chatId,
            history: history,
            messageCount: history.length
        });
        
    } catch (error) {
        console.error('Error getting chat history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get chat history' 
        });
    }
}));

/**
 * Get a specific message from a chat (REQUIRES AUTH)
 */
router.get('/:chatId/message/:messageId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId, messageId } = req.params;
        
        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // Get chat history and find the specific message
        const history = chatApp.getChatHistory(chatId);
        const message = history.find(msg => msg.id === messageId);
        
        if (!message) {
            return res.status(404).json({ 
                success: false, 
                error: 'Message not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: message
        });
        
    } catch (error) {
        console.error('Error getting message:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get message' 
        });
    }
}));

/**
 * Delete a chat (REQUIRES AUTH)
 * 
 * @param chatId - The chat ID to delete
 * @returns JSON response with deletion status
 */
router.delete('/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten';
        
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-001)
        console.log('\n🗑️ DELETE CHAT REQUEST:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-001)
        
        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-002)
            console.log('❌ DELETE FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-003)
            console.log('❌ DELETE FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-003)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        // Validate chat exists in memory
        if (!chatApp.validateChatExists(chatId)) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-004)
            console.log(`❌ DELETE FAILED: Chat ${chatId} not found in memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-004)
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-005)
        console.log(`✅ Chat ${chatId} exists, proceeding with deletion`);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-005)
        
        // Delete from memory
        const deleted = chatApp.deleteChat(chatId);
        
        if (deleted) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-006)
            console.log(`✅ Chat ${chatId} deleted from memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-006)

            // DEMO MODE: Skip MongoDB deletion
            console.log('🎭 DEMO MODE: Skipping MongoDB delete - chat only existed in memory');

            /* ORIGINAL CODE (disabled in demo mode)
            // Delete from MongoDB
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                await mongoDB.deleteChatFromUser(courseName, puid, chatId);

                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-007)
                console.log(`✅ Chat ${chatId} deleted from MongoDB`);
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-007)
            } catch (dbError) {
                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-008)
                console.error('⚠️ WARNING: Failed to delete chat from MongoDB:', dbError);
                console.log('Chat deleted from memory but not from database');
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-008)
                // Continue execution - chat is deleted from memory
            }
            */
            
            res.json({
                success: true,
                message: 'Chat deleted successfully',
                chatId: chatId
            });
        } else {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-009)
            console.log(`❌ DELETE FAILED: Failed to delete chat ${chatId} from memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-009)
            res.status(500).json({
                success: false,
                error: 'Failed to delete chat'
            });
        }
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-010)
        console.error('❌ DELETE ERROR:', error);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-010)
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * Test endpoint for API validation
 */
router.get('/test', async (req: Request, res: Response) => {
    res.json({ 
        success: true, 
        message: 'Chat API is working',
        timestamp: new Date().toISOString(),
        activeChats: chatApp['chatID'].length
    });
});


export default router;

