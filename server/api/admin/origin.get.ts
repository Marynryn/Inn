import { mirrorHosts, publicOrigin } from '../../utils/public-origin'

/**
 * Что сервер думает о своём адресе. Нужно, когда вход через Google или
 * телеграм жалуется на redirect_uri: видно, какой Host пришёл, что лежит в
 * X-Forwarded-Host и какой origin в итоге уйдёт провайдеру.
 */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  return {
    host: url.host,
    forwardedHost: getRequestHeader(event, 'x-forwarded-host') ?? null,
    forwardedProto: getRequestHeader(event, 'x-forwarded-proto') ?? null,
    origin: publicOrigin(event),
    mirrors: mirrorHosts(),
  }
})
