import { useMemo, memo } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  Package, AlertOctagon, TrendingUp, AlertTriangle, Layers, Activity, Cpu, Compass 
} from 'lucide-react';
import { getAMRStatus, optimizeRouteTSP } from '../lib/warehouseUtils';

// Memoized Bar Chart for Flow Bottlenecks
const BottleneckChart = memo(({ data }: { data: { name: string; count: number; color: string }[] }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
      <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
      <Tooltip 
        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} 
        labelStyle={{ fontWeight: 'bold' }}
      />
      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
));
BottleneckChart.displayName = 'BottleneckChart';

// Memoized Pie Chart for Zone Stock Distribution
const ZoneStockChart = memo(({ data }: { data: { name: string; value: number; color: string }[] }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={50}
        outerRadius={80}
        paddingAngle={3}
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
    </PieChart>
  </ResponsiveContainer>
));
ZoneStockChart.displayName = 'ZoneStockChart';

export default function Dashboard() {
  // Fetch current data state
  const items = useMemo(() => supabase.getItems(), []);
  const orders = useMemo(() => supabase.getOrders(), []);
  const movements = useMemo(() => supabase.getMovements(), []);
  const exceptions = useMemo(() => supabase.getExceptions(), []);


  // KPI Calculations
  const stats = useMemo(() => {
    const totalSKUs = items.length;
    const totalStock = items.reduce((acc, item) => acc + item.totalStock, 0);
    
    // Low stock: total usable stock < lowStockThreshold
    const lowStockCount = items.filter(
      item => (item.totalStock - item.damaged - item.missing) < item.lowStockThreshold
    ).length;

    const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'hold').length;
    
    // Exceptions
    const activeExceptions = exceptions.filter(e => e.status === 'pending').length;
    const exceptionRate = orders.length > 0 
      ? Math.round((exceptions.length / orders.length) * 100) 
      : 0;

    // Bottlenecks calculation: find the state with the most orders currently in it (excluding completed)
    const stateCounts: Record<string, number> = {
      pending: 0,
      allocated: 0,
      picking: 0,
      packing: 0,
      qc: 0,
      dispatch: 0
    };
    orders.forEach(o => {
      if (o.status in stateCounts) {
        stateCounts[o.status]++;
      }
    });

    let maxQueueState = 'None';
    let maxQueueCount = 0;
    Object.entries(stateCounts).forEach(([state, count]) => {
      if (count > maxQueueCount) {
        maxQueueCount = count;
        maxQueueState = state;
      }
    });

    return {
      totalSKUs,
      totalStock,
      lowStockCount,
      pendingOrdersCount,
      activeExceptions,
      exceptionRate,
      bottleneck: `${maxQueueState.toUpperCase()} (${maxQueueCount} orders)`
    };
  }, [items, orders, exceptions]);

  // Recharts: Flow Bottlenecks Chart Data
  const bottleneckChartData = useMemo(() => {
    const states = [
      { name: 'Pending', count: 0, color: '#f59e0b' },
      { name: 'Allocated', count: 0, color: '#10b981' },
      { name: 'Picking', count: 0, color: '#3b82f6' },
      { name: 'Packing', count: 0, color: '#8b5cf6' },
      { name: 'QA Check', count: 0, color: '#ec4899' },
      { name: 'Dispatch', count: 0, color: '#06b6d4' }
    ];

    orders.forEach(o => {
      if (o.status === 'pending' || o.status === 'hold') states[0].count++;
      else if (o.status === 'allocated') states[1].count++;
      else if (o.status === 'picking') states[2].count++;
      else if (o.status === 'packing') states[3].count++;
      else if (o.status === 'qc') states[4].count++;
      else if (o.status === 'dispatch') states[5].count++;
    });

    return states;
  }, [orders]);

  // Recharts: Zone Stock Distribution Data
  const zoneChartData = useMemo(() => {
    const zones: Record<string, number> = {};
    items.forEach(item => {
      const z = item.location.zone;
      zones[z] = (zones[z] || 0) + item.totalStock;
    });

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    return Object.entries(zones).map(([name, value], i) => ({
      name,
      value,
      color: COLORS[i % COLORS.length]
    }));
  }, [items]);


  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Warehouse Control Center</h1>
        <p className="text-sm text-slate-400">Real-time analytical dashboards and flow bottleneck monitoring.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Stock */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stock Units</CardTitle>
            <Package className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStock}</div>
            <p className="text-[10px] text-slate-500">Across {stats.totalSKUs} unique SKUs</p>
          </CardContent>
        </Card>

        {/* Card 2: Low Stock Warnings */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Stock SKUs</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{stats.lowStockCount}</div>
            <p className="text-[10px] text-slate-500">Require replenishment triggers</p>
          </CardContent>
        </Card>

        {/* Card 3: Active Bottleneck */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Max Queue Bottleneck</CardTitle>
            <Layers className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-violet-300 truncate">{stats.bottleneck}</div>
            <p className="text-[10px] text-slate-500">Highest operational backlog</p>
          </CardContent>
        </Card>

        {/* Card 4: Exception Rate */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">QA Exception Rate</CardTitle>
            <AlertOctagon className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">{stats.exceptionRate}%</div>
            <p className="text-[10px] text-slate-500">{stats.activeExceptions} unresolved exception tickets</p>
          </CardContent>
        </Card>
      </div>

      {/* Recharts Analytics Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Chart 1: Flow Bottleneck Queue */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-400" />
              Active Order Flow Backlog (Queue Size)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <BottleneckChart data={bottleneckChartData} />
          </CardContent>
        </Card>

        {/* Chart 2: Zone Stock Allocation */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Stock Count by Warehouse Zone</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] flex flex-col justify-between">
            <div className="h-[200px] w-full">
              <ZoneStockChart data={zoneChartData} />
            </div>
            {/* Custom Legends */}
            <div className="flex flex-wrap gap-2 justify-center pb-2 text-[10px]">
              {zoneChartData.map((zone) => (
                <div key={zone.name} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span className="text-slate-400">{zone.name}: {zone.value} pcs</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lower Feed Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Exceptions & Anomalies */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-rose-400">
              <AlertOctagon className="h-4 w-4" />
              Active Anomalies & Exception Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {exceptions.filter(e => e.status === 'pending').length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">No active exception reports.</div>
              ) : (
                exceptions.filter(e => e.status === 'pending').map((exc) => (
                  <div key={exc.id} className="p-3 rounded border border-rose-950/40 bg-rose-950/10 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-rose-300">
                        {exc.type.toUpperCase()}: {exc.sku}
                      </div>
                      <div className="text-[11px] text-slate-300">{exc.details}</div>
                      <div className="text-[9px] text-slate-500">
                        Reported by {exc.reportedBy} • {new Date(exc.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Real-time Inventory Activity */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sky-400" />
              Recent Stock Movements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {movements.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">No recorded movements.</div>
              ) : (
                movements.map((move) => (
                  <div key={move.id} className="p-3 rounded border border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-200">
                        {move.sku} ({move.type.toUpperCase()})
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[250px]">{move.reason}</div>
                      <div className="text-[9px] text-slate-500">Log: {move.user}</div>
                    </div>
                    <div className="text-right space-y-1 shrink-0">
                      <span className={`font-bold ${
                        move.type === 'inbound' || move.type === 'internal_move' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {move.type === 'inbound' ? '+' : '-'}{move.quantity} units
                      </span>
                      <div className="text-[9px] text-slate-500">{new Date(move.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AMR Telemetry & Route Optimization Section (Additive Pass) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* AMR Telemetry Fleet */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-400" />
              Autonomous Mobile Robot (AMR) Fleet Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { id: 'AMR-01', battery: 88, location: 'Zone A (Picking)', task: 'Fulfillment picking for Order #ord-103' },
                { id: 'AMR-02', battery: 12, location: 'Zone B (Charger)', task: 'Auto-routing to charging dock' },
                { id: 'AMR-03', battery: 35, location: 'Zone C (Bulk)', task: 'Cross-docking intake transfer' }
              ].map(robot => {
                const statusInfo = getAMRStatus(robot.battery);
                return (
                  <div key={robot.id} className="p-3 rounded border border-slate-850 bg-slate-950/40 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-200">{robot.id}</div>
                      <div className="text-[10px] text-slate-400">Task: {robot.task}</div>
                      <div className="text-[10px] text-slate-500">Location: {robot.location}</div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${statusInfo.style}`}>
                        {robot.battery}% Bat ({statusInfo.health.toUpperCase()})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* TSP Path Optimizer solver */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Compass className="h-4 w-4 text-amber-400 animate-pulse" />
              AMR Route Optimization Heuristic (TSP)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            <p className="text-slate-400">
              TSP path heuristic re-sequences picking targets (Start point ➜ Zone A Bins ➜ Zone B Bins ➜ Start point) for minimal travel distance.
            </p>
            {(() => {
              // Target coordinates in the warehouse
              const targetCoords = [
                { x: 0, y: 0, label: 'AMR Charger Origin' },
                { x: 5, y: 15, label: 'Zone A - Rack 01 (iPhone 15)' },
                { x: 1, y: 5, label: 'Zone A - Rack 02 (iPad Pro)' },
                { x: 20, y: 12, label: 'Zone B - Rack 01 (Charger)' },
                { x: 12, y: 8, label: 'Zone A - Rack 01 (MacBook)' }
              ];
              // Calculate optimized route using TSP Memoizer
              const routeInfo = optimizeRouteTSP(targetCoords);
              return (
                <div className="space-y-2">
                  <div className="bg-slate-950 border border-slate-850 p-2.5 rounded font-mono text-[10px] text-emerald-400 space-y-1">
                    <div className="font-bold text-slate-300">OPTIMIZED AMR SEQUENCE:</div>
                    {routeInfo.path.map((step, index) => (
                      <div key={index} className="flex items-center gap-1.5 py-0.5">
                        <span className="text-slate-500 font-bold">Step {index + 1}:</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Active Solver: Nearest Neighbor Heuristic</span>
                    <strong className="text-slate-200">Total Distance: {routeInfo.totalDistance}m</strong>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
