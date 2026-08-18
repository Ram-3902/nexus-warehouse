import { 
  type WarehouseItem, 
  type Order, 
  type StockMovement, 
  type AnomalyException, 
  type WarehouseLocation, 
  type WarehouseRole, 
  type WarehouseUser
} from '../types/warehouse';

// Node-safe mock localStorage fallback
const mockStorage: Record<string, string> = {};
const storage = {
  getItem: (key: string) => (typeof localStorage === 'undefined') ? (mockStorage[key] || null) : localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof localStorage === 'undefined') {
      mockStorage[key] = value;
    } else {
      localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof localStorage === 'undefined') {
      delete mockStorage[key];
    } else {
      localStorage.removeItem(key);
    }
  }
};


// --- INITIAL SEED DATA ---
const SEED_LOCATIONS: WarehouseLocation[] = [
  { section: 'Main Warehouse', zone: 'Zone A', rack: 'Rack 01', shelf: 'Shelf 01', bin: 'Bin 01' },
  { section: 'Main Warehouse', zone: 'Zone A', rack: 'Rack 01', shelf: 'Shelf 02', bin: 'Bin 02' },
  { section: 'Main Warehouse', zone: 'Zone A', rack: 'Rack 02', shelf: 'Shelf 01', bin: 'Bin 01' },
  { section: 'Main Warehouse', zone: 'Zone B', rack: 'Rack 01', shelf: 'Shelf 01', bin: 'Bin 01' }, // Bulk zone
  { section: 'Main Warehouse', zone: 'Zone B', rack: 'Rack 01', shelf: 'Shelf 02', bin: 'Bin 02' },
  { section: 'Main Warehouse', zone: 'Zone C', rack: 'Rack 01', shelf: 'Shelf 01', bin: 'Bin 01' }
];

const SEED_ITEMS: WarehouseItem[] = [
  {
    sku: 'SKU-IPHONE15',
    name: 'Apple iPhone 15 Pro Max',
    totalStock: 15,
    allocated: 12,
    damaged: 1,
    missing: 0,
    lowStockThreshold: 5,
    location: SEED_LOCATIONS[0] // Zone A Rack 01 Shelf 01 Bin 01
  },
  {
    sku: 'SKU-MACBOOK',
    name: 'Apple MacBook Air M3',
    totalStock: 8,
    allocated: 6,
    damaged: 0,
    missing: 0,
    lowStockThreshold: 3,
    location: SEED_LOCATIONS[1] // Zone A Rack 01 Shelf 02 Bin 02
  },
  {
    sku: 'SKU-IPADPRO',
    name: 'Apple iPad Pro 11"',
    totalStock: 5,
    allocated: 0,
    damaged: 1,
    missing: 1,
    lowStockThreshold: 4,
    location: SEED_LOCATIONS[2] // Zone A Rack 02 Shelf 01 Bin 01 (Low stock: total usable stock = 5 - 2 = 3 < 4)
  },
  {
    sku: 'SKU-CHARGER',
    name: 'Apple 20W USB-C Power Adapter',
    totalStock: 50,
    allocated: 15,
    damaged: 0,
    missing: 0,
    lowStockThreshold: 10,
    location: SEED_LOCATIONS[3] // Zone B Rack 01 Shelf 01 Bin 01 (Bulk storage)
  },
  {
    sku: 'SKU-CABLE',
    name: 'Apple USB-C Charge Cable (1m)',
    totalStock: 7, // Total stock is 7
    allocated: 5,  // Currently allocated to other orders
    damaged: 0,
    missing: 0,
    lowStockThreshold: 5,
    location: SEED_LOCATIONS[4] // Competing order item (7 units available, but orders will compete)
  }
];

