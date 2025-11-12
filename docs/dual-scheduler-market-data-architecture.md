# Dual-Scheduler Market Data Architecture Blueprint

## Executive Summary

**Goal**: Implement a two-scheduler architecture that separates high-frequency market data collection from LLM trading decisions, with real-time price display banner similar to Alpha Arena.

**Key Components**:
- 🔄 **Market Data Scheduler**: Refreshes crypto prices every 5 seconds → Redis
- 🤖 **LLM Decision Scheduler**: Makes trading decisions every 5-15 minutes using cached data
- 📊 **Real-Time Banner**: WebSocket-powered price ticker displaying BTC, ETH, SOL, BNB, DOGE, XRP
- 💾 **Redis Cache**: Central data store for market data with appropriate TTLs

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                    PRICE BANNER (Top Navigation)                          │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐ │  │
│  │  │  BTC   │  │  ETH   │  │  SOL   │  │  BNB   │  │  DOGE  │  │  XRP   │ │  │
│  │  │$101,042│  │ $3,303 │  │  $155  │  │  $939  │  │ $0.15  │  │ $2.22  │ │  │
│  │  │ -6.52% │  │ +2.1%  │  │ -1.2%  │  │ +0.8%  │  │ +5.3%  │  │ -2.1%  │ │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              ▲                                                   │
│                              │ WebSocket updates every 5s                        │
│                              │                                                   │
└──────────────────────────────┼───────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────────────┐
│                          BACKEND (FastAPI)                                       │
├──────────────────────────────┼───────────────────────────────────────────────────┤
│                              │                                                   │
│  ┌───────────────────────────▼──────────────────────────────────────┐          │
│  │           WebSocket Endpoint: /ws/market-data                     │          │
│  │  - Broadcasts price updates to connected clients every 5s         │          │
│  │  - Reads from Redis cache                                         │          │
│  └───────────────────────────┬──────────────────────────────────────┘          │
│                              │ Read                                              │
│                              │                                                   │
│  ┌───────────────────────────▼──────────────────────────────────────┐          │
│  │                      REDIS CACHE                                  │          │
│  │                                                                    │          │
│  │  market:BTC-USDT-SWAP:ticker      TTL: 10s                       │          │
│  │  market:ETH-USDT-SWAP:ticker      TTL: 10s                       │          │
│  │  market:SOL-USDT-SWAP:ticker      TTL: 10s                       │          │
│  │  market:BTC-USDT-SWAP:orderbook   TTL: 10s                       │          │
│  │  market:BTC-USDT-SWAP:funding     TTL: 300s                      │          │
│  │  market:BTC-USDT-SWAP:ohlcv:1m    TTL: 60s                       │          │
│  │  market:BTC-USDT-SWAP:indicators  TTL: 60s                       │          │
│  └────────────┬──────────────────────────┬────────────────────────┘          │
│               ▲                          │ Read                                  │
│               │ Write (every 5s)         │                                       │
│               │                          ▼                                       │
│  ┌────────────┴────────────┐   ┌────────────────────────────────────┐          │
│  │  Market Data Scheduler  │   │   LLM Decision Scheduler            │          │
│  │  (Background Task)      │   │   (Background Task)                 │          │
│  │                         │   │                                     │          │
│  │  Interval: 5 seconds    │   │   Interval: 5-15 minutes            │          │
│  │                         │   │                                     │          │
│  │  Tasks:                 │   │   Tasks:                            │          │
│  │  • Fetch ticker         │   │   1. Read market data from Redis    │          │
│  │  • Fetch orderbook      │   │   2. Get portfolio positions        │          │
│  │  • Fetch funding rate   │   │   3. Build LLM prompt               │          │
│  │  • Fetch OHLCV          │   │   4. Get DeepSeek decision          │          │
│  │  • Calculate indicators │   │   5. Execute trades on OKX          │          │
│  │  • Update Redis         │   │   6. Update feedback loop           │          │
│  │  • Broadcast to WS      │   │   7. Update portfolio snapshot      │          │
│  └────────────┬────────────┘   └────────────────────────────────────┘          │
│               │                                                                  │
│               ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────┐                  │
│  │              OKX API Client                               │                  │
│  │  • REST API: Market data, trading operations              │                  │
│  │  • WebSocket: Real-time price feeds (optional)            │                  │
│  └──────────────────────────────────────────────────────────┘                  │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Market Data Scheduler (5-second Loop)

**Responsibility**: Continuously fetch and cache market data for all tracked symbols

