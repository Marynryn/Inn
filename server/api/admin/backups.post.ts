import { makeSnapshot } from "../../utils/backup";

/** Снимок базы сейчас — перед рискованным делом не ждать ночи. Тот же, что
 *  делает ночная задача, и в той же очереди из последних семи. */
export default defineEventHandler(() => makeSnapshot());
