
export interface FinancialYear {
  year: string;
  // Income Statement
  revenue: number; // Billions/Millions
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  
  // Balance Sheet Highlights
  cashAndEquivalents: number;
  totalDebt: number;
  shareholderEquity: number;
  
  // Cash Flow
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
}

export interface PricePoint {
  month: string;
  price: number;
}

export interface AnalystTarget {
  month: string;
  averageTarget: number;
}

export interface FactorItem {
  title: string;
  detail: string;
}

export interface FactorAnalysis {
  positive: FactorItem[];
  negative: FactorItem[];
}

export interface NewsItem {
  headline: string;
  date: string;
}

export interface PeerComparison {
  ticker: string;
  name: string;
  marketCap: string;
  peRatio: string;
  revenueGrowth: string;
  netMargin: string;
}

export interface EarningsAnalysis {
  sentiment: "Bullish" | "Neutral" | "Bearish";
  summary: string;
  keyTakeaways: string[];
}

export interface SavedReportItem {
  ticker: string;
  companyName: string;
  currentPrice: string;
  priceChange: string;
  verdict: "BUY" | "HOLD" | "SELL";
  addedAt: number;
  fullReport?: EquityReport; // Stores the complete analysis
  isBookmarked?: boolean; // True if user manually saved/pinned it, False if auto-saved history
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  tier: "Guest" | "Pro" | "Institutional";
  avatarUrl?: string;
  joinDate: string;
  apiKey?: string; // Optional: User's custom API key
}

export interface PriceTargetModel {
  estimatedEPS: string;
  targetPE: string;
  growthRate: string;
  logic: string;
}

export interface InsiderTransaction {
  insiderName: string;
  role: string;
  transactionDate: string;
  transactionType: "Buy" | "Sell";
  shares: string;
  value: string;
}

export interface RiskMetrics {
  beta: string; // e.g. "1.45"
  shortInterestPercentage: string; // e.g. "12.5%"
  shortInterestRatio: string; // Days to cover, e.g. "3.2"
  volatility: string; // e.g. "High"
}

export interface Scenario {
  label: "Bear" | "Base" | "Bull";
  price: string;
  logic: string;
  probability?: string; // e.g. "25%"
}

export interface MoatAnalysis {
  moatRating: "Wide" | "Narrow" | "None";
  moatSource: string; // e.g. "Network Effect", "Cost Advantage"
  rationale: string;
}

export interface ManagementAnalysis {
  executiveTenure: string; // e.g. "CEO 15y, CFO 3y"
  insiderOwnership: string; // e.g. "12.5%"
  trackRecord: string; // e.g. "Previous exit to Google for $2B"
  governanceRedFlags: string; // e.g. "Clean audit history" or "Dual class structure concerns"
  verdict: string; // 1-2 line summary
}

export interface CatalystEvent {
  date: string;
  event: string;
  impact: "High" | "Medium" | "Low";
}

export interface AnalysisHistory {
  previousDate: string; // e.g. "Aug 2024"
  previousVerdict: "BUY" | "HOLD" | "SELL";
  changeRationale: string[]; // ["Missed earnings", "Guidance cut"]
}

export interface EquityReport {
  companyName: string;
  ticker: string;
  reportDate: string; // Added timestamp
  
  // Summary Table Data
  currentPrice: string;
  priceChange: string;
  marketCap: string;
  peRatio: string;
  dayHigh: string;
  dayLow: string;
  week52High: string;
  week52Low: string;
  
  // Price Target
  priceTarget: string; // e.g. "$150.00"
  priceTargetRange: string; // e.g. "$130 - $160"
  priceTargetModel?: PriceTargetModel;
  
  // Value Add: Scenario Analysis
  scenarioAnalysis?: {
    bear: Scenario;
    base: Scenario;
    bull: Scenario;
  };

  summary: string;
  rocketScore: number; // 0-100
  rocketReason: string;
  financialHealthScore: number; // 0-100
  financialHealthReason: string;
  momentumScore: number; // 0-100 (Technical/Volume score)
  momentumReason: string;
  
  // Value Add: Moat Analysis
  moatAnalysis?: MoatAnalysis;
  
  // Value Add: Management Quality
  managementQuality?: ManagementAnalysis;

  // Value Add: Thesis Evolution
  history?: AnalysisHistory;
  
  // Analysis
  shortTermFactors: FactorAnalysis;
  longTermFactors: FactorAnalysis;
  
  financials: FinancialYear[];
  priceHistory: PricePoint[];
  analystPriceTargets?: AnalystTarget[]; // New Field for Historical Targets
  peers: PeerComparison[];
  
  // Refined Events
  upcomingEvents: CatalystEvent[];
  recentNews: NewsItem[];
  earningsCallAnalysis: EarningsAnalysis;
  
  // New Sentiment Field
  overallSentiment: {
    score: number; // 0-100 (0 = Very Bearish, 100 = Very Bullish)
    label: "Bullish" | "Neutral" | "Bearish";
    summary: string; // Aggregated summary of news + earnings tone
  };
  
  // Fund Manager Value Add
  insiderActivity: InsiderTransaction[];
  riskMetrics: RiskMetrics;
  institutionalSentiment: string; // e.g. "Accumulating", "Distributing"
  
  tags: string[];
  
  valuation: string;
  verdict: "BUY" | "HOLD" | "SELL";
  verdictReason: string;
  sources?: { title: string; uri: string }[];
}

export enum LoadingState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// Background Analysis Types
export type AnalysisStatus = 'PROCESSING' | 'READY' | 'ERROR';

export interface AnalysisSession {
  id: string; // Unique ID for concurrent sessions
  ticker: string;
  progress: number; // 0 - 100
  status: AnalysisStatus;
  phase: string;
  error?: string;
  result?: EquityReport;
}
