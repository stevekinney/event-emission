import { BufferOverflowError } from './errors';
import { Observable, type SubscriptionObserver } from './observable';
import {
  createObservableProxy,
  type ObservableEventMap,
  type ObserveOptions,
} from './observe';
import { SymbolObservable } from './symbols';
import type {
  AddEventListenerOptionsLike,
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
  return pattern.endsWith(':*') && eventType.startsWith(pattern.slice(0, -2) + ':');
}

type EventPathStruct = {
  invocationTarget: unknown;
  invocationTargetInShadowTree: boolean;
  shadowAdjustedTarget: unknown;
  relatedTarget: unknown;
  touchTargets: unknown[];
  rootOfClosedTree: boolean;
  slotInClosedTree: boolean;
};

type EventDispatchState = {
  dispatchFlag: boolean;
  initializedFlag: boolean;
  stopPropagationFlag: boolean;
  stopImmediatePropagationFlag: boolean;
  canceledFlag: boolean;
  inPassiveListenerFlag: boolean;
  composedFlag: boolean;
  eventPhase: number;
  currentTarget: unknown;
  target: unknown;
  timeStamp: number;
  path: EventPathStruct[];
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  isTrusted: boolean;
};

const EVENT_STATE = Symbol('event-emission:event-state');

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
 * @property deep - If true, nested objects are also observed (default: true).
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
      deepClone: opts.deepClone,
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
  const listeners = new Map<string, Array<Listener<E[keyof E]>>>();
  const wildcardListeners = new Set<WildcardListener<E>>();
  let isCompleted = false;
  const completionCallbacks = new Set<() => void>();

  const now = () =>
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now()
      : Date.now();

  const initializeEventState = (
    state: EventDispatchState,
    type: string,
    bubbles: boolean,
    cancelable: boolean,
  ) => {
    state.initializedFlag = true;
    state.stopPropagationFlag = false;
    state.stopImmediatePropagationFlag = false;
    state.canceledFlag = false;
    state.isTrusted = false;
    state.target = null;
    state.currentTarget = null;
    state.eventPhase = 0;
    state.type = type;
    state.bubbles = bubbles;
    state.cancelable = cancelable;
  };

  const setCanceledFlag = (state: EventDispatchState) => {
    if (state.cancelable && !state.inPassiveListenerFlag) {
      state.canceledFlag = true;
    }
  };

  /**
   * Helper to create a DOM-compatible event.
   */
  const createEvent = <T>(
    type: string,
    detail: T,
    init?: {
      bubbles?: boolean;
      cancelable?: boolean;
      composed?: boolean;
      timeStamp?: number;
      target?: unknown;
      currentTarget?: unknown;
      eventPhase?: number;
    },
  ): EmissionEvent<T> => {
    const state: EventDispatchState = {
      dispatchFlag: false,
      initializedFlag: true,
      stopPropagationFlag: false,
      stopImmediatePropagationFlag: false,
      canceledFlag: false,
      inPassiveListenerFlag: false,
      composedFlag: Boolean(init?.composed),
      eventPhase: init?.eventPhase ?? 0,
      currentTarget: init?.currentTarget ?? init?.target ?? null,
      target: init?.target ?? null,
      timeStamp: init?.timeStamp ?? now(),
      path: [],
      type,
      bubbles: Boolean(init?.bubbles),
      cancelable: Boolean(init?.cancelable),
      isTrusted: false,
    };

    const event = { detail } as EmissionEvent<T>;
    Object.defineProperties(event, {
      type: {
        get: () => state.type,
        enumerable: true,
        configurable: true,
      },
      bubbles: {
        get: () => state.bubbles,
        enumerable: true,
        configurable: true,
      },
      cancelable: {
        get: () => state.cancelable,
        enumerable: true,
        configurable: true,
      },
      cancelBubble: {
        get: () => state.stopPropagationFlag,
        set: (value: boolean) => {
          if (value) state.stopPropagationFlag = true;
        },
        enumerable: true,
        configurable: true,
      },
      composed: {
        get: () => state.composedFlag,
        enumerable: true,
        configurable: true,
      },
      currentTarget: {
        get: () => state.currentTarget,
        enumerable: true,
        configurable: true,
      },
      defaultPrevented: {
        get: () => state.canceledFlag,
        enumerable: true,
        configurable: true,
      },
      eventPhase: {
        get: () => state.eventPhase,
        enumerable: true,
        configurable: true,
      },
      isTrusted: {
        get: () => state.isTrusted,
        enumerable: true,
        configurable: true,
      },
      returnValue: {
        get: () => !state.canceledFlag,
        set: (value: boolean) => {
          if (value === false) setCanceledFlag(state);
        },
        enumerable: true,
        configurable: true,
      },
      srcElement: {
        get: () => state.target,
        enumerable: true,
        configurable: true,
      },
      target: {
        get: () => state.target,
        enumerable: true,
        configurable: true,
      },
      timeStamp: {
        get: () => state.timeStamp,
        enumerable: true,
        configurable: true,
      },
      composedPath: {
        value: () => state.path.map((entry) => entry.invocationTarget),
        enumerable: true,
        configurable: true,
      },
      initEvent: {
        value: (newType: string, bubbles = false, cancelable = false) => {
          if (state.dispatchFlag) return;
          initializeEventState(state, newType, Boolean(bubbles), Boolean(cancelable));
        },
        enumerable: true,
        configurable: true,
      },
      preventDefault: {
        value: () => setCanceledFlag(state),
        enumerable: true,
        configurable: true,
      },
      stopImmediatePropagation: {
        value: () => {
          state.stopPropagationFlag = true;
          state.stopImmediatePropagationFlag = true;
        },
        enumerable: true,
        configurable: true,
      },
      stopPropagation: {
        value: () => {
          state.stopPropagationFlag = true;
        },
        enumerable: true,
        configurable: true,
      },
      NONE: { value: 0, enumerable: true, configurable: true },
      CAPTURING_PHASE: { value: 1, enumerable: true, configurable: true },
      AT_TARGET: { value: 2, enumerable: true, configurable: true },
      BUBBLING_PHASE: { value: 3, enumerable: true, configurable: true },
      [EVENT_STATE]: {
        value: state,
        enumerable: false,
        configurable: false,
      },
    });

    return event;
  };

  const getEventState = (event: EmissionEvent<unknown>): EventDispatchState | undefined =>
    (event as { [EVENT_STATE]?: EventDispatchState })[EVENT_STATE];

  const normalizeAddListenerOptions = (
    options?: AddEventListenerOptionsLike | boolean,
  ) => {
    if (typeof options === 'boolean') {
      return {
        capture: options,
        passive: false,
        once: false,
        signal: null as AddEventListenerOptionsLike['signal'] | null,
      };
    }

    return {
      capture: Boolean(options?.capture),
      passive: Boolean(options?.passive),
      once: Boolean(options?.once),
      signal: options?.signal ?? null,
    };
  };

  const normalizeCaptureOption = (options?: { capture?: boolean } | boolean) => {
    if (typeof options === 'boolean') return options;
    return Boolean(options?.capture);
  };

  const removeListenerRecord = (type: string, record: Listener<E[keyof E]>) => {
    if (record.removed) return;
    record.removed = true;

    const list = listeners.get(type);
    if (list) {
      const idx = list.indexOf(record);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) listeners.delete(type);
    }

    if (record.signal && record.abortHandler) {
      record.signal.removeEventListener('abort', record.abortHandler);
    }
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
    if (errorListeners && errorListeners.length > 0) {
      dispatchEvent({ type: 'error', detail: error } as Parameters<
        EventTargetLike<E>['dispatchEvent']
      >[0]);
    } else {
      // No 'error' listener - re-throw (Node.js behavior)
      throw error;
    }
  };

  const notifyWildcardListeners = (
    eventType: string,
    event: EmissionEvent<E[keyof E]>,
  ) => {
    if (wildcardListeners.size === 0) return;

    for (const rec of Array.from(wildcardListeners)) {
      if (!matchesWildcard(eventType, rec.pattern)) continue;

      // Create wildcard event based on a DOM-compatible event
      const baseEvent = createEvent(rec.pattern, event.detail, {
        target,
        currentTarget: target,
        eventPhase: 2,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        composed: event.composed,
      });
      const wildcardEvent: WildcardEvent<E> = Object.defineProperties(baseEvent, {
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

      const state = getEventState(wildcardEvent);
      if (state?.stopImmediatePropagationFlag || state?.stopPropagationFlag) {
        break;
      }
    }
  };

  const addEventListener: EventTargetLike<E>['addEventListener'] = (
    type,
    listener,
    options,
  ) => {
    if (isCompleted || !listener) {
      // Return no-op unsubscribe if already completed
      return () => {};
    }

    const { capture, passive, once, signal } = normalizeAddListenerOptions(options);
    let list = listeners.get(type);
    if (!list) {
      list = [];
      listeners.set(type, list);
    }

    for (const existing of list) {
      if (existing.original === listener && existing.capture === capture) {
        return () =>
          removeEventListener(type, listener, options as boolean | { capture?: boolean });
      }
    }

    const original = listener as Listener<E[keyof E]>['original'];
    const callback =
      typeof listener === 'function'
        ? (listener as Listener<E[keyof E]>['callback'])
        : (event: EmissionEvent<E[keyof E]>) =>
            (
              listener as {
                handleEvent: Listener<E[keyof E]>['callback'];
              }
            ).handleEvent(event);

    const record: Listener<E[keyof E]> = {
      type,
      original,
      callback,
      capture,
      passive,
      once,
      signal,
      removed: false,
    };
    list.push(record);

    const unsubscribe = () => removeListenerRecord(type, record);

    if (signal) {
      const onAbort = () => removeListenerRecord(type, record);
      record.abortHandler = onAbort;
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
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
    for (const existing of wildcardListeners) {
      if (existing.pattern === pattern && existing.fn === listener) {
        return () => removeWildcardListener(pattern, listener);
      }
    }
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
    for (const record of Array.from(wildcardListeners)) {
      if (record.pattern === pattern && record.fn === listener) {
        wildcardListeners.delete(record);
        if (record.signal && record.abortHandler) {
          record.signal.removeEventListener('abort', record.abortHandler);
        }
      }
    }
  };

  const invokeListeners = (
    eventType: string,
    event: EmissionEvent<E[keyof E]>,
    phase: 'capturing' | 'bubbling',
    listenersSnapshot: Array<Listener<E[keyof E]>>,
  ) => {
    const state = getEventState(event);
    if (!state || state.stopPropagationFlag) return;

    state.currentTarget = target;
    state.target = target;
    state.eventPhase = event.AT_TARGET;

    for (const rec of listenersSnapshot) {
      if (rec.removed) continue;
      if (phase === 'capturing' && !rec.capture) continue;
      if (phase === 'bubbling' && rec.capture) continue;

      if (rec.once) removeListenerRecord(rec.type, rec);

      if (rec.passive) state.inPassiveListenerFlag = true;
      try {
        const res = rec.callback.call(state.currentTarget, event);
        if (res && typeof res.then === 'function') {
          res.catch((error) => {
            try {
              handleListenerError(eventType, error);
            } catch (rethrown) {
              queueMicrotask(() => {
                throw rethrown;
              });
            }
          });
        }
      } catch (error) {
        handleListenerError(eventType, error);
      } finally {
        if (rec.passive) state.inPassiveListenerFlag = false;
      }

      if (state.stopImmediatePropagationFlag) break;
    }
  };

  const dispatchEvent: EventTargetLike<E>['dispatchEvent'] = (eventInput) => {
    if (isCompleted) return false;

    let event: EmissionEvent<E[keyof E]>;
    let state: EventDispatchState | undefined;

    if (eventInput && typeof eventInput === 'object') {
      state = getEventState(eventInput as EmissionEvent<unknown>);
      if (state) {
        event = eventInput as EmissionEvent<E[keyof E]>;
      } else {
        const input = eventInput as {
          type: string;
          detail?: E[keyof E];
          bubbles?: boolean;
          cancelable?: boolean;
          composed?: boolean;
          timeStamp?: number;
        };
        if (typeof input.type !== 'string') {
          throw new TypeError('Event type must be a string');
        }
        event = createEvent(input.type, input.detail as E[keyof E], {
          bubbles: input.bubbles,
          cancelable: input.cancelable,
          composed: input.composed,
          timeStamp: input.timeStamp,
        });
        state = getEventState(event)!;
      }
    } else {
      throw new TypeError('dispatchEvent expects an event object');
    }

    const dispatchState = state ?? getEventState(event)!;

    if (dispatchState.dispatchFlag || !dispatchState.initializedFlag) {
      const message =
        'Failed to execute dispatchEvent: event is already being dispatched';
      if (typeof globalThis.DOMException === 'function') {
        throw new globalThis.DOMException(message, 'InvalidStateError');
      }
      const err = new Error(message);
      err.name = 'InvalidStateError';
      throw err;
    }

    dispatchState.isTrusted = false;
    dispatchState.dispatchFlag = true;
    dispatchState.path = [
      {
        invocationTarget: target,
        invocationTargetInShadowTree: false,
        shadowAdjustedTarget: target,
        relatedTarget: null,
        touchTargets: [],
        rootOfClosedTree: false,
        slotInClosedTree: false,
      },
    ];

    // Notify wildcard listeners first (no overhead if none registered)
    notifyWildcardListeners(dispatchState.type, event);

    const list = listeners.get(dispatchState.type);
    const snapshot = list ? list.slice() : [];
    invokeListeners(dispatchState.type, event, 'capturing', snapshot);
    invokeListeners(dispatchState.type, event, 'bubbling', snapshot);

    dispatchState.eventPhase = event.NONE;
    dispatchState.currentTarget = null;
    dispatchState.path = [];
    dispatchState.dispatchFlag = false;
    dispatchState.stopPropagationFlag = false;
    dispatchState.stopImmediatePropagationFlag = false;

    return !dispatchState.canceledFlag;
  };

  const removeEventListener: EventTargetLike<E>['removeEventListener'] = (
    type,
    listener,
    options,
  ) => {
    if (!listener) return;
    const capture = normalizeCaptureOption(options);
    const list = listeners.get(type);
    if (!list) return;

    for (const record of [...list]) {
      if (record.original === listener && record.capture === capture) {
        removeListenerRecord(type, record);
      }
    }
  };

  const clear = () => {
    for (const [type, list] of Array.from(listeners.entries())) {
      for (const record of [...list]) {
        removeListenerRecord(type, record);
      }
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
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return new Observable<EmissionEvent<any>>(
      (observer: SubscriptionObserver<EmissionEvent<any>>) => {
        /* eslint-enable @typescript-eslint/no-explicit-any */
        let opts: OnOptions;
        if (typeof options === 'boolean') {
          opts = { capture: options };
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

        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
        const unsubscribeEvent = addEventListener(
          type as keyof E & string,
          eventHandler as any,
          opts,
        );

        let unsubscribeError: (() => void) | undefined;
        if (opts.receiveError) {
          unsubscribeError = addEventListener(
            'error' as keyof E & string,
            errorHandler as any,
            opts,
          );
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

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
    if (typeof options === 'boolean') {
      return addEventListener(type, listener, { capture: options, once: true });
    }
    return addEventListener(type, listener, { ...(options ?? {}), once: true });
  };

  const removeAllListeners: EventTargetLike<E>['removeAllListeners'] = (type) => {
    if (type !== undefined) {
      const list = listeners.get(type);
      if (list) {
        for (const record of [...list]) {
          removeListenerRecord(type, record);
        }
        listeners.delete(type);
      }
    } else {
      // Clear all listeners for all types
      for (const [eventType, list] of Array.from(listeners.entries())) {
        for (const record of [...list]) {
          removeListenerRecord(eventType, record);
        }
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
   * Forwards all events. If mapFn returns null, the event is skipped.
   */
  const pipe: EventTargetLike<E>['pipe'] = (target, mapFn) => {
    if (isCompleted) {
      return () => {};
    }

    const unsubscribe = addWildcardListener('*', (event) => {
      if (mapFn) {
        const mapped = mapFn(
          createEvent(event.originalType, event.detail, {
            target,
            currentTarget: target,
            eventPhase: 2,
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            composed: event.composed,
          }) as EmissionEvent<E[keyof E & string], keyof E & string>,
        );
        if (mapped !== null) {
          // Type assertion via unknown is needed because mapFn output type matches target's event map
          target.dispatchEvent(
            mapped as unknown as Parameters<typeof target.dispatchEvent>[0],
          );
        }
      } else {
        // Type assertion via unknown is needed because caller ensures E and T are compatible
        target.dispatchEvent({
          type: event.originalType,
          detail: event.detail,
        } as unknown as Parameters<typeof target.dispatchEvent>[0]);
      }
    });

    // Clean up on completion
    const completionUnsub = () => {
      unsubscribe();
    };
    completionCallbacks.add(completionUnsub);

    return () => {
      completionCallbacks.delete(completionUnsub);
      unsubscribe();
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
    for (const [eventType, list] of Array.from(listeners.entries())) {
      for (const record of [...list]) {
        removeListenerRecord(eventType, record);
      }
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

  // Observable interoperability
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
          observer.next(
            createEvent(event.originalType, event.detail, {
              target,
              currentTarget: target,
              eventPhase: 2,
              bubbles: event.bubbles,
              cancelable: event.cancelable,
              composed: event.composed,
            }),
          );
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
  ): AsyncIterableIterator<EmissionEvent<E[K], K>> {
    // If already completed, return an iterator that immediately yields done
    if (isCompleted) {
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        next(): Promise<IteratorResult<EmissionEvent<E[K], K>>> {
          return Promise.resolve({
            value: undefined as unknown as EmissionEvent<E[K], K>,
            done: true,
          });
        },
        return(): Promise<IteratorResult<EmissionEvent<E[K], K>>> {
          return Promise.resolve({
            value: undefined as unknown as EmissionEvent<E[K], K>,
            done: true,
          });
        },
      };
    }

    const signal = options?.signal;
    const bufferSize = options?.bufferSize ?? Infinity;
    const overflowStrategy = options?.overflowStrategy ?? 'drop-oldest';

    const buffer: Array<EmissionEvent<E[K], K>> = [];
    let resolve: ((result: IteratorResult<EmissionEvent<E[K], K>>) => void) | null = null;
    let done = false;
    let hasOverflow = false;
    let onAbort: (() => void) | null = null;
    const cleanupAbortListener = () => {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const unsub = addEventListener(type, (event) => {
      if (done) return;
      const typedEvent = event;

      if (resolve) {
        // Someone is waiting, resolve immediately
        const r = resolve;
        resolve = null;
        r({ value: typedEvent, done: false });
      } else {
        // Buffer the event
        if (buffer.length >= bufferSize && bufferSize !== Infinity) {
          switch (overflowStrategy) {
            case 'drop-oldest':
              buffer.shift();
              buffer.push(typedEvent);
              break;
            case 'drop-latest':
              // Don't add the new event
              break;
            case 'throw':
              unsub();
              completionCallbacks.delete(onComplete);
              done = true;
              hasOverflow = true;
              cleanupAbortListener();
              return;
          }
        } else {
          buffer.push(typedEvent);
        }
      }
    });

    // Handle completion
    const onComplete = () => {
      done = true;
      cleanupAbortListener();
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: undefined as unknown as EmissionEvent<E[K], K>, done: true });
      }
    };
    completionCallbacks.add(onComplete);

    // Handle abort signal
    if (signal) {
      onAbort = () => {
        done = true;
        completionCallbacks.delete(onComplete);
        unsub();
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: undefined as unknown as EmissionEvent<E[K], K>, done: true });
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }

    const iterator: AsyncIterableIterator<EmissionEvent<E[K], K>> = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next(): Promise<IteratorResult<EmissionEvent<E[K], K>>> {
        // Drain buffered events first, even if done
        if (buffer.length > 0) {
          return { value: buffer.shift()!, done: false };
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
        return new Promise<IteratorResult<EmissionEvent<E[K], K>>>(
          (_resolve, _reject) => {
            if (hasOverflow) {
              hasOverflow = false;
              _reject(new BufferOverflowError(type, bufferSize));
              return;
            }
            if (done) {
              _resolve({
                value: undefined as unknown as EmissionEvent<E[K], K>,
                done: true,
              });
              return;
            }
            resolve = _resolve;
          },
        );
      },
      return(): Promise<IteratorResult<EmissionEvent<E[K], K>>> {
        // Resolve any pending promise before cleanup
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: undefined as unknown as EmissionEvent<E[K], K>, done: true });
        }

        done = true;
        completionCallbacks.delete(onComplete);
        unsub();

        // Clean up abort signal listener
        cleanupAbortListener();

        return Promise.resolve({
          value: undefined as unknown as EmissionEvent<E[K], K>,
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
