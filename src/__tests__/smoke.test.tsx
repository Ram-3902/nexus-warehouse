// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock Recharts to avoid DOM measurement exceptions in jsdom
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

// Mock ResizeObserver which is relied upon by charts and dynamic layouts
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

import App from '../App';
import Dashboard from '../pages/Dashboard';
import Inventory from '../pages/Inventory';
import Orders from '../pages/Orders';
import Stations from '../pages/Stations';

describe('Smoke Testing - Page View Rendering', () => {
  it('renders Dashboard without crashing', () => {
    const { container } = render(<Dashboard />);
    expect(container).toBeTruthy();
  });

  it('renders Inventory without crashing', () => {
    const { container } = render(<Inventory />);
    expect(container).toBeTruthy();
  });

  it('renders Orders without crashing', () => {
    const { container } = render(<Orders />);
    expect(container).toBeTruthy();
  });

  it('renders Stations without crashing', () => {
    const { container } = render(<Stations />);
    expect(container).toBeTruthy();
  });

  it('renders main App layout without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});
