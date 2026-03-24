import { LogSeverity } from '../types';

import type { BaseExchange } from './base';

const MIN_HEALTHY_MS = 30_000; // connection must stay open 30s to count as "healthy"

export class BaseWebSocket<T extends BaseExchange> {
  ws?: WebSocket;
  parent: T;

  pingAt = 0;
  pingTimeoutId?: NodeJS.Timeout;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private connectedAt = 0;

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isDisposed() {
    return this.parent.isDisposed;
  }

  get store() {
    return this.parent.store;
  }

  get emitter() {
    return this.parent.emitter;
  }

  constructor(parent: T) {
    this.parent = parent;
  }

  connectAndSubscribe = (): void => {
    throw new Error('Not implemented');
  };

  onOpen = (): void => {
    throw new Error('Not implemented');
  };

  onMessage = (_event: MessageEvent): void => {
    throw new Error('Not implemented');
  };

  /** Wraps the real open event to track connection time for backoff decisions. */
  handleOpen = () => {
    this.connectedAt = Date.now();
    this.onOpen();
  };

  onClose = () => {
    const wasHealthy = this.connectedAt > 0
      && (Date.now() - this.connectedAt) >= MIN_HEALTHY_MS;
    this.connectedAt = 0;

    // Only reset backoff if connection was stable for 30s+
    if (wasHealthy) {
      this.reconnectDelay = 1000;
    }

    if (!this.parent.isDisposed) {
      this.parent.log(
        `WebSocket disconnected, reconnecting in ${this.reconnectDelay / 1000}s...`,
        LogSeverity.Warning
      );
    }

    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = undefined;
    }

    this.ws?.removeEventListener?.('open', this.handleOpen);
    this.ws?.removeEventListener?.('message', this.onMessage);
    this.ws?.removeEventListener?.('close', this.onClose);
    this.ws = undefined;

    if (!this.parent.isDisposed) {
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      setTimeout(() => {
        if (!this.parent.isDisposed) {
          this.connectAndSubscribe();
        }
      }, delay);
    }
  };

  dispose = () => {
    this.ws?.close?.();
  };
}
