
import React from 'react';
import { Rocket, ArrowRight, Shield, Zap, BarChart3, Brain, Terminal, TrendingUp, Cpu, Disc } from 'lucide-react';

interface LandingPageProps {
  onStartAnalysis: () => void;
  onViewDemo: () => void;
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartAnalysis, onViewDemo, onLogin }) => {
  return (
    <div className="relative z-20 min-h-screen flex flex-col font-sans bg-dark selection:bg-amber-500/30 overflow-x-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-grid-pattern opacity-10 pointer-events-none"></div>
      
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-8 md:px-12 relative z-10">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={onStartAnalysis}>
          <div className="w-10 h-10 bg-amber-500 flex items-center justify-center clip-corner-br shadow-neon-amber">
             <Cpu className="w-6 h-6 text-black" />
          </div>
          <div className="flex flex-col">
             <span className="text-2xl font-display font-bold text-white tracking-wider uppercase leading-none">Ultramagnus</span>
             <span className="text-[10px] text-amber-500 font-mono tracking-widest uppercase">System_Online</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={onLogin}
            className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-widest transition-colors font-mono"
          >
            Access_Terminal
          </button>
          <button 
            onClick={onStartAnalysis}
            className="hidden md:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 border border-slate-700 transition-all font-mono text-xs font-bold uppercase tracking-wider clip-corner-br hover:border-amber-500 hover:text-amber-500"
          >
            [ Initialize ]
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center mt-8 md:mt-0 mb-20 relative z-10">
        
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-none border border-amber-500/30 bg-amber-500/5 text-amber-500 text-xs font-bold font-mono uppercase tracking-widest mb-8 animate-fade-in">
          <span className="w-2 h-2 bg-amber-500 animate-pulse"></span>
          Powered by Gemini 2.0 Flash Thinking
        </div>

        <h1 className="text-5xl md:text-8xl font-display font-black text-white tracking-tighter mb-8 max-w-5xl animate-fade-in-up uppercase leading-[0.9]">
          Institutional <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600">Equity Data</span> <br/>
          Terminal
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed font-mono animate-fade-in-up delay-100 border-l-2 border-amber-500/50 pl-6 text-left">
          >> SYSTEM MESSAGE: Stop relying on surface-level summaries. Ultramagnus utilizes advanced AI to construct complex valuation models, detect bias, and generate price targets.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6 animate-fade-in-up delay-200 w-full justify-center">
          <button 
            onClick={onStartAnalysis}
            className="w-full sm:w-auto px-10 py-5 bg-amber-500 text-black font-black font-display uppercase tracking-wider shadow-neon-amber hover:bg-amber-400 hover:scale-105 transition-all flex items-center justify-center gap-3 text-lg clip-corner-br group"
          >
            Execute Analysis
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={onViewDemo}
            className="w-full sm:w-auto px-10 py-5 bg-transparent text-white font-bold font-mono uppercase tracking-wider border-2 border-slate-700 hover:border-cyan-500 hover:text-cyan-500 hover:bg-cyan-950/30 transition-all flex items-center justify-center gap-3 text-sm clip-corner-br"
          >
            <Terminal className="w-5 h-5" />
            Load_Demo_Tape
          </button>
        </div>

        {/* Feature Grid - TAPE STYLE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-7xl w-full animate-fade-in-up delay-300 text-left px-4">
          
          <div className="bg-panel border-2 border-slate-800 p-6 relative group hover:border-amber-500 transition-colors">
            <div className="absolute -top-3 -left-3 w-6 h-6 bg-slate-800 border border-slate-600 group-hover:border-amber-500 group-hover:bg-amber-500 transition-colors"></div>
            <BarChart3 className="w-8 h-8 text-slate-600 mb-4 group-hover:text-amber-500 transition-colors" />
            <h3 className="text-lg font-bold font-mono text-white mb-2 uppercase">Deep Dive Financials</h3>
            <p className="text-xs font-mono text-slate-500 leading-relaxed">
              Parsing 10-Ks, balance sheets, and cash flow statements to construct complete valuation models.
            </p>
          </div>

          <div className="bg-panel border-2 border-slate-800 p-6 relative group hover:border-cyan-500 transition-colors">
            <div className="absolute -top-3 -left-3 w-6 h-6 bg-slate-800 border border-slate-600 group-hover:border-cyan-500 group-hover:bg-cyan-500 transition-colors"></div>
            <Shield className="w-8 h-8 text-slate-600 mb-4 group-hover:text-cyan-500 transition-colors" />
            <h3 className="text-lg font-bold font-mono text-white mb-2 uppercase">Bias Detection</h3>
            <p className="text-xs font-mono text-slate-500 leading-relaxed">
              Algorithmic analysis of earnings calls to identify executive hesitation, spin, and governance flags.
            </p>
          </div>

          <div className="bg-panel border-2 border-slate-800 p-6 relative group hover:border-green-500 transition-colors">
             <div className="absolute -top-3 -left-3 w-6 h-6 bg-slate-800 border border-slate-600 group-hover:border-green-500 group-hover:bg-green-500 transition-colors"></div>
            <Zap className="w-8 h-8 text-slate-600 mb-4 group-hover:text-green-500 transition-colors" />
            <h3 className="text-lg font-bold font-mono text-white mb-2 uppercase">Scenario Modeling</h3>
            <p className="text-xs font-mono text-slate-500 leading-relaxed">
              Bear, Base, and Bull cases immediately calculated with probability-weighted price targets.
            </p>
          </div>

        </div>

      </main>

      {/* Footer Ticker */}
      <footer className="border-t border-slate-800 py-4 bg-black font-mono uppercase text-xs">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6 overflow-hidden whitespace-nowrap">
               <span className="text-slate-500 font-bold">>> MARKET_FEED:</span>
               <span className="text-amber-500">NVDA <span className="text-green-500">▲ 2.4%</span></span>
               <span className="text-amber-500">PLTR <span className="text-green-500">▲ 5.1%</span></span>
               <span className="text-amber-500">TSLA <span className="text-red-500">▼ 1.2%</span></span>
               <span className="text-amber-500">AMD <span className="text-green-500">▲ 0.8%</span></span>
            </div>
            <div className="text-slate-600">
               © 2024 Ultramagnus. Terminals Active.
            </div>
         </div>
      </footer>
    </div>
  );
};

export default LandingPage;
