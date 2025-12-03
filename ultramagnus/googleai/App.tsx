import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import ReportCard from './components/ReportCard';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import AccountSettingsPage from './components/AccountSettingsPage';
import LandingPage from './components/LandingPage';
import { generateEquityReport } from './services/geminiService';
import { EquityReport, LoadingState, SavedReportItem, UserProfile, AnalysisSession } from './types';
import { Search, Loader2, Sparkles, Eye, TrendingUp, TrendingDown, Minus, Bookmark, X, ArrowRight, Database, ExternalLink, Activity } from 'lucide-react';

const SAMPLE_REPORT: EquityReport = {
  companyName: "AstroMining Corp",
  ticker: "ASTRO",
  reportDate: "Nov 24, 2024, 10:00 AM",
  currentPrice: "$24.50",
  priceChange: "+5.25%",
  marketCap: "$5.2B",
  peRatio: "N/A",
  dayHigh: "$24.95",
  dayLow: "$23.80",
  week52High: "$28.00",
  week52Low: "$12.00",
  priceTarget: "$42.00",
  priceTargetRange: "$35.00 - $55.00",
  priceTargetModel: {
    estimatedEPS: "$1.75",
    targetPE: "24.0x",
    growthRate: "45%",
    logic: "Valuation assumes a 24x multiple on projected FY25 earnings, justified by superior growth vs peers."
  },
  scenarioAnalysis: {
    bear: { label: "Bear", price: "$15.00", logic: "Prototype failure leads to additional capital raise and delayed revenue.", probability: "25%" },
    base: { label: "Base", price: "$42.00", logic: "Successful launch of Prospector-1 and initial contract monetization.", probability: "50%" },
    bull: { label: "Bull", price: "$75.00", logic: "Discovery of platinum-group metals exceeds initial survey estimates.", probability: "25%" }
  },
  summary: "AstroMining is pioneering commercial asteroid mining technology. With successful prototype launches in late 2024, they aim to extract rare earth metals from near-earth objects, potentially disrupting the global electronics supply chain.",
  rocketScore: 85,
  rocketReason: "First-mover advantage in a potential trillion-dollar untapped market.",
  financialHealthScore: 65,
  financialHealthReason: "Solid cash position post-Series D, but high burn rate requires monitoring.",
  momentumScore: 78,
  momentumReason: "Relative strength index (RSI) accelerating with rising volume on breakout news.",
  moatAnalysis: {
    moatRating: "Narrow",
    moatSource: "Intangible Assets (Patents)",
    rationale: "Exclusive orbital mining rights and patented plasma propulsion create high barriers to entry, though technology is unproven at scale."
  },
  managementQuality: {
    executiveTenure: "CEO 8y, CFO 4y",
    insiderOwnership: "12.5%",
    trackRecord: "Founder previously sold deep-tech startup to Google for $200M.",
    governanceRedFlags: "Dual-class share structure gives CEO super-voting rights.",
    verdict: "Founder-led, high insider ownership aligned with shareholders, though governance is centralized."
  },
  history: {
    previousDate: "Aug 2024",
    previousVerdict: "HOLD",
    changeRationale: [
       "Successful Series D funding removed near-term liquidity risk",
       "NASA partnership validated technical feasibility"
    ]
  },
  shortTermFactors: {
    positive: [
       { title: "Upcoming Prototype Launch", detail: "Scheduled launch of 'Prospector-1' next month acts as a major catalyst for validation." },
       { title: "Strategic Defense Partnership", detail: "Recently secured data-sharing agreement with the DoD boosts technical credibility and non-dilutive funding." }
    ],
    negative: [
       { title: "High Cash Burn", detail: "Monthly burn rate of $15M puts pressure on balance sheet liquidity." },
       { title: "Volatility Risk", detail: "Stock price heavily correlated with binary test outcomes." }
    ]
  },
  longTermFactors: {
    positive: [
       { title: "Exclusive Orbital Rights", detail: "Secured mining rights to high-value Near-Earth Objects (NEOs) with estimated $2T value." },
       { title: "Patented Propulsion Tech", detail: "Proprietary plasma drive reduces fuel costs by 40%, enabling cheaper retrieval missions." },
       { title: "Path to Profitability", detail: "Projected break-even by 2027 assuming current rare earth metal prices hold." }
    ],
    negative: [
       { title: "Regulatory Uncertainty", detail: "International space property rights remain legally ambiguous under current treaties." },
       { title: "Operational Timeline Risk", detail: "Deep space operations historically face multi-year delays." },
       { title: "Emerging Competition", detail: "SpaceX and Blue Origin signaling potential entry into resource extraction sector." }
    ]
  },
  upcomingEvents: [
    { date: "Nov 15, 2024", event: "Q3 Earnings Call", impact: "Medium" },
    { date: "Dec 01, 2024", event: "Asteroid Scout Launch", impact: "High" },
    { date: "Jan 08, 2025", event: "CES Keynote Presentation", impact: "Low" }
  ],
  recentNews: [
    { headline: "AstroMining Secures $500M Series D Funding", date: "Oct 05, 2024" },
    { headline: "NASA Signs Data Sharing Agreement with ASTRO", date: "Sep 22, 2024" },
    { headline: "New CFO appointed from SpaceX", date: "Aug 15, 2024" }
  ],
  earningsCallAnalysis: {
    sentiment: "Bullish",
    summary: "Management remained extremely bullish during the last call, emphasizing that their cash runway now extends through 2026.",
    keyTakeaways: [
      "Cash runway extended through 2026 via Series D",
      "CEO emphasized proprietary plasma propulsion tech success",
      "Timeline for first retrieval mission remains vague"
    ]
  },
  overallSentiment: {
    score: 82,
    label: "Bullish",
    summary: "Strong investor confidence following the Series D funding and NASA partnership, supported by optimistic management guidance."
  },
  insiderActivity: [
    { insiderName: "Sarah Connor", role: "CEO", transactionDate: "2024-10-15", transactionType: "Buy", shares: "50,000", value: "$1.2M" },
    { insiderName: "Miles Dyson", role: "CTO", transactionDate: "2024-09-20", transactionType: "Buy", shares: "12,500", value: "$300K" },
    { insiderName: "Venture Partners LLC", role: "Director", transactionDate: "2024-08-01", transactionType: "Sell", shares: "100,000", value: "$2.1M" }
  ],
  riskMetrics: {
    beta: "2.1",
    shortInterestPercentage: "14.5%",
    shortInterestRatio: "4.2",
    volatility: "High"
  },
  institutionalSentiment: "Net Accumulation",
  tags: ["Space Tech", "Speculative", "Industrial", "Growth"],
  peers: [
    {
      ticker: "SPCX",
      name: "SpaceX (Private / Est)",
      marketCap: "$150B",
      peRatio: "N/A",
      revenueGrowth: "45.0%",
      netMargin: "2.5%"
    },
    {
      ticker: "RKLB",
      name: "Rocket Lab USA",
      marketCap: "$2.8B",
      peRatio: "N/A",
      revenueGrowth: "25.0%",
      netMargin: "-45.0%"
    },
    {
      ticker: "PLTR",
      name: "Palantir Technologies",
      marketCap: "$38.0B",
      peRatio: "65.4",
      revenueGrowth: "18.5%",
      netMargin: "12.0%"
    },
    {
      ticker: "LMT",
      name: "Lockheed Martin",
      marketCap: "$110.0B",
      peRatio: "16.5",
      revenueGrowth: "4.5%",
      netMargin: "9.8%"
    }
  ],
  financials: [
    { 
      year: "2021", 
      revenue: 12.5, 
      grossProfit: 2.1, 
      operatingIncome: -10.5, 
      netIncome: -15.5, 
      eps: -0.45,
      cashAndEquivalents: 150, 
      totalDebt: 45, 
      shareholderEquity: 80,
      operatingCashFlow: -12.0,
      capitalExpenditure: 5.0,
      freeCashFlow: -17.0
    },
    { 
      year: "2022", 
      revenue: 28.0, 
      grossProfit: 8.4, 
      operatingIncome: -35.0, 
      netIncome: -42.8, 
      eps: -0.98,
      cashAndEquivalents: 110, 
      totalDebt: 80, 
      shareholderEquity: 45,
      operatingCashFlow: -30.5,
      capitalExpenditure: 15.0,
      freeCashFlow: -45.5
    },
    { 
      year: "2023", 
      revenue: 65.5, 
      grossProfit: 22.5, 
      operatingIncome: -60.2, 
      netIncome: -85.2, 
      eps: -1.55,
      cashAndEquivalents: 450, // Post Series C
      totalDebt: 120, 
      shareholderEquity: 320,
      operatingCashFlow: -65.0,
      capitalExpenditure: 45.0,
      freeCashFlow: -110.0
    },
    { 
      year: "2024", 
      revenue: 145.0, 
      grossProfit: 65.0, 
      operatingIncome: -45.0, 
      netIncome: -60.5, 
      eps: -1.05,
      cashAndEquivalents: 850, // Post Series D
      totalDebt: 150, 
      shareholderEquity: 680,
      operatingCashFlow: -25.0,
      capitalExpenditure: 85.0,
      freeCashFlow: -110.0
    }
  ],
  priceHistory: [
    { month: "Nov", price: 12.50 },
    { month: "Dec", price: 13.20 },
    { month: "Jan", price: 14.00 },
    { month: "Feb", price: 13.50 },
    { month: "Mar", price: 15.80 },
    { month: "Apr", price: 18.20 },
    { month: "May", price: 19.50 },
    { month: "Jun", price: 18.90 },
    { month: "Jul", price: 21.00 },
    { month: "Aug", price: 22.50 },
    { month: "Sep", price: 23.80 },
    { month: "Oct", price: 24.50 }
  ],
  analystPriceTargets: [
    { month: "Nov", averageTarget: 18.00 },
    { month: "Dec", averageTarget: 18.50 },
    { month: "Jan", averageTarget: 19.00 },
    { month: "Feb", averageTarget: 19.00 },
    { month: "Mar", averageTarget: 22.00 },
    { month: "Apr", averageTarget: 25.00 },
    { month: "May", averageTarget: 26.00 },
    { month: "Jun", averageTarget: 26.00 },
    { month: "Jul", averageTarget: 28.00 },
    { month: "Aug", averageTarget: 30.00 },
    { month: "Sep", averageTarget: 32.00 },
    { month: "Oct", averageTarget: 35.00 }
  ],
  valuation: "Currently speculative. Trading purely on future IP value rather than earnings. Comparable to early-stage biotech.",
  verdict: "BUY",
  verdictReason: "A true moonshot. Position size accordingly (1-2% of portfolio), but the asymmetric upside potential is undeniable if execution succeeds.",
  sources: [
    { title: "Space Industry News - Mining", uri: "https://example.com/news" },
    { title: "Global Rare Earth Report", uri: "https://example.com/report" }
  ]
};

