
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { SavedReportItem, UserProfile, AnalysisSession, EquityReport } from '../types';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Database, 
  X, 
  Loader2, 
  Activity, 
  Zap, 
  Globe, 
  Clock,
  ArrowRight,
  Crown,
  Folder,
  Satellite,
  CheckCircle,
  AlertOctagon,
  Play,
  Trash2,
  Minus,
  Bookmark,
  Rocket,
  Filter,
  LayoutGrid,
  List,
  Layers,
  Bell,
  Calendar,
  MousePointer2,
  Disc,
  MoreVertical,
  HardDrive
} from 'lucide-react';

interface DashboardProps {
  user: UserProfile;
  reportLibrary: SavedReportItem[];
  onSearch: (e?: React.FormEvent, ticker?: string) => void;
  onLoadReport: (item: SavedReportItem) => void;
  onDeleteReport: (ticker: string, e: React.MouseEvent) => void;
  tickerInput: string;
  onTickerChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suggestions: {symbol: string, name: string}[];
  showSuggestions: boolean;
  onSelectSuggestion: (symbol: string) => void;
  setShowSuggestions: (show: boolean) => void;
  onViewSample: () => void;
  analysisSessions: AnalysisSession[];
  onViewAnalyzedReport: (id: string) => void;
  onCancelAnalysis: (id: string) => void;
}

interface LibraryCardProps {
  session?: AnalysisSession;
  savedItem?: SavedReportItem;
  onClick: () => void;
  onAction: (e: React.MouseEvent) => void;
  viewMode?: 'GRID' | 'LIST';
}

type FilterType = 'ALL' | 'BOOKMARKED' | 'BULLISH' | 'HIGH_SCORE';

