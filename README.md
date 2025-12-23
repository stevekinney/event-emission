# Event Emission

A lightweight, type-safe event system with DOM EventTarget ergonomics and TC39 Observable interoperability. Use one event source with callbacks, async iterators, and RxJS without losing TypeScript safety.

## Why this library

- **Typed events** - Event maps keep payloads and event names in sync
- **Familiar API** - `addEventListener`, `removeEventListener`, `dispatchEvent`
- **Observable-ready** - Works with RxJS and other TC39 Observable libraries
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
- `Eventful<E>` base class
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

**Options:**

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

```typescript
for await (const event of events.events('message', { bufferSize: 16 })) {
  console.log('Received:', event.detail.text);
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

## Lifecycle

### `complete()`

Marks the event target as complete, clears listeners, and ends iterators.

### `clear()`

Removes all listeners without marking as complete.

## Eventful base class

Extend `Eventful` to build typed emitters:

```typescript
import { Eventful } from 'event-emission';

class UserService extends Eventful<{
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

## Utilities

### `isObserved(obj)`

Checks if an object is an observed proxy.

### `getOriginal(proxy)`

Returns the original unproxied object.

## TypeScript types

```typescript
import type {
  EventfulEvent,
  EventTargetLike,
  ObservableLike,
  Observer,
  Subscription,
  WildcardEvent,
  AddEventListenerOptionsLike,
  ObservableEventMap,
  PropertyChangeDetail,
  ArrayMutationDetail,
} from 'event-emission';
```

## License

MIT
