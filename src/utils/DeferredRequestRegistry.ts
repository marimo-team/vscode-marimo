/* eslint-disable @typescript-eslint/no-redeclare */

import type { TypedString } from "./TypedString";
import { Deferred } from "./deferred";

export type RequestId = TypedString<"RequestId">;
export const RequestId = {
  create(): RequestId {
    return Math.random().toString(36).slice(2) as RequestId;
  },
};

/**
 * Helper class to manage deferred requests.
 * We send a request via HTTP and then wait for the response from the kernel
 * via a websocket.
 */
export class DeferredRequestRegistry<REQ, RES> {
  public requests = new Map<RequestId, Deferred<RES>>();

  constructor(
    public operation: string,
    private makeRequest: (id: RequestId, req: REQ) => Promise<void>,
    private opts: {
      /**
       * Resolve existing requests with an empty response.
       */
      resolveExistingRequests?: () => RES;
    } = {},
  ) {}

  async request(opts: REQ): Promise<RES> {
    if (this.opts.resolveExistingRequests) {
      const result = this.opts.resolveExistingRequests();
      this.requests.forEach((deferred) => deferred.resolve(result));
      this.requests.clear();
    }

    const requestId = RequestId.create();
    const deferred = new Deferred<RES>();

    this.requests.set(requestId, deferred);

    await this.makeRequest(requestId, opts).catch((error) => {
      deferred.reject(error);
      this.requests.delete(requestId);
    });
    return deferred.promise;
  }

  resolve(requestId: RequestId, response: RES) {
    const entry = this.requests.get(requestId);
    if (entry === undefined) {
      return;
    }

    entry.resolve(response);
    this.requests.delete(requestId);
  }

  rejectAll(error: Error) {
    this.requests.forEach((deferred) => deferred.reject(error));
    this.requests.clear();
  }

  reject(requestId: RequestId, error: Error) {
    const entry = this.requests.get(requestId);
    if (entry === undefined) {
      return;
    }

    entry.reject(error);
    this.requests.delete(requestId);
  }
}
