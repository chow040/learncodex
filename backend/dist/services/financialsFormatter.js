const SECTION_LABEL = {
    bs: 'Balance Sheet',
    cf: 'Cash Flow Statement',
    ic: 'Income Statement',
};
const DEFAULT_LIMIT = 12;
const MAX_FILINGS = 3;
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const formatValue = (value) => {
    if (value === null || value === undefined)
        return 'N/A';
    if (typeof value === 'number')
        return numberFormatter.format(value);
    if (typeof value === 'string' && value.trim().length > 0)
        return value;
    return String(value);
};
const coerceArray = (input) => {
    if (Array.isArray(input))
        return input;
    if (input && typeof input === 'object')
        return Object.values(input);
    return [];
};
const parseDate = (value) => {
    if (typeof value !== 'string')
        return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value.replace(' ', 'T'));
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};
const describeFiling = (filing) => {
    const form = typeof filing?.form === 'string' ? filing.form.trim() : undefined;
    const filed = filing?.filedDate ?? filing?.acceptedDate ?? filing?.endDate ?? filing?.startDate;
    const year = typeof filing?.year === 'number' ? String(filing.year) : undefined;
    const filedStr = typeof filed === 'string' ? filed.slice(0, 10) : undefined;
    const pieces = [form, year, filedStr].filter(Boolean);
    return pieces.length ? pieces.join(' � ') : 'Latest filing';
};
const buildSection = (filings, section, limit, includeToolHint) => {
    const statements = [];
    filings.slice(0, MAX_FILINGS).forEach((filing) => {
        const rawItems = coerceArray(filing?.report?.[section]);
        if (!rawItems.length) {
            return;
        }
        const items = Number.isFinite(limit) ? rawItems.slice(0, limit) : rawItems;
        const lines = items.map((entry) => {
            const label = typeof entry?.label === 'string' && entry.label.trim().length
                ? entry.label.trim()
                : typeof entry?.concept === 'string' ? entry.concept : 'Line item';
            const value = formatValue(entry?.value);
            const unit = typeof entry?.unit === 'string' && entry.unit.length ? ` ${entry.unit}` : '';
            return `- ${label}: ${value}${unit}`;
        });
        if (Number.isFinite(limit) && rawItems.length > items.length) {
            lines.push(`- � ${rawItems.length - items.length} additional rows truncated`);
        }
        const header = describeFiling(filing);
        statements.push(`### ${SECTION_LABEL[section]} (${header})\n${lines.join('\n')}`);
    });
    if (!statements.length)
        return null;
    const hint = includeToolHint
        ? `\n\n_For the full ${SECTION_LABEL[section].toLowerCase()}, call get_finnhub_${section === 'bs' ? 'balance_sheet' : section === 'cf' ? 'cashflow' : 'income_stmt'}._`
        : '';
    return statements.join('\n\n') + hint;
};
export const buildFinancialStatementExcerpts = (finReports, options = {}) => {
    const limit = options.limitPerStatement ?? DEFAULT_LIMIT;
    const includeToolHint = options.includeToolHint ?? true;
    const filings = (Array.isArray(finReports) ? finReports : [])
        .filter((filing) => filing?.report)
        .sort((a, b) => parseDate(b?.filedDate ?? b?.acceptedDate ?? b?.endDate)
        - parseDate(a?.filedDate ?? a?.acceptedDate ?? a?.endDate));
    return {
        balanceSheet: buildSection(filings, 'bs', limit, includeToolHint),
        cashflow: buildSection(filings, 'cf', limit, includeToolHint),
        incomeStatement: buildSection(filings, 'ic', limit, includeToolHint),
    };
};
export const buildFinancialStatementDetail = (finReports, section, options = {}) => {
    const limit = options.limitPerStatement ?? Number.POSITIVE_INFINITY;
    const filings = (Array.isArray(finReports) ? finReports : [])
        .filter((filing) => filing?.report)
        .sort((a, b) => parseDate(b?.filedDate ?? b?.acceptedDate ?? b?.endDate)
        - parseDate(a?.filedDate ?? a?.acceptedDate ?? a?.endDate));
    return buildSection(filings, section, limit, false);
};
//# sourceMappingURL=financialsFormatter.js.map