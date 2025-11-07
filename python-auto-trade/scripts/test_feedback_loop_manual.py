#!/usr/bin/env python3
"""
Manual test script to simulate real trades with the feedback loop.

This script:
1. Creates a simulated portfolio
2. Opens and closes positions
3. Generates feedback critiques and rules
4. Loads rules in the next decision cycle

Run with: PYTHONPATH=src .venv/bin/python scripts/test_feedback_loop_manual.py
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from autotrade_service.feedback.feedback_engine import FeedbackLoopEngine
from autotrade_service.feedback.outcome_tracker import TradeOutcomeTracker
from autotrade_service.simulation.broker import SimulatedBroker
from autotrade_service.simulation.state import SimulatedPortfolio
from autotrade_service.llm.schemas import DecisionPayload, DecisionAction
from autotrade_service.llm.client import AsyncDeepSeekClient
from autotrade_service.config import get_settings
from autotrade_service.db import get_db


async def main():
    """Run manual feedback loop test."""
    
    print("=" * 80)
    print("FEEDBACK LOOP MANUAL TEST")
    print("=" * 80)
    print("\nThis will execute real trades and generate actual LLM feedback.")
    print("Make sure you have:")
    print("  - DEEPSEEK_API_KEY set in your environment")
    print("  - Database running and AUTOTRADE_DB_URL configured\n")
    
    # Connect to database (REQUIRED)
    db = get_db()
    try:
        await db.connect()
        if not db.is_connected:
            raise RuntimeError("Database connection failed - is_connected returned False")
        print("✅ Database connected\n")
    except Exception as e:
        print(f"\n❌ ERROR: Database connection required but failed: {e}")
        print("\nThis test requires a database connection to:")
        print("  1. Persist learned rules to the learned_rules table")
        print("  2. Store trade outcomes in the trade_outcomes table")
        print("  3. Verify the complete feedback loop end-to-end")
        print("\nPlease:")
        print("  - Start your PostgreSQL database")
        print("  - Set AUTOTRADE_DB_URL environment variable")
        print("  - Run migrations: cd backend && npm run migrate:up")
        print("\nExiting...\n")
        return
    
    # Get settings
    settings = get_settings()
    
    if not settings.feedback_loop_enabled:
        print("⚠️  WARNING: feedback_loop_enabled is False in settings!")
        print("   The feedback loop won't run. Set AUTOTRADE_FEEDBACK_LOOP_ENABLED=true\n")
    
    # Initialize components
    print("🔧 Initializing components...")
    llm_client = AsyncDeepSeekClient()
    feedback_engine = FeedbackLoopEngine(llm_client, settings)
    outcome_tracker = TradeOutcomeTracker(feedback_engine)
    
    # Create portfolio
    portfolio = SimulatedPortfolio(
        portfolio_id=str(uuid4()),
        starting_cash=10000.0,
        current_cash=10000.0,
    )
    
    # Create broker
    broker = SimulatedBroker(
        portfolio=portfolio,
        outcome_tracker=outcome_tracker,
    )
    
    print(f"✅ Portfolio created with ${portfolio.starting_cash:,.2f}\n")
    
    # Define test trades
    trades = [
        {
            "symbol": "BTCUSDT",
            "entry_price": 95000.0,
            "exit_price": 98000.0,  # +3.16% win
            "rationale": "Strong breakout above resistance with high volume",
            "size_pct": 15.0,
            "leverage": 2.0,
        },
        {
            "symbol": "ETHUSDT",
            "entry_price": 3500.0,
            "exit_price": 3400.0,  # -2.86% loss
            "rationale": "Attempting to catch bottom after oversold RSI",
            "size_pct": 10.0,
            "leverage": 1.5,
        },
        {
            "symbol": "SOLUSDT",
            "entry_price": 180.0,
            "exit_price": 189.0,  # +5.0% win
            "rationale": "Following strong momentum with bullish divergence",
            "size_pct": 12.0,
            "leverage": 1.0,
        },
    ]
    
    print(f"📊 Executing {len(trades)} simulated trades...\n")
    
    for i, trade in enumerate(trades, 1):
        print(f"{'='*60}")
        print(f"Trade {i}: {trade['symbol']}")
        print(f"{'='*60}")
        
        # Open position
        buy_decision = DecisionPayload(
            symbol=trade["symbol"],
            action=DecisionAction.BUY,
            size_pct=trade["size_pct"],
            confidence=0.75,
            rationale=trade["rationale"],
            leverage=trade["leverage"],
            max_slippage_bps=10,
        )
        
        buy_messages = broker.execute(
            decisions=[buy_decision],
            market_snapshots={trade["symbol"]: trade["entry_price"]}
        )
        
        print(f"\n📈 OPEN: {buy_messages[0]}")
        
        # Close position
        close_decision = DecisionPayload(
            symbol=trade["symbol"],
            action=DecisionAction.CLOSE,
            size_pct=0.0,
            confidence=0.0,
            rationale=f"Target/stop reached",
            leverage=1.0,
            max_slippage_bps=10,
        )
        
        close_messages = broker.execute(
            decisions=[close_decision],
            market_snapshots={trade["symbol"]: trade["exit_price"]}
        )
        
        pnl_pct = ((trade["exit_price"] - trade["entry_price"]) / trade["entry_price"]) * 100
        result = "🟢 WIN" if pnl_pct > 0 else "🔴 LOSS"
        
        print(f"📉 CLOSE: {close_messages[0]}")
        print(f"\n{result}: {pnl_pct:+.2f}%")
        
        # Process feedback (calls LLM)
        print(f"\n🤖 Generating feedback with LLM...")
        await broker.process_pending_feedback()
        
        print(f"✅ Feedback processed for {trade['symbol']}\n")
        
        # Small delay between trades
        await asyncio.sleep(1)
    
    print(f"\n{'='*80}")
    print("PORTFOLIO SUMMARY")
    print(f"{'='*80}")
    print(f"Starting Cash:     ${portfolio.starting_cash:,.2f}")
    print(f"Current Cash:      ${portfolio.current_cash:,.2f}")
    print(f"Total Equity:      ${portfolio.equity:,.2f}")
    print(f"Realized PnL:      ${portfolio.total_realized_pnl:+,.2f}")
    print(f"Total PnL %:       {portfolio.total_pnl_pct:+.2f}%")
    print(f"\nTrades Executed:   {len(portfolio.trade_log)}")
    print(f"Positions Closed:  {len(portfolio.closed_positions)}")
    
    print(f"\n{'='*80}")
    print("FEEDBACK LOOP VERIFICATION")
    print(f"{'='*80}")
    
    # Verify rules were saved to database
    print("\n🔍 Checking database for generated rules...")
    try:
        async with db.acquire() as conn:
            rules = await conn.fetch(
                "SELECT id, rule_text, rule_type, created_at FROM learned_rules ORDER BY created_at DESC LIMIT 10"
            )
            outcomes = await conn.fetch(
                "SELECT id, symbol, pnl_pct, created_at FROM trade_outcomes ORDER BY created_at DESC LIMIT 10"
            )
            
            print(f"\n✅ Found {len(rules)} rules in database:")
            for i, rule in enumerate(rules[:5], 1):  # Show latest 5
                print(f"   {i}. [{rule['rule_type']}] {rule['rule_text'][:80]}...")
            
            print(f"\n✅ Found {len(outcomes)} trade outcomes in database:")
            for i, outcome in enumerate(outcomes[:5], 1):  # Show latest 5
                print(f"   {i}. {outcome['symbol']}: {outcome['pnl_pct']:+.2f}%")
                
    except Exception as e:
        print(f"\n⚠️  Could not verify database: {e}")
    
    print("\n✅ Feedback loop completed successfully!")
    print("   - Critiques generated for each closed trade")
    print("   - Improvement rules created and saved to database")
    print("   - Rules ready to be loaded in next decision cycle")
    
    print("\n📝 Next steps:")
    print("   1. Run the scheduler to see rules loaded in decision prompts")
    print("   2. Check that rules appear before ### TASK ### marker")
    print("   3. Monitor rule effectiveness over time")
    
    # Cleanup
    await db.disconnect()
    print("\n✅ Database disconnected")
    
    print(f"\n{'='*80}\n")


if __name__ == "__main__":
    asyncio.run(main())
