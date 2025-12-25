import { describe, expect, it } from 'bun:test';

import { createEventTarget } from '../src/index';

describe('ObservableEventTarget on()', () => {
  type Events = {
    click: { x: number; y: number };
    error: Error;
  };

  it('creates an observable that emits events', () => {
    const target = createEventTarget<Events>();
    const clicks = target.on('click');
    const received: any[] = [];

    clicks.subscribe((e) => received.push(e.detail));

    target.dispatchEvent({ type: 'click', detail: { x: 10, y: 20 } });
    target.dispatchEvent({ type: 'click', detail: { x: 30, y: 40 } });

    expect(received).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('supports the once option', () => {
    const target = createEventTarget<Events>();
    const clicks = target.on('click', { once: true });
    const received: any[] = [];
    let completed = false;

    clicks.subscribe({
      next: (e) => received.push(e.detail),
      complete: () => { completed = true; }
    });

    target.dispatchEvent({ type: 'click', detail: { x: 1, y: 1 } });
    target.dispatchEvent({ type: 'click', detail: { x: 2, y: 2 } });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ x: 1, y: 1 });
    expect(completed).toBe(true);
  });

  it('supports the handler option', () => {
    const target = createEventTarget<Events>();
    let handlerCalled = false;
    const clicks = target.on('click', {
      handler: (e) => {
        handlerCalled = true;
        e.preventDefault();
      }
    });

    let defaultPrevented = false;
    clicks.subscribe((e) => {
      defaultPrevented = e.defaultPrevented;
    });

    target.dispatchEvent({ type: 'click', detail: { x: 0, y: 0 } });

    expect(handlerCalled).toBe(true);
    expect(defaultPrevented).toBe(true);
  });

  it('supports the receiveError option', () => {
    const target = createEventTarget<Events>();
    const clicks = target.on('click', { receiveError: true });
    let errorReceived: any = null;

    clicks.subscribe({
      next: () => {},
      error: (err) => { errorReceived = err; }
    });

    const testError = new Error('boom');
    target.dispatchEvent({ type: 'error', detail: testError });

    expect(errorReceived).toBe(testError);
  });

  it('unsubscribes correctly', () => {
    const target = createEventTarget<Events>();
    const clicks = target.on('click');
    const received: any[] = [];

    const sub = clicks.subscribe((e) => received.push(e.detail));

    target.dispatchEvent({ type: 'click', detail: { x: 1, y: 1 } });
    sub.unsubscribe();
    target.dispatchEvent({ type: 'click', detail: { x: 2, y: 2 } });

    expect(received).toHaveLength(1);
  });
});
