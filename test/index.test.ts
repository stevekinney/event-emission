import { describe, expect, it } from 'bun:test';

import {
  createEventTarget,
  Eventful,
  type EventfulEvent,
  forwardToEventTarget,
  fromEventTarget,
  getOriginal,
  isObserved,
  type MinimalAbortSignal,
  ORIGINAL_TARGET,
  pipe,
  PROXY_MARKER,
  type WildcardEvent,
} from '../src/index';

describe('createEventTarget', () => {
  it('dispatches events to subscribed listeners', () => {
    type Events = { ready: { value: number } };
    const hub = createEventTarget<Events>();
    let payload: EventfulEvent<Events['ready']> | null = null;

    hub.addEventListener('ready', (event) => {
      payload = event;
    });

    hub.dispatchEvent({ type: 'ready', detail: { value: 42 } });

    expect(payload?.detail.value).toBe(42);
  });

  it('removes once listeners after the first invocation', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addEventListener(
      'ping',
      () => {
        calls += 1;
      },
      { once: true },
    );

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(calls).toBe(1);
  });

  it('unsubscribes listeners when the provided signal aborts', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;
    const { signal, abort } = createAbortSignal();

    hub.addEventListener(
      'ping',
      () => {
        calls += 1;
      },
      { signal },
    );

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    abort();
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(calls).toBe(1);
  });

  it('emits error event when listeners throw synchronously', () => {
    type Events = { boom: { msg: string }; error: Error };
    let captured: Error | null = null;
    const hub = createEventTarget<Events>();

    hub.addEventListener('error', (event) => {
      captured = event.detail;
    });

    hub.addEventListener('boom', () => {
      throw new Error('nope');
    });

    hub.dispatchEvent({ type: 'boom', detail: { msg: '!' } });

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe('nope');
  });

  it('re-throws when no error listener and listener throws synchronously', () => {
    type Events = { boom: { msg: string } };
    const hub = createEventTarget<Events>();

    hub.addEventListener('boom', () => {
      throw new Error('nope');
    });

    expect(() => hub.dispatchEvent({ type: 'boom', detail: { msg: '!' } })).toThrow('nope');
  });

  it('emits error event when listeners reject asynchronously', async () => {
    type Events = { async: { step: number }; error: Error };
    const errors: Error[] = [];
    const hub = createEventTarget<Events>();

    hub.addEventListener('error', (event) => {
      errors.push(event.detail);
    });

    hub.addEventListener('async', async () => {
      throw new Error('later');
    });

    hub.dispatchEvent({ type: 'async', detail: { step: 1 } });

    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it('clears all listeners when clear is called', () => {
    type Events = { done: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addEventListener('done', () => {
      calls += 1;
    });

    hub.clear();
    hub.dispatchEvent({ type: 'done', detail: { count: 1 } });

    expect(calls).toBe(0);
  });

  it('removes listeners via removeEventListener', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const listener = () => {
      calls += 1;
    };

    hub.addEventListener('ping', listener);
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    expect(calls).toBe(1);

    hub.removeEventListener('ping', listener);
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    expect(calls).toBe(1); // Still 1, listener was removed
  });

  it('removeEventListener cleans up abort handlers', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const { signal } = createAbortSignal();
    let calls = 0;

    const listener = () => {
      calls += 1;
    };

    hub.addEventListener('ping', listener, { signal });
    hub.removeEventListener('ping', listener);
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(calls).toBe(0);
  });

  it('removeEventListener does nothing for non-existent listener', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    // Should not throw
    hub.removeEventListener('ping', () => {});
  });
});

// New ergonomics tests
describe('once() helper', () => {
  it('registers a listener that fires only once', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.once('ping', () => {
      calls += 1;
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(calls).toBe(1);
  });

  it('returns an unsubscribe function', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const unsub = hub.once('ping', () => {
      calls += 1;
    });

    unsub();
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(calls).toBe(0);
  });

  it('works with AbortSignal', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const { signal, abort } = createAbortSignal();
    let calls = 0;

    hub.once(
      'ping',
      () => {
        calls += 1;
      },
      { signal },
    );

    abort();
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(calls).toBe(0);
  });
});

describe('removeAllListeners()', () => {
  it('removes all listeners for a specific type', () => {
    type Events = { ping: { count: number }; pong: { text: string } };
    const hub = createEventTarget<Events>();
    let pingCalls = 0;
    let pongCalls = 0;

    hub.addEventListener('ping', () => {
      pingCalls += 1;
    });
    hub.addEventListener('ping', () => {
      pingCalls += 1;
    });
    hub.addEventListener('pong', () => {
      pongCalls += 1;
    });

    hub.removeAllListeners('ping');

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'pong', detail: { text: 'hello' } });

    expect(pingCalls).toBe(0);
    expect(pongCalls).toBe(1);
  });

  it('removes all listeners when no type specified', () => {
    type Events = { ping: { count: number }; pong: { text: string } };
    const hub = createEventTarget<Events>();
    let pingCalls = 0;
    let pongCalls = 0;

    hub.addEventListener('ping', () => {
      pingCalls += 1;
    });
    hub.addEventListener('pong', () => {
      pongCalls += 1;
    });

    hub.removeAllListeners();

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'pong', detail: { text: 'hello' } });

    expect(pingCalls).toBe(0);
    expect(pongCalls).toBe(0);
  });

  it('cleans up abort handlers', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const { signal, abort } = createAbortSignal();
    let calls = 0;

    hub.addEventListener(
      'ping',
      () => {
        calls += 1;
      },
      { signal },
    );

    hub.removeAllListeners('ping');

    // Aborting after removal should not cause issues
    abort();

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    expect(calls).toBe(0);
  });
});

