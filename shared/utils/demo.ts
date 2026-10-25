/*
  Общие входы демо-стенда. Их печатает страница входа, так что пароли не секрет:
  стенд и задуман открытым, а каждую ночь возвращается к исходному виду.
  На боевом сайте этих аккаунтов нет — их заводит только посев демо.
*/
export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@demo.local', password: 'demo-admin', name: 'Переводчица' },
  reader: { email: 'reader@demo.local', password: 'demo-reader', name: 'Читатель' },
} as const
