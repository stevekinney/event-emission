/**
 * Symbol.observable polyfill for TC39 Observable interop.
 * This ensures the symbol exists even in environments that don't support it natively.
 */
export const SymbolObservable: symbol =
  (typeof Symbol === 'function' && (Symbol as { observable?: symbol }).observable) ||
  Symbol.for('@@observable');

// Assign to make Symbol.observable available
if (typeof Symbol === 'function') {
  (Symbol as { observable?: symbol }).observable = SymbolObservable;
}
