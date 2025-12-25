import { BufferOverflowError } from './errors';
import { Observable, type SubscriptionObserver } from './observable';
import {
  createObservableProxy,
  type ObservableEventMap,
  type ObserveOptions,
} from './observe';
import { SymbolObservable } from './symbols';
import type {
  AsyncIteratorOptions,
  EmissionEvent,
  EventTargetLike,
  Listener,
  ObservableLike,
  Observer,
  OnOptions,
  WildcardEvent,
  WildcardListener,
} from './types';

/**
 * Check if a pattern matches a wildcard pattern.
 */
function matchesWildcard(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith(':*')) {
    const namespace = pattern.slice(0, -2);
    return eventType.startsWith(namespace + ':');
  }
  return false;
}

/**
 * Options for createEventTarget.
 *
 * @property onListenerError - Custom error handler called when a listener throws.
 *   If not provided, errors are emitted as 'error' events or re-thrown.
 */
export interface CreateEventTargetOptions {
  /** Custom error handler for listener errors. Receives event type and error. */
  onListenerError?: (type: string, error: unknown) => void;
}

/**
 * Options for createEventTarget with observe mode.
 * Extends CreateEventTargetOptions with proxy observation settings.
 *
 * @property observe - Must be true to enable observation mode.
 * @property deep - If true, nested objects are also observed (default: false).
 * @property cloneStrategy - Strategy for cloning previous state: 'shallow', 'deep', or 'path'.
 */
export interface CreateEventTargetObserveOptions
  extends CreateEventTargetOptions, ObserveOptions {
  /** Must be true to enable observation mode. */
  observe: true;
}

/**
 * Creates a type-safe event target with DOM EventTarget and TC39 Observable compatibility.
 *
 * @template E - Event map type where keys are event names and values are event detail types.
 * @param opts - Optional configuration options.
 * @returns A type-safe event target implementing EventTargetLike.
 *
 * @example
 * ```typescript
 * // Define event types
 * type Events = {
 *   'user:login': { userId: string };
 *   'user:logout': { reason: string };
 * };
 *
 * // Create event target
 * const events = createEventTarget<Events>();
 *
 * // Add typed listener
 * events.addEventListener('user:login', (event) => {
 *   console.log(`User logged in: ${event.detail.userId}`);
 * });
 *
 * // Dispatch typed event
 * events.dispatchEvent({ type: 'user:login', detail: { userId: '123' } });
 * ```
 *
 * @overload Creates a basic event target
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
export function createEventTarget<E extends Record<string, any>>(
  opts?: CreateEventTargetOptions,
): EventTargetLike<E>;

/**
 * Creates an observable proxy that dispatches events when properties change.
 *
 * @template T - The type of object to observe.
 * @param target - The object to wrap with an observable proxy.
 * @param opts - Configuration options with observe: true.
 * @returns The proxied object with EventTargetLike methods mixed in.
 *
 * @example
 * ```typescript
 * // Create observable state
 * const state = createEventTarget({ count: 0, user: { name: 'Alice' } }, {
 *   observe: true,
 *   deep: true,
 * });
 *
 * // Listen for any update
 * state.addEventListener('update', (event) => {
 *   console.log('State changed:', event.detail.current);
 * });
 *
 * // Listen for specific property changes
 * state.addEventListener('update:count', (event) => {
 *   console.log('Count changed to:', event.detail.value);
 * });
 *
 * // Mutations trigger events automatically
 * state.count = 1; // Triggers 'update' and 'update:count'
 * state.user.name = 'Bob'; // Triggers 'update' and 'update:user.name'
 * ```
 *
 * @overload Wraps an object with a Proxy that dispatches events on mutations
 */
export function createEventTarget<T extends object>(
  target: T,
  opts: CreateEventTargetObserveOptions,
): T & EventTargetLike<ObservableEventMap<T>>;

