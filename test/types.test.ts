/// <reference lib="dom" />
import { describe, expectTypeOf,test } from 'bun:test';

import {
  type AsyncIteratorOptions,
  createEventTarget,
  Eventful,
  type EventfulEvent,
  type EventTargetLike,
  forwardToEventTarget,
  fromEventTarget,
  type ObservableLike,
  type Observer,
  pipe,
  type Subscription,
  type WildcardEvent,
} from '../src/index';

/**
 * DOM EventTarget interface for reference:
 *
 * interface EventTarget {
 *   addEventListener(
 *     type: string,
 *     callback: EventListenerOrEventListenerObject | null,
 *     options?: AddEventListenerOptions | boolean
 *   ): void;
 *
 *   removeEventListener(
 *     type: string,
 *     callback: EventListenerOrEventListenerObject | null,
 *     options?: EventListenerOptions | boolean
 *   ): void;
 *
 *   dispatchEvent(event: Event): boolean;
 * }
 */

describe('EventTargetLike implements DOM EventTarget', () => {
  type TestEvents = { ready: { value: number }; error: { message: string } };

  test('sanity check - string is not assignable to number', () => {
    expectTypeOf<string>().not.toMatchTypeOf<number>();
  });

  test('EventTargetLike is assignable to EventTarget', () => {
    // This verifies that EventTargetLike<E> can be used where EventTarget is expected
    expectTypeOf<EventTargetLike<TestEvents>>().toMatchTypeOf<EventTarget>();
  });

  test('createEventTarget returns something assignable to EventTarget', () => {
    const target = createEventTarget<TestEvents>();
    expectTypeOf(target).toMatchTypeOf<EventTarget>();
  });

  test('has addEventListener method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('addEventListener');
  });

  test('has removeEventListener method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('removeEventListener');
  });

  test('has dispatchEvent method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('dispatchEvent');
  });

  test('addEventListener accepts DOM-compatible parameters', () => {
    const target = createEventTarget<TestEvents>();
    // DOM EventTarget.addEventListener accepts: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions)
    expectTypeOf(target.addEventListener).toBeFunction();
  });

  test('removeEventListener accepts DOM-compatible parameters', () => {
    const target = createEventTarget<TestEvents>();
    // DOM EventTarget.removeEventListener accepts: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions)
    expectTypeOf(target.removeEventListener).toBeFunction();
  });

  test('dispatchEvent accepts Event parameter', () => {
    const target = createEventTarget<TestEvents>();
    // DOM EventTarget.dispatchEvent accepts: (event: Event)
    expectTypeOf(target.dispatchEvent).toBeFunction();
  });

  test('can be used polymorphically as EventTarget', () => {
    // This function requires an EventTarget - our implementation should work here
    function useEventTarget(_target: EventTarget): void {
      // no-op
    }

    const target = createEventTarget<TestEvents>();
    // If this compiles, EventTargetLike implements EventTarget correctly
    expectTypeOf(target).toMatchTypeOf<Parameters<typeof useEventTarget>[0]>();
  });
});

describe('New ergonomics types', () => {
  type TestEvents = { ready: { value: number }; error: { message: string } };

  test('has once method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('once');
  });

  test('has removeAllListeners method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('removeAllListeners');
  });

  test('has pipe method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('pipe');
  });

  test('has complete method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('complete');
  });

  test('has completed property', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('completed');
  });

  test('has subscribe method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('subscribe');
  });

  test('has events method', () => {
    expectTypeOf<EventTargetLike<TestEvents>>().toHaveProperty('events');
  });

  test('once returns unsubscribe function', () => {
    const target = createEventTarget<TestEvents>();
    const unsub = target.once('ready', () => {});
    expectTypeOf(unsub).toBeFunction();
    expectTypeOf(unsub).returns.toBeVoid();
  });

  test('pipe returns unsubscribe function', () => {
    const target = createEventTarget<TestEvents>();
    const dest = createEventTarget<TestEvents>();
    const unsub = target.pipe(dest);
    expectTypeOf(unsub).toBeFunction();
    expectTypeOf(unsub).returns.toBeVoid();
  });

  test('subscribe returns Subscription', () => {
    const target = createEventTarget<TestEvents>();
    const sub = target.subscribe('ready', () => {});
    expectTypeOf(sub).toMatchTypeOf<Subscription>();
    expectTypeOf(sub.unsubscribe).toBeFunction();
    expectTypeOf(sub.closed).toBeBoolean();
  });

  test('events returns AsyncIterableIterator', () => {
    const target = createEventTarget<TestEvents>();
    const iter = target.events('ready');
    expectTypeOf(iter).toMatchTypeOf<AsyncIterableIterator<EventfulEvent<TestEvents['ready']>>>();
  });
});