```python
# autotrade_service/schedulers/market_data_scheduler.py

import asyncio
import json
import logging
from datetime import datetime
from typing import List, Dict, Any
from redis.asyncio import Redis
import ccxt.async_support as ccxt

logger = logging.getLogger(__name__)

class MarketDataScheduler:
    """
    High-frequency scheduler that fetches market data every 5 seconds.
    Updates Redis cache and broadcasts to WebSocket clients.
    """
    
    SYMBOLS = [
        "BTC-USDT-SWAP",
        "ETH-USDT-SWAP",
        "SOL-USDT-SWAP",
        "BNB-USDT-SWAP",
        "DOGE-USDT-SWAP",
        "XRP-USDT-SWAP"
    ]
    
    def __init__(self, redis_client: Redis, exchange: ccxt.Exchange, websocket_manager: 'ConnectionManager'):
        self.redis = redis_client
        self.exchange = exchange
        self.ws_manager = websocket_manager
        self.interval_seconds = 5
        self._running = False
    
    async def fetch_and_cache_market_data(self) -> Dict[str, Any]:
        """
        Fetch market data for all symbols and update Redis cache.
        Returns aggregated data for WebSocket broadcast.
        """
        market_snapshot = {}
        
        for symbol in self.SYMBOLS:
            try:
                # Fetch data in parallel for each symbol
                ccxt_symbol = symbol.replace("-", "/")
                ticker, orderbook, funding = await asyncio.gather(
                    self.exchange.fetch_ticker(ccxt_symbol),
                    self.exchange.fetch_order_book(ccxt_symbol, limit=40),
                    self.exchange.fetchFundingRate(ccxt_symbol),
                    return_exceptions=True
                )
                
                # Handle potential errors
                if isinstance(ticker, Exception):
                    logger.error(f"Failed to fetch ticker for {symbol}: {ticker}")
                    continue
                
                # Cache ticker data (10 second TTL - refreshed every 5s)
                await self.redis.setex(
                    f"market:{symbol}:ticker",
                    10,
                    json.dumps({
                        "symbol": symbol,
                        "last_price": ticker.get("last"),
                        "bid": ticker.get("bid"),
                        "ask": ticker.get("ask"),
                        "volume_24h": ticker.get("baseVolume"),
                        "high_24h": ticker.get("high"),
                        "low_24h": ticker.get("low"),
                        "change_24h": ticker.get("info", {}).get("change24h"),
                        "change_pct_24h": self._calculate_change_pct(ticker),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                )
                
                # Cache orderbook (10 second TTL)
                if not isinstance(orderbook, Exception):
                    await self.redis.setex(
                        f"market:{symbol}:orderbook",
                        10,
                        json.dumps({
                            "bids": orderbook.get("bids", [])[:20],
                            "asks": orderbook.get("asks", [])[:20],
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    )
                
                # Cache funding rate (5 minute TTL - updates less frequently)
                if not isinstance(funding, Exception):
                    await self.redis.setex(
                        f"market:{symbol}:funding",
                        300,
                        json.dumps({
                            "funding_rate": funding.get("fundingRate"),
                        "next_funding_time": funding.get("nextFundingTime"),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    )
                
                # Build snapshot for WebSocket broadcast
                market_snapshot[symbol] = {
                    "symbol": symbol,
                    "price": float(ticker.get("last", 0)),
                    "change_24h": float(ticker.get("info", {}).get("change24h") or ticker.get("change", 0) or 0),
                    "change_pct_24h": self._calculate_change_pct(ticker),
                    "volume_24h": float(ticker.get("baseVolume", 0)),
                    "high_24h": float(ticker.get("high", 0)),
                    "low_24h": float(ticker.get("low", 0))
                }
                
                logger.debug(f"Updated market data for {symbol}")
                
            except Exception as e:
                logger.error(f"Error fetching market data for {symbol}: {e}")
                continue
        
        return market_snapshot
    
    async def fetch_and_cache_ohlcv(self, symbol: str):
        """
        Fetch and cache OHLCV candlestick data for multiple timeframes.
        Per config: 15m (short-term), 1h (long-term)
        """
        timeframes = [
            ("15m", 50, 60),   # 15-minute candles, 50 bars, 60s TTL
            ("1h", 100, 300),  # 1-hour candles, 100 bars, 300s TTL
        ]
        
        for timeframe, limit, ttl in timeframes:
            try:
                candles = await self.exchange.fetch_ohlcv(symbol.replace("-", "/"), timeframe=timeframe, limit=limit)
                
                await self.redis.setex(
                    f"market:{symbol}:ohlcv:{timeframe}",
                    ttl,
                    json.dumps({
                        "candles": candles,
                        "timeframe": timeframe,
                        "limit": limit,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                )
                
                logger.debug(f"Cached {limit} {timeframe} candles for {symbol}")
                
            except Exception as e:
                logger.error(f"Error fetching {timeframe} OHLCV for {symbol}: {e}")
    
    async def calculate_and_cache_indicators(self, symbol: str):
        """
        Calculate technical indicators from cached OHLCV data.
        Uses both 15m and 1h timeframes for multi-timeframe analysis.
        """
        try:
            # Read both timeframes from Redis
            ohlcv_15m = await self.redis.get(f"market:{symbol}:ohlcv:15m")
            ohlcv_1h = await self.redis.get(f"market:{symbol}:ohlcv:1h")
            
            if not ohlcv_15m or not ohlcv_1h:
                logger.warning(f"Missing OHLCV data for {symbol}")
                return
            
            candles_15m = json.loads(ohlcv_15m)["candles"]
            candles_1h = json.loads(ohlcv_1h)["candles"]
            
            # Calculate indicators from 15m data (short-term)
            # In production, use libraries like ta-lib or pandas_ta
            indicators = {
                # Short-term indicators (15m)
                "short_term": {
                    "rsi_14": self._calculate_rsi(candles_15m, 14),
                    "sma_20": self._calculate_sma(candles_15m, 20),
                    "ema_12": self._calculate_ema(candles_15m, 12),
                    "ema_26": self._calculate_ema(candles_15m, 26),
                    "volume_avg_20": self._calculate_volume_avg(candles_15m, 20),
                    "macd": self._calculate_macd(candles_15m),
                },
                # Long-term indicators (1h)
                "long_term": {
                    "sma_50": self._calculate_sma(candles_1h, 50),
                    "sma_100": self._calculate_sma(candles_1h, 100),
                    "trend": self._calculate_trend(candles_1h),
                },
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Cache indicators (1 minute TTL)
            await self.redis.setex(
                f"market:{symbol}:indicators",
                60,
                json.dumps(indicators)
            )
            
            logger.debug(f"Calculated indicators for {symbol}")
            
        except Exception as e:
            logger.error(f"Error calculating indicators for {symbol}: {e}")
    
    def _calculate_change_pct(self, ticker: Dict) -> float:
        """Calculate 24h percentage change."""
        percentage = ticker.get("percentage")
        if percentage is not None:
            try:
                return round(float(percentage), 2)
            except (TypeError, ValueError):
                return 0.0
        try:
            change = float(ticker.get("info", {}).get("change24h", 0))
            last = float(ticker.get("last", 0) or 0)
            if last:
                return round((change / last) * 100, 2)
        except:
            pass
        return 0.0
    
    def _calculate_rsi(self, candles: List, period: int) -> float:
        """Calculate RSI (simplified)."""
        # TODO: Implement actual RSI calculation using ta-lib or pandas_ta
        return 50.0
    
    def _calculate_sma(self, candles: List, period: int) -> float:
        """Calculate Simple Moving Average."""
        # TODO: Implement actual SMA calculation
        return 0.0
    
    def _calculate_ema(self, candles: List, period: int) -> float:
        """Calculate Exponential Moving Average."""
        # TODO: Implement actual EMA calculation
        return 0.0
    
    def _calculate_volume_avg(self, candles: List, period: int) -> float:
        """Calculate average volume."""
        # TODO: Implement actual volume average calculation
        return 0.0
    
    def _calculate_macd(self, candles: List) -> Dict[str, float]:
        """Calculate MACD (Moving Average Convergence Divergence)."""
        # TODO: Implement MACD calculation
        return {
            "macd": 0.0,
            "signal": 0.0,
            "histogram": 0.0
        }
    
    def _calculate_trend(self, candles: List) -> str:
        """Determine overall trend from long-term candles."""
        # TODO: Implement trend detection (uptrend/downtrend/sideways)
        return "sideways"
    
    async def run_cycle(self):
        """Execute one market data refresh cycle."""
        start_time = datetime.utcnow()
        
        # 1. Fetch and cache ticker + orderbook + funding
        market_snapshot = await self.fetch_and_cache_market_data()
        
        # 2. Fetch and cache OHLCV for each symbol (15m + 1h timeframes)
        ohlcv_tasks = [
            self.fetch_and_cache_ohlcv(symbol) 
            for symbol in self.SYMBOLS
        ]
        await asyncio.gather(*ohlcv_tasks, return_exceptions=True)
        
        # 3. Calculate and cache indicators for each symbol
        indicator_tasks = [
            self.calculate_and_cache_indicators(symbol)
            for symbol in self.SYMBOLS
        ]
        await asyncio.gather(*indicator_tasks, return_exceptions=True)
        
        # 4. Broadcast to WebSocket clients
        if market_snapshot:
            await self.ws_manager.broadcast_market_data(market_snapshot)
        
        # Log performance
        duration = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"Market data cycle completed in {duration:.2f}s")
    
    async def start(self):
        """Start the market data refresh loop."""
        self._running = True
        logger.info(f"Starting market data scheduler (interval: {self.interval_seconds}s)")
        
        while self._running:
            try:
                await self.run_cycle()
            except Exception as e:
                logger.error(f"Error in market data scheduler: {e}")
            
            await asyncio.sleep(self.interval_seconds)
    
    async def stop(self):
        """Stop the market data refresh loop."""
        self._running = False
        logger.info("Stopping market data scheduler")
```

---

### 2. LLM Decision Scheduler (5-15 minute Loop)

**Responsibility**: Read cached data and make trading decisions

