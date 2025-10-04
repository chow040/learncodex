const sma = (values, period) => {
    const out = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        const vi = values[i];
        sum += vi;
        if (i >= period)
            sum -= values[i - period];
        out.push(i >= period - 1 ? sum / period : null);
    }
    return out;
};
const ema = (values, period) => {
    const out = [];
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (i < period - 1) {
            out.push(null);
        }
        else if (i === period - 1) {
            const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
            prev = seed;
            out.push(seed);
        }
        else {
            const nextVal = prev + k * (v - prev);
            out.push(nextVal);
            prev = nextVal;
        }
    }
    return out;
};
const rsi = (values, period = 14) => {
    const out = [];
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        if (i <= period) {
            if (change >= 0)
                gains += change;
            else
                losses -= change;
            out.push(null);
            continue;
        }
        if (i === period) {
            const avgGain = gains / period;
            const avgLoss = losses / period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            out.push(100 - 100 / (1 + rs));
            continue;
        }
        const prev = out[out.length - 1]; // previous RSI not used directly
        const up = change > 0 ? change : 0;
        const down = change < 0 ? -change : 0;
        // Wilder's smoothing
        gains = (gains * (period - 1) + up) / period;
        losses = (losses * (period - 1) + down) / period;
        const rs = losses === 0 ? 100 : gains / losses;
        out.push(100 - 100 / (1 + rs));
    }
    out.unshift(null); // align length
    return out;
};
const trueRange = (high, low, close) => {
    const out = [NaN];
    for (let i = 1; i < close.length; i++) {
        const h = high[i];
        const l = low[i];
        const pc = close[i - 1];
        out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return out;
};
const atr = (high, low, close, period = 14) => {
    const tr = trueRange(high, low, close);
    const out = [];
    let sum = 0;
    for (let i = 1; i < tr.length; i++) {
        sum += tr[i];
        if (i >= period)
            sum -= tr[i - period];
        out.push(i >= period ? sum / period : null);
    }
    out.unshift(null); // align
    return out;
};
const bollinger = (values, period = 20, mult = 2) => {
    const mid = sma(values, period);
    const ub = [];
    const lb = [];
    for (let i = 0; i < values.length; i++) {
        const m = mid[i];
        if (m == null) {
            ub.push(null);
            lb.push(null);
            continue;
        }
        const slice = values.slice(i - period + 1, i + 1);
        const mean = m;
        const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
        const stdev = Math.sqrt(variance);
        ub.push(mean + mult * stdev);
        lb.push(mean - mult * stdev);
    }
    return { mid, ub, lb };
};
const macd = (values, fast = 12, slow = 26, signal = 9) => {
    const emaFast = ema(values, fast);
    const emaSlow = ema(values, slow);
    const macdLine = [];
    for (let i = 0; i < values.length; i++) {
        const f = emaFast[i];
        const s = emaSlow[i];
        macdLine.push(f != null && s != null ? f - s : null);
    }
    const signalLine = ema(macdLine.map(v => v ?? 0), signal);
    const hist = [];
    for (let i = 0; i < values.length; i++) {
        const m = macdLine[i];
        const si = signalLine[i];
        hist.push(m != null && si != null ? m - si : null);
    }
    return { macd: macdLine, signal: signalLine, hist };
};
export function buildIndicatorsSummary(series) {
    const c = series.close;
    const last = c[c.length - 1];
    const sma50 = sma(c, 50);
    const sma200 = sma(c, 200);
    const ema10 = ema(c, 10);
    const rsi14 = rsi(c, 14);
    const atr14 = atr(series.high, series.low, c, 14);
    const bb = bollinger(c, 20, 2);
    const m = macd(c, 12, 26, 9);
    const idx = c.length - 1;
    const v = (arr) => {
        const x = arr[idx];
        return x == null || Number.isNaN(x) ? 'N/A' : Number(x).toFixed(2);
    };
    const lines = [
        `Latest close: ${last?.toFixed ? last.toFixed(2) : String(last)}`,
        `SMA50: ${v(sma50)} | SMA200: ${v(sma200)} | EMA10: ${v(ema10)}`,
        `RSI(14): ${v(rsi14)} | ATR(14): ${v(atr14)}`,
        `Bollinger: mid ${v(bb.mid)} / ub ${v(bb.ub)} / lb ${v(bb.lb)}`,
        `MACD: ${v(m.macd)} | Signal: ${v(m.signal)} | Hist: ${v(m.hist)}`,
    ];
    return lines.join('\n');
}
//# sourceMappingURL=indicatorsService.js.map