type Release = () => void;

type Waiter = {
  resolve: (release: Release) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Concurrency maximum must be a positive integer.");
  }

  tighten(maximum: number): void {
    if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Concurrency maximum must be a positive integer.");
    this.maximum = Math.min(this.maximum, maximum);
  }

  acquire(signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.active < this.maximum) return Promise.resolve(this.takePermit());
    return new Promise((resolve, reject) => this.enqueue({ resolve, reject, signal }));
  }

  private enqueue(waiter: Waiter): void {
    if (waiter.signal) {
      waiter.onAbort = () => this.abortWaiter(waiter);
      waiter.signal.addEventListener("abort", waiter.onAbort, { once: true });
    }
    this.waiters.push(waiter);
  }

  private abortWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index === -1) return;
    this.waiters.splice(index, 1);
    this.removeAbortListener(waiter);
    waiter.reject(abortError());
  }

  private takePermit(): Release {
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releasePermit();
    };
  }

  private releasePermit(): void {
    this.active -= 1;
    if (this.active >= this.maximum) return;
    const waiter = this.waiters.shift();
    if (!waiter) return;
    this.removeAbortListener(waiter);
    waiter.resolve(this.takePermit());
  }

  private removeAbortListener(waiter: Waiter): void {
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}