describe('pipe()', () => {
  it('forwards events to another target', () => {
    type Events = { ping: { count: number } };
    const source = createEventTarget<Events>();
    const dest = createEventTarget<Events>();
    const received: number[] = [];

    dest.addEventListener('ping', (e) => {
      received.push(e.detail.count);
    });

    // Must add a listener first to register the event type
    source.addEventListener('ping', () => {});
    source.pipe(dest);

    source.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    source.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(received).toEqual([1, 2]);
  });

  it('supports a map function to transform events', () => {
    type SourceEvents = { ping: { count: number } };
    type DestEvents = { pong: { text: string } };
    const source = createEventTarget<SourceEvents>();
    const dest = createEventTarget<DestEvents>();
    const received: string[] = [];

    dest.addEventListener('pong', (e) => {
      received.push(e.detail.text);
    });

    source.addEventListener('ping', () => {});
    source.pipe(dest, (event) => ({
      type: 'pong',
      detail: { text: `count: ${event.detail.count}` },
    }));

    source.dispatchEvent({ type: 'ping', detail: { count: 42 } });

    expect(received).toEqual(['count: 42']);
  });

  it('returns unsubscribe function to stop piping', () => {
    type Events = { ping: { count: number } };
    const source = createEventTarget<Events>();
    const dest = createEventTarget<Events>();
    const received: number[] = [];

    dest.addEventListener('ping', (e) => {
      received.push(e.detail.count);
    });

    source.addEventListener('ping', () => {});
    const unsub = source.pipe(dest);

    source.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    unsub();
    source.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(received).toEqual([1]);
  });

  it('supports null return from mapFn to filter events', () => {
    type Events = { ping: { count: number } };
    const source = createEventTarget<Events>();
    const dest = createEventTarget<Events>();
    const received: number[] = [];

    dest.addEventListener('ping', (e) => {
      received.push(e.detail.count);
    });

    source.addEventListener('ping', () => {});
    source.pipe(dest, (event) => (event.detail.count > 5 ? event : null));

    source.dispatchEvent({ type: 'ping', detail: { count: 3 } });
    source.dispatchEvent({ type: 'ping', detail: { count: 7 } });

    expect(received).toEqual([7]);
  });

  it('stops forwarding when source completes', () => {
    type Events = { ping: { count: number } };
    const source = createEventTarget<Events>();
    const dest = createEventTarget<Events>();
    const received: number[] = [];

    dest.addEventListener('ping', (e) => {
      received.push(e.detail.count);
    });

    source.addEventListener('ping', () => {});
    source.pipe(dest);

    source.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    source.complete();
    // After completion, pipe should be cleaned up
    source.dispatchEvent({ type: 'ping', detail: { count: 2 } }); // Should not forward

    expect(received).toEqual([1]);
  });
});

describe('complete()', () => {
  it('marks target as completed', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    expect(hub.completed).toBe(false);
    hub.complete();
    expect(hub.completed).toBe(true);
  });

  it('is idempotent', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    hub.complete();
    hub.complete(); // Should not throw

    expect(hub.completed).toBe(true);
  });

  it('suppresses future dispatches', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addEventListener('ping', () => {
      calls += 1;
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    expect(calls).toBe(1);

    hub.complete();

    const result = hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    expect(result).toBe(false);
    expect(calls).toBe(1);
  });

  it('prevents new listeners after completion', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.complete();

    hub.addEventListener('ping', () => {
      calls += 1;
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    expect(calls).toBe(0);
  });

  it('clears existing listeners on completion', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addEventListener('ping', () => {
      calls += 1;
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    expect(calls).toBe(1);

    hub.complete();

    // After completion, no more calls should happen
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    expect(calls).toBe(1);
  });
});

describe('subscribe() Observable interop', () => {
  it('subscribes with observer object', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    hub.subscribe('ping', {
      next: (event) => {
        received.push(event.detail.count);
      },
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(received).toEqual([1, 2]);
  });

  it('subscribes with callback function', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    hub.subscribe('ping', (event) => {
      received.push(event.detail.count);
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(received).toEqual([1]);
  });

  it('returns subscription with unsubscribe', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    const sub = hub.subscribe('ping', (event) => {
      received.push(event.detail.count);
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    sub.unsubscribe();
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(received).toEqual([1]);
    expect(sub.closed).toBe(true);
  });

  it('calls complete on target completion', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let completeCalled = false;

    hub.subscribe('ping', {
      complete: () => {
        completeCalled = true;
      },
    });

    expect(completeCalled).toBe(false);
    hub.complete();
    expect(completeCalled).toBe(true);
  });

  it('calls error when next throws', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let errorCaught: unknown = null;

    hub.subscribe('ping', {
      next: () => {
        throw new Error('oops');
      },
      error: (err) => {
        errorCaught = err;
      },
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(errorCaught).toBeInstanceOf(Error);
  });

  it('closed is true after unsubscribe', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const sub = hub.subscribe('ping', () => {});
    expect(sub.closed).toBe(false);
    sub.unsubscribe();
    expect(sub.closed).toBe(true);
  });

  it('closed is true after completion', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const sub = hub.subscribe('ping', () => {});
    expect(sub.closed).toBe(false);
    hub.complete();
    expect(sub.closed).toBe(true);
  });

  it('calls complete immediately if already completed', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let completeCalled = false;

    hub.complete();

    hub.subscribe('ping', {
      complete: () => {
        completeCalled = true;
      },
    });

    expect(completeCalled).toBe(true);
  });

  it('returns subscription with functional unsubscribe when already completed', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let completeCalled = false;

    hub.complete();

    const sub = hub.subscribe('ping', {
      complete: () => {
        completeCalled = true;
      },
    });

    expect(completeCalled).toBe(true);
    expect(sub.closed).toBe(true);

    // unsubscribe should work without error even when already completed
    sub.unsubscribe();
    expect(sub.closed).toBe(true);
  });
});