```python
# autotrade_service/schedulers/llm_decision_scheduler.py

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Any
from redis.asyncio import Redis
from ..brokers.base import BaseBroker
from ..pipelines.decision_pipeline import DecisionPipeline
from ..llm.prompt_builder import PromptBuilder
from ..feedback.feedback_engine import FeedbackEngine

logger = logging.getLogger(__name__)

class LLMDecisionScheduler:
    """
    Trading decision scheduler that runs every 5-15 minutes.
    Reads cached market data from Redis instead of making API calls.
    """
    
    def __init__(
        self,
        redis_client: Redis,
        broker: BaseBroker,
        decision_pipeline: DecisionPipeline,
        prompt_builder: PromptBuilder,
        feedback_engine: FeedbackEngine
    ):
        self.redis = redis_client
        self.broker = broker
        self.decision_pipeline = decision_pipeline
        self.prompt_builder = prompt_builder
        self.feedback_engine = feedback_engine
        self.interval_minutes = 5
        self._running = False
    
    async def fetch_market_data_from_cache(self) -> Dict[str, Any]:
        """
        Fetch all market data from Redis cache.
        This is FAST (milliseconds) compared to API calls (seconds).
        """
        symbols = [
            "BTC-USDT-SWAP",
            "ETH-USDT-SWAP",
            "SOL-USDT-SWAP"
        ]
        
        market_data = {}
        
        for symbol in symbols:
            try:
                # Read ticker from Redis
                ticker_data = await self.redis.get(f"market:{symbol}:ticker")
                orderbook_data = await self.redis.get(f"market:{symbol}:orderbook")
                funding_data = await self.redis.get(f"market:{symbol}:funding")
                ohlcv_15m_data = await self.redis.get(f"market:{symbol}:ohlcv:15m")
                ohlcv_1h_data = await self.redis.get(f"market:{symbol}:ohlcv:1h")
                indicators_data = await self.redis.get(f"market:{symbol}:indicators")
                
                # Check data freshness
                if not ticker_data:
                    logger.warning(f"No cached ticker data for {symbol}")
                    continue
                
                ticker = json.loads(ticker_data)
                
                # Check if data is stale (older than 30 seconds)
                ticker_age = self._calculate_data_age(ticker.get("timestamp"))
                if ticker_age > 30:
                    logger.warning(
                        f"Stale ticker data for {symbol}: {ticker_age}s old"
                    )
                
                market_data[symbol] = {
                    "ticker": ticker,
                    "orderbook": json.loads(orderbook_data) if orderbook_data else None,
                    "funding": json.loads(funding_data) if funding_data else None,
                    "ohlcv_15m": json.loads(ohlcv_15m_data) if ohlcv_15m_data else None,
                    "ohlcv_1h": json.loads(ohlcv_1h_data) if ohlcv_1h_data else None,
                    "indicators": json.loads(indicators_data) if indicators_data else None,
                }
                
                logger.debug(f"Loaded cached market data for {symbol}")
                
            except Exception as e:
                logger.error(f"Error reading cached data for {symbol}: {e}")
                continue
        
        return market_data
    
    def _calculate_data_age(self, timestamp_str: str) -> float:
        """Calculate age of data in seconds."""
        if not timestamp_str:
            return float('inf')
        
        try:
            data_time = datetime.fromisoformat(timestamp_str)
            age = (datetime.utcnow() - data_time).total_seconds()
            return age
        except:
            return float('inf')
    
    async def run_evaluation(self):
        """
        Execute one trading decision cycle.
        This is the HEAVY operation that takes 10-30 seconds.
        """
        start_time = datetime.utcnow()
        logger.info("Starting LLM evaluation cycle")
        
        try:
            # 1. Fetch market data from Redis (FAST - milliseconds)
            market_data = await self.fetch_market_data_from_cache()
            
            if not market_data:
                logger.error("No market data available in cache")
                return
            
            # 2. Get portfolio state from broker
            positions = await self.broker.get_positions()
            balance = await self.broker.get_balance()
            
            logger.info(f"Current balance: ${balance}, Positions: {len(positions)}")
            
            # 3. Build LLM prompt with cached market data
            prompt = self.prompt_builder.build_prompt(
                positions=positions,
                balance=balance,
                market_data=market_data
            )
            
            # 4. Get LLM decision (SLOW - this takes time)
            decisions = await self.decision_pipeline.get_decisions(prompt)
            
            logger.info(f"LLM returned {len(decisions)} decisions")
            
            # 5. Validate decisions with risk checks
            validated_decisions = await self._validate_decisions(decisions, balance)
            
            # 6. Execute validated decisions on OKX
            for decision in validated_decisions:
                try:
                    if decision.action == "buy":
                        order = await self.broker.place_order(
                            symbol=decision.symbol,
                            side="buy",
                            order_type="market",
                            quantity=decision.quantity
                        )
                        logger.info(f"BUY order placed: {order.order_id}")
                    
                    elif decision.action == "sell" or decision.action == "close":
                        order = await self.broker.close_position(decision.symbol)
                        logger.info(f"CLOSE order placed: {order.order_id}")
                
                except Exception as e:
                    logger.error(f"Error executing decision: {e}")
            
            # 7. Update feedback loop with results
            await self.feedback_engine.record_decisions(decisions)
            
            # 8. Log performance metrics
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.info(f"Evaluation cycle completed in {duration:.2f}s")
            
        except Exception as e:
            logger.error(f"Error in evaluation cycle: {e}", exc_info=True)
    
    async def _validate_decisions(self, decisions: List, balance: float) -> List:
        """Apply risk management rules to decisions."""
        validated = []
        
        for decision in decisions:
            # Check confidence threshold
            if decision.confidence < 0.6:
                logger.info(f"Skipping {decision.symbol}: confidence too low")
                continue
            
            # Check position size limits
            max_position_size = balance * 0.5  # Max 50% of equity
            if decision.notional_value > max_position_size:
                logger.warning(f"Position size too large for {decision.symbol}")
                continue
            
            # Check leverage limits
            if decision.leverage > 10:
                logger.warning(f"Leverage too high for {decision.symbol}")
                continue
            
            validated.append(decision)
        
        return validated
    
    async def start(self, interval_minutes: int = 5):
        """Start the LLM decision loop."""
        self.interval_minutes = interval_minutes
        self._running = True
        
        logger.info(
            f"Starting LLM decision scheduler (interval: {interval_minutes} minutes)"
        )
        
        while self._running:
            try:
                await self.run_evaluation()
            except Exception as e:
                logger.error(f"Error in LLM scheduler: {e}")
            
            await asyncio.sleep(interval_minutes * 60)
    
    async def stop(self):
        """Stop the LLM decision loop."""
        self._running = False
        logger.info("Stopping LLM decision scheduler")
```

---

### 3. WebSocket Manager for Real-Time Price Updates

**Responsibility**: Broadcast market data to frontend clients

```python
# autotrade_service/websocket/market_data_ws.py

import json
import logging
from typing import Dict, Set, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for real-time market data.
    Broadcasts price updates to all connected clients.
    """
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove disconnected WebSocket."""
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast_market_data(self, market_snapshot: Dict[str, Any]):
        """
        Broadcast market data to all connected clients.
        Called by MarketDataScheduler every 5 seconds.
        """
        if not self.active_connections:
            return
        
        message = {
            "type": "market_update",
            "data": market_snapshot,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Send to all clients
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)
    
    async def send_personal_message(self, message: Dict, websocket: WebSocket):
        """Send message to specific client."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

# Global instance
connection_manager = ConnectionManager()
```

---

### 4. FastAPI Integration

**Responsibility**: Coordinate schedulers and WebSocket endpoint

