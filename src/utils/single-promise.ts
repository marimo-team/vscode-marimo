import { Deferred } from "./deferred";

type Channel = string;

/**
 * Ensures that only one message is being processed at a time for a given channel.
 * All queued messages will get the same result.
 */
export class SingleMessage {
  public static instance = new SingleMessage();
  private constructor() {}

  private gates: Map<Channel, Deferred<void>> = new Map();

  async gate<T>(channel: string, promise: () => Promise<T>): Promise<void> {
    // If gate exists, wait for it
    const deferred = this.gates.get(channel);
    if (deferred) {
      return deferred.promise;
    }
    // Create a new gate
    const newDeferred = new Deferred<void>();
    this.gates.set(channel, newDeferred);

    try {
      await promise();
    } finally {
      // Remove the gate
      this.gates.delete(channel);
      newDeferred.resolve();
    }
  }
}
