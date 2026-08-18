import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { runAllocation } from '../lib/decisionEngine';
import type { Order, WarehouseItem } from '../types/warehouse';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Scan, CheckSquare, Sparkles, Printer, AlertTriangle, ShieldCheck, Truck 
} from 'lucide-react';

export default function Stations() {
  const [dbOrders, setDbOrders] = useState<Order[]>(() => supabase.getOrders());
  const [dbItems, setDbItems] = useState<WarehouseItem[]>(() => supabase.getItems());
  
  const [activeStation, setActiveStation] = useState<string>('pick');
  const [boxDimensions, setBoxDimensions] = useState({ length: '12', width: '10', height: '8' });
  const [selectedCourier, setSelectedCourier] = useState('DHL Express');

  // Allocation engine outputs
  const allocation = useMemo(() => {
    return runAllocation(dbOrders, dbItems);
  }, [dbOrders, dbItems]);

  const reloadData = () => {
    setDbOrders(supabase.getOrders());
    setDbItems(supabase.getItems());
  };

  const currentUser = supabase.getCurrentUser();

  // --- ACTIONS ---

  // 1. PICK STATION: Start picking or Complete picking
  const handlePickerAction = (order: Order, action: 'start' | 'complete' | 'exception', sku?: string) => {
    try {
      const updated = { ...order };
      if (action === 'start') {
        updated.status = 'picking' as const;
        updated.assignedUser = currentUser.name;
        supabase.updateOrder(updated);
        toast.success(`Order #${order.id} claimed for picking.`);
      } 
      else if (action === 'complete') {
        updated.status = 'packing' as const;
        updated.assignedUser = ''; // Clear for next station
        supabase.updateOrder(updated);
        toast.success(`Order #${order.id} picked successfully! Moved to Packing.`);
      }
      else if (action === 'exception' && sku) {
        // Report missing/damaged item during pick
        const item = dbItems.find(i => i.sku === sku)!;
        
        // Mark as missing in database
        const updatedItem = {
          ...item,
          missing: item.missing + 1,
          allocated: Math.max(0, item.allocated - 1)
        };
        supabase.updateItem(updatedItem);

        // De-allocate from order
        const orderItem = updated.items.find(i => i.sku === sku)!;
        orderItem.allocated = Math.max(0, orderItem.allocated - 1);
        updated.status = 'hold' as const; // Put on hold due to shortage
        updated.exceptionDetails = `PICK EXCEPTION: SKU ${sku} flagged as MISSING by picker ${currentUser.name}.`;
        supabase.updateOrder(updated);

        // Log stock movement adjustment
        supabase.insertMovement({
          sku,
          type: 'adjustment',
          quantity: 1,
          reason: `PICKER WARNING: SKU ${sku} reported missing from shelf.`,
          user: currentUser.name
        });

        // Insert exception log
        supabase.insertException({
          orderId: order.id,
          sku,
          type: 'missing',
          details: `Picker ${currentUser.name} reported item missing at bin ${item.location.zone}-${item.location.rack}-${item.location.shelf}-${item.location.bin}.`,
          reportedBy: currentUser.name
        });

        toast.error(`Item ${sku} reported missing! Order put on Hold for reallocation.`);
      }
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "RLS Violation: You are not authorized to perform picking actions.");
    }
  };

  // 2. PACK STATION: Complete packing
  const handlePackerAction = (order: Order) => {
    try {
      const updated = { ...order, status: 'qc' as const };
      supabase.updateOrder(updated);
      toast.success(`Order #${order.id} packaged in Box ${boxDimensions.length}x${boxDimensions.width}x${boxDimensions.height}. Sent to QA.`);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "RLS Violation: You are not authorized to perform packaging actions.");
    }
  };

  // 3. QA STATION: Complete QA check
  const handleQAAction = (order: Order, decision: 'approve' | 'fail') => {
    try {
      const updated = { ...order };
      if (decision === 'approve') {
        updated.status = 'dispatch' as const;
        supabase.updateOrder(updated);
        toast.success(`Order #${order.id} passed QA! Moved to Dispatch queue.`);
      } else {
        // Flag QA failure and place order on hold
        updated.status = 'hold' as const;
        updated.exceptionDetails = `QA Check Failed by ${currentUser.name}: Item damaged or incorrect pack.`;
        supabase.updateOrder(updated);
        
        supabase.insertException({
          orderId: order.id,
          type: 'damaged',
          details: `QA Inspector ${currentUser.name} rejected package. Item needs repackaging.`,
          reportedBy: currentUser.name
        });
        toast.error(`Order #${order.id} failed QA check! Placed on Hold.`);
      }
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "RLS Violation: You are not authorized to perform QA inspections.");
    }
  };

  // 4. DISPATCH STATION: Ship order
  const handleDispatchAction = (order: Order) => {
    try {
      const updated = { ...order, status: 'completed' as const };
      supabase.updateOrder(updated);

      // Decrement inventory stock counts physically upon successful dispatch
      const itemsCopy = [...dbItems];
      for (const orderItem of order.items) {
        const item = itemsCopy.find(i => i.sku === orderItem.sku);
        if (item) {
          item.totalStock = Math.max(0, item.totalStock - orderItem.quantity);
          item.allocated = Math.max(0, item.allocated - orderItem.quantity);
          supabase.updateItem(item);

          // Log stock movement
          supabase.insertMovement({
            sku: orderItem.sku,
            type: 'outbound',
            quantity: orderItem.quantity,
            fromLocation: item.location,
            reason: `Outbound shipment for Order #${order.id} via ${selectedCourier}`,
            user: currentUser.name
          });
        }
      }

      toast.success(`Order #${order.id} shipped via ${selectedCourier}! Tracking ID: TRK-${Math.floor(100000 + Math.random() * 900000)}`);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || "RLS Violation: You are not authorized to perform shipping dispatch.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Warehouse Stations</h1>
        <p className="text-sm text-slate-400">Perform scanning, picking, packing, quality checking, and dispatching. Roles are enforced.</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeStation} onValueChange={setActiveStation} className="space-y-4">
        <TabsList className="bg-slate-950 border border-slate-850 p-1 text-slate-400">
          <TabsTrigger value="pick" className="text-xs font-semibold px-4 py-2 data-[state=active]:bg-sky-500 data-[state=active]:text-white">
            1. Picking Station
          </TabsTrigger>
          <TabsTrigger value="pack" className="text-xs font-semibold px-4 py-2 data-[state=active]:bg-sky-500 data-[state=active]:text-white">
            2. Packing Station
          </TabsTrigger>
          <TabsTrigger value="qc" className="text-xs font-semibold px-4 py-2 data-[state=active]:bg-sky-500 data-[state=active]:text-white">
            3. QA Station
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="text-xs font-semibold px-4 py-2 data-[state=active]:bg-sky-500 data-[state=active]:text-white">
            4. Dispatch Station
          </TabsTrigger>
        </TabsList>

        {/* 1. PICKING STATION */}
        <TabsContent value="pick">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pick Queues */}
            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Picking Work Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocation.updatedOrders.filter(o => o.status === 'allocated' || o.status === 'picking').length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">No orders ready for picking. Ensure orders are allocated.</div>
                ) : (
                  allocation.updatedOrders.filter(o => o.status === 'allocated' || o.status === 'picking').map(order => (
                    <div key={order.id} className="p-4 rounded border border-slate-800 bg-slate-950/40 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-200">Order #{order.id}</span>
                        <Badge className="bg-sky-950 text-sky-400 border-sky-900 uppercase text-[9px]">
                          {order.status}
                        </Badge>
                      </div>
                      
                      {/* Items to pick with location mapping */}
                      <div className="space-y-2">
                        {order.items.map(item => {
                          const itemDetail = dbItems.find(i => i.sku === item.sku);
                          const loc = itemDetail?.location;
                          return (
                            <div key={item.sku} className="text-xs p-2 rounded bg-slate-900 border border-slate-850 flex justify-between items-center">
                              <div>
                                <span className="font-semibold text-sky-400 block">{item.sku}</span>
                                <span className="text-[10px] text-slate-400">Qty: {item.quantity} units</span>
                                <span className="text-[10px] text-slate-500 block">
                                  Bin Location: <strong className="text-amber-400">
                                    {loc ? `${loc.zone}-${loc.rack}-${loc.shelf}-${loc.bin}` : 'Unassigned'}
                                  </strong>
                                </span>
                              </div>
                              {order.status === 'picking' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handlePickerAction(order, 'exception', item.sku)}
                                  className="text-rose-400 hover:bg-rose-950/50 text-[10px] h-7 border border-rose-950"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Flag Missing
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Pick actions */}
                      <div className="flex justify-end gap-2 text-xs pt-1">
                        {order.status === 'allocated' ? (
                          <Button 
                            onClick={() => handlePickerAction(order, 'start')}
                            className="bg-sky-600 hover:bg-sky-500 text-white h-8 text-[11px]"
                          >
                            <Scan className="h-3.5 w-3.5 mr-1" /> Start Picking
                          </Button>
                        ) : (
                          <Button 
                            onClick={() => handlePickerAction(order, 'complete')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-[11px]"
                          >
                            <CheckSquare className="h-3.5 w-3.5 mr-1" /> Complete Pick Run
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Picking Helper Notes */}
            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Picker Reference Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-4 leading-relaxed">
                <p>1. Claim an order by clicking <strong className="text-sky-400">Start Picking</strong>.</p>
                <p>2. Traverse to the specified <strong className="text-amber-400">Bin Location</strong> coordinates.</p>
                <p>3. If stock is physically absent, click <strong className="text-rose-400">Flag Missing</strong>. This immediately creates a database exception and sets the order status to Hold to prevent gridlock.</p>
                <p>4. Place items in cart, click <strong className="text-emerald-400">Complete Pick Run</strong> to transfer responsibility to the Packing station.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. PACKING STATION */}
        <TabsContent value="pack">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Packaging Work Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocation.updatedOrders.filter(o => o.status === 'picking' || o.status === 'packing').length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">No orders pending packaging. Complete picking first.</div>
                ) : (
                  allocation.updatedOrders.filter(o => o.status === 'picking' || o.status === 'packing').map(order => (
                    <div key={order.id} className="p-4 rounded border border-slate-800 bg-slate-950/40 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-200">Order #{order.id}</span>
                        <Badge className="bg-violet-950 text-violet-400 border-violet-900 uppercase text-[9px]">
                          {order.status}
                        </Badge>
                      </div>

                      {/* Package Configuration */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-900 p-2.5 rounded border border-slate-850">
                        <div className="col-span-3 text-[10px] text-slate-500 font-semibold uppercase">Box Dimensions (inches)</div>
                        <div>
                          <label className="text-[10px] text-slate-400">L</label>
                          <Input 
                            value={boxDimensions.length} 
                            onChange={e => setBoxDimensions({...boxDimensions, length: e.target.value})}
                            className="bg-slate-950 border-slate-800 h-7 text-xs text-white" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">W</label>
                          <Input 
                            value={boxDimensions.width} 
                            onChange={e => setBoxDimensions({...boxDimensions, width: e.target.value})}
                            className="bg-slate-950 border-slate-800 h-7 text-xs text-white" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">H</label>
                          <Input 
                            value={boxDimensions.height} 
                            onChange={e => setBoxDimensions({...boxDimensions, height: e.target.value})}
                            className="bg-slate-950 border-slate-800 h-7 text-xs text-white" 
                          />
                        </div>
                      </div>

                      {/* Action */}
                      <div className="flex justify-between items-center pt-2">
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-[10px]">
                          <Printer className="h-3 w-3 mr-1" /> Sim Label Print
                        </Button>
                        <Button 
                          onClick={() => handlePackerAction(order)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-[11px]"
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" /> Confirm Package & Send to QA
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Packing Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-4">
                <p>1. Verify that the correct SKU quantity matches the pack sheet.</p>
                <p>2. Select the optimal shipping box size to minimize package density charges.</p>
                <p>3. Generate standard label and route package to QA inspector conveyers.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. QA STATION */}
        <TabsContent value="qc">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Quality Inspection Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocation.updatedOrders.filter(o => o.status === 'qc').length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">No orders pending QA inspection.</div>
                ) : (
                  allocation.updatedOrders.filter(o => o.status === 'qc').map(order => (
                    <div key={order.id} className="p-4 rounded border border-slate-800 bg-slate-950/40 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-200">Order #{order.id}</span>
                        <Badge className="bg-pink-950 text-pink-400 border-pink-900 uppercase text-[9px]">
                          {order.status}
                        </Badge>
                      </div>

                      {/* Items verification */}
                      <div className="text-xs text-slate-300 bg-slate-900 p-2 rounded border border-slate-850">
                        {order.items.map(item => (
                          <div key={item.sku} className="flex justify-between py-1">
                            <span>{item.sku}</span>
                            <span>{item.quantity} units (Verified)</span>
                          </div>
                        ))}
                      </div>

                      {/* QA Action */}
                      <div className="flex justify-end gap-2 text-xs pt-1">
                        <Button 
                          onClick={() => handleQAAction(order, 'fail')}
                          variant="ghost"
                          className="text-rose-400 border border-rose-950 hover:bg-rose-950/50 h-8 text-[11px]"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Flag Exception
                        </Button>
                        <Button 
                          onClick={() => handleQAAction(order, 'approve')}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-[11px]"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve QC Pass
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">QA Protocol Checklists</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-4">
                <p>1. Open container inspect: Ensure item models are exactly correct (colors, sizes, capacities).</p>
                <p>2. Verify structural integrity: Damaged boxes or items must be rejected immediately.</p>
                <p>3. If defective, click <strong className="text-rose-400">Flag Exception</strong> to report QA Failure. The order is locked on Hold and inventory adjustments are triggered.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 4. DISPATCH STATION */}
        <TabsContent value="dispatch">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Shipping Dispatch Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocation.updatedOrders.filter(o => o.status === 'dispatch').length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">No orders pending courier dispatch.</div>
                ) : (
                  allocation.updatedOrders.filter(o => o.status === 'dispatch').map(order => (
                    <div key={order.id} className="p-4 rounded border border-slate-800 bg-slate-950/40 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-200">Order #{order.id}</span>
                        <Badge className="bg-cyan-950 text-cyan-400 border-cyan-900 uppercase text-[9px]">
                          {order.status}
                        </Badge>
                      </div>

                      {/* Courier Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block">Courier Assignment</label>
                        <Select value={selectedCourier} onValueChange={setSelectedCourier}>
                          <SelectTrigger className="bg-slate-950 border-slate-850 h-8 text-xs text-white">
                            <SelectValue placeholder="Select Courier" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-850 text-white text-xs">
                            <SelectItem value="DHL Express">DHL Express Priority</SelectItem>
                            <SelectItem value="FedEx Ground">FedEx Ground Standard</SelectItem>
                            <SelectItem value="UPS Saver">UPS Saver Courier</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Dispatch Actions */}
                      <div className="flex justify-end pt-1">
                        <Button 
                          onClick={() => handleDispatchAction(order)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-[11px]"
                        >
                          <Truck className="h-3.5 w-3.5 mr-1" /> Ship Out & Complete Order
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Courier Hand-off Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-4">
                <p>1. Verify courier barcode labels are scanned.</p>
                <p>2. Select the assigned shipping partner.</p>
                <p>3. Confirm shipment: This <strong className="text-emerald-400">deducts physical inventory counts</strong> and completes the Wareflow lifecycle.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
