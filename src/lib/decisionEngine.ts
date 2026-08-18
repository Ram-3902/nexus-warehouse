import type { Order, WarehouseItem, AllocationDecision, RiskLevel, DeliveryImpact } from '../types/warehouse';

// --- PRIORITIZATION ALGORITHM ---
// Sorts orders based on:
// 1. Urgency/Priority: Urgent (4) > High (3) > Medium (2) > Low (1)
// 2. Customer Tier: VIP (3) > Premium (2) > Standard (1)
// 3. FIFO: Creation Date (older orders first)
export function getOrderScore(order: Order): number {
  let priorityVal = 2; // Medium default
  if (order.priority === 'urgent') priorityVal = 4;
  else if (order.priority === 'high') priorityVal = 3;
  else if (order.priority === 'low') priorityVal = 1;

  let tierVal = 1; // Standard default
  if (order.customerTier === 'vip') tierVal = 3;
  else if (order.customerTier === 'premium') tierVal = 2;

  // Priority has highest weight, then customer tier
  return priorityVal * 10 + tierVal;
}

export function prioritizeOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const scoreA = getOrderScore(a);
    const scoreB = getOrderScore(b);

    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Descending (highest score first)
    }

    // FIFO tie-breaker: older first (smaller timestamp)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

// --- ALLOCATION ENGINE ---
// Re-calculates inventory allocations for pending/allocated orders based on priorities
// and active stock availability. Returns updated models and details of decisions.
export function runAllocation(
  orders: Order[],
  items: WarehouseItem[]
): {
  updatedOrders: Order[];
  updatedItems: WarehouseItem[];
  decisions: AllocationDecision[];
} {
  // Create deep copies to keep it pure
  const itemsMap = new Map<string, WarehouseItem>(
    items.map(item => [item.sku, { ...item, allocated: 0 }])
  );

  const updatedOrders = orders.map(o => ({
    ...o,
    items: o.items.map(i => ({ ...i, allocated: 0 }))
  }));

  // 1. Lock allocations for orders already in progress (picking, packing, qc, dispatch, completed)
  // These cannot be modified by the allocation engine.
  for (const order of updatedOrders) {
    if (order.status !== 'pending' && order.status !== 'allocated' && order.status !== 'hold') {
      // These are "locked" states
      for (const orderItem of order.items) {
        const item = itemsMap.get(orderItem.sku);
        if (item) {
          // Lock the allocated quantity
          const qtyToLock = Math.min(orderItem.quantity, item.totalStock - item.damaged - item.missing);
          orderItem.allocated = qtyToLock;
          item.allocated += qtyToLock;
        }
      }
    }
  }

  // 2. Prioritize remaining orders (pending, allocated, hold)
  const allocationQueue = updatedOrders.filter(
    o => o.status === 'pending' || o.status === 'allocated' || o.status === 'hold'
  );
  const sortedQueue = prioritizeOrders(allocationQueue);

  const decisions: AllocationDecision[] = [];

  // 3. Allocate stock sequentially for queue orders
  for (const order of sortedQueue) {
    let orderFullyAllocated = true;

    for (const orderItem of order.items) {
      const item = itemsMap.get(orderItem.sku);
      if (!item) {
        orderFullyAllocated = false;
        continue;
      }

      // Issuable stock: totalStock - damaged - missing
      // Usable available stock: totalStock - allocated (running) - damaged - missing
      const usableStock = Math.max(0, item.totalStock - item.allocated - item.damaged - item.missing);
      
      const toAllocate = Math.min(orderItem.quantity, usableStock);
      orderItem.allocated = toAllocate;
      item.allocated += toAllocate;

      const shortage = orderItem.quantity - toAllocate;

      if (shortage > 0) {
        orderFullyAllocated = false;

        // Compute decision details
        const competingOrders = updatedOrders.filter(
          o => o.id !== order.id && 
               o.items.some(i => i.sku === orderItem.sku) &&
               o.status !== 'completed'
        );

        const replenishmentRequired = item.totalStock < item.lowStockThreshold || shortage > 0;
        
        // Delivery Impact
        let deliveryImpact: DeliveryImpact = 'low';
        if (order.priority === 'urgent' || order.customerTier === 'vip') {
          deliveryImpact = 'high';
        } else if (order.customerTier === 'premium' || order.priority === 'high') {
          deliveryImpact = 'medium';
        }

        // Risk Level
        let risk: RiskLevel = 'low';
        const percentShortage = (shortage / orderItem.quantity) * 100;
        if (order.customerTier === 'vip' && percentShortage > 25) {
          risk = 'high';
        } else if (order.customerTier === 'premium' || percentShortage > 50) {
          risk = 'medium';
        }

        // Action Recommendation Engine
        let recommendedAction = '';
        
        // Check for Bulk-to-Pick replenishment possibility:
        // Item is in a bulk zone (Zone B/C) but shortage exists.
        const isBulkLocation = item.location.zone.toLowerCase().includes('zone b') || item.location.zone.toLowerCase().includes('zone c');
        
        // Find if there is any standard customer order we can reallocate from
        const lowPriorityAllocatedOrders = orders.filter(
          o => o.id !== order.id &&
               o.customerTier === 'standard' &&
               (o.priority === 'low' || o.priority === 'medium') &&
               o.items.some(i => i.sku === orderItem.sku && i.allocated > 0)
        );

        if (lowPriorityAllocatedOrders.length > 0) {
          const compOrderId = lowPriorityAllocatedOrders[0].id;
          recommendedAction = `Reallocate: De-allocate ${shortage} units from Standard Order #${compOrderId} to prioritize this ${order.customerTier.toUpperCase()} Order.`;
        } else if (isBulkLocation) {
          recommendedAction = `Replenish: Initiate internal transfer of ${shortage} units from Bulk ${item.location.zone} to Picking Zone A.`;
        } else if (item.damaged > 0 || item.missing > 0) {
          recommendedAction = `Resolve Exceptions: Inspect and repair/replace ${item.damaged} damaged units of ${item.sku} or report missing inventory audit.`;
        } else {
          recommendedAction = `Purchase Order: Core warehouse inventory is empty. Place an immediate vendor Purchase Order for ${shortage} units of SKU ${orderItem.sku}.`;
        }

        decisions.push({
          orderId: order.id,
          sku: orderItem.sku,
          required: orderItem.quantity,
          available: usableStock,
          allocated: toAllocate,
          shortage,
          competingOrdersCount: competingOrders.length,
          replenishmentRequired,
          deliveryImpact,
          risk,
          recommendedAction
        });
      }
    }

    // Set order status based on allocation completeness
    if (orderFullyAllocated) {
      if (order.status === 'pending' || order.status === 'hold') {
        order.status = 'allocated';
      }
    } else {
      order.status = 'hold'; // Put on hold due to shortage
    }
  }

  // Map deep copy items array back to list
  const updatedItems = Array.from(itemsMap.values());

  return {
    updatedOrders,
    updatedItems,
    decisions
  };
}