describe('toObservable()', () => {
  it('returns an observable that emits all events', () => {
    type Events = { ping: { count: number }; pong: { text: string } };
    const hub = createEventTarget<Events>();
    const received: Array<{ type: string; detail: unknown }> = [];

    const observable = hub.toObservable();
    observable.subscribe((event) => {
      received.push({ type: event.type, detail: event.detail });
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'pong', detail: { text: 'hello' } });

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'ping', detail: { count: 1 } });
    expect(received[1]).toEqual({ type: 'pong', detail: { text: 'hello' } });
  });

  it('supports observer object with next/error/complete', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];
    let completeCalled = false;

    hub.toObservable().subscribe({
      next: (event) => {
        received.push(event.detail.count);
      },
      complete: () => {
        completeCalled = true;
      },
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    expect(completeCalled).toBe(false);

    hub.complete();
    expect(completeCalled).toBe(true);
    expect(received).toEqual([1, 2]);
  });

  it('calls error callback when next throws', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let errorCaught: unknown = null;

    hub.toObservable().subscribe({
      next: () => {
        throw new Error('observer error');
      },
      error: (err) => {
        errorCaught = err;
      },
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(errorCaught).toBeInstanceOf(Error);
    expect((errorCaught as Error).message).toBe('observer error');
  });

  it('unsubscribe stops receiving events', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    const subscription = hub.toObservable().subscribe((event) => {
      received.push(event.detail.count);
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    subscription.unsubscribe();
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    expect(received).toEqual([1]);
    expect(subscription.closed).toBe(true);
  });

  it('closed is true after unsubscribe', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const subscription = hub.toObservable().subscribe(() => {});
    expect(subscription.closed).toBe(false);

    subscription.unsubscribe();
    expect(subscription.closed).toBe(true);
  });

  it('closed is true after completion', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const subscription = hub.toObservable().subscribe(() => {});
    expect(subscription.closed).toBe(false);

    hub.complete();
    expect(subscription.closed).toBe(true);
  });

  it('calls complete immediately if already completed', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    let completeCalled = false;

    hub.complete();

    hub.toObservable().subscribe({
      complete: () => {
        completeCalled = true;
      },
    });

    expect(completeCalled).toBe(true);
  });

  it('returns subscription with functional unsubscribe when already completed', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    hub.complete();

    const sub = hub.toObservable().subscribe(() => {});

    expect(sub.closed).toBe(true);

    // unsubscribe should work without error even when already completed
    sub.unsubscribe();
    expect(sub.closed).toBe(true);
  });

  it('Symbol.observable returns the observable itself', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const observable = hub.toObservable();
    const fromSymbol = observable[Symbol.for('@@observable') as typeof Symbol.observable]();

    expect(fromSymbol).toBe(observable);
  });

  it('multiple subscriptions receive the same events', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received1: number[] = [];
    const received2: number[] = [];

    const observable = hub.toObservable();
    observable.subscribe((event) => received1.push(event.detail.count));
    observable.subscribe((event) => received2.push(event.detail.count));

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(received1).toEqual([1]);
    expect(received2).toEqual([1]);
  });

  it('target[Symbol.observable]() returns toObservable()', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    // Access Symbol.observable directly on target
    const observable = (
      hub as unknown as {
        [Symbol.observable]: () => { subscribe: (fn: (e: EventfulEvent<unknown>) => void) => void };
      }
    )[Symbol.observable]();

    observable.subscribe((event) => {
      received.push((event.detail as { count: number }).count);
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(received).toEqual([1]);
  });
});

