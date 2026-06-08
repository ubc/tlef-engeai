/**
 * One-shot: extract inline JSON module bodies to .md and rewrite manifests with bodyFile.
 * Run: node scripts/extract-system-prompt-defaults-to-md.cjs <socratic|explanatory>
 */

const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
if (mode !== 'socratic' && mode !== 'explanatory') {
    console.error('Usage: node scripts/extract-system-prompt-defaults-to-md.cjs <socratic|explanatory>');
    process.exit(1);
}

const BASE = path.join(__dirname, '..', 'src/chat/system-prompts');
const MODE_DIR = path.join(BASE, `${mode}-default`);
const SHARED_DIR = path.join(BASE, 'shared-default');

const SHARED_BODY_FILES = new Set([
    'shared-default/system_prompt_guidance.md',
    'shared-default/text_list_formatting.md',
    'shared-default/latex_formatting.md',
    'shared-default/correctness_restrictions.md',
    'shared-default/course_main_intro.md',
]);

function pathForModule(mod) {
    const id = mod.id;
    const slug = id.replace(/\s+/g, '_');
    if (id === 'struggle topics') {
        return { rel: 'struggle_topics.md', dir: MODE_DIR };
    }
    const sharedRel = `shared-default/${slug}.md`;
    if (SHARED_BODY_FILES.has(sharedRel)) {
        return { rel: sharedRel, dir: SHARED_DIR };
    }
    return { rel: `${slug}.md`, dir: MODE_DIR };
}

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function transformModule(mod) {
    if (!mod.body) {
        throw new Error(`Module ${mod.id} has no inline body to extract`);
    }
    const { rel, dir } = pathForModule(mod);
    const full = rel.startsWith('shared-default/')
        ? path.join(BASE, rel)
        : path.join(dir, path.basename(rel));
    ensureDir(full);
    fs.writeFileSync(full, `${mod.body.trim()}\n`, 'utf8');
    const { body: _b, ...rest } = mod;
    const bodyFile = rel.startsWith('shared-default/') ? rel : path.basename(rel);
    return { ...rest, bodyFile };
}

function main() {
    const jsonPath = path.join(MODE_DIR, `${mode}.json`);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data.systemModules = (data.systemModules ?? []).map(transformModule);
    data.instructorModules = data.instructorModules.map(transformModule);
    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`Updated ${jsonPath}`);
}

main();