```python
# autotrade_service/main.py

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .schedulers.market_data_scheduler import MarketDataScheduler
from .schedulers.llm_decision_scheduler import LLMDecisionScheduler
from .websocket.market_data_ws import connection_manager
from .exchanges.okx.client import OKXRestClient
from .brokers.factory import create_broker
from .pipelines.decision_pipeline import DecisionPipeline
from .llm.prompt_builder import PromptBuilder
from .feedback.feedback_engine import FeedbackEngine
from .config import settings

logger = logging.getLogger(__name__)

# Background task references
market_data_task = None
llm_decision_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Starts both schedulers as background tasks on startup.
    """
    global market_data_task, llm_decision_task
    
    logger.info("Starting Auto-Trading Service...")
    
    # Initialize Redis
    redis_client = Redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True
    )
    
    # Initialize OKX client
    okx_client = OKXRestClient(
        api_key=settings.okx_api_key,
        secret_key=settings.okx_secret_key,
        passphrase=settings.okx_passphrase,
        base_url=settings.okx_base_url,
        demo_mode=settings.okx_demo_mode
    )
    
    # Initialize broker
    broker = create_broker(settings)
    await broker.initialize()
    
    # Initialize decision pipeline
    decision_pipeline = DecisionPipeline(settings)
    prompt_builder = PromptBuilder(settings)
    feedback_engine = FeedbackEngine(settings)
    
    # Create schedulers
    market_scheduler = MarketDataScheduler(
        redis_client=redis_client,
        okx_client=okx_client,
        websocket_manager=connection_manager
    )
    
    llm_scheduler = LLMDecisionScheduler(
        redis_client=redis_client,
        broker=broker,
        decision_pipeline=decision_pipeline,
        prompt_builder=prompt_builder,
        feedback_engine=feedback_engine
    )
    
    # Start both schedulers as background tasks
    market_data_task = asyncio.create_task(market_scheduler.start())
    llm_decision_task = asyncio.create_task(
        llm_scheduler.start(interval_minutes=settings.llm_interval_minutes)
    )
    
    logger.info("✅ Market Data Scheduler started (5s interval)")
    logger.info(f"✅ LLM Decision Scheduler started ({settings.llm_interval_minutes}min interval)")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down Auto-Trading Service...")
    
    await market_scheduler.stop()
    await llm_scheduler.stop()
    
    market_data_task.cancel()
    llm_decision_task.cancel()
    
    await broker.close()
    await okx_client.close()
    await redis_client.close()
    
    logger.info("✅ Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="Auto-Trading Service",
    description="LLM-driven crypto auto-trading with real-time market data",
    version="1.0.0",
    lifespan=lifespan
)

# WebSocket endpoint for real-time market data
@app.websocket("/ws/market-data")
async def websocket_market_data(websocket: WebSocket):
    """
    WebSocket endpoint for real-time price updates.
    Frontend connects here to receive market data every 5 seconds.
    """
    await connection_manager.connect(websocket)
    
    try:
        while True:
            # Keep connection alive
            # Actual data is broadcast by MarketDataScheduler
            data = await websocket.receive_text()
            
            # Handle client messages (ping/pong, etc.)
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(websocket)

# REST API endpoints
@app.get("/api/autotrade/v1/portfolio")
async def get_portfolio():
    """Get current portfolio snapshot."""
    # Existing implementation
    pass

@app.get("/api/market/v1/prices")
async def get_current_prices():
    """
    Get current prices from Redis cache.
    Alternative to WebSocket for simple HTTP polling.
    """
    redis_client = Redis.from_url(settings.redis_url)
    
    symbols = [
        "BTC-USDT-SWAP",
        "ETH-USDT-SWAP",
        "SOL-USDT-SWAP",
        "BNB-USDT-SWAP",
        "DOGE-USDT-SWAP",
        "XRP-USDT-SWAP"
    ]
    
    prices = {}
    for symbol in symbols:
        ticker_data = await redis_client.get(f"market:{symbol}:ticker")
        if ticker_data:
            ticker = json.loads(ticker_data)
            prices[symbol] = {
                "price": ticker.get("last_price"),
                "change_pct_24h": ticker.get("change_pct_24h")
            }
    
    await redis_client.close()
    return prices

@app.post("/api/autotrade/v1/evaluate")
async def trigger_evaluation():
    """Manually trigger LLM evaluation (for testing)."""
    # Existing implementation
    pass

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "schedulers": {
            "market_data": "running" if market_data_task and not market_data_task.done() else "stopped",
            "llm_decision": "running" if llm_decision_task and not llm_decision_task.done() else "stopped"
        }
    }
```

---

### 5. Frontend: Real-Time Price Banner Component

**Responsibility**: Display live crypto prices like Alpha Arena

```tsx
// equity-insight-react/src/components/PriceBanner.tsx

import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface CryptoPrice {
  symbol: string;
  price: number;
  change_pct_24h: number;
  volume_24h: number;
}

interface MarketData {
  [key: string]: CryptoPrice;
}

const SYMBOL_DISPLAY = {
  'BTC-USDT-SWAP': { name: 'BTC', icon: '₿' },
  'ETH-USDT-SWAP': { name: 'ETH', icon: 'Ξ' },
  'SOL-USDT-SWAP': { name: 'SOL', icon: '◎' },
  'BNB-USDT-SWAP': { name: 'BNB', icon: '🔶' },
  'DOGE-USDT-SWAP': { name: 'DOGE', icon: 'Ð' },
  'XRP-USDT-SWAP': { name: 'XRP', icon: 'ⓧ' },
};

export const PriceBanner: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketData>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Establish WebSocket connection
    const websocket = new WebSocket('ws://localhost:8000/ws/market-data');

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      
      // Send ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send('ping');
        }
      }, 30000);

      websocket.addEventListener('close', () => {
        clearInterval(pingInterval);
      });
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'market_update') {
          setMarketData(message.data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        window.location.reload();
      }, 5000);
    };

    setWs(websocket);

    // Cleanup on unmount
    return () => {
      websocket.close();
    };
  }, []);

  const formatPrice = (price: number, symbol: string): string => {
    if (symbol.includes('DOGE')) {
      return `$${price.toFixed(4)}`;
    } else if (price > 1000) {
      return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    } else {
      return `$${price.toFixed(2)}`;
    }
  };

  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  return (
    <div className="bg-gray-900 border-b border-gray-800 py-2 px-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Connection Status */}
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              wsConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-gray-400">
            {wsConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>

        {/* Price Ticker */}
        <div className="flex items-center gap-6 overflow-x-auto">
          {Object.entries(SYMBOL_DISPLAY).map(([symbol, display]) => {
            const data = marketData[symbol];
            
            if (!data) {
              return (
                <div key={symbol} className="flex items-center gap-2 animate-pulse">
                  <div className="w-12 h-4 bg-gray-800 rounded" />
                </div>
              );
            }

            const isPositive = data.change_pct_24h >= 0;

            return (
              <div
                key={symbol}
                className="flex items-center gap-3 min-w-fit"
              >
                {/* Icon */}
                <span className="text-lg">{display.icon}</span>

                {/* Symbol Name */}
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-gray-400">
                    {display.name}
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatPrice(data.price, symbol)}
                  </span>
                </div>

                {/* Change */}
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    isPositive
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-red-900/30 text-red-400'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )}
                  <span>{formatChange(data.change_pct_24h)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Placeholder for right side */}
        <div className="w-20" />
      </div>
    </div>
  );
};

export default PriceBanner;
```

```tsx
// equity-insight-react/src/App.tsx

import React from 'react';
import { PriceBanner } from './components/PriceBanner';
import { AutoTradingDashboard } from './components/AutoTradingDashboard';

function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Price Banner at the top */}
      <PriceBanner />
      
      {/* Main content */}
      <div className="container mx-auto px-4 py-6">
        <AutoTradingDashboard />
      </div>
    </div>
  );
}

export default App;
```

---

## Configuration

```yaml
# config/trading.yaml

redis:
  url: "redis://localhost:6379"
  
okx:
  demo_mode: true
  api_key: "${OKX_DEMO_API_KEY}"
  secret_key: "${OKX_DEMO_SECRET_KEY}"
  passphrase: "${OKX_DEMO_PASSPHRASE}"
  base_url: "https://www.okx.com"

schedulers:
  market_data:
    enabled: true
    interval_seconds: 5
    symbols:
      - "BTC-USDT-SWAP"
      - "ETH-USDT-SWAP"
      - "SOL-USDT-SWAP"
      - "BNB-USDT-SWAP"
      - "DOGE-USDT-SWAP"
      - "XRP-USDT-SWAP"
    
    # Redis cache TTLs
    cache_ttl:
      ticker: 10        # 10 seconds
      orderbook: 10     # 10 seconds
      funding: 300      # 5 minutes
      ohlcv_15m: 60     # 1 minute (15m candles)
      ohlcv_1h: 300     # 5 minutes (1h candles)
      indicators: 60    # 1 minute
    
    # OHLCV settings
    ohlcv:
      short_term_timeframe: "15m"
      short_term_candles: 50    # ~12.5 hours of data
      long_term_timeframe: "1h"
      long_term_candles: 100    # ~4.2 days of data
  
  llm_decision:
    enabled: true
    interval_minutes: 5
    max_stale_data_seconds: 30  # Warn if cached data is older than this
    
broker:
  type: "okx_demo"  # simulated | okx_demo | okx_live

trading:
  symbols:
    - "BTC-USDT-SWAP"
    - "ETH-USDT-SWAP"
  max_position_size_pct: 50
  confidence_threshold: 0.6
  max_leverage: 10
```

---

## Market Data Collected by Scheduler

The Market Data Scheduler fetches and caches the following data for each symbol every 5 seconds:

### **Data Summary Table**

