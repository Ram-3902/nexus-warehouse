import { describe, it, expect } from 'vitest';
import { prioritizeOrders, runAllocation, getOrderScore } from '../lib/decisionEngine';
import type { Order, WarehouseItem, WarehouseLocation } from '../types/warehouse';

const mockLocation: WarehouseLocation = {
  section: 'Main',
  zone: 'Zone A',
  rack: 'Rack 1',
  shelf: 'Shelf 1',
  bin: 'Bin 1'
};

const bulkLocation: WarehouseLocation = {
  section: 'Main',
  zone: 'Zone B', // Bulk zone
  rack: 'Rack 1',
  shelf: 'Shelf 1',
  bin: 'Bin 1'
};

describe('Wareflow Prioritization Engine', () => {
  it('should score orders correctly based on priority and customer tier', () => {
    const o1: Order = {
      id: 'o1',
      status: 'pending',
      priority: 'urgent',
      customerTier: 'vip',
      items: [],
      createdAt: '2026-08-18T10:00:00Z',
      updatedAt: '2026-08-18T10:00:00Z'
    }; // Urgent VIP: 4 * 10 + 3 = 43

    const o2: Order = {
      id: 'o2',
      status: 'pending',
      priority: 'medium',
      customerTier: 'standard',
      items: [],
      createdAt: '2026-08-18T10:00:00Z',
      updatedAt: '2026-08-18T10:00:00Z'
    }; // Medium Standard: 2 * 10 + 1 = 21

    expect(getOrderScore(o1)).toBe(43);
    expect(getOrderScore(o2)).toBe(21);
  });

  it('should prioritize VIP and Urgent orders and use FIFO for tie-breaks', () => {
    const orders: Order[] = [
      {
        id: 'ord-low-vip',
        status: 'pending',
        priority: 'low',
        customerTier: 'vip',
        items: [],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      }, // 1 * 10 + 3 = 13
      {
        id: 'ord-urgent-std-new',
        status: 'pending',
        priority: 'urgent',
        customerTier: 'standard',
        items: [],
        createdAt: '2026-08-18T10:05:00Z',
        updatedAt: '2026-08-18T10:05:00Z'
      }, // 4 * 10 + 1 = 41
      {
        id: 'ord-urgent-std-old',
        status: 'pending',
        priority: 'urgent',
        customerTier: 'standard',
        items: [],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      } // 4 * 10 + 1 = 41 (Older)
    ];

    const sorted = prioritizeOrders(orders);
    expect(sorted[0].id).toBe('ord-urgent-std-old'); // Urgent standard older
    expect(sorted[1].id).toBe('ord-urgent-std-new'); // Urgent standard newer
    expect(sorted[2].id).toBe('ord-low-vip'); // Low VIP
  });
});

