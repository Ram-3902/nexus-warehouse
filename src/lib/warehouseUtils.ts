/**
 * Sanitizes an untrusted user input string by escaping HTML special characters
 * to prevent Cross-Site Scripting (XSS) attacks.
 * 
 * @param text - The raw input string
 * @returns The HTML-escaped safe string
 */
export function sanitizeInput(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Escapes leading formula characters in cells to prevent CSV Injection attacks.
 * If a cell starts with =, +, -, or @, it prepends a single quote.
 * 
 * @param cellValue - The raw cell string value
 * @returns The safe cell value
 */
export function escapeCSVCell(cellValue: string): string {
  if (!cellValue) return '';
  const trimmed = cellValue.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return cellValue;
}

/**
 * Calculates remaining time for an order's SLA limit (assumes 4-hour window from creation)
 * and returns the formatted text and status styling.
 * 
 * @param createdAt - The ISO creation timestamp of the order
 * @returns An object containing remaining time, tailwind style class, and breach status
 */
export function formatSLATimer(createdAt: string): { remaining: string; style: string; isBreached: boolean } {
  const createdTime = new Date(createdAt).getTime();
  const limitTime = createdTime + 4 * 60 * 60 * 1000; // 4-hour SLA
  const now = Date.now();
  const diff = limitTime - now;

  if (diff <= 0) {
    return {
      remaining: 'SLA BREACHED',
      style: 'text-rose-400 font-bold bg-rose-950/40 border border-rose-900 px-1.5 py-0.5 rounded',
      isBreached: true
    };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const timeStr = `${hours}h ${minutes}m remaining`;

  let style = 'text-emerald-400 bg-emerald-950/40 border border-emerald-900 px-1.5 py-0.5 rounded';
  if (hours < 1) {
    style = 'text-amber-400 bg-amber-950/40 border border-amber-900 px-1.5 py-0.5 rounded animate-pulse';
  }

  return {
    remaining: timeStr,
    style,
    isBreached: false
  };
}

/**
 * Categorizes an AMR robot's status and returns warning styles based on battery levels.
 * 
 * @param battery - The battery percentage integer (0 to 100)
 * @returns Health classification and CSS style colors
 */
export function getAMRStatus(battery: number): { health: 'optimal' | 'warning' | 'critical'; style: string } {
  if (battery > 40) {
    return { health: 'optimal', style: 'text-emerald-400 bg-emerald-950/30' };
  }
  if (battery > 15) {
    return { health: 'warning', style: 'text-amber-400 bg-amber-950/30' };
  }
  return { health: 'critical', style: 'text-rose-400 bg-rose-950/30 animate-pulse' };
}

interface Coordinate {
  x: number;
  y: number;
  label: string;
}

/**
 * Optimizes a list of SKU location coordinates using a Nearest Neighbor Traveling Salesperson (TSP) heuristic.
 * Starts at coordinate index 0 and sequentially routes to the closest remaining coordinates.
 * 
 * @param locations - List of locations with x, y, and location label
 * @returns The optimized sequence of labels and the total estimated distance
 */
export function optimizeRouteTSP(locations: Coordinate[]): { path: string[]; totalDistance: number } {
  if (locations.length === 0) return { path: [], totalDistance: 0 };
  if (locations.length === 1) return { path: [locations[0].label], totalDistance: 0 };

  const unvisited = [...locations];
  // Start from origin (usually index 0)
  let current = unvisited.shift()!;
  const path: string[] = [current.label];
  let totalDistance = 0;

  const getDistance = (c1: Coordinate, c2: Coordinate) => {
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
  };

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = getDistance(current, unvisited[0]);

    for (let i = 1; i < unvisited.length; i++) {
      const dist = getDistance(current, unvisited[i]);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }

    totalDistance += minDistance;
    current = unvisited.splice(nearestIndex, 1)[0];
    path.push(current.label);
  }

  // Return to start to complete the cycle
  totalDistance += getDistance(current, locations[0]);
  path.push(locations[0].label);

  return {
    path,
    totalDistance: Math.round(totalDistance * 10) / 10
  };
}
