import os
import sys
import json
from pathlib import Path

TRADING_AGENTS_PATH = Path(r'D:/learinvscode/learncodex/TradingAgents-main')
if str(TRADING_AGENTS_PATH) not in sys.path:
    sys.path.insert(0, str(TRADING_AGENTS_PATH))

os.environ.setdefault('OPENAI_API_KEY', '<redacted>')  # replace with real key before running

from tradingagents.graph.trading_graph import TradingAgentsGraph

config = {
    'online_tools': False,
    'deep_think_llm': 'gpt-4.1-mini',
    'quick_think_llm': 'gpt-4.1-mini',
}

graph = TradingAgentsGraph(debug=False, config=config)
final_state, processed = graph.propagate('AAPL', '2025-02-10')

print(json.dumps({
    'decision': processed,
    'final_trade_decision': final_state.get('final_trade_decision'),
}, indent=2))
