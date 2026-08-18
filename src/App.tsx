import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import Stations from './pages/Stations';
import SecurityControls from './components/SecurityControls';
import { LayoutDashboard, Package2, ClipboardList, Settings, HelpCircle, Activity, Warehouse } from 'lucide-react';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [key, setKey] = useState<number>(0); // Trigger page refresh on user change

  const handleUserChange = () => {
    setKey(prev => prev + 1);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory Monitor', icon: Package2 },
    { id: 'orders', label: 'Order Allocation', icon: ClipboardList },
    { id: 'stations', label: 'Workflow Stations', icon: Activity }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-500 flex items-center justify-center text-slate-950 shadow-lg shadow-sky-500/20">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wider flex items-center gap-2">
              WAREFLOW <span className="text-xs bg-sky-950 text-sky-400 border border-sky-900 px-1.5 py-0.5 rounded font-mono font-normal">AI v2.0</span>
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Warehouse Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping" />
            <span className="font-mono text-[10px]">Local Server Online</span>
          </span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-slate-900 bg-slate-950/40 p-4 flex flex-col justify-between hidden md:flex">
          <nav className="space-y-1">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-3 mb-2">Systems</div>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition group ${
                    isActive 
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-lg shadow-sky-500/10' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-sky-400'
                  }`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="space-y-1 pt-4 border-t border-slate-900">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-900 transition">
              <Settings className="h-4 w-4 text-slate-500" />
              Settings
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-900 transition">
              <HelpCircle className="h-4 w-4 text-slate-500" />
              Help Reference
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-y-auto min-w-0" key={key}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'inventory' && <Inventory />}
          {activeTab === 'orders' && <Orders />}
          {activeTab === 'stations' && <Stations />}
        </main>

        {/* Right Audit Sidebar */}
        <aside className="w-80 border-l border-slate-900 bg-slate-950/40 p-4 flex flex-col gap-4 overflow-y-auto">
          <SecurityControls onUserChanged={handleUserChange} />
        </aside>
      </div>

      {/* Toast Notification Container */}
      <Toaster theme="dark" closeButton position="bottom-left" toastOptions={{
        style: {
          backgroundColor: '#0f172a',
          borderColor: '#1e293b',
          color: '#fff',
          fontSize: '12px'
        }
      }} />
    </div>
  );
}
