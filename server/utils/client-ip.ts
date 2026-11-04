import { BlockList, isIP } from "node:net";
import type { H3Event } from "h3";

/**
 * Адрес человека — для лимитов, реакций гостей и огоньков.
 *
 * Первое значение X-Forwarded-For, которое брал getRequestIP, присылает сам
 * клиент: прокси дописывают настоящий адрес в конец. С подменённым заголовком
 * каждый запрос выглядел новым человеком — лимиты на комментарии не держали, а
 * гость ставил сколько угодно лайков.
 *
 * Порядок доверия:
 *  1. X-Real-IP — его ставит край Railway, клиент его не подделает.
 *  2. Если X-Real-IP — адрес Cloudflare (сайт за оранжевым облаком), то
 *     человек — в CF-Connecting-IP. Только в этом случае: без Cloudflare в
 *     цепочке этот заголовок мог прислать кто угодно.
 *  3. Вне Railway (локально, тесты) — последнее значение X-Forwarded-For и
 *     затем сам сокет.
 */
export function clientIp(event: H3Event): string {
  const real = header(event, "x-real-ip");
  if (real) {
    const cf = header(event, "cf-connecting-ip");
    if (cf && isCloudflare(real)) return cf;
    return real;
  }

  const forwarded = header(event, "x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);
  return forwarded || event.node.req.socket.remoteAddress || "unknown";
}

function header(event: H3Event, name: string): string | null {
  const value = getRequestHeader(event, name)?.trim();
  return value && isIP(value) ? value : null;
}

/**
 * Сети Cloudflare: https://www.cloudflare.com/ips-v4 и /ips-v6. Меняются
 * редко (последний раз — в 2021-м); если Cloudflare добавит сеть, запросы
 * через неё просто посчитаются по адресу узла Cloudflare, как раньше.
 */
const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];
const CLOUDFLARE_V6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_V4) {
  const [net, bits] = cidr.split("/");
  cloudflare.addSubnet(net!, Number(bits), "ipv4");
}
for (const cidr of CLOUDFLARE_V6) {
  const [net, bits] = cidr.split("/");
  cloudflare.addSubnet(net!, Number(bits), "ipv6");
}

function isCloudflare(ip: string): boolean {
  return cloudflare.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}