describe('events() async iterator', () => {
  it('iterates over events', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping');

    // Emit events before consuming
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    // Consume first two events
    const first = await iter.next();
    const second = await iter.next();

    expect(first.done).toBe(false);
    expect(first.value.detail.count).toBe(1);
    expect(second.done).toBe(false);
    expect(second.value.detail.count).toBe(2);

    // Clean up
    await iter.return?.();
  });

  it('ends iteration on complete()', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping');

    // Emit and complete
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.complete();

    const first = await iter.next();
    const second = await iter.next();

    expect(first.done).toBe(false);
    expect(first.value.detail.count).toBe(1);
    expect(second.done).toBe(true);
  });

  it('ends iteration on abort signal', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const { signal, abort } = createAbortSignal();

    const iter = hub.events('ping', { signal });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    abort();

    const first = await iter.next();
    const second = await iter.next();

    expect(first.value.detail.count).toBe(1);
    expect(second.done).toBe(true);
  });

  it('respects bufferSize and drop-oldest strategy', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping', { bufferSize: 2, overflowStrategy: 'drop-oldest' });

    // Emit 3 events with buffer of 2
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 3 } }); // Should drop 1

    const first = await iter.next();
    const second = await iter.next();

    expect(first.value.detail.count).toBe(2);
    expect(second.value.detail.count).toBe(3);

    await iter.return?.();
  });

  it('respects bufferSize and drop-latest strategy', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping', { bufferSize: 2, overflowStrategy: 'drop-latest' });

    // Emit 3 events with buffer of 2
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 3 } }); // Should be dropped

    const first = await iter.next();
    const second = await iter.next();

    expect(first.value.detail.count).toBe(1);
    expect(second.value.detail.count).toBe(2);

    await iter.return?.();
  });

  it('throws on overflow with throw strategy', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping', { bufferSize: 2, overflowStrategy: 'throw' });

    // Emit 3 events with buffer of 2
    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 3 } }); // Should trigger overflow

    // First two should succeed
    const first = await iter.next();
    const second = await iter.next();

    expect(first.value.detail.count).toBe(1);
    expect(second.value.detail.count).toBe(2);

    // Next call should throw the overflow error
    await expect(iter.next()).rejects.toThrow('Buffer overflow for event type "ping"');

    await iter.return?.();
  });

  it('cleans up via return()', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    const iter = hub.events('ping');

    const result = await iter.return?.();

    expect(result?.done).toBe(true);

    // Subsequent calls should also be done
    const next = await iter.next();
    expect(next.done).toBe(true);
  });

  it('works with for-await-of', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const received: number[] = [];

    // Set up async iteration
    const iterPromise = (async () => {
      for await (const event of hub.events('ping')) {
        received.push(event.detail.count);
        if (received.length >= 2) break;
      }
    })();

    // Give the loop time to start
    await Promise.resolve();

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });
    hub.dispatchEvent({ type: 'ping', detail: { count: 2 } });

    await iterPromise;

    expect(received).toEqual([1, 2]);
  });

  it('returns done immediately when already completed', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    hub.complete();

    const iter = hub.events('ping');

    const result = await iter.next();
    expect(result.done).toBe(true);

    // return() also works on completed iterator
    const returnResult = await iter.return?.();
    expect(returnResult?.done).toBe(true);
  });

  it('for-await-of exits immediately when already completed', async () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    hub.complete();

    const results: number[] = [];
    for await (const event of hub.events('ping')) {
      results.push(event.detail.count);
    }

    expect(results).toEqual([]);
  });
});

describe('Eventful abstract class', () => {
  class TestEmitter extends Eventful<{ message: { text: string } }> {
    sendMessage(text: string) {
      this.dispatchEvent({ type: 'message', detail: { text } });
    }
  }

  it('allows subclasses to dispatch events', () => {
    const emitter = new TestEmitter();
    let received: string | null = null;

    emitter.addEventListener('message', (event) => {
      received = event.detail.text;
    });

    emitter.sendMessage('hello');

    expect(received).toBe('hello');
  });

  it('supports once listeners', () => {
    const emitter = new TestEmitter();
    let calls = 0;

    emitter.once('message', () => {
      calls += 1;
    });

    emitter.sendMessage('first');
    emitter.sendMessage('second');

    expect(calls).toBe(1);
  });

  it('supports removeAllListeners', () => {
    const emitter = new TestEmitter();
    let calls = 0;

    emitter.addEventListener('message', () => {
      calls += 1;
    });

    emitter.removeAllListeners('message');
    emitter.sendMessage('ignored');

    expect(calls).toBe(0);
  });

  it('supports complete', () => {
    const emitter = new TestEmitter();

    expect(emitter.completed).toBe(false);
    emitter.complete();
    expect(emitter.completed).toBe(true);
  });

  it('supports subscribe', () => {
    const emitter = new TestEmitter();
    const received: string[] = [];

    emitter.subscribe('message', (event) => {
      received.push(event.detail.text);
    });

    emitter.sendMessage('hello');

    expect(received).toEqual(['hello']);
  });

  it('supports events async iterator', async () => {
    const emitter = new TestEmitter();

    const iter = emitter.events('message');

    emitter.sendMessage('hello');

    const first = await iter.next();
    expect(first.value.detail.text).toBe('hello');

    await iter.return?.();
  });
});

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

