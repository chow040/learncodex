import { resolveTools } from '../toolRegistry.js';
import { marketAnalystRegistration } from './marketRunnable.js';
import { newsAnalystRegistration } from './newsRunnable.js';
import { socialAnalystRegistration } from './socialRunnable.js';
import { fundamentalsAnalystRegistration } from './fundamentalsRunnable.js';
export const analystRegistry = {
    [marketAnalystRegistration.id]: marketAnalystRegistration,
    [newsAnalystRegistration.id]: newsAnalystRegistration,
    [socialAnalystRegistration.id]: socialAnalystRegistration,
    [fundamentalsAnalystRegistration.id]: fundamentalsAnalystRegistration,
};
export const getAnalystRegistration = (id) => {
    const registration = analystRegistry[id];
    if (!registration) {
        throw new Error(`Analyst registration not found for id "${id}".`);
    }
    return registration;
};
export const createAnalystRunnable = (id, options) => {
    const registration = getAnalystRegistration(id);
    const toolContext = {
        symbol: options.symbol,
        tradeDate: options.tradeDate,
        agentsContext: options.agentsContext,
    };
    if (options.toolLogger) {
        toolContext.logger = options.toolLogger;
    }
    const tools = resolveTools(Array.from(registration.requiredTools), toolContext);
    const context = {
        symbol: options.symbol,
        tradeDate: options.tradeDate,
        tools,
        agentsContext: options.agentsContext,
        llm: options.llm,
    };
    if (options.runLogger) {
        context.runLogger = options.runLogger;
    }
    const runnable = registration.createRunnable(context);
    return {
        runnable,
        tools,
    };
};
//# sourceMappingURL=index.js.map