| # | Data Type | Redis Key Pattern | Content | Refresh Rate |
|---|-----------|------------------|---------|--------------|
| 1 | **Ticker** | `market:{symbol}:ticker` | Current price, bid, ask, 24h volume, 24h high/low, 24h change %, timestamp | Every 5s |
| 2 | **Orderbook** | `market:{symbol}:orderbook` | Top 20 bid levels, top 20 ask levels, timestamp | Every 5s |
| 3 | **Funding Rate** | `market:{symbol}:funding` | Current funding rate, next funding time, timestamp | Every 5s |
| 4 | **OHLCV 15m** | `market:{symbol}:ohlcv:15m` | 50 candles (~12.5 hours), [timestamp, open, high, low, close, volume] | Every 5s |
| 5 | **OHLCV 1h** | `market:{symbol}:ohlcv:1h` | 100 candles (~4.2 days), [timestamp, open, high, low, close, volume] | Every 5s |
| 6 | **Indicators** | `market:{symbol}:indicators` | Short-term: RSI, SMA, EMA, MACD, volume avg<br>Long-term: SMA 50/100, trend | Every 5s |

**Symbols Tracked**: BTC-USDT-SWAP, ETH-USDT-SWAP, SOL-USDT-SWAP, BNB-USDT-SWAP, DOGE-USDT-SWAP, XRP-USDT-SWAP

**Total Redis Keys**: 6 symbols × 6 data types = **36 keys** updated every 5 seconds

### **Detailed Data Breakdown**

<details>
<summary>Click to expand detailed breakdown of each data type</summary>

#### **1. Ticker Data**
- Current price (last traded)
- Bid price
- Ask price  
- 24h volume
- 24h high
- 24h low
- 24h change (absolute)
- 24h change percentage
- Timestamp

#### **2. Orderbook**
- Top 20 bid levels [price, quantity]
- Top 20 ask levels [price, quantity]
- Timestamp

#### **3. Funding Rate**
- Current funding rate
- Next funding time
- Timestamp

#### **4. Short-term OHLCV - 15-minute Candles**
- 50 candles (last ~12.5 hours)
- Each candle: [timestamp, open, high, low, close, volume]
- Timeframe: "15m"

#### **5. Long-term OHLCV - 1-hour Candles**
- 100 candles (last ~4.2 days)
- Each candle: [timestamp, open, high, low, close, volume]
- Timeframe: "1h"

#### **6. Technical Indicators**
**Short-term** (calculated from 15m candles):
- RSI (14-period)
- SMA (20-period)
- EMA (12-period, 26-period)
- Volume average (20-period)
- MACD (line, signal, histogram)

**Long-term** (calculated from 1h candles):
- SMA (50-period, 100-period)
- Trend detection (uptrend/downtrend/sideways)

</details>

---

## Redis Cache TTL Strategy

### **Time-to-Live (TTL) Configuration**

| Data Type | Redis Key Pattern | TTL | Refresh Rate | Rationale |
|-----------|------------------|-----|--------------|-----------|
| **Ticker** | `market:{symbol}:ticker` | **10 seconds** | Every 5s | High-frequency price updates, needs to be very fresh |
| **Orderbook** | `market:{symbol}:orderbook` | **10 seconds** | Every 5s | Rapidly changing order levels |
| **Funding Rate** | `market:{symbol}:funding` | **300 seconds** (5 min) | Every 5s | Updates every 8h on exchange, less time-sensitive |
| **OHLCV 15m** | `market:{symbol}:ohlcv:15m` | **60 seconds** (1 min) | Every 5s | Short-term analysis data |
| **OHLCV 1h** | `market:{symbol}:ohlcv:1h` | **300 seconds** (5 min) | Every 5s | Long-term trend data |
| **Indicators** | `market:{symbol}:indicators` | **60 seconds** (1 min) | Every 5s | Calculated data for decision-making |

### **Data Freshness Timeline**

```
Timeline Example (Ticker Data):
─────────────────────────────────────────────────────────────────
00:00:00  Scheduler writes ticker (TTL: 10s) → Expires at 00:00:10
00:00:05  Scheduler refreshes ticker (TTL: 10s) → Expires at 00:00:15
00:00:10  Scheduler refreshes ticker (TTL: 10s) → Expires at 00:00:20
00:00:15  Scheduler refreshes ticker (TTL: 10s) → Expires at 00:00:25
...
If scheduler fails at 00:00:15:
  - Data remains valid until 00:00:25
  - After 00:00:25, Redis auto-expires the key
  - LLM Scheduler detects missing data → Fallback to direct API
```

### **Why Different TTLs?**

**Short TTL (10-60 seconds):**
- ✅ Ticker & Orderbook (10s): Change rapidly second-by-second
- ✅ Indicators & 15m OHLCV (60s): Used for immediate trading decisions
- ✅ Fresh data critical for accurate LLM decisions

**Longer TTL (5 minutes):**
- ✅ Funding Rate (300s): Only updates every 8 hours on exchange
- ✅ 1h OHLCV (300s): Trend data, less time-sensitive
- ✅ Reduces Redis memory pressure

### **Safety Mechanisms**

1. **Auto-expiration**: Stale data automatically removed if scheduler fails
2. **Overlap protection**: Data refreshed every 5s, TTL is 10-300s (always renewed before expiry)
3. **Staleness detection**: LLM Scheduler checks timestamp and warns if data >30s old
4. **Graceful degradation**: Falls back to direct OKX API calls on cache miss

### **Memory Footprint**

Estimated Redis memory usage per symbol:
- Ticker: ~500 bytes
- Orderbook: ~2 KB (20 bids + 20 asks)
- Funding: ~200 bytes
- OHLCV 15m: ~5 KB (50 candles)
- OHLCV 1h: ~10 KB (100 candles)
- Indicators: ~500 bytes

**Total per symbol**: ~18 KB  
**Total for 6 symbols**: ~108 KB (negligible Redis memory usage)

---

## Redis Data Structure

```
# Ticker data (refreshed every 5s, TTL 10s)
market:BTC-USDT-SWAP:ticker = {
  "symbol": "BTC-USDT-SWAP",
  "last_price": "101042.50",
  "bid": "101040.00",
  "ask": "101045.00",
  "volume_24h": "125000000",
  "high_24h": "108500.00",
  "low_24h": "100000.00",
  "change_24h": "-7000.50",
  "change_pct_24h": "-6.52",
  "timestamp": "2025-11-08T11:46:00.000Z"
}

# Orderbook (refreshed every 5s, TTL 10s)
market:BTC-USDT-SWAP:orderbook = {
  "bids": [["101040.00", "2.5"], ["101035.00", "5.0"], ...],
  "asks": [["101045.00", "1.8"], ["101050.00", "3.2"], ...],
  "timestamp": "2025-11-08T11:46:00.000Z"
}

# Funding rate (refreshed every 5s, TTL 300s)
market:BTC-USDT-SWAP:funding = {
  "funding_rate": "0.0001",
  "next_funding_time": "2025-11-08T12:00:00.000Z",
  "timestamp": "2025-11-08T11:46:00.000Z"
}

# 15-minute OHLCV candles (refreshed every 5s, TTL 60s, 50 candles)
market:BTC-USDT-SWAP:ohlcv:15m = {
  "candles": [
    ["1699445100000", "101000", "101100", "100950", "101050", "1250"],
    ["1699445000000", "100950", "101020", "100900", "101000", "1180"],
    ... # 50 total candles (~12.5 hours of data)
  ],
  "timeframe": "15m",
  "limit": 50,
  "timestamp": "2025-11-08T11:46:00.000Z"
}

# 1-hour OHLCV candles (refreshed every 5s, TTL 300s, 100 candles)
market:BTC-USDT-SWAP:ohlcv:1h = {
  "candles": [
    ["1699444800000", "101500", "101800", "101200", "101600", "5200"],
    ["1699441200000", "101200", "101550", "101100", "101500", "4800"],
    ... # 100 total candles (~4.2 days of data)
  ],
  "timeframe": "1h",
  "limit": 100,
  "timestamp": "2025-11-08T11:46:00.000Z"
}

# Technical indicators (calculated every 5s, TTL 60s)
market:BTC-USDT-SWAP:indicators = {
  "short_term": {
    "rsi_14": 52.3,
    "sma_20": 101500.25,
    "ema_12": 101200.50,
    "ema_26": 101100.30,
    "volume_avg_20": 1500000,
    "macd": {
      "macd": 125.5,
      "signal": 110.2,
      "histogram": 15.3
    }
  },
  "long_term": {
    "sma_50": 102000.75,
    "sma_100": 103500.20,
    "trend": "downtrend"
  },
  "timestamp": "2025-11-08T11:46:00.000Z"
}
```

