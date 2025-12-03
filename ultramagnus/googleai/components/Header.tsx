
import React, { useState, useRef, useEffect } from 'react';
import { Rocket, FolderOpen, User, Settings, LogOut, ChevronDown, Monitor, Cpu } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  onHome: () => void;
  savedCount: number;
  user: UserProfile | null;
  onLogin: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onHome, 
  savedCount, 
  user, 
  onLogin, 
  onLogout, 
  onOpenSettings 
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="relative z-50 pt-2 px-4">
      {/* Mechanical Top Bar */}
      <div className="w-full max-w-7xl mx-auto bg-panel border-b-2 border-amber-500/20 flex items-center justify-between p-4 clip-corner-br shadow-lg relative">
        
        {/* Decorative Screw Heads */}
        <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-slate-700 flex items-center justify-center"><div className="w-full h-px bg-slate-900 rotate-45"></div></div>
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-slate-700 flex items-center justify-center"><div className="w-full h-px bg-slate-900 rotate-45"></div></div>
        <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-slate-700 flex items-center justify-center"><div className="w-full h-px bg-slate-900 rotate-45"></div></div>
        <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-slate-700 flex items-center justify-center"><div className="w-full h-px bg-slate-900 rotate-45"></div></div>

        {/* Logo Section */}
        <div 
          className="flex items-center space-x-4 cursor-pointer group pl-4" 
          onClick={onHome}
          title="Return to Dashboard"
        >
          <div className="relative w-10 h-10 bg-amber-500 flex items-center justify-center clip-corner-br shadow-neon-amber group-hover:bg-amber-400 transition-colors">
            <Cpu className="w-6 h-6 text-black" />
            {/* Status light */}
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse border border-black"></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-display font-bold text-white tracking-wider uppercase leading-none">
              Ultramagnus
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-px w-8 bg-amber-500/50"></span>
              <p className="text-[10px] text-amber-500 font-mono tracking-widest uppercase">Terminal v3.0</p>
            </div>
          </div>
        </div>
        
        {/* Control Panel Right */}
        <div className="flex items-center gap-6 pr-4">
          
          {/* Status Indicators (Desktop) */}
          <div className="hidden md:flex gap-1">
             <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] uppercase text-slate-500 font-mono">NET</span>
                <div className="w-8 h-1 bg-green-500/50 flex gap-px"><div className="w-full bg-green-500 animate-pulse"></div></div>
             </div>
             <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] uppercase text-slate-500 font-mono">CPU</span>
                <div className="w-8 h-1 bg-amber-500/20 flex gap-px"><div className="w-1/2 bg-amber-500"></div></div>
             </div>
          </div>

          <div className="h-8 w-px bg-slate-700 mx-2"></div>

          {/* Saved Reports Button */}
          <button 
            onClick={onHome}
            className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-400 hover:text-cyan-400 transition-all group clip-corner-br"
          >
            <FolderOpen className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Archive</span>
            {savedCount > 0 && (
              <span className="bg-cyan-900 text-cyan-400 text-[10px] font-bold px-1.5 py-0.5 border border-cyan-500/30">
                {savedCount.toString().padStart(2, '0')}
              </span>
            )}
          </button>
          
          {/* User Account Menu */}
          <div className="relative" ref={menuRef}>
            {user ? (
              <div>
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="flex items-center gap-3 pl-2 pr-4 py-1.5 bg-slate-900 border border-slate-700 hover:border-amber-500 transition-all group clip-corner-br"
                >
                  <div className="w-8 h-8 bg-slate-800 flex items-center justify-center border border-slate-600 group-hover:border-amber-500 group-hover:text-amber-500 transition-colors">
                     <User className="w-4 h-4" />
                  </div>
                  <div className="hidden md:flex flex-col items-start">
                     <span className="text-xs font-bold text-white uppercase tracking-wider">{user.name}</span>
                     <span className="text-[9px] text-amber-500 font-mono uppercase">{user.tier}_ACCESS</span>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {isMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-panel border-2 border-amber-500/50 shadow-neon-amber z-50 clip-corner-br animate-fade-in-up p-1">
                    <div className="p-3 border-b border-white/5 bg-striped">
                      <div className="text-xs font-mono text-amber-500 uppercase">User ID: {user.id.slice(0, 8)}</div>
                      <div className="text-xs text-slate-400 truncate font-mono">{user.email}</div>
                    </div>
                    
                    <div className="p-1 space-y-1 mt-1">
                      <button 
                        onClick={() => { onOpenSettings(); setIsMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-3 text-xs font-bold text-slate-300 hover:bg-amber-500 hover:text-black transition-colors uppercase tracking-wider group"
                      >
                        <Settings className="w-4 h-4" />
                        System Config
                      </button>
                    </div>

                    <div className="p-1 border-t border-white/5 mt-1">
                      <button 
                        onClick={() => { onLogout(); setIsMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-3 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-black transition-colors uppercase tracking-wider"
                      >
                        <LogOut className="w-4 h-4" />
                        Terminate Session
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={onLogin}
                className="flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-widest transition-all shadow-neon-amber clip-corner-br"
              >
                <Monitor className="w-4 h-4" />
                Initialize
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
