import type { H3Event } from 'h3'

const BOT_UA_PATTERN = /bot|crawl|spider|slurp|scrapy|curl|wget|python-requests|python-urllib|node-fetch|axios|go-http-client|headless|facebookexternalhit|preview|monitor|pingdom|uptime/i

export const isBotRequest = (event: H3Event) => {
  const ua = getRequestHeader(event, 'user-agent')
  if (!ua) return true
  return BOT_UA_PATTERN.test(ua)
}
