"""
Feedback Loop Engine - Core self-improvement system.

This module implements the self-improving feedback loop where the LLM:
1. Critiques completed trades
2. Generates new decision rules
3. Validates and stores rules
4. Updates rule effectiveness metrics

No external RL models or fine-tuning - pure in-context learning through language.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class TradeOutcome:
    """Represents a closed trade with outcome."""
    id: UUID | None  # Can be None in simulation mode without database
    symbol: str
    action: str
    entry_price: float
    exit_price: float
    pnl_pct: float
    pnl_usd: float
    rationale: str
    rule_ids: list[UUID]
    duration_seconds: int


@dataclass
class LearnedRule:
    """Represents a self-generated trading rule."""
    id: UUID | None  # Can be None in simulation mode without database
    rule_text: str
    rule_type: str
    source_trade_id: UUID | None  # Can be None if TradeOutcome.id is None
    critique: str
    confidence: float


class FeedbackLoopEngine:
    """
    Self-improving feedback loop engine.
    
    After each closed trade:
    1. Prompts LLM for self-critique
    2. Generates new rule to improve
    3. Validates and stores rule
    4. Updates rule effectiveness metrics
    
    Example usage:
        engine = FeedbackLoopEngine(llm_client, settings)
        outcome = TradeOutcome(...)
        new_rule = await engine.process_closed_trade(outcome)
    """
    
    def __init__(self, llm_client, settings):
        """
        Initialize feedback loop engine.
        
        Args:
            llm_client: AsyncDeepSeekClient or compatible LLM client
            settings: Application settings (max_rules, thresholds, etc.)
        """
        self.llm = llm_client
        self.settings = settings
        self.max_rules_in_prompt = getattr(settings, 'max_rules_in_prompt', 8)
        self.max_history_trades = getattr(settings, 'max_history_trades', 5)
        self.min_rule_length = 10
        self.max_rule_length = 200
        self.duplicate_threshold = 0.8
        
    async def process_closed_trade(self, trade_outcome: TradeOutcome) -> Optional[LearnedRule]:
        """
        Main feedback loop entry point.
        
        Processes a closed trade through the full feedback cycle:
        - Generate self-critique
        - Generate improvement rule
        - Validate rule format
        - Check for duplicates
        - Persist to database
        
        Args:
            trade_outcome: Closed trade details with PnL
            
        Returns:
            LearnedRule if successfully generated, None if skipped/rejected
        """
        logger.info(f"Processing feedback for trade: {trade_outcome.symbol} {trade_outcome.action} PnL={trade_outcome.pnl_pct:.2f}%")
        
        try:
            # Step 1: Generate self-critique
            critique = await self._generate_critique(trade_outcome)
            logger.debug(f"Generated critique: {critique[:100]}...")
            
            # Step 2: Generate new rule
            new_rule_text = await self._generate_rule(trade_outcome, critique)
            if not new_rule_text:
                logger.info("No rule generated (LLM returned empty/invalid response)")
                return None
            
            # Step 3: Validate rule format
            if not self._validate_rule(new_rule_text):
                logger.warning(f"Rule validation failed: {new_rule_text}")
                return None
            
            # Step 4: Check for duplicate rules
            if await self._is_duplicate_rule(new_rule_text):
                logger.info(f"Rule rejected as duplicate: {new_rule_text}")
                return None
            
            # Step 5: Classify rule type
            rule_type = self._classify_rule_type(new_rule_text)
            
            # Step 6: Persist rule (import here to avoid circular dependency)
            from ..repositories import save_learned_rule
            
            rule_id = await save_learned_rule(
                rule_text=new_rule_text,
                rule_type=rule_type,
                source_trade_id=trade_outcome.id,
                critique=critique,
                metadata={
                    "pnl_pct": float(trade_outcome.pnl_pct),
                    "symbol": trade_outcome.symbol,
                    "action": trade_outcome.action,
                    "duration_seconds": trade_outcome.duration_seconds,
                }
            )
            
            # Rule may not be persisted in simulation mode (rule_id could be None)
            if rule_id:
                logger.info(f"✓ New rule generated and saved [{rule_type}]: {new_rule_text}")
            else:
                logger.info(f"✓ New rule generated (not persisted - simulation mode?) [{rule_type}]: {new_rule_text}")
            
            return LearnedRule(
                id=rule_id,
                rule_text=new_rule_text,
                rule_type=rule_type,
                source_trade_id=trade_outcome.id,
                critique=critique,
                confidence=0.5,  # Initial confidence
            )
            
        except Exception as e:
            logger.error(f"Error processing feedback loop: {e}", exc_info=True)
            return None
    
    async def _generate_critique(self, outcome: TradeOutcome) -> str:
        """
        Generate LLM self-critique of the trade.
        
        Prompts the LLM to analyze why the trade won or lost,
        focusing on specific, actionable insights.
        
        Args:
            outcome: Trade outcome with entry/exit prices and PnL
            
        Returns:
            Critique text (1-2 sentences)
        """
        duration_minutes = outcome.duration_seconds // 60
        result_label = "SUCCESS ✓" if outcome.pnl_pct > 0 else "LOSS ✗"
        outcome_verb = "win" if outcome.pnl_pct > 0 else "lose"
        
        prompt = f"""Analyze this completed trade and provide a concise critique (1-2 sentences):

