# TLEF ENGE AI

![Node.js](https://img.shields.io/badge/Node.js-24.1.0-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.1-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-6.3-47A248?logo=mongodb&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-Vector%20DB-2B9B3F?logo=qdrant&logoColor=white)
![Passport](https://img.shields.io/badge/Passport-SAML%2FCWL-34E27A?logo=passport&logoColor=white)


<!-- ![EngE AI wallpaper](assets/engeai-wallpaper.jpg) -->



EngE-AI is an AI-powered learning assistant for UBC Engineering courses which emphasizes on developing student's critical thinking.
---

## Features

### Instructor
- Course creation and management
- Document upload (PDF, DOCX) for RAG
- Learning objectives and materials
- Flags management and responses
- Student chat monitoring
- Assistant and system prompts configuration
<!-- @rdschrs: Implemented the optional Writing Feedback workspace and reviewer documentation. -->
- Optional Writing Feedback workspace for staff-reviewed, evidence-based feedback and PDFs (A2 LLED 200 MVP; Canvas/OCR production integrations are gated)

### Student
- Course-aware AI chat
- Flag creation ("I'm struggling")
- Flag history

### Technical
- Vector search (Qdrant)
- Streaming chat responses
- Session-based authentication
- MongoDB for courses and users
- Custom UBC Shibboleth SAML 2.0 authentication strategy for Passport.js

---

## Recent Update

<!-- Add recent changes here -->

---

## How to Set It Up

### Prerequisites

- **Node.js** (v24.1.0)
- **MongoDB** (see [setup instructions](https://github.com/ubc/tlef-mongodb-docker))
- **Qdrant** (see [setup instructions](https://github.com/ubc/tlef-qdrant))
- **SAML** (see [setup instructions](https://github.com/ubc/docker-simple-saml))
- **LLM endpoint** (e.g. Ollama or other provider)

### Setup Steps

1. Clone the repo:

   ```bash
   git clone https://github.com/ubc/tlef-engeai.git
   cd tlef-engeai
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root (use `.env.example` and update the variables as needed).

4. Run the application:
   - **Development:** `npm run dev` (nodemon + BrowserSync)
   - **Production:** `npm start`

---

## Team

| Role | Name |
|------|------|
| Principal Investigator | [Alireza Bagherzadeh](https://chbe.ubc.ca/s-alireza-bagherzadeh/) — Associate Professor of Teaching, CHBE |
| Co-Investigator | [Amir M. Dehkhoda](https://mtrl.ubc.ca/amir-m-dehkhoda/) — Assistant Professor of Teaching, Materials Engineering |
| Software Developer | [Richard Tape](https://ctlt.ubc.ca/2022/11/15/richard-tape/) |
| Software Developer | Charisma Rusdiyanto |
| Software Developer | Kathleen Tom |
| Software Developer | Christopher Rodas |

---

## How to Contribute

1. Create a feature branch
2. Follow existing code style (TypeScript, Express patterns)
3. Submit a pull request

For API reference, see [documents/ENDPOINT_ARCHITECTURE.md](documents/ENDPOINT_ARCHITECTURE.md).

---

## Documentation

- [Endpoint Architecture](documents/ENDPOINT_ARCHITECTURE.md)
- [Responsive Design](documents/RESPONSIVE_DESIGN.md)
- [Writing Feedback Architecture](documents/WRITING_FEEDBACK_ARCHITECTURE.md)
- [Writing Feedback Assessment Logic](documents/WRITING_FEEDBACK_ASSESSMENT_LOGIC.md)
- [Writing Feedback Style Guide](documents/WRITING_FEEDBACK_STYLE_GUIDE.md)
- [docker-simple-saml](https://github.com/ubc/docker-simple-saml) — Containerized SAML 2.0 IdP for local development

---

## Continuous Integration

Pushing to the main branch in this repo will trigger a deploy automatically to the staging server.
