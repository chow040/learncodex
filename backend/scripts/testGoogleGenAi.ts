import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_GENAI_API_KEY;
const model = process.env.GOOGLE_GENAI_MODEL ?? 'gemini-1.5-flash';

if (!apiKey) {
  console.error('GOOGLE_GENAI_API_KEY is not set. Please add it to your .env before running this script.');
  process.exit(1);
}

const prompt =
  'Provide the latest noteworthy news about NVIDIA (ticker: NVDA). ' +
  'Summarize key headlines, include any market-moving events from the past week, ' +
  'and cite the publication/source inline if the web search tool provides references.';

const run = async () => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const client = genAI.getGenerativeModel({
    model,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 0.9,
    },
  });

  const response = await client.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    tools: [{ googleSearch: {} }],
  });

  const text = response.response?.text?.() ?? '';
  console.log(`Model: ${model}`);
  console.log('Prompt:', prompt);
  console.log('\n--- Gemini Response ---\n');
  console.log(text.trim());
};

run().catch((error) => {
  console.error('Gemini test request failed:', error);
  process.exit(1);
});
