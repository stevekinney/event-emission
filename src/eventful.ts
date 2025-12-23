import { createEventTarget } from './factory';
import { SymbolObservable } from './symbols';
import type {
  AddEventListenerOptionsLike,
  EventfulEvent,
  EventsIteratorOptions,
  EventTargetLike,
  ObservableLike,
  Observer,
  Subscription,
  WildcardEvent,
} from './types';

/**
 * Abstract base class for typed event emitters with DOM EventTarget
 * and TC39 Observable compatibility.
 *
 * Extend this class to create custom event emitters with typed events.
 * The class provides:
 * - DOM EventTarget compatible API (addEventListener, removeEventListener, dispatchEvent)
 * - TC39 Observable interop (subscribe, Symbol.observable)
 * - Async iteration support (events() method)
 * - Wildcard listeners for namespaced events
 * - Lifecycle management (complete(), completed)
 *
 * Listener errors are handled via 'error' event: if a listener throws,
 * an 'error' event is emitted. If no 'error' listener is registered,
 * the error is re-thrown (Node.js behavior).
 *
 * @template E - Event map type where keys are event names and values are event detail types.
 *
 * @example Basic usage
 * ```typescript
 * // Define your emitter with typed events
 * class UserService extends Eventful<{
 *   'user:created': { id: string; name: string };
 *   'user:deleted': { id: string };
 *   error: Error;
 * }> {
 *   createUser(name: string) {
 *     const id = crypto.randomUUID();
 *     // ... create user logic
 *     this.dispatchEvent({ type: 'user:created', detail: { id, name } });
 *   }
 * }
 *
 * const service = new UserService();
 * service.addEventListener('user:created', (event) => {
 *   console.log(`Created user: ${event.detail.name}`);
 * });
 * ```
 *
 * @example TC39 Observable interop
 * ```typescript
 * const service = new UserService();
 *
 * // Subscribe to all events
 * service.subscribe({
 *   next: (event) => console.log(event.type, event.detail),
 *   complete: () => console.log('Service completed'),
 * });
 *
 * // Use with RxJS or other Observable libraries
 * import { from } from 'rxjs';
 * const observable = from(service);
 * ```
 *
 * @example Async iteration
 * ```typescript
 * const service = new UserService();
 *
 * // Iterate over events as async iterator
 * for await (const event of service.events('user:created')) {
 *   console.log(`User created: ${event.detail.name}`);
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any for flexibility
export abstract class Eventful<E extends Record<string, any>> {
  readonly #target: EventTargetLike<E>;

  constructor() {
    this.#target = createEventTarget<E>();
  }

  // ==========================================================================
  // DOM EventTarget Methods
  // ==========================================================================

  /**
   * Adds an event listener for the specified event type.
   * Returns an unsubscribe function for convenience.
   */
  addEventListener<K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
    options?: AddEventListenerOptionsLike,
  ): () => void {
    return this.#target.addEventListener(type, listener, options);
  }

  /**
   * Removes an event listener for the specified event type.
   */
  removeEventListener<K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
  ): void {
    this.#target.removeEventListener(type, listener);
  }

  /**
   * Dispatches an event to all registered listeners.
   * Returns false if the emitter has been completed, true otherwise.
   */
  dispatchEvent<K extends keyof E & string>(event: EventfulEvent<E[K]>): boolean {
    return this.#target.dispatchEvent(event);
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Adds a one-time listener for the specified event type.
   * Returns an unsubscribe function.
   */
  once<K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
    options?: Omit<AddEventListenerOptionsLike, 'once'>,
  ): () => void {
    return this.#target.once(type, listener, options);
  }

  /**
   * Removes all listeners, or those of the specified event type.
   */
  removeAllListeners<K extends keyof E & string>(type?: K): void {
    this.#target.removeAllListeners(type);
  }

  /**
   * Removes all listeners. Does not trigger completion.
   */
  clear(): void {
    this.#target.clear();
  }

  /**
   * Pipe events from this emitter to another target.
   * Note: Only forwards events for types that have listeners when pipe() is called.
   * Events for types registered after piping won't be forwarded automatically.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
  pipe<T extends Record<string, any>>(
    target: EventTargetLike<T>,
    mapFn?: <K extends keyof E & string>(
      event: EventfulEvent<E[K]>,
    ) => EventfulEvent<T[keyof T & string]> | null,
  ): () => void {
    return this.#target.pipe(target, mapFn);
  }

  // ==========================================================================
  // Wildcard Support
  // ==========================================================================

  /**
   * Adds a wildcard listener that receives events matching the pattern.
   * Use '*' for all events, or 'namespace:*' for namespaced events.
   */
  addWildcardListener(
    pattern: '*' | `${string}:*`,
    listener: (event: WildcardEvent<E>) => void | Promise<void>,
    options?: AddEventListenerOptionsLike,
  ): () => void {
    return this.#target.addWildcardListener(pattern, listener, options);
  }

  /**
   * Removes a wildcard listener.
   */
  removeWildcardListener(
    pattern: '*' | `${string}:*`,
    listener: (event: WildcardEvent<E>) => void | Promise<void>,
  ): void {
    this.#target.removeWildcardListener(pattern, listener);
  }

  // ==========================================================================
  // TC39 Observable Methods
  // ==========================================================================

  /**
   * Subscribes an observer to all events (untyped).
   */
  subscribe(
    observerOrNext:
      | Observer<EventfulEvent<E[keyof E]>>
      | ((value: EventfulEvent<E[keyof E]>) => void),
  ): Subscription;

  /**
   * Subscribes an observer to events of a specific type (typed).
   */
  subscribe<K extends keyof E & string>(
    type: K,
    observerOrNext?:
      | Observer<EventfulEvent<E[K]>>
      | ((value: EventfulEvent<E[K]>) => void),
    error?: (err: unknown) => void,
    completeHandler?: () => void,
  ): Subscription;

  /**
   * Implementation that handles both typed and untyped subscriptions.
   */
  subscribe<K extends keyof E & string>(
    typeOrObserver:
      | K
      | Observer<EventfulEvent<E[keyof E]>>
      | ((value: EventfulEvent<E[keyof E]>) => void),
    observerOrNext?:
      | Observer<EventfulEvent<E[K]>>
      | ((value: EventfulEvent<E[K]>) => void),
    error?: (err: unknown) => void,
    completeHandler?: () => void,
  ): Subscription {
    // Typed subscribe: first argument is a string event type
    if (typeof typeOrObserver === 'string') {
      return this.#target.subscribe(
        typeOrObserver,
        observerOrNext,
        error,
        completeHandler,
      );
    }

    // Untyped subscribe: first argument is a callback function
    if (typeof typeOrObserver === 'function') {
      return this.#target.toObservable().subscribe(typeOrObserver);
    }

    // Untyped subscribe: first argument is an observer object
    if (typeof typeOrObserver === 'object' && typeOrObserver !== null) {
      // Check if it looks like an Observer (has next/error/complete methods)
      const maybeObserver = typeOrObserver as Record<string, unknown>;
      if (
        typeof maybeObserver.next === 'function' ||
        typeof maybeObserver.error === 'function' ||
        typeof maybeObserver.complete === 'function'
      ) {
        return this.#target.toObservable().subscribe(typeOrObserver);
      }
      // Object without observer methods - treat as empty observer (no callbacks)
      return this.#target.toObservable().subscribe({});
    }

    // Fallback: should not reach here with proper TypeScript usage
    throw new Error(
      'subscribe() requires a string event type, callback function, or observer object',
    );
  }

  /**
   * Returns an observable that emits all events.
   */
  toObservable(): ObservableLike<EventfulEvent<E[keyof E]>> {
    return this.#target.toObservable();
  }

  /**
   * Returns this observable for Symbol.observable interop.
   */
  [SymbolObservable](): ObservableLike<EventfulEvent<E[keyof E]>> {
    return this.toObservable();
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Marks the emitter as complete. Invokes complete() on all observable subscribers,
   * ends all async iterators, and suppresses further emits/dispatches.
   * Idempotent.
   */
  complete(): void {
    this.#target.complete();
  }

  /**
   * Returns true if the emitter has been completed.
   */
  get completed(): boolean {
    return this.#target.completed;
  }

  // ==========================================================================
  // Async Iterator Method
  // ==========================================================================

  /**
   * Returns an async iterator over events of the specified type.
   *
   * @param type - The event type to iterate over
   * @param options - Iterator options (signal, bufferSize, overflowStrategy)
   *
   * @example
   * ```typescript
   * for await (const event of emitter.events('foo')) {
   *   console.log(event.detail);
   * }
   * ```
   */
  events<K extends keyof E & string>(
    type: K,
    options?: EventsIteratorOptions,
  ): AsyncIterableIterator<EventfulEvent<E[K]>> {
    return this.#target.events(type, options);
  }
}
