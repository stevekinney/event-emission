import { createEventTarget } from './factory';
import type {
  DOMEventLike,
  DOMEventTargetLike,
  EmissionEvent,
  EventTargetLike,
  InteropOptions,
} from './types';

export type { DOMEventLike, DOMEventTargetLike, InteropOptions } from './types';

/**
 * Forward events from an EventEmission target to a DOM EventTarget.
 *
 * This function sets up a wildcard listener on the source that forwards
 * all events to the DOM target using dispatchEvent.
 *
 * @template E - Event map type of the source.
 * @param source - The EventEmission source to forward events from.
 * @param target - The DOM EventTarget to forward events to.
 * @param options - Optional configuration including abort signal.
 * @returns An unsubscribe function that stops forwarding when called.
 *
 * @example
 * ```typescript
 * const events = createEventTarget<{ click: { x: number; y: number } }>();
 * const button = document.getElementById('my-button');
 *
 * // Forward all events to the DOM button
 * const unsubscribe = forwardToEventTarget(events, button);
 *
 * // Now when you dispatch events on the EventEmission target,
 * // they will also be dispatched on the DOM element
 * events.dispatchEvent({ type: 'click', detail: { x: 100, y: 200 } });
 *
 * // Stop forwarding
 * unsubscribe();
 * ```
 */
export function forwardToEventTarget<E extends Record<string, unknown>>(
  source: EventTargetLike<E>,
  target: DOMEventTargetLike,
  options?: InteropOptions,
): () => void {
  const unsubscribe = source.addWildcardListener(
    '*',
    (event) => {
      // Use CustomEvent when available to preserve DOM event semantics.
      const CustomEventCtor = (globalThis as { CustomEvent?: typeof CustomEvent })
        .CustomEvent;
      const domEvent: DOMEventLike =
        typeof CustomEventCtor === 'function'
          ? new CustomEventCtor(event.originalType, {
              detail: event.detail,
              bubbles: event.bubbles,
              cancelable: event.cancelable,
              composed: event.composed,
            })
          : {
              type: event.originalType,
              detail: event.detail,
              bubbles: event.bubbles,
              cancelable: event.cancelable,
              composed: event.composed,
            };
      target.dispatchEvent(domEvent);
    },
    options,
  );

  return unsubscribe;
}

/**
 * Options for creating an EventEmission target from a DOM EventTarget.
 */
export interface FromEventTargetOptions extends InteropOptions {
  /**
   * Callback invoked when a listener throws an error.
   * If not provided, errors will be re-thrown.
   */
  onListenerError?: (type: string, error: unknown) => void;
}

/**
 * Create an EventEmission target that listens to events from a DOM EventTarget.
 *
 * This function wraps a DOM EventTarget and forwards specified events to a new
 * EventEmission target, enabling type-safe event handling and TC39 Observable compatibility.
 *
 * @template E - Event map type where keys are event names and values are event detail types.
 * @param domTarget - The DOM EventTarget to listen to events from.
 * @param eventTypes - Array of event type names to forward from the DOM target.
 * @param options - Optional configuration including abort signal and error handler.
 * @returns An EventEmission target with a destroy() method for cleanup.
 *
 * @example Basic usage with DOM element
 * ```typescript
 * const button = document.getElementById('my-button');
 *
 * type ButtonEvents = {
 *   click: MouseEvent;
 *   focus: FocusEvent;
 * };
 *
 * const events = fromEventTarget<ButtonEvents>(button, ['click', 'focus']);
 *
 * // Type-safe event handling
 * events.addEventListener('click', (event) => {
 *   console.log('Button clicked!', event.detail);
 * });
 *
 * // Clean up when done
 * events.destroy();
 * ```
 *
 * @example With AbortSignal for automatic cleanup
 * ```typescript
 * const controller = new AbortController();
 * const events = fromEventTarget<{ input: InputEvent }>(
 *   textField,
 *   ['input'],
 *   { signal: controller.signal }
 * );
 *
 * // Later, abort to clean up all listeners
 * controller.abort();
 * ```
 *
 * @example Using TC39 Observable features
 * ```typescript
 * const events = fromEventTarget<{ scroll: Event }>(window, ['scroll']);
 *
 * // Subscribe with observer pattern
 * const subscription = events.subscribe({
 *   next: (event) => console.log('Scrolled!'),
 *   complete: () => console.log('Done'),
 * });
 *
 * // Or use async iteration
 * for await (const event of events.events('scroll')) {
 *   console.log('Scroll event:', event);
 * }
 * ```
 */
