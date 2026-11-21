/**
 * Разрешение на датчик движения — чтобы ёлку трясли самим телефоном.
 *
 * Часть браузеров (iPhone, и не только) даёт датчик только по
 * DeviceMotionEvent.requestPermission(), а его можно звать лишь прямо в
 * обработчике касания. Поэтому спрашиваем на нажатии «Потрясти ёлку» — ещё до
 * того, как откроется окно, — а окно потом берёт уже готовый ответ. Где
 * разрешения не спрашивают (большинство Android), датчик доступен сразу.
 *
 * Ответ один на всю вкладку: повторный вызов вернёт тот же. Отказ или ошибку
 * не запоминаем — следующее касание спросит снова.
 */
type MotionWithPermission = {
  requestPermission?: () => Promise<"granted" | "denied" | "prompt">;
};

let pending: Promise<boolean> | null = null;

const motionApi = (): MotionWithPermission | null => {
  if (typeof window === "undefined") return null;
  return (
    ((window as unknown as { DeviceMotionEvent?: MotionWithPermission })
      .DeviceMotionEvent as MotionWithPermission | undefined) ?? null
  );
};

/** Спросить разрешение. Звать синхронно из обработчика касания или клика. */
export function requestMotion(): Promise<boolean> {
  const api = motionApi();
  if (!api) return Promise.resolve(false);
  if (typeof api.requestPermission !== "function") return Promise.resolve(true);
  if (pending) return pending;
  pending = api
    .requestPermission()
    .then((r) => {
      // «prompt» — браузер ещё не решил (Chrome без касания): не отказ.
      if (r === "denied") pending = null;
      return r !== "denied";
    })
    .catch(() => {
      pending = null;
      return false;
    });
  return pending;
}

/** Ответ, если уже спрашивали в этой вкладке; иначе null. */
export const motionAsked = (): Promise<boolean> | null => pending;
