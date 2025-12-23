/**
 * Error thrown when an async iterator's event buffer overflows
 * and the overflow strategy is 'throw'.
 */
export class BufferOverflowError extends Error {
  constructor(eventType: string, bufferSize: number) {
    super(`Buffer overflow for event type "${eventType}" (max: ${bufferSize})`);
    this.name = 'BufferOverflowError';
  }
}