describe('wildcard listeners', () => {
  it('receives all events with * pattern', () => {
    type Events = { foo: { a: number }; bar: { b: string } };
    const hub = createEventTarget<Events>();
    const received: WildcardEvent<Events>[] = [];

    hub.addWildcardListener('*', (event) => {
      received.push(event);
    });

    hub.dispatchEvent({ type: 'foo', detail: { a: 1 } });
    hub.dispatchEvent({ type: 'bar', detail: { b: 'test' } });

    expect(received).toHaveLength(2);
    expect(received[0].originalType).toBe('foo');
    expect(received[0].type).toBe('*');
    expect(received[1].originalType).toBe('bar');
  });

  it('namespace pattern matches only events in namespace', () => {
    type Events = {
      'user:login': { id: string };
      'user:logout': { id: string };
      'system:error': { msg: string };
    };
    const hub = createEventTarget<Events>();
    const received: WildcardEvent<Events>[] = [];

    hub.addWildcardListener('user:*', (event) => {
      received.push(event);
    });

    hub.dispatchEvent({ type: 'user:login', detail: { id: '1' } });
    hub.dispatchEvent({ type: 'system:error', detail: { msg: 'oops' } });
    hub.dispatchEvent({ type: 'user:logout', detail: { id: '1' } });

    expect(received).toHaveLength(2);
    expect(received[0].originalType).toBe('user:login');
    expect(received[1].originalType).toBe('user:logout');
  });

  it('wildcard listener does not affect regular listeners', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();
    const wildcardReceived: unknown[] = [];
    const regularReceived: unknown[] = [];

    hub.addWildcardListener('*', (e) => wildcardReceived.push(e.detail));
    hub.addEventListener('ping', (e) => regularReceived.push(e.detail));

    hub.dispatchEvent({ type: 'ping', detail: { count: 42 } });

    expect(wildcardReceived).toHaveLength(1);
    expect(regularReceived).toHaveLength(1);
  });

  it('once wildcard listener is removed after first invocation', () => {
    type Events = { a: number; b: number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addWildcardListener(
      '*',
      () => {
        calls += 1;
      },
      { once: true },
    );

    hub.dispatchEvent({ type: 'a', detail: 1 });
    hub.dispatchEvent({ type: 'b', detail: 2 });

    expect(calls).toBe(1);
  });

  it('wildcard listener can be removed', () => {
    type Events = { ping: number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const listener = () => {
      calls += 1;
    };

    hub.addWildcardListener('*', listener);
    hub.dispatchEvent({ type: 'ping', detail: 1 });
    expect(calls).toBe(1);

    hub.removeWildcardListener('*', listener);
    hub.dispatchEvent({ type: 'ping', detail: 2 });
    expect(calls).toBe(1);
  });

  it('wildcard listener unsubscribe function works', () => {
    type Events = { ping: number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const unsubscribe = hub.addWildcardListener('*', () => {
      calls += 1;
    });

    hub.dispatchEvent({ type: 'ping', detail: 1 });
    unsubscribe();
    hub.dispatchEvent({ type: 'ping', detail: 2 });

    expect(calls).toBe(1);
  });

  it('emits error event for async wildcard listener errors', async () => {
    type Events = { ping: { count: number }; error: Error };
    const errors: Error[] = [];
    const hub = createEventTarget<Events>();

    hub.addEventListener('error', (event) => {
      errors.push(event.detail);
    });

    hub.addWildcardListener('*', async () => {
      throw new Error('async wildcard error');
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it('emits error event for sync wildcard listener errors', () => {
    type Events = { ping: { count: number }; error: Error };
    let errorCaught: Error | null = null;
    const hub = createEventTarget<Events>();

    hub.addEventListener('error', (event) => {
      errorCaught = event.detail;
    });

    hub.addWildcardListener('*', () => {
      throw new Error('sync wildcard error');
    });

    hub.dispatchEvent({ type: 'ping', detail: { count: 1 } });

    expect(errorCaught).toBeInstanceOf(Error);
  });

  it('re-throws sync wildcard listener errors when no error listener', () => {
    type Events = { ping: { count: number } };
    const hub = createEventTarget<Events>();

    hub.addWildcardListener('*', () => {
      throw new Error('sync wildcard error');
    });

    expect(() => hub.dispatchEvent({ type: 'ping', detail: { count: 1 } })).toThrow(
      'sync wildcard error',
    );
  });

  it('has zero overhead when no wildcard listeners are registered', () => {
    type Events = { ping: number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addEventListener('ping', () => {
      calls += 1;
    });

    // Dispatch many events - should be fast since no wildcard check needed
    for (let i = 0; i < 1000; i++) {
      hub.dispatchEvent({ type: 'ping', detail: i });
    }

    expect(calls).toBe(1000);
  });
});

describe('EventTarget interop', () => {
  it('forwardToEventTarget forwards events to DOM target', () => {
    type Events = { click: { x: number; y: number } };
    const hub = createEventTarget<Events>();
    const domTarget = createMockDOMEventTarget();

    const unsubscribe = forwardToEventTarget(hub, domTarget);

    hub.dispatchEvent({ type: 'click', detail: { x: 10, y: 20 } });

    expect(domTarget.dispatched).toHaveLength(1);
    expect(domTarget.dispatched[0].type).toBe('click');
    expect(domTarget.dispatched[0].detail).toEqual({ x: 10, y: 20 });

    unsubscribe();
    hub.dispatchEvent({ type: 'click', detail: { x: 30, y: 40 } });

    expect(domTarget.dispatched).toHaveLength(1);
  });

  it('fromEventTarget creates eventful from DOM target', () => {
    type Events = { input: string; change: string };
    const domTarget = createMockDOMEventTarget();
    const eventful = fromEventTarget<Events>(domTarget, ['input', 'change']);

    const received: string[] = [];
    eventful.addEventListener('input', (e) => received.push('input:' + e.detail));
    eventful.addEventListener('change', (e) => received.push('change:' + e.detail));

    // Simulate DOM events
    domTarget.simulateEvent({ type: 'input', detail: 'hello' });
    domTarget.simulateEvent({ type: 'change', detail: 'world' });

    expect(received).toEqual(['input:hello', 'change:world']);

    eventful.destroy();
  });

  it('fromEventTarget destroy cleans up', () => {
    type Events = { click: number };
    const domTarget = createMockDOMEventTarget();
    const eventful = fromEventTarget<Events>(domTarget, ['click']);

    expect(domTarget.listeners.size).toBe(1);
    eventful.destroy();
    expect(domTarget.listeners.size).toBe(0);
    expect(eventful.completed).toBe(true);
  });

  it('fromEventTarget respects abort signal', () => {
    type Events = { click: number };
    const domTarget = createMockDOMEventTarget();
    const { signal, abort } = createAbortSignal();
    const eventful = fromEventTarget<Events>(domTarget, ['click'], { signal });

    const received: number[] = [];
    eventful.addEventListener('click', (e) => received.push(e.detail));

    domTarget.simulateEvent({ type: 'click', detail: 1 });
    expect(received).toEqual([1]);

    abort();

    // After abort, DOM listeners should be removed and eventful completed
    expect(eventful.completed).toBe(true);
    expect(domTarget.listeners.size).toBe(0);

    // New events should not be received
    domTarget.simulateEvent({ type: 'click', detail: 2 });
    expect(received).toEqual([1]);
  });

  it('fromEventTarget handles already-aborted signal', () => {
    type Events = { click: number };
    const domTarget = createMockDOMEventTarget();
    const { signal, abort } = createAbortSignal();
    abort(); // Abort before creating

    const eventful = fromEventTarget<Events>(domTarget, ['click'], { signal });

    expect(eventful.completed).toBe(true);
    expect(domTarget.listeners.size).toBe(0);
  });

  it('pipe forwards events between eventful targets', () => {
    type Events = { msg: string };
    const source = createEventTarget<Events>();
    const target = createEventTarget<Events>();

    const received: string[] = [];
    target.addEventListener('msg', (e) => received.push(e.detail));

    const unsubscribe = pipe(source, target);

    source.dispatchEvent({ type: 'msg', detail: 'hello' });
    source.dispatchEvent({ type: 'msg', detail: 'world' });

    unsubscribe();
    source.dispatchEvent({ type: 'msg', detail: 'ignored' });

    expect(received).toEqual(['hello', 'world']);
  });
});

interface MockDOMEventTarget {
  addEventListener(
    type: string,
    handler: (event: { type: string; detail?: unknown }) => void,
  ): void;
  removeEventListener(
    type: string,
    handler: (event: { type: string; detail?: unknown }) => void,
  ): void;
  dispatchEvent(event: { type: string; detail?: unknown }): boolean;
  dispatched: Array<{ type: string; detail?: unknown }>;
  listeners: Map<string, Set<(event: { type: string; detail?: unknown }) => void>>;
  simulateEvent(event: { type: string; detail?: unknown }): void;
}

function createMockDOMEventTarget(): MockDOMEventTarget {
  const listeners = new Map<string, Set<(event: { type: string; detail?: unknown }) => void>>();
  const dispatched: Array<{ type: string; detail?: unknown }> = [];

  return {
    addEventListener(type, handler) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) {
        set.delete(handler);
        if (set.size === 0) listeners.delete(type);
      }
    },
    dispatchEvent(event) {
      dispatched.push(event);
      return true;
    },
    dispatched,
    listeners,
    simulateEvent(event) {
      const set = listeners.get(event.type);
      if (set) {
        for (const handler of set) {
          handler(event);
        }
      }
    },
  };
}

describe('createEventTarget with observe option', () => {
  it('creates an observable proxy from plain object', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    let updateCount = 0;

    state.addEventListener('update', () => {
      updateCount += 1;
    });

    state.count = 1;

    expect(state.count).toBe(1);
    expect(updateCount).toBe(1);
  });

  it('dispatches update:path event on property change', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    let eventDetail: { value: number; current: unknown; previous: unknown } | null = null;

    state.addEventListener('update:count', (e) => {
      eventDetail = e.detail as { value: number; current: unknown; previous: unknown };
    });

    state.count = 42;

    expect(eventDetail).not.toBeNull();
    expect(eventDetail!.value).toBe(42);
  });

  it('dispatches update event on any property change', () => {
    const state = createEventTarget({ a: 1, b: 2 }, { observe: true });
    const updates: unknown[] = [];

    state.addEventListener('update', (e) => {
      updates.push(e.detail);
    });

    state.a = 10;
    state.b = 20;

    expect(updates).toHaveLength(2);
  });

  it('deep observes nested objects by default', () => {
    const state = createEventTarget({ user: { name: 'Alice' } }, { observe: true });
    let received: string | null = null;

    state.addEventListener('update:user.name', (e) => {
      received = (e.detail as { value: string }).value;
    });

    state.user.name = 'Bob';

    expect(received).toBe('Bob');
  });

  it('tracks array mutations via push', () => {
    const state = createEventTarget({ items: [1, 2] }, { observe: true });
    const events: Array<{ method: string; added?: unknown[] }> = [];

    state.addEventListener('update:items.push', (e) => {
      const detail = e.detail as { method: string; added?: unknown[] };
      events.push({ method: detail.method, added: detail.added });
    });

    state.items.push(3);

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe('push');
    expect(events[0].added).toEqual([3]);
    expect(state.items).toEqual([1, 2, 3]);
  });

  it('tracks array mutations via pop', () => {
    const state = createEventTarget({ items: [1, 2, 3] }, { observe: true });
    let removed: unknown[] | undefined;

    state.addEventListener('update:items.pop', (e) => {
      removed = (e.detail as { removed?: unknown[] }).removed;
    });

    const result = state.items.pop();

    expect(result).toBe(3);
    expect(removed).toEqual([3]);
    expect(state.items).toEqual([1, 2]);
  });

  it('tracks array mutations via splice', () => {
    const state = createEventTarget({ items: [1, 2, 3, 4, 5] }, { observe: true });
    let eventDetail: { added?: unknown[]; removed?: unknown[] } | null = null;

    state.addEventListener('update:items.splice', (e) => {
      const detail = e.detail as { added?: unknown[]; removed?: unknown[] };
      eventDetail = { added: detail.added, removed: detail.removed };
    });

    state.items.splice(1, 2, 'a', 'b', 'c');

    expect(eventDetail!.removed).toEqual([2, 3]);
    expect(eventDetail!.added).toEqual(['a', 'b', 'c']);
    expect(state.items).toEqual([1, 'a', 'b', 'c', 4, 5]);
  });

  it('tracks array mutations via shift', () => {
    const state = createEventTarget({ items: [1, 2, 3] }, { observe: true });
    let removed: unknown[] | undefined;

    state.addEventListener('update:items.shift', (e) => {
      removed = (e.detail as { removed?: unknown[] }).removed;
    });

    const result = state.items.shift();

    expect(result).toBe(1);
    expect(removed).toEqual([1]);
    expect(state.items).toEqual([2, 3]);
  });

  it('tracks array mutations via unshift', () => {
    const state = createEventTarget({ items: [2, 3] }, { observe: true });
    let added: unknown[] | undefined;

    state.addEventListener('update:items.unshift', (e) => {
      added = (e.detail as { added?: unknown[] }).added;
    });

    state.items.unshift(0, 1);

    expect(added).toEqual([0, 1]);
    expect(state.items).toEqual([0, 1, 2, 3]);
  });

  it('does not dispatch event when value unchanged', () => {
    const state = createEventTarget({ count: 42 }, { observe: true });
    let calls = 0;

    state.addEventListener('update', () => {
      calls += 1;
    });

    state.count = 42; // Same value

    expect(calls).toBe(0);
  });

  it('dispatches event on property deletion', () => {
    const state = createEventTarget<{ foo?: string }>({ foo: 'bar' }, { observe: true });
    let deleted = false;

    state.addEventListener('update:foo', () => {
      deleted = true;
    });

    delete state.foo;

    expect(deleted).toBe(true);
    expect(state.foo).toBeUndefined();
  });

  it('supports shallow observation mode', () => {
    const state = createEventTarget({ nested: { value: 1 } }, { observe: true, deep: false });
    let deepUpdate = false;

    state.addEventListener('update:nested.value', () => {
      deepUpdate = true;
    });

    // In shallow mode, nested changes are not tracked
    state.nested.value = 2;

    expect(deepUpdate).toBe(false);
    expect(state.nested.value).toBe(2);
  });

  it('handles circular reference prevention', () => {
    const obj = { a: 1, self: null as unknown };
    const state = createEventTarget(obj, { observe: true });

    // Assigning a reference to self should not cause infinite recursion
    state.self = state;

    expect(state.self).toBe(state);
  });

  it('preserves original object access', () => {
    const original = { value: 42 };
    const state = createEventTarget(original, { observe: true });

    // The proxy wraps the original but should reflect changes
    state.value = 100;

    expect(state.value).toBe(100);
  });

  it('works with arrays as root object', () => {
    const state = createEventTarget([1, 2, 3], { observe: true });
    let updateCalled = false;

    state.addEventListener('update', () => {
      updateCalled = true;
    });

    state.push(4);

    expect(updateCalled).toBe(true);
    expect([...state]).toEqual([1, 2, 3, 4]);
  });

  it('includes previous state in event detail', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    let previousValue: unknown;

    state.addEventListener('update:count', (e) => {
      previousValue = (e.detail as { previous: unknown }).previous;
    });

    state.count = 1;

    // Previous should reflect the state before the change
    expect((previousValue as { count: number }).count).toBe(0);
  });

  it('includes current state in event detail', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    let currentValue: unknown;

    state.addEventListener('update:count', (e) => {
      currentValue = (e.detail as { current: unknown }).current;
    });

    state.count = 1;

    expect((currentValue as { count: number }).count).toBe(1);
  });

  it('maintains EventTarget interface', () => {
    const state = createEventTarget({ value: 0 }, { observe: true });

    // Should have all EventTarget methods
    expect(typeof state.addEventListener).toBe('function');
    expect(typeof state.removeEventListener).toBe('function');
    expect(typeof state.dispatchEvent).toBe('function');
    expect(typeof state.once).toBe('function');
    expect(typeof state.subscribe).toBe('function');
    expect(typeof state.toObservable).toBe('function');
    expect(typeof state.events).toBe('function');
    expect(typeof state.complete).toBe('function');
    expect(typeof state.completed).toBe('boolean');
  });
});

describe('isObserved()', () => {
  it('returns true for observed objects', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    expect(isObserved(state)).toBe(true);
  });

  it('returns false for plain objects', () => {
    const obj = { count: 0 };
    expect(isObserved(obj)).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isObserved(null)).toBe(false);
    expect(isObserved(undefined)).toBe(false);
    expect(isObserved(42)).toBe(false);
    expect(isObserved('string')).toBe(false);
  });

  it('returns false for regular event targets', () => {
    const hub = createEventTarget<{ ping: number }>();
    expect(isObserved(hub)).toBe(false);
  });
});

