
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EquityReport, PricePoint, FinancialYear, SavedReportItem, FactorAnalysis } from '../types';
import { chatWithGemini } from '../services/geminiService';
import { 
  Target, 
  Calendar, 
  Newspaper,
  PhoneCall,
  Hash,
  ExternalLink,
  DollarSign,
  BarChart2,
  Activity,
  Table,
  PieChart,
  Rocket,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Check,
  Download,
  Goal,
  ShieldCheck,
  Bookmark,
  BookmarkCheck,
  Gauge,
  ChevronDown,
  X,
  Info,
  Calculator,
  Briefcase,
  AlertTriangle,
  Lock,
  Castle,
  Zap,
  BarChart,
  NotebookPen,
  Save,
  Sparkles,
  Bot,
  Lightbulb,
  History,
  ArrowRight,
  Clock,
  FolderCheck,
  MessageSquare,
  Send,
  Minimize2,
  RefreshCw,
  BookOpen,
  UserCheck,
  Terminal,
  Cpu,
  Share2,
  Radio,
  User,
  AlertOctagon
} from 'lucide-react';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
  ComposedChart,
  AreaChart,
  Area,
  Cell,
  Scatter,
  ScatterChart,
  ReferenceLine
} from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ReportCardProps {
  report: EquityReport;
  isBookmarked: boolean;
  onToggleBookmark: (item: SavedReportItem) => void;
  isTeaserMode?: boolean;
  onUnlock?: () => void;
}

// Helper to parse price strings "$150.00" -> 150.00
const parsePrice = (priceStr: string) => {
  try {
    if (!priceStr) return 0;
    return parseFloat(priceStr.replace(/[^0-9.]/g, ''));
  } catch (e) {
    return 0;
  }
};

