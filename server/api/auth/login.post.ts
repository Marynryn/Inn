import { useDb } from "../../utils/db";
import { users } from "../../database/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { toSessionUser } from "../../utils/identity";
import { hitRateLimit, isRateLimited } from "../../utils/rate-limit";

/**
 * Неудачные попытки входа: с одного адреса — 10 за 15 минут, на одну почту —
 * 30 со всех адресов вместе. Удачный вход не считается. Без лимита пароль
 * админа подбирался перебором, а каждая проверка bcrypt ещё и грузит процессор.
 * Порог на почту выше адресного, чтобы чужой перебор не запирал хозяйку надолго.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_IP = 10;
const MAX_FAILS_PER_EMAIL = 30;

/**
 * Вход по паролю. Остался для администраторов и аккаунтов, заведённых вручную:
 * у пришедших через Google или телеграм пароля нет вовсе.
 */
export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);

  if (!email || !password || typeof password !== "string")
    throw createError({
      statusCode: 400,
      message: "email и password обязательны",
    });

  const normalizedEmail = String(email).trim().toLowerCase();
  const ipKey = `login-ip:${clientIp(event)}`;
  const emailKey = `login-email:${normalizedEmail}`;

  if (
    isRateLimited(ipKey, MAX_FAILS_PER_IP) ||
    isRateLimited(emailKey, MAX_FAILS_PER_EMAIL)
  ) {
    throw createError({
      statusCode: 429,
      message: "Слишком много неудачных попыток. Подожди 15 минут.",
    });
  }

  const db = useDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail));

  // Пустой passwordHash — это аккаунт из соцсети. Без этой проверки bcrypt
  // получил бы на вход null и уронил обработчик пятисоткой вместо отказа.
  if (
    !user?.passwordHash ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    hitRateLimit(ipKey, WINDOW_MS);
    hitRateLimit(emailKey, WINDOW_MS);
    throw createError({
      statusCode: 401,
      message: "Неверный email или пароль",
    });
  }

  if (user.isBanned)
    throw createError({ statusCode: 403, message: "Аккаунт заблокирован" });

  await setUserSession(event, { user: await toSessionUser(user) });
  return { ok: true, role: user.role };
});
