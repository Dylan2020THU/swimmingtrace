import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw';
import { setRedirectToLogin } from './lib/api/client';

// Global no-op redirect so a 401 in any test never triggers real jsdom
// navigation (window.location.assign throws "not implemented" in jsdom).
// Tests that assert redirect behaviour override this per-test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeAll(() => setRedirectToLogin(() => {}));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
