# Handover Writing Guidelines

This guide defines the audience, tone, and review rules for EngE-AI handover documentation.

## Target audience

The primary audience is:

- New or incoming EngE-AI developers
- Developers taking over the project after the current team
- Developers using AI-assisted coding tools
- Academics or instructors who need to understand the project
- Readers with little or no prior experience with this codebase, its infrastructure, or its development tools

Some readers may understand basic software development, TypeScript, Git, and web applications, but others may have little or no technical experience in these areas. Do not assume that readers already understand the project’s infrastructure, deployment process, UBC services, internal conventions, or software-development terminology.

Write as if the reader is joining the project tomorrow.

## Writing style

Documentation must be:

- Direct and instructional
- Clear to a developer who is new to the project
- Specific about responsibilities and ownership
- Easy to scan using short paragraphs, headings, numbered steps, and bullet points
- Consistent in its technical terminology

Prefer:

- **must** for mandatory requirements
- **should** for recommended practices
- **may** for permitted but optional actions
- **must not** or **do not** for prohibited actions

Avoid vague expressions such as “when needed,” “as appropriate,” “may include,” “throughout your development phase,” and “you may want to.” Replace them with specific actions, owners, and conditions.

## Cross-references

When a reader needs another document, section, tool, or example to understand or complete a task, include a direct cross-reference whenever the destination is available.

Make cross-referenced content easy to identify by using a review flag during drafting:

> **[CROSS-REFERENCE NEEDED: Link this step to the deployment workflow documentation.]**

Use a cross-reference flag when:

- A term or process is explained elsewhere in the project
- A step depends on another document or procedure
- The reader needs an example, configuration reference, or technical guide
- A link is mentioned but its destination has not yet been confirmed

After the destination is confirmed, replace the flag with a descriptive Markdown link. Do not leave unresolved cross-reference flags in finalized handover documentation.

## Jargon and unfamiliar terms

Flag technical jargon that a new developer or academic reader may not understand. Do not assume that common engineering abbreviations or project-specific terminology are self-explanatory.

Use this format during review:

> **[JARGON: “CI/CD” may be unfamiliar. Define it when first used.]**

When possible, define the term at first use and then use the abbreviation consistently:

> Continuous Integration and Continuous Delivery (CI/CD) automatically build, test, and deploy the application.

Flag terms such as acronyms, infrastructure names, deployment terminology, framework names, database concepts, security terms, and project-specific vocabulary when they are not defined or linked. The review report must remind the project owner about each unresolved jargon flag.

## Responsibility and ownership

Make ownership explicit. Clearly distinguish responsibilities belonging to:

- Developers
- Supervisors
- The EngE-AI project team
- UBC or LTIC
- Infrastructure and external service providers

For example:

> Developers are responsible for the application code. Infrastructure is managed by the project team. Report infrastructure-related issues to your supervisor.

Do not assign infrastructure management, maintenance, or troubleshooting responsibilities to developers unless that responsibility is explicitly confirmed by the project owner.

## Effective wording patterns

State responsibilities directly:

> Developers must test their changes before opening a pull request.

Use direct instructions:

> Do not develop directly on the `main` branch. Create a feature branch before making changes.

Explain the reason when it helps the reader follow the process:

> Create a feature branch from `main` so that your work does not interfere with the shared integration branch.

Describe workflows in sequence:

> Develop and test changes locally before opening a pull request. After a change is merged into `main`, it is automatically deployed to staging. Production deployment requires supervisor approval.

## Review rules

When reviewing documentation:

1. Automatically correct unambiguous spelling, grammar, capitalization, missing or incorrect punctuation, repeated words, and obvious formatting errors.
2. Preserve the original meaning when making automatic corrections.
3. Identify clarity problems separately instead of silently changing technical meaning.
4. For each clarity problem, quote the complete original sentence or paragraph, explain the problem, and suggest a revision.
5. Identify wording that is grammatically correct but awkward, indirect, or unsuitable for handover documentation.
6. Flag missing, unclear, or unverified cross-references using `[CROSS-REFERENCE NEEDED: ...]`.
7. Flag unexplained jargon using `[JARGON: ...]` and remind the project owner to define or link it.
8. Do not invent technical facts, requirements, services, or responsibilities.
9. Preserve existing links, filenames, code formatting, and technical terminology unless they contain an obvious error.
10. Keep documentation changes limited to the requested section.

## Review report format

Each review should report:

### Updated

Briefly describe the changes made and link to the edited file.

### Automatically corrected

List the main grammar, typo, spelling, capitalization, and punctuation corrections.

### Clarity issues

For each issue, provide:

- Original wording
- Problem
- Suggested revision

### Awkward wording

Identify paragraphs that are grammatically correct but unnatural, indirect, or unsuitable for handover documentation.

### Cross-reference flags

List every unresolved `[CROSS-REFERENCE NEEDED: ...]` flag and identify the document, section, or resource that should be linked.

### Jargon flags

List every unresolved `[JARGON: ...]` flag and suggest a plain-language definition or an authoritative reference.

### Decisions to confirm

List only items that require confirmation because they could change the documented responsibilities, workflow, or technical meaning.
