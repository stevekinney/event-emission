# Event Emission

**Event Emission** is a high-performance, type-safe event primitive designed to bridge the gap between three worlds: DOM `EventTarget`, TC39 `Observable`, and `AsyncIterator`. While standard event emitters often force you into a single consumption pattern, **Event Emission** gives you the freedom to dispatch once and consume however your logic demands—whether that's standard callbacks, reactive pipelines via RxJS, or clean `for await...of` loops. By treating events as a first-class, composable primitive rather than just a side-effect, it eliminates race conditions and shared mutable state, providing a unified, zero-dependency foundation for building resilient, concurrent applications in modern JavaScript and TypeScript environments.

A lightweight, zero-dependency, type-safe event system with DOM EventTarget ergonomics and TC39 Observable interoperability. Use one event source with callbacks, async iterators, and RxJS without losing TypeScript safety.

## Tasting notes

- **Typed events** - Event maps keep payloads and event names in sync
- **DOM compatible** - `EmissionEvent` is a superset of the built-in `Event`
- **Familiar API** - `addEventListener`, `removeEventListener`, `dispatchEvent`
- **TC39 Observable** - Fully compliant `Observable` implementation (passes all `es-observable-tests`)
- **Async iteration** - `for await...of` over events with backpressure options
- **Wildcard listeners** - Listen to `*` or namespaced `user:*` patterns
- **Observable state** - Proxy any object and emit change events automatically
- **AbortSignal support** - Cleanup with AbortController
- **No dependencies** - Framework-agnostic, works in Node, Bun, and browsers

## When to use it

- Typed app-level event buses
- Bridging DOM events to RxJS pipelines
- State objects that emit change events for UI updates
- Component/service emitters without stringly-typed payloads

## Installation

```bash
npm install event-emission
# or
bun add event-emission
# or
pnpm add event-emission
```

## Quick start

```typescript
import { createEventTarget } from 'event-emission';

type UserEvents = {
  'user:login': { userId: string; timestamp: Date };
  'user:logout': { userId: string };
  error: Error;
};

const events = createEventTarget<UserEvents>();

events.addEventListener('user:login', (event) => {
  console.log(`User ${event.detail.userId} logged in at ${event.detail.timestamp}`);
});

events.dispatchEvent({
  type: 'user:login',
  detail: { userId: '123', timestamp: new Date() },
});
```

## Core concepts

- **Event map**: a TypeScript type that maps event names to payload types.
- **Event shape**: `{ type: string; detail: Payload }` for all listeners.
- **Unsubscribe**: `addEventListener` returns a function to remove the listener.

## API overview

- `createEventTarget<E>(options?)`
- `createEventTarget(target, { observe: true, ... })`
- `EventEmission<E>` base class
- `Observable<T>` compliant implementation
- Interop: `fromEventTarget`, `forwardToEventTarget`, `pipe`
- Utilities: `isObserved`, `getOriginal`

## createEventTarget

### `createEventTarget<E>(options?)`

Creates a typed event target.

```typescript
type Events = {
  message: { text: string };
  error: Error;
};

const target = createEventTarget<Events>();
```

#### Options

| Option            | Type                                     | Description                                  |
| ----------------- | ---------------------------------------- | -------------------------------------------- |
| `onListenerError` | `(type: string, error: unknown) => void` | Custom error handler for listener exceptions |

If a listener throws and no `onListenerError` is provided, an `error` event is emitted. If there are no `error` listeners, the error is re-thrown.

### Observable state

Create state objects that emit change events:

```typescript
const state = createEventTarget({ count: 0, user: { name: 'Ada' } }, { observe: true });

state.addEventListener('update', (event) => {
  console.log('State changed:', event.detail.current);
});

state.addEventListener('update:count', (event) => {
  console.log(
    `Count changed from ${event.detail.previous.count} to ${event.detail.value}`,
  );
});

state.count = 1; // Triggers 'update' and 'update:count'
state.user.name = 'Grace'; // Triggers 'update' and 'update:user.name'
```

**Observe options:**

| Option          | Type                            | Default  | Description                        |
| --------------- | ------------------------------- | -------- | ---------------------------------- |
| `observe`       | `boolean`                       | `false`  | Enable property change observation |
| `deep`          | `boolean`                       | `true`   | Observe nested objects             |
| `cloneStrategy` | `'shallow' \| 'deep' \| 'path'` | `'path'` | How to clone previous state        |