const SEED_ORDERS: Order[] = [
  {
    id: 'ord-101',
    status: 'pending',
    priority: 'urgent',
    customerTier: 'vip',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    items: [
      { sku: 'SKU-CABLE', quantity: 10, allocated: 0 } // Shortage order: requires 10, available total = 7
    ]
  },
  {
    id: 'ord-102',
    status: 'pending',
    priority: 'medium',
    customerTier: 'standard',
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6h ago (older)
    updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    items: [
      { sku: 'SKU-CABLE', quantity: 4, allocated: 4 } // Competing order holding 4 allocated cables
    ]
  },
  {
    id: 'ord-103',
    status: 'allocated',
    priority: 'high',
    customerTier: 'premium',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    items: [
      { sku: 'SKU-IPHONE15', quantity: 2, allocated: 2 },
      { sku: 'SKU-CHARGER', quantity: 2, allocated: 2 }
    ]
  },
  {
    id: 'ord-104',
    status: 'picking',
    priority: 'medium',
    customerTier: 'standard',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    assignedUser: 'John Picker',
    items: [
      { sku: 'SKU-MACBOOK', quantity: 1, allocated: 1 }
    ]
  },
  {
    id: 'ord-105',
    status: 'packing',
    priority: 'low',
    customerTier: 'standard',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    assignedUser: 'Sarah Packer',
    items: [
      { sku: 'SKU-CHARGER', quantity: 5, allocated: 5 }
    ]
  },
  {
    id: 'ord-106',
    status: 'qc',
    priority: 'high',
    customerTier: 'vip',
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    assignedUser: 'Mike Inspector',
    items: [
      { sku: 'SKU-IPHONE15', quantity: 1, allocated: 1 },
      { sku: 'SKU-CHARGER', quantity: 1, allocated: 1 }
    ]
  },
  {
    id: 'ord-107',
    status: 'dispatch',
    priority: 'medium',
    customerTier: 'premium',
    createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    assignedUser: 'Dave Dispatcher',
    items: [
      { sku: 'SKU-MACBOOK', quantity: 2, allocated: 2 }
    ]
  }
];

const SEED_MOVEMENTS: StockMovement[] = [
  {
    id: 'mov-001',
    sku: 'SKU-IPHONE15',
    type: 'inbound',
    quantity: 15,
    toLocation: SEED_LOCATIONS[0],
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    reason: 'Initial stock intake from vendor',
    user: 'System'
  },
  {
    id: 'mov-002',
    sku: 'SKU-IPHONE15',
    type: 'damaged',
    quantity: 1,
    fromLocation: SEED_LOCATIONS[0],
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    reason: 'Dropped during stocking',
    user: 'John Picker'
  }
];

const SEED_EXCEPTIONS: AnomalyException[] = [
  {
    id: 'exc-001',
    sku: 'SKU-IPHONE15',
    type: 'damaged',
    details: 'Box crushed, screen cracked in Zone A Rack 01 Shelf 01',
    status: 'pending',
    reportedBy: 'John Picker',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  }
];

// --- SECURITY LOG ENTRY TYPE ---
export interface SecurityLog {
  timestamp: string;
  role: WarehouseRole;
  action: string;
  table: string;
  status: 'GRANTED' | 'DENIED';
  details: string;
}

// --- CLASS SIMULATING SUPABASE WITH LOCALSTORAGE AND RLS ---
class SimulatedSupabaseClient {
  private users: WarehouseUser[] = [
    { id: 'usr-1', name: 'Alice Manager', role: 'manager' },
    { id: 'usr-2', name: 'John Picker', role: 'picker' },
    { id: 'usr-3', name: 'Sarah Packer', role: 'packer' },
    { id: 'usr-4', name: 'Mike Inspector', role: 'inspector' },
    { id: 'usr-5', name: 'Dave Dispatcher', role: 'dispatcher' }
  ];

  private currentUserId: string = 'usr-1'; // Default: Alice Manager
  private securityLogs: SecurityLog[] = [];

  constructor() {
    this.initDatabase();
  }

  // Set up storage
  private initDatabase() {
    if (!storage.getItem('wf_items')) {
      storage.setItem('wf_items', JSON.stringify(SEED_ITEMS));
      storage.setItem('wf_orders', JSON.stringify(SEED_ORDERS));
      storage.setItem('wf_movements', JSON.stringify(SEED_MOVEMENTS));
      storage.setItem('wf_exceptions', JSON.stringify(SEED_EXCEPTIONS));
      storage.setItem('wf_locations', JSON.stringify(SEED_LOCATIONS));
    }
  }

