/**
 * event-emission
 *
 * Lightweight typed event emitter with DOM EventTarget
 * and TC39 Observable compatibility.
 *
 * @packageDocumentation
 */

// Re-export from symbols
export { SymbolObservable } from './symbols';

// Augment the global Symbol interface to include observable
declare global {
  interface SymbolConstructor {
    readonly observable: symbol;
  }
}

// Re-export types
export type {
  AddEventListenerOptionsLike,
  AsyncIteratorOptions,
  DispatchEventInput,
  DOMEventLike,
  DOMEventTargetLike,
  EmissionEvent,
  EventListenerLike,
  EventListenerObject,
  EventListenerOptionsLike,
  EventsIteratorOptions,
  EventTargetLike,
  InteropOptions,
  Listener,
  MinimalAbortSignal,
  ObservableLike,
  Observer,
  OverflowStrategy,
  Subscription,
  WildcardEvent,
  WildcardListener,
} from './types';

// Re-export errors
export { BufferOverflowError } from './errors';

// Re-export factory and options types
export type {
  CreateEventTargetObserveOptions,
  CreateEventTargetOptions,
} from './factory';
export { createEventTarget } from './factory';

// Re-export observation utilities and types
export type {
  ArrayMutationDetail,
  ArrayMutationMethod,
  ObservableEventMap,
  ObserveOptions,
  PropertyChangeDetail,
} from './observe';
export {
  getOriginal,
  isObserved,
  ORIGINAL_TARGET,
  PROXY_MARKER,
  setupEventForwarding,
} from './observe';

// Re-export Observable
export type {
  Subscriber,
  SubscriptionObserverInterface as SubscriptionObserver,
} from './observable';
export { Observable } from './observable';

// Re-export interop
export type { FromEventTargetOptions } from './interop';
export { forwardToEventTarget, fromEventTarget, pipe } from './interop';

// Re-export EventEmission class
export { EventEmission } from './event-emission';