---

## Deployment & Operations

### Local Development

```bash
# 1. Start Redis
brew services start redis

# 2. Set environment variables
export OKX_DEMO_API_KEY=your-key
export OKX_DEMO_SECRET_KEY=your-secret
export OKX_DEMO_PASSPHRASE=your-passphrase
export REDIS_URL=redis://localhost:6379

# 3. Start backend (both schedulers start automatically)
cd python-auto-trade
PYTHONPATH=src uvicorn autotrade_service.main:app --reload

# 4. Start frontend
cd equity-insight-react
npm run dev
```

### Monitoring

```bash
# Check Redis keys
redis-cli keys "market:*"

# Monitor market data updates
redis-cli monitor | grep "market:"

# Check WebSocket connections
curl http://localhost:8000/health

# View scheduler status
tail -f logs/autotrade.log | grep -E "Market data cycle|Evaluation cycle"
```

---

## Performance Characteristics

| Metric | Market Data Scheduler | LLM Decision Scheduler |
|--------|----------------------|------------------------|
| **Frequency** | Every 5 seconds | Every 5-15 minutes |
| **Duration** | 0.5-2 seconds | 10-30 seconds |
| **API Calls/min** | 12-24 (OKX market data) | 0 (reads from Redis) |
| **CPU Usage** | Low (~5%) | High (~40-60%) |
| **Memory** | ~50MB | ~200-500MB |
| **Network I/O** | ~1-2 KB/s | ~100 KB per cycle |
| **Redis Ops/min** | ~72 writes | ~6 reads |

---

## Benefits of This Architecture

1. ✅ **Decoupled data collection from decision-making**
2. ✅ **Real-time price updates every 5 seconds** without blocking LLM
3. ✅ **LLM reads from fast Redis cache** (milliseconds vs seconds)
4. ✅ **No API rate limit pressure** during decision time
5. ✅ **Frontend gets live updates** via WebSocket
6. ✅ **Independent scaling** of each component
7. ✅ **Graceful degradation** if OKX API is temporarily down
8. ✅ **Low latency** for user-facing price display

---

## Implementation Checklist

### Phase 1: Redis Infrastructure Setup
- [x] Install and configure Redis on development machine
  - [x] `brew install redis` (macOS) or equivalent
  - [x] Start Redis service: `brew services start redis`
  - [x] Verify Redis is running: `redis-cli ping`
- [x] Add Redis connection configuration
  - [x] Add `REDIS_URL` to environment variables
  - [x] Create Redis client initialization in `main.py`
  - [x] Implement connection pooling
  - [x] Add connection health check
- [x] Test Redis connectivity
  - [x] Write unit test for Redis connection
  - [x] Test basic set/get operations
  - [x] Test TTL expiration behavior

### Phase 2: Market Data Scheduler Implementation
- [x] Create scheduler infrastructure
  - [x] Create `schedulers/` directory structure
  - [x] Implement `MarketDataScheduler` class
  - [x] Add logging configuration for scheduler
  - [x] Implement graceful shutdown handling
- [x] Implement OKX API integration
  - [x] Create `OKXRestClient` wrapper (if not exists)
  - [x] Implement `get_ticker()` method
  - [x] Implement `get_orderbook()` method
  - [x] Implement `get_funding_rate()` method
  - [x] Implement `get_candlesticks()` method with timeframe parameter
  - [x] Add rate limiting protection
  - [x] Add error handling and retries
- [x] Implement Redis caching logic
  - [x] Cache ticker data with 10s TTL
  - [x] Cache orderbook data with 10s TTL
  - [x] Cache funding rate with 300s TTL
  - [x] Cache 15m OHLCV data (50 candles) with 60s TTL
  - [x] Cache 1h OHLCV data (100 candles) with 300s TTL
  - [x] Implement JSON serialization/deserialization
  - [x] Add data validation before caching
- [x] Implement technical indicators
  - [x] Calculate short-term indicators from 15m candles
    - [x] RSI (14-period)
    - [x] SMA (20-period)
    - [x] EMA (12-period and 26-period)
    - [x] Volume average (20-period)
    - [x] MACD (12, 26, 9)
  - [x] Calculate long-term indicators from 1h candles
    - [x] SMA (50-period and 100-period)
    - [x] Trend detection (uptrend/downtrend/sideways)
  - [x] Cache indicators with 60s TTL
- [x] Add performance monitoring
  - [x] Log cycle completion time
  - [x] Track API call success/failure rates
  - [x] Monitor Redis write operations
  - [x] Add alerting for failures
- [x] Testing
  - [x] Unit test for `MarketDataScheduler`
  - [x] Test Redis caching behavior
  - [x] Test error handling and retries
  - [x] Load test with multiple symbols

### Phase 3: LLM Decision Scheduler Refactoring
- [x] Create LLM scheduler infrastructure
  - [x] Create `LLMDecisionScheduler` class
  - [x] Move existing scheduler logic to new class (shared `decision_runner`)
  - [x] Implement configurable interval (5-15 minutes)
  - [x] Add graceful shutdown handling
- [x] Implement Redis cache reading
  - [x] Read ticker data from Redis
  - [x] Read orderbook data from Redis
  - [x] Read funding rate from Redis
  - [x] Read 15m OHLCV data from Redis
  - [x] Read 1h OHLCV data from Redis
  - [x] Read indicators (short-term + long-term) from Redis
  - [x] Implement fallback to direct API calls if cache miss
- [ ] Add data freshness validation
  - [x] Check timestamp on cached data
  - [x] Warn if data is stale (>30 seconds)
  - [ ] Reject data if too old (>60 seconds)
  - [x] Log data age metrics
- [x] Refactor prompt builder / pipeline integration
  - [x] Update decision pipeline to accept cached market data structure
  - [x] Remove direct API dependency for cached symbols
  - [x] Ensure backward compatibility
- [ ] Update risk validation
  - [ ] Use cached data for position size calculations
  - [ ] Validate confidence thresholds
  - [ ] Check leverage limits
- [ ] Testing
  - [x] Unit test for `LLMDecisionScheduler`
  - [x] Integration test with Redis cache behaviour (mocked)
  - [x] Test with stale data scenarios
  - [ ] Test fallback to API calls

### Phase 4: WebSocket Implementation
- [x] Create WebSocket infrastructure
  - [x] Create `websocket/` directory structure
  - [x] Implement `ConnectionManager` class
  - [x] Add connection tracking
  - [x] Implement broadcast functionality
- [x] Implement WebSocket endpoint
  - [x] Create `/ws/market-data` endpoint in FastAPI
  - [x] Handle connection establishment
  - [x] Handle disconnection cleanup
  - [ ] Implement ping/pong for keep-alive (responds to ping but no proactive pings)
- [x] Integrate with Market Data Scheduler
  - [x] Call `broadcast_market_data()` after each cycle
  - [x] Format data for frontend consumption
  - [x] Handle broadcast errors gracefully
  - [ ] Log broadcast metrics
- [x] Add connection management
  - [x] Track active connections
  - [x] Clean up dead connections
  - [ ] Implement connection limits (if needed)
  - [ ] Add connection authentication (optional)
- [ ] Testing
  - [x] Unit test for `ConnectionManager`
  - [x] Integration test for WebSocket endpoint
  - [x] Test multiple concurrent connections
  - [x] Test reconnection behavior
  - [ ] Load test with many clients

- [x] Create REST API endpoints
  - [x] `GET /api/market/v1/prices` - Get current prices from cache
  - [x] `GET /health` - Health check with scheduler status (via `/healthz`/`/readyz`)
  - [x] Update existing `/api/autotrade/v1/portfolio` endpoint
- [ ] Add configuration management
  - [x] Load Redis URL from config
  - [x] Load scheduler intervals from config
  - [x] Load symbol list from config
  - [x] Load cache TTL settings from config
