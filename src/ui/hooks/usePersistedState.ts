import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Drop-in replacement for useState that persists to localStorage.
 * Safely handles missing keys, corrupt JSON, and type mismatches.
 *
 * @param key       localStorage key
 * @param fallback  initial value if nothing is stored / parse fails
 */
export function usePersistedState<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
    const [state, setStateInner] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) {return fallback;}
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    });

    // Keep a ref so the write effect doesn't fire on first render with the
    // hydrated value (which is already persisted).
    const isFirst = useRef(true);

    useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false;
            return;
        }
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch {
            // Quota exceeded or private browsing — silently ignore
        }
    }, [key, state]);

    const setState = useCallback((v: T | ((prev: T) => T)) => {
        setStateInner(prev => (typeof v === 'function' ? (v as (prev: T) => T)(prev) : v));
    }, []);

    return [state, setState];
}