describe('Observable-like types', () => {
  test('Observer type has correct shape', () => {
    expectTypeOf<Observer<number>>().toHaveProperty('next');
    expectTypeOf<Observer<number>>().toHaveProperty('error');
    expectTypeOf<Observer<number>>().toHaveProperty('complete');
  });

  test('Subscription type has correct shape', () => {
    expectTypeOf<Subscription>().toHaveProperty('unsubscribe');
    expectTypeOf<Subscription>().toHaveProperty('closed');
  });

  test('ObservableLike type has subscribe method', () => {
    expectTypeOf<ObservableLike<number>>().toHaveProperty('subscribe');
  });
});

describe('AsyncIteratorOptions type', () => {
  test('has signal property', () => {
    expectTypeOf<AsyncIteratorOptions>().toHaveProperty('signal');
  });

  test('has bufferSize property', () => {
    expectTypeOf<AsyncIteratorOptions>().toHaveProperty('bufferSize');
  });

  test('has overflowStrategy property', () => {
    expectTypeOf<AsyncIteratorOptions>().toHaveProperty('overflowStrategy');
  });
});

describe('Eventful abstract class types', () => {
  type TestEvents = { ready: { value: number } };

  class TestEmitter extends Eventful<TestEvents> {
    sendReady(value: number) {
      this.dispatchEvent({ type: 'ready', detail: { value } });
    }
  }

  test('Eventful subclass has all EventTarget methods', () => {
    expectTypeOf<TestEmitter>().toHaveProperty('addEventListener');
    expectTypeOf<TestEmitter>().toHaveProperty('removeEventListener');
    expectTypeOf<TestEmitter>().toHaveProperty('dispatchEvent');
    expectTypeOf<TestEmitter>().toHaveProperty('once');
    expectTypeOf<TestEmitter>().toHaveProperty('removeAllListeners');
    expectTypeOf<TestEmitter>().toHaveProperty('pipe');
    expectTypeOf<TestEmitter>().toHaveProperty('complete');
    expectTypeOf<TestEmitter>().toHaveProperty('completed');
    expectTypeOf<TestEmitter>().toHaveProperty('subscribe');
    expectTypeOf<TestEmitter>().toHaveProperty('events');
    expectTypeOf<TestEmitter>().toHaveProperty('toObservable');
    expectTypeOf<TestEmitter>().toHaveProperty('addWildcardListener');
    expectTypeOf<TestEmitter>().toHaveProperty('removeWildcardListener');
  });
});

describe('Wildcard listener types', () => {
  test('WildcardEvent type has correct shape', () => {
    type TestEvents = { 'user:login': { id: string }; 'user:logout': { id: string } };
    expectTypeOf<WildcardEvent<TestEvents>>().toHaveProperty('type');
    expectTypeOf<WildcardEvent<TestEvents>>().toHaveProperty('detail');
    expectTypeOf<WildcardEvent<TestEvents>>().toHaveProperty('originalType');
  });

  test('addWildcardListener accepts wildcard patterns', () => {
    type TestEvents = { 'user:login': { id: string }; 'user:logout': { id: string } };
    const target = createEventTarget<TestEvents>();

    // Verify addWildcardListener accepts wildcard patterns
    expectTypeOf(target.addWildcardListener).toBeFunction();

    // These should all be valid calls (compile-time check)
    target.addWildcardListener('*', () => {});
    target.addWildcardListener('user:*', () => {});
    target.addEventListener('user:login', () => {});
  });
});

describe('EventTarget interop types', () => {
  test('forwardToEventTarget is exported', () => {
    expectTypeOf(forwardToEventTarget).toBeFunction();
  });

  test('fromEventTarget is exported', () => {
    expectTypeOf(fromEventTarget).toBeFunction();
  });

  test('pipe standalone function is exported', () => {
    expectTypeOf(pipe).toBeFunction();
  });

  test('forwardToEventTarget returns unsubscribe function', () => {
    type TestEvents = { ready: { value: number } };
    const source = createEventTarget<TestEvents>();
    const target = new EventTarget();

    const unsub = forwardToEventTarget(source, target);
    expectTypeOf(unsub).toBeFunction();
    expectTypeOf(unsub).returns.toBeVoid();
  });

  test('fromEventTarget returns EventTargetLike with destroy', () => {
    type TestEvents = { ready: { value: number } };
    const domTarget = new EventTarget();

    const result = fromEventTarget<TestEvents>(domTarget, ['ready']);
    expectTypeOf(result).toHaveProperty('addEventListener');
    expectTypeOf(result).toHaveProperty('removeEventListener');
    expectTypeOf(result).toHaveProperty('dispatchEvent');
    expectTypeOf(result).toHaveProperty('destroy');
    expectTypeOf(result.destroy).toBeFunction();
  });
});
