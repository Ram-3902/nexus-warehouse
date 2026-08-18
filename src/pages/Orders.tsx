import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { runAllocation } from '../lib/decisionEngine';
import type { Order, WarehouseItem, AllocationDecision } from '../types/warehouse';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  ClipboardList, Play, Check, ShieldAlert, ArrowRightLeft, RefreshCw 
} from 'lucide-react';
import { formatSLATimer } from '../lib/warehouseUtils';

export default function Orders() {
  const [dbOrders, setDbOrders] = useState<Order[]>(() => supabase.getOrders());
  const [dbItems, setDbItems] = useState<WarehouseItem[]>(() => supabase.getItems());
  
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-101');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterTier, setFilterTier] = useState<string>('All');

  // Re-run allocation engine to get active status & decisions
  const allocation = useMemo(() => {
    return runAllocation(dbOrders, dbItems);
  }, [dbOrders, dbItems]);

  const reloadData = () => {
    setDbOrders(supabase.getOrders());
    setDbItems(supabase.getItems());
  };

  // List of filtered orders
  const filteredOrders = useMemo(() => {
    return allocation.updatedOrders.filter(order => {
      const matchStatus = filterStatus === 'All' || order.status === filterStatus;
      const matchPriority = filterPriority === 'All' || order.priority === filterPriority;
      const matchTier = filterTier === 'All' || order.customerTier === filterTier;
      return matchStatus && matchPriority && matchTier;
    });
  }, [allocation.updatedOrders, filterStatus, filterPriority, filterTier]);

  // Selected Order details
  const selectedOrder = useMemo(() => {
    return allocation.updatedOrders.find(o => o.id === selectedOrderId);
  }, [allocation.updatedOrders, selectedOrderId]);

  // Decision details for selected order
  const orderDecisions = useMemo(() => {
    return allocation.decisions.filter(d => d.orderId === selectedOrderId);
  }, [allocation.decisions, selectedOrderId]);

  // Execute Reallocation (Action support)
  const handleExecuteReallocation = (decision: AllocationDecision) => {
    const user = supabase.getCurrentUser();
    try {
      // Find a standard order holding this SKU
      const standardOrders = allocation.updatedOrders.filter(
        o => o.customerTier === 'standard' &&
             (o.status === 'pending' || o.status === 'allocated') &&
             o.id !== decision.orderId &&
             o.items.some(i => i.sku === decision.sku && i.allocated > 0)
      );

      if (standardOrders.length === 0) {
        toast.error("No suitable standard orders found to reallocate stock from.");
        return;
      }

      // Reallocate from the first standard order
      const donorOrder = standardOrders[0];
      const donorItem = donorOrder.items.find(i => i.sku === decision.sku)!;
      
      const qtyToReallocate = Math.min(decision.shortage, donorItem.allocated);
      
      // De-allocate from donor order
      const rawOrders = supabase.getOrders();
      const dbDonor = rawOrders.find(o => o.id === donorOrder.id)!;
      dbDonor.items.find(i => i.sku === decision.sku)!.allocated -= qtyToReallocate;
      dbDonor.status = 'hold'; // Put back on hold
      dbDonor.exceptionDetails = `Stock reallocated to prioritized Order #${decision.orderId} by ${user.name}`;
      supabase.updateOrder(dbDonor);

      // Allocate to recipient order
      const dbRecipient = rawOrders.find(o => o.id === decision.orderId)!;
      dbRecipient.items.find(i => i.sku === decision.sku)!.allocated += qtyToReallocate;
      
      // Check if order is fully allocated
      const allAllocated = dbRecipient.items.every(i => i.allocated >= i.quantity);
      if (allAllocated) {
        dbRecipient.status = 'allocated';
      }
      dbRecipient.exceptionDetails = `Stock reallocated from Order #${donorOrder.id} by ${user.name}`;
      supabase.updateOrder(dbRecipient);

      // Log movement record
      supabase.insertMovement({
        sku: decision.sku,
        type: 'internal_move',
        quantity: qtyToReallocate,
        reason: `Reallocation from Order #${donorOrder.id} to Order #${decision.orderId} to prioritize VIP/Urgent delivery`,
        user: user.name
      });

      toast.success(`Successfully reallocated ${qtyToReallocate} units of ${decision.sku}!`);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || 'Authorization failed. RLS policy blocked reallocation.');
    }
  };

  // Trigger Replenishment from Bulk
  const handleTriggerReplenishment = (decision: AllocationDecision) => {
    const user = supabase.getCurrentUser();
    try {
      const item = dbItems.find(i => i.sku === decision.sku)!;
      
      // Update item coordinates to picking zone A (Section Zone A Rack 01 Shelf 01 Bin 01)
      const targetLoc = {
        section: 'Main Warehouse',
        zone: 'Zone A',
        rack: 'Rack 01',
        shelf: 'Shelf 01',
        bin: 'Bin 01'
      };

      const updatedItem = {
        ...item,
        location: targetLoc
      };
      supabase.updateItem(updatedItem);

      // Log stock movement
      supabase.insertMovement({
        sku: decision.sku,
        type: 'internal_move',
        quantity: decision.shortage,
        fromLocation: item.location,
        toLocation: targetLoc,
        reason: `Automated replenishment to resolve shortage on Order #${decision.orderId}`,
        user: user.name
      });

      toast.success(`Replenishment transfer completed: SKU ${decision.sku} moved to Picking Zone A.`);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || 'Authorization failed. RLS policy blocked replenishment.');
    }
  };

  // Trigger purchase order
  const handleTriggerPO = (decision: AllocationDecision) => {
    const user = supabase.getCurrentUser();
    try {
      // Simulate ordering from vendor
      supabase.insertMovement({
        sku: decision.sku,
        type: 'inbound',
        quantity: decision.shortage + 20, // Order excess
        reason: `Vendor purchase order triggered by shortage on Order #${decision.orderId}`,
        user: user.name
      });

      toast.success(`Vendor Purchase Order placed for ${decision.shortage + 20} units of ${decision.sku}.`);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || 'Authorization failed. RLS policy blocked PO creation.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Order Management & Decision Panel</h1>
        <p className="text-sm text-slate-400">View allocation decisions, resolve stock shortages, and manage competing orders.</p>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Order List */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Order Queues</CardTitle>
              <Button onClick={reloadData} size="sm" variant="ghost" className="text-slate-400 hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="filter-status" className="text-[10px] text-slate-400 block mb-1">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger id="filter-status" className="bg-slate-950 border-slate-850 h-8 text-[11px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-850 text-white text-[11px]">
                      <SelectItem value="All">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="allocated">Allocated</SelectItem>
                      <SelectItem value="picking">Picking</SelectItem>
                      <SelectItem value="packing">Packing</SelectItem>
                      <SelectItem value="qc">QA Check</SelectItem>
                      <SelectItem value="dispatch">Dispatch</SelectItem>
                      <SelectItem value="hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="filter-priority" className="text-[10px] text-slate-400 block mb-1">Priority</label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger id="filter-priority" className="bg-slate-950 border-slate-850 h-8 text-[11px]">
                      <SelectValue placeholder="All Priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-850 text-white text-[11px]">
                      <SelectItem value="All">All Priorities</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="filter-tier" className="text-[10px] text-slate-400 block mb-1">Tier</label>
                  <Select value={filterTier} onValueChange={setFilterTier}>
                    <SelectTrigger id="filter-tier" className="bg-slate-950 border-slate-850 h-8 text-[11px]">
                      <SelectValue placeholder="All Tiers" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-850 text-white text-[11px]">
                      <SelectItem value="All">All Tiers</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Order List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-2">Order ID</th>
                      <th className="py-2">Priority</th>
                      <th className="py-2">Tier</th>
                      <th className="py-2">Items Count</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          No orders matched the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr 
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          className={`hover:bg-slate-900/30 transition cursor-pointer ${
                            selectedOrderId === order.id ? 'bg-slate-800/40' : ''
                          }`}
                        >
                          <td className="py-3 font-semibold text-slate-200">{order.id}</td>
                          <td className="py-3">
                            <Badge className={
                              order.priority === 'urgent' ? 'bg-rose-950 text-rose-400 border-rose-900' :
                              order.priority === 'high' ? 'bg-orange-950 text-orange-400 border-orange-900' :
                              order.priority === 'medium' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                              'bg-slate-900 text-slate-500 border-slate-850'
                            }>
                              {order.priority.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 uppercase text-[10px] text-slate-400 font-bold">{order.customerTier}</td>
                          <td className="py-3 text-slate-300">
                            {order.items.reduce((sum, i) => sum + i.quantity, 0)} units
                          </td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              order.status === 'completed' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900' :
                              order.status === 'hold' ? 'bg-rose-950/60 text-red-400 border-red-900 animate-pulse' :
                              'bg-sky-950/60 text-sky-400 border-sky-900'
                            }`}>
                              {order.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Order Detail & Decision Support Panel */}
        <div className="space-y-4">
          {selectedOrder ? (
            <>
              {/* Order Detail Card */}
              <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
                <CardHeader className="pb-3 border-b border-slate-800">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold">Order Detail: {selectedOrder.id}</CardTitle>
                    <div className="text-right space-y-1">
                      <div className="text-[10px] text-slate-500">Created {new Date(selectedOrder.createdAt).toLocaleTimeString()}</div>
                      {(() => {
                        const sla = formatSLATimer(selectedOrder.createdAt);
                        return <span className={`text-[9px] font-mono inline-block ${sla.style}`}>{sla.remaining}</span>;
                      })()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-xs">
                  {/* Items List */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Order Items</h3>
                    <div className="space-y-2">
                      {selectedOrder.items.map(item => {
                        const itemDetail = dbItems.find(i => i.sku === item.sku);
                        return (
                          <div key={item.sku} className="flex justify-between items-center p-2 rounded bg-slate-950 border border-slate-850">
                            <div>
                              <div className="font-bold text-sky-400">{item.sku}</div>
                              <div className="text-[10px] text-slate-400">{itemDetail ? itemDetail.name : 'Unknown Product'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-slate-200">{item.allocated} / {item.quantity} Allocated</div>
                              {item.allocated < item.quantity && (
                                <div className="text-[10px] text-rose-400">Shortage: {item.quantity - item.allocated} units</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedOrder.exceptionDetails && (
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-850 text-slate-300">
                      <span className="font-bold text-sky-400">Exception Notes:</span> {selectedOrder.exceptionDetails}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Shortage Decision Support Panel */}
              {orderDecisions.length > 0 ? (
                orderDecisions.map((decision, idx) => (
                  <Card key={idx} className="border-rose-950 bg-rose-950/10 text-white backdrop-blur">
                    <CardHeader className="pb-2 border-b border-rose-950">
                      <CardTitle className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4" />
                        DECISION SUPPORT: STOCK SHORTAGE
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 space-y-4 text-xs">
                      {/* Shortage details */}
                      <div className="grid grid-cols-2 gap-2 text-slate-300">
                        <div>
                          <span className="text-slate-500 text-[10px] block">Shortage SKU</span>
                          <strong className="text-sky-400">{decision.sku}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Competing Orders</span>
                          <strong>{decision.competingOrdersCount} orders</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Delivery Risk</span>
                          <Badge className={
                            decision.risk === 'high' ? 'bg-red-950 text-red-400 border-red-900' :
                            decision.risk === 'medium' ? 'bg-orange-950 text-orange-400 border-orange-900' :
                            'bg-slate-900 text-slate-400 border-slate-800'
                          }>
                            {decision.risk.toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Customer Impact</span>
                          <Badge className={
                            decision.deliveryImpact === 'high' ? 'bg-red-950 text-red-400 border-red-900' :
                            decision.deliveryImpact === 'medium' ? 'bg-orange-950 text-orange-400 border-orange-900' :
                            'bg-slate-900 text-slate-400 border-slate-800'
                          }>
                            {decision.deliveryImpact.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      {/* Recommended action explanation */}
                      <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/50 space-y-1">
                        <div className="font-semibold text-rose-300">Recommended Action:</div>
                        <p className="text-slate-200 text-[11px] leading-relaxed">{decision.recommendedAction}</p>
                      </div>

                      {/* Action Triggers */}
                      <div className="space-y-2 pt-2">
                        {decision.recommendedAction.includes('Reallocate') && (
                          <Button 
                            onClick={() => handleExecuteReallocation(decision)}
                            className="w-full bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center gap-1.5 h-9"
                          >
                            <ArrowRightLeft className="h-4 w-4" /> Execute Reallocation
                          </Button>
                        )}
                        {decision.recommendedAction.includes('Replenish') && (
                          <Button 
                            onClick={() => handleTriggerReplenishment(decision)}
                            className="w-full bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-1.5 h-9"
                          >
                            <Play className="h-4 w-4" /> Trigger Replenishment
                          </Button>
                        )}
                        {decision.recommendedAction.includes('Purchase Order') && (
                          <Button 
                            onClick={() => handleTriggerPO(decision)}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-1.5 h-9"
                          >
                            <ClipboardList className="h-4 w-4" /> Place Purchase Order
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-emerald-950 bg-emerald-950/10 text-white backdrop-blur">
                  <CardContent className="pt-4 flex flex-col items-center justify-center py-8 text-center">
                    <Check className="h-8 w-8 text-emerald-400 mb-2" />
                    <h3 className="font-semibold text-emerald-400">Order Fully Allocated</h3>
                    <p className="text-slate-400 text-[10px] max-w-[200px] mt-1">No shortages reported. Order is ready to proceed to picking station.</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-24 text-slate-500 text-xs">Select an order from the queue to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
