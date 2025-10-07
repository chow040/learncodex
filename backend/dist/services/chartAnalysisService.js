import { env } from '../config/env.js';
import { getOpenAIClient } from './openaiService.js';
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
]);
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_OUTPUT_TOKENS = 5_500;
const resolvedMaxImageBytes = Number.parseInt(process.env.CHART_ANALYSIS_MAX_IMAGE_BYTES ?? `${DEFAULT_MAX_IMAGE_BYTES}`, 10);
export const MAX_CHART_IMAGE_BYTES = Number.isNaN(resolvedMaxImageBytes)
    ? DEFAULT_MAX_IMAGE_BYTES
    : resolvedMaxImageBytes;
export const SUPPORTED_CHART_IMAGE_MIME_TYPES = SUPPORTED_IMAGE_MIME_TYPES;
const resolvedMaxOutputTokens = Number.parseInt(process.env.CHART_ANALYSIS_MAX_OUTPUT_TOKENS ?? `${DEFAULT_MAX_OUTPUT_TOKENS}`, 10);
const MAX_OUTPUT_TOKENS = Number.isNaN(resolvedMaxOutputTokens)
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : resolvedMaxOutputTokens;
const temperatureConfig = process.env.CHART_ANALYSIS_TEMPERATURE;
const TEMPERATURE = temperatureConfig !== undefined
    ? Number.parseFloat(temperatureConfig)
    : undefined;
const technicalAnalystPersona = `You are a professional technical analyst and swing trader specializing in candlestick and chart pattern recognition.
You assess uploaded stock charts (candlestick or line charts) to identify trading signals, market psychology, and risk/reward structure.
Describe what you see objectively and provide actionable insights like a real trader would � avoid generic statements.`;
const analysisInstructions = `Perform the following steps in your response, using the headings exactly as specified:

### Candlestick Patterns
Identify any visible candlestick patterns (e.g., doji, engulfing, hammer, shooting star) and explain what they imply about market psychology.

### Chart Patterns
Identify any chart patterns (e.g., head and shoulders, double bottom, triangle, flag, wedge, cup and handle) and note their formation stage, if applicable.

### Volume and Indicators
Comment on volume behaviour and any visible overlays (moving averages, RSI, MACD) that confirm or diverge from price action.

### Overall Trend
Describe the prevailing trend (uptrend / downtrend / consolidation) supported by price action evidence.

### Support and Resistance
List the key levels with approximate prices (e.g., "support at $150-152") and explain why they matter.

### Potential Trade Setup
Provide:
- Direction (long / short / wait � choose "wait" if signals are unclear).
- Suggested entry zone.
- Suggested stop loss.
- Suggested take profit / exit zone.
- Rough risk / reward ratio (e.g., 1:2).

### Rationale
Write a concise trading note justifying the setup, mentioning uncertainties, alternative scenarios, and risk management alignment.

If the chart lacks clear patterns or data, state that objectively and suggest what the trader should monitor next.
If you identify drawable annotations, include a final section:

### Annotations JSON
Provide a JSON object with any overlay instructions (bounding boxes, trend lines) using normalized coordinates (0-1). If no annotations are available, respond with "{}".`;
const buildUserPrompt = (ticker, timeframe, notes) => {
    const promptLines = [
        `Analyze the attached candlestick chart for ticker ${ticker ?? 'N/A'} on the ${timeframe ?? 'unspecified'} timeframe.`,
        '',
        analysisInstructions,
    ];
    if (notes && notes.trim().length > 0) {
        promptLines.push('', `Trader notes: ${notes.trim()}`);
    }
    return promptLines.join('\n');
};
const toDataUrl = (buffer, mimeType) => {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
};
const parseSections = (text) => {
    const sections = {};
    const lines = text.split(/\r?\n/);
    let currentHeading = null;
    let currentLines = [];
    const flush = () => {
        if (currentHeading) {
            sections[currentHeading] = currentLines.join('\n').trim();
        }
        currentLines = [];
    };
    for (const line of lines) {
        const headingMatch = /^###\s+(.+)$/.exec(line.trim());
        if (headingMatch) {
            flush();
            const heading = headingMatch[1]?.trim();
            currentHeading = heading && heading.length > 0 ? heading : null;
            continue;
        }
        if (currentHeading) {
            currentLines.push(line);
        }
    }
    flush();
    return sections;
};
const extractAnnotations = (sections) => {
    const annotationKey = Object.keys(sections).find((key) => key.toLowerCase().includes('annotation'));
    if (!annotationKey) {
        return null;
    }
    const payload = sections[annotationKey];
    if (!payload) {
        return null;
    }
    try {
        const trimmed = payload
            .trim()
            .replace(/^```(?:json)?/i, '')
            .replace(/```$/i, '')
            .trim();
        if (!trimmed) {
            return null;
        }
        return JSON.parse(trimmed);
    }
    catch (error) {
        console.warn('Failed to parse annotation JSON from chart analysis:', error);
        return null;
    }
};
export const analyzeChartImage = async (input) => {
    if (!SUPPORTED_CHART_IMAGE_MIME_TYPES.has(input.mimeType)) {
        throw new Error('Unsupported image format. Please upload PNG, JPEG, or WEBP charts.');
    }
    if (!input.buffer || input.buffer.length === 0) {
        throw new Error('Chart image is empty.');
    }
    if (input.buffer.length > MAX_CHART_IMAGE_BYTES) {
        const sizeMb = (MAX_CHART_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
        throw new Error(`Chart image exceeds the maximum size of ${sizeMb} MB.`);
    }
    const client = getOpenAIClient();
    const dataUrl = toDataUrl(input.buffer, input.mimeType);
    const userPrompt = buildUserPrompt(input.ticker, input.timeframe, input.notes);
    const request = {
        model: env.openAiModel,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [
            {
                role: 'system',
                content: technicalAnalystPersona,
            },
            {
                role: 'user',
                content: [
                    { type: 'input_text', text: userPrompt },
                    { type: 'input_image', image_url: dataUrl, detail: 'low' },
                ],
            },
        ],
    };
    if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
        request.temperature = TEMPERATURE;
    }
    const response = await client.responses.create(request);
    const rawText = response.output_text?.trim();
    if (!rawText) {
        throw new Error('No analysis was produced for the uploaded chart.');
    }
    const sections = parseSections(rawText);
    const annotations = extractAnnotations(sections);
    const payload = {
        rawText,
        sections,
        annotations,
    };
    if (response.usage) {
        const usage = response.usage;
        payload.usage = {
            total_tokens: usage.total_tokens,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            reasoning_tokens: usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens,
        };
    }
    return payload;
};
//# sourceMappingURL=chartAnalysisService.js.map