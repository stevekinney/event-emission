import { describe, expect, it } from 'bun:test';

import {
  type ArrayMutationDetail,
  createEventTarget,
  type EmissionEvent,
  type EventTargetLike,
  getOriginal,
  isObserved,
  type ObservableEventMap,
  type PropertyChangeDetail,
  setupEventForwarding,
} from '../src/index';

describe('observe module coverage', () => {
  describe('cloneForComparison strategies', () => {
    it('shallow strategy provides previous state', () => {
      const original = { items: [1, 2, 3] };
      const state = createEventTarget(original, {
        observe: true,
        cloneStrategy: 'shallow',
      });

      let eventReceived = false;
      state.addEventListener('update', () => {
        eventReceived = true;
      });

      state.items.push(4);

      expect(eventReceived).toBe(true);
      expect(state.items).toEqual([1, 2, 3, 4]);
    });

    it('deep strategy clones deeply with structuredClone', () => {
      const original = { nested: { value: 1 } };
      const state = createEventTarget(original, {
        observe: true,
        deep: true,
        cloneStrategy: 'deep',
      });

      let previousState: unknown;
      state.addEventListener('update', (event) => {
        previousState = (event.detail as PropertyChangeDetail).previous;
      });

      state.nested.value = 2;

      // With deep strategy, previous should be a deep clone preserving original value
      expect(state.nested.value).toBe(2);
      expect((previousState as typeof original).nested.value).toBe(1);
    });

    it('deep strategy uses provided deepClone fallback', () => {
      const original = { nested: { value: 1 } };
      let calls = 0;
      const deepClone = <T,>(value: T): T => {
        calls += 1;
        const cloned = JSON.parse(JSON.stringify(value)) as T & {
          __fromDeepClone?: boolean;
        };
        cloned.__fromDeepClone = true;
        return cloned as T;
      };
      const state = createEventTarget(original, {
        observe: true,
        deep: true,
        cloneStrategy: 'deep',
        deepClone,
      });

      let previousState: unknown;
      state.addEventListener('update', (event) => {
        previousState = (event.detail as PropertyChangeDetail).previous;
      });

      state.nested.value = 2;

      expect(calls).toBe(1);
      expect(
        (previousState as { __fromDeepClone?: boolean }).__fromDeepClone,
      ).toBe(true);
    });

    it('deep strategy throws when structuredClone is unavailable', () => {
      const original = { nested: { value: 1 } };
      const hadStructuredClone = 'structuredClone' in globalThis;
      const originalStructuredClone = (globalThis as { structuredClone?: typeof structuredClone })
        .structuredClone;

      try {
        (globalThis as { structuredClone?: typeof structuredClone }).structuredClone = undefined;
        const state = createEventTarget(original, {
          observe: true,
          deep: true,
          cloneStrategy: 'deep',
        });

        expect(() => {
          state.nested.value = 2;
        }).toThrow('structuredClone is not available');
      } finally {
        if (hadStructuredClone) {
          (globalThis as { structuredClone?: typeof structuredClone }).structuredClone =
            originalStructuredClone;
        } else {
          delete (globalThis as { structuredClone?: typeof structuredClone }).structuredClone;
        }
      }
    });

    it('unknown cloneStrategy falls back to returning original reference', () => {
      const original = { nested: { value: 1 } };
      const state = createEventTarget(original, {
        observe: true,
        cloneStrategy: 'unknown' as unknown as 'path',
      });

      let previousState: unknown;
      state.addEventListener('update', (event) => {
        previousState = (event.detail as PropertyChangeDetail).previous;
      });

      state.nested.value = 2;

      expect(previousState).toBe(original);
    });

    it('path strategy clones along changed path', () => {
      const original = { a: { b: { c: 1 } }, other: 'unchanged' };
      const state = createEventTarget(original, {
        observe: true,
        deep: true,
        cloneStrategy: 'path',
      });

      let previousState: unknown;
      state.addEventListener('update', (event) => {
        previousState = (event.detail as PropertyChangeDetail).previous;
      });

      state.a.b.c = 2;

      // With path strategy, previous preserves the old value
      expect(state.a.b.c).toBe(2);
      expect((previousState as typeof original).a.b.c).toBe(1);
    });
  });

  describe('array mutation methods coverage', () => {
    it('sort triggers update event with method info', () => {
      const original = { items: [3, 1, 2] };
      const state = createEventTarget(original, { observe: true });

      let updateEvent: EmissionEvent<unknown> | null = null;
      // Listen for the method-specific event
      state.addEventListener('update:items.sort' as 'update', (event) => {
        updateEvent = event;
      });

      state.items.sort();

      expect(updateEvent).not.toBeNull();
      expect((updateEvent!.detail as ArrayMutationDetail).method).toBe('sort');
      expect(state.items).toEqual([1, 2, 3]);
    });

    it('reverse triggers update event with method info', () => {
      const original = { items: [1, 2, 3] };
      const state = createEventTarget(original, { observe: true });

      let updateEvent: EmissionEvent<unknown> | null = null;
      state.addEventListener('update:items.reverse' as 'update', (event) => {
        updateEvent = event;
      });

      state.items.reverse();

      expect(updateEvent).not.toBeNull();
      expect((updateEvent!.detail as ArrayMutationDetail).method).toBe('reverse');
      expect(state.items).toEqual([3, 2, 1]);
    });

    it('fill triggers update event with method info', () => {
      const original = { items: [1, 2, 3] };
      const state = createEventTarget(original, { observe: true });

      let updateEvent: EmissionEvent<unknown> | null = null;
      state.addEventListener('update:items.fill' as 'update', (event) => {
        updateEvent = event;
      });

      state.items.fill(0);

      expect(updateEvent).not.toBeNull();
      expect((updateEvent!.detail as ArrayMutationDetail).method).toBe('fill');
      expect(state.items).toEqual([0, 0, 0]);
    });

    it('copyWithin triggers update event with method info', () => {
      const original = { items: [1, 2, 3, 4, 5] };
      const state = createEventTarget(original, { observe: true });

      let updateEvent: EmissionEvent<unknown> | null = null;
      state.addEventListener('update:items.copyWithin' as 'update', (event) => {
        updateEvent = event;
      });

      state.items.copyWithin(0, 3);

      expect(updateEvent).not.toBeNull();
      expect((updateEvent!.detail as ArrayMutationDetail).method).toBe('copyWithin');
      expect(state.items).toEqual([4, 5, 3, 4, 5]);
    });
  });

  describe('cloneAlongPath edge cases', () => {
    it('handles primitive values in path', () => {
      const original = { a: 1 };
      const state = createEventTarget(original, {
        observe: true,
        cloneStrategy: 'path',
      });

      let updateFired = false;
      state.addEventListener('update', () => {
        updateFired = true;
      });

      state.a = 2;

      expect(updateFired).toBe(true);
      expect(state.a).toBe(2);
    });

    it('handles null values', () => {
      const original: { value: number | null } = { value: 1 };
      const state = createEventTarget(original, { observe: true });

      let updateFired = false;
      state.addEventListener('update', () => {
        updateFired = true;
      });

      state.value = null;

      expect(updateFired).toBe(true);
      expect(state.value).toBe(null);
    });
  });

  describe('setupEventForwarding', () => {
    it('forwards events from source EventTarget to EventEmission target', () => {
      // Create a mock source EventTarget
      const sourceListeners = new Map<string, Set<(event: unknown) => void>>();
      const source = {
        addEventListener(type: string, listener: (event: unknown) => void) {
          if (!sourceListeners.has(type)) {
            sourceListeners.set(type, new Set());
          }
          sourceListeners.get(type)!.add(listener);
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          sourceListeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: { type: string; detail?: unknown }) {
          const listeners = sourceListeners.get(event.type);
          if (listeners) {
            for (const listener of listeners) {
              listener(event);
            }
          }
          return true;
        },
      };

      type Events = { custom: { value: number } };
      const target = createEventTarget<Events>();
      const received: number[] = [];

      // Set up forwarding
      const cleanup = setupEventForwarding<Events>(
        source as unknown as Parameters<typeof setupEventForwarding>[0],
        target as unknown as EventTargetLike<ObservableEventMap<Events>>,
      );

      // Add listener on target - this should trigger forwarding setup
      target.addEventListener('custom', (event) => {
        received.push(event.detail.value);
      });

      // Dispatch from source
      source.dispatchEvent({ type: 'custom', detail: { value: 42 } });

      expect(received).toEqual([42]);

      // Cleanup
      cleanup();
    });

    it('cleanup removes all forwarding handlers', () => {
      const sourceListeners = new Map<string, Set<(event: unknown) => void>>();
      const source = {
        addEventListener(type: string, listener: (event: unknown) => void) {
          if (!sourceListeners.has(type)) {
            sourceListeners.set(type, new Set());
          }
          sourceListeners.get(type)!.add(listener);
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          sourceListeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: { type: string; detail?: unknown }) {
          const listeners = sourceListeners.get(event.type);
          if (listeners) {
            for (const listener of listeners) {
              listener(event);
            }
          }
          return true;
        },
      };

      type Events = { foo: number; bar: string };
      const target = createEventTarget<Events>();
      const received: unknown[] = [];

      const cleanup = setupEventForwarding<Events>(
        source as unknown as Parameters<typeof setupEventForwarding>[0],
        target as unknown as EventTargetLike<ObservableEventMap<Events>>,
      );

      target.addEventListener('foo', (event) => {
        received.push(event.detail);
      });
      target.addEventListener('bar', (event) => {
        received.push(event.detail);
      });

      // Verify forwarding works
      source.dispatchEvent({ type: 'foo', detail: 1 });
      expect(received).toEqual([1]);

      // Cleanup and verify handlers are removed
      cleanup();

      // After cleanup, source should have no listeners for these types
      expect(sourceListeners.get('foo')?.size ?? 0).toBe(0);
      expect(sourceListeners.get('bar')?.size ?? 0).toBe(0);
    });

    it('does not forward update events', () => {
      const sourceListeners = new Map<string, Set<(event: unknown) => void>>();
      const source = {
        addEventListener(type: string, listener: (event: unknown) => void) {
          if (!sourceListeners.has(type)) {
            sourceListeners.set(type, new Set());
          }
          sourceListeners.get(type)!.add(listener);
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          sourceListeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: { type: string; detail?: unknown }) {
          const listeners = sourceListeners.get(event.type);
          if (listeners) {
            for (const listener of listeners) {
              listener(event);
            }
          }
          return true;
        },
      };

      type Events = { update: unknown; 'update:path': unknown };
      const target = createEventTarget<Events>();

      setupEventForwarding<Events>(
        source as unknown as Parameters<typeof setupEventForwarding>[0],
        target as unknown as EventTargetLike<ObservableEventMap<Events>>,
      );

      // Adding listeners for update events should NOT set up forwarding from source
      target.addEventListener('update', () => {});
      target.addEventListener('update:path', () => {});

      // Source should not have listeners for update events
      expect(sourceListeners.has('update')).toBe(false);
      expect(sourceListeners.has('update:path')).toBe(false);
    });
  });

  describe('createObservableProxy forwarding cleanup', () => {
    it('cleans up forwarding handlers on complete()', () => {
      const sourceListeners = new Map<string, Set<(event: unknown) => void>>();
      const source = {
        addEventListener(type: string, listener: (event: unknown) => void) {
          if (!sourceListeners.has(type)) {
            sourceListeners.set(type, new Set());
          }
          sourceListeners.get(type)!.add(listener);
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          sourceListeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: { type: string; detail?: unknown }) {
          const listeners = sourceListeners.get(event.type);
          if (listeners) {
            for (const listener of listeners) {
              listener(event);
            }
          }
          return true;
        },
      };

      const state = createEventTarget(source, { observe: true });
      const stateAsAny = state as unknown as EventTargetLike<Record<string, unknown>>;

      stateAsAny.addEventListener('custom', () => {});

      expect(sourceListeners.get('custom')?.size ?? 0).toBe(1);

      state.complete();

      expect(sourceListeners.get('custom')?.size ?? 0).toBe(0);
    });
  });

  it('ignores symbol property updates', () => {
    const original = { count: 0 };
    const state = createEventTarget(original, { observe: true });
    let updates = 0;

    state.addEventListener('update', () => {
      updates += 1;
    });

    const meta = Symbol('meta');
    (state as Record<symbol, unknown>)[meta] = 'value';
    delete (state as Record<symbol, unknown>)[meta];

    expect(updates).toBe(0);
  });

  describe('getOriginal and isObserved', () => {
    it('getOriginal returns original for non-proxied objects', () => {
      const obj = { value: 1 };
      expect(getOriginal(obj)).toBe(obj);
    });

    it('getOriginal returns original from proxied object', () => {
      const original = { value: 1 };
      const state = createEventTarget(original, { observe: true });

      expect(getOriginal(state)).toBe(original);
    });

    it('isObserved returns false for non-proxied objects', () => {
      const obj = { value: 1 };
      expect(isObserved(obj)).toBe(false);
    });

    it('isObserved returns true for proxied objects', () => {
      const original = { value: 1 };
      const state = createEventTarget(original, { observe: true });

      expect(isObserved(state)).toBe(true);
    });
  });

  it('exposes completed getter on observed proxy', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });

    expect(state.completed).toBe(false);
    state.complete();
    expect(state.completed).toBe(true);
  });
});
