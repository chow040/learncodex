// Use dynamic require to avoid type dependency in compile step; install package at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yahooFinance = require('yahoo-finance2').default;
export async function getYahooDailyCandles(symbol, from, to) {
    const results = await yahooFinance.historical(symbol, {
        period1: from,
        period2: to,
        interval: '1d',
        events: 'history',
    }).catch(() => null);
    if (!results || results.length === 0)
        return null;
    const close = [];
    const high = [];
    const low = [];
    const open = [];
    const volume = [];
    const time = [];
    for (const row of results) {
        if (!row || row.close == null || row.high == null || row.low == null || row.open == null)
            continue;
        close.push(Number(row.close));
        high.push(Number(row.high));
        low.push(Number(row.low));
        open.push(Number(row.open));
        volume.push(row.volume != null ? Number(row.volume) : 0);
        time.push(Math.floor(new Date(row.date).getTime() / 1000));
    }
    if (close.length === 0)
        return null;
    return { close, high, low, open, volume, time };
}
//# sourceMappingURL=yahooFinanceService.js.map