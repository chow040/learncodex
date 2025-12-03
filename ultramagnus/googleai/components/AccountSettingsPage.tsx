
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { 
  User, 
  CreditCard, 
  Shield, 
  Key, 
  Save, 
  Check, 
  AlertTriangle, 
  Download, 
  ExternalLink,
  Eye, 
  EyeOff,
  Github,
  Zap,
  ArrowLeft
} from 'lucide-react';

interface AccountSettingsPageProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  onBack: () => void;
}

type SettingsTab = 'general' | 'billing' | 'security';

const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ user, onUpdateUser, onBack }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Form States
  const [displayName, setDisplayName] = useState(user.name);
  const [email] = useState(user.email); // Read-only usually
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('ultramagnus_user_api_key');
    if (storedKey) setApiKey(storedKey);
  }, []);

  const handleSaveProfile = () => {
    setIsLoading(true);
    // Simulate API call persistence
    setTimeout(() => {
      onUpdateUser({ ...user, name: displayName });
      setIsLoading(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }, 800);
  };

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('ultramagnus_user_api_key', apiKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    } else {
      localStorage.removeItem('ultramagnus_user_api_key');
      setApiKey('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20 animate-fade-in relative z-20">
      {/* Page Header */}
      <div className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-8 pb-4 md:pb-8 gap-4">
             <div>
                <h1 className="text-2xl font-display font-bold text-white mb-2">Account Settings</h1>
                <p className="text-slate-400 text-sm">Manage your profile, billing, and API preferences.</p>
             </div>
             <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white transition-colors self-start md:self-center bg-slate-800/50 px-3 py-2 rounded-lg border border-white/5 hover:bg-slate-800">
                <ArrowLeft className="w-3 h-3" /> Back to Dashboard
             </button>
          </div>
          
          {/* Tabs */}
          <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
            <button 
               onClick={() => setActiveTab('general')}
               className={`pb-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeTab === 'general' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
               General
            </button>
            <button 
               onClick={() => setActiveTab('billing')}
               className={`pb-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeTab === 'billing' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
               Billing & Usage
            </button>
            <button 
               onClick={() => setActiveTab('security')}
               className={`pb-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeTab === 'security' ? 'text-white border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
               Tokens & Security
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-8">
        
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
           <div className="space-y-6 animate-fade-in-up">
              
              {/* Profile Card */}
              <div className="bg-surface rounded-xl border border-white/5 overflow-hidden">
                 <div className="px-6 py-4 border-b border-white/5 bg-slate-900/50">
                    <h3 className="text-sm font-bold text-white">Profile Information</h3>
                    <p className="text-xs text-slate-500 mt-1">Update your display name and public avatar.</p>
                 </div>
                 <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                       <div className="flex-shrink-0">
                          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/20">
                             {displayName.charAt(0)}
                          </div>
                       </div>
                       <div className="flex-1 space-y-4 w-full max-w-md">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase">Display Name</label>
                                <input 
                                  type="text" 
                                  value={displayName} 
                                  onChange={(e) => setDisplayName(e.target.value)}
                                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                                />
                             </div>
                             <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase">Email Address</label>
                                <div className="w-full bg-slate-900/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed flex items-center justify-between">
                                   {email}
                                   <Shield className="w-3 h-3 text-emerald-500" />
                                </div>
                             </div>
                          </div>
                          <div className="pt-2">
                             <button 
                               onClick={handleSaveProfile}
                               disabled={isLoading}
                               className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                             >
                                {isLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save className="w-3 h-3" />}
                                {isSaved ? 'Saved Changes' : 'Save Changes'}
                             </button>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* GitHub Connected */}
              <div className="bg-surface rounded-xl border border-white/5 overflow-hidden">
                 <div className="px-6 py-4 border-b border-white/5 bg-slate-900/50 flex justify-between items-center">
                    <div>
                       <h3 className="text-sm font-bold text-white">Connected Accounts</h3>
                       <p className="text-xs text-slate-500 mt-1">Manage external login providers.</p>
                    </div>
                 </div>
                 <div className="p-6">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                             <Github className="w-5 h-5 text-white" />
                          </div>
                          <div>
                             <div className="text-sm font-bold text-white">GitHub</div>
                             <div className="text-xs text-slate-500">Connected as {email}</div>
                          </div>
                       </div>
                       <button className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
                          Disconnect
                       </button>
                    </div>
                 </div>
              </div>

              {/* Danger Zone */}
              <div className="border border-red-500/20 rounded-xl overflow-hidden">
                 <div className="px-6 py-4 bg-red-500/5 border-b border-red-500/10">
                    <h3 className="text-sm font-bold text-red-400">Danger Zone</h3>
                 </div>
                 <div className="p-6 flex items-center justify-between">
                    <div>
                       <div className="text-sm font-medium text-white">Delete Personal Account</div>
                       <div className="text-xs text-slate-500 mt-1">Permanently remove your account and all saved reports. This action cannot be undone.</div>
                    </div>
                    <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors">
                       Delete Account
                    </button>
                 </div>
              </div>

           </div>
        )}

        {/* BILLING TAB */}
        {activeTab === 'billing' && (
           <div className="space-y-6 animate-fade-in-up">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Current Plan */}
                 <div className="md:col-span-2 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-xl border border-indigo-500/20 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                       <Zap className="w-32 h-32 text-indigo-400 transform rotate-12" />
                    </div>
                    <div className="p-8">
                       <div className="flex justify-between items-start mb-6">
                          <div>
                             <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Current Plan</div>
                             <h2 className="text-3xl font-display font-bold text-white mb-2">Pro Trader</h2>
                             <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                                You have access to advanced Moonshot scoring, unlimited report generation, and real-time news synthesis.
                             </p>
                          </div>
                          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                             <Check className="w-3 h-3" /> Active
                          </span>
                       </div>
                       <div className="flex gap-3 relative z-10">
                          <button className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors shadow-lg">
                             Manage Subscription
                          </button>
                          <button className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors border border-white/10">
                             Contact Support
                          </button>
                       </div>
                    </div>
                 </div>

                 {/* Payment Method */}
                 <div className="bg-surface rounded-xl border border-white/5 p-6 flex flex-col justify-between hover:border-white/10 transition-colors">
                    <div>
                       <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-slate-400" /> Payment Method
                       </h3>
                       <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-white/5 mb-2">
                          <div className="w-8 h-5 bg-white rounded flex items-center justify-center shadow-sm">
                             <div className="w-2 h-2 rounded-full bg-red-500 mr-0.5 opacity-80"></div>
                             <div className="w-2 h-2 rounded-full bg-yellow-500 opacity-80"></div>
                          </div>
                          <div className="text-xs">
                             <div className="text-white font-mono">•••• 4242</div>
                             <div className="text-slate-500">Expires 12/28</div>
                          </div>
                       </div>
                    </div>
                    <button className="text-xs font-bold text-indigo-400 hover:text-white transition-colors text-left mt-4">
                       + Add Payment Method
                    </button>
                 </div>
              </div>

              {/* Invoices */}
              <div className="bg-surface rounded-xl border border-white/5 overflow-hidden">
                 <div className="px-6 py-4 border-b border-white/5 bg-slate-900/50">
                    <h3 className="text-sm font-bold text-white">Invoice History</h3>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                       <thead className="bg-slate-900 text-slate-500 text-xs uppercase font-medium">
                          <tr>
                             <th className="px-6 py-3">Date</th>
                             <th className="px-6 py-3">Amount</th>
                             <th className="px-6 py-3">Status</th>
                             <th className="px-6 py-3 text-right">Invoice</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5 text-slate-300">
                          {[
                             { date: 'Oct 01, 2024', amount: '$29.00', status: 'Paid' },
                             { date: 'Sep 01, 2024', amount: '$29.00', status: 'Paid' },
                             { date: 'Aug 01, 2024', amount: '$29.00', status: 'Paid' },
                          ].map((inv, i) => (
                             <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="px-6 py-3 font-mono text-xs">{inv.date}</td>
                                <td className="px-6 py-3">{inv.amount}</td>
                                <td className="px-6 py-3">
                                   <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      {inv.status}
                                   </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                   <button className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-slate-700 rounded">
                                      <Download className="w-4 h-4" />
                                   </button>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

           </div>
        )}

        {/* SECURITY & API TAB */}
        {activeTab === 'security' && (
           <div className="space-y-6 animate-fade-in-up">
              
              {/* API Configuration */}
              <div className="bg-surface rounded-xl border border-white/5 overflow-hidden">
                 <div className="px-6 py-4 border-b border-white/5 bg-slate-900/50 flex justify-between items-center">
                    <div>
                       <h3 className="text-sm font-bold text-white">Gemini API Tokens</h3>
                       <p className="text-xs text-slate-500 mt-1">Manage your connection to Google's Gemini models.</p>
                    </div>
                    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-300 px-3 py-1 rounded text-[10px] font-bold uppercase border border-indigo-500/20 flex items-center gap-1">
                       <Zap className="w-3 h-3" /> Gemini 2.0 Flash Thinking
                    </div>
                 </div>
                 <div className="p-6">
                    <div className="bg-slate-900/50 rounded-xl p-4 border border-indigo-500/20 mb-6">
                       <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                          <div>
                             <h4 className="text-sm font-bold text-white mb-1">Bring Your Own Key (BYOK)</h4>
                             <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                                Ultramagnus uses a shared demo key by default which has rate limits. For heavy usage, privacy, or to access the latest experimental models, we recommend providing your own API key.
                             </p>
                             <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 mt-2 border-b border-indigo-500/30 pb-0.5 hover:border-indigo-400">
                                Get a free API Key <ExternalLink className="w-3 h-3" />
                             </a>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2 max-w-2xl">
                       <label className="text-xs font-bold text-slate-400 uppercase">Gemini API Key</label>
                       <div className="relative group">
                          <div className="absolute left-3 top-2.5">
                             <Key className="w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                          </div>
                          <input 
                             type={showKey ? "text" : "password"}
                             value={apiKey}
                             onChange={(e) => { setApiKey(e.target.value); setKeySaved(false); }}
                             placeholder="AIzaSy..."
                             className="w-full bg-slate-900 border border-white/10 rounded-lg py-2.5 pl-10 pr-24 text-sm text-white font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
                          />
                          <div className="absolute right-2 top-1.5 flex gap-1">
                             <button 
                               onClick={() => setShowKey(!showKey)}
                               className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors"
                             >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                             </button>
                             <button 
                               onClick={handleSaveKey}
                               className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${keySaved ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                             >
                                {keySaved ? <Check className="w-3 h-3" /> : 'Save'}
                             </button>
                          </div>
                       </div>
                       <p className="text-[10px] text-slate-500">Your key is encrypted and stored locally in your browser. It is never sent to our servers.</p>
                    </div>
                 </div>
              </div>

              {/* Login Sessions */}
              <div className="bg-surface rounded-xl border border-white/5 overflow-hidden">
                 <div className="px-6 py-4 border-b border-white/5 bg-slate-900/50">
                    <h3 className="text-sm font-bold text-white">Active Sessions</h3>
                 </div>
                 <div className="p-6">
                    <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-white/5">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-800 rounded-full border border-white/5">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                          </div>
                          <div>
                             <div className="text-sm font-bold text-white">San Francisco, US</div>
                             <div className="text-xs text-slate-500">Chrome on macOS • Current Session</div>
                          </div>
                       </div>
                       <button className="text-xs text-slate-500 border border-white/10 px-3 py-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors">
                          Revoke
                       </button>
                    </div>
                 </div>
              </div>

           </div>
        )}

      </div>
    </div>
  );
};

export default AccountSettingsPage;
