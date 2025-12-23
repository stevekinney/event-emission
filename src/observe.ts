/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Proxy handlers require any spreads */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- Type unions are intentional for flexibility */

import type { EventfulEvent, EventTargetLike } from './types';

// =============================================================================
// DOM Type Stubs (for DOM-free environments)
// =============================================================================

/** Minimal EventTarget interface for duck-typing */
interface MinimalEventTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  dispatchEvent(event: unknown): boolean;
}

/** Minimal Event interface for forwarding */
interface MinimalEvent {
  type: string;
}

/** Minimal CustomEvent interface for forwarding */
interface MinimalCustomEvent extends MinimalEvent {
  detail?: unknown;
}

/** Type declaration for structuredClone (available in modern runtimes) */
declare function structuredClone<T>(value: T): T;

// =============================================================================
// Symbols
// =============================================================================

/** Symbol marking an object as proxied */
export const PROXY_MARKER = Symbol.for('@lasercat/eventful/proxy');

/** Symbol to access the original unproxied target */
export const ORIGINAL_TARGET = Symbol.for('@lasercat/eventful/original');

// =============================================================================
// Types
// =============================================================================

/** Options for observable proxy creation */
export interface ObserveOptions {
  /** Enable deep observation of nested objects (default: true) */
  deep?: boolean;
  /** Clone strategy for previous state (default: 'path') */
  cloneStrategy?: 'shallow' | 'deep' | 'path';
}

/** Event detail for property changes */
export interface PropertyChangeDetail<T = unknown> {
  /** The new value */
  value: T;
  /** Current state of the root object (after change) */
  current: unknown;
  /** Previous state of the root object (before change) */
  previous: unknown;
}

/** Array methods that mutate the array */
export type ArrayMutationMethod =
  | 'push'
  | 'pop'
  | 'shift'
  | 'unshift'
  | 'splice'
  | 'sort'
  | 'reverse'
  | 'fill'
  | 'copyWithin';

/** Event detail for array mutations */
export interface ArrayMutationDetail<T = unknown> {
  /** The array method that was called */
  method: ArrayMutationMethod;
  /** Arguments passed to the method */
  args: unknown[];
  /** Return value of the method */
  result: unknown;
  /** Items that were added (if applicable) */
  added?: T[];
  /** Items that were removed (if applicable) */
  removed?: T[];
  /** Current state of the root object (after change) */
  current: unknown;
  /** Previous state of the root object (before change) */
  previous: unknown;
}

/** Event map for observable objects */
export type ObservableEventMap<_T extends object> = {
  update: PropertyChangeDetail;
  [key: `update:${string}`]: PropertyChangeDetail | ArrayMutationDetail;
};

// =============================================================================
// Constants
// =============================================================================

