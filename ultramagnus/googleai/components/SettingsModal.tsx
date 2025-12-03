
import React, { useState, useEffect } from 'react';
import { X, Key, Check, AlertTriangle, Trash2, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('ultramagnus_user_api_key');
      if (stored) setApiKey(stored);
      setIsSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('ultramagnus_user_api_key', apiKey.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } else {
      localStorage.removeItem('ultramagnus_user_api_key');
    }
  };

  const handleClearData = () => {
    if (confirm("Are you sure? This will delete all saved reports and local settings.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in-up">
        
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-slate-900">
           <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-400" /> Settings
           </h2>
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
           </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* API Key Section */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-indigo-500/20">
             <h3 className="text-sm font-bold text-white mb-2">Gemini API Configuration</h3>
             <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                By default, this app uses a shared demo key. For heavy usage or to ensure privacy, please provide your own Google Gemini API Key.
                <br />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 underline mt-1 inline-block">
                   Get a free API Key here &rarr;
                </a>
             </p>
             
             <div className="relative">
                <input 
                   type={showKey ? "text" : "password"}
                   value={apiKey}
                   onChange={(e) => { setApiKey(e.target.value); setIsSaved(false); }}
                   placeholder="AIzaSy..."
                   className="w-full bg-slate-950 border border-white/10 rounded-lg py-2 pl-4 pr-20 text-sm text-white font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <div className="absolute right-2 top-1.5 flex gap-1">
                   <button 
                     onClick={() => setShowKey(!showKey)}
                     className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors"
                   >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                   </button>
                </div>
             </div>

             <div className="mt-3 flex justify-end">
                <button 
                  onClick={handleSave}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${isSaved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                   {isSaved ? <Check className="w-3 h-3" /> : null}
                   {isSaved ? 'Saved Securely' : 'Save Key'}
                </button>
             </div>
          </div>

          {/* Account Tier Info */}
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-white/5">
             <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Current Plan</div>
                <div className="text-sm font-bold text-white">{user?.tier || 'Guest Access'}</div>
             </div>
             {user?.tier !== 'Pro' && (
                <button className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-indigo-500/20 transition-all">
                   Upgrade to Pro
                </button>
             )}
          </div>

          {/* Danger Zone */}
          <div className="pt-4 border-t border-white/5">
             <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" /> Danger Zone
             </h3>
             <button 
                onClick={handleClearData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-xs font-bold"
             >
                <Trash2 className="w-4 h-4" />
                Clear All Local Data & Reset App
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