Trade Details:
- Symbol: {outcome.symbol}
- Action: {outcome.action}
- Entry: ${outcome.entry_price:.2f}
- Exit: ${outcome.exit_price:.2f}
- PnL: {outcome.pnl_pct:+.2f}%
- Duration: {duration_minutes} minutes
- Original Rationale: {outcome.rationale}

Result: {result_label}

Why did this trade {outcome_verb}? Be specific and actionable.

Critique:"""
        
        try:
            # Use LLM client's generate_completion method
            response = await self.llm.generate_completion(
                prompt=prompt,
                temperature=0.7
            )
            critique = response.content.strip()
            
            # Fallback if LLM returns empty
            if not critique or len(critique) < 10:
                critique = f"Trade {outcome_verb} with {abs(outcome.pnl_pct):.2f}% PnL. {outcome.rationale}"
            
            return critique
            
        except Exception as e:
            logger.error(f"Error generating critique: {e}")
            # Fallback critique
            return f"Trade resulted in {outcome.pnl_pct:+.2f}% PnL. Original rationale: {outcome.rationale}"
    
    async def _generate_rule(self, outcome: TradeOutcome, critique: str) -> Optional[str]:
        """
        Generate new decision rule from critique.
        
        Prompts the LLM to write a specific, actionable rule based on
        the trade critique. Rules should be short and imperative.
        
        Args:
            outcome: Trade outcome context
            critique: LLM-generated critique of the trade
            
        Returns:
            Rule text or None if generation fails
        """
        # Determine focus based on outcome
        if outcome.pnl_pct > 0:
            focus_instruction = "reinforcing what made this trade successful"
        else:
            focus_instruction = "avoiding this mistake in the future"
        
        prompt = f"""Based on this trade critique, write ONE new decision rule to improve future trading.

Critique: {critique}

Trade Context:
- Symbol: {outcome.symbol}
- PnL: {outcome.pnl_pct:+.2f}%
- Action: {outcome.action}

Requirements:
- Be specific and actionable
- Start with a verb (e.g., "Avoid", "Only", "Require", "Never", "Always")
- Keep under 30 words
- Focus on {focus_instruction}

