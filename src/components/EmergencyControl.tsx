import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ShieldAlert, Octagon, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

/**
 * Emergency Control Panel with Hold-To-Confirm activation mechanism.
 * Requires 2000ms of continuous press to trigger Emergency Halt, preventing accidental clicks.
 */
export default function EmergencyControl() {
  const [isHalted, setIsHalted] = useState<boolean>(() => {
    // Check dynamic state (could also fetch from storage if wanted, keep in-memory fallback)
    return (globalThis as any)._isAmrHalted || false;
  });
  
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartTimeRef = useRef<number>(0);

  const startHold = () => {
    if (isHalted) return;
    
    holdStartTimeRef.current = Date.now();
    setHoldProgress(0);

    // Update progress bar smooth transition
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const pct = Math.min(100, (elapsed / 2000) * 100);
      setHoldProgress(Math.round(pct));
    }, 50);

    // Trigger halt after 2000ms
    timerRef.current = setTimeout(() => {
      triggerHalt();
    }, 2000);
  };

  const endHold = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setHoldProgress(0);
  };

  const triggerHalt = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setHoldProgress(100);
    setIsHalted(true);
    (globalThis as any)._isAmrHalted = true;

    // Log the exception in the DB
    const user = supabase.getCurrentUser();
    try {
      supabase.insertException({
        type: 'delay',
        details: `SYSTEM WIDE CRITICAL EMERGENCY HALT: Activated manually by ${user.name} via hold-to-confirm override.`,
        reportedBy: user.name
      });
      
      // Dispatch global halt event
      const event = new CustomEvent('amr-system-halted', { detail: { halted: true } });
      window.dispatchEvent(event);
      
      toast.error('CRITICAL: Emergency Halt Activated! All AMR navigation tracks frozen.', {
        duration: 8000
      });
    } catch (err: any) {
      toast.error('System halt logged but database rejected update: ' + err.message);
    }
  };

  const triggerResume = () => {
    // Resume requires manager approval
    const user = supabase.getCurrentUser();
    if (user.role !== 'manager') {
      toast.error('RLS Denied: Clear Emergency Halt requires Manager privileges.');
      return;
    }

    setIsHalted(false);
    (globalThis as any)._isAmrHalted = false;
    setHoldProgress(0);

    try {
      supabase.insertException({
        type: 'delay',
        details: `SYSTEM RESUMED: Emergency Halt cleared and normal operations authorized by ${user.name}.`,
        reportedBy: user.name
      });

      const event = new CustomEvent('amr-system-halted', { detail: { halted: false } });
      window.dispatchEvent(event);

      toast.success('System resumed. AMR tracks recalibrating.');
    } catch (err: any) {
      toast.error('Action blocked: ' + err.message);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  return (
    <Card className={`border-slate-800 backdrop-blur transition-all ${
      isHalted ? 'bg-rose-950/20 border-rose-900/60 animate-pulse' : 'bg-slate-900/80 text-white'
    }`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-slate-400">
            <ShieldAlert className={`h-4 w-4 ${isHalted ? 'text-rose-500' : 'text-amber-500'}`} />
            AMR Control & Halt Override
          </span>
          <span className={`h-2 w-2 rounded-full ${isHalted ? 'bg-rose-500' : 'bg-emerald-500'}`} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isHalted ? (
          <div className="space-y-3">
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-900/50 text-[11px] text-rose-300">
              🚨 <strong>AMR ROBOTS HALTED</strong>: All autonomous movements, packing lines, and dispatch conveyor tracks are locked in state.
            </div>
            <Button 
              onClick={triggerResume}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-9 flex items-center justify-center gap-1"
            >
              <Play className="h-3.5 w-3.5" /> Resume Robot Fleet (Manager)
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] text-slate-400">
              Hold the emergency button for 2 seconds to immediately trigger a system-wide halt.
            </p>
            <div className="relative">
              {/* Progress bar background */}
              <button
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={startHold}
                onTouchEnd={endHold}
                className="w-full bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-900/50 rounded h-10 font-bold text-xs flex items-center justify-center gap-1.5 relative overflow-hidden transition active:scale-[0.99] select-none cursor-pointer"
                aria-label="Hold to Emergency Halt"
              >
                {/* Hold progress indicator overlay */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-rose-700/40 transition-all duration-75 pointer-events-none"
                  style={{ width: `${holdProgress}%` }}
                />
                <Octagon className="h-4 w-4 relative z-10 animate-spin-slow" />
                <span className="relative z-10">
                  {holdProgress > 0 ? `HOLDING (${holdProgress}%)` : 'HOLD TO EMERGENCY HALT'}
                </span>
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
