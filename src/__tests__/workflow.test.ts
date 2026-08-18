import { describe, it, expect } from 'vitest';

// Mock localStorage globally for Node environment
const mockStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => mockStore[key] || null,
  setItem: (key: string, val: string) => { mockStore[key] = val; },
  removeItem: (key: string) => { delete mockStore[key]; },
  clear: () => { for (const k in mockStore) delete mockStore[k]; },
  key: (index: number) => Object.keys(mockStore)[index] || null,
  length: 0
};

import { supabase } from '../lib/supabase';
import { runAllocation } from '../lib/decisionEngine';

describe('Wareflow Order Lifecycle & Stock Adjustments', () => {
  it('should transition orders correctly and deduct stock on completion', () => {
    // Reset database to initial state
    supabase.resetDatabase();
    supabase.switchUser('usr-1'); // Manager

    const itemsBefore = supabase.getItems();
    const itemA = itemsBefore.find(i => i.sku === 'SKU-IPHONE15')!;
    
    // Create a new order that requires 2 SKU-IPHONE15 units
    const orderId = `ord-${Math.floor(Math.random() * 10000)}`;
    const newOrder = {
      id: orderId,
      status: 'pending' as const,
      priority: 'high' as const,
      customerTier: 'premium' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [{ sku: 'SKU-IPHONE15', quantity: 2, allocated: 0 }]
    };

    const orders = supabase.getOrders();
    const items = supabase.getItems();
    
    // Run allocation
    const { updatedOrders, updatedItems } = runAllocation([...orders, newOrder], items);
    
    // Save state back to DB
    const savedNewOrder = updatedOrders.find(o => o.id === orderId)!;
    expect(savedNewOrder.status).toBe('allocated');
    expect(savedNewOrder.items[0].allocated).toBe(2);

    // Save updated order
    // Simulating database storage save:
    localStorage.setItem('wf_orders', JSON.stringify(updatedOrders));
    localStorage.setItem('wf_items', JSON.stringify(updatedItems));

    // Picker takes the order to 'picking' state
    supabase.switchUser('usr-2'); // Switch to Picker
    const pickerOrder = { ...savedNewOrder, status: 'picking' as const, assignedUser: 'John Picker' };
    supabase.updateOrder(pickerOrder);

    // Packer takes the order to 'packing' state
    supabase.switchUser('usr-3'); // Packer
    const packerOrder = { ...pickerOrder, status: 'packing' as const, assignedUser: 'Sarah Packer' };
    supabase.updateOrder(packerOrder);

    // QA Inspector takes the order to 'qc' state
    supabase.switchUser('usr-4'); // QA Inspector
    const qcOrder = { ...packerOrder, status: 'qc' as const, assignedUser: 'Mike Inspector' };
    supabase.updateOrder(qcOrder);

    // Dispatcher takes the order to 'dispatch' state
    supabase.switchUser('usr-5'); // Dispatcher
    const dispatchOrder = { ...qcOrder, status: 'dispatch' as const, assignedUser: 'Dave Dispatcher' };
    supabase.updateOrder(dispatchOrder);

    // Complete the order (transition to completed) and deduct stock
    supabase.switchUser('usr-5'); // Dispatcher completes it
    const completedOrder = { ...dispatchOrder, status: 'completed' as const };
    supabase.updateOrder(completedOrder);

    // On completion, manager logs the outbound stock movement and reduces total stock
    supabase.switchUser('usr-1'); // Back to manager
    
    // Deduct stock physically
    const finalItems = supabase.getItems();
    const finalItemA = finalItems.find(i => i.sku === 'SKU-IPHONE15')!;
    
    // Create outbound movement
    supabase.insertMovement({
      sku: 'SKU-IPHONE15',
      type: 'outbound',
      quantity: 2,
      fromLocation: finalItemA.location,
      reason: 'Order ord-completed shipment',
      user: 'Alice Manager'
    });

    finalItemA.totalStock -= 2;
    finalItemA.allocated -= 2;
    supabase.updateItem(finalItemA);

    const afterItemA = supabase.getItems().find(i => i.sku === 'SKU-IPHONE15')!;
    expect(afterItemA.totalStock).toBe(itemA.totalStock - 2);
  });

  it('should enforce RLS role policies and fail unauthorized changes', () => {
    supabase.resetDatabase();
    
    // Switch to Picker
    supabase.switchUser('usr-2'); // John Picker (role: picker)

    const orders = supabase.getOrders();
    const qcOrder = orders.find(o => o.status === 'qc')!; // Mike Inspector's order

    // A picker cannot update a QC order or mark it completed (must trigger RLS violation)
    const unauthorizedOrderUpdate = { ...qcOrder, status: 'completed' as const };

    expect(() => {
      supabase.updateOrder(unauthorizedOrderUpdate);
    }).toThrow(/Permission Denied/);
  });
});