describe('Wareflow Inventory Allocation Engine', () => {
  it('should allocate stock fully when stock is available', () => {
    const items: WarehouseItem[] = [
      {
        sku: 'SKU-A',
        name: 'Item A',
        totalStock: 10,
        allocated: 0,
        damaged: 0,
        missing: 0,
        lowStockThreshold: 3,
        location: mockLocation
      }
    ];

    const orders: Order[] = [
      {
        id: 'ord-1',
        status: 'pending',
        priority: 'medium',
        customerTier: 'standard',
        items: [{ sku: 'SKU-A', quantity: 5, allocated: 0 }],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      }
    ];

    const { updatedOrders, updatedItems, decisions } = runAllocation(orders, items);
    
    expect(updatedOrders[0].status).toBe('allocated');
    expect(updatedOrders[0].items[0].allocated).toBe(5);
    expect(updatedItems[0].allocated).toBe(5);
    expect(decisions.length).toBe(0); // No shortage, no decisions required
  });

  it('should identify shortage and allocate remaining stock to higher priority order', () => {
    const items: WarehouseItem[] = [
      {
        sku: 'SKU-A',
        name: 'Item A',
        totalStock: 7, // Total 7 units
        allocated: 0,
        damaged: 0,
        missing: 0,
        lowStockThreshold: 3,
        location: mockLocation
      }
    ];

    const orders: Order[] = [
      {
        id: 'ord-std',
        status: 'pending',
        priority: 'medium',
        customerTier: 'standard',
        items: [{ sku: 'SKU-A', quantity: 5, allocated: 0 }],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      }, // Score: 21
      {
        id: 'ord-vip',
        status: 'pending',
        priority: 'high',
        customerTier: 'vip',
        items: [{ sku: 'SKU-A', quantity: 5, allocated: 0 }],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      } // Score: 33 (Prioritized)
    ];

    const { updatedOrders, updatedItems, decisions } = runAllocation(orders, items);

    // The VIP order (ord-vip) should get 5 units first.
    const vipOrder = updatedOrders.find(o => o.id === 'ord-vip')!;
    expect(vipOrder.status).toBe('allocated');
    expect(vipOrder.items[0].allocated).toBe(5);

    // The standard order (ord-std) gets the remaining 2 units and goes on hold.
    const stdOrder = updatedOrders.find(o => o.id === 'ord-std')!;
    expect(stdOrder.status).toBe('hold');
    expect(stdOrder.items[0].allocated).toBe(2);

    expect(updatedItems[0].allocated).toBe(7); // All 7 units allocated
    expect(decisions.length).toBe(1);
    expect(decisions[0].orderId).toBe('ord-std');
    expect(decisions[0].sku).toBe('SKU-A');
    expect(decisions[0].shortage).toBe(3);
    expect(decisions[0].available).toBe(2); // Usable stock when evaluated
  });

  it('should recommend reallocation from standard orders if possible', () => {
    const items: WarehouseItem[] = [
      {
        sku: 'SKU-A',
        name: 'Item A',
        totalStock: 7,
        allocated: 4, // 4 allocated to ord-std (pre-allocated)
        damaged: 0,
        missing: 0,
        lowStockThreshold: 3,
        location: mockLocation
      }
    ];

    // ord-vip needs 5 units, but only 3 are unallocated (7 total - 4 allocated = 3 available)
    const orders: Order[] = [
      {
        id: 'ord-vip',
        status: 'pending',
        priority: 'high',
        customerTier: 'vip',
        items: [{ sku: 'SKU-A', quantity: 5, allocated: 0 }],
        createdAt: '2026-08-18T10:05:00Z',
        updatedAt: '2026-08-18T10:05:00Z'
      },
      {
        id: 'ord-std',
        status: 'picking', // Already allocated and locked in picking state
        priority: 'low',
        customerTier: 'standard',
        items: [{ sku: 'SKU-A', quantity: 4, allocated: 4 }],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      }
    ];

    const { decisions } = runAllocation(orders, items);
    
    expect(decisions.length).toBe(1);
    expect(decisions[0].recommendedAction).toContain('Reallocate');
    expect(decisions[0].recommendedAction).toContain('ord-std');
  });

  it('should recommend replenishment if stock is in bulk storage', () => {
    const items: WarehouseItem[] = [
      {
        sku: 'SKU-A',
        name: 'Item A',
        totalStock: 2, // Genuinely short in picking
        allocated: 0,
        damaged: 0,
        missing: 0,
        lowStockThreshold: 5,
        location: bulkLocation // Zone B (Bulk storage)
      }
    ];

    const orders: Order[] = [
      {
        id: 'ord-vip',
        status: 'pending',
        priority: 'high',
        customerTier: 'vip',
        items: [{ sku: 'SKU-A', quantity: 5, allocated: 0 }],
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z'
      }
    ];

    const { decisions } = runAllocation(orders, items);
    expect(decisions[0].recommendedAction).toContain('Replenish');
    expect(decisions[0].recommendedAction).toContain('Zone B');
  });
});
