import { sleep } from './sleep.js';

let nextAllowed = 0;

export async function throttle(rps: number): Promise<void> {
  const now = Date.now();
  const effectiveRps = Math.max(rps, 0.01);
  const minInterval = Math.ceil(1000 / effectiveRps);
  if (now < nextAllowed) {
    await sleep(nextAllowed - now);
  }
  nextAllowed = Date.now() + minInterval;
}
