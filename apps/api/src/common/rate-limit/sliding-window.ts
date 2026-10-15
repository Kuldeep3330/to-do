export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}