// Helper to calculate Linear Regression (y = mx + b)
const calculateTrendLine = (data: PricePoint[], startIndex: number, endIndex: number, totalLength: number) => {
  const slicedData = data.slice(startIndex, endIndex);
  const n = slicedData.length;
  if (n < 2) return [];

  let sumX = 0, sumY = 0, sumXY = 0, sumXY2 = 0, sumXX = 0;
  
  slicedData.forEach((point, i) => {
    const x = startIndex + i;
    const y = point.price;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const trendPoints = [];
  for(let i = startIndex; i < endIndex; i++) {
    trendPoints.push({
      index: i,
      value: slope * i + intercept
    });
  }
  return trendPoints;
};

// --- CHAT WIDGET (PORTAL) ---
interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

const ChatWidget = ({ 
  report, 
  userNotes, 
  userThesis,
  isOpen,
  onToggle
}: { 
  report: EquityReport; 
  userNotes: string; 
  userThesis: string;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: `SYSTEM_READY: ULTRAMAGNUS AI ONLINE. \nTarget: ${report.ticker} identified. Awaiting query...`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const QUICK_PROMPTS = [
    "SUMMARIZE_BULL_CASE",
    "IDENTIFY_RISKS",
    "EXPLAIN_VALUATION",
    "COMPARE_PEERS",
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || inputValue;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      history.push({ role: 'user', text: userMsg.text });

      const responseText = await chatWithGemini(report, history, userNotes, userThesis);
      
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "ERR: CONNECTION_LOST. RETRY_SEQUENCE_INITIATED.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none print:hidden overflow-hidden">
      
      <div className="w-full h-full relative p-4 md:p-6 flex flex-col items-end justify-end">
        {/* CHAT WINDOW */}
        <div 
          className={`
            pointer-events-auto
            w-[90vw] md:w-[450px] 
            bg-black/95 backdrop-blur-md 
            border-2 border-amber-500
            shadow-neon-amber clip-corner-br
            flex flex-col
            transition-all duration-300 origin-bottom-right
            mb-20 md:mb-24
            ${isOpen ? 'h-[600px] max-h-[80vh] opacity-100 scale-100 translate-y-0' : 'h-0 opacity-0 scale-90 translate-y-10'}
          `}
        >
          {/* Header */}
          <div className="px-4 py-2 bg-amber-500/20 border-b border-amber-500/50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-amber-500 font-mono tracking-widest uppercase">AI_UPLINK</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-blink"></div>
              <button onClick={onToggle}><X className="w-4 h-4 text-amber-500 hover:text-white" /></button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/50 font-mono text-xs md:text-sm">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div 
                  className={`max-w-[85%] p-3 border ${
                    msg.role === 'user' 
                      ? 'bg-amber-900/20 border-amber-500/50 text-amber-100' 
                      : 'bg-slate-900/50 border-slate-700 text-green-400'
                  }`}
                >
                  {msg.role === 'model' && <div className="text-[10px] text-slate-500 mb-1">>> SYSTEM</div>}
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="text-green-500 animate-pulse font-mono text-xs">PROCESSING...</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {messages.length < 3 && !isTyping && (
            <div className="px-4 py-2 bg-black border-t border-slate-800 flex gap-2 overflow-x-auto no-scrollbar">
               {QUICK_PROMPTS.map((prompt) => (
                 <button
                   key={prompt}
                   onClick={() => handleSend(prompt)}
                   className="whitespace-nowrap px-2 py-1 bg-slate-800 border border-slate-600 text-[10px] text-amber-500 hover:bg-amber-500 hover:text-black font-mono font-bold uppercase"
                 >
                   {prompt}
                 </button>
               ))}
            </div>
          )}

          {/* Input Footer */}
          <div className="p-3 bg-black border-t border-amber-500/30 shrink-0 flex gap-2">
            <span className="text-amber-500 font-mono pt-2">{'>'}</span>
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ENTER_COMMAND..."
                className="w-full bg-transparent text-sm text-green-500 placeholder-slate-700 focus:outline-none font-mono uppercase"
                disabled={isTyping}
                autoComplete="off"
            />
            <button onClick={() => handleSend()} className="text-amber-500 hover:text-white"><Send className="w-4 h-4" /></button>
          </div>
        </div>

        {/* FAB */}
        <button 
          onClick={onToggle}
          className={`
            absolute bottom-6 right-6 pointer-events-auto
            w-16 h-16 bg-black border-2 border-amber-500 shadow-neon-amber clip-corner-br
            flex items-center justify-center hover:bg-amber-500 group transition-all
          `}
        >
          {isOpen ? <ChevronDown className="w-8 h-8 text-amber-500 group-hover:text-black" /> : <Terminal className="w-8 h-8 text-amber-500 group-hover:text-black" />}
        </button>
      </div>
    </div>,
    document.body
  );
};

// --- LOCKED COMPONENT ---
const LockedFeature = ({ children, isLocked, onUnlock, label, className, ...props }: any) => {
  if (!isLocked) return <div className={className} {...props}>{children}</div>;
  return (
    <div className={`relative overflow-hidden border border-slate-800 bg-striped ${className || ''}`} {...props}>
      <div className="opacity-10 filter blur-sm grayscale pointer-events-none select-none h-full">{children}</div>
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
         <div className="border border-red-500 bg-black p-6 text-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <Lock className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <h4 className="text-red-500 font-bold font-mono text-lg uppercase tracking-widest">ACCESS_DENIED</h4>
            <p className="text-xs text-slate-400 font-mono mb-4 uppercase">Security Clearance Required</p>
            <button 
             onClick={onUnlock}
             className="px-6 py-2 bg-red-500 text-black font-bold uppercase tracking-widest hover:bg-white transition-colors text-xs"
           >
             Override Lock
           </button>
         </div>
      </div>
    </div>
  )
};

// --- MAIN REPORT CARD ---
const ReportCard: React.FC<ReportCardProps> = ({ report, isBookmarked, onToggleBookmark, isTeaserMode = false, onUnlock }) => {
  const [chartTab, setChartTab] = useState<'financials' | 'price' | 'peers'>('price');
  const [factorTab, setFactorTab] = useState<'short' | 'long'>('short');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const isPriceUp = report.priceChange.startsWith('+');
  const priceColor = isPriceUp ? 'text-green-500' : report.priceChange.startsWith('-') ? 'text-red-500' : 'text-slate-200';
  const verdictColor = report.verdict === 'BUY' ? 'text-green-500 border-green-500' : report.verdict === 'SELL' ? 'text-red-500 border-red-500' : 'text-amber-500 border-amber-500';

  // --- CHARTS DATA PREP (Simplified for Brevity) ---
  const priceChartData = useMemo(() => {
    if (!report.priceHistory || report.priceHistory.length === 0) return [];
    const data = report.priceHistory;
    const totalPoints = data.length;
    const shortTermTrend = calculateTrendLine(data, Math.max(0, totalPoints - 6), totalPoints, totalPoints);
    return data.map((point, index) => {
      const stPoint = shortTermTrend.find(p => p.index === index);
      return { ...point, shortTermTrend: stPoint ? stPoint.value : null };
    });
  }, [report.priceHistory]);

  const financials = report.financials || [];

  return (
    <div ref={reportRef} className="space-y-6 animate-fade-in-up pb-20 font-sans">
      
      {/* 1. TERMINAL HEADER */}
      <div className="bg-panel border-2 border-slate-700 relative overflow-hidden p-6 clip-corner-br">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row justify-between items-start relative z-10 gap-6">
          <div className="flex-1">
             <div className="flex items-center gap-4 mb-2">
                <div className="text-4xl md:text-6xl font-display font-black text-white uppercase tracking-tighter leading-none">
                   {report.ticker}
                </div>
                <div className="h-10 w-px bg-slate-600 rotate-12"></div>
                <div className="flex flex-col">
                   <div className="text-xl font-mono text-amber-500 uppercase">{report.companyName}</div>
                   <div className="text-xs font-mono text-slate-500 uppercase">ISIN: {Math.random().toString(36).substr(2, 9).toUpperCase()} // SECTOR: {report.tags?.[0] || 'Unknown'}</div>
                </div>
             </div>
             
             <div className="flex items-baseline gap-4 mt-4">
                <div className="text-5xl font-mono text-white">{report.currentPrice}</div>
                <div className={`text-xl font-mono font-bold px-2 py-0.5 border ${isPriceUp ? 'border-green-500 bg-green-900/20 text-green-500' : 'border-red-500 bg-red-900/20 text-red-500'}`}>
                   {report.priceChange}
                </div>
             </div>
             
             <p className="mt-6 text-slate-300 font-mono text-sm border-l-2 border-amber-500 pl-4 max-w-3xl leading-relaxed">
                {report.summary}
             </p>
          </div>

          <div className="flex flex-col gap-2 min-w-[150px]">
             <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">SYSTEM_ACTIONS</div>
             <button 
               onClick={() => onToggleBookmark({ ...report, addedAt: Date.now(), isBookmarked: !isBookmarked } as any)}
               className={`w-full py-2 px-3 border border-dashed font-bold font-mono text-xs uppercase transition-all hover:bg-white/5 ${isBookmarked ? 'border-amber-500 text-amber-500' : 'border-slate-600 text-slate-400'}`}
             >
               {isBookmarked ? '[ SAVED ]' : '[ SAVE_TO_TAPE ]'}
             </button>
             <button className="w-full py-2 px-3 border border-dashed border-slate-600 text-slate-400 font-bold font-mono text-xs uppercase hover:text-cyan-400 hover:border-cyan-400 transition-all">
               [ EXPORT_CSV ]
             </button>
          </div>
        </div>
      </div>

      {/* 2. DASHBOARD GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
         
         {/* VERDICT MODULE */}
         <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Analyst Verdict" className="xl:col-span-3 bg-black border-2 border-slate-700 flex flex-col clip-corner-br">
            <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
               <span>AI_VERDICT</span>
               <Target className="w-3 h-3" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
               <div className={`text-4xl font-display font-black tracking-widest uppercase border-4 p-4 mb-2 ${verdictColor}`}>
                  {report.verdict}
               </div>
               <div className="text-xs font-mono text-slate-500 uppercase">Confidence Interval: 94%</div>
            </div>
         </LockedFeature>

         {/* INTELLIGENCE MODULE */}
         <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Intelligence" className="xl:col-span-9 bg-panel border-2 border-slate-700 clip-corner-br">
            <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
               <span>ALPHA_INTELLIGENCE_METRICS</span>
               <Cpu className="w-3 h-3" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-700">
               {/* Rocket */}
               <div className="p-6 flex flex-col items-center text-center">
                  <div className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Moonshot_Score</div>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                     <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="60" stroke="#1e293b" strokeWidth="8" fill="none" />
                        <circle cx="64" cy="64" r="60" stroke="#f59e0b" strokeWidth="8" fill="none" strokeDasharray={377} strokeDashoffset={377 - (377 * report.rocketScore) / 100} />
                     </svg>
                     <div className="absolute text-3xl font-mono font-bold text-white">{report.rocketScore}</div>
                  </div>
                  <p className="mt-4 text-[10px] font-mono text-slate-400 leading-tight px-4">{report.rocketReason}</p>
               </div>
               {/* Health */}
               <div className="p-6 flex flex-col items-center text-center bg-striped">
                  <div className="text-xs font-bold text-green-500 uppercase tracking-widest mb-2">Fin_Health</div>
                  <div className="text-5xl font-mono font-bold text-white mb-2">{report.financialHealthScore}</div>
                  <div className="w-full h-2 bg-slate-800 rounded-none overflow-hidden border border-slate-600">
                     <div className="h-full bg-green-500" style={{ width: `${report.financialHealthScore}%` }}></div>
                  </div>
                  <p className="mt-4 text-[10px] font-mono text-slate-400 leading-tight">{report.financialHealthReason}</p>
               </div>
               {/* Momentum */}
               <div className="p-6 flex flex-col items-center text-center">
                  <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">Momentum</div>
                  <div className="text-5xl font-mono font-bold text-white mb-2">{report.momentumScore}</div>
                  <div className="w-full flex gap-1 justify-center">
                     {[...Array(10)].map((_, i) => (
                        <div key={i} className={`w-2 h-4 ${i < (report.momentumScore/10) ? 'bg-cyan-500' : 'bg-slate-800'}`}></div>
                     ))}
                  </div>
                  <p className="mt-4 text-[10px] font-mono text-slate-400 leading-tight">{report.momentumReason}</p>
               </div>
            </div>
         </LockedFeature>

      </div>

      {/* 3. STRATEGIC ASSESSMENT ROW (Moat & Management) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Economic Moat" className="bg-panel border-2 border-slate-700 clip-corner-br">
              <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>ECONOMIC_MOAT_ANALYSIS</span>
                 <Castle className="w-3 h-3" />
              </div>
              <div className="p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold uppercase text-slate-500">Moat Rating</span>
                     <span className={`px-2 py-1 font-bold font-mono text-sm border ${
                        report.moatAnalysis?.moatRating === 'Wide' ? 'border-green-500 text-green-500 bg-green-900/20' : 
                        report.moatAnalysis?.moatRating === 'Narrow' ? 'border-amber-500 text-amber-500 bg-amber-900/20' : 
                        'border-red-500 text-red-500 bg-red-900/20'
                     }`}>
                        {report.moatAnalysis?.moatRating || 'UNRATED'}
                     </span>
                  </div>
                  <div className="space-y-1">
                     <span className="text-xs font-bold uppercase text-slate-500">Primary Source</span>
                     <div className="font-mono text-white text-sm">{report.moatAnalysis?.moatSource || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                     <span className="text-xs font-bold uppercase text-slate-500">Rationale</span>
                     <p className="font-mono text-xs text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-3">
                        {report.moatAnalysis?.rationale || 'Insufficient data to determine competitive advantage.'}
                     </p>
                  </div>
              </div>
          </LockedFeature>

          <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Management Quality" className="bg-panel border-2 border-slate-700 clip-corner-br">
              <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>MANAGEMENT_GOVERNANCE</span>
                 <UserCheck className="w-3 h-3" />
              </div>
              <div className="p-6 flex flex-col gap-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Exec Tenure</div>
                       <div className="font-mono text-white text-xs">{report.managementQuality?.executiveTenure || 'N/A'}</div>
                    </div>
                    <div>
                       <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Insider Ownership</div>
                       <div className="font-mono text-amber-500 text-xs">{report.managementQuality?.insiderOwnership || 'N/A'}</div>
                    </div>
                 </div>
                 
                 <div>
                     <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Track Record</div>
                     <div className="font-mono text-xs text-slate-300">{report.managementQuality?.trackRecord}</div>
                 </div>

                 {report.managementQuality?.governanceRedFlags && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30">
                       <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase mb-1">
                          <AlertTriangle className="w-3 h-3" /> Governance Flag
                       </div>
                       <p className="text-[10px] font-mono text-red-400">{report.managementQuality.governanceRedFlags}</p>
                    </div>
                 )}
              </div>
          </LockedFeature>
      </div>

      {/* 4. THESIS DRIVERS (OUTLOOK) */}
      <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Factor Analysis" className="bg-black border-2 border-slate-700 clip-corner-br">
          <div className="flex items-center border-b border-slate-700">
             <button 
                onClick={() => setFactorTab('short')}
                className={`px-6 py-3 text-xs font-bold font-mono uppercase tracking-widest transition-colors border-r border-slate-700 ${factorTab === 'short' ? 'bg-amber-500 text-black' : 'text-slate-500 hover:text-white'}`}
             >
                Short_Term_Outlook
             </button>
             <button 
                onClick={() => setFactorTab('long')}
                className={`px-6 py-3 text-xs font-bold font-mono uppercase tracking-widest transition-colors ${factorTab === 'long' ? 'bg-amber-500 text-black' : 'text-slate-500 hover:text-white'}`}
             >
                Long_Term_Thesis
             </button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* Positive Catalysts */}
             <div>
                <h4 className="flex items-center gap-2 text-green-500 text-xs font-bold uppercase tracking-widest mb-4 border-b border-green-500/30 pb-2">
                   <TrendingUp className="w-4 h-4" /> 
                   {factorTab === 'short' ? 'Bullish Catalysts' : 'Secular Tailwinds'}
                </h4>
                <ul className="space-y-4">
                   {(factorTab === 'short' ? report.shortTermFactors?.positive : report.longTermFactors?.positive)?.map((factor, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                         <div className="mt-1 w-1.5 h-1.5 bg-green-500 rounded-full group-hover:animate-pulse"></div>
                         <div>
                            <div className="text-sm font-bold text-white mb-0.5 font-mono">{factor.title}</div>
                            <div className="text-xs text-slate-400 font-mono leading-relaxed">{factor.detail}</div>
                         </div>
                      </li>
                   ))}
                </ul>
             </div>

             {/* Negative Risks */}
             <div>
                <h4 className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-widest mb-4 border-b border-red-500/30 pb-2">
                   <AlertOctagon className="w-4 h-4" /> 
                   {factorTab === 'short' ? 'Bearish Risks' : 'Structural Headwinds'}
                </h4>
                <ul className="space-y-4">
                   {(factorTab === 'short' ? report.shortTermFactors?.negative : report.longTermFactors?.negative)?.map((factor, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                         <div className="mt-1 w-1.5 h-1.5 bg-red-500 rounded-full group-hover:animate-pulse"></div>
                         <div>
                            <div className="text-sm font-bold text-white mb-0.5 font-mono">{factor.title}</div>
                            <div className="text-xs text-slate-400 font-mono leading-relaxed">{factor.detail}</div>
                         </div>
                      </li>
                   ))}
                </ul>
             </div>
          </div>
      </LockedFeature>

      {/* 5. CHARTS & DATA TERMINAL (Existing) */}
      <div className="bg-black border-2 border-slate-700 p-1">
         <div className="flex items-center gap-1 mb-1">
             <button 
               onClick={() => setChartTab('price')} 
               className={`flex-1 py-2 text-xs font-bold font-mono uppercase tracking-widest ${chartTab === 'price' ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
             >
                Price_Action
             </button>
             <button 
               onClick={() => setChartTab('financials')} 
               className={`flex-1 py-2 text-xs font-bold font-mono uppercase tracking-widest ${chartTab === 'financials' ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
             >
                Financials
             </button>
             <button 
               onClick={() => setChartTab('peers')} 
               className={`flex-1 py-2 text-xs font-bold font-mono uppercase tracking-widest ${chartTab === 'peers' ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
             >
                Peer_Matrix
             </button>
         </div>

         <div className="bg-[#050505] border border-slate-800 h-[400px] relative p-4">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none z-10"></div>
            
            {chartTab === 'price' && (
               <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={priceChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="month" stroke="#666" tick={{fontSize: 10, fontFamily: 'Share Tech Mono'}} axisLine={false} />
                    <YAxis stroke="#666" tick={{fontSize: 10, fontFamily: 'Share Tech Mono'}} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#000', borderColor: '#f59e0b', color: '#f59e0b', fontFamily: 'Share Tech Mono' }}
                        itemStyle={{ color: '#f59e0b' }}
                        cursor={{ stroke: '#f59e0b', strokeWidth: 1 }}
                    />
                    <Area type="monotone" dataKey="price" stroke="#f59e0b" fill="url(#colorAmber)" strokeWidth={2} dot={false} />
                    <defs>
                       <linearGradient id="colorAmber" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <Line type="monotone" dataKey="shortTermTrend" stroke="#06b6d4" strokeDasharray="5 5" dot={false} strokeWidth={1} />
                 </ComposedChart>
               </ResponsiveContainer>
            )}

            {chartTab === 'financials' && (
               <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={report.financials || []}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                     <XAxis dataKey="year" stroke="#666" tick={{fontSize: 10, fontFamily: 'Share Tech Mono'}} />
                     <YAxis stroke="#666" tick={{fontSize: 10, fontFamily: 'Share Tech Mono'}} />
                     <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#06b6d4', color: '#fff' }} />
                     <Bar dataKey="revenue" fill="#06b6d4" barSize={40} name="Revenue" />
                     <Bar dataKey="netIncome" fill="#22c55e" barSize={40} name="Net Income" />
                  </ReBarChart>
               </ResponsiveContainer>
            )}

            {chartTab === 'peers' && (
               <div className="h-full overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left font-mono text-sm">
                     <thead className="text-slate-500 border-b border-slate-800 uppercase text-xs">
                        <tr>
                           <th className="p-3">Ticker</th>
                           <th className="p-3">Name</th>
                           <th className="p-3 text-right">Mkt Cap</th>
                           <th className="p-3 text-right">P/E</th>
                           <th className="p-3 text-right">Rev Growth</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                        {report.peers?.map((peer) => (
                           <tr key={peer.ticker} className="hover:bg-slate-900 transition-colors">
                              <td className="p-3 font-bold text-amber-500">{peer.ticker}</td>
                              <td className="p-3 text-slate-300">{peer.name}</td>
                              <td className="p-3 text-right text-slate-400">{peer.marketCap}</td>
                              <td className="p-3 text-right text-slate-400">{peer.peRatio}</td>
                              <td className="p-3 text-right text-green-500">{peer.revenueGrowth}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
         </div>
      </div>

      {/* 6. SCENARIO ANALYSIS (Existing) */}
      {report.scenarioAnalysis && (
        <LockedFeature isLocked={isTeaserMode} onUnlock={onUnlock} label="Scenario Modeling" className="bg-panel border-2 border-slate-700 p-6 clip-corner-br">
           <h3 className="text-sm font-bold font-mono text-white uppercase tracking-widest mb-6 border-b border-slate-700 pb-2">
              <Activity className="w-4 h-4 inline-block mr-2 text-amber-500" /> Probability_Scenarios
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['bear', 'base', 'bull'].map((key) => {
                  const scenario = report.scenarioAnalysis?.[key as 'bear'|'base'|'bull'];
                  if (!scenario) return null;
                  const colors = key === 'bear' ? 'border-red-500 text-red-500' : key === 'base' ? 'border-cyan-500 text-cyan-500' : 'border-green-500 text-green-500';
                  return (
                      <div key={key} className={`border-l-4 bg-slate-900/50 p-4 ${colors}`}>
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold uppercase tracking-widest">{scenario.label}</span>
                              <span className="text-xs font-mono bg-black px-1">{scenario.probability}</span>
                          </div>
                          <div className="text-2xl font-mono font-bold text-white mb-2">{scenario.price}</div>
                          <p className="text-[10px] text-slate-400 font-mono leading-relaxed">{scenario.logic}</p>
                      </div>
                  )
              })}
           </div>
        </LockedFeature>
      )}

      {/* 7. EVENTS & EARNINGS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Earnings Decoder */}
         <div className="lg:col-span-2 bg-panel border-2 border-slate-700 clip-corner-br">
             <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>LATEST_EARNINGS_DECODER</span>
                 <Radio className="w-3 h-3" />
             </div>
             <div className="p-6">
                 <div className="flex items-center gap-4 mb-4">
                     <div className={`px-3 py-1 text-xs font-bold uppercase border ${
                        report.earningsCallAnalysis?.sentiment === 'Bullish' ? 'border-green-500 text-green-500' :
                        report.earningsCallAnalysis?.sentiment === 'Bearish' ? 'border-red-500 text-red-500' :
                        'border-slate-500 text-slate-500'
                     }`}>
                        {report.earningsCallAnalysis?.sentiment || 'NEUTRAL'}
                     </div>
                     <span className="text-xs font-mono text-slate-500">Based on linguistic analysis of executive tone</span>
                 </div>
                 <p className="font-mono text-sm text-white mb-4 leading-relaxed">
                    {report.earningsCallAnalysis?.summary}
                 </p>
                 <div className="bg-black border border-slate-800 p-4">
                     <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Key_Takeaways</div>
                     <ul className="space-y-2">
                        {report.earningsCallAnalysis?.keyTakeaways?.map((point, i) => (
                           <li key={i} className="flex gap-2 text-xs font-mono text-slate-300">
                              <span className="text-amber-500">{'>'}</span> {point}
                           </li>
                        ))}
                     </ul>
                 </div>
             </div>
         </div>

         {/* Catalyst Calendar */}
         <div className="bg-panel border-2 border-slate-700 clip-corner-br">
             <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>CATALYST_CALENDAR</span>
                 <Calendar className="w-3 h-3" />
             </div>
             <div className="p-4 space-y-3">
                 {report.upcomingEvents?.length > 0 ? report.upcomingEvents.map((event, i) => (
                    <div key={i} className="flex gap-3 border-b border-dashed border-slate-800 pb-3 last:border-0">
                       <div className="text-center min-w-[50px]">
                          <div className="text-[10px] font-bold text-amber-500 uppercase">{new Date(event.date).toLocaleString('default', { month: 'short' })}</div>
                          <div className="text-lg font-mono font-bold text-white">{new Date(event.date).getDate()}</div>
                       </div>
                       <div>
                          <div className="text-xs font-bold text-white mb-0.5">{event.event}</div>
                          <div className={`text-[9px] font-bold uppercase inline-block px-1.5 rounded ${
                             event.impact === 'High' ? 'bg-red-900/50 text-red-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                             {event.impact} Impact
                          </div>
                       </div>
                    </div>
                 )) : (
                    <div className="text-xs text-slate-500 font-mono text-center py-4">No major events scheduled.</div>
                 )}
             </div>
         </div>
      </div>

      {/* 8. RISKS & INSIDERS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Insider Activity */}
          <div className="bg-panel border-2 border-slate-700 clip-corner-br">
             <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>INSIDER_FLOW</span>
                 <Users className="w-3 h-3" />
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                   <thead className="text-slate-500 border-b border-slate-800">
                      <tr>
                         <th className="p-3 font-normal">Insider</th>
                         <th className="p-3 font-normal">Role</th>
                         <th className="p-3 font-normal">Type</th>
                         <th className="p-3 font-normal text-right">Value</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800/50">
                      {report.insiderActivity?.map((trade, i) => (
                         <tr key={i} className="hover:bg-slate-900/50">
                            <td className="p-3 font-bold text-white">{trade.insiderName}</td>
                            <td className="p-3 text-slate-500">{trade.role}</td>
                            <td className={`p-3 font-bold ${trade.transactionType === 'Buy' ? 'text-green-500' : 'text-red-500'}`}>
                               {trade.transactionType}
                            </td>
                            <td className="p-3 text-right text-slate-300">{trade.value}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>

          {/* Risk Metrics */}
          <div className="bg-panel border-2 border-slate-700 clip-corner-br flex flex-col">
             <div className="bg-slate-900 p-2 border-b border-slate-700 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                 <span>RISK_MATRIX</span>
                 <AlertTriangle className="w-3 h-3" />
             </div>
             <div className="p-6 flex-1 flex flex-col justify-center gap-6">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-bold uppercase text-slate-500">Beta (Volatility)</span>
                   <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                         <div className="h-full bg-cyan-500" style={{ width: `${Math.min((parseFloat(report.riskMetrics?.beta || '1') / 2) * 100, 100)}%` }}></div>
                      </div>
                      <span className="font-mono text-white text-sm">{report.riskMetrics?.beta || 'N/A'}</span>
                   </div>
                </div>
                
                <div className="flex items-center justify-between">
                   <span className="text-xs font-bold uppercase text-slate-500">Short Interest</span>
                   <span className="font-mono text-red-500 font-bold text-sm">{report.riskMetrics?.shortInterestPercentage || 'N/A'}</span>
                </div>

                <div className="flex items-center justify-between">
                   <span className="text-xs font-bold uppercase text-slate-500">Institutional Bias</span>
                   <span className="font-mono text-amber-500 font-bold text-sm">{report.institutionalSentiment || 'Neutral'}</span>
                </div>
             </div>
          </div>
      </div>

      {/* CHAT WIDGET TRIGGER - Only show if unlocked */}
      {!isTeaserMode && (
         <ChatWidget 
            report={report}
            userNotes=""
            userThesis=""
            isOpen={isChatOpen}
            onToggle={() => setIsChatOpen(!isChatOpen)}
         />
      )}

    </div>
  );
};

export default ReportCard;
