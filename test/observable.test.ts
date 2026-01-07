import { describe, expect, it } from 'bun:test';

import { Observable } from '../src/observable';

describe('Observable', () => {
  it('should deliver values synchronously', () => {
    const received: number[] = [];
    const observable = new Observable<number>((observer) => {
      observer.next(1);
      observer.next(2);
      observer.complete();
    });

    observable.subscribe({
      next: (v) => received.push(v),
    });

    expect(received).toEqual([1, 2]);
  });

  it('should deliver errors synchronously', () => {
    let error: any;
    const observable = new Observable<number>((observer) => {
      observer.error(new Error('fail'));
    });

    observable.subscribe({
      error: (e) => { error = e; },
    });

    expect(error.message).toBe('fail');
  });

  it('should call cleanup on unsubscribe', () => {
    let cleanupCalled = false;
    const observable = new Observable<number>((_observer) => {
      return () => { cleanupCalled = true; };
    });

    const sub = observable.subscribe(() => {});
    sub.unsubscribe();

    expect(cleanupCalled).toBe(true);
  });

  it('should call cleanup on complete', () => {
    let cleanupCalled = false;
    const observable = new Observable<number>((observer) => {
      observer.complete();
      return () => { cleanupCalled = true; };
    });

    observable.subscribe(() => {});
    expect(cleanupCalled).toBe(true);
  });

  describe('Observable.of', () => {
    it('should create an observable from arguments', () => {
      const received: number[] = [];
      Observable.of(1, 2, 3).subscribe((v) => received.push(v));
      expect(received).toEqual([1, 2, 3]);
    });
  });

  describe('Observable.from', () => {
    it('should create an observable from an iterable', () => {
      const received: number[] = [];
      Observable.from([1, 2, 3]).subscribe((v) => received.push(v));
      expect(received).toEqual([1, 2, 3]);
    });

    it('should create an observable from an observable-like', () => {
      const received: number[] = [];
      const like = {
        [Symbol.observable]() {
          return new Observable((observer) => {
            observer.next(10);
            observer.complete();
          });
        },
      };
      Observable.from(like as any).subscribe((v) => received.push(v as number));
      expect(received).toEqual([10]);
    });

    it('wraps observable-like values that are not Observable instances', () => {
      const received: number[] = [];
      const like = {
        [Symbol.observable]() {
          return {
            subscribe(observer: { next: (value: number) => void; complete: () => void }) {
              observer.next(5);
              observer.complete();
            },
          };
        },
      };

      Observable.from(like as any).subscribe((v) => received.push(v as number));
      expect(received).toEqual([5]);
    });
  });

  describe('hostReportError', () => {
    it('reports start errors via queueMicrotask', () => {
      const observable = new Observable(() => {});
      const originalQueueMicrotask = globalThis.queueMicrotask;
      let captured: unknown;

      globalThis.queueMicrotask = (cb) => {
        try {
          cb();
        } catch (err) {
          captured = err;
        }
      };

      try {
        observable.subscribe({
          start() {
            throw new Error('start boom');
          },
        });
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }

      expect((captured as Error)?.message).toBe('start boom');
    });

    it('reports start errors via setTimeout when queueMicrotask is unavailable', () => {
      const observable = new Observable(() => {});
      const originalQueueMicrotask = globalThis.queueMicrotask;
      const originalSetTimeout = globalThis.setTimeout;
      let captured: unknown;

      globalThis.queueMicrotask = undefined as unknown as typeof queueMicrotask;
      globalThis.setTimeout = ((cb: () => void) => {
        try {
          cb();
        } catch (err) {
          captured = err;
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      try {
        observable.subscribe({
          start() {
            throw new Error('start boom');
          },
        });
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
        globalThis.setTimeout = originalSetTimeout;
      }

      expect((captured as Error)?.message).toBe('start boom');
    });
  });
});
