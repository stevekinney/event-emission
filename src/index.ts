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
  DOMEventLike,
  DOMEventTargetLike,
  EventfulEvent,
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

// Re-export interop
export type { FromEventTargetOptions } from './interop';
export { forwardToEventTarget, fromEventTarget, pipe } from './interop';

// Re-export Eventful class
export { Eventful } from './eventful';
