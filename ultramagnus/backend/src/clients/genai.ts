import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  logger.warn({ message: 'genai.missing_api_key' });
}

export const getGenAiClient = () => {
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }
  return new GoogleGenAI({ 
    apiKey, 
    httpOptions: { timeout: 600000 } // 10 minutes timeout
  });
};
