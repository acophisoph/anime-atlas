import { sleep } from './sleep.js';

let nextAllowed = 0;

export async function throttle(rps: number): Promise<void> {
  const now = Date.now();
  const minInterval = Math.ceil(1000 / Math.max(rps, 1));
  if (now < nextAllowed) {
    await sleep(nextAllowed - now);
  }
  nextAllowed = Date.now() + minInterval;
}
