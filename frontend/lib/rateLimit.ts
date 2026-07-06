// Simple in-memory per-IP limiter — sufficient to blunt spam for this hackathon's single
// Next.js server process, not a multi-instance deployment.
export function createIpRateLimiter(windowMs: number, maxRequests: number) {
  const requestLog = new Map<string, number[]>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < windowMs);
    timestamps.push(now);
    requestLog.set(ip, timestamps);
    return timestamps.length >= maxRequests;
  };
}