const ARRAY_MUTATORS = new Set<ArrayMutationMethod>([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

// =============================================================================
// Internal Types
// =============================================================================

interface ProxyContext<T extends object> {
  eventTarget: EventTargetLike<ObservableEventMap<T>>;
  /** Reference to the original (unproxied) root object for cloning */
  originalRoot: T;
  options: Required<ObserveOptions>;
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Check if a value can be proxied */
function isProxyable(value: unknown): value is object {
  return (
    value !== null &&
    typeof value === 'object' &&
    !isProxied(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !(value instanceof Map) &&
    !(value instanceof Set) &&
    !(value instanceof WeakMap) &&
    !(value instanceof WeakSet) &&
    !(value instanceof Promise) &&
    !(value instanceof Error) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  );
}

/** Check if already proxied */
function isProxied(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[PROXY_MARKER] === true
  );
}

/** Check if property is an array mutator */
function isArrayMutator(prop: string | symbol): prop is ArrayMutationMethod {
  return typeof prop === 'string' && ARRAY_MUTATORS.has(prop as ArrayMutationMethod);
}

/** Clone along changed path for efficiency */
function cloneAlongPath(obj: unknown, path?: string): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (!path) {
    return Array.isArray(obj) ? [...obj] : { ...obj };
  }

  const parts = path.split('.');

  if (Array.isArray(obj)) {
    // For arrays, shallow copy
    return [...obj];
  }

  const result: Record<string, unknown> = { ...obj };

  let current: Record<string, unknown> = result;
  // Clone all objects along the path, INCLUDING the leaf
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const value = current[key];
    if (value !== null && typeof value === 'object') {
      current[key] = Array.isArray(value) ? [...value] : { ...value };
      // Only traverse deeper if not the last element
      if (i < parts.length - 1) {
        current = current[key] as Record<string, unknown>;
      }
    } else {
      break;
    }
  }

  return result;
}

/** Clone for comparison based on strategy */
function cloneForComparison(
  obj: unknown,
  strategy: 'shallow' | 'deep' | 'path',
  changedPath?: string,
): unknown {
  if (obj === null || typeof obj !== 'object') return obj;

  switch (strategy) {
    case 'shallow':
      return Array.isArray(obj) ? [...obj] : { ...obj };

    case 'deep':
      return structuredClone(obj);

    case 'path':
      return cloneAlongPath(obj, changedPath);

    default:
      return obj;
  }
}

/** Compute array diff for mutation events */
function computeArrayDiff(
  method: ArrayMutationMethod,
  before: unknown[],
  _after: unknown[],
  args: unknown[],
): { added?: unknown[]; removed?: unknown[] } {
  switch (method) {
    case 'push':
      return { added: args };
    case 'pop':
      return { removed: before.length > 0 ? [before[before.length - 1]] : [] };
    case 'shift':
      return { removed: before.length > 0 ? [before[0]] : [] };
    case 'unshift':
      return { added: args };
    case 'splice': {
      const [start, deleteCount, ...items] = args as [number, number?, ...unknown[]];
      const actualStart =
        start < 0 ? Math.max(before.length + start, 0) : Math.min(start, before.length);
      const actualDeleteCount = Math.min(
        deleteCount ?? before.length - actualStart,
        before.length - actualStart,
      );
      return {
        removed: before.slice(actualStart, actualStart + actualDeleteCount),
        added: items,
      };
    }
    case 'sort':
    case 'reverse':
    case 'fill':
    case 'copyWithin':
      return {};
    default:
      return {};
  }
}

// =============================================================================
// Proxy Registry (prevents duplicate proxying)
// =============================================================================

// Registry key combines target object with context to allow same object
// to be observed in different contexts
const proxyRegistry = new WeakMap<
  object,
  WeakMap<ProxyContext<object>, { proxy: object; path: string }>
>();

/** Get or create proxy registry entry for a context */
function getContextRegistry(
  target: object,
): WeakMap<ProxyContext<object>, { proxy: object; path: string }> {
  let contextMap = proxyRegistry.get(target);
  if (!contextMap) {
    contextMap = new WeakMap();
    proxyRegistry.set(target, contextMap);
  }
  return contextMap;
}

// =============================================================================
// Array Method Interceptor
// =============================================================================

function createArrayMethodInterceptor<T extends object>(
  array: unknown[],
  method: ArrayMutationMethod,
  path: string,
  context: ProxyContext<T>,
): (...args: unknown[]) => unknown {
  const original = array[method as keyof typeof array] as (...args: unknown[]) => unknown;

  return function (this: unknown[], ...args: unknown[]): unknown {
    // Clone from original (unproxied) root BEFORE mutation
    const previousState = cloneForComparison(
      context.originalRoot,
      context.options.cloneStrategy,
      path,
    );
    const previousItems = [...array];

    const result = original.apply(this, args);

    const { added, removed } = computeArrayDiff(method, previousItems, array, args);

    // Determine event path - for root arrays, avoid leading dot
    const methodEventPath = path ? `update:${path}.${method}` : `update:${method}`;
    const arrayEventPath = path ? `update:${path}` : 'update:';

    // Dispatch method-specific event
    context.eventTarget.dispatchEvent({
      type: methodEventPath as keyof ObservableEventMap<T> & string,
      detail: {
        method,
        args,
        result,
        added,
        removed,
        current: context.originalRoot,
        previous: previousState,
      },
    } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);

    // Dispatch path event for the array itself (only if path is non-empty)
    if (path) {
      context.eventTarget.dispatchEvent({
        type: arrayEventPath as keyof ObservableEventMap<T> & string,
        detail: {
          value: array,
          current: context.originalRoot,
          previous: previousState,
        },
      } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);
    }

    // Dispatch top-level update
    context.eventTarget.dispatchEvent({
      type: 'update' as keyof ObservableEventMap<T> & string,
      detail: {
        current: context.originalRoot,
        previous: previousState,
      },
    } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);

    return result;
  };
}

// =============================================================================
// Core Proxy Creation
// =============================================================================

function createObservableProxyInternal<T extends object>(
  target: T,
  path: string,
  context: ProxyContext<T>,
): T {
  // Check if this exact object is already proxied for this context
  const contextRegistry = getContextRegistry(target);
  const existing = contextRegistry.get(context as unknown as ProxyContext<object>);
  if (existing) {
    // Return existing proxy - note: shared objects will use the first path they were accessed from
    // This is intentional to avoid duplicate event dispatching
    return existing.proxy as T;
  }

  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      // Handle internal markers
      if (prop === PROXY_MARKER) return true;
      if (prop === ORIGINAL_TARGET) return obj;

      // Pass through symbols
      if (typeof prop === 'symbol') {
        return Reflect.get(obj, prop, receiver);
      }

      const value = Reflect.get(obj, prop, receiver);

      // Intercept array mutating methods
      if (Array.isArray(obj) && isArrayMutator(prop)) {
        return createArrayMethodInterceptor(obj, prop, path, context);
      }

      // Lazy proxy nested objects/arrays
      if (context.options.deep && isProxyable(value)) {
        const nestedPath = path ? `${path}.${prop}` : prop;
        return createObservableProxyInternal(
          value as object,
          nestedPath,
          context as ProxyContext<object>,
        );
      }

      return value;
    },

    set(obj, prop, value, receiver) {
      // Pass through symbols
      if (typeof prop === 'symbol') {
        return Reflect.set(obj, prop, value, receiver);
      }

      const oldValue = Reflect.get(obj, prop, receiver);

      // Skip if value unchanged (shallow equality)
      if (Object.is(oldValue, value)) {
        return true;
      }

      // Capture previous state before mutation (from original, not proxy)
      const propPath = path ? `${path}.${prop}` : prop;
      const previousState = cloneForComparison(
        context.originalRoot,
        context.options.cloneStrategy,
        propPath,
      );

      const success = Reflect.set(obj, prop, value, receiver);

      if (success) {
        // Dispatch path-specific event
        context.eventTarget.dispatchEvent({
          type: `update:${propPath}` as keyof ObservableEventMap<T> & string,
          detail: {
            value,
            current: context.originalRoot,
            previous: previousState,
          },
        } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);

        // Dispatch top-level update event
        context.eventTarget.dispatchEvent({
          type: 'update' as keyof ObservableEventMap<T> & string,
          detail: {
            current: context.originalRoot,
            previous: previousState,
          },
        } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);
      }

      return success;
    },

    deleteProperty(obj, prop) {
      // Pass through symbols
      if (typeof prop === 'symbol') {
        return Reflect.deleteProperty(obj, prop);
      }

      const propPath = path ? `${path}.${String(prop)}` : String(prop);
      const previousState = cloneForComparison(
        context.originalRoot,
        context.options.cloneStrategy,
        propPath,
      );

      const success = Reflect.deleteProperty(obj, prop);

      if (success) {
        // Dispatch path-specific event
        context.eventTarget.dispatchEvent({
          type: `update:${propPath}` as keyof ObservableEventMap<T> & string,
          detail: {
            value: undefined,
            current: context.originalRoot,
            previous: previousState,
          },
        } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);

        // Dispatch top-level update event
        context.eventTarget.dispatchEvent({
          type: 'update' as keyof ObservableEventMap<T> & string,
          detail: {
            current: context.originalRoot,
            previous: previousState,
          },
        } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);
      }

      return success;
    },
  });

  // Register the proxy
  contextRegistry.set(context as unknown as ProxyContext<object>, {
    proxy,
    path,
  });

  return proxy;
}

