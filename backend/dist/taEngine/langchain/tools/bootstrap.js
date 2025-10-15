import { registerFinnhubFundamentalTools } from './finnhubFundamentals.js';
import { registerNewsTools } from './newsTools.js';
let initialized = false;
export const ensureLangchainToolsRegistered = () => {
    if (initialized) {
        return;
    }
    registerNewsTools();
    registerFinnhubFundamentalTools();
    initialized = true;
};
//# sourceMappingURL=bootstrap.js.map