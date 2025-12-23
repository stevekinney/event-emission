import { describe, expect, it } from 'bun:test';

import {
  BufferOverflowError,
  Eventful,
  type EventfulEvent,
  type MinimalAbortSignal,
} from '../src/index';

// Concrete implementation for testing
class TestEmitter extends Eventful<{
  foo: number;
  bar: string;
  baz: { x: number; y: number };
}> {}

// Test emitter with explicit error event type for error handling tests
class TestEmitterWithError extends Eventful<{
  foo: number;
  bar: string;
  error: Error;
}> {}

function createAbortSignal(): { signal: MinimalAbortSignal; abort: () => void } {
  const listeners = new Set<() => void>();
  const signal: MinimalAbortSignal = {
    aborted: false,
    reason: undefined,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  return {
    signal,
    abort: () => {
      if (signal.aborted) return;
      Object.assign(signal, { aborted: true });
      for (const listener of Array.from(listeners)) listener();
    },
  };
}

describe('Eventful abstract class', () => {
  describe('subclass usage', () => {
    it('allows extending with typed events', () => {
      const emitter = new TestEmitter();
      let payload: EventfulEvent<number> | null = null;

      emitter.addEventListener('foo', (event) => {
        payload = event;
      });
      emitter.dispatchEvent({ type: 'foo', detail: 42 });

      expect(payload?.detail).toBe(42);
    });

    it('emits events from subclass methods', () => {
      class CustomEmitter extends Eventful<{ ready: { timestamp: number } }> {
        initialize() {
          this.dispatchEvent({ type: 'ready', detail: { timestamp: 123 } });
        }
      }

      const emitter = new CustomEmitter();
      let received: EventfulEvent<{ timestamp: number }> | null = null;

      emitter.addEventListener('ready', (event) => {
        received = event;
      });
      emitter.initialize();

      expect(received?.detail.timestamp).toBe(123);
    });
  });

  describe('DOM EventTarget methods', () => {
    it('addEventListener dispatches events to listeners', () => {
      const emitter = new TestEmitter();
      let payload: number | null = null;

      emitter.addEventListener('foo', (event) => {
        payload = event.detail;
      });
      emitter.dispatchEvent({ type: 'foo', detail: 100 });

      expect(payload).toBe(100);
    });

    it('removeEventListener removes the listener', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      const listener = () => {
        calls += 1;
      };

      emitter.addEventListener('foo', listener);
      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(calls).toBe(1);

      emitter.removeEventListener('foo', listener);
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      expect(calls).toBe(1);
    });

    it('dispatchEvent returns false after completion', () => {
      const emitter = new TestEmitter();
      expect(emitter.dispatchEvent({ type: 'foo', detail: 1 })).toBe(true);
      emitter.complete();
      expect(emitter.dispatchEvent({ type: 'foo', detail: 2 })).toBe(false);
    });

    it('addEventListener returns unsubscribe function', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      const unsubscribe = emitter.addEventListener('foo', () => {
        calls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      unsubscribe();
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      expect(calls).toBe(1);
    });
  });

  describe('convenience methods', () => {
    it('once fires listener only once', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      emitter.once('foo', () => {
        calls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      expect(calls).toBe(1);
    });

    it('removeAllListeners removes all listeners for a type', () => {
      const emitter = new TestEmitter();
      let fooCalls = 0;
      let barCalls = 0;

      emitter.addEventListener('foo', () => {
        fooCalls += 1;
      });
      emitter.addEventListener('foo', () => {
        fooCalls += 1;
      });
      emitter.addEventListener('bar', () => {
        barCalls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'bar', detail: 'x' });
      expect(fooCalls).toBe(2);
      expect(barCalls).toBe(1);

      emitter.removeAllListeners('foo');
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      emitter.dispatchEvent({ type: 'bar', detail: 'y' });

      expect(fooCalls).toBe(2);
      expect(barCalls).toBe(2);
    });

    it('removeAllListeners without type removes all listeners', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      emitter.addEventListener('foo', () => {
        calls += 1;
      });
      emitter.addEventListener('bar', () => {
        calls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'bar', detail: 'x' });
      expect(calls).toBe(2);

      emitter.removeAllListeners();
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      emitter.dispatchEvent({ type: 'bar', detail: 'y' });

      expect(calls).toBe(2);
    });
  });

  describe('once and signal handling', () => {
    it('once listeners auto-remove after first call', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      emitter.addEventListener(
        'foo',
        () => {
          calls += 1;
        },
        { once: true },
      );

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      expect(calls).toBe(1);
    });

    it('signal aborts listener', () => {
      const emitter = new TestEmitter();
      let calls = 0;
      const { signal, abort } = createAbortSignal();

      emitter.addEventListener(
        'foo',
        () => {
          calls += 1;
        },
        { signal },
      );

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      abort();
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      expect(calls).toBe(1);
    });

    it('already-aborted signal does not add listener', () => {
      const emitter = new TestEmitter();
      let calls = 0;
      const { signal, abort } = createAbortSignal();
      abort();

      emitter.addEventListener(
        'foo',
        () => {
          calls += 1;
        },
        { signal },
      );

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(calls).toBe(0);
    });
  });

  describe('error handling', () => {
    it('emits error event for sync errors', () => {
      let captured: Error | null = null;
      const emitter = new TestEmitterWithError();

      emitter.addEventListener('error', (event) => {
        captured = event.detail;
      });

      emitter.addEventListener('foo', () => {
        throw new Error('sync fail');
      });
      emitter.dispatchEvent({ type: 'foo', detail: 1 });

      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error).message).toBe('sync fail');
    });

    it('re-throws sync errors when no error listener', () => {
      const emitter = new TestEmitter();

      emitter.addEventListener('foo', () => {
        throw new Error('sync fail');
      });

      expect(() => emitter.dispatchEvent({ type: 'foo', detail: 1 })).toThrow('sync fail');
    });

    it('emits error event for async errors', async () => {
      const errors: Error[] = [];
      const emitter = new TestEmitterWithError();

      emitter.addEventListener('error', (event) => {
        errors.push(event.detail);
      });

      emitter.addEventListener('foo', async () => {
        throw new Error('async fail');
      });
      emitter.dispatchEvent({ type: 'foo', detail: 1 });

      await Promise.resolve();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
    });
  });

  describe('clear method', () => {
    it('removes all listeners', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      emitter.addEventListener('foo', () => {
        calls += 1;
      });
      emitter.clear();
      emitter.dispatchEvent({ type: 'foo', detail: 1 });

      expect(calls).toBe(0);
    });
  });

  describe('TC39 Observable interop', () => {
    it('subscribe with observer object receives events', () => {
      const emitter = new TestEmitter();
      const received: EventfulEvent<unknown>[] = [];

      emitter.subscribe({
        next: (event) => received.push(event),
      });

      emitter.dispatchEvent({ type: 'foo', detail: 42 });
      emitter.dispatchEvent({ type: 'bar', detail: 'hello' });

      expect(received).toHaveLength(2);
      expect(received[0]?.detail).toBe(42);
      expect(received[1]?.detail).toBe('hello');
    });

    it('subscribe with callback function receives events', () => {
      const emitter = new TestEmitter();
      const received: EventfulEvent<unknown>[] = [];

      emitter.subscribe((event) => received.push(event));

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(received).toHaveLength(1);
    });

    it('subscription.unsubscribe stops receiving events', () => {
      const emitter = new TestEmitter();
      const received: EventfulEvent<unknown>[] = [];

      const sub = emitter.subscribe((event) => received.push(event));

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      sub.unsubscribe();
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      expect(received).toHaveLength(1);
    });

    it('subscription.closed reflects state', () => {
      const emitter = new TestEmitter();
      const sub = emitter.subscribe(() => {});

      expect(sub.closed).toBe(false);
      sub.unsubscribe();
      expect(sub.closed).toBe(true);
    });

    it('Symbol.observable returns an observable', () => {
      const emitter = new TestEmitter();
      const observable = emitter[Symbol.observable]();
      // Should return an observable with subscribe method
      expect(typeof observable.subscribe).toBe('function');
    });

    it('subscribing to completed emitter calls complete immediately', () => {
      const emitter = new TestEmitter();
      emitter.complete();

      let completed = false;
      const sub = emitter.subscribe({
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
      expect(sub.closed).toBe(true);
    });
  });

  describe('lifecycle completion', () => {
    it('complete() suppresses further dispatches', () => {
      const emitter = new TestEmitter();
      let calls = 0;

      emitter.addEventListener('foo', () => {
        calls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(calls).toBe(1);

      emitter.complete();
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      expect(calls).toBe(1);
    });

    it('complete() notifies observable subscribers', () => {
      const emitter = new TestEmitter();
      let completed = false;

      emitter.subscribe({
        complete: () => {
          completed = true;
        },
      });

      emitter.complete();
      expect(completed).toBe(true);
    });

    it('complete() is idempotent', () => {
      const emitter = new TestEmitter();
      let completeCount = 0;

      emitter.subscribe({
        complete: () => {
          completeCount += 1;
        },
      });

      emitter.complete();
      emitter.complete();
      emitter.complete();

      expect(completeCount).toBe(1);
    });

    it('completed getter reflects state', () => {
      const emitter = new TestEmitter();
      expect(emitter.completed).toBe(false);
      emitter.complete();
      expect(emitter.completed).toBe(true);
    });

    it('addEventListener after completion does not add listener', () => {
      const emitter = new TestEmitter();
      emitter.complete();

      let calls = 0;
      emitter.addEventListener('foo', () => {
        calls += 1;
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(calls).toBe(0);
    });
  });

  describe('async iterator events()', () => {
    it('iterates over events of specified type', async () => {
      const emitter = new TestEmitter();
      const results: number[] = [];

      const iterator = emitter.events('foo');

      // Emit some events
      setTimeout(() => {
        emitter.dispatchEvent({ type: 'foo', detail: 1 });
        emitter.dispatchEvent({ type: 'foo', detail: 2 });
        emitter.dispatchEvent({ type: 'bar', detail: 'ignored' });
        emitter.dispatchEvent({ type: 'foo', detail: 3 });
        emitter.complete();
      }, 0);

      for await (const event of iterator) {
        results.push(event.detail);
        if (results.length === 3) break;
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it('ends iteration on complete()', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo');

      setTimeout(() => {
        emitter.dispatchEvent({ type: 'foo', detail: 1 });
        emitter.complete();
      }, 0);

      const results: number[] = [];
      for await (const event of iterator) {
        results.push(event.detail);
      }

      expect(results).toEqual([1]);
    });

    it('ends iteration on signal abort', async () => {
      const emitter = new TestEmitter();
      const { signal, abort } = createAbortSignal();
      const iterator = emitter.events('foo', { signal });

      setTimeout(() => {
        emitter.dispatchEvent({ type: 'foo', detail: 1 });
        abort();
        emitter.dispatchEvent({ type: 'foo', detail: 2 });
      }, 0);

      const results: number[] = [];
      for await (const event of iterator) {
        results.push(event.detail);
      }

      expect(results).toEqual([1]);
    });

    it('buffers events when iterator is not consuming', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo');

      // Emit before consuming
      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      const result1 = await iterator.next();
      const result2 = await iterator.next();

      expect(result1.value?.detail).toBe(1);
      expect(result2.value?.detail).toBe(2);

      emitter.complete();
    });

    it('drop-oldest overflow strategy works', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo', {
        bufferSize: 2,
        overflowStrategy: 'drop-oldest',
      });

      // Emit more than buffer size before consuming
      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      emitter.dispatchEvent({ type: 'foo', detail: 3 }); // Should drop 1

      const result1 = await iterator.next();
      const result2 = await iterator.next();

      expect(result1.value?.detail).toBe(2);
      expect(result2.value?.detail).toBe(3);

      emitter.complete();
    });

    it('drop-latest overflow strategy works', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo', {
        bufferSize: 2,
        overflowStrategy: 'drop-latest',
      });

      // Emit more than buffer size before consuming
      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      emitter.dispatchEvent({ type: 'foo', detail: 3 }); // Should be dropped

      const result1 = await iterator.next();
      const result2 = await iterator.next();

      expect(result1.value?.detail).toBe(1);
      expect(result2.value?.detail).toBe(2);

      emitter.complete();
    });

    it('throw overflow strategy throws BufferOverflowError', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo', {
        bufferSize: 1,
        overflowStrategy: 'throw',
      });

      // Fill the buffer
      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      // Overflow the buffer
      emitter.dispatchEvent({ type: 'foo', detail: 2 });

      // First next() should succeed with buffered event
      const first = await iterator.next();
      expect(first.value?.detail).toBe(1);

      // Second next() should throw BufferOverflowError
      await expect(iterator.next()).rejects.toThrow(BufferOverflowError);
    });

    it('return() cleans up iterator', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo');

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      const result = await iterator.return?.();

      expect(result?.done).toBe(true);
    });

    it('returns done immediately when already completed', async () => {
      const emitter = new TestEmitter();
      emitter.complete();

      const iterator = emitter.events('foo');

      const result = await iterator.next();
      expect(result.done).toBe(true);

      // return() also works on completed iterator
      const returnResult = await iterator.return?.();
      expect(returnResult?.done).toBe(true);
    });

    it('for-await-of exits immediately when already completed', async () => {
      const emitter = new TestEmitter();
      emitter.complete();

      const results: number[] = [];
      for await (const event of emitter.events('foo')) {
        results.push(event.detail);
      }

      expect(results).toEqual([]);
    });
  });

  describe('subscription tracking cleanup', () => {
    it('cleans up subscription tracking when unsubscribing (untyped)', () => {
      const emitter = new TestEmitter();
      const received1: number[] = [];
      const received2: number[] = [];

      // Create two separate subscriptions using untyped subscribe
      const sub1 = emitter.subscribe((event) => {
        received1.push(event.detail as number);
      });
      const sub2 = emitter.subscribe((event) => {
        received2.push(event.detail as number);
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1]);

      // Unsubscribe one
      sub1.unsubscribe();
      expect(sub1.closed).toBe(true);
      expect(sub2.closed).toBe(false);

      // Emit again - only sub2 should receive
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1, 2]);

      // Unsubscribe the other
      sub2.unsubscribe();
      expect(sub2.closed).toBe(true);

      // Emit again - nothing should receive
      emitter.dispatchEvent({ type: 'foo', detail: 3 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1, 2]);
    });

    it('cleans up subscription tracking when unsubscribing (typed)', () => {
      const emitter = new TestEmitter();
      const received1: number[] = [];
      const received2: number[] = [];

      // Create two separate subscriptions using typed subscribe
      const sub1 = emitter.subscribe('foo', {
        next: (event) => received1.push(event.detail),
      });
      const sub2 = emitter.subscribe('foo', {
        next: (event) => received2.push(event.detail),
      });

      emitter.dispatchEvent({ type: 'foo', detail: 1 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1]);

      // Unsubscribe one
      sub1.unsubscribe();
      expect(sub1.closed).toBe(true);
      expect(sub2.closed).toBe(false);

      // Emit again - only sub2 should receive
      emitter.dispatchEvent({ type: 'foo', detail: 2 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1, 2]);

      // Unsubscribe the other
      sub2.unsubscribe();
      expect(sub2.closed).toBe(true);

      // Emit again - nothing should receive
      emitter.dispatchEvent({ type: 'foo', detail: 3 });
      expect(received1).toEqual([1]);
      expect(received2).toEqual([1, 2]);
    });

    it('double unsubscribe is a no-op', () => {
      const emitter = new TestEmitter();
      const sub = emitter.subscribe(() => {});

      sub.unsubscribe();
      expect(sub.closed).toBe(true);

      // Should not throw
      sub.unsubscribe();
      expect(sub.closed).toBe(true);
    });

    it('double unsubscribe is a no-op (typed)', () => {
      const emitter = new TestEmitter();
      const sub = emitter.subscribe('foo', { next: () => {} });

      sub.unsubscribe();
      expect(sub.closed).toBe(true);

      // Should not throw
      sub.unsubscribe();
      expect(sub.closed).toBe(true);
    });
  });

  describe('pipe method', () => {
    it('pipes events from one emitter to another', () => {
      const source = new TestEmitter();
      const target = new TestEmitter();
      const received: number[] = [];

      // Add listener to source first - pipe forwards from source to target
      source.addEventListener('foo', () => {});

      source.pipe(target);

      target.addEventListener('foo', (event) => {
        received.push(event.detail);
      });

      source.dispatchEvent({ type: 'foo', detail: 42 });

      expect(received).toEqual([42]);
    });

    it('returns unsubscribe function', () => {
      const source = new TestEmitter();
      const target = new TestEmitter();
      const received: number[] = [];

      // Add listener to source first
      source.addEventListener('foo', () => {});

      const unsub = source.pipe(target);

      target.addEventListener('foo', (event) => {
        received.push(event.detail);
      });

      source.dispatchEvent({ type: 'foo', detail: 1 });

      unsub();
      source.dispatchEvent({ type: 'foo', detail: 2 });

      expect(received).toEqual([1]);
    });

    it('supports mapFn to transform events', () => {
      class SourceEmitter extends Eventful<{ input: number }> {}
      class TargetEmitter extends Eventful<{ output: string }> {}

      const source = new SourceEmitter();
      const target = new TargetEmitter();
      const received: string[] = [];

      // Add listener to source first
      source.addEventListener('input', () => {});

      source.pipe(target, (event) => ({
        type: 'output',
        detail: `Value: ${event.detail}`,
      }));

      target.addEventListener('output', (event) => {
        received.push(event.detail);
      });

      source.dispatchEvent({ type: 'input', detail: 42 });

      expect(received).toEqual(['Value: 42']);
    });
  });

  describe('wildcard listener methods', () => {
    class NamespacedEmitter extends Eventful<{
      'user:login': { id: string };
      'user:logout': { id: string };
      'system:start': { time: number };
    }> {}

    it('addWildcardListener receives all events with * pattern', () => {
      const emitter = new NamespacedEmitter();
      const received: string[] = [];

      emitter.addWildcardListener('*', (event) => {
        received.push(event.originalType);
      });

      emitter.dispatchEvent({ type: 'user:login', detail: { id: '1' } });
      emitter.dispatchEvent({ type: 'system:start', detail: { time: 123 } });

      expect(received).toEqual(['user:login', 'system:start']);
    });

    it('addWildcardListener receives namespaced events with namespace:* pattern', () => {
      const emitter = new NamespacedEmitter();
      const received: string[] = [];

      emitter.addWildcardListener('user:*', (event) => {
        received.push(event.originalType);
      });

      emitter.dispatchEvent({ type: 'user:login', detail: { id: '1' } });
      emitter.dispatchEvent({ type: 'user:logout', detail: { id: '1' } });
      emitter.dispatchEvent({ type: 'system:start', detail: { time: 123 } });

      expect(received).toEqual(['user:login', 'user:logout']);
    });

    it('removeWildcardListener removes the listener', () => {
      const emitter = new NamespacedEmitter();
      const received: string[] = [];

      const listener = (event: { originalType: string }) => {
        received.push(event.originalType);
      };

      emitter.addWildcardListener('*', listener);
      emitter.dispatchEvent({ type: 'user:login', detail: { id: '1' } });

      emitter.removeWildcardListener('*', listener);
      emitter.dispatchEvent({ type: 'user:logout', detail: { id: '1' } });

      expect(received).toEqual(['user:login']);
    });

    it('addWildcardListener returns unsubscribe function', () => {
      const emitter = new NamespacedEmitter();
      const received: string[] = [];

      const unsub = emitter.addWildcardListener('*', (event) => {
        received.push(event.originalType);
      });

      emitter.dispatchEvent({ type: 'user:login', detail: { id: '1' } });
      unsub();
      emitter.dispatchEvent({ type: 'user:logout', detail: { id: '1' } });

      expect(received).toEqual(['user:login']);
    });
  });
});