**Update event details:**

- `update` and `update:path` events include `{ value, current, previous }`.
- Array mutators emit method events like `update:items.push` with `{ method, args, added, removed, current, previous }`.

## Event listeners

### `on(type, options?)`

Creates an `Observable` for a specific event type. This follows the `ObservableEventTarget` proposal, allowing for powerful composition.

```typescript
const clicks = button.on('click', { passive: true });

clicks.subscribe((event) => {
  console.log('Clicked!', event.detail);
});
```

**Options:**

| Option         | Type          | Default | Description                                                                            |
| -------------- | ------------- | ------- | -------------------------------------------------------------------------------------- |
| `receiveError` | `boolean`     | `false` | If true, listen for "error" events and forward them to the observer's error method     |
| `handler`      | `Function`    | `null`  | Optional function to run stateful actions (like `preventDefault()`) before dispatching |
| `once`         | `boolean`     | `false` | If true, the observable completes after the first event is dispatched                  |
| `passive`      | `boolean`     | `false` | Indicates that the callback will not cancel the event                                  |
| `signal`       | `AbortSignal` | -       | Abort signal to remove the listener when aborted                                       |

### `addEventListener(type, listener, options?)`

Adds a listener and returns an unsubscribe function.

```typescript
const unsubscribe = events.addEventListener('message', (event) => {
  console.log(event.detail.text);
});

unsubscribe();
```

**Options:**

| Option   | Type          | Description                                  |
| -------- | ------------- | -------------------------------------------- |
| `once`   | `boolean`     | Remove listener after first invocation       |
| `signal` | `AbortSignal` | Abort signal to remove listener when aborted |

### `once(type, listener, options?)`

Adds a one-time listener.

### `removeEventListener(type, listener)`

Removes a specific listener.

### `removeAllListeners(type?)`

Removes all listeners, or all listeners for a type.

### Wildcard listeners

```typescript
events.addWildcardListener('*', (event) => {
  console.log(`Got ${event.originalType}:`, event.detail);
});

events.addWildcardListener('user:*', (event) => {
  console.log(`User event: ${event.originalType}`);
});
```

Wildcard events include `{ type: pattern, originalType, detail }`.

## Async iteration

You can use `for await...of` to consume events. This is great for stream-processing events with backpressure.

```typescript
// Simple iteration
for await (const event of events.events('message')) {
  console.log('Received:', event.detail.text);
}

// With options for backpressure and cleanup
const iterator = events.events('message', {
  bufferSize: 16,
  overflowStrategy: 'drop-oldest',
  signal: abortController.signal,
});

for await (const event of iterator) {
  // ...
}
```

**Iterator options:**

| Option             | Type                                        | Default         | Description                    |
| ------------------ | ------------------------------------------- | --------------- | ------------------------------ |
| `signal`           | `AbortSignal`                               | -               | Abort signal to stop iteration |
| `bufferSize`       | `number`                                    | `Infinity`      | Maximum buffered events        |
| `overflowStrategy` | `'drop-oldest' \| 'drop-latest' \| 'throw'` | `'drop-oldest'` | Behavior when buffer is full   |

When `overflowStrategy` is `throw`, the iterator throws `BufferOverflowError`.

## Observable interoperability

### `subscribe(type, observer)`

```typescript
const subscription = events.subscribe('message', {
  next: (event) => console.log(event.detail),
  error: (err) => console.error(err),
  complete: () => console.log('Done'),
});

subscription.unsubscribe();
```

### `toObservable()`

Returns an Observable that emits all events.

```typescript
import { from } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const observable = from(events);

observable
  .pipe(
    filter((event) => event.type === 'message'),
    map((event) => event.detail.text),
  )
  .subscribe(console.log);
```

### `Observable` class

A fully compliant implementation of the TC39 Observable proposal.

```typescript
import { Observable } from 'event-emission';

// Create from items
const numbers = Observable.of(1, 2, 3);

// Create from any iterable or observable-like
const fromArray = Observable.from([10, 20, 30]);

// Manual creation
const custom = new Observable((observer) => {
  observer.next('Hello');
  observer.complete();
});
```

## Lifecycle

### `complete()`

Marks the event target as complete, clears listeners, and ends iterators.

