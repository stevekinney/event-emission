/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { SymbolObservable } from './symbols';
import type {
  ObservableLike,
  Observer as ObserverInterface,
  Subscription as SubscriptionInterface,
} from './types';

/**
 * Helper to get a method from an object.
 */
function getMethod(obj: any, key: string): Function | undefined {
  if (obj === null || obj === undefined) return undefined;
  const value = obj[key];
  if (value == null) return undefined;
  if (typeof value !== 'function') {
    throw new TypeError(value + ' is not a function');
  }
  return value;
}

/**
 * Helper to report an error that cannot be delivered to an observer.
 */
function hostReportError(e: any) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      throw e;
    });
  } else {
    setTimeout(() => {
      throw e;
    });
  }
}

/**
 * Normalized observer used within the Subscriber function.
 */
export interface SubscriptionObserver<T> {
  next(value: T): void;
  error(errorValue: unknown): void;
  complete(): void;
  readonly closed: boolean;
}

/**
 * Internal SubscriptionObserver class required by TC39 spec.
 */
function SubscriptionObserverImpl(this: any, subscription: any) {
  this._subscription = subscription;
}

SubscriptionObserverImpl.prototype = Object.create(Object.prototype);
Object.defineProperties(SubscriptionObserverImpl.prototype, {
  constructor: { value: Object, configurable: true, writable: true },
  closed: {
    get() {
      return this._subscription._closed;
    },
    configurable: true,
  },
  next: {
    value: function next(this: any, value: any) {
      const subscription = this._subscription;
      if (subscription._closed) return undefined;
      const observer = subscription._observer;
      try {
        const m = getMethod(observer, 'next');
        if (!m) return undefined;
        return m.call(observer, value);
      } catch (e) {
        try {
          this.error(e);
        } catch (err) {
          hostReportError(err);
        }
      }
    },
    configurable: true,
    writable: true,
  },
  error: {
    value: function error(this: any, errorValue: any) {
      const subscription = this._subscription;
      if (subscription._closed) throw errorValue;
      subscription._closed = true;
      const observer = subscription._observer;
      try {
        const m = getMethod(observer, 'error');
        if (m) {
          return m.call(observer, errorValue);
        }
        throw errorValue;
      } finally {
        subscription._cleanup();
      }
    },
    configurable: true,
    writable: true,
  },
  complete: {
    value: function complete(this: any, value: any) {
      const subscription = this._subscription;
      if (subscription._closed) return undefined;
      subscription._closed = true;
      const observer = subscription._observer;
      try {
        const m = getMethod(observer, 'complete');
        if (m) {
          return m.call(observer, value);
        }
        return undefined;
      } finally {
        subscription._cleanup();
      }
    },
    configurable: true,
    writable: true,
  },
});

Object.defineProperty(SubscriptionObserverImpl.prototype.next, 'length', { value: 1 });
Object.defineProperty(SubscriptionObserverImpl.prototype.error, 'length', { value: 1 });
Object.defineProperty(SubscriptionObserverImpl.prototype.complete, 'length', {
  value: 1,
});

/**
 * Internal Subscription class required by TC39 spec.
 */
function Subscription(this: any, observer: any, subscriber: any) {
  this._observer = observer;
  this._cleanupFn = undefined;
  this._closed = false;

  const subscriptionObserver = new (SubscriptionObserverImpl as any)(this);

  try {
    const start = getMethod(observer, 'start');
    if (start) {
      start.call(observer, this);
    }
  } catch (e) {
    hostReportError(e);
  }

  if (this._closed) return;

  try {
    const cleanup = subscriber(subscriptionObserver);
    if (cleanup != null) {
      if (typeof cleanup !== 'function' && typeof cleanup.unsubscribe !== 'function') {
        throw new TypeError(cleanup + ' is not a function or a subscription');
      }
      this._cleanupFn = cleanup;
      if (this._closed) {
        this._cleanup();
      }
    }
  } catch (e) {
    subscriptionObserver.error(e);
  }
}

Subscription.prototype = Object.create(Object.prototype);
Object.defineProperties(Subscription.prototype, {
  constructor: { value: Object, configurable: true, writable: true },
  closed: {
    get() {
      return this._closed;
    },
    configurable: true,
  },
  unsubscribe: {
    value: function unsubscribe(this: any) {
      if (this._closed) return;
      this._closed = true;
      this._cleanup();
    },
    configurable: true,
    writable: true,
  },
  _cleanup: {
    value: function _cleanup(this: any) {
      const cleanup = this._cleanupFn;
      if (!cleanup) return;
      this._cleanupFn = undefined;
      try {
        if (typeof cleanup === 'function') {
          cleanup();
        } else if (cleanup && typeof cleanup.unsubscribe === 'function') {
          cleanup.unsubscribe();
        }
      } catch (e) {
        hostReportError(e);
      }
    },
    configurable: true,
    writable: true,
  },
});

/**
 * A proper TC39 Observable implementation.
 */
export class Observable<T> implements ObservableLike<T> {
  private _subscriber: Subscriber<T>;

  constructor(subscriber: Subscriber<T>) {
    if (typeof subscriber !== 'function') {
      throw new TypeError('Observable initializer must be a function');
    }
    this._subscriber = subscriber;
  }

  subscribe(
    observerOrNext?: ObserverInterface<T> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): SubscriptionInterface {
    let observer: any;
    if (typeof observerOrNext === 'function') {
      observer = {
        next: observerOrNext,
        error,
        complete,
      };
    } else if (typeof observerOrNext !== 'object' || observerOrNext === null) {
      throw new TypeError(observerOrNext + ' is not an object');
    } else {
      observer = observerOrNext;
    }

    return new (Subscription as any)(observer, this._subscriber);
  }

  [SymbolObservable](): Observable<T> {
    return this;
  }

  static of<U>(...items: U[]): Observable<U> {
    const C = typeof this === 'function' ? this : Observable;
    return new (C as any)((observer: SubscriptionObserverInterface<U>) => {
      for (let i = 0; i < items.length; ++i) {
        observer.next(items[i]);
        if (observer.closed) return;
      }
      observer.complete();
    });
  }

  static from<U>(x: any): Observable<U> {
    const C = typeof this === 'function' ? this : Observable;
    if (x == null) throw new TypeError(x + ' is not an object');

    const method = x[SymbolObservable];
    if (method != null) {
      if (typeof method !== 'function') {
        throw new TypeError(method + ' is not a function');
      }
      const observable = method.call(x);
      if (Object(observable) !== observable) {
        throw new TypeError(observable + ' is not an object');
      }
      if (observable.constructor === C) {
        return observable;
      }
      return new (C as any)((observer: SubscriptionObserverInterface<U>) =>
        observable.subscribe(observer),
      );
    }

    if (Symbol.iterator in x) {
      return new (C as any)((observer: SubscriptionObserverInterface<U>) => {
        for (const item of x as Iterable<U>) {
          observer.next(item);
          if (observer.closed) return;
        }
        observer.complete();
      });
    }

    throw new TypeError(x + ' is not observable');
  }
}

/**
 * Function called when a new subscription is created.
 */
export type Subscriber<T> = (
  observer: SubscriptionObserverInterface<T>,
) => (() => void) | SubscriptionInterface | void;

/**
 * Normalized observer used within the Subscriber function.
 */
export interface SubscriptionObserverInterface<T> {
  next(value: T): void;
  error(errorValue: unknown): void;
  complete(): void;
  readonly closed: boolean;
}
