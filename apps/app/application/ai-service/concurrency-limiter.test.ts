import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "./concurrency-limiter";

describe("ConcurrencyLimiter", () => {
  it("limits concurrent operations and grants queued permits in FIFO order", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const releaseFirst = await limiter.acquire();
    const order: number[] = [];
    const second = limiter.acquire().then((release) => { order.push(2); return release; });
    const third = limiter.acquire().then((release) => { order.push(3); return release; });

    releaseFirst();
    const releaseSecond = await second;
    expect(order).toEqual([2]);
    releaseSecond();
    const releaseThird = await third;
    expect(order).toEqual([2, 3]);
    releaseThird();
  });

  it("removes an aborted waiter and releases the permit for the next waiter", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const releaseFirst = await limiter.acquire();
    const controller = new AbortController();
    const cancelled = limiter.acquire(controller.signal);
    const next = limiter.acquire();

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    releaseFirst();
    const releaseNext = await next;
    releaseNext();
  });

  it("returns an idempotent release function after success or error cleanup", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const release = await limiter.acquire();

    release();
    release();

    await expect(limiter.acquire()).resolves.toEqual(expect.any(Function));
  });

  it("rejects before enqueueing when already aborted", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const controller = new AbortController();
    controller.abort();

    await expect(limiter.acquire(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps queued waiters blocked until active permits fall below a tightened maximum", async () => {
    const limiter = new ConcurrencyLimiter(3);
    const activeReleases = await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    const admitted: number[] = [];
    const firstWaiter = limiter.acquire().then((release) => { admitted.push(1); return release; });
    const secondWaiter = limiter.acquire().then((release) => { admitted.push(2); return release; });

    limiter.tighten(1);
    activeReleases[0]();
    await Promise.resolve();
    expect(admitted).toEqual([]);
    activeReleases[1]();
    await Promise.resolve();
    expect(admitted).toEqual([]);
    activeReleases[2]();
    const releaseFirstWaiter = await firstWaiter;
    expect(admitted).toEqual([1]);
    releaseFirstWaiter();
    const releaseSecondWaiter = await secondWaiter;
    expect(admitted).toEqual([1, 2]);
    releaseSecondWaiter();

    await expect(limiter.acquire()).resolves.toEqual(expect.any(Function));
  });
});
