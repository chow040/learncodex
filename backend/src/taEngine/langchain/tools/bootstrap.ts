import { registerFinnhubFundamentalTools } from './finnhubFundamentals.js';
import { registerNewsTools } from './newsTools.js';

let initialized = false;

export const ensureLangchainToolsRegistered = (): void => {
  if (initialized) {
    return;
  }

  registerNewsTools();
  registerFinnhubFundamentalTools();

  initialized = true;
};