- [ ] Add logging configuration
  - [ ] Configure structured logging
  - [ ] Set appropriate log levels
  - [ ] Add request ID tracking
  - [ ] Configure log rotation
- [x] Testing
  - [x] Integration test for full application startup
  - [x] Test scheduler lifecycle
  - [x] Test endpoint responses
  - [x] Test graceful shutdown

### Phase 6: Frontend Price Banner Component
- [x] Create React component structure
  - [x] Create `components/PriceBanner.tsx`
  - [x] Set up TypeScript interfaces for market data
  - [x] Create component state management
- [x] Implement WebSocket connection
  - [x] Connect to `ws://localhost:8000/ws/market-data`
  - [x] Handle connection open/close events
  - [x] Implement message parsing
  - [x] Add reconnection logic
  - [x] Implement ping/pong keep-alive
- [x] Design UI components
  - [x] Create price card for each crypto
  - [x] Add crypto icons/symbols
  - [x] Implement color coding (green/red)
  - [x] Add up/down arrow indicators
  - [x] Create connection status indicator
  - [x] Make responsive for mobile
- [x] Add data formatting
  - [x] Format prices based on magnitude
  - [x] Format percentage changes with sign
  - [x] Handle decimal places appropriately
  - [x] Add thousand separators
- [x] Implement error handling
  - [x] Handle WebSocket connection failures
  - [x] Show loading state while connecting
  - [x] Display error state if disconnected
  - [x] Auto-reconnect on disconnect
- [x] Add animations (optional)
  - [x] Price flash on update
  - [x] Smooth color transitions
  - [x] Loading skeleton states
- [x] Integrate into main app
  - [x] Add `PriceBanner` to `App.tsx`
  - [x] Position at top of page
  - [x] Ensure z-index layering
  - [x] Test with other components
- [ ] Testing
  - [x] Component unit tests
  - [x] WebSocket integration tests
  - [ ] Visual regression tests
  - [ ] Cross-browser compatibility

### Phase 7: Configuration & Environment
- [x] Create configuration files
  - [x] Create `config/trading.yaml`
  - [x] Define scheduler intervals
- [x] Define symbol lists
  - [x] Add `AUTOTRADE_LLM_TRADING_SYMBOLS` to restrict LLM assessments when needed
  - [x] Define cache TTL settings
  - [x] Define broker settings
- [x] Set up environment variables
  - [x] `REDIS_URL` for Redis connection
  - [x] `CCXT_EXCHANGE_ID`, `CCXT_API_KEY`, `CCXT_SECRET`, `CCXT_PASSWORD`
  - [x] `TRADING_BROKER` for broker selection
- [x] Create `.env.example`
  - [x] Document all required variables
  - [x] Provide example values
  - [x] Add setup instructions
- [ ] Update documentation
  - [x] Add setup guide to README
  - [x] Document configuration options
  - [x] Add troubleshooting section

### Phase 8: Testing & Quality Assurance
- [x] Unit tests
  - [x] Test `MarketDataScheduler` logic
  - [x] Test `LLMDecisionScheduler` logic
  - [x] Test `ConnectionManager` logic
  - [x] Test Redis cache operations
  - [x] Test data serialization/deserialization
- [x] Integration tests
  - [x] Test full scheduler workflow
  - [x] Test Redis caching flow
  - [x] Test WebSocket communication
  - [x] Test frontend-backend integration
  - [x] Test with actual OKX demo API
- [ ] Performance tests
  - [ ] Measure scheduler cycle times
  - [ ] Test Redis throughput
  - [ ] Test WebSocket scalability
  - [ ] Monitor memory usage
  - [ ] Check CPU utilization
- [ ] Error scenario tests
  - [ ] Test Redis connection failure
  - [ ] Test OKX API failure
  - [ ] Test WebSocket disconnect/reconnect
  - [ ] Test stale data handling
  - [ ] Test rate limit scenarios
- [ ] End-to-end tests
  - [ ] Test complete market data flow
  - [ ] Test LLM decision making with cached data
  - [ ] Test frontend price updates
  - [ ] Test manual evaluation trigger

#### Phase 8 Test Strategy
- **Primary goal**: prove that cached market data stays fresh (<30s), LLM decisions never ingest stale payloads, and the React price banner matches server state in near real-time.
- **Environments**:
  - `python-auto-trade`: Python 3.11 virtualenv, local Redis (`brew services start redis`), `.env` populated with OKX demo keys.
  - `equity-insight-react`: Node 20 LTS, `npm install`, `.env.local` that points `VITE_WS_URL=ws://localhost:8000/ws/market-data`.
  - Optional staging box with access to OKX demo REST/WebSocket endpoints for live smoke tests.
- **Exit criteria**: 0 failing tests, scheduler cycle time p95 < 1.5s for 6 symbols, Redis hit-rate ≥ 95%, WebSocket broadcast latency < 250 ms, manual UAT sign-off recorded in `docs/testing-log.md`.

#### Command matrix
| Layer | Directory | Command | Notes |
| --- | --- | --- | --- |
| Python unit tests | `learncodex/python-auto-trade` | `python -m pytest tests/test_market_data_scheduler.py tests/test_llm_decision_scheduler.py tests/test_websocket_manager.py tests/test_redis_client.py tests/test_market_pipeline.py` | Run inside activated venv; export `PYTHONPATH=src`. |
| Python integration | `learncodex/python-auto-trade` | `python -m pytest tests/test_app_lifecycle.py tests/test_websocket_endpoint.py tests/test_feedback_loop_integration.py tests/test_feedback_engine.py` | Requires Redis + mocked OKX (set `AUTOTRADE_ENABLE_OKX=false`). |
| OKX demo smoke | `learncodex/python-auto-trade` | `AUTOTRADE_OKX_LIVE_SMOKE=1 python -m pytest tests/test_okx_derivatives.py -k "live_smoke"` | Hits real OKX endpoints via CCXT; ensure `.env` has OKX symbol map and respect rate limits. |
| Frontend unit/UI | `learncodex/equity-insight-react` | `npm run test -- PriceBanner` | Runs Vitest in CI mode; uses JSDOM WebSocket mock. |
| WebSocket soak | `learncodex/python-auto-trade` | `python -m pytest tests/test_websocket_endpoint.py -k "broadcast_load" --maxfail=1 --durations=10` | Add a new `@pytest.mark.load` case (`test_broadcast_load`) that spins up N fake clients; scale via `WS_LOAD_CLIENTS=200`. |
| End-to-end smoke | repo root | `./learncodex/python-auto-trade/scripts/test_feedback_loop_manual.py --symbols BTC-USDT-SWAP,ETH-USDT-SWAP` | Spins schedulers, runs LLM decision cycle, validates Redis + banner payloads. |

#### Detailed execution plan

1. **Unit tests**
   - `MarketDataScheduler` (`tests/test_market_data_scheduler.py`): validate ticker/orderbook/funding caching, indicator calculation, and broadcast snapshot ledger on multi-symbol runs; inject clock skew via monkeypatch to prove TTL handling.
   - `LLMDecisionScheduler` (`tests/test_llm_decision_scheduler.py`): cover stale-data detection thresholds, fallback to API path when cache misses occur, and prompts fed into pipeline; add fixtures for `market:SYMBOL:indicators` to verify structure.
   - `ConnectionManager` (`tests/test_websocket_manager.py`): assert `connect`, `disconnect`, `broadcast_market_data`, and ping/pong flows; include concurrency test with ≥32 fake websockets to reveal race conditions.
   - Redis client + serialization (`tests/test_redis_client.py`, `tests/test_market_pipeline.py`): confirm JSON payload schema, ensure floats survive round-trip, and TTL metadata is stored/parsed correctly.
   - Frontend component (`equity-insight-react/src/components/trading/__tests__/PriceBanner.test.tsx`): expand coverage for reconnect logic, delta-color transitions, and fallback HTTP fetch when the socket is unavailable.