New Rule:"""
        
        try:
            response = await self.llm.generate_completion(
                prompt=prompt,
                temperature=0.8
            )
            rule = response.content.strip()
            
            # Clean up common prefixes
            for prefix in ["New Rule:", "Rule:", "Decision Rule:"]:
                if rule.startswith(prefix):
                    rule = rule[len(prefix):].strip()
            
            # Basic validation
            if len(rule) < self.min_rule_length or len(rule) > self.max_rule_length:
                logger.warning(f"Rule length out of bounds: {len(rule)} chars")
                return None
            
            return rule
            
        except Exception as e:
            logger.error(f"Error generating rule: {e}")
            return None
    
    def _validate_rule(self, rule_text: str) -> bool:
        """
        Validate rule format and content.
        
        Checks:
        - Length constraints (10-200 chars)
        - Contains actionable verbs
        - Doesn't contain vague language
        
        Args:
            rule_text: Generated rule text
            
        Returns:
            True if valid, False otherwise
        """
        # Check length
        if len(rule_text) < self.min_rule_length or len(rule_text) > self.max_rule_length:
            return False
        
        # Check for actionable verbs (imperative mood)
        action_verbs = [
            "avoid", "only", "require", "never", "always", "when", "if", 
            "unless", "must", "should", "enter", "exit", "close", "hold",
            "reduce", "increase", "limit", "set", "use", "wait", "skip"
        ]
        if not any(verb in rule_text.lower() for verb in action_verbs):
            return False
        
        # Check for banned vague patterns (but allow in conditional context)
        banned_patterns = [
            "maybe", "try to", "might want", "could be",
            "perhaps", "possibly", "potentially", "think about"
        ]
        # Allow "consider" if it's part of a conditional (if/when)
        text_lower = rule_text.lower()
        if any(pattern in text_lower for pattern in banned_patterns):
            return False
        
        # Special case: reject standalone "consider" but allow in conditionals
        if "consider" in text_lower:
            if not any(word in text_lower for word in ["if", "when", "unless", "after"]):
                return False
        
        # Reject if it's just a statement without directive
        if rule_text.endswith(".") and not any(verb in rule_text.lower()[:20] for verb in action_verbs):
            return False
        
        return True
    
    def _classify_rule_type(self, rule_text: str) -> str:
        """
        Classify rule into category based on content.
        
        Categories:
        - position_sizing: Rules about trade size, allocation
        - risk_management: Rules about stops, risk, drawdown
        - exit: Rules about when to close positions
        - entry: Rules about when to open positions (default)
        
        Args:
            rule_text: Rule text to classify
            
        Returns:
            Rule type string
        """
        text_lower = rule_text.lower()
        
        # Risk management keywords (check first, most important)
        if any(word in text_lower for word in [
            "stop loss", "stop-loss", "drawdown", "risk more", "invalidation",
            "protect", "hedge"
        ]):
            return "risk_management"
        
        # Exit keywords (check before generic words like "profit")
        elif any(word in text_lower for word in [
            "exit", "close position", "close all", "take profit", "tp",
            "scale out", "lock in", "trail"
        ]):
            return "exit"
        
        # Position sizing keywords
        elif any(word in text_lower for word in [
            "size", "position size", "allocation", "capital", "exposure",
            "leverage", "quantity"
        ]) and not any(word in text_lower for word in ["exit", "close"]):
            return "position_sizing"
        
        # Generic keywords that could be multiple types - use context
        elif "%" in text_lower or "percent" in text_lower:
            # Check context around percentage
            if any(word in text_lower for word in ["gain", "profit", "reaches"]):
                return "exit"
            elif any(word in text_lower for word in ["risk", "loss", "stop"]):
                return "risk_management"
            else:
                return "position_sizing"
        
        # Default to entry
        else:
            return "entry"
    
    async def _is_duplicate_rule(self, new_rule: str) -> bool:
        """
        Check if rule is semantically similar to existing rules.
        
        Uses simple Jaccard text similarity initially.
        TODO: Upgrade to embedding-based similarity for better deduplication.
        
        Args:
            new_rule: Candidate rule text
            
        Returns:
            True if duplicate found, False otherwise
        """
        try:
            # Import here to avoid circular dependency
            from ..repositories import fetch_active_rules
            
            # Fetch recent active rules
            active_rules = await fetch_active_rules(limit=50)
            
            # Check similarity against each existing rule
            for existing_rule in active_rules:
                similarity = self._text_similarity(new_rule, existing_rule.rule_text)
                if similarity > self.duplicate_threshold:
                    logger.debug(f"Duplicate detected: {similarity:.2f} similarity with: {existing_rule.rule_text[:50]}")
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking duplicates: {e}")
            # Fail open - allow rule if duplicate check fails
            return False
    
    def _text_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate simple text similarity using Jaccard index.
        
        Jaccard similarity = |intersection| / |union| of word sets
        
        Args:
            text1: First text
            text2: Second text
            
        Returns:
            Similarity score 0.0 to 1.0
        """
        # Normalize and tokenize
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        # Calculate Jaccard similarity
        intersection = words1 & words2
        union = words1 | words2
        
        if not union:
            return 0.0
        
        return len(intersection) / len(union)
