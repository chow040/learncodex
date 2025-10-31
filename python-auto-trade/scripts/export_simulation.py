#!/usr/bin/env python3
"""
Export simulation results to CSV for analysis.

Usage:
    python scripts/export_simulation.py --state logs/simulation_state.json --output results.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from autotrade_service.simulation import load_state


def export_to_csv(state_path: Path, output_path: Path) -> None:
    """Export trade log to CSV."""
    portfolio = load_state(state_path)
    
    if portfolio is None:
        print(f"Error: Could not load state from {state_path}")
        return
    
    if not portfolio.trade_log:
        print("No trades to export")
        return
    
    # Export trade log
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp",
            "symbol",
            "action",
            "price",
            "quantity",
            "realized_pnl",
            "reason",
        ])
        
        for trade in portfolio.trade_log:
            writer.writerow([
                trade.timestamp.isoformat(),
                trade.symbol,
                trade.action,
                f"{trade.price:.2f}",
                f"{trade.quantity:.6f}",
                f"{trade.realized_pnl:.2f}",
                trade.reason,
            ])
    
    print(f"Exported {len(portfolio.trade_log)} trades to {output_path}")
    
    # Print summary
    print("\nPortfolio Summary:")
    print(f"  Starting Cash: ${portfolio.starting_cash:.2f}")
    print(f"  Current Cash: ${portfolio.current_cash:.2f}")
    print(f"  Open Positions: {len(portfolio.positions)}")
    print(f"  Total Position Value: ${portfolio.total_position_value:.2f}")
    print(f"  Equity: ${portfolio.equity:.2f}")
    print(f"  Total PnL: ${portfolio.total_pnl:.2f} ({portfolio.total_pnl_pct:.2f}%)")
    print(f"  Realized PnL: ${portfolio.total_realized_pnl:.2f}")
    print(f"  Unrealized PnL: ${portfolio.total_unrealized_pnl:.2f}")
    
    if portfolio.positions:
        print("\nOpen Positions:")
        for symbol, pos in portfolio.positions.items():
            print(f"  {symbol}:")
            print(f"    Quantity: {pos.quantity:.6f}")
            print(f"    Entry: ${pos.entry_price:.2f}")
            print(f"    Current: ${pos.current_price:.2f}")
            print(f"    Unrealized PnL: ${pos.unrealized_pnl:.2f} ({pos.unrealized_pnl_pct:.2f}%)")
            if pos.exit_plan.stop_loss:
                print(f"    Stop Loss: ${pos.exit_plan.stop_loss:.2f}")
            if pos.exit_plan.take_profit:
                print(f"    Take Profit: ${pos.exit_plan.take_profit:.2f}")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Export simulation results to CSV",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    parser.add_argument(
        "--state",
        type=str,
        default="logs/simulation_state.json",
        help="Path to simulation state file",
    )
    
    parser.add_argument(
        "--output",
        type=str,
        default="simulation_trades.csv",
        help="Output CSV file path",
    )
    
    args = parser.parse_args()
    
    state_path = Path(args.state)
    output_path = Path(args.output)
    
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)
    
    export_to_csv(state_path, output_path)


if __name__ == "__main__":
    main()
