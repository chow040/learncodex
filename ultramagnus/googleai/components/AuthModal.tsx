
import React, { useState } from 'react';
import { X, Mail, Lock, ArrowRight, Github, Rocket } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, name: string) => void;
  message?: string; // New prop for custom context messages
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin, message }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      // Mock name extraction from email
      const name = email.split('@')[0].replace(/[0-9]/g, '');
      const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
      
      onLogin(email, formattedName || 'Trader');
      setIsLoading(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Decor */}
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
           <Rocket className="w-40 h-40" />
        </div>
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="mb-6">
            <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-4 border border-indigo-500/30">
               <Rocket className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-display font-bold text-white">
              {message || "Welcome Back"}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {message ? "Create a free account to continue analyzing." : "Sign in to access your saved reports and analysis."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
               <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder-slate-600"
                    placeholder="trader@example.com"
                    autoFocus
                  />
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
               <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder-slate-600"
                    placeholder="••••••••"
                  />
               </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  {message ? "Create Free Account" : "Sign In"} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5">
             <button className="w-full bg-white text-slate-900 font-bold py-2.5 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm">
                <Github className="w-4 h-4" /> Continue with GitHub
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
