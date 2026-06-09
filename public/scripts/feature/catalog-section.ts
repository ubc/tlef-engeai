/**
 * Shared accordion UI for learning objectives and struggle topics on the documents page.
 */

export type CatalogKind = 'learning-objectives' | 'struggle-topics';

export interface CatalogItemRef {
    id: string;
    label: string;
}

export interface CatalogSectionConfig {
    kind: CatalogKind;
    topicOrWeekId: string;
    contentId: string;
    sectionTitle: string;
    countLabel: string;
    items: CatalogItemRef[];
    contentIdPrefix: string;
    countIdPrefix: string;
    iconIdPrefix: string;
    containerClass: string;
}

const INLINE_ADD_CONFIG: Record<
    CatalogKind,
    { label: string; placeholder: string; buttonText: string; inputIdPrefix: string }
> = {
    'learning-objectives': {
        label: 'Learning Objective:',
        placeholder: 'Enter the learning objective...',
        buttonText: 'Add Objective',
        inputIdPrefix: 'new-title',
    },
    'struggle-topics': {
        label: 'Struggle Topic:',
        placeholder: 'Enter the struggle topic...',
        buttonText: 'Add Struggle Topic',
        inputIdPrefix: 'new-struggle',
    },
};

/** Read-only list rows (no per-row edit/delete). */
export function buildCatalogListRows(items: Array<{ label: string }>): HTMLElement {
    const wrapper = document.createElement('div');

    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'objective-item';

        const header = document.createElement('div');
        header.className = 'objective-header catalog-readonly-row';

        const title = document.createElement('div');
        title.className = 'objective-title';
        title.textContent = item.label;

        header.appendChild(title);
        row.appendChild(header);
        wrapper.appendChild(row);
    });

    return wrapper;
}

/** Inline add form (unchanged UX; used inside accordion). */
export function buildCatalogInlineAddForm(
    kind: CatalogKind,
    topicOrWeekId: string,
    contentId: string
): HTMLElement {
    const cfg = INLINE_ADD_CONFIG[kind];
    const addWrap = document.createElement('div');
    addWrap.className = 'add-objective';

    const addForm = document.createElement('div');
    addForm.className = 'add-objective-form';

    const label = document.createElement('div');
    label.className = 'input-label';
    label.textContent = cfg.label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'objective-title-input';
    input.id = `${cfg.inputIdPrefix}-${topicOrWeekId}-${contentId}`;
    input.placeholder = cfg.placeholder;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.dataset.action = 'add';
    addBtn.dataset.week = String(topicOrWeekId);
    addBtn.dataset.content = String(contentId);
    addBtn.textContent = cfg.buttonText;

    addForm.appendChild(label);
    addForm.appendChild(input);
    addForm.appendChild(addBtn);
    addWrap.appendChild(addForm);

    return addWrap;
}

/** Full accordion section: header (count + Edit) + read-only rows + inline add. */
export function buildCatalogSection(config: CatalogSectionConfig): HTMLElement {
    const container = document.createElement('div');
    container.className = config.containerClass;

    const accordion = document.createElement('div');
    accordion.className = 'objectives-accordion';

    const headerRow = document.createElement('div');
    headerRow.className = 'objectives-header';
    headerRow.setAttribute('data-topic-or-week-instance', String(config.topicOrWeekId));
    headerRow.setAttribute('data-content', String(config.contentId));
    headerRow.dataset.catalogKind = config.kind;

    const headerTitle = document.createElement('div');
    headerTitle.className = 'objectives-title';
    headerTitle.textContent = config.sectionTitle;

    const headerActions = document.createElement('div');
    headerActions.className = 'objectives-header-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'catalog-edit-btn';
    editBtn.dataset.action = 'edit-catalog';
    editBtn.dataset.catalogKind = config.kind;
    editBtn.dataset.week = String(config.topicOrWeekId);
    editBtn.dataset.content = String(config.contentId);
    editBtn.textContent = 'Edit';

    const headerCount = document.createElement('div');
    headerCount.className = 'objectives-count';
    const countSpan = document.createElement('span');
    countSpan.id = `${config.countIdPrefix}-${config.topicOrWeekId}-${config.contentId}`;
    countSpan.textContent = String(config.items.length);
    const countText = document.createTextNode(` ${config.countLabel}`);
    headerCount.appendChild(countSpan);
    headerCount.appendChild(countText);

    const expandSpan = document.createElement('span');
    expandSpan.className = 'expand-icon catalog-expand-icon';
    expandSpan.id = `${config.iconIdPrefix}-${config.topicOrWeekId}-${config.contentId}`;
    expandSpan.setAttribute('aria-hidden', 'true');
    expandSpan.textContent = '▼';

    headerActions.appendChild(headerCount);
    headerActions.appendChild(editBtn);
    headerActions.appendChild(expandSpan);

    headerRow.appendChild(headerTitle);
    headerRow.appendChild(headerActions);

    const content = document.createElement('div');
    content.className = 'objectives-content';
    content.id = `${config.contentIdPrefix}-${config.topicOrWeekId}-${config.contentId}`;
    content.dataset.catalogKind = config.kind;

    const contentInner = document.createElement('div');
    contentInner.className = 'objectives-content-inner';

    const listWrapper = buildCatalogListRows(config.items.map((i) => ({ label: i.label })));
    contentInner.appendChild(listWrapper);
    contentInner.appendChild(buildCatalogInlineAddForm(config.kind, config.topicOrWeekId, config.contentId));
    content.appendChild(contentInner);

    accordion.appendChild(headerRow);
    accordion.appendChild(content);
    container.appendChild(accordion);

    return container;
}

const SECTION_PRESETS: Record<
    CatalogKind,
    Omit<CatalogSectionConfig, 'kind' | 'topicOrWeekId' | 'contentId' | 'items'>
> = {
    'learning-objectives': {
        sectionTitle: 'Learning Objectives',
        countLabel: 'objectives',
        contentIdPrefix: 'objectives',
        countIdPrefix: 'count',
        iconIdPrefix: 'obj-icon',
        containerClass: 'learning-objectives',
    },
    'struggle-topics': {
        sectionTitle: 'Struggle Topics',
        countLabel: 'struggle topics',
        contentIdPrefix: 'struggle',
        countIdPrefix: 'struggle-count',
        iconIdPrefix: 'struggle-icon',
        containerClass: 'struggle-topics',
    },
};

/** Convenience builder for documents page content items. */
export function buildCatalogSectionForItem(
    kind: CatalogKind,
    topicOrWeekId: string,
    contentId: string,
    items: CatalogItemRef[]
): HTMLElement {
    return buildCatalogSection({
        kind,
        topicOrWeekId,
        contentId,
        items,
        ...SECTION_PRESETS[kind],
    });
}