// =============================================================================
// EventTarget Forwarding
// =============================================================================

/** Duck-type check for EventTarget */
function isEventTarget(obj: unknown): obj is MinimalEventTarget {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as MinimalEventTarget).addEventListener === 'function' &&
    typeof (obj as MinimalEventTarget).removeEventListener === 'function' &&
    typeof (obj as MinimalEventTarget).dispatchEvent === 'function'
  );
}

/**
 * Sets up event forwarding from a source EventTarget to an Eventful target.
 *
 * This function enables integration between DOM EventTargets and Eventful targets.
 * When listeners are added to the target, corresponding forwarding handlers are
 * automatically registered on the source. Update events are not forwarded to
 * prevent circular event loops.
 *
 * @template T - The object type whose events are being forwarded.
 * @param source - The DOM EventTarget to forward events from.
 * @param target - The Eventful target to forward events to.
 * @returns A cleanup function that removes all forwarding handlers when called.
 *
 * @example
 * ```typescript
 * const domElement = document.getElementById('my-element');
 * const events = createEventTarget<{ click: MouseEvent; focus: FocusEvent }>();
 *
 * const cleanup = setupEventForwarding(domElement, events);
 *
 * // When you add listeners to events, they will receive events from domElement
 * events.addEventListener('click', (event) => {
 *   console.log('Click received via forwarding');
 * });
 *
 * // Stop forwarding when done
 * cleanup();
 * ```
 */
