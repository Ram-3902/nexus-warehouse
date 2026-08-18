import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce updates of a value.
 * Used to avoid redundant re-renders and excessive calculations during keystrokes in search bars.
 * 
 * @param value - The input value to debounce
 * @param delay - The debounce timeout in milliseconds
 * @returns The debounced value
 */
export default function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