describe('getOriginal()', () => {
  it('returns the original unproxied object', () => {
    const original = { count: 0 };
    const state = createEventTarget(original, { observe: true });
    const retrieved = getOriginal(state);

    // Should be the same reference
    expect(retrieved).toBe(original);
  });

  it('returns the object unchanged if not proxied', () => {
    const obj = { count: 0 };
    expect(getOriginal(obj)).toBe(obj);
  });
});

describe('PROXY_MARKER and ORIGINAL_TARGET symbols', () => {
  it('PROXY_MARKER identifies proxied objects', () => {
    const state = createEventTarget({ count: 0 }, { observe: true });
    expect((state as Record<symbol, unknown>)[PROXY_MARKER]).toBe(true);
  });

  it('ORIGINAL_TARGET provides access to original', () => {
    const original = { count: 0 };
    const state = createEventTarget(original, { observe: true });
    expect((state as Record<symbol, unknown>)[ORIGINAL_TARGET]).toBe(original);
  });

  it('plain objects do not have PROXY_MARKER', () => {
    const obj = { count: 0 };
    expect((obj as Record<symbol, unknown>)[PROXY_MARKER]).toBeUndefined();
  });
});

describe('createEventTarget advanced coverage', () => {
  it('onListenerError option handles errors instead of re-throwing', () => {
    type Events = { foo: number; error: Error };
    const errors: Array<{ type: string; error: unknown }> = [];

    const hub = createEventTarget<Events>({
      onListenerError: (type, error) => {
        errors.push({ type, error });
      },
    });

    hub.addEventListener('foo', () => {
      throw new Error('test error');
    });

    // Should not throw because onListenerError handles it
    hub.dispatchEvent({ type: 'foo', detail: 42 });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.type).toBe('foo');
    expect(errors[0]?.error).toBeInstanceOf(Error);
  });

  it('wildcard pattern that does not match is ignored', () => {
    type Events = { 'user:login': string; 'other': number };
    const hub = createEventTarget<Events>();
    const received: string[] = [];

    hub.addWildcardListener('user:*', (event) => {
      received.push(event.originalType);
    });

    // This should not be received because 'other' doesn't match 'user:*'
    hub.dispatchEvent({ type: 'other', detail: 123 });
    hub.dispatchEvent({ type: 'user:login', detail: 'alice' });

    expect(received).toEqual(['user:login']);
  });

  it('async error in wildcard listener emits error event', async () => {
    type Events = { 'ns:event': number; error: Error };
    const hub = createEventTarget<Events>();
    const errors: Error[] = [];

    hub.addEventListener('error', (event) => {
      errors.push(event.detail);
    });

    hub.addWildcardListener('ns:*', async () => {
      throw new Error('async wildcard error');
    });

    hub.dispatchEvent({ type: 'ns:event', detail: 42 });

    // Wait for async error to be handled
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('async wildcard error');
  });

  it('once wildcard listener is removed after first invocation', () => {
    type Events = { 'ns:a': number; 'ns:b': number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    hub.addWildcardListener(
      'ns:*',
      () => {
        calls++;
      },
      { once: true },
    );

    hub.dispatchEvent({ type: 'ns:a', detail: 1 });
    hub.dispatchEvent({ type: 'ns:b', detail: 2 });

    expect(calls).toBe(1);
  });

  it('error thrown from error handler is swallowed', () => {
    type Events = { foo: number; error: Error };
    const hub = createEventTarget<Events>();

    // Error handler that throws
    hub.addEventListener('error', () => {
      throw new Error('error in error handler');
    });

    hub.addEventListener('foo', () => {
      throw new Error('original error');
    });

    // Should not throw - error from error handler is swallowed
    expect(() => {
      hub.dispatchEvent({ type: 'foo', detail: 42 });
    }).not.toThrow();
  });

  it('once error listener is removed after handling one error', () => {
    type Events = { foo: number; error: Error };
    const hub = createEventTarget<Events>();
    let errorCount = 0;

    hub.addEventListener(
      'error',
      () => {
        errorCount++;
      },
      { once: true },
    );

    hub.addEventListener('foo', () => {
      throw new Error('error 1');
    });

    hub.dispatchEvent({ type: 'foo', detail: 1 });

    // Remove the throwing listener and add another
    hub.removeAllListeners('foo');
    hub.addEventListener('foo', () => {
      throw new Error('error 2');
    });

    // This should throw because the once error listener was removed
    expect(() => {
      hub.dispatchEvent({ type: 'foo', detail: 2 });
    }).toThrow('error 2');

    expect(errorCount).toBe(1);
  });

  it('wildcard listener with signal is aborted on signal abort', () => {
    type Events = { 'ns:event': number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const controller = new AbortController();

    hub.addWildcardListener(
      'ns:*',
      () => {
        calls++;
      },
      { signal: controller.signal },
    );

    hub.dispatchEvent({ type: 'ns:event', detail: 1 });
    expect(calls).toBe(1);

    controller.abort();

    hub.dispatchEvent({ type: 'ns:event', detail: 2 });
    expect(calls).toBe(1);
  });

  it('wildcard listener with already aborted signal is never called', () => {
    type Events = { 'ns:event': number };
    const hub = createEventTarget<Events>();
    let calls = 0;

    const controller = new AbortController();
    controller.abort();

    hub.addWildcardListener(
      'ns:*',
      () => {
        calls++;
      },
      { signal: controller.signal },
    );

    hub.dispatchEvent({ type: 'ns:event', detail: 1 });
    expect(calls).toBe(0);
  });

  it('removeWildcardListener cleans up signal handler', () => {
    type Events = { 'ns:event': number };
    const hub = createEventTarget<Events>();

    const controller = new AbortController();
    const listener = () => {};

    hub.addWildcardListener('ns:*', listener, { signal: controller.signal });
    hub.removeWildcardListener('ns:*', listener);

    // After removal, aborting should have no effect (no errors)
    controller.abort();
  });
});