// Autocomplete Data Source
const POPULAR_STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'PLTR', name: 'Palantir Technologies' },
  { symbol: 'COIN', name: 'Coinbase Global' },
  { symbol: 'GME', name: 'GameStop Corp.' },
  { symbol: 'DIS', name: 'Walt Disney Co.' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'KO', name: 'Coca-Cola Co.' },
  { symbol: 'PEP', name: 'PepsiCo Inc.' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'COST', name: 'Costco Wholesale' },
  { symbol: 'NKE', name: 'Nike Inc.' },
  { symbol: 'SBUX', name: 'Starbucks Corp.' },
  { symbol: 'MCD', name: 'McDonald\'s Corp.' },
  { symbol: 'BA', name: 'Boeing Co.' },
  { symbol: 'LMT', name: 'Lockheed Martin' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'CVX', name: 'Chevron Corp.' },
  { symbol: 'MRNA', name: 'Moderna Inc.' },
  { symbol: 'PFE', name: 'Pfizer Inc.' },
  { symbol: 'LLY', name: 'Eli Lilly & Co.' },
  { symbol: 'INTC', name: 'Intel Corp.' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.' },
  { symbol: 'CRM', name: 'Salesforce Inc.' },
  { symbol: 'UBER', name: 'Uber Technologies' },
  { symbol: 'ABNB', name: 'Airbnb Inc.' },
  { symbol: 'HOOD', name: 'Robinhood Markets' },
  { symbol: 'PYPL', name: 'PayPal Holdings' },
  { symbol: 'SQ', name: 'Block Inc.' },
  { symbol: 'SHOP', name: 'Shopify Inc.' },
  { symbol: 'TGT', name: 'Target Corp.' },
  { symbol: 'RTX', name: 'RTX Corp.' },
  { symbol: 'GE', name: 'General Electric' },
  { symbol: 'GM', name: 'General Motors' },
  { symbol: 'F', name: 'Ford Motor Co.' }
];

