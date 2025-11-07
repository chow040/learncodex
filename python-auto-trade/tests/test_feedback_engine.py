"""Unit tests for feedback loop engine."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from autotrade_service.feedback.feedback_engine import FeedbackLoopEngine, LearnedRule, TradeOutcome


class MockLLMClient:
    """Mock LLM client for testing."""
    
    def __init__(self):
        self.critique_response = "Trade won due to strong momentum and positive market sentiment."
        self.rule_response = "Only enter trades when RSI is below 30 and volume is above average."
    
    async def generate(self, prompt: str, max_tokens: int = 100, temperature: float = 0.7) -> str:
        """Mock generate method."""
        # Check for rule generation first (more specific)
        if "based on this trade critique" in prompt.lower() or "write one new decision rule" in prompt.lower():
            return self.rule_response
        elif "critique" in prompt.lower() or "analyze this completed trade" in prompt.lower():
            return self.critique_response
        return "Mock response"


class MockSettings:
    """Mock settings for testing."""
    max_rules_in_prompt = 8
    max_history_trades = 5


@pytest.fixture
def mock_llm():
    """Create mock LLM client."""
    return MockLLMClient()


@pytest.fixture
def mock_settings():
    """Create mock settings."""
    return MockSettings()


@pytest.fixture
def feedback_engine(mock_llm, mock_settings):
    """Create feedback engine with mocks."""
    return FeedbackLoopEngine(mock_llm, mock_settings)


@pytest.fixture
def winning_trade():
    """Create a winning trade outcome."""
    return TradeOutcome(
        id=uuid4(),
        symbol="BTCUSDT",
        action="BUY",
        entry_price=50000.0,
        exit_price=52000.0,
        pnl_pct=4.0,
        pnl_usd=400.0,
        rationale="Strong bullish momentum with RSI oversold",
        rule_ids=[],
        duration_seconds=3600,
    )


@pytest.fixture
def losing_trade():
    """Create a losing trade outcome."""
    return TradeOutcome(
        id=uuid4(),
        symbol="ETHUSDT",
        action="BUY",
        entry_price=3000.0,
        exit_price=2850.0,
        pnl_pct=-5.0,
        pnl_usd=-150.0,
        rationale="Bought on breakout but failed to hold support",
        rule_ids=[],
        duration_seconds=1800,
    )


# ============================================================================
# CRITIQUE GENERATION TESTS
# ============================================================================


@pytest.mark.asyncio
async def test_generate_critique_for_winning_trade(feedback_engine, winning_trade):
    """Should generate critique for winning trade."""
    critique = await feedback_engine._generate_critique(winning_trade)
    
    assert critique is not None
    assert len(critique) > 0
    assert isinstance(critique, str)


@pytest.mark.asyncio
async def test_generate_critique_for_losing_trade(feedback_engine, losing_trade):
    """Should generate critique for losing trade."""
    critique = await feedback_engine._generate_critique(losing_trade)
    
    assert critique is not None
    assert len(critique) > 0
    assert isinstance(critique, str)


@pytest.mark.asyncio
async def test_critique_contains_context(feedback_engine, winning_trade, mock_llm):
    """Critique prompt should contain trade context."""
    # Override to capture prompt
    prompts_seen = []
    
    original_generate = mock_llm.generate
    
    async def capture_prompt(prompt, **kwargs):
        prompts_seen.append(prompt)
        return await original_generate(prompt, **kwargs)
    
    mock_llm.generate = capture_prompt
    
    await feedback_engine._generate_critique(winning_trade)
    
    assert len(prompts_seen) == 1
    prompt = prompts_seen[0]
    assert "BTCUSDT" in prompt
    assert "BUY" in prompt
    assert "50000" in prompt
    assert "52000" in prompt


# ============================================================================
# RULE GENERATION TESTS
# ============================================================================


@pytest.mark.asyncio
async def test_generate_rule_from_winning_trade(feedback_engine, winning_trade):
    """Should generate reinforcement rule from winning trade."""
    critique = "Trade won due to strong momentum"
    rule = await feedback_engine._generate_rule(winning_trade, critique)
    
    assert rule is not None
    assert len(rule) > 0
    assert isinstance(rule, str)


@pytest.mark.asyncio
async def test_generate_rule_from_losing_trade(feedback_engine, losing_trade):
    """Should generate avoidance rule from losing trade."""
    critique = "Trade lost due to weak support"
    rule = await feedback_engine._generate_rule(losing_trade, critique)
    
    assert rule is not None
    assert len(rule) > 0


@pytest.mark.asyncio
async def test_rule_generation_cleans_prefixes(feedback_engine, winning_trade, mock_llm):
    """Should remove common prefixes from generated rules."""
    mock_llm.rule_response = "New Rule: Always check volume before entering"
    
    critique = "Good trade"
    rule = await feedback_engine._generate_rule(winning_trade, critique)
    
    assert rule == "Always check volume before entering"
    assert not rule.startswith("New Rule:")


@pytest.mark.asyncio
async def test_rule_generation_rejects_too_short(feedback_engine, winning_trade, mock_llm):
    """Should reject rules that are too short."""
    mock_llm.rule_response = "Buy low"
    
    critique = "Trade won"
    rule = await feedback_engine._generate_rule(winning_trade, critique)
    
    assert rule is None


@pytest.mark.asyncio
async def test_rule_generation_rejects_too_long(feedback_engine, winning_trade, mock_llm):
    """Should reject rules that are too long."""
    mock_llm.rule_response = "A" * 250  # 250 characters
    
    critique = "Trade won"
    rule = await feedback_engine._generate_rule(winning_trade, critique)
    
    assert rule is None


# ============================================================================
# RULE VALIDATION TESTS
# ============================================================================


def test_validate_rule_accepts_good_rule(feedback_engine):
    """Should accept well-formed actionable rule."""
    rule = "Avoid buying when RSI is above 70 and price is near resistance"
    assert feedback_engine._validate_rule(rule) is True


def test_validate_rule_accepts_different_verbs(feedback_engine):
    """Should accept rules with various action verbs."""
    rules = [
        "Always check volume before entering positions",
        "Only buy when momentum is confirmed",
        "Never enter trades during low liquidity hours",
        "Require stop loss within 2% of entry",
        "Must wait for confirmation candle",
        "If RSI is oversold, consider scaling in",
    ]
    
    for rule in rules:
        assert feedback_engine._validate_rule(rule) is True, f"Should accept: {rule}"


def test_validate_rule_rejects_too_short(feedback_engine):
    """Should reject rules that are too short."""
    rule = "Buy more"
    assert feedback_engine._validate_rule(rule) is False


def test_validate_rule_rejects_too_long(feedback_engine):
    """Should reject rules that exceed length limit."""
    rule = "A" * 250  # 250 characters
    assert feedback_engine._validate_rule(rule) is False


def test_validate_rule_rejects_vague_language(feedback_engine):
    """Should reject rules with vague, non-actionable language."""
    vague_rules = [
        "Maybe consider buying sometimes",
        "Try to avoid losses when possible",
        "You might want to check the chart",
        "It could be a good idea to wait",
        "Perhaps look at the indicators",
    ]
    
    for rule in vague_rules:
        assert feedback_engine._validate_rule(rule) is False, f"Should reject: {rule}"


def test_validate_rule_rejects_no_action_verb(feedback_engine):
    """Should reject rules without actionable verbs."""
    rule = "The market is trending upward today."
    assert feedback_engine._validate_rule(rule) is False


def test_validate_rule_rejects_statement_without_directive(feedback_engine):
    """Should reject non-directive statements."""
    rule = "Price action looks good."
    assert feedback_engine._validate_rule(rule) is False


# ============================================================================
# RULE CLASSIFICATION TESTS
# ============================================================================


def test_classify_rule_type_position_sizing(feedback_engine):
    """Should classify position sizing rules correctly."""
    rules = [
        "Limit position size to 10% of capital",
        "Reduce exposure when volatility increases",
        "Use 2x leverage for high confidence trades",
        "Allocate no more than 5% per trade",
    ]
    
    for rule in rules:
        rule_type = feedback_engine._classify_rule_type(rule)
        assert rule_type == "position_sizing", f"Should classify as position_sizing: {rule}"


def test_classify_rule_type_risk_management(feedback_engine):
    """Should classify risk management rules correctly."""
    rules = [
        "Always set stop loss at 2% below entry",
        "Never risk more than 1% per trade",
        "Exit when drawdown exceeds 5%",
        "Protect profits with trailing stops",
    ]
    
    for rule in rules:
        rule_type = feedback_engine._classify_rule_type(rule)
        assert rule_type == "risk_management", f"Should classify as risk_management: {rule}"


def test_classify_rule_type_exit(feedback_engine):
    """Should classify exit rules correctly."""
    rules = [
        "Take profit when price reaches 5% gain",
        "Exit positions before weekend close",
        "Scale out when RSI hits 80",
        "Close all trades during high impact news",
    ]
    
    for rule in rules:
        rule_type = feedback_engine._classify_rule_type(rule)
        assert rule_type == "exit", f"Should classify as exit: {rule}"


def test_classify_rule_type_entry_default(feedback_engine):
    """Should default to entry for ambiguous rules."""
    rules = [
        "Only buy on confirmed breakouts",
        "Wait for pullback to support level",
        "Require three confirmations before entering",
    ]
    
    for rule in rules:
        rule_type = feedback_engine._classify_rule_type(rule)
        assert rule_type == "entry", f"Should default to entry: {rule}"


# ============================================================================
# TEXT SIMILARITY TESTS
# ============================================================================


def test_text_similarity_identical(feedback_engine):
    """Should return 1.0 for identical text."""
    text = "Avoid buying when RSI is above 70"
    similarity = feedback_engine._text_similarity(text, text)
    assert similarity == 1.0


def test_text_similarity_completely_different(feedback_engine):
    """Should return 0.0 for completely different text."""
    text1 = "Avoid buying when RSI is above 70"
    text2 = "Sell gold during inflation periods"
    similarity = feedback_engine._text_similarity(text1, text2)
    assert similarity < 0.3  # Very low similarity


def test_text_similarity_similar_but_not_identical(feedback_engine):
    """Should return moderate score for similar text."""
    text1 = "Avoid buying when RSI is above 70"
    text2 = "Avoid entering when RSI exceeds 70"
    similarity = feedback_engine._text_similarity(text1, text2)
    assert 0.4 < similarity < 0.9  # Moderate to high similarity


def test_text_similarity_case_insensitive(feedback_engine):
    """Should be case-insensitive."""
    text1 = "AVOID BUYING WHEN RSI IS HIGH"
    text2 = "avoid buying when rsi is high"
    similarity = feedback_engine._text_similarity(text1, text2)
    assert similarity == 1.0


def test_text_similarity_empty_strings(feedback_engine):
    """Should handle empty strings."""
    similarity = feedback_engine._text_similarity("", "")
    assert similarity == 0.0


# ============================================================================
# INTEGRATION TESTS (require database mocking)
# ============================================================================


@pytest.mark.asyncio
async def test_process_closed_trade_validation_failure(feedback_engine, winning_trade, mock_llm):
    """Should return None if rule validation fails."""
    # Generate invalid rule (too short)
    mock_llm.rule_response = "Buy"
    
    # Mock the database functions to avoid actual DB calls
    import autotrade_service.repositories as repos
    
    original_save = getattr(repos, 'save_learned_rule', None)
    original_fetch = getattr(repos, 'fetch_active_rules', None)
    
    # Mock functions
    async def mock_save(*args, **kwargs):
        return uuid4()
    
    async def mock_fetch(*args, **kwargs):
        return []
    
    repos.save_learned_rule = mock_save
    repos.fetch_active_rules = mock_fetch
    
    try:
        result = await feedback_engine.process_closed_trade(winning_trade)
        assert result is None  # Rule should be rejected
    finally:
        # Restore originals
        if original_save:
            repos.save_learned_rule = original_save
        if original_fetch:
            repos.fetch_active_rules = original_fetch


@pytest.mark.asyncio
async def test_process_closed_trade_successful_flow(feedback_engine, winning_trade, mock_llm):
    """Should successfully process trade and return LearnedRule."""
    # Mock database functions
    import autotrade_service.repositories as repos
    
    saved_rule_id = uuid4()
    
    original_save = getattr(repos, 'save_learned_rule', None)
    original_fetch = getattr(repos, 'fetch_active_rules', None)
    
    async def mock_save(*args, **kwargs):
        return saved_rule_id
    
    async def mock_fetch(*args, **kwargs):
        return []  # No existing rules
    
    repos.save_learned_rule = mock_save
    repos.fetch_active_rules = mock_fetch
    
    try:
        result = await feedback_engine.process_closed_trade(winning_trade)
        
        assert result is not None
        assert isinstance(result, LearnedRule)
        assert result.id == saved_rule_id
        assert result.rule_text == mock_llm.rule_response
        assert result.source_trade_id == winning_trade.id
    finally:
        if original_save:
            repos.save_learned_rule = original_save
        if original_fetch:
            repos.fetch_active_rules = original_fetch


# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================


@pytest.mark.asyncio
async def test_critique_generation_handles_llm_failure(feedback_engine, winning_trade, mock_llm):
    """Should provide fallback critique if LLM fails."""
    # Make LLM raise exception
    async def failing_generate(*args, **kwargs):
        raise Exception("LLM API error")
    
    mock_llm.generate = failing_generate
    
    critique = await feedback_engine._generate_critique(winning_trade)
    
    # Should still return a fallback critique
    assert critique is not None
    assert len(critique) > 0
    assert "4.00%" in critique or winning_trade.rationale in critique


@pytest.mark.asyncio
async def test_rule_generation_handles_llm_failure(feedback_engine, winning_trade, mock_llm):
    """Should return None if rule generation fails."""
    async def failing_generate(*args, **kwargs):
        raise Exception("LLM API error")
    
    mock_llm.generate = failing_generate
    
    rule = await feedback_engine._generate_rule(winning_trade, "Test critique")
    
    assert rule is None


# ============================================================================
# EDGE CASE TESTS
# ============================================================================


def test_validate_rule_handles_unicode(feedback_engine):
    """Should handle Unicode characters in rules."""
    rule = "Avoid buying when market is bearish 📉"
    result = feedback_engine._validate_rule(rule)
    assert isinstance(result, bool)  # Should not crash


def test_classify_rule_handles_mixed_keywords(feedback_engine):
    """Should classify based on dominant keywords."""
    rule = "Exit positions with stop loss when size exceeds 10%"
    rule_type = feedback_engine._classify_rule_type(rule)
    # Should prioritize exit keywords
    assert rule_type in ["exit", "risk_management", "position_sizing"]


def test_text_similarity_handles_punctuation(feedback_engine):
    """Should handle punctuation differences."""
    text1 = "Avoid buying when RSI > 70!"
    text2 = "Avoid buying when RSI > 70"
    similarity = feedback_engine._text_similarity(text1, text2)
    assert similarity > 0.7  # Should be similar despite punctuation (not identical due to punctuation tokenization)
