export interface WarehouseLocation {
  section: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
}

export interface WarehouseItem {
  sku: string;
  name: string;
  totalStock: number; // Total physical count in warehouse
  allocated: number;  // Reserved count for orders
  damaged: number;    // Damaged count (non-issuable)
  missing: number;    // Declared missing (needs correction)
  lowStockThreshold: number;
  location: WarehouseLocation;
}

export interface OrderItem {
  sku: string;
  quantity: number;
  allocated: number;
}

export type OrderStatus =
  | 'pending'
  | 'allocated'
  | 'picking'
  | 'packing'
  | 'qc'
  | 'dispatch'
  | 'completed'
  | 'hold';

export type OrderPriority = 'low' | 'medium' | 'high' | 'urgent';

export type CustomerTier = 'standard' | 'premium' | 'vip';

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  priority: OrderPriority;
  customerTier: CustomerTier;
  createdAt: string;
  updatedAt: string;
  assignedUser?: string;
  exceptionDetails?: string;
}

export type StockMovementType = 'inbound' | 'outbound' | 'internal_move' | 'damaged' | 'adjustment';

export interface StockMovement {
  id: string;
  sku: string;
  type: StockMovementType;
  quantity: number;
  fromLocation?: WarehouseLocation;
  toLocation?: WarehouseLocation;
  timestamp: string;
  reason: string;
  user: string;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type DeliveryImpact = 'none' | 'low' | 'medium' | 'high';

export interface AllocationDecision {
  orderId: string;
  sku: string;
  required: number;
  available: number; // Available unallocated stock (totalStock - allocated - damaged - missing)
  allocated: number;
  shortage: number;
  competingOrdersCount: number;
  replenishmentRequired: boolean;
  deliveryImpact: DeliveryImpact;
  risk: RiskLevel;
  recommendedAction: string;
}

export interface AnomalyException {
  id: string;
  orderId?: string;
  sku?: string;
  type: 'damaged' | 'missing' | 'shortage' | 'delay';
  details: string;
  status: 'pending' | 'resolved';
  reportedBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export type WarehouseRole = 'manager' | 'picker' | 'packer' | 'inspector' | 'dispatcher';

export interface WarehouseUser {
  id: string;
  name: string;
  role: WarehouseRole;
}
