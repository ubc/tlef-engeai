/**
 * One-shot rewrite of platform default JSON to *Module Purpose* / *Module Content* format.
 * Run: node scripts/rewrite-system-prompt-defaults.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src/chat/system-prompts/socratic-default');

function stripBannerLines(text) {
    return text
        .split('\n')
        .filter((line) => !/^=+$/.test(line.trim()))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function stripLeadingSectionTitle(text, titlePattern) {
    const lines = stripBannerLines(text).split('\n');
    while (lines.length > 0 && (lines[0].trim() === '' || titlePattern.test(lines[0].trim()))) {
        lines.shift();
    }
    return lines.join('\n').trim();
}

function formatBody(purpose, content) {
    const cleaned = stripBannerLines(content);
    return `*Module Purpose*\n${purpose.trim()}\n\n*Module Content*\n${cleaned}`;
}

function splitResponseFormatting(body) {
    const text = stripBannerLines(body);
    const latexIdx = text.indexOf('LATEX MATHEMATICS FORMATTING');
    const mermaidIdx = text.indexOf('MERMAID DIAGRAM FORMATTING');
    if (latexIdx < 0 || mermaidIdx < 0) {
        throw new Error('Could not split response_formatting');
    }
    const textPart = text.slice(0, latexIdx).trim();
    const latexPart = text.slice(latexIdx, mermaidIdx).trim();
    const mermaidPart = text.slice(mermaidIdx).trim();
    return { textPart, latexPart, mermaidPart };
}

const PURPOSES = {
    core_identity:
        'Define EngE-AI’s role as an engineering tutor and how course materials are referenced (without leaking tags).',
    text_list_formatting:
        'Specify markdown and HTML list formatting rules for student-visible replies.',
    latex_formatting:
        'Specify LaTeX inline and display math formatting for student-visible replies.',
    mermaid_formatting:
        'Specify Mermaid diagram syntax and Artefact usage for visual explanations.',
    safety_restrictions:
        'List prohibited outputs, required citations, and the general pre-send response checklist.',
    diagram_guidance:
        'Define when and how to offer Mermaid diagrams that reinforce explained concepts.',
    teaching_methodology:
        'Apply the Socratic method (one question at a time) and concrete, cited response style.',
    practice_questions:
        'Generate Apply-level (Bloom) practice questions and guide students without revealing answers immediately.',
    diagram_socratic_follow_up:
        'After a diagram, continue with one-at-a-time Socratic questions—not full explanations.',
    conversation_management:
        'Track conversation depth and maintain context across turns.',
    socratic_safety_restrictions:
        'Enforce Socratic-only constraints and the Socratic pre-send checklist.',
    explanatory_prose:
        'Use the Explanatory PROSE framework: explain first, cite materials, at most one optional check-in question.',
    diagram_explanatory_follow_up:
        'After a diagram, recap the relationship and optionally ask one comprehension check-in.',
    explanatory_safety_restrictions:
        'Verify Explanatory-mode checklist before sending (explanation-first, PROSE rubric).',
};

function transformStruggleSystemBody(body) {
    const cleaned = stripBannerLines(body);
    const unstruggleIdx = cleaned.indexOf('UNSTRUGGLE TOPICS HANDLING');
    const strugglePart =
        unstruggleIdx >= 0 ? cleaned.slice(0, unstruggleIdx).trim() : cleaned;
    const unstrugglePart = unstruggleIdx >= 0 ? cleaned.slice(unstruggleIdx).trim() : '';

    let content = stripLeadingSectionTitle(
        strugglePart,
        /^STRUGGLE TOPICS HANDLING$/i
    );
    if (unstrugglePart) {
        const unstruggleBody = stripLeadingSectionTitle(
            unstrugglePart,
            /^UNSTRUGGLE TOPICS HANDLING$/i
        );
        content += `\n\n## Unstruggle topics handling\n\n${unstruggleBody}`;
    }

    return formatBody(
        'When struggle topics are active, switch to direct step-by-step guidance; when unstruggle is revealed, append the required tag.',
        content
    );
}

function transformInstructorModule(mod) {
    const purpose = PURPOSES[mod.id];
    if (!purpose) {
        throw new Error(`Missing purpose for module id: ${mod.id}`);
    }
    if (mod.id === 'response_formatting') {
        return null;
    }
    const content = stripBannerLines(mod.body);
    const withoutTitle = stripLeadingSectionTitle(
        content,
        /^[A-Z0-9 &/:()\-]+$/i
    );
    return { id: mod.id, body: formatBody(purpose, withoutTitle) };
}

function transformSocratic(data) {
    const systemModules = data.systemModules.map((m) => {
        if (m.id === '_system_struggle_topics') {
            return { ...m, body: transformStruggleSystemBody(m.body) };
        }
        return m;
    });

    const instructorModules = [];
    for (const mod of data.instructorModules) {
        if (mod.id === 'response_formatting') {
            const { textPart, latexPart, mermaidPart } = splitResponseFormatting(mod.body);
            instructorModules.push({
                id: 'text_list_formatting',
                body: formatBody(PURPOSES.text_list_formatting, textPart),
            });
            instructorModules.push({
                id: 'latex_formatting',
                body: formatBody(PURPOSES.latex_formatting, latexPart),
            });
            instructorModules.push({
                id: 'mermaid_formatting',
                body: formatBody(PURPOSES.mermaid_formatting, mermaidPart),
            });
            continue;
        }
        instructorModules.push(transformInstructorModule(mod));
    }

    return {
        ...data,
        version: '1.1.0',
        systemModules,
        instructorModules,
    };
}

function transformExplanatory(data) {
    const instructorModules = [];
    for (const mod of data.instructorModules) {
        if (mod.id === 'response_formatting') {
            const { textPart, latexPart, mermaidPart } = splitResponseFormatting(mod.body);
            instructorModules.push({
                id: 'text_list_formatting',
                body: formatBody(PURPOSES.text_list_formatting, textPart),
            });
            instructorModules.push({
                id: 'latex_formatting',
                body: formatBody(PURPOSES.latex_formatting, latexPart),
            });
            instructorModules.push({
                id: 'mermaid_formatting',
                body: formatBody(PURPOSES.mermaid_formatting, mermaidPart),
            });
            continue;
        }
        instructorModules.push(transformInstructorModule(mod));
    }

    return {
        ...data,
        version: '1.1.0',
        instructorModules,
    };
}

function main() {
    const socraticPath = path.join(ROOT, 'socratic.json');
    const explanatoryPath = path.join(ROOT, 'explanatory.json');

    const socratic = transformSocratic(JSON.parse(fs.readFileSync(socraticPath, 'utf8')));
    const explanatory = transformExplanatory(JSON.parse(fs.readFileSync(explanatoryPath, 'utf8')));

    fs.writeFileSync(socraticPath, `${JSON.stringify(socratic, null, 2)}\n`);
    fs.writeFileSync(explanatoryPath, `${JSON.stringify(explanatory, null, 2)}\n`);

    console.log(
        `socratic instructor modules: ${socratic.instructorModules.length}, explanatory: ${explanatory.instructorModules.length}`
    );
}

main();
