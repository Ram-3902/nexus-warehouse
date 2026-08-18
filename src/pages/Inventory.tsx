import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { WarehouseItem, WarehouseLocation } from '../types/warehouse';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Search, ArrowUpDown, Plus, MapPin, Box 
} from 'lucide-react';

// Zod Validation Schema for Stock Movement
const movementSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  type: z.enum(['inbound', 'internal_move', 'damaged', 'adjustment'] as const),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  zone: z.string().optional(),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  bin: z.string().optional()
});

type MovementFormValues = z.infer<typeof movementSchema>;

export default function Inventory() {
  const [dbItems, setDbItems] = useState<WarehouseItem[]>(() => supabase.getItems());
  const [search, setSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('All');
  
  // Table Sorting
  const [sortField, setSortField] = useState<keyof WarehouseItem>('sku');
  const [sortAsc, setSortAsc] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 6;

  // React Hook Form for movements
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      sku: '',
      type: 'inbound',
      quantity: 1,
      reason: '',
      zone: 'Zone A',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      bin: 'Bin 01'
    }
  });

  const watchType = watch('type');

  // Load fresh items
  const reloadData = () => {
    setDbItems(supabase.getItems());
  };

  // Get distinct zones for spatial drill-down
  const zones = useMemo(() => {
    const locations = supabase.getLocations();
    const set = new Set(locations.map(l => l.zone));
    return ['All', ...Array.from(set)];
  }, []);

  // Handle Sort
  const handleSort = (field: keyof WarehouseItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filter and Sort Items
  const filteredSortedItems = useMemo(() => {
    let result = dbItems.filter(item => {
      const matchSearch = item.sku.toLowerCase().includes(search.toLowerCase()) || 
                          item.name.toLowerCase().includes(search.toLowerCase());
      const matchZone = selectedZone === 'All' || item.location.zone === selectedZone;
      return matchSearch && matchZone;
    });

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Handle nested location string representation for sorting
      if (sortField === 'location') {
        valA = `${a.location.zone}-${a.location.rack}-${a.location.shelf}-${a.location.bin}`;
        valB = `${b.location.zone}-${b.location.rack}-${b.location.shelf}-${b.location.bin}`;
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortAsc ? valA - valB : valB - valA;
      }
    });

    return result;
  }, [dbItems, search, selectedZone, sortField, sortAsc]);

  // Paginated Items
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredSortedItems.slice(start, start + itemsPerPage);
  }, [filteredSortedItems, page]);

  const totalPages = Math.ceil(filteredSortedItems.length / itemsPerPage) || 1;

  // Submit Stock Movement Form
  const onSubmitMovement = (values: MovementFormValues) => {
    const user = supabase.getCurrentUser();
    
    try {
      // Find the item
      const item = dbItems.find(i => i.sku === values.sku);
      if (!item && values.type !== 'inbound') {
        toast.error(`SKU ${values.sku} does not exist in inventory.`);
        return;
      }

      const targetLoc: WarehouseLocation = {
        section: 'Main Warehouse',
        zone: values.zone || 'Zone A',
        rack: values.rack || 'Rack 01',
        shelf: values.shelf || 'Shelf 01',
        bin: values.bin || 'Bin 01'
      };

      if (values.type === 'inbound') {
        if (item) {
          // Add to existing stock
          const updatedItem = {
            ...item,
            totalStock: item.totalStock + values.quantity
          };
          supabase.updateItem(updatedItem);
        } else {
          // Create new item (requires manager privileges)
          const newItem: WarehouseItem = {
            sku: values.sku,
            name: values.sku.replace('SKU-', 'Product '),
            totalStock: values.quantity,
            allocated: 0,
            damaged: 0,
            missing: 0,
            lowStockThreshold: 5,
            location: targetLoc
          };
          supabase.updateItem(newItem);
        }

        supabase.insertMovement({
          sku: values.sku,
          type: 'inbound',
          quantity: values.quantity,
          toLocation: targetLoc,
          reason: values.reason,
          user: user.name
        });
        toast.success(`Inbound stock logged successfully.`);
      }

      else if (values.type === 'internal_move') {
        if (item) {
          const updatedItem = {
            ...item,
            location: targetLoc
          };
          supabase.updateItem(updatedItem);

          supabase.insertMovement({
            sku: values.sku,
            type: 'internal_move',
            quantity: values.quantity,
            fromLocation: item.location,
            toLocation: targetLoc,
            reason: values.reason,
            user: user.name
          });
          toast.success(`Internal stock transfer logged.`);
        }
      }

      else if (values.type === 'damaged') {
        if (item) {
          const usable = item.totalStock - item.allocated - item.damaged - item.missing;
          if (values.quantity > usable) {
            toast.error(`Cannot report ${values.quantity} damaged units. Only ${usable} usable stock remaining.`);
            return;
          }

          const updatedItem = {
            ...item,
            damaged: item.damaged + values.quantity
          };
          supabase.updateItem(updatedItem);

          supabase.insertMovement({
            sku: values.sku,
            type: 'damaged',
            quantity: values.quantity,
            fromLocation: item.location,
            reason: values.reason,
            user: user.name
          });

          // Insert into exceptions list
          supabase.insertException({
            sku: values.sku,
            type: 'damaged',
            details: `DAMAGED STOCK: ${values.quantity} units reported by ${user.name}. Reason: ${values.reason}`,
            reportedBy: user.name
          });

          toast.success(`Damage exception reported successfully.`);
        }
      }

      else if (values.type === 'adjustment') {
        // Physical count adjustment (e.g. during manual audits). Restricted to managers
        if (item) {
          const updatedItem = {
            ...item,
            totalStock: values.quantity
          };
          supabase.updateItem(updatedItem);

          supabase.insertMovement({
            sku: values.sku,
            type: 'adjustment',
            quantity: values.quantity,
            reason: `Audit stock count adjustment: ${values.reason}`,
            user: user.name
          });
          toast.success(`Stock level adjusted successfully.`);
        }
      }

      reloadData();
      reset({
        sku: '',
        type: 'inbound',
        quantity: 1,
        reason: '',
        zone: 'Zone A',
        rack: 'Rack 01',
        shelf: 'Shelf 01',
        bin: 'Bin 01'
      });
    } catch (err: any) {
      toast.error(err.message || 'Action blocked by database security (RLS violation).');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Inventory Management</h1>
        <p className="text-sm text-slate-400">Track spatial coordinates (Zone → Rack → Shelf → Bin) and update stock levels.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Spatial Drill-down Explorer */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-400" />
              Spatial Zone Drill-Down Explorer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {zones.map(zone => (
                <button
                  key={zone}
                  onClick={() => {
                    setSelectedZone(zone);
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border ${
                    selectedZone === zone 
                      ? 'bg-sky-500 border-sky-400 text-white' 
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Box className="h-3.5 w-3.5" />
                  {zone === 'All' ? 'All Warehouse Zones' : zone}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Inventory Stock Table */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Inventory Items</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="search"
                placeholder="Search SKU or Name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 bg-slate-950 border-slate-850 h-9 text-xs text-white"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('sku')}>
                      SKU <ArrowUpDown className="h-3 w-3 inline ml-1" />
                    </th>
                    <th className="py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                      Product Name <ArrowUpDown className="h-3 w-3 inline ml-1" />
                    </th>
                    <th className="py-2.5 text-center">Usable</th>
                    <th className="py-2.5 text-center">Allocated</th>
                    <th className="py-2.5 text-center">Damaged</th>
                    <th className="py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('location')}>
                      Bin Coordinates <ArrowUpDown className="h-3 w-3 inline ml-1" />
                    </th>
                    <th className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No items found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => {
                      const usable = item.totalStock - item.allocated - item.damaged - item.missing;
                      const isLowStock = usable < item.lowStockThreshold;

                      return (
                        <tr key={item.sku} className="hover:bg-slate-900/30 transition">
                          <td className="py-3 font-semibold text-sky-400">{item.sku}</td>
                          <td className="py-3 text-slate-200">{item.name}</td>
                          <td className="py-3 text-center font-bold">{usable}</td>
                          <td className="py-3 text-center text-slate-400">{item.allocated}</td>
                          <td className="py-3 text-center text-rose-400">{item.damaged}</td>
                          <td className="py-3 text-slate-400 text-[10px]">
                            {item.location.zone} • {item.location.rack} • {item.location.shelf} • {item.location.bin}
                          </td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isLowStock 
                                ? 'bg-amber-950/60 text-amber-400 border border-amber-900' 
                                : 'bg-emerald-950/60 text-emerald-400 border border-emerald-900'
                            }`}>
                              {isLowStock ? 'Low Stock' : 'Optimal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-2 border-t border-slate-850 text-slate-400 text-xs">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button 
                    disabled={page === 1} 
                    onClick={() => setPage(page - 1)} 
                    variant="outline" 
                    size="sm"
                    className="h-8 text-xs border-slate-800 hover:bg-slate-800 text-white"
                  >
                    Previous
                  </Button>
                  <Button 
                    disabled={page === totalPages} 
                    onClick={() => setPage(page + 1)} 
                    variant="outline" 
                    size="sm"
                    className="h-8 text-xs border-slate-800 hover:bg-slate-800 text-white"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Movement Form */}
        <Card className="border-slate-800 bg-slate-900/60 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-400" />
              Log Stock Movement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitMovement)} className="space-y-4 text-xs">
              
              {/* SKU selection */}
              <div>
                <label className="text-slate-400 block mb-1">SKU / Item</label>
                <Select onValueChange={(val) => setValue('sku', val)}>
                  <SelectTrigger className="bg-slate-950 border-slate-850 text-white h-9 text-xs">
                    <SelectValue placeholder="Select SKU" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-850 text-white text-xs">
                    {dbItems.map(item => (
                      <SelectItem key={item.sku} value={item.sku}>{item.sku} - {item.name}</SelectItem>
                    ))}
                    <SelectItem value="SKU-NEWPRODUCT">Create New SKU-NEWPRODUCT</SelectItem>
                  </SelectContent>
                </Select>
                {errors.sku && <p className="text-rose-400 text-[10px] mt-1">{errors.sku.message}</p>}
              </div>

              {/* Movement Type */}
              <div>
                <label className="text-slate-400 block mb-1">Movement Type</label>
                <Select defaultValue="inbound" onValueChange={(val: any) => setValue('type', val)}>
                  <SelectTrigger className="bg-slate-950 border-slate-850 text-white h-9 text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-850 text-white text-xs">
                    <SelectItem value="inbound">Inbound Intake (+ Stock)</SelectItem>
                    <SelectItem value="internal_move">Internal Stock Transfer</SelectItem>
                    <SelectItem value="damaged">Report Damaged / Exceptional Loss</SelectItem>
                    <SelectItem value="adjustment">Audit Count Adjustment (Manager Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-slate-400 block mb-1">Quantity</label>
                <Input
                  type="number"
                  placeholder="Quantity"
                  {...register('quantity', { valueAsNumber: true })}
                  className="bg-slate-950 border-slate-850 h-9 text-xs text-white"
                />
                {errors.quantity && <p className="text-rose-400 text-[10px] mt-1">{errors.quantity.message}</p>}
              </div>

              {/* Spatial Location Target (only if Inbound or Transfer) */}
              {(watchType === 'inbound' || watchType === 'internal_move') && (
                <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2.5 rounded border border-slate-850">
                  <div className="col-span-2 text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-sky-400" /> Target Coordinates
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Zone</label>
                    <Input {...register('zone')} className="bg-slate-950 border-slate-850 h-8 text-[11px] text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Rack</label>
                    <Input {...register('rack')} className="bg-slate-950 border-slate-850 h-8 text-[11px] text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Shelf</label>
                    <Input {...register('shelf')} className="bg-slate-950 border-slate-850 h-8 text-[11px] text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Bin</label>
                    <Input {...register('bin')} className="bg-slate-950 border-slate-850 h-8 text-[11px] text-white" />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-slate-400 block mb-1">Reason / Notes</label>
                <Input
                  placeholder="e.g. Inbound shipment arrival, periodic auditing, box damage"
                  {...register('reason')}
                  className="bg-slate-950 border-slate-850 h-9 text-xs text-white"
                />
                {errors.reason && <p className="text-rose-400 text-[10px] mt-1">{errors.reason.message}</p>}
              </div>

              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-9">
                Log Movement
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
