import axios from 'axios';
import { env } from '../config/env.js';

export interface AlphaCandles {
  close: number[];
  high: number[];
  low: number[];
  open: number[];
  volume: number[];
  time: number[]; // epoch seconds
}

export async function getAlphaDailyCandles(symbol: string, from: Date, to: Date): Promise<AlphaCandles | null> {
  if (!env.alphaVantageApiKey) {
    throw new Error('ALPHAVANTAGE_API_KEY is not configured.');
  }

  const url = 'https://www.alphavantage.co/query';
  const params = {
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: 'full',
    apikey: env.alphaVantageApiKey,
  } as const;

  const { data } = await axios.get(url, { params, timeout: 20000 });
  const series = data?.['Time Series (Daily)'];
  if (!series || typeof series !== 'object') return null;

  const entries = Object.entries(series) as Array<[string, any]>;
  // Filter by date range and sort ascending by date
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const rows = entries
    .filter(([date]) => date >= fromStr && date <= toStr)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (rows.length === 0) return null;

  const close: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const open: number[] = [];
  const volume: number[] = [];
  const time: number[] = [];

  for (const [date, ohlc] of rows) {
    const c = Number(ohlc['4. close']);
    const h = Number(ohlc['2. high']);
    const l = Number(ohlc['3. low']);
    const o = Number(ohlc['1. open']);
    const v = Number(ohlc['5. volume']);
    if ([c, h, l, o].some((x) => Number.isNaN(x))) continue;
    close.push(c);
    high.push(h);
    low.push(l);
    open.push(o);
    volume.push(Number.isNaN(v) ? 0 : v);
    time.push(Math.floor(new Date(date).getTime() / 1000));
  }

  if (close.length === 0) return null;
  return { close, high, low, open, volume, time };
}
