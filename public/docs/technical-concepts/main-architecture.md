# Main Architecture

EngE-AI uses a client-server architecture with a vanilla TypeScript frontend and a TypeScript backend. The frontend uses HTML and CSS, while the application is supported by services such as MongoDB, Qdrant, Passport.js, and the UBC LTIC LLM toolkit. As described in [Agentic Engineering](/docs/logistics/agentic-engineering), we selected this stack because its technologies are widely used and well supported by AI-assisted coding tools. These tools can help developers understand the codebase, identify problems, and explore plausible solutions. We use them within a human-in-the-loop workflow: AI assists with implementation, while developers remain responsible for design decisions, code review, testing, and maintenance.


By the end of this section, you should be able to:

1. Describe the technology stack.
2. Explain the connections between layers.

## Technology Stack

The technologies we currently use are:

1. TypeScript (frontend and backend)
2. HTML
3. CSS
4. MongoDB
5. Qdrant (vector database)
6. Passport.js (middleware and authentication)
7. UBC LTIC facade LLM toolkit

## Architecture Overview

The overall architecture is illustrated as follows:

```mermaid
flowchart TB

    %% =========================
    %% CLIENT
    %% =========================
    subgraph Client["Client Layer"]
        UI["Vanilla TypeScript<br/>Web Application"]
    end

    %% =========================
    %% BACKEND
    %% =========================
    subgraph Backend["Backend Application"]
        API["Controller"]
        AUTH["Auth Middleware<br/>(Passport.js)"]
        CORE["Core Business Service"]
    end

    %% =========================
    %% AUTH / SSO (UBC CWL OUTSIDE BACKEND BOX)
    %% =========================
    CWL["UBC CWL<br/>(SSO Provider)"]

    %% =========================
    %% AI / LLM (EXTERNAL TO BACKEND BOX)
    %% =========================
    subgraph AI["AI / LLM Layer<br/>e.g., OpenAI<br/><br/>"]
        EMBEDDING["Embedding Service"]
        LLM["LLM Provider"]
    end

    %% =========================
    %% DATABASE
    %% =========================
    subgraph Storage["Storage Layer"]
        MONGO[("MongoDB<br/><br/>Metadata")]

        QDRANT[("Qdrant<br/><br/>Embeddings")]
    end

    %% =========================
    %% API FLOW
    %% =========================
    API --> CORE
    AUTH <-->|"OAuth / SSO"| CWL

    %% =========================
    %% NORMAL CRUD
    %% =========================
    CORE <-->|"CRUD"| MONGO
    CORE <-->|"CHUNKS & EMBEDDINGS"| QDRANT

    %% LLM CALLS
    %% =========================
    CORE <--> |"Embedding<br/>Inference Call"| AI
 

    
    %% ========================
    %% RESPONSE
    %% =========================
    API -->|" "| AUTH
    AUTH <--> |"REST API"| UI
```

EngE-AI follows a client-server architecture with two main parts: a frontend web application and a backend application.

The frontend is built with vanilla TypeScript, HTML, and CSS, and communicates with the backend through REST API requests. When a user logs in, Passport.js authentication middleware communicates with UBC CWL, which provides single sign-on (SSO). After authentication, the backend controller receives the request and passes it to the core business service, where the application’s main logic is processed.

The core business service stores application metadata in MongoDB, stores chunks and embeddings in Qdrant, and communicates with external AI and LLM providers.