export function fromEventTarget<E extends Record<string, unknown>>(
  domTarget: DOMEventTargetLike,
  eventTypes: Array<keyof E & string>,
  options?: FromEventTargetOptions,
): EventTargetLike<E> & { destroy: () => void } {
  const emitter = createEventTarget<E>({
    onListenerError: options?.onListenerError,
  });

  const handlers = new Map<string, (event: DOMEventLike) => void>();

  for (const type of eventTypes) {
    const handler = (event: DOMEventLike) => {
      emitter.dispatchEvent({
        type,
        detail: (event.detail ?? event) as E[typeof type],
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        composed: event.composed,
      } as unknown as EmissionEvent<E[keyof E & string]>);
    };
    handlers.set(type, handler);
    domTarget.addEventListener(type, handler);
  }

  // Track abort handler for cleanup
  let onAbort: (() => void) | null = null;

  // Handle abort signal
  if (options?.signal) {
    onAbort = () => {
      for (const [type, handler] of handlers) {
        domTarget.removeEventListener(type, handler);
      }
      handlers.clear();
      emitter.complete();
    };
    options.signal.addEventListener('abort', onAbort, { once: true });
    if (options.signal.aborted) onAbort();
  }

  return {
    addEventListener: emitter.addEventListener,
    removeEventListener: emitter.removeEventListener,
    dispatchEvent: emitter.dispatchEvent,
    clear: emitter.clear,
    once: emitter.once,
    removeAllListeners: emitter.removeAllListeners,
    pipe: emitter.pipe,
    addWildcardListener: emitter.addWildcardListener,
    removeWildcardListener: emitter.removeWildcardListener,
    on: emitter.on,
    subscribe: emitter.subscribe,
    toObservable: emitter.toObservable,
    complete: emitter.complete,
    get completed() {
      return emitter.completed;
    },
    events: emitter.events,
    destroy: () => {
      // Clean up abort signal listener to prevent memory leak
      if (options?.signal && onAbort) {
        options.signal.removeEventListener('abort', onAbort);
      }
      for (const [type, handler] of handlers) {
        domTarget.removeEventListener(type, handler);
      }
      handlers.clear();
      emitter.complete();
    },
  };
}

/**
 * Pipe events from one EventEmission target to another.
 *
 * This function sets up a wildcard listener on the source that forwards all
 * events to the target. Useful for composing event streams, creating event
 * buses, or building hierarchical event systems.
 *
 * @template E - Event map type shared by both source and target.
 * @param source - The EventEmission target to pipe events from.
 * @param target - The EventEmission target to pipe events to.
 * @param options - Optional configuration including abort signal.
 * @returns An unsubscribe function that stops piping when called.
 *
 * @example Basic event piping
 * ```typescript
 * const userEvents = createEventTarget<{ login: { userId: string } }>();
 * const globalBus = createEventTarget<{ login: { userId: string } }>();
 *
 * // Pipe all user events to global bus
 * const unsubscribe = pipe(userEvents, globalBus);
 *
 * // Events on userEvents now also dispatch on globalBus
 * globalBus.addEventListener('login', (event) => {
 *   console.log('User logged in:', event.detail.userId);
 * });
 *
 * userEvents.dispatchEvent({ type: 'login', detail: { userId: '123' } });
 *
 * // Stop piping
 * unsubscribe();
 * ```
 *
 * @example With AbortSignal for automatic cleanup
 * ```typescript
 * const controller = new AbortController();
 * pipe(source, target, { signal: controller.signal });
 *
 * // Later, abort to stop piping
 * controller.abort();
 * ```
 *
 * @example Creating an event hierarchy
 * ```typescript
 * const componentA = createEventTarget<Events>();
 * const componentB = createEventTarget<Events>();
 * const appBus = createEventTarget<Events>();
 *
 * // Both components pipe to the app bus
 * pipe(componentA, appBus);
 * pipe(componentB, appBus);
 *
 * // Listen to all events at the app level
 * appBus.addWildcardListener('*', (event) => {
 *   console.log('App event:', event.originalType, event.detail);
 * });
 * ```
 */
export function pipe<E extends Record<string, unknown>>(
  source: EventTargetLike<E>,
  target: EventTargetLike<E>,
  options?: InteropOptions,
): () => void {
  return source.addWildcardListener(
    '*',
    (event) => {
      target.dispatchEvent({
        type: event.originalType,
        detail: event.detail as E[keyof E & string],
      } as unknown as Parameters<typeof target.dispatchEvent>[0]);
    },
    options,
  );
}
