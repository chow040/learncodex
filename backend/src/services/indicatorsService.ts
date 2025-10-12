export interface Series {
  close: number[];
  high: number[];
  low: number[];
  open: number[];
  volume: number[];
}

const sma = (values: number[], period: number): (number | null)[] => {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const vi = values[i] as number;
    sum += vi;
    if (i >= period) sum -= values[i - period] as number;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
};

const ema = (values: number[], period: number): (number | null)[] => {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (i < period - 1) {
      out.push(null);
    } else if (i === period - 1) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out.push(seed);
    } else {
  const nextVal: number = (prev as number) + k * (v - (prev as number));
  out.push(nextVal);
  prev = nextVal;
    }
  }
  return out;
};

const rsi = (values: number[], period = 14): (number | null)[] => {
  const out: (number | null)[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < values.length; i++) {
    const change = (values[i] as number) - (values[i - 1] as number);
    if (i <= period) {
      if (change >= 0) gains += change; else losses -= change;
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

const trueRange = (high: number[], low: number[], close: number[]): number[] => {
  const out: number[] = [NaN];
  for (let i = 1; i < close.length; i++) {
    const h = high[i] as number; const l = low[i] as number; const pc = close[i - 1] as number;
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return out;
};

const atr = (high: number[], low: number[], close: number[], period = 14): (number | null)[] => {
  const tr = trueRange(high, low, close);
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 1; i < tr.length; i++) {
    sum += tr[i] as number;
    if (i >= period) sum -= tr[i - period] as number;
    out.push(i >= period ? sum / period : null);
  }
  out.unshift(null); // align
  return out;
};

const bollinger = (values: number[], period = 20, mult = 2) => {
  const mid = sma(values, period);
  const ub: (number | null)[] = [];
  const lb: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const m = mid[i];
    if (m == null) { ub.push(null); lb.push(null); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    const mean = m as number;
    const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const stdev = Math.sqrt(variance);
    ub.push(mean + mult * stdev);
    lb.push(mean - mult * stdev);
  }
  return { mid, ub, lb };
};

const macd = (values: number[], fast = 12, slow = 26, signal = 9) => {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const f = emaFast[i]; const s = emaSlow[i];
    macdLine.push(f != null && s != null ? (f as number) - (s as number) : null);
  }
  const signalLine = ema(macdLine.map(v => v ?? 0), signal);
  const hist: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const m = macdLine[i]; const si = signalLine[i];
    hist.push(m != null && si != null ? (m as number) - (si as number) : null);
  }
  return { macd: macdLine, signal: signalLine, hist };
};

export function buildIndicatorsSummary(series: Series): string {
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
  const v = (arr: (number | null)[]) => {
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
