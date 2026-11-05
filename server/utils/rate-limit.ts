/**
 * Счётчики попыток в памяти — сервер у сайта один. Корзина живёт окно
 * `windowMs` с первой попытки; просроченные корзины выметаются раз в минуту,
 * иначе карта копила бы по строке на каждый адрес, заходивший с запуска.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const SWEEP_EVERY_MS = 60_000;
let sweptAt = 0;

function sweep(now: number) {
  if (now - sweptAt < SWEEP_EVERY_MS) return;
  sweptAt = now;
  for (const [key, bucket] of buckets)
    if (now > bucket.resetAt) buckets.delete(key);
}

/** Исчерпан ли лимит — без записи попытки. */
export function isRateLimited(key: string, max: number): boolean {
  const bucket = buckets.get(key);
  return Boolean(bucket && Date.now() <= bucket.resetAt && bucket.count >= max);
}

/** Засчитать попытку. */
export function hitRateLimit(key: string, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
}

/** Засчитать попытку, если лимит не исчерпан. false — исчерпан, попытка не засчитана. */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  if (isRateLimited(key, max)) return false;
  hitRateLimit(key, windowMs);
  return true;
}
