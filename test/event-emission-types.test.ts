/// <reference lib="dom" />
import { describe, expectTypeOf,test } from 'bun:test';

import {
  type EmissionEvent,
  EventEmission,
  type ObservableLike,
  type Observer,
  type Subscription,
} from '../src/index';

// Concrete implementation for type testing
class TestEmitter extends EventEmission<{
  foo: number;
  bar: string;
}> {}

describe('EventEmission type compatibility', () => {
  describe('DOM EventTarget compatibility', () => {
    test('EventEmission instance is assignable to EventTarget', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter).toMatchTypeOf<EventTarget>();
    });

    test('can be used polymorphically as EventTarget', () => {
      function useEventTarget(_target: EventTarget): void {
        // no-op
      }

      const emitter = new TestEmitter();
      expectTypeOf(emitter).toMatchTypeOf<Parameters<typeof useEventTarget>[0]>();
    });

    test('has addEventListener method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('addEventListener');
    });

    test('has removeEventListener method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('removeEventListener');
    });

    test('has dispatchEvent method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('dispatchEvent');
    });
  });

  describe('Convenience methods', () => {
    test('has once method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('once');
    });

    test('has removeAllListeners method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('removeAllListeners');
    });

    test('once returns unsubscribe function', () => {
      const emitter = new TestEmitter();
      const unsub = emitter.once('foo', () => {});
      expectTypeOf(unsub).toBeFunction();
    });
  });

  describe('TC39 Observable compatibility', () => {
    test('has subscribe method', () => {
      expectTypeOf<TestEmitter>().toHaveProperty('subscribe');
    });

    test('has Symbol.observable method', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter[Symbol.observable]).toBeFunction();
    });

    test('subscribe returns Subscription', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter.subscribe(() => {})).toMatchTypeOf<Subscription>();
    });

    test('subscribe accepts Observer object', () => {
      const emitter = new TestEmitter();
      const observer: Observer<EmissionEvent<number | string>> = {
        next: () => {},
        complete: () => {},
      };
      expectTypeOf(emitter.subscribe(observer)).toMatchTypeOf<Subscription>();
    });

    test('Symbol.observable returns ObservableLike', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter[Symbol.observable]()).toMatchTypeOf<
        ObservableLike<EmissionEvent<number | string>>
      >();
    });
  });

  describe('Typed event handling', () => {
    test('addEventListener callback receives correct event type', () => {
      const emitter = new TestEmitter();
      emitter.addEventListener('foo', (event) => {
        expectTypeOf(event.detail).toEqualTypeOf<number>();
      });
      emitter.addEventListener('bar', (event) => {
        expectTypeOf(event.detail).toEqualTypeOf<string>();
      });
    });

    test('dispatchEvent accepts correct event structure', () => {
      const emitter = new TestEmitter();
      // Correct types
      emitter.dispatchEvent({ type: 'foo', detail: 42 });
      emitter.dispatchEvent({ type: 'bar', detail: 'hello' });
    });
  });

  describe('Async iterator types', () => {
    test('events returns AsyncIterableIterator', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter.events('foo')).toMatchTypeOf<
        AsyncIterableIterator<EmissionEvent<number>>
      >();
    });

    test('events iterator yields correctly typed events', async () => {
      const emitter = new TestEmitter();
      const iterator = emitter.events('foo');

      // Emit an event so the iterator has something to yield
      setTimeout(() => emitter.dispatchEvent({ type: 'foo', detail: 42 }), 0);

      const result = await iterator.next();
      if (!result.done) {
        expectTypeOf(result.value.detail).toEqualTypeOf<number>();
      }

      emitter.complete();
    });
  });

  describe('Lifecycle types', () => {
    test('completed is boolean', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter.completed).toEqualTypeOf<boolean>();
    });

    test('complete returns void', () => {
      const emitter = new TestEmitter();
      expectTypeOf(emitter.complete()).toEqualTypeOf<void>();
    });
  });
});
