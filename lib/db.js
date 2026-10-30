import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

// 第一次被呼叫時建立資料表，之後同一個執行個體就不再重複執行
let ready;
export function ensureTables() {
  ready ??= Promise.all([
    sql`
      CREATE TABLE IF NOT EXISTS guestbook (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(30) NOT NULL,
        message    VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
    // 只存一列：最新一次的 AI 總結，以及當時涵蓋到哪一則留言
    sql`
      CREATE TABLE IF NOT EXISTS guestbook_summary (
        id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        last_message_id INT NOT NULL,
        message_count   INT NOT NULL,
        summary         TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  ]).catch((err) => { ready = undefined; throw err; });
  return ready;
}
