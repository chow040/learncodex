import axios from 'axios';
// Dynamic import for cheerio to work in ESM environments
let _cheerio: any | null = null;
async function loadCheerio() {
  if (_cheerio) return _cheerio;
  const mod: any = await import('cheerio');
  _cheerio = mod?.default ?? mod; // support both ESM/CJS export shapes
  return _cheerio;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.54 Safari/537.36';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape Google News search for a query in a date range.
 * Returns an array of items: { title, snippet, source, link, date }
 */
export async function getGoogleNews(tickerOrQuery: string, startDate: string, endDate: string): Promise<Array<Record<string, string>>> {
  // Accept a raw ticker or query string; we'll encode it for the URL
  const query = encodeURIComponent(tickerOrQuery.replace(/\s+/g, '+'));
  const results: Array<Record<string, string>> = [];
  const headers = { 'User-Agent': DEFAULT_USER_AGENT };

  // Google returns results in pages of 10; we'll fetch up to 3 pages to limit load
  for (let page = 0; page < 3; page++) {
    const offset = page * 10;
  const url = `https://www.google.com/search?q=${query}&tbs=cdr:1,cd_min:${startDate},cd_max:${endDate}&tbm=nws&start=${offset}`;

    try {
      // simple delay between requests to be polite
      if (page > 0) await sleep(1000 + Math.floor(Math.random() * 1500));
      const resp = await axios.get(url, { headers, timeout: 15000 });
  const html = resp.data as string;
  const cheerio = await loadCheerio();
  const $ = cheerio.load(html);

      // Google's news result container selector may vary; look for common classes
      const items = $('div.SoaBEf, .dbsr, div.g');
      if (!items || items.length === 0) break;

      items.each((idx: number, el: any) => {
        try {
          const $el = $(el as any);
          const title = $el.find('div.MBeuO, .JheGif, .dbsr .JheGif').first().text().trim() || $el.find('a').attr('aria-label') || '';
          const snippet = $el.find('.GI74Re, .Y3v8qd').first().text().trim() || '';
          const source = $el.find('.NUnG9d span, .XcVN5d').first().text().trim() || '';
          const link = $el.find('a').attr('href') || '';
          const date = $el.find('.sfyJob').first().text().trim() || $el.find('.WG9SHc span').first().text().trim() || '';
          if (title) {
            results.push({ title, snippet, source, link, date });
          }
        } catch (e) {
          // ignore per-item parse errors
        }
      });
    } catch (err) {
      // If Google blocks or any network error occurs, stop scraping further pages
      break;
    }
  }

  return results;
}