2. **Integration tests**
   - Enable both schedulers inside the FastAPI app using `tests/test_app_lifecycle.py`; ensure startup/shutdown signals stop background tasks cleanly.
   - Run `tests/test_websocket_endpoint.py` to reproduce subscription lifecycle along with real Redis data seeded via fixtures; capture `ConnectionManager.active_connections` metrics.
   - Validate Redis caching flow with `tests/test_feedback_loop_integration.py` and `tests/test_feedback_engine.py`, focusing on how LLM decisions consume cached payloads.
   - For OKX demo verification, set `AUTOTRADE_OKX_SYMBOL_MAPPING='BTC-USDT-SWAP:BTC-USDT-SWAP'` and run `tests/test_okx_derivatives.py` against demo credentials to ensure funding/open-interest snapshots serialize as expected.

3. **Performance tests**
   - Add a perf-focused case (`test_scheduler_cycle_timing`, marked `@pytest.mark.perf`) inside `tests/test_scheduler.py` that runs full market cycles for 2/4/6 symbols, then execute `python -m pytest tests/test_scheduler.py -m perf --durations=0` with `MARKET_DATA_SYMBOLS=BTC-USDT-SWAP,ETH-USDT-SWAP,SOL-USDT-SWAP`.
   - Extend `tests/test_redis_client.py` with `test_pipeline_throughput` to push 10k ops through the async client and run it via `python -m pytest tests/test_redis_client.py -k pipeline_throughput --maxfail=1`, complemented by `redis-benchmark -q -t set,get -n 10000`.
   - Implement `test_broadcast_load` in `tests/test_websocket_endpoint.py` (also `@pytest.mark.load`) to spawn hundreds of dummy sockets; execute with `WS_LOAD_CLIENTS=500 python -m pytest tests/test_websocket_endpoint.py -k broadcast_load` and capture CPU/memory via `psrecord uvicorn`.
   - Log scheduler + FastAPI resource usage with `uvicorn autotrade_service.main:app --reload` plus `docker stats` (if running in container) to ensure CPU < 70% and RSS < 500 MB during soak.

4. **Error scenario tests**
   - Add `test_scheduler_handles_redis_failure` inside `tests/test_scheduler.py`, then run it with `REDIS_URL=redis://127.0.0.1:6390` (port with no server) to confirm exponential backoff and circuit breaker logs.
   - Introduce `test_market_data_scheduler_rate_limit_backoff` in `tests/test_market_data_scheduler.py` by monkeypatching `FakeCCXTExchange.fetch_ticker` to raise `RateLimitExceeded`; run via `python -m pytest tests/test_market_data_scheduler.py -k rate_limit_backoff`.
   - Create `test_reconnects_on_error` in `tests/test_websocket_endpoint.py` and confirm auto-reconnect interval of 5s plus UI toast once the React client consumes the failure message.
   - Force stale data handling inside `tests/test_llm_decision_scheduler.py` by setting `LLM_DATA_STALE_THRESHOLD_SECONDS=5` and ensuring scheduler aborts decision loops when data is >60s.

5. **End-to-end tests & manual validation**
   - Launch Redis + FastAPI (`uvicorn autotrade_service.main:app --reload`) and the React client (`npm run dev`) against the same machine, then run Cypress-like manual script: trigger `POST /api/autotrade/v1/manual-eval` to kick off LLM decision and inspect banner updates.
   - Capture HAR/console logs to ensure WebSocket payload matches Redis snapshot (compare via `redis-cli get market:BTC-USDT-SWAP:ticker`).
   - Document findings, failures, and screenshots in `docs/testing-log.md` with timestamps for traceability; include performance metrics from `pytest --durations` and `redis-benchmark`.

6. **Reporting**
   - Publish `pytest` junit XML via `python -m pytest tests -q --junitxml=reports/phase8-unit.xml`.
   - Store Vitest report at `equity-insight-react/reports/phase8-ui.xml`.
   - Summaries roll into Phase 8 status update table plus Slack update for stakeholders.

### Phase 9: Monitoring & Observability
- [ ] Add application metrics
  - [ ] Track scheduler cycle durations
  - [ ] Track API call success/failure rates
  - [ ] Track Redis operation metrics
  - [ ] Track WebSocket connection count
  - [ ] Track data staleness metrics
- [ ] Configure logging
  - [ ] Set up structured logging (JSON format)
  - [ ] Configure log levels per component
  - [ ] Add request/correlation IDs
  - [ ] Set up log aggregation (optional)
- [ ] Create monitoring dashboards
  - [ ] Redis operations dashboard
  - [ ] Scheduler performance dashboard
  - [ ] WebSocket connections dashboard
  - [ ] API health dashboard
- [ ] Set up alerting
  - [ ] Alert on Redis connection failures
  - [ ] Alert on OKX API errors
  - [ ] Alert on scheduler failures
  - [ ] Alert on high error rates
  - [ ] Alert on stale data

### Phase 10: Documentation
- [ ] Update technical documentation
  - [ ] Document architecture decisions
  - [ ] Document Redis data structures
  - [ ] Document WebSocket protocol
  - [ ] Document API endpoints
- [ ] Create operational runbook
  - [ ] How to start/stop schedulers
  - [ ] How to monitor Redis cache
  - [ ] How to troubleshoot common issues
  - [ ] How to update configurations
- [ ] Write developer guide
  - [ ] Local development setup
  - [ ] How to add new symbols
  - [ ] How to modify scheduler intervals
  - [ ] How to extend market data
- [ ] Create user documentation
  - [ ] How to interpret price banner
  - [ ] How to check system health
  - [ ] How to report issues

### Phase 11: Deployment Preparation
- [ ] Containerization (optional)
  - [ ] Create Dockerfile for backend
  - [ ] Create docker-compose.yml
  - [ ] Include Redis in docker-compose
  - [ ] Test container deployment
- [ ] Environment setup
  - [ ] Production environment variables
  - [ ] Staging environment setup
  - [ ] CI/CD pipeline configuration
- [ ] Security review
  - [ ] Review API key handling
  - [ ] Review WebSocket security
  - [ ] Review Redis security
  - [ ] Add rate limiting if needed
- [ ] Performance optimization
  - [ ] Optimize Redis queries
  - [ ] Optimize WebSocket broadcasts
  - [ ] Optimize scheduler cycles
  - [ ] Profile and fix bottlenecks
- [ ] Backup and recovery
  - [ ] Redis persistence configuration
  - [ ] Data backup strategy
  - [ ] Disaster recovery plan

### Phase 12: Production Deployment
- [ ] Pre-deployment checklist
  - [ ] All tests passing
  - [ ] Documentation complete
  - [ ] Monitoring configured
  - [ ] Alerts configured
  - [ ] Backup strategy in place
- [ ] Deployment steps
  - [ ] Deploy backend with schedulers
  - [ ] Deploy frontend with price banner
  - [ ] Configure Redis instance
  - [ ] Verify all services running
  - [ ] Test WebSocket connectivity
- [ ] Post-deployment validation
  - [ ] Verify market data updates
  - [ ] Verify LLM decisions working
  - [ ] Verify frontend price updates
  - [ ] Check monitoring dashboards
  - [ ] Test manual operations
- [ ] Go-live checklist
  - [ ] Monitor for 24 hours
  - [ ] Check error rates
  - [ ] Verify data accuracy
  - [ ] Confirm performance metrics
  - [ ] Document any issues

---

## Next Steps

**Immediate (Week 1):**
1. Set up Redis infrastructure (Phase 1)
2. Implement Market Data Scheduler (Phase 2)

**Short-term (Week 2-3):**
3. Refactor LLM Decision Scheduler (Phase 3)
4. Implement WebSocket endpoint (Phase 4)
5. Integrate into FastAPI app (Phase 5)

**Medium-term (Week 4):**
6. Build frontend price banner (Phase 6)
7. Testing & QA (Phase 8)
8. Monitoring setup (Phase 9)

**Long-term (Week 5+):**
9. Documentation (Phase 10)
10. Deployment preparation (Phase 11)
11. Production deployment (Phase 12)

---

**Document Status**: Blueprint  
**Last Updated**: November 8, 2025  
**Owner**: Auto-Trading Team
