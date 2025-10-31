#!/usr/bin/env python3
"""
Export simulation results to CSV for analysis (standalone version).

Usage:
    python scripts/export_simulation_standalone.py --state logs/simulation_state.json --output results.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path


def load_state(path: Path) -> dict | None:
    """Load simulation state from JSON file."""
    if not path.exists():
        return None
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading state: {e}", file=sys.stderr)
        return None


def export_to_csv(state_path: Path, output_path: Path) -> None:
    """Export trade log to CSV."""
    data = load_state(state_path)
    
    if data is None:
        print(f"Error: Could not load state from {state_path}")
        return
    
    trade_log = data.get("trade_log", [])
    
    if not trade_log:
        print("No trades to export")
    else:
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
            
            for trade in trade_log:
                writer.writerow([
                    trade.get("timestamp", ""),
                    trade.get("symbol", ""),
                    trade.get("action", ""),
                    f"{trade.get('price', 0):.2f}",
                    f"{trade.get('quantity', 0):.6f}",
                    f"{trade.get('realized_pnl', 0):.2f}",
                    trade.get("reason", ""),
                ])
        
        print(f"Exported {len(trade_log)} trades to {output_path}")
    
    # Calculate metrics
    positions = data.get("positions", {})
    starting_cash = data.get("starting_cash", 0.0)
    current_cash = data.get("current_cash", 0.0)
    
    # Calculate position value
    total_position_value = sum(
        pos.get("quantity", 0) * pos.get("current_price", 0)
        for pos in positions.values()
    )
    
    equity = current_cash + total_position_value
    
    # Calculate PnL
    total_realized_pnl = sum(trade.get("realized_pnl", 0) for trade in trade_log)
    total_unrealized_pnl = sum(
        pos.get("quantity", 0) * (pos.get("current_price", 0) - pos.get("entry_price", 0))
        for pos in positions.values()
    )
    total_pnl = total_realized_pnl + total_unrealized_pnl
    total_pnl_pct = (total_pnl / starting_cash * 100.0) if starting_cash else 0.0
    
    # Print summary
    print("\nPortfolio Summary:")
    print(f"  Portfolio ID: {data.get('portfolio_id', 'N/A')}")
    print(f"  Starting Cash: ${starting_cash:.2f}")
    print(f"  Current Cash: ${current_cash:.2f}")
    print(f"  Open Positions: {len(positions)}")
    print(f"  Total Position Value: ${total_position_value:.2f}")
    print(f"  Equity: ${equity:.2f}")
    print(f"  Total PnL: ${total_pnl:.2f} ({total_pnl_pct:.2f}%)")
    print(f"  Realized PnL: ${total_realized_pnl:.2f}")
    print(f"  Unrealized PnL: ${total_unrealized_pnl:.2f}")
    print(f"  Total Trades: {len(trade_log)}")
    
    if positions:
        print("\nOpen Positions:")
        for symbol, pos in positions.items():
            quantity = pos.get("quantity", 0)
            entry_price = pos.get("entry_price", 0)
            current_price = pos.get("current_price", 0)
            unrealized_pnl = quantity * (current_price - entry_price)
            entry_notional = quantity * entry_price
            unrealized_pnl_pct = (unrealized_pnl / entry_notional * 100.0) if entry_notional else 0.0
            
            print(f"  {symbol}:")
            print(f"    Quantity: {quantity:.6f}")
            print(f"    Entry: ${entry_price:.2f}")
            print(f"    Current: ${current_price:.2f}")
            print(f"    Unrealized PnL: ${unrealized_pnl:.2f} ({unrealized_pnl_pct:.2f}%)")
            
            exit_plan = pos.get("exit_plan", {})
            if exit_plan.get("stop_loss"):
                print(f"    Stop Loss: ${exit_plan['stop_loss']:.2f}")
            if exit_plan.get("take_profit"):
                print(f"    Take Profit: ${exit_plan['take_profit']:.2f}")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Export simulation results to CSV (standalone)",
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