// Phases for simulated progress
const ANALYSIS_PHASES = [
  "INIT_SECURE_UPLINK...",
  "SCRAPING_MARKET_DATA...",
  "PARSING_10K_10Q...",
  "ANALYZING_INSIDER_FLOW...",
  "CALCULATING_INTRINSIC_VAL...",
  "SYNTHESIZING_THESIS...",
  "COMPILING_REPORT..."
];

function App() {
  const [ticker, setTicker] = useState('');
  
  // View State
  const [viewMode, setViewMode] = useState<'LANDING' | 'DASHBOARD' | 'REPORT' | 'SETTINGS'>('LANDING');
  
  // Demo Modal State
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Current active report to display
  const [report, setReport] = useState<EquityReport | null>(null);
  
  // Background Analysis Sessions
  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>([]);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<{symbol: string, name: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // User & Auth State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState<string>(''); // Dynamic message for auth modal
  
  // Guest Usage Tracking
  const [guestUsageCount, setGuestUsageCount] = useState(0);

  // Unified Report Library (Auto-saved history + Bookmarked items)
  const [reportLibrary, setReportLibrary] = useState<SavedReportItem[]>(() => {
    // Attempt to load new library format
    const saved = localStorage.getItem('ultramagnus_library_v1');
    if (saved) return JSON.parse(saved);
    
    // Fallback: Migrate legacy saved reports
    const legacy = localStorage.getItem('ultramagnus_saved_reports');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      return parsedLegacy.map((item: any) => ({
        ...item,
        isBookmarked: true // Legacy items were all "saved"
      }));
    }
    return [];
  });

  // Load User & Usage from LocalStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('ultramagnus_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    
    const usage = localStorage.getItem('ultramagnus_guest_usage');
    if (usage) {
      setGuestUsageCount(parseInt(usage, 10));
    }
  }, []);

  // FORCE REDIRECT: If user is logged in but on LANDING page, move to dashboard
  useEffect(() => {
    if (user && viewMode === 'LANDING') {
      setViewMode('DASHBOARD');
    }
  }, [user, viewMode]);

  useEffect(() => {
    localStorage.setItem('ultramagnus_library_v1', JSON.stringify(reportLibrary));
  }, [reportLibrary]);

  // PROGRESS SIMULATION EFFECT
  useEffect(() => {
    const interval = setInterval(() => {
      setAnalysisSessions(prevSessions => {
        // Optimization: if no session is processing, return prev
        if (!prevSessions.some(s => s.status === 'PROCESSING')) return prevSessions;

        return prevSessions.map(session => {
          if (session.status !== 'PROCESSING') return session;

          // Logistic curve simulation: Fast at start, slow at end
          const current = session.progress;
          let next = current;
          
          if (current < 30) next += 2;
          else if (current < 60) next += 1;
          else if (current < 85) next += 0.5;
          else if (current < 95) next += 0.1;
          
          // Map progress to phase text
          const phaseIndex = Math.min(
            Math.floor((next / 100) * ANALYSIS_PHASES.length), 
            ANALYSIS_PHASES.length - 1
          );

          // Only update phase if it's NOT in the special streaming state
          const currentPhase = session.phase === "Receiving neural stream..." 
             ? "RECEIVING_NEURAL_STREAM..." 
             : ANALYSIS_PHASES[phaseIndex];

          return {
            ...session,
            progress: Math.min(next, 99), // Cap at 99 until API returns
            phase: currentPhase
          };
        });
      });
    }, 150);

    return () => clearInterval(interval);
  }, []); // Run continuously

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setTicker(value);
    
    if (value.length > 0) {
      const filtered = POPULAR_STOCKS.filter(stock => 
        stock.symbol.startsWith(value) || 
        stock.symbol.includes(value) || 
        stock.name.toUpperCase().includes(value)
      ).slice(0, 6);
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (symbol: string) => {
    setTicker(symbol);
    setShowSuggestions(false);
  };

  const handleSearch = async (e?: React.FormEvent, searchTicker?: string) => {
    if (e) e.preventDefault();
    const targetTicker = searchTicker || ticker;
    if (!targetTicker.trim()) return;

    // --- TEASER MODE ---
    // We allow guests to proceed freely. The ReportCard component will handle masking/locking data
    // based on user status. We do NOT block the search here anymore.

    if (!searchTicker) {
      setTicker(''); // Clear input for next search
    }
    setShowSuggestions(false);

    // Create unique ID for this session
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

    // Prevent duplicate active analysis for the same ticker
    if (analysisSessions.some(s => s.ticker === targetTicker && s.status === 'PROCESSING')) {
        return; 
    }

    const newSession: AnalysisSession = {
      id: sessionId,
      ticker: targetTicker,
      progress: 0,
      status: 'PROCESSING',
      phase: ANALYSIS_PHASES[0]
    };

    setAnalysisSessions(prev => [newSession, ...prev]);

    try {
      const data = await generateEquityReport(targetTicker, (chunk) => {
         // When we receive a chunk, update the UI to show streaming is active
         setAnalysisSessions(prev => prev.map(s => {
           if (s.id === sessionId && s.status === 'PROCESSING' && s.phase !== "Receiving neural stream...") {
             return { ...s, phase: "Receiving neural stream..." };
           }
           return s;
         }));
      });
      
      // COMPLETE ANALYSIS
      setAnalysisSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          progress: 100,
          status: 'READY',
          phase: "REPORT_DECLASSIFIED",
          result: data
        };
      }));

      // AUTO-SAVE to Library (as Unbookmarked / Recent)
      const newItem: SavedReportItem = {
        ticker: data.ticker,
        companyName: data.companyName,
        currentPrice: data.currentPrice,
        priceChange: data.priceChange,
        verdict: data.verdict,
        addedAt: Date.now(),
        fullReport: data,
        isBookmarked: false // Auto-save defaults to history, not bookmark
      };

      setReportLibrary(prev => {
        // Remove old version if exists (so we update with fresh data)
        const filtered = prev.filter(i => i.ticker !== newItem.ticker);
        return [newItem, ...filtered];
      });
      
      // Track usage (legacy counter, kept for potential future use)
      const customKey = localStorage.getItem('ultramagnus_user_api_key');
      if (!user && !customKey) {
        const newCount = guestUsageCount + 1;
        setGuestUsageCount(newCount);
        localStorage.setItem('ultramagnus_guest_usage', newCount.toString());
      }

    } catch (err: any) {
      console.error(err);
      setAnalysisSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          status: 'ERROR',
          progress: 0,
          phase: "ANALYSIS_FAILED",
          error: err.message || "Failed to generate report."
        };
      }));
    }
  };

  // Modified to open modal instead of changing view mode
  const handleViewSample = () => {
    setReport(SAMPLE_REPORT);
    setTicker("ASTRO");
    setShowDemoModal(true);
  };

  const handleCloseDemoModal = () => {
    setShowDemoModal(false);
  };

  const handleViewAnalyzedReport = (sessionId: string) => {
    const session = analysisSessions.find(s => s.id === sessionId);
    if (session?.result) {
      setReport(session.result);
      setViewMode('REPORT');
    }
  };

  const handleCancelAnalysis = (sessionId: string) => {
    setAnalysisSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  // Smart Navigation (Logo Click)
  const handleHome = () => {
    // If viewing a report or settings, go back to Dashboard
    if (viewMode === 'REPORT' || viewMode === 'SETTINGS') {
      setViewMode('DASHBOARD');
      setReport(null);
      setTicker('');
      return;
    }

    // If on Dashboard...
    if (viewMode === 'DASHBOARD') {
      if (user) {
        // Logged in users stay on Dashboard (reset search)
        setTicker('');
        setShowSuggestions(false);
      } else {
        // Guests exit to Landing Page
        setViewMode('LANDING');
      }
    }
  };

  // Toggle Bookmark Status (Save/Unsave without deleting)
  const toggleBookmarkReport = (item: SavedReportItem) => {
    // If we are in demo mode (on landing page), clicking bookmark should prompt login
    if (showDemoModal && !user) {
       handleOpenAuth();
       return;
    }

    setReportLibrary(prev => {
      const existing = prev.find(i => i.ticker === item.ticker);
      if (existing) {
        // Update existing item's bookmark status
        return prev.map(i => i.ticker === item.ticker 
          ? { ...i, isBookmarked: !i.isBookmarked } 
          : i
        );
      } else {
        // Edge case: Add new item as bookmarked (if not found in library)
        return [{ ...item, isBookmarked: true }, ...prev];
      }
    });
  };

  // Permanently Remove from Library
  const deleteReport = (tickerToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReportLibrary(reportLibrary.filter(item => item.ticker !== tickerToRemove));
  };
  
  const loadReport = (item: SavedReportItem) => {
    if (item.fullReport) {
      setReport(item.fullReport);
      setViewMode('REPORT');
    } else {
      // Re-analyze if full report not saved (legacy support)
      handleSearch(undefined, item.ticker);
    }
  };

  // Auth Handlers
  const handleLogin = (email: string, name: string) => {
    const newUser: UserProfile = {
      id: Date.now().toString(),
      name: name,
      email: email,
      tier: 'Pro', // Simulate upgrade on login
      joinDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    };
    localStorage.setItem('ultramagnus_user', JSON.stringify(newUser));
    setUser(newUser);
    // Explicitly set view mode to ensure transition from Landing to Dashboard
    setViewMode('DASHBOARD');
    setShowDemoModal(false); // Close demo if open
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('ultramagnus_user');
    // Always return to landing on logout
    setViewMode('LANDING');
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
     setUser(updatedUser);
     localStorage.setItem('ultramagnus_user', JSON.stringify(updatedUser));
  };
  
  const handleOpenAuth = () => {
     setAuthModalMessage('Unlock terminal access.'); // Reset message
     setIsAuthModalOpen(true);
  }

  // Navigation to Settings Page
  const handleOpenSettings = () => {
     if (user) {
        setViewMode('SETTINGS');
     } else {
        setAuthModalMessage("Please sign in to configure account settings.");
        setIsAuthModalOpen(true);
     }
  };

  const currentReportInLibrary = report ? reportLibrary.find(w => w.ticker === report.ticker) : undefined;
  const isBookmarked = currentReportInLibrary?.isBookmarked || false;

  // Fallback guest user for display if no user logged in
  const displayUser = user || { name: "Guest Trader", tier: "Guest", email: "", joinDate: "", id: "guest" };

  // Determine Teaser Mode: Guest + No Custom Key + Not Demo
  const customKey = localStorage.getItem('ultramagnus_user_api_key');
  const isTeaserMode = !user && !customKey && report?.ticker !== 'ASTRO';

  return (
    <div className="min-h-screen font-sans bg-dark text-slate-200 relative overflow-hidden pb-20 selection:bg-amber-500/30">
      
      {/* BACKGROUND GRID */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-grid-pattern bg-[size:40px_40px] opacity-[0.05]"></div>
      
      {/* GLOWS */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-amber-500/5 blur-[150px] pointer-events-none"></div>
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 blur-[150px] pointer-events-none"></div>

      {viewMode === 'LANDING' ? (
        <LandingPage 
           onStartAnalysis={() => setViewMode('DASHBOARD')}
           onViewDemo={handleViewSample} 
           onLogin={handleOpenAuth}
        />
      ) : viewMode === 'SETTINGS' && user ? (
         <div className="relative z-10">
            <AccountSettingsPage 
               user={user} 
               onUpdateUser={handleUpdateUser} 
               onBack={() => setViewMode('DASHBOARD')}
            />
         </div>
      ) : (
        <div className="relative z-10">
          <Header 
            onHome={handleHome} 
            savedCount={reportLibrary.filter(r => r.isBookmarked).length} 
            user={user}
            onLogin={handleOpenAuth}
            onLogout={handleLogout}
            onOpenSettings={handleOpenSettings}
          />
          
          <main className={`container mx-auto px-4 max-w-7xl transition-all duration-500 ease-in-out ${viewMode === 'DASHBOARD' ? 'pt-8' : 'pt-6'}`}>
            
            {viewMode === 'DASHBOARD' ? (
              <Dashboard 
                user={displayUser}
                reportLibrary={reportLibrary}
                onSearch={handleSearch}
                onLoadReport={loadReport}
                onDeleteReport={deleteReport}
                tickerInput={ticker}
                onTickerChange={handleInputChange}
                suggestions={suggestions}
                showSuggestions={showSuggestions}
                onSelectSuggestion={handleSelectSuggestion}
                setShowSuggestions={setShowSuggestions}
                onViewSample={handleViewSample}
                analysisSessions={analysisSessions}
                onViewAnalyzedReport={handleViewAnalyzedReport}
                onCancelAnalysis={handleCancelAnalysis}
              />
            ) : (
              <div className="min-h-[400px]">
                {report && (
                  <ReportCard 
                    report={report} 
                    isBookmarked={isBookmarked}
                    onToggleBookmark={toggleBookmarkReport}
                    isTeaserMode={isTeaserMode}
                    onUnlock={handleOpenAuth}
                  />
                )}
              </div>
            )}

          </main>
        </div>
      )}

      {/* DEMO REPORT POP-UP MODAL */}
      {showDemoModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-dark/90 backdrop-blur-md transition-opacity"
             onClick={handleCloseDemoModal}
           ></div>

           {/* Modal Content - TERMINAL STYLE */}
           <div className="relative w-full max-w-7xl max-h-[90vh] bg-surface rounded-none border-2 border-amber-500/50 shadow-neon-amber flex flex-col animate-fade-in-up clip-corner-all">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
                 <div className="flex items-center gap-3">
                    <span className="bg-amber-500 text-black px-2 py-0.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono">
                       <Eye className="w-3.5 h-3.5" /> PREVIEW_MODE
                    </span>
                    <h3 className="text-amber-500 font-bold tracking-widest uppercase font-display">Ultramagnus // DEMO_REPORT</h3>
                 </div>
                 <div className="flex items-center gap-4">
                     {!user && (
                        <button 
                           onClick={handleOpenAuth}
                           className="hidden sm:flex text-xs font-bold text-amber-500/70 hover:text-amber-400 transition-colors uppercase tracking-widest"
                        >
                           [ Create Account ]
                        </button>
                     )}
                     <button 
                        onClick={handleCloseDemoModal}
                        className="p-2 text-amber-500 hover:text-white hover:bg-amber-500 transition-all border border-amber-500/30"
                     >
                        <X className="w-5 h-5" />
                     </button>
                 </div>
              </div>

              {/* Scrollable Report Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar bg-dark p-4 md:p-8 relative">
                 <div className="absolute inset-0 bg-grid-pattern bg-[size:20px_20px] opacity-10 pointer-events-none"></div>
                 <div className="max-w-6xl mx-auto relative z-10">
                    <ReportCard 
                      report={report} 
                      isBookmarked={false} // Demo doesn't show bookmarked state
                      onToggleBookmark={toggleBookmarkReport} // Leads to auth
                      isTeaserMode={false} // Unlock everything for demo
                      onUnlock={() => {}} // No-op
                    />
                 </div>
              </div>
              
              {/* Footer CTA (Sticky) */}
              {!user && (
                 <div className="p-4 bg-surface border-t border-amber-500/30 flex flex-col sm:flex-row items-center justify-center gap-4 text-center shrink-0">
                    <p className="text-sm text-amber-500/80 font-mono">Ready to access real-time terminal data?</p>
                    <button 
                       onClick={handleOpenAuth}
                       className="px-8 py-3 bg-amber-500 text-black font-bold uppercase tracking-widest hover:bg-amber-400 transition-colors shadow-neon-amber text-xs flex items-center gap-2 clip-corner-br"
                    >
                       Initialize Account <ArrowRight className="w-4 h-4" />
                    </button>
                 </div>
              )}
           </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={handleLogin}
        message={authModalMessage}
      />

    </div>
  );
}

export default App;