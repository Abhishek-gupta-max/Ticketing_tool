import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request context (request id, user, IP, user agent) available to services
// without threading it through every call, mainly for audit logging.
const storage = new AsyncLocalStorage();

export const runWithContext = (ctx, fn) => storage.run(ctx, fn);
export const getContext = () => storage.getStore() || {};