### `clear()`

Removes all listeners without marking as complete.

## EventEmission base class

Extend `EventEmission` to build typed emitters:

```typescript
import { EventEmission } from 'event-emission';

class UserService extends EventEmission<{
  'user:created': { id: string; name: string };
  'user:deleted': { id: string };
  error: Error;
}> {
  createUser(name: string) {
    const id = crypto.randomUUID();
    this.dispatchEvent({ type: 'user:created', detail: { id, name } });
    return id;
  }
}
```

## DOM interoperability

### `fromEventTarget(domTarget, eventTypes, options?)`

```typescript
import { fromEventTarget } from 'event-emission';

type ButtonEvents = {
  click: MouseEvent;
  focus: FocusEvent;
};

const button = document.getElementById('my-button');
const events = fromEventTarget<ButtonEvents>(button, ['click', 'focus']);

events.addEventListener('click', (event) => {
  console.log('Button clicked!', event.detail);
});

events.destroy();
```

### `forwardToEventTarget(source, domTarget, options?)`

```typescript
import { createEventTarget, forwardToEventTarget } from 'event-emission';

const events = createEventTarget<{ custom: { value: number } }>();
const element = document.getElementById('target');

const unsubscribe = forwardToEventTarget(events, element);

events.dispatchEvent({ type: 'custom', detail: { value: 42 } });

unsubscribe();
```

### `pipe(source, target, options?)`

```typescript
import { createEventTarget, pipe } from 'event-emission';

const componentEvents = createEventTarget<{ ready: void }>();
const appBus = createEventTarget<{ ready: void }>();

const unsubscribe = pipe(componentEvents, appBus);

unsubscribe();
```

Note: `pipe(source, target)` forwards all events via a wildcard listener. The instance method `events.pipe(target)` only forwards event types that already have listeners when you call it.

## React integration

**Event Emission** works beautifully with React's `useSyncExternalStore` for predictable, race-condition-free state synchronization.

### Observing an event emitter

```typescript
import { useSyncExternalStore } from 'react';
import { createEventTarget } from 'event-emission';

const bus = createEventTarget<{ log: string }>();

function useBusEvent() {
  return useSyncExternalStore(
    (callback) => bus.addEventListener('log', callback),
    () => getLatestLogValue(), // implementation depends on your needs
  );
}
```

### Syncing with Observable State

The `observe` feature is perfect for building high-performance global stores or local controllers that live outside the React render cycle.

```typescript
import { useSyncExternalStore } from 'react';
import { createEventTarget } from 'event-emission';

// 1. Create your store outside of React
const store = createEventTarget(
  { count: 0, lastUpdated: new Date() },
  { observe: true }
);

// 2. Create a generic hook to sync with any observed target
export function useObservable<T extends object>(target: T) {
  return useSyncExternalStore(
    (onStoreChange) => (target as any).addEventListener('update', onStoreChange),
    () => target
  );
}

// 3. Components re-render only when the store actually mutates
function Counter() {
  const state = useObservable(store);
  return (
    <button onClick={() => state.count++}>
      Count is {state.count}
    </button>
  );
}
```

## Svelte integration

**Event Emission** works naturally with Svelte 5 Runes to create reactive stores that live outside your component tree.

### Creating a Reactive Rune

```typescript
import { createEventTarget } from 'event-emission';

// 1. Define your external state
const store = createEventTarget({ count: 0 }, { observe: true });

// 2. Create a generic Rune to sync with any observed target
export function useObservable<T extends object>(target: T) {
  let state = $state(target);

  $effect(() => {
    return (target as any).addEventListener('update', () => {
      state = target; // Trigger Svelte reactivity
    });
  });

  return state;
}

// 3. Use it in your components
const state = useObservable(store);
```

## Utilities

### `isObserved(obj)`

Checks if an object is an observed proxy.

### `getOriginal(proxy)`

Returns the original unproxied object.

## TypeScript types

```typescript
import type {
  EmissionEvent,
  EventTargetLike,
  Observable,
  ObservableLike,
  Observer,
  Subscription,
  WildcardEvent,
  AddEventListenerOptionsLike,
  ObservableEventMap,
  PropertyChangeDetail,
  ArrayMutationDetail,
  Subscriber,
  SubscriptionObserver,
} from 'event-emission';
```