  // Reset database to initial state for easy testing
  public resetDatabase() {
    storage.removeItem('wf_items');
    storage.removeItem('wf_orders');
    storage.removeItem('wf_movements');
    storage.removeItem('wf_exceptions');
    storage.removeItem('wf_locations');
    this.initDatabase();
    this.logSecurity('manager', 'RESET_DATABASE', 'all', 'GRANTED', 'Database reset to initial seeds');
  }

  // Auth / Role management
  public getCurrentUser(): WarehouseUser {
    return this.users.find(u => u.id === this.currentUserId) || this.users[0];
  }

  public switchUser(userId: string) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.currentUserId = userId;
      this.logSecurity(user.role, 'SWITCH_USER', 'auth', 'GRANTED', `Switched to user ${user.name}`);
    }
  }

  public getAllUsers(): WarehouseUser[] {
    return this.users;
  }

  // Log security RLS events
  private logSecurity(role: WarehouseRole, action: string, table: string, status: 'GRANTED' | 'DENIED', details: string) {
    const newLog: SecurityLog = {
      timestamp: new Date().toISOString(),
      role,
      action,
      table,
      status,
      details
    };
    this.securityLogs.unshift(newLog);
    // Limit log size to 100 entries
    if (this.securityLogs.length > 100) {
      this.securityLogs.pop();
    }
    // Also push logs to an event listener if anyone registers in the browser
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('security-log-updated', { detail: newLog });
      window.dispatchEvent(event);
    }
  }

  public getSecurityLogs(): SecurityLog[] {
    return this.securityLogs;
  }

  // --- RLS CHECK UTILITY ---
  private checkRLS(action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', table: string, rowData?: any): boolean {
    const user = this.getCurrentUser();
    const role = user.role;

    if (role === 'manager') {
      this.logSecurity(role, action, table, 'GRANTED', `Manager bypasses RLS policies.`);
      return true;
    }

    if (action === 'SELECT') {
      // Pickers, Packers, Inspectors, Dispatchers can read everything
      this.logSecurity(role, action, table, 'GRANTED', `SELECT policy permits read-access for ${role} on ${table}.`);
      return true;
    }

    // Role-specific UPDATE / INSERT policies
    if (table === 'orders') {
      const order = rowData as Order;
      if (!order) {
        this.logSecurity(role, action, table, 'DENIED', `Attempted update on orders table without providing order payload.`);
        return false;
      }

      if (role === 'picker') {
        // Pickers can update orders only if status is 'allocated' or 'picking' (transitioning to picking or packing)
        const ok = order.status === 'allocated' || order.status === 'picking' || order.status === 'hold';
        if (ok) {
          this.logSecurity(role, action, table, 'GRANTED', `Picker update policy permits action for Order ${order.id} in state '${order.status}'.`);
          return true;
        }
      } else if (role === 'packer') {
        // Packers can update orders only if status is 'picking' or 'packing' (transitioning to packing, qc, or hold)
        const ok = order.status === 'picking' || order.status === 'packing' || order.status === 'hold';
        if (ok) {
          this.logSecurity(role, action, table, 'GRANTED', `Packer update policy permits action for Order ${order.id} in state '${order.status}'.`);
          return true;
        }
      } else if (role === 'inspector') {
        // Inspectors can update orders only in 'packing' or 'qc'
        const ok = order.status === 'packing' || order.status === 'qc' || order.status === 'hold';
        if (ok) {
          this.logSecurity(role, action, table, 'GRANTED', `Inspector update policy permits action for Order ${order.id} in state '${order.status}'.`);
          return true;
        }
      } else if (role === 'dispatcher') {
        // Dispatchers can update orders in 'qc' or 'dispatch'
        const ok = order.status === 'qc' || order.status === 'dispatch' || order.status === 'hold' || order.status === 'completed';
        if (ok) {
          this.logSecurity(role, action, table, 'GRANTED', `Dispatcher update policy permits action for Order ${order.id} in state '${order.status}'.`);
          return true;
        }
      }
      
      this.logSecurity(role, action, table, 'DENIED', `RLS Violation: Role '${role}' lacks update permissions on Order ${order.id} in state '${order.status}'.`);
      return false;
    }

    if (table === 'stock_movements') {
      if (action === 'INSERT') {
        this.logSecurity(role, action, table, 'GRANTED', `Employee insert policy permits stock movement insertion.`);
        return true;
      }
    }

    if (table === 'exceptions') {
      if (action === 'INSERT') {
        this.logSecurity(role, action, table, 'GRANTED', `Employee insert policy permits reporting exceptions.`);
        return true;
      }
    }

    this.logSecurity(role, action, table, 'DENIED', `RLS Violation: Role '${role}' is blocked from performing ${action} on ${table}.`);
    return false;
  }

  // --- DATABASE DATA API ---

  // ITEMS
  public getItems(): WarehouseItem[] {
    this.checkRLS('SELECT', 'items');
    return JSON.parse(storage.getItem('wf_items') || '[]');
  }

  public updateItem(updated: WarehouseItem) {
    if (!this.checkRLS('UPDATE', 'items', updated)) {
      throw new Error(`Permission Denied (RLS policy check failed)`);
    }
    const items = this.getItems();
    const idx = items.findIndex(i => i.sku === updated.sku);
    if (idx !== -1) {
      items[idx] = updated;
      storage.setItem('wf_items', JSON.stringify(items));
    }
  }

  // LOCATIONS
  public getLocations(): WarehouseLocation[] {
    this.checkRLS('SELECT', 'locations');
    return JSON.parse(storage.getItem('wf_locations') || '[]');
  }

  // ORDERS
  public getOrders(): Order[] {
    this.checkRLS('SELECT', 'orders');
    return JSON.parse(storage.getItem('wf_orders') || '[]');
  }

  public updateOrder(updated: Order) {
    // We need to fetch the original state to check transition policies correctly
    const orders = this.getOrders();
    const original = orders.find(o => o.id === updated.id);
    if (!original) throw new Error("Order not found");

    // Perform RLS check using the ORIGINAL order state (to verify transition starting state)
    if (!this.checkRLS('UPDATE', 'orders', original)) {
      throw new Error(`Permission Denied (RLS policy check failed for role: ${this.getCurrentUser().role})`);
    }

    const idx = orders.findIndex(o => o.id === updated.id);
    orders[idx] = {
      ...updated,
      updatedAt: new Date().toISOString()
    };
    storage.setItem('wf_orders', JSON.stringify(orders));
  }

  // STOCK MOVEMENTS
  public getMovements(): StockMovement[] {
    this.checkRLS('SELECT', 'stock_movements');
    return JSON.parse(storage.getItem('wf_movements') || '[]');
  }

  public insertMovement(movement: Omit<StockMovement, 'id' | 'timestamp'>) {
    if (!this.checkRLS('INSERT', 'stock_movements', movement)) {
      throw new Error(`Permission Denied (RLS policy check failed)`);
    }
    const movements = this.getMovements();
    const newMovement: StockMovement = {
      ...movement,
      id: `mov-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString()
    };
    movements.unshift(newMovement);
    storage.setItem('wf_movements', JSON.stringify(movements));
  }

  // EXCEPTIONS (ANOMALIES)
  public getExceptions(): AnomalyException[] {
    this.checkRLS('SELECT', 'exceptions');
    return JSON.parse(storage.getItem('wf_exceptions') || '[]');
  }

  public insertException(exception: Omit<AnomalyException, 'id' | 'createdAt' | 'status'>) {
    if (!this.checkRLS('INSERT', 'exceptions', exception)) {
      throw new Error(`Permission Denied (RLS policy check failed)`);
    }
    const exceptions = this.getExceptions();
    const newExc: AnomalyException = {
      ...exception,
      id: `exc-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    exceptions.unshift(newExc);
    storage.setItem('wf_exceptions', JSON.stringify(exceptions));
  }

  public updateException(updated: AnomalyException) {
    if (!this.checkRLS('UPDATE', 'exceptions', updated)) {
      throw new Error(`Permission Denied (RLS policy check failed)`);
    }
    const exceptions = this.getExceptions();
    const idx = exceptions.findIndex(e => e.id === updated.id);
    if (idx !== -1) {
      exceptions[idx] = updated;
      storage.setItem('wf_exceptions', JSON.stringify(exceptions));
    }
  }
}

export const supabase = new SimulatedSupabaseClient();
