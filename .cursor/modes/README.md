# Custom Modes Setup

Paste each file below into **Cursor → Settings → Chat → Custom Modes → Add mode**.

## Decision flow (modes & rules)

All tasks enter through the **Orchestrator**. It clarifies the prompt, decides the next step, and writes a handoff to `planner/`. **Custom Modes** are roles you switch to in Cursor UI. **Masters** are `.mdc` rules that auto-attach while a Generator edits matching files — they are not separate agents.

```mermaid
flowchart TD
    H([Human Engineer]) --> O[Orchestrator Mode]

    O --> PC{Prompt clear?}
    PC -->|No| OQ[Critical questions / reframe task]
    OQ --> H
    H --> O

    PC -->|Yes| TC{Trivial?}
    TC -->|Yes| OP[One-line plan in handoff]
    OP --> HA{Human approves?}
    HA -->|No| O
    HA -->|Yes| TG[Trivial fix — assigned Generator]

    TC -->|No| SA[System Architect Mode]
    SA --> PA[planner/slug-architecture.md]
    PA --> HB{Human approves plan?}
    HB -->|No| SA
    HB -->|Yes| RT{Route by layer}

    RT -->|Frontend| FE[Frontend Generator Mode]
    RT -->|Backend| BE[Backend Generator Mode]
    RT -->|Prompts| PE[Prompt Engineer Mode]
    RT -->|FE + BE| FE --> BE

    FE --> MFE[Masters via globs<br/>CSS · A11y · API client]
    BE --> MBE[Masters via globs<br/>API · Mongo · Qdrant · RAG · Auth · Migration]
    MFE --> IMP[Implementation complete]
    MBE --> IMP
    PE --> IMP
    TG --> IMP

    IMP --> O2[Orchestrator schedules post-passes]
    O2 --> QA[Backend QA rule<br/>docs-only · no src reads]
    QA --> DOC[Documentation Creator rule]
    DOC --> RED[Red Team Mode<br/>advisory]
    RED --> H2([Human merge / staging])
```

### Orchestrator routing (what triggers which mode)

```mermaid
flowchart LR
    subgraph signals [Task signals]
        S1[UI / public/]
        S2[src/ routes & logic]
        S3[Prompts / memory agent]
        S4[Unclear scope]
        S5[Post-implement]
    end

    O[Orchestrator] --> S1 & S2 & S3 & S4 & S5

    S4 --> O
    S1 --> FE[Frontend Generator]
    S2 --> BE[Backend Generator]
    S3 --> PM[Prompt Engineer]
    S5 --> QA[Backend QA rule] --> DOC[Documentation Creator] --> RT[Red Team]

    FE -.->|styles| CSS[CSS Master]
    FE -.->|layout| A11Y[Accessibility Master]
    FE -.->|fetch| API[API Master]

    BE -.->|routes| API
    BE -.->|db| MONGO[MongoDB Master]
    BE -.->|vectors| QD[Qdrant + RAG Masters]
    BE -.->|auth/monitor| AUTH[Auth RBAC Master]
```

**Legend:** solid arrows = switch Custom Mode or explicit post-pass; dotted arrows = Master rules auto-attach during implementation (no mode switch).

---

Suggested tool permissions:

| Mode | Tools |
|------|-------|
| Orchestrator | Read, search (no edit by default) |
| System Architect | Read, search |
| Frontend Generator | All |
| Backend Generator | All |
| Prompt Engineer | All (scope prompts) |
| Red Team | Read, terminal (curl), search |

Attach rules manually in mode settings where Cursor supports it, or rely on glob auto-attach when editing files.

Rules reference: `../rules/`
