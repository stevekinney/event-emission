import { SymbolObservable } from './symbols';

// Declare queueMicrotask globally so we don't require DOM lib
// This is available in Node.js and all modern browsers
declare global {
  function queueMicrotask(callback: () => void): void;
}

/**
 * Event structure passed to listeners.
 * Matches the shape of a DOM CustomEvent to ensure compatibility.
 */
export interface EmissionEvent<Detail, Type extends string = string> {
  /** The event type identifier. */
  readonly type: Type;
  /** The event payload data. */
  readonly detail: Detail;

  /** DOM Event compatibility: true if the event bubbles. */
  readonly bubbles: boolean;
  /** DOM Event compatibility: true if the event can be cancelled. */
  readonly cancelable: boolean;
  /** DOM Event compatibility: legacy alias for stopPropagation(). */
  cancelBubble: boolean;
  /** DOM Event compatibility: true if the event can cross Shadow DOM boundaries. */
  readonly composed: boolean;
  /** DOM Event compatibility: the object currently processing the event. */
  readonly currentTarget: unknown;
  /** DOM Event compatibility: true if preventDefault() has been called. */
  readonly defaultPrevented: boolean;
  /** DOM Event compatibility: the current phase of event propagation. */
  readonly eventPhase: number;
  /** DOM Event compatibility: true if the event was dispatched by the user agent. */
  readonly isTrusted: boolean;
  /** DOM Event compatibility: legacy alias for defaultPrevented. */
  returnValue: boolean;
  /** DOM Event compatibility: legacy alias for target. */
  readonly srcElement: unknown;
  /** DOM Event compatibility: the object that originally dispatched the event. */
  readonly target: unknown;
  /** DOM Event compatibility: the time at which the event was created. */
  readonly timeStamp: number;

  /** DOM Event compatibility: returns the path of nodes the event will travel through. */
  composedPath(): unknown[];
  /** DOM Event compatibility: legacy initializer. */
  initEvent(type: string, bubbles?: boolean, cancelable?: boolean): void;
  /** DOM Event compatibility: cancels the event if it is cancelable. */
  preventDefault(): void;
  /** DOM Event compatibility: prevents other listeners from being called. */
  stopImmediatePropagation(): void;
  /** DOM Event compatibility: prevents further propagation of the event. */
  stopPropagation(): void;

  // Event constants
  readonly NONE: 0;
  readonly CAPTURING_PHASE: 1;
  readonly AT_TARGET: 2;
  readonly BUBBLING_PHASE: 3;
}

/**
 * Event passed to wildcard listeners, includes the original event type.
 */
export interface WildcardEvent<E extends Record<string, unknown>> extends EmissionEvent<
  E[keyof E],
  '*' | `${string}:*`
> {
  readonly type: '*' | `${string}:*`;
  readonly originalType: keyof E & string;
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
export interface EventListenerOptionsLike {
  capture?: boolean;
}

/**
 * Options for addEventListener.
 */
export type AddEventListenerOptionsLike = EventListenerOptionsLike & {
  once?: boolean;
  passive?: boolean;
  signal?: MinimalAbortSignal;
};

/**
 * EventListener-like callback (function or object with handleEvent).
 */
export type EventListenerObject<T> = {
  handleEvent: (event: T) => void | Promise<void>;
};

export type EventListenerLike<T> =
  | ((event: T) => void | Promise<void>)
  | EventListenerObject<T>;

/**
 * Minimal event input accepted by dispatchEvent.
 */
export type DispatchEventInput<Detail, Type extends string = string> = {
  type: Type;
  detail: Detail;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
};

/**
 * TC39 Observable observer interface.
 */
export interface Observer<T> {
  start?: (subscription: Subscription) => void;
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
 * Options for interoperability helpers.
 */
export interface InteropOptions {
  signal?: MinimalAbortSignal;
}

/**
 * Minimal DOM Event interface for interoperability.
 */
export interface DOMEventLike {
  type: string;
  detail?: unknown;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
  defaultPrevented?: boolean;
}

/**
 * Minimal DOM EventTarget interface for interoperability.
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
  type: string;
  original: EventListenerLike<EmissionEvent<E>>;
  callback: (event: EmissionEvent<E>) => void | Promise<void>;
  capture: boolean;
  passive: boolean;
  once: boolean;
  signal?: MinimalAbortSignal | null;
  removed: boolean;
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
 * Options for the on() method.
 */
export interface OnOptions extends AddEventListenerOptionsLike {
  /** Listen for an "error" event and send it to the observer's error method. */
  receiveError?: boolean;
  /** Handler function called before the event is dispatched to observers. */
  handler?: (event: EmissionEvent<unknown>) => void;
}

/**
 * Type-safe event target interface compatible with DOM EventTarget
 * and TC39 Observable patterns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any for flexibility
export interface EventTargetLike<E extends Record<string, any>> {
  addEventListener: <K extends keyof E & string>(
    type: K,
    listener: EventListenerLike<EmissionEvent<E[K], K>> | null,
    options?: AddEventListenerOptionsLike | boolean,
  ) => () => void;
  removeEventListener: <K extends keyof E & string>(
    type: K,
    listener: EventListenerLike<EmissionEvent<E[K], K>> | null,
    options?: EventListenerOptionsLike | boolean,
  ) => void;
  dispatchEvent: <K extends keyof E & string>(
    event: DispatchEventInput<E[K], K> | DOMEventLike,
  ) => boolean;
  clear: () => void;

  // Ergonomics
  on: <K extends keyof E & string>(
    type: K,
    options?: OnOptions | boolean,
  ) => ObservableLike<EmissionEvent<E[K], K>>;
  once: <K extends keyof E & string>(
    type: K,
    listener: EventListenerLike<EmissionEvent<E[K], K>> | null,
    options?: Omit<AddEventListenerOptionsLike, 'once'> | boolean,
  ) => () => void;
  removeAllListeners: <K extends keyof E & string>(type?: K) => void;
  /**
   * Pipe events from this emitter to another target.
   * Forwards all events. If mapFn returns null, the event is skipped.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any
  pipe: <T extends Record<string, any>>(
    target: EventTargetLike<T>,
    mapFn?: <K extends keyof E & string>(
      event: EmissionEvent<E[K], K>,
    ) => DispatchEventInput<T[keyof T & string], keyof T & string> | null,
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

  // Observable interoperability
  subscribe: <K extends keyof E & string>(
    type: K,
    observerOrNext?:
      | Observer<EmissionEvent<E[K], K>>
      | ((value: EmissionEvent<E[K], K>) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ) => Subscription;
  toObservable: () => ObservableLike<EmissionEvent<E[keyof E]>>;

  // Async iterator
  events: <K extends keyof E & string>(
    type: K,
    options?: AsyncIteratorOptions,
  ) => AsyncIterableIterator<EmissionEvent<E[K], K>>;
}
