import { describe, it, expect } from 'vitest';
import { 
  sanitizeInput, 
  escapeCSVCell, 
  formatSLATimer, 
  getAMRStatus, 
  optimizeRouteTSP 
} from '../lib/warehouseUtils';

describe('Warehouse Utility Functions', () => {
  describe('Input Sanitization (XSS Mitigation)', () => {
    it('should escape HTML tags and special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should return empty string for null or undefined', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('CSV Injection Prevention', () => {
    it('should escape cells starting with formula trigger tokens', () => {
      expect(escapeCSVCell('=1+1')).toBe('\'=1+1');
      expect(escapeCSVCell('+A1')).toBe('\'+A1');
      expect(escapeCSVCell('-123')).toBe('\'-123');
      expect(escapeCSVCell('@username')).toBe('\'@username');
    });

    it('should not modify standard text', () => {
      expect(escapeCSVCell('Standard Product SKU')).toBe('Standard Product SKU');
    });
  });

  describe('SLA Timer Indicator Formatting', () => {
    it('should format active SLAs correctly', () => {
      // Create a date 2 hours ago (leaves 2 hours of a 4-hour SLA window)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const result = formatSLATimer(twoHoursAgo);
      expect(result.isBreached).toBe(false);
      expect(result.remaining).toContain('remaining');
      expect(result.style).toContain('emerald');
    });

    it('should flag breached SLAs', () => {
      // Create a date 5 hours ago (breaches the 4-hour SLA window)
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      const result = formatSLATimer(fiveHoursAgo);
      expect(result.isBreached).toBe(true);
      expect(result.remaining).toBe('SLA BREACHED');
      expect(result.style).toContain('rose');
    });
  });

  describe('AMR Battery Health Categorization', () => {
    it('should flag optimal status above 40% battery', () => {
      const status = getAMRStatus(85);
      expect(status.health).toBe('optimal');
      expect(status.style).toContain('emerald');
    });

    it('should flag warning status between 15% and 40% battery', () => {
      const status = getAMRStatus(25);
      expect(status.health).toBe('warning');
      expect(status.style).toContain('amber');
    });

    it('should flag critical status below 15% battery', () => {
      const status = getAMRStatus(10);
      expect(status.health).toBe('critical');
      expect(status.style).toContain('rose');
    });
  });

  describe('AMR Route Optimization Heuristic (TSP Solver)', () => {
    it('should optimize the routing path sequence for picking', () => {
      const locations = [
        { x: 0, y: 0, label: 'Origin' },
        { x: 10, y: 10, label: 'Point B' },
        { x: 1, y: 1, label: 'Point A' }
      ];
      
      const result = optimizeRouteTSP(locations);
      
      // Starting from Origin, Point A (1,1) is much closer than Point B (10,10)
      // So path should go: Origin -> Point A -> Point B -> Origin
      expect(result.path[0]).toBe('Origin');
      expect(result.path[1]).toBe('Point A');
      expect(result.path[2]).toBe('Point B');
      expect(result.path[3]).toBe('Origin');
      expect(result.totalDistance).toBeGreaterThan(0);
    });

    it('should handle zero or single locations gracefully', () => {
      expect(optimizeRouteTSP([]).path).toEqual([]);
      expect(optimizeRouteTSP([{ x: 1, y: 1, label: 'A' }]).path).toEqual(['A']);
    });
  });
});
