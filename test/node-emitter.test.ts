import { describe, expect,it } from 'bun:test';

import { EventEmission } from '../src/event-emission';
import { createEventTarget } from '../src/factory';
import type { EmissionEvent } from '../src/types';

type TestEvents = {
  foo: string;
  bar: number;
  baz: boolean;
};

describe('Node.js EventEmitter compatibility', () => {
  describe('emit(type, detail)', () => {
    it('returns true when listeners are registered', () => {
      const emitter = createEventTarget<TestEvents>();
      emitter.addEventListener('foo', () => {});
      expect(emitter.emit('foo', 'hello')).toBe(true);
    });

    it('returns false when no listeners are registered', () => {
      const emitter = createEventTarget<TestEvents>();
      expect(emitter.emit('foo', 'hello')).toBe(false);
    });

    it('dispatches the event to registered listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      emitter.addEventListener('foo', (event) => {
        received.push(event.detail);
      });
      emitter.emit('foo', 'hello');
      expect(received).toEqual(['hello']);
    });

    it('returns true when wildcard listeners match', () => {
      const emitter = createEventTarget<TestEvents>();
      emitter.addWildcardListener('*', () => {});
      expect(emitter.emit('foo', 'hello')).toBe(true);
    });

    it('returns false after completion', () => {
      const emitter = createEventTarget<TestEvents>();
      emitter.addEventListener('foo', () => {});
      emitter.complete();
      expect(emitter.emit('foo', 'hello')).toBe(false);
    });
  });

  describe('on(type, listener) — Node-style overload', () => {
    it('adds a listener and returns an unsubscribe function', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const unsub = emitter.on('foo', (event) => {
        received.push(event.detail);
      });
      emitter.emit('foo', 'hello');
      expect(received).toEqual(['hello']);
      expect(typeof unsub).toBe('function');
    });

    it('unsubscribe function removes the listener', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const unsub = emitter.on('foo', (event) => {
        received.push(event.detail);
      });
      unsub();
      emitter.emit('foo', 'hello');
      expect(received).toEqual([]);
    });

    it('works with EventListenerObject (handleEvent)', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const listener = {
        handleEvent(event: EmissionEvent<string>) {
          received.push(event.detail);
        },
      };
      const unsub = emitter.on('foo', listener);
      emitter.emit('foo', 'hello');
      expect(received).toEqual(['hello']);
      unsub();
    });

    it('still returns an Observable when called with no second arg', () => {
      const emitter = createEventTarget<TestEvents>();
      const result = emitter.on('foo');
      expect(result).toHaveProperty('subscribe');
    });

    it('still returns an Observable when called with options object', () => {
      const emitter = createEventTarget<TestEvents>();
      const result = emitter.on('foo', { once: true });
      expect(result).toHaveProperty('subscribe');
    });

    it('still returns an Observable when called with boolean', () => {
      const emitter = createEventTarget<TestEvents>();
      const result = emitter.on('foo', true);
      expect(result).toHaveProperty('subscribe');
    });
  });

  describe('off(type, listener)', () => {
    it('removes a previously added listener', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const listener = (event: EmissionEvent<string>) => {
        received.push(event.detail);
      };
      emitter.addEventListener('foo', listener);
      emitter.off('foo', listener);
      emitter.emit('foo', 'hello');
      expect(received).toEqual([]);
    });
  });

  describe('addListener(type, listener)', () => {
    it('adds a listener (alias for addEventListener)', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: number[] = [];
      const unsub = emitter.addListener('bar', (event) => {
        received.push(event.detail);
      });
      emitter.emit('bar', 42);
      expect(received).toEqual([42]);
      unsub();
    });
  });

  describe('removeListener(type, listener)', () => {
    it('removes a listener (alias for removeEventListener)', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: number[] = [];
      const listener = (event: EmissionEvent<number>) => {
        received.push(event.detail);
      };
      emitter.addListener('bar', listener);
      emitter.removeListener('bar', listener);
      emitter.emit('bar', 42);
      expect(received).toEqual([]);
    });
  });

  describe('prependListener(type, listener)', () => {
    it('adds a listener at the beginning of the list', () => {
      const emitter = createEventTarget<TestEvents>();
      const order: string[] = [];
      emitter.addEventListener('foo', () => { order.push('first'); });
      emitter.prependListener('foo', () => { order.push('prepended'); });
      emitter.emit('foo', 'hello');
      expect(order).toEqual(['prepended', 'first']);
    });

    it('returns an unsubscribe function', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const unsub = emitter.prependListener('foo', (event) => {
        received.push(event.detail);
      });
      unsub();
      emitter.emit('foo', 'hello');
      expect(received).toEqual([]);
    });
  });

  describe('prependOnceListener(type, listener)', () => {
    it('adds a one-time listener at the beginning of the list', () => {
      const emitter = createEventTarget<TestEvents>();
      const order: string[] = [];
      emitter.addEventListener('foo', () => { order.push('always'); });
      emitter.prependOnceListener('foo', () => { order.push('once-prepended'); });
      emitter.emit('foo', 'first');
      emitter.emit('foo', 'second');
      expect(order).toEqual(['once-prepended', 'always', 'always']);
    });

    it('returns an unsubscribe function', () => {
      const emitter = createEventTarget<TestEvents>();
      const received: string[] = [];
      const unsub = emitter.prependOnceListener('foo', (event) => {
        received.push(event.detail);
      });
      unsub();
      emitter.emit('foo', 'hello');
      expect(received).toEqual([]);
    });
  });

  describe('listeners(type)', () => {
    it('returns an array of registered listener functions', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener1 = () => {};
      const listener2 = () => {};
      emitter.addEventListener('foo', listener1);
      emitter.addEventListener('foo', listener2);
      expect(emitter.listeners('foo')).toEqual([listener1, listener2]);
    });

    it('returns an empty array for unregistered types', () => {
      const emitter = createEventTarget<TestEvents>();
      expect(emitter.listeners('foo')).toEqual([]);
    });

    it('excludes removed listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener = () => {};
      emitter.addEventListener('foo', listener);
      emitter.removeEventListener('foo', listener);
      expect(emitter.listeners('foo')).toEqual([]);
    });
  });

  describe('rawListeners(type)', () => {
    it('returns original listeners for non-once listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener = () => {};
      emitter.addEventListener('foo', listener);
      const raw = emitter.rawListeners('foo');
      expect(raw).toHaveLength(1);
      expect(raw[0]).toBe(listener);
    });

    it('returns wrapper with .listener property for once listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener = () => {};
      emitter.once('foo', listener);
      const raw = emitter.rawListeners('foo');
      expect(raw).toHaveLength(1);
      expect(raw[0]).not.toBe(listener);
      expect((raw[0] as unknown as { listener: unknown }).listener).toBe(listener);
    });

    it('returns an empty array for unregistered types', () => {
      const emitter = createEventTarget<TestEvents>();
      expect(emitter.rawListeners('foo')).toEqual([]);
    });
  });

  describe('listenerCount(type)', () => {
    it('returns the number of registered listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      emitter.addEventListener('foo', () => {});
      emitter.addEventListener('foo', () => {});
      expect(emitter.listenerCount('foo')).toBe(2);
    });

    it('returns 0 for unregistered types', () => {
      const emitter = createEventTarget<TestEvents>();
      expect(emitter.listenerCount('foo')).toBe(0);
    });

    it('decrements after removing a listener', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener = () => {};
      emitter.addEventListener('foo', listener);
      expect(emitter.listenerCount('foo')).toBe(1);
      emitter.removeEventListener('foo', listener);
      expect(emitter.listenerCount('foo')).toBe(0);
    });
  });

  describe('eventNames()', () => {
    it('returns an array of event types with registered listeners', () => {
      const emitter = createEventTarget<TestEvents>();
      emitter.addEventListener('foo', () => {});
      emitter.addEventListener('bar', () => {});
      const names = emitter.eventNames();
      expect(names).toContain('foo');
      expect(names).toContain('bar');
      expect(names).toHaveLength(2);
    });

    it('returns an empty array when no listeners are registered', () => {
      const emitter = createEventTarget<TestEvents>();
      expect(emitter.eventNames()).toEqual([]);
    });

    it('excludes types whose listeners have all been removed', () => {
      const emitter = createEventTarget<TestEvents>();
      const listener = () => {};
      emitter.addEventListener('foo', listener);
      emitter.removeEventListener('foo', listener);
      expect(emitter.eventNames()).toEqual([]);
    });
  });

  describe('EventEmission class integration', () => {
    class TestEmitter extends EventEmission<TestEvents> {}

    it('emit() works on class instances', () => {
      const emitter = new TestEmitter();
      const received: string[] = [];
      emitter.addEventListener('foo', (event) => { received.push(event.detail); });
      expect(emitter.emit('foo', 'hello')).toBe(true);
      expect(received).toEqual(['hello']);
    });

    it('on(type, listener) works on class instances', () => {
      const emitter = new TestEmitter();
      const received: string[] = [];
      const unsub = emitter.on('foo', (event) => {
        received.push(event.detail);
      });
      emitter.emit('foo', 'hello');
      expect(received).toEqual(['hello']);
      (unsub as () => void)();
    });

    it('on(type) still returns Observable on class instances', () => {
      const emitter = new TestEmitter();
      const result = emitter.on('foo');
      expect(result).toHaveProperty('subscribe');
    });

    it('off() works on class instances', () => {
      const emitter = new TestEmitter();
      const received: string[] = [];
      const listener = (event: EmissionEvent<string>) => { received.push(event.detail); };
      emitter.on('foo', listener);
      emitter.off('foo', listener);
      emitter.emit('foo', 'hello');
      expect(received).toEqual([]);
    });

    it('addListener/removeListener work on class instances', () => {
      const emitter = new TestEmitter();
      const received: number[] = [];
      const listener = (event: EmissionEvent<number>) => { received.push(event.detail); };
      emitter.addListener('bar', listener);
      emitter.emit('bar', 42);
      expect(received).toEqual([42]);
      emitter.removeListener('bar', listener);
      emitter.emit('bar', 99);
      expect(received).toEqual([42]);
    });

    it('prependListener works on class instances', () => {
      const emitter = new TestEmitter();
      const order: string[] = [];
      emitter.addEventListener('foo', () => { order.push('first'); });
      emitter.prependListener('foo', () => { order.push('prepended'); });
      emitter.emit('foo', 'hello');
      expect(order).toEqual(['prepended', 'first']);
    });

    it('prependOnceListener works on class instances', () => {
      const emitter = new TestEmitter();
      const order: string[] = [];
      emitter.addEventListener('foo', () => { order.push('always'); });
      emitter.prependOnceListener('foo', () => { order.push('once-prepended'); });
      emitter.emit('foo', 'first');
      emitter.emit('foo', 'second');
      expect(order).toEqual(['once-prepended', 'always', 'always']);
    });

    it('listeners/rawListeners/listenerCount/eventNames work on class instances', () => {
      const emitter = new TestEmitter();
      const listener = () => {};
      emitter.addEventListener('foo', listener);
      expect(emitter.listeners('foo')).toEqual([listener]);
      expect(emitter.listenerCount('foo')).toBe(1);
      expect(emitter.eventNames()).toEqual(['foo']);
      expect(emitter.rawListeners('foo')).toHaveLength(1);
    });
  });
});
