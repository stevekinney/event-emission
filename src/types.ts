import { SymbolObservable } from './symbols';

// Declare queueMicrotask globally so we don't require DOM lib
// This is available in Node.js and all modern browsers
declare global {
  function queueMicrotask(callback: () => void): void;
}

/**
 * Event structure passed to listeners.
 */
export interface EventfulEvent<Detail> {
  /** The event type identifier. */
  type: string;
  /** The event payload data. */
  detail: Detail;
}

/**
 * Event passed to wildcard listeners, includes the original event type.
 */
export interface WildcardEvent<E extends Record<string, unknown>> {
  type: '*' | `${string}:*`;
  originalType: keyof E & string;
  detail: E[keyof E];
}

/**
 * Minimal AbortSignal lookalike so consumers do not need DOM libs.
 */
export interface MinimalAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener: (type: 'abort', listener: () => void, options?: unknown) => void;
  removeEventListener: (type: 'abort', listener: () => void, options?: unknown) => void;
}

/**
 * Options for addEventListener.
 */
export type AddEventListenerOptionsLike = {
  once?: boolean;
  signal?: MinimalAbortSignal;
};

/**
 * TC39 Observable observer interface.
 */
export interface Observer<T> {
  next?: (value: T) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

/**
 * TC39 Observable subscription interface.
 */
export interface Subscription {
  unsubscribe(): void;
  readonly closed: boolean;
}

/**
 * TC39 Observable-like interface.
 */
export interface ObservableLike<T> {
  subscribe(
    observerOrNext?: Observer<T> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Subscription;
  [SymbolObservable](): ObservableLike<T>;
}

/**
 * Overflow strategy for async iterator buffer.
 */
export type OverflowStrategy = 'drop-oldest' | 'drop-latest' | 'throw';

/**
 * Options for the events() async iterator.
 */
export interface AsyncIteratorOptions {
  signal?: MinimalAbortSignal;
  bufferSize?: number;
  overflowStrategy?: OverflowStrategy;
}

/**
 * Options for the events() async iterator (alias for AsyncIteratorOptions).
 */
export type EventsIteratorOptions = AsyncIteratorOptions;

/**
 * Options for interop helpers.
 */
export interface InteropOptions {
  signal?: MinimalAbortSignal;
}

/**
 * Minimal DOM Event interface for interop.
 */
export interface DOMEventLike {
  type: string;
  detail?: unknown;
}

/**
 * Minimal DOM EventTarget interface for interop.
 */
export interface DOMEventTargetLike {
  addEventListener(type: string, listener: (event: DOMEventLike) => void): void;
  removeEventListener(type: string, listener: (event: DOMEventLike) => void): void;
  dispatchEvent(event: DOMEventLike): boolean;
}

/**
 * Internal listener record type.
 */
export type Listener<E> = {
  fn: (event: EventfulEvent<E>) => void | Promise<void>;
  once?: boolean;
  signal?: MinimalAbortSignal;
  abortHandler?: () => void;
};

/**
 * Internal wildcard listener record type.
 */
export type WildcardListener<E extends Record<string, unknown>> = {
  fn: (event: WildcardEvent<E>) => void | Promise<void>;
  pattern: '*' | `${string}:*`;
  once?: boolean;
  signal?: MinimalAbortSignal;
  abortHandler?: () => void;
};

/**
 * Type-safe event target interface compatible with DOM EventTarget
 * and TC39 Observable patterns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any for flexibility
export interface EventTargetLike<E extends Record<string, any>> {
  addEventListener: <K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
    options?: AddEventListenerOptionsLike,
  ) => () => void;
  removeEventListener: <K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
  ) => void;
  dispatchEvent: <K extends keyof E & string>(event: EventfulEvent<E[K]>) => boolean;
  clear: () => void;

  // Ergonomics
  once: <K extends keyof E & string>(
    type: K,
    listener: (event: EventfulEvent<E[K]>) => void | Promise<void>,
    options?: Omit<AddEventListenerOptionsLike, 'once'>,
  ) => () => void;
  removeAllListeners: <K extends keyof E & string>(type?: K) => void;
  /**
   * Pipe events from this emitter to another target.
   * Note: Only forwards events for types that have listeners when pipe() is called.
   * Events for types registered after piping won't be forwarded automatically.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
  pipe: <T extends Record<string, any>>(
    target: EventTargetLike<T>,
    mapFn?: <K extends keyof E & string>(
      event: EventfulEvent<E[K]>,
    ) => EventfulEvent<T[keyof T & string]> | null,
  ) => () => void;
  complete: () => void;
  readonly completed: boolean;

  // Wildcard support
  addWildcardListener: (
    pattern: '*' | `${string}:*`,
    listener: (event: WildcardEvent<E>) => void | Promise<void>,
    options?: AddEventListenerOptionsLike,
  ) => () => void;
  removeWildcardListener: (
    pattern: '*' | `${string}:*`,
    listener: (event: WildcardEvent<E>) => void | Promise<void>,
  ) => void;

  // Observable interop
  subscribe: <K extends keyof E & string>(
    type: K,
    observerOrNext?:
      | Observer<EventfulEvent<E[K]>>
      | ((value: EventfulEvent<E[K]>) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ) => Subscription;
  toObservable: () => ObservableLike<EventfulEvent<E[keyof E]>>;

  // Async iterator
  events: <K extends keyof E & string>(
    type: K,
    options?: AsyncIteratorOptions,
  ) => AsyncIterableIterator<EventfulEvent<E[K]>>;
}