/**
 * Creates a type-safe event target with DOM EventTarget and TC39 Observable compatibility.
 *
 * This is the main factory function for creating event emitters. It supports two modes:
 *
 * 1. **Basic Mode**: Creates a standalone event target for pub/sub messaging.
 * 2. **Observe Mode**: Wraps an object with a Proxy that automatically dispatches
 *    events when properties are modified.
 *
 * Listener errors are handled via 'error' event: if a listener throws,
 * an 'error' event is emitted. If no 'error' listener is registered,
 * the error is re-thrown (Node.js behavior).
 *
 * @param targetOrOpts - Either the object to observe, or configuration options.
 * @param opts - Configuration options when first argument is an object to observe.
 * @returns Either an EventTargetLike or a proxied object with EventTargetLike methods.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
export function createEventTarget<T extends object, E extends Record<string, any>>(
  targetOrOpts?: T | CreateEventTargetOptions,
  opts?: CreateEventTargetObserveOptions,
): EventTargetLike<E> | (T & EventTargetLike<ObservableEventMap<T>>) {
  // Handle observe mode - opts.observe must be explicitly true
  if (opts?.observe === true && targetOrOpts && typeof targetOrOpts === 'object') {
    const target = targetOrOpts as T;
    const eventTarget = createEventTargetInternal<ObservableEventMap<T>>({
      onListenerError: opts.onListenerError,
    });

    const proxy = createObservableProxy(target, eventTarget, {
      deep: opts.deep,
      cloneStrategy: opts.cloneStrategy,
    });

    // Copy eventTarget methods onto the proxy
    // Use defineProperty to avoid triggering proxy traps
    const methodNames = [
      'addEventListener',
      'removeEventListener',
      'dispatchEvent',
      'clear',
      'on',
      'once',
      'removeAllListeners',
      'pipe',
      'addWildcardListener',
      'removeWildcardListener',
      'complete',
      'subscribe',
      'toObservable',
      'events',
    ] as const;

    for (const name of methodNames) {
      Object.defineProperty(proxy, name, {
        value: eventTarget[name],
        writable: false,
        enumerable: false,
        configurable: true,
      });
    }

    // Add completed getter
    Object.defineProperty(proxy, 'completed', {
      get: () => eventTarget.completed,
      enumerable: false,
      configurable: true,
    });

    return proxy as T & EventTargetLike<ObservableEventMap<T>>;
  }

  // Original behavior
  return createEventTargetInternal<E>(
    targetOrOpts as CreateEventTargetOptions | undefined,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
function createEventTargetInternal<E extends Record<string, any>>(
  opts?: CreateEventTargetOptions,
): EventTargetLike<E> {
  const listeners = new Map<string, Set<Listener<E[keyof E]>>>();
  const wildcardListeners = new Set<WildcardListener<E>>();
  let isCompleted = false;
  const completionCallbacks = new Set<() => void>();

  /**
   * Helper to create a DOM-compatible augmented event.
   */
  const augmentEvent = <T>(type: string, detail: T): EmissionEvent<T> => {
    const baseEvent = {
      bubbles: false,
      cancelable: false,
      composed: false,
      defaultPrevented: false,
      eventPhase: 2, // AT_TARGET
      isTrusted: false,
      timeStamp: Date.now(),
      NONE: 0,
      CAPTURING_PHASE: 1,
      AT_TARGET: 2,
      BUBBLING_PHASE: 3,
      composedPath: () => [target],
      stopImmediatePropagation: () => {},
      stopPropagation: () => {},
    };

    return Object.defineProperties(
      { ...baseEvent, type, detail },
      {
        target: { value: target, enumerable: true, configurable: true },
        currentTarget: { value: target, enumerable: true, configurable: true },
        preventDefault: {
          value: function (this: EmissionEvent<unknown>) {
            Object.defineProperty(this, 'defaultPrevented', {
              value: true,
              enumerable: true,
              configurable: true,
            });
          },
          enumerable: true,
          configurable: true,
        },
      },
    ) as EmissionEvent<T>;
  };

  // Helper to handle listener errors: emit 'error' event or re-throw if no listener
  const handleListenerError = (eventType: string, error: unknown) => {
    // Prevent infinite recursion if 'error' listener itself throws
    if (eventType === 'error') return;

    // If custom error handler provided, use it
    if (opts?.onListenerError) {
      opts.onListenerError(eventType, error);
      return;
    }

    const errorListeners = listeners.get('error');
    if (errorListeners && errorListeners.size > 0) {
      // Emit 'error' event with the error as detail
      const errorEvent = augmentEvent('error', error);
      for (const rec of Array.from(errorListeners)) {
        try {
          const fn = rec.fn as (event: EmissionEvent<unknown>) => void | Promise<void>;
          void fn(errorEvent as EmissionEvent<E[keyof E]>);
        } catch {
          // Swallow errors from error handlers to prevent infinite loops
        }
        if (rec.once) errorListeners.delete(rec);
      }
    } else {
      // No 'error' listener - re-throw (Node.js behavior)
      throw error;
    }
  };

  const notifyWildcardListeners = (eventType: string, detail: E[keyof E]) => {
    if (wildcardListeners.size === 0) return;

    for (const rec of Array.from(wildcardListeners)) {
      if (!matchesWildcard(eventType, rec.pattern)) continue;

      // Create wildcard event based on augmented event
      const baseAugmented = augmentEvent(rec.pattern, detail);
      const wildcardEvent: WildcardEvent<E> = Object.defineProperties(baseAugmented, {
        originalType: { value: eventType, enumerable: true, configurable: true },
      }) as WildcardEvent<E>;

      try {
        const fn = rec.fn as (event: WildcardEvent<E>) => void | Promise<void>;
        const res = fn(wildcardEvent);
        if (res && typeof res.then === 'function') {
          res.catch((error) => {
            try {
              handleListenerError(eventType, error);
            } catch (rethrown) {
              // Re-throw async errors via queueMicrotask to preserve stack trace
              queueMicrotask(() => {
                throw rethrown;
              });
            }
          });
        }
      } catch (error) {
        handleListenerError(eventType, error);
      } finally {
        if (rec.once) wildcardListeners.delete(rec);
      }
    }
  };

  const addEventListener: EventTargetLike<E>['addEventListener'] = (
    type,
    listener,
    options,
  ) => {
    if (isCompleted) {
      // Return no-op unsubscribe if already completed
      return () => {};
    }

    const opts2 = options ?? {};
    const record: Listener<E[keyof E]> = {
      fn: listener as Listener<E[keyof E]>['fn'],
      once: opts2.once,
      signal: opts2.signal,
    };
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(record);
    const unsubscribe = () => {
      const setNow = listeners.get(type);
      setNow?.delete(record);
      if (record.signal && record.abortHandler) {
        record.signal.removeEventListener('abort', record.abortHandler);
      }
    };
    if (opts2.signal) {
      const onAbort = () => unsubscribe();
      record.abortHandler = onAbort;
      opts2.signal.addEventListener('abort', onAbort, { once: true });
      if (opts2.signal.aborted) onAbort();
    }
    return unsubscribe;
  };

  const addWildcardListener: EventTargetLike<E>['addWildcardListener'] = (
    pattern,
    listener,
    options,
  ) => {
    if (isCompleted) return () => {};

    const opts2 = options ?? {};
    const record: WildcardListener<E> = {
      fn: listener,
      pattern,
      once: opts2.once,
      signal: opts2.signal,
    };
    wildcardListeners.add(record);

    const unsubscribe = () => {
      wildcardListeners.delete(record);
      if (record.signal && record.abortHandler) {
        record.signal.removeEventListener('abort', record.abortHandler);
      }
    };

    if (opts2.signal) {
      const onAbort = () => unsubscribe();
      record.abortHandler = onAbort;
      opts2.signal.addEventListener('abort', onAbort, { once: true });
      if (opts2.signal.aborted) onAbort();
    }

    return unsubscribe;
  };

  const removeWildcardListener: EventTargetLike<E>['removeWildcardListener'] = (
    pattern,
    listener,
  ) => {
    for (const record of wildcardListeners) {
      if (record.pattern === pattern && record.fn === listener) {
        wildcardListeners.delete(record);
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
        break;
      }
    }
  };

  const dispatchEvent: EventTargetLike<E>['dispatchEvent'] = (event) => {
    if (isCompleted) return false;

    // Augment event with DOM properties to ensure it's a superset of DOM Event
    const augmentedEvent = augmentEvent(event.type, event.detail);

    // Notify wildcard listeners first (no overhead if none registered)
    notifyWildcardListeners(event.type, event.detail as E[keyof E]);

    const set = listeners.get(event.type);
    if (!set || set.size === 0) return true;
    for (const rec of Array.from(set)) {
      try {
        const res = rec.fn(augmentedEvent as EmissionEvent<E[keyof E]>);
        if (res && typeof res.then === 'function') {
          res.catch((error) => {
            try {
              handleListenerError(event.type, error);
            } catch (rethrown) {
              // Re-throw async errors via queueMicrotask to preserve stack trace
              queueMicrotask(() => {
                throw rethrown;
              });
            }
          });
        }
      } catch (error) {
        handleListenerError(event.type, error);
      } finally {
        if (rec.once) set.delete(rec);
      }
    }
    return true;
  };

  const removeEventListener: EventTargetLike<E>['removeEventListener'] = (
    type,
    listener,
  ) => {
    const set = listeners.get(type);
    if (!set) return;

    for (const record of set) {
      if (record.fn === listener) {
        set.delete(record);
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
        break;
      }
    }
  };

  const clear = () => {
    // Clean up abort handlers before clearing
    for (const set of listeners.values()) {
      for (const record of set) {
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
      }
      set.clear();
    }
    listeners.clear();

    // Clear wildcard listeners too
    for (const record of wildcardListeners) {
      if (record.signal && record.abortHandler) {
        record.signal.removeEventListener('abort', record.abortHandler);
      }
    }
    wildcardListeners.clear();
    // Note: clear() does NOT trigger completion callbacks or set isCompleted
    // Use complete() for that
  };

  // New ergonomics

  const on: EventTargetLike<E>['on'] = (type, options) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Observable<EmissionEvent<any>>(
      (observer: SubscriptionObserver<EmissionEvent<any>>) => {
        let opts: OnOptions;
        if (typeof options === 'boolean') {
          opts = { signal: undefined }; // Map boolean capture to options if needed, but our internal target doesn't use capture
        } else {
          opts = options ?? {};
        }

        const handler = opts.handler;
        const once = opts.once;

        const eventHandler = (e: EmissionEvent<unknown>) => {
          let success = false;
          try {
            if (handler) {
              handler(e);
            }
            observer.next(e);
            success = true;
          } finally {
            if (once && success) {
              observer.complete();
            }
          }
        };

        const errorHandler = (e: EmissionEvent<unknown>) => {
          observer.error(e.detail);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        const unsubscribeEvent = addEventListener(
          type as keyof E & string,
          eventHandler as any,
          opts,
        );

        let unsubscribeError: (() => void) | undefined;
        if (opts.receiveError) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          unsubscribeError = addEventListener(
            'error' as keyof E & string,
            errorHandler as any,
            opts,
          );
        }

        return () => {
          unsubscribeEvent();
          if (unsubscribeError) {
            unsubscribeError();
          }
        };
      },
    );
  };

  const onceMethod: EventTargetLike<E>['once'] = (type, listener, options) => {
    return addEventListener(type, listener, { ...options, once: true });
  };

  const removeAllListeners: EventTargetLike<E>['removeAllListeners'] = (type) => {
    if (type !== undefined) {
      const set = listeners.get(type);
      if (set) {
        // Clean up abort handlers before clearing
        for (const record of set) {
          if (record.signal && record.abortHandler) {
            record.signal.removeEventListener('abort', record.abortHandler);
          }
        }
        set.clear();
        listeners.delete(type);
      }
    } else {
      // Clear all listeners for all types
      for (const set of listeners.values()) {
        for (const record of set) {
          if (record.signal && record.abortHandler) {
            record.signal.removeEventListener('abort', record.abortHandler);
          }
        }
        set.clear();
      }
      listeners.clear();

      // Clear wildcard listeners too
      for (const record of wildcardListeners) {
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
      }
      wildcardListeners.clear();
    }
  };

  /**
   * Pipe events from this emitter to another target.
   *
   * **Limitation**: Only forwards events for types that already have listeners
   * when pipe() is called. Events for types registered afterward won't be piped.
   *
   * To ensure all events are piped, add at least one listener for each event type
   * before calling pipe().
   */
  const pipe: EventTargetLike<E>['pipe'] = (target, mapFn) => {
    if (isCompleted) {
      return () => {};
    }

    const unsubscribes: Array<() => void> = [];

    // Subscribe to all current and future events by listening to each event type
    // We need to track event types we've subscribed to
    const subscribedTypes = new Set<string>();

    const subscribeToType = (type: string) => {
      if (subscribedTypes.has(type)) return;
      subscribedTypes.add(type);

      const unsub = addEventListener(type as keyof E & string, (event) => {
        if (mapFn) {
          const mapped = mapFn(event);
          if (mapped !== null) {
            // Type assertion via unknown is needed because mapFn output type matches target's event map
            target.dispatchEvent(
              mapped as unknown as Parameters<typeof target.dispatchEvent>[0],
            );
          }
        } else {
          // Type assertion via unknown is needed because caller ensures E and T are compatible
          target.dispatchEvent(
            event as unknown as Parameters<typeof target.dispatchEvent>[0],
          );
        }
      });
      unsubscribes.push(unsub);
    };

    // Subscribe to all existing event types
    for (const type of listeners.keys()) {
      subscribeToType(type);
    }

    // Clean up on completion
    const completionUnsub = () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
    completionCallbacks.add(completionUnsub);

    return () => {
      completionCallbacks.delete(completionUnsub);
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  };

  const complete = () => {
    if (isCompleted) return;
    isCompleted = true;

    // Trigger completion callbacks (pipes, subscriptions)
    for (const cb of completionCallbacks) {
      try {
        cb();
      } catch (err) {
        // Completion callback errors use handleListenerError
        // Use 'complete' as the event type for these errors
        try {
          handleListenerError('complete', err);
        } catch {
          // Swallow if no error listener
        }
      }
    }
    completionCallbacks.clear();

    // Clear all listeners
    for (const set of listeners.values()) {
      for (const record of set) {
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
      }
      set.clear();
    }
    listeners.clear();

    // Clear wildcard listeners
    for (const record of wildcardListeners) {
      if (record.signal && record.abortHandler) {
        record.signal.removeEventListener('abort', record.abortHandler);
      }
    }
    wildcardListeners.clear();
  };

  // Observable interop
  const subscribe: EventTargetLike<E>['subscribe'] = (
    type,
    observerOrNext,
    error,
    completeHandler,
  ) => {
    let observer: Observer<EmissionEvent<E[keyof E & string]>>;

    if (typeof observerOrNext === 'function') {
      observer = {
        next: observerOrNext as (value: EmissionEvent<E[keyof E & string]>) => void,
        error,
        complete: completeHandler,
      };
    } else {
      observer = (observerOrNext ?? {}) as Observer<EmissionEvent<E[keyof E & string]>>;
    }

    let closed = false;

    if (isCompleted) {
      // Already completed, call complete immediately
      if (observer.complete) {
        try {
          observer.complete();
        } catch {
          // Swallow
        }
      }
      return {
        unsubscribe: () => {
          closed = true;
        },
        get closed() {
          return closed || isCompleted;
        },
      };
    }

    const unsub = addEventListener(type, (event) => {
      if (closed) return;
      if (observer.next) {
        try {
          observer.next(event as EmissionEvent<E[keyof E & string]>);
        } catch (err) {
          if (observer.error) {
            try {
              observer.error(err);
            } catch {
              // Swallow
            }
          }
        }
      }
    });

    // Track completion callback
    const onComplete = () => {
      if (closed) return;
      closed = true;
      if (observer.complete) {
        try {
          observer.complete();
        } catch {
          // Swallow
        }
      }
    };
    completionCallbacks.add(onComplete);

    return {
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        completionCallbacks.delete(onComplete);
        unsub();
      },
      get closed() {
        return closed || isCompleted;
      },
    };
  };

  const toObservable: EventTargetLike<E>['toObservable'] = () => {
    return new Observable<EmissionEvent<E[keyof E]>>(
      (observer: SubscriptionObserver<EmissionEvent<E[keyof E]>>) => {
        if (isCompleted) {
          observer.complete();
          return;
        }

        const wildcardListener = (event: WildcardEvent<E>) => {
          // Emit an augmented event with the actual type
          observer.next(augmentEvent(event.originalType, event.detail));
        };

        const unsubscribe = addWildcardListener('*', wildcardListener);

        const onComplete = () => {
          observer.complete();
        };
        completionCallbacks.add(onComplete);

        return () => {
          unsubscribe();
          completionCallbacks.delete(onComplete);
        };
      },
    );
  };

  // Async iterator
  function events<K extends keyof E & string>(
    type: K,
    options?: AsyncIteratorOptions,
  ): AsyncIterableIterator<EmissionEvent<E[K]>> {
    // If already completed, return an iterator that immediately yields done
    if (isCompleted) {
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        next(): Promise<IteratorResult<EmissionEvent<E[K]>>> {
          return Promise.resolve({
            value: undefined as unknown as EmissionEvent<E[K]>,
            done: true,
          });
        },
        return(): Promise<IteratorResult<EmissionEvent<E[K]>>> {
          return Promise.resolve({
            value: undefined as unknown as EmissionEvent<E[K]>,
            done: true,
          });
        },
      };
    }

    const signal = options?.signal;
    const bufferSize = options?.bufferSize ?? Infinity;
    const overflowStrategy = options?.overflowStrategy ?? 'drop-oldest';

    const buffer: Array<EmissionEvent<E[K]>> = [];
    let resolve: ((result: IteratorResult<EmissionEvent<E[K]>>) => void) | null = null;
    let done = false;
    let hasOverflow = false;

    const unsub = addEventListener(type, (event) => {
      if (done) return;

      if (resolve) {
        // Someone is waiting, resolve immediately
        const r = resolve;
        resolve = null;
        r({ value: event, done: false });
      } else {
        // Buffer the event
        if (buffer.length >= bufferSize && bufferSize !== Infinity) {
          switch (overflowStrategy) {
            case 'drop-oldest':
              buffer.shift();
              buffer.push(event);
              break;
            case 'drop-latest':
              // Don't add the new event
              break;
            case 'throw':
              unsub();
              completionCallbacks.delete(onComplete);
              done = true;
              hasOverflow = true;
              return;
          }
        } else {
          buffer.push(event);
        }
      }
    });

    // Handle completion
    const onComplete = () => {
      done = true;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: undefined as unknown as EmissionEvent<E[K]>, done: true });
      }
    };
    completionCallbacks.add(onComplete);

    // Handle abort signal
    let onAbort: (() => void) | null = null;
    if (signal) {
      onAbort = () => {
        done = true;
        completionCallbacks.delete(onComplete);
        unsub();
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: undefined as unknown as EmissionEvent<E[K]>, done: true });
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }

    const iterator: AsyncIterableIterator<EmissionEvent<E[K]>> = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next(): Promise<IteratorResult<EmissionEvent<E[K]>>> {
        // Drain buffered events first, even if done
        if (buffer.length > 0) {
          return { value: buffer.shift()!, done: false };
        }

        // After buffer is drained, check for overflow error
        if (hasOverflow) {
          hasOverflow = false;
          throw new BufferOverflowError(type, bufferSize);
        }

        if (done) {
          return { value: undefined as unknown as EmissionEvent<E[K]>, done: true };
        }

        // Prevent concurrent next() calls - if there's already a pending promise, reject
        if (resolve !== null) {
          return Promise.reject(
            new Error(
              'Concurrent calls to next() are not supported on this async iterator',
            ),
          );
        }

        // Wait for next event
        return new Promise<IteratorResult<EmissionEvent<E[K]>>>((_resolve, _reject) => {
          if (done) {
            _resolve({ value: undefined as unknown as EmissionEvent<E[K]>, done: true });
            return;
          }
          if (hasOverflow) {
            hasOverflow = false;
            _reject(new BufferOverflowError(type, bufferSize));
            return;
          }
          resolve = _resolve;
        });
      },
      return(): Promise<IteratorResult<EmissionEvent<E[K]>>> {
        // Resolve any pending promise before cleanup
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: undefined as unknown as EmissionEvent<E[K]>, done: true });
        }

        done = true;
        completionCallbacks.delete(onComplete);
        unsub();

        // Clean up abort signal listener
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }

        return Promise.resolve({
          value: undefined as unknown as EmissionEvent<E[K]>,
          done: true,
        });
      },
    };

    return iterator;
  }

  const target: EventTargetLike<E> = {
    addEventListener,
    removeEventListener,
    dispatchEvent,
    clear,
    on,
    once: onceMethod,
    removeAllListeners,
    pipe,
    addWildcardListener,
    removeWildcardListener,
    complete,
    get completed() {
      return isCompleted;
    },
    subscribe,
    toObservable,
    events,
  };

  // Add Symbol.observable - return an observable that emits all events from all types
  (
    target as EventTargetLike<E> & {
      [key: symbol]: () => ObservableLike<EmissionEvent<E[keyof E]>>;
    }
  )[SymbolObservable] = () => {
    return toObservable();
  };

  return target;
}