export function setupEventForwarding<T extends object>(
  source: MinimalEventTarget,
  target: EventTargetLike<ObservableEventMap<T>>,
): () => void {
  const handlers = new Map<string, (event: unknown) => void>();

  const forwardHandler = (type: string) => (event: unknown) => {
    const detail = (event as MinimalCustomEvent).detail ?? event;
    target.dispatchEvent({
      type: type as keyof ObservableEventMap<T> & string,
      detail,
    } as EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>);
  };

  // Save original method reference without mutating target
  const originalAddEventListener = target.addEventListener.bind(target);

  // Create a wrapped addEventListener that also sets up forwarding
  const wrappedAddEventListener = ((
    type: string,
    listener: (event: EventfulEvent<unknown>) => void | Promise<void>,
    options?: unknown,
  ) => {
    // Forward non-update events from source (lazily, once per type)
    if (!handlers.has(type) && type !== 'update' && !type.startsWith('update:')) {
      const handler = forwardHandler(type);
      handlers.set(type, handler);
      source.addEventListener(type, handler);
    }
    return originalAddEventListener(
      type as keyof ObservableEventMap<T> & string,
      listener as (
        event: EventfulEvent<ObservableEventMap<T>[keyof ObservableEventMap<T>]>,
      ) => void,
      options as Parameters<typeof originalAddEventListener>[2],
    );
  }) as typeof target.addEventListener;

  // Replace the addEventListener method
  (target as { addEventListener: typeof wrappedAddEventListener }).addEventListener =
    wrappedAddEventListener;

  return () => {
    // Restore original addEventListener
    (target as { addEventListener: typeof originalAddEventListener }).addEventListener =
      originalAddEventListener;
    // Clean up all forwarding handlers
    for (const [type, handler] of handlers) {
      source.removeEventListener(type, handler);
    }
    handlers.clear();
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Checks if an object is an observed proxy created by createObservableProxy.
 *
 * Use this to determine whether an object is being tracked for changes.
 * Useful for conditional logic or debugging.
 *
 * @param obj - The object to check.
 * @returns True if the object is an observed proxy, false otherwise.
 *
 * @example
 * ```typescript
 * const original = { count: 0 };
 * const state = createEventTarget(original, { observe: true });
 *
 * console.log(isObserved(original)); // false
 * console.log(isObserved(state));    // true
 * ```
 */
export function isObserved(obj: unknown): boolean {
  return isProxied(obj);
}

/**
 * Retrieves the original unproxied object from an observed proxy.
 *
 * When you pass an object to createEventTarget with observe: true, a Proxy
 * wrapper is created. This function returns the underlying original object,
 * which is useful when you need direct access without triggering events.
 *
 * @template T - The object type.
 * @param proxy - The observed proxy (or any object).
 * @returns The original unproxied object. If the input is not a proxy, returns it unchanged.
 *
 * @example
 * ```typescript
 * const original = { count: 0 };
 * const state = createEventTarget(original, { observe: true });
 *
 * // state is a Proxy wrapping original
 * const unwrapped = getOriginal(state);
 *
 * console.log(unwrapped === original); // true
 * console.log(unwrapped === state);    // false
 * ```
 *
 * @example Passing to external APIs that don't work with Proxies
 * ```typescript
 * const data = createEventTarget({ items: [] }, { observe: true });
 *
 * // Some serialization libraries have issues with Proxies
 * const json = JSON.stringify(getOriginal(data));
 * ```
 */
export function getOriginal<T extends object>(proxy: T): T {
  if (!isProxied(proxy)) {
    return proxy;
  }
  return (proxy as Record<symbol, T>)[ORIGINAL_TARGET] ?? proxy;
}

/**
 * Creates an observable proxy that dispatches events when properties change.
 *
 * This function wraps an object in a Proxy that tracks all property modifications,
 * including nested objects and array mutations. Events are dispatched to the
 * provided event target for each change.
 *
 * Note: This is typically called internally by createEventTarget with observe: true.
 * You usually don't need to call this directly.
 *
 * @template T - The object type being observed.
 * @param target - The object to observe.
 * @param eventTarget - The event target to dispatch change events to.
 * @param options - Optional configuration for observation behavior.
 * @returns A proxied version of the target that dispatches events on changes.
 *
 * @example Direct usage (advanced)
 * ```typescript
 * import { createEventTarget, createObservableProxy } from 'event-emission';
 *
 * type State = { count: number };
 * const eventTarget = createEventTarget<ObservableEventMap<State>>();
 * const original = { count: 0 };
 *
 * const state = createObservableProxy(original, eventTarget, {
 *   deep: true,
 *   cloneStrategy: 'path',
 * });
 *
 * eventTarget.addEventListener('update', (event) => {
 *   console.log('State changed:', event.detail);
 * });
 *
 * state.count = 1; // Triggers 'update' and 'update:count' events
 * ```
 *
 * @example Typical usage via createEventTarget
 * ```typescript
 * const state = createEventTarget({ count: 0 }, { observe: true });
 *
 * state.addEventListener('update:count', (event) => {
 *   console.log('Count changed to:', event.detail.value);
 * });
 *
 * state.count = 1; // Triggers the event
 * ```
 */
export function createObservableProxy<T extends object>(
  target: T,
  eventTarget: EventTargetLike<ObservableEventMap<T>>,
  options?: ObserveOptions,
): T {
  const resolvedOptions: Required<ObserveOptions> = {
    deep: options?.deep ?? true,
    cloneStrategy: options?.cloneStrategy ?? 'path',
  };

  const context: ProxyContext<T> = {
    eventTarget,
    originalRoot: target, // Keep reference to original, never the proxy
    options: resolvedOptions,
  };

  const proxy = createObservableProxyInternal(target, '', context);

  // Set up event forwarding if target is already an EventTarget
  if (isEventTarget(target)) {
    setupEventForwarding(target as unknown as MinimalEventTarget, eventTarget);
  }

  return proxy;
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment */
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */
