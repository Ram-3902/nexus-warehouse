import { useState, useEffect } from 'react';
import { supabase, type SecurityLog } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface SecurityControlsProps {
  onUserChanged: () => void;
}

export default function SecurityControls({ onUserChanged }: SecurityControlsProps) {
  const [currentUser, setCurrentUser] = useState(supabase.getCurrentUser());
  const [logs, setLogs] = useState<SecurityLog[]>([]);

  useEffect(() => {
    setLogs(supabase.getSecurityLogs());

    const handleLogUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<SecurityLog>;
      setLogs(prev => [customEvent.detail, ...prev].slice(0, 50));
    };

    window.addEventListener('security-log-updated', handleLogUpdate);
    return () => {
      window.removeEventListener('security-log-updated', handleLogUpdate);
    };
  }, []);

  const handleUserChange = (userId: string) => {
    supabase.switchUser(userId);
    setCurrentUser(supabase.getCurrentUser());
    onUserChanged();
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset the database? This restores all seed items and orders.")) {
      supabase.resetDatabase();
      onUserChanged();
      setLogs(supabase.getSecurityLogs());
    }
  };

  return (
    <div className="space-y-4">
      {/* Active User Card */}
      <Card className="border-slate-800 bg-slate-900/80 text-white backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            Security & RLS Panel
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleReset} 
            className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Reset DB
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="user-select" className="text-xs text-slate-400 block mb-1">Active User Role (Simulates JWT claims)</label>
            <Select value={currentUser.id} onValueChange={handleUserChange}>
              <SelectTrigger id="user-select" className="bg-slate-950 border-slate-800 text-white h-9">
                <SelectValue placeholder="Select active role" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white">
                {supabase.getAllUsers().map(user => (
                  <SelectItem key={user.id} value={user.id} className="focus:bg-slate-850">
                    {user.name} ({user.role.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-slate-400 bg-slate-950/50 p-2.5 rounded border border-slate-850">
            <span className="font-semibold text-emerald-400">RLS Check Active:</span> When you trigger workflows, the system evaluates policies in <code className="text-sky-400 text-[10px]">supabase/migrations</code>. Unauthorized transitions will be blocked.
          </div>
        </CardContent>
      </Card>

      {/* Security Audit Logs */}
      <Card className="border-slate-800 bg-slate-900/80 text-white backdrop-blur flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Simulated Supabase RLS Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No logs recorded yet. Perform an action to trigger RLS checks.
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-[11px] p-2 rounded bg-slate-950 border border-slate-850/50 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-300">
                      {log.action} on {log.table.toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      log.status === 'GRANTED' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900' : 'bg-red-950/50 text-red-400 border border-red-900'
                    }`}>
                      {log.status === 'GRANTED' ? (
                        <CheckCircle className="h-2.5 w-2.5" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      )}
                      {log.status}
                    </span>
                  </div>
                  <div className="text-slate-400 break-words">{log.details}</div>
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Role: {log.role.toUpperCase()}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
