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
  EmissionEvent,
  EventListenerLike,
  EventListenerObject,
  EventListenerOptionsLike,
  EventsIteratorOptions,
  EventTargetLike,
  Listener,
  MinimalAbortSignal,
  OverflowStrategy,
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

// Re-export EventEmission class
export { EventEmission } from './event-emission';