// --- SIDEBAR COMPONENT ---
const DashboardSidebar = ({ library, sessions }: { library: SavedReportItem[], sessions: AnalysisSession[] }) => {
    // Mock Data for "Market Radar"
    const alerts = [
        { title: "CPI_DATA_RELEASE", time: "T-MINUS 24H", type: "high", icon: <Activity className="w-3 h-3 text-red-500" /> },
        { title: "TECH_EARNINGS", time: "CURRENT", type: "med", icon: <TrendingUp className="w-3 h-3 text-cyan-400" /> },
        { title: "FED_SPEECH", time: "FRI 1400", type: "high", icon: <Bell className="w-3 h-3 text-amber-500" /> }
    ];

    const activityItems = [
        ...sessions.map(s => ({
            type: 'ANALYSIS',
            ticker: s.ticker,
            time: Date.now(), 
            status: s.status
        })),
        ...library.map(l => ({
            type: 'REPORT',
            ticker: l.ticker,
            time: l.addedAt,
            status: 'COMPLETED'
        }))
    ].sort((a, b) => b.time - a.time).slice(0, 6);

    return (
        <div className="space-y-6 animate-fade-in delay-100">
             {/* Market Radar */}
             <div className="bg-panel border-2 border-slate-800 clip-corner-br">
                <div className="p-3 border-b border-slate-800 bg-striped flex items-center gap-2">
                    <Bell className="w-3 h-3 text-amber-500" />
                    <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest font-mono">Radar_Sweep</h3>
                </div>
                <div className="divide-y divide-slate-800/50">
                    {alerts.map((alert, i) => (
                        <div key={i} className="p-3 hover:bg-white/5 transition-colors group cursor-default flex items-center justify-between">
                            <div>
                                <div className="text-xs font-bold text-slate-300 font-mono group-hover:text-white transition-colors">{alert.title}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{alert.time}</div>
                            </div>
                            {alert.type === 'high' && <div className="w-2 h-2 bg-red-500 rounded-full animate-blink shadow-[0_0_5px_red]"></div>}
                        </div>
                    ))}
                </div>
             </div>

             {/* Recent Activity */}
             <div className="bg-panel border-2 border-slate-800 clip-corner-br">
                <div className="p-3 border-b border-slate-800 bg-striped flex items-center gap-2">
                    <HistoryIcon className="w-3 h-3 text-cyan-400" />
                    <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-mono">System_Logs</h3>
                </div>
                <div className="p-4 space-y-4 font-mono">
                    {activityItems.length > 0 ? activityItems.map((item, i) => (
                        <div key={i} className="flex gap-3 relative">
                            <div className="mt-1 flex-shrink-0 text-[10px] text-slate-600">
                                {`0${i+1}`}
                            </div>
                            <div>
                                <div className="text-xs text-slate-300 uppercase">
                                    <span className={item.type === 'ANALYSIS' ? 'text-amber-500' : 'text-cyan-500'}>
                                        [{item.type === 'ANALYSIS' ? 'PROC' : 'SAVE'}]
                                    </span> {item.ticker}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                                    {item.type === 'ANALYSIS' ? 'PROCESSING_DATA_STREAM...' : new Date(item.time).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="text-xs text-slate-600 italic text-center py-2">NO_LOGS_FOUND</div>
                    )}
                </div>
             </div>
             
             {/* Quick Tip */}
             <div className="border border-dashed border-amber-500/30 p-4 bg-amber-500/5">
                <div className="flex items-start gap-3">
                   <Zap className="w-4 h-4 text-amber-500 mt-0.5" />
                   <div>
                      <h4 className="text-xs font-bold text-amber-500 uppercase mb-1 tracking-wider">Protocol Tip</h4>
                      <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                         High Rocket Scores (>80) indicate asymmetric upside potential. Verify via "Moat Analysis" module.
                      </p>
                   </div>
                </div>
             </div>
        </div>
    )
}

const HistoryIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 3v9h9"/><path d="M12 7v5l4 2"/></svg>
);


// CASSETTE CARD COMPONENT
const LibraryCard: React.FC<LibraryCardProps> = ({
  session,
  savedItem,
  onClick,
  onAction,
  viewMode = 'GRID'
}) => {
  const isSession = !!session;
  const status = session ? session.status : 'SAVED';

  // --- PROCESSING STATE ---
  if (status === 'PROCESSING' && session) {
    return (
      <div className="relative bg-[#1a1a1a] p-4 rounded-sm border-2 border-amber-500/30 h-full min-h-[160px] flex flex-col gap-4 animate-pulse shadow-neon-amber clip-corner-br">
         <div className="flex justify-between items-center border-b border-dashed border-amber-500/30 pb-2">
            <span className="text-xl font-mono font-bold text-amber-500">{session.ticker}</span>
            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
         </div>
         <div className="flex-1 flex flex-col justify-center gap-2">
            <div className="text-[10px] text-amber-500/70 font-mono uppercase tracking-widest">{session.phase}</div>
            <div className="h-4 w-full bg-black border border-amber-900 relative overflow-hidden">
               <div className="h-full bg-amber-500 repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.2) 5px,rgba(0,0,0,0.2) 10px)" style={{ width: `${session.progress}%` }}></div>
            </div>
            <div className="text-right text-xs font-mono text-amber-500">{Math.round(session.progress)}%</div>
         </div>
         <button onClick={onAction} className="absolute top-2 right-2 p-1 hover:text-white text-slate-500"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  // --- ERROR STATE ---
  if (status === 'ERROR' && session) {
     return (
        <div className="bg-red-950/20 border-2 border-red-500 p-4 h-full min-h-[160px] flex flex-col justify-between clip-corner-br">
           <div className="flex justify-between">
              <span className="text-xl font-mono font-bold text-red-500">{session.ticker}</span>
              <AlertOctagon className="w-5 h-5 text-red-500" />
           </div>
           <div className="font-mono text-xs text-red-400">
              ERR_CODE: NETWORK_FAIL<br/>
              RETRY_REQUIRED
           </div>
           <button onClick={onAction} className="text-red-500 hover:text-white text-xs uppercase font-bold text-right hover:underline">Dismiss</button>
        </div>
     );
  }

  // --- READY / SAVED STATE (CASSETTE LOOK) ---
  let displayData;
  if (isSession && session?.result) {
     displayData = {
        ticker: session.result.ticker,
        name: session.result.companyName,
        price: session.result.currentPrice,
        change: session.result.priceChange,
        verdict: session.result.verdict,
        rocketScore: session.result.rocketScore,
        isBookmarked: false,
        isNew: true
     };
  } else if (savedItem) {
     displayData = {
        ticker: savedItem.ticker,
        name: savedItem.companyName,
        price: savedItem.currentPrice,
        change: savedItem.priceChange,
        verdict: savedItem.verdict,
        rocketScore: savedItem.fullReport?.rocketScore,
        isBookmarked: savedItem.isBookmarked,
        isNew: false
     };
  } else {
     return null;
  }

  const isPriceUp = displayData.change.startsWith('+');
  const verdictColor = displayData.verdict === 'BUY' ? 'text-terminal' : displayData.verdict === 'SELL' ? 'text-red-500' : 'text-amber-500';

  if (viewMode === 'LIST') {
      return (
        <div onClick={onClick} className="bg-panel border border-slate-700 p-3 hover:border-cyan-500 flex justify-between items-center cursor-pointer group transition-all">
             <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-white group-hover:bg-cyan-900 group-hover:text-cyan-400 transition-colors">
                     {displayData.ticker.slice(0,2)}
                 </div>
                 <div>
                     <div className="font-mono font-bold text-white text-lg leading-none">{displayData.ticker}</div>
                     <div className="text-[10px] text-slate-500 font-mono uppercase">{displayData.name}</div>
                 </div>
             </div>
             <div className="font-mono text-right">
                 <div className="text-white font-bold">{displayData.price}</div>
                 <div className={`text-xs ${isPriceUp ? 'text-terminal' : 'text-red-500'}`}>{displayData.change}</div>
             </div>
             <div className={`font-bold font-mono px-3 py-1 border border-dashed ${verdictColor === 'text-terminal' ? 'border-terminal text-terminal' : 'border-slate-500 text-slate-500'}`}>
                 {displayData.verdict}
             </div>
        </div>
      )
  }

  // CASSETTE VISUAL
  return (
    <div 
      onClick={onClick}
      className="relative group cursor-pointer transition-transform hover:-translate-y-1"
    >
       {/* CASSETTE BODY */}
       <div className="bg-[#202020] rounded-sm p-1 shadow-lg border-b-4 border-r-4 border-black">
          {/* LABEL AREA */}
          <div className="bg-[#e2e2e2] p-3 rounded-sm relative overflow-hidden h-32 flex flex-col justify-between">
              {/* Sticker Texture */}
              <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
              
              {/* Top Label */}
              <div className="flex justify-between items-start border-b-2 border-black/10 pb-1 relative z-10">
                  <div className="flex flex-col">
                      <span className="font-display font-black text-2xl text-black leading-none tracking-tighter">{displayData.ticker}</span>
                      <span className="font-mono text-[9px] text-slate-500 uppercase truncate max-w-[120px]">{displayData.name}</span>
                  </div>
                  <div className="flex flex-col items-end">
                      <span className={`font-mono font-bold text-lg ${isPriceUp ? 'text-green-700' : 'text-red-600'}`}>{displayData.price}</span>
                      <span className="text-[9px] font-bold text-slate-500">{displayData.change}</span>
                  </div>
              </div>

              {/* Middle (Handwritten note look) */}
              <div className="flex-1 flex items-center justify-center relative">
                  {/* Cassette Spools Visual */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center">
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-[spin_5s_linear_infinite_paused] group-hover:animate-[spin_5s_linear_infinite]"></div>
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center">
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-[spin_5s_linear_infinite_paused] group-hover:animate-[spin_5s_linear_infinite]"></div>
                  </div>
                  
                  {/* Tape Window */}
                  <div className="w-1/2 h-6 bg-slate-300 rounded border border-slate-400 shadow-inner flex items-center px-1">
                      <div className="h-4 w-full bg-slate-800 rounded-sm overflow-hidden relative">
                         <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-600"></div>
                         <div className="absolute left-[30%] right-[30%] top-0 bottom-0 bg-black/80"></div> {/* Tape reel */}
                      </div>
                  </div>
              </div>

              {/* Bottom Label Details */}
              <div className="flex justify-between items-end relative z-10 pt-1 border-t-2 border-black/10">
                  <div className="flex gap-2">
                     <span className={`text-[10px] font-black uppercase px-1 rounded ${displayData.verdict === 'BUY' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                        {displayData.verdict}
                     </span>
                     {displayData.rocketScore !== undefined && (
                         <div className="flex items-center gap-0.5 text-[10px] font-bold text-slate-600">
                            <Rocket className="w-3 h-3" /> {displayData.rocketScore}
                         </div>
                     )}
                  </div>
                  {displayData.isNew && <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1 rounded uppercase">NEW_DATA</span>}
                  {displayData.isBookmarked && <Bookmark className="w-3 h-3 text-amber-600 fill-amber-600" />}
              </div>
          </div>
          
          {/* Cassette Bottom Housing */}
          <div className="h-8 bg-[#1a1a1a] mt-1 relative rounded-sm flex items-center justify-between px-4">
              <div className="w-2 h-2 bg-black rounded-full shadow-[0_1px_0_rgba(255,255,255,0.1)]"></div>
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">SIDE A</div>
              <div className="w-2 h-2 bg-black rounded-full shadow-[0_1px_0_rgba(255,255,255,0.1)]"></div>
          </div>
       </div>
       {!displayData.isNew && (
            <button 
                onClick={(e) => { e.stopPropagation(); onAction(e); }}
                className="absolute -top-2 -right-2 bg-red-600 text-white p-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-500"
                title="Erase Tape"
            >
                <Trash2 className="w-3 h-3" />
            </button>
        )}
    </div>
  );
};


const Dashboard: React.FC<DashboardProps> = ({
  user,
  reportLibrary,
  onSearch,
  onLoadReport,
  onDeleteReport,
  tickerInput,
  onTickerChange,
  suggestions,
  showSuggestions,
  onSelectSuggestion,
  setShowSuggestions,
  onViewSample,
  analysisSessions,
  onViewAnalyzedReport,
  onCancelAnalysis
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [view, setView] = useState<'GRID' | 'LIST'>('GRID');
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredLibrary = useMemo(() => {
      let items = filter === 'ALL'
        ? reportLibrary.filter(item => !analysisSessions.some(session => session.ticker === item.ticker))
        : reportLibrary;

      switch (filter) {
        case 'BOOKMARKED': return items.filter(i => i.isBookmarked);
        case 'BULLISH': return items.filter(i => i.verdict === 'BUY');
        case 'HIGH_SCORE': return items.filter(i => (i.fullReport?.rocketScore || 0) >= 80);
        default: return items;
      }
  }, [reportLibrary, analysisSessions, filter]);

  const totalItems = filteredLibrary.length + (filter === 'ALL' ? analysisSessions.length : 0);
  const bookmarkedCount = reportLibrary.filter(i => i.isBookmarked).length;
  const reportsGenerated = reportLibrary.length;
  const bullishCount = reportLibrary.filter(r => r.verdict === 'BUY').length;
  
  // Stat Card - HARDWARE SLOT STYLE
  const StatFilterCard = ({ 
    active, onClick, icon, label, value, colorClass
  }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, value: React.ReactNode, colorClass: string }) => (
    <div 
      onClick={onClick}
      className={`
        relative p-3 border-2 h-24 flex items-center justify-between cursor-pointer transition-all clip-corner-br group
        ${active 
          ? `bg-slate-900 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]` 
          : 'bg-panel border-slate-700 hover:border-cyan-500 hover:bg-slate-800'
        }
      `}
    >
        {/* Background Detail */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/20 to-transparent pointer-events-none"></div>

        <div className="flex flex-col z-10 h-full justify-between py-1">
           <div className={`text-[10px] font-bold uppercase tracking-widest font-mono flex items-center gap-2 ${active ? 'text-amber-500' : 'text-slate-500 group-hover:text-cyan-400'}`}>
              {active && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-blink"></span>}
              {label}
           </div>
           <div className={`text-3xl font-mono font-bold ${colorClass}`}>
              {value}
           </div>
        </div>

        {/* Styled Icon Container */}
        <div className={`
            w-12 h-12 flex items-center justify-center border-2 transition-all relative
            ${active 
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' 
                : 'border-slate-700 bg-slate-900 text-slate-600 group-hover:text-cyan-400 group-hover:border-cyan-500/50'
            }
        `}>
            {/* Tech details on the icon box */}
            <div className="absolute top-0 left-0 w-1 h-1 bg-current"></div>
            <div className="absolute top-0 right-0 w-1 h-1 bg-current"></div>
            <div className="absolute bottom-0 left-0 w-1 h-1 bg-current"></div>
            <div className="absolute bottom-0 right-0 w-1 h-1 bg-current"></div>
            
            {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
        </div>
    </div>
  );

  return (
    <div className="animate-fade-in w-full pb-20">
      
      {/* 1. Header & Search Section */}
      <div className="relative mb-12">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6">
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                 <span className="w-2 h-2 bg-green-500 animate-blink"></span>
                 <span className="text-xs font-mono text-green-500 uppercase">System_Online // {new Date().toLocaleDateString()}</span>
             </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white tracking-wider uppercase leading-none">
              Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-red-500">{user.name.split(' ')[0]}</span>.
            </h2>
          </div>
        </div>

        {/* SEARCH BAR - TERMINAL STYLE */}
        <div className="w-full max-w-4xl relative z-20">
          <form onSubmit={(e) => onSearch(e)} className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-cyan-500 opacity-20 blur group-hover:opacity-40 transition duration-500"></div>
              <div className="relative" ref={dropdownRef}>
                <div className="relative flex items-center bg-black border-2 border-slate-600 group-hover:border-amber-500 transition-colors shadow-lg">
                  <div className="pl-6 text-amber-500 font-mono text-xl animate-pulse">{'>'}</div>
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={onTickerChange}
                    onFocus={() => { if(tickerInput) setShowSuggestions(true); }}
                    placeholder="INPUT_TICKER_SYMBOL..."
                    className="w-full bg-transparent px-4 py-6 text-xl text-green-500 placeholder-slate-700 focus:outline-none font-mono uppercase tracking-widest"
                    autoComplete="off"
                  />
                  <div className="pr-2">
                    <button
                        type="submit"
                        disabled={!tickerInput}
                        className="bg-amber-500 text-black px-8 py-3 font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase font-mono text-sm tracking-wider clip-corner-br"
                    >
                        EXECUTE
                    </button>
                  </div>
                </div>

                {/* Autocomplete Dropdown - Retro */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-black border-2 border-amber-500/50 z-50 animate-fade-in-up">
                    <ul className="divide-y divide-slate-800">
                      {suggestions.map((stock) => (
                        <li 
                          key={stock.symbol}
                          onClick={() => onSelectSuggestion(stock.symbol)}
                          className="px-5 py-3 hover:bg-amber-500/10 cursor-pointer flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-mono font-bold text-lg text-amber-500 w-16 group-hover:text-amber-400">{stock.symbol}</span>
                            <span className="text-sm font-mono text-slate-500 group-hover:text-slate-300">{stock.name}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
          </form>
          
          <div className="mt-4 flex flex-wrap items-center gap-4">
             <button 
                onClick={onViewSample}
                className="text-[10px] font-bold text-slate-500 hover:text-cyan-400 font-mono uppercase border border-dashed border-slate-700 hover:border-cyan-500 px-3 py-1 transition-colors flex items-center gap-2"
             >
                <Zap className="w-3 h-3" /> Load_Test_Data
             </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Quick Filter Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatFilterCard active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="Archive_Total" value={reportsGenerated} icon={<HardDrive />} colorClass="text-white" />
          <StatFilterCard active={filter === 'BOOKMARKED'} onClick={() => setFilter('BOOKMARKED')} label="Saved_Tapes" value={bookmarkedCount} icon={<Bookmark />} colorClass="text-cyan-400" />
          <StatFilterCard active={filter === 'BULLISH'} onClick={() => setFilter('BULLISH')} label="Bull_Signals" value={bullishCount} icon={<Rocket />} colorClass="text-terminal" />
          <StatFilterCard active={filter === 'HIGH_SCORE'} onClick={() => setFilter('HIGH_SCORE')} label="Alpha_Finds" value={filteredLibrary.filter(i => (i.fullReport?.rocketScore || 0) >= 80).length} icon={<Activity />} colorClass="text-amber-500" />
      </div>

      {/* 3. Main Content Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        
        {/* LEFT COLUMN: Report Library */}
        <div className="lg:col-span-3 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-slate-800 pb-2">
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <Folder className="w-5 h-5 text-amber-500" /> 
                Data_Archive
                </h3>

                {/* View Mode Toggle */}
                <div className="flex items-center p-0.5 bg-slate-900 border border-slate-700">
                  <button onClick={() => setView('GRID')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-all ${view === 'GRID' ? 'bg-amber-500 text-black' : 'text-slate-500 hover:text-white'}`}>Grid</button>
                  <button onClick={() => setView('LIST')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-all ${view === 'LIST' ? 'bg-amber-500 text-black' : 'text-slate-500 hover:text-white'}`}>List</button>
                </div>
            </div>

            {totalItems === 0 ? (
                <div className="bg-panel border-2 border-dashed border-slate-800 p-12 flex flex-col items-center justify-center text-center min-h-[300px] animate-fade-in opacity-50">
                   <Disc className="w-16 h-16 text-slate-700 mb-4 animate-spin-slow" />
                   <h4 className="text-xl font-mono font-bold text-slate-500 mb-2 uppercase">NO_DATA_FOUND</h4>
                   <p className="text-slate-600 font-mono text-xs max-w-sm mb-6">Initialize a new search sequence above to generate data tapes.</p>
                </div>
            ) : (
                <div className={view === 'GRID' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr" : "flex flex-col gap-2"}>
                  {filter === 'ALL' && analysisSessions.map((session) => (
                      <LibraryCard 
                          key={session.id} 
                          session={session} 
                          onClick={() => session.status === 'READY' && onViewAnalyzedReport(session.id)}
                          onAction={(e) => { e.stopPropagation(); onCancelAnalysis(session.id); }}
                          viewMode={view}
                      />
                  ))}
                  {filteredLibrary.map((item) => (
                      <LibraryCard 
                          key={item.ticker} 
                          savedItem={item}
                          onClick={() => onLoadReport(item)}
                          onAction={(e) => onDeleteReport(item.ticker, e)}
                          viewMode={view}
                      />
                  ))}
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: Sidebar */}
        <div className="lg:col-span-1">
            <DashboardSidebar library={reportLibrary} sessions={analysisSessions} />
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
