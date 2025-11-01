#!/usr/bin/env python3
"""
Simulation driver script for running paper trading sessions.

Usage:
    python -m scripts.run_simulation --interval 180 --cash 10000
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add src to path for direct execution
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from autotrade_service.config import get_settings
from autotrade_service.llm.langchain_agent import SYSTEM_PROMPT
from autotrade_service.pipelines import get_decision_pipeline, shutdown_decision_pipeline
from autotrade_service.simulation import (
    SimulatedBroker,
    create_initial_state,
    load_state,
    save_state,
)

logger = logging.getLogger("autotrade.simulation.runner")


async def run_simulation_cycle(
    broker: SimulatedBroker,
    state_path: Path,
) -> None:
    """
    Execute one simulation cycle:
    1. Run decision pipeline
    2. Execute decisions via simulated broker
    3. Mark to market
    4. Persist state
    """
    logger.info("Starting simulation cycle")
    
    # Get decision pipeline
    pipeline = get_decision_pipeline()
    
    # Run decision pipeline
    result = await pipeline.run_once()
    
    if result is None:
        logger.warning("Decision pipeline returned no result; skipping cycle")
        return
    
    # For now, we need to extract market data from the decision context
    # This is a simplified approach - in production, you'd extract actual prices
    # from the tool results embedded in the agent trace
    settings = get_settings()
    symbols = settings.symbols or []
    
    # Build mock market snapshots (in production, parse from tool results)
    market_snapshots = {}
    for symbol in symbols:
        # This is a placeholder - in production you'd extract from tool cache
        # For now, use a default price
        market_snapshots[symbol] = 50000.0  # Placeholder
    
    logger.info(f"Market snapshots: {market_snapshots}")
    
    # Execute decisions
    decisions = result.response.decisions
    if decisions:
        logger.info(f"Executing {len(decisions)} decisions")
        messages = broker.execute(
            decisions,
            market_snapshots,
            system_prompt=SYSTEM_PROMPT,
            user_payload=result.prompt,
        )
        for msg in messages:
            logger.info(f"  {msg}")
    else:
        logger.info("No decisions to execute")
    
    # Mark to market
    broker.mark_to_market(market_snapshots)
    
    # Log portfolio state
    portfolio = broker.portfolio
    logger.info(
        f"Portfolio state: equity=${portfolio.equity:.2f}, "
        f"cash=${portfolio.current_cash:.2f}, "
        f"positions={len(portfolio.positions)}, "
        f"total_pnl=${portfolio.total_pnl:.2f} ({portfolio.total_pnl_pct:.2f}%)"
    )
    
    # Persist state
    save_state(portfolio, state_path)
    logger.info(f"State saved to {state_path}")


async def run_simulation_loop(
    interval_seconds: int,
    state_path: Path,
    max_slippage_bps: int,
    position_size_limit_pct: float,
) -> None:
    """
    Run the simulation loop indefinitely.
    
    Args:
        interval_seconds: Seconds between cycles
        state_path: Path to state file
        max_slippage_bps: Maximum slippage in basis points
        position_size_limit_pct: Maximum position size as % of equity
    """
    # Load or create portfolio
    portfolio = load_state(state_path)
    if portfolio is None:
        settings = get_settings()
        logger.info(f"Creating new simulation with ${settings.simulation_starting_cash:.2f}")
        portfolio = create_initial_state(
            portfolio_id="simulation",
            starting_cash=settings.simulation_starting_cash,
            path=state_path,
        )
    
    # Create broker
    broker = SimulatedBroker(
        portfolio=portfolio,
        max_slippage_bps=max_slippage_bps,
        position_size_limit_pct=position_size_limit_pct,
    )
    
    logger.info(
        f"Starting simulation loop: interval={interval_seconds}s, "
        f"state_path={state_path}, "
        f"starting_equity=${portfolio.equity:.2f}"
    )
    
    try:
        while True:
            try:
                await run_simulation_cycle(broker, state_path)
            except Exception as e:
                logger.error(f"Error in simulation cycle: {e}", exc_info=True)
            
            # Wait for next cycle
            logger.info(f"Waiting {interval_seconds}s until next cycle...")
            await asyncio.sleep(interval_seconds)
    except KeyboardInterrupt:
        logger.info("Simulation stopped by user")
    finally:
        await shutdown_decision_pipeline()


def setup_logging(log_level: str) -> None:
    """Configure logging for the simulation."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("logs/simulation.log"),
        ],
    )


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run paper trading simulation",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    parser.add_argument(
        "--interval",
        type=int,
        default=180,
        help="Seconds between decision cycles",
    )
    
    parser.add_argument(
        "--cash",
        type=float,
        help="Initial cash (overrides settings)",
    )
    
    parser.add_argument(
        "--state-path",
        type=str,
        default="logs/simulation_state.json",
        help="Path to simulation state file",
    )
    
    parser.add_argument(
        "--slippage-bps",
        type=int,
        default=5,
        help="Maximum slippage in basis points",
    )
    
    parser.add_argument(
        "--position-limit-pct",
        type=float,
        default=50.0,
        help="Maximum position size as % of equity",
    )
    
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single cycle and exit",
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_level)
    
    # Override settings if cash is specified
    if args.cash:
        settings = get_settings()
        settings.simulation_starting_cash = args.cash
        settings.simulation_enabled = True
        settings.simulation_state_path = args.state_path
        settings.simulation_max_slippage_bps = args.slippage_bps
        settings.simulation_position_size_limit_pct = args.position_limit_pct
    
    state_path = Path(args.state_path)
    
    # Ensure logs directory exists
    state_path.parent.mkdir(parents=True, exist_ok=True)
    
    if args.once:
        # Run single cycle
        async def run_once() -> None:
            portfolio = load_state(state_path)
            if portfolio is None:
                settings = get_settings()
                portfolio = create_initial_state(
                    portfolio_id="simulation",
                    starting_cash=args.cash or settings.simulation_starting_cash,
                    path=state_path,
                )
            
            broker = SimulatedBroker(
                portfolio=portfolio,
                max_slippage_bps=args.slippage_bps,
                position_size_limit_pct=args.position_limit_pct,
            )
            
            await run_simulation_cycle(broker, state_path)
        
        asyncio.run(run_once())
    else:
        # Run continuous loop
        asyncio.run(
            run_simulation_loop(
                interval_seconds=args.interval,
                state_path=state_path,
                max_slippage_bps=args.slippage_bps,
                position_size_limit_pct=args.position_limit_pct,
            )
        )


if __name__ == "__main__":
    main()
