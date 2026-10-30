import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const NAME_MAX = 30;
const MESSAGE_MAX = 200;

// 第一次被呼叫時建立資料表，之後同一個執行個體就不再重複執行
let ready;
function ensureTable() {
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS guestbook (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(30) NOT NULL,
      message    VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.catch((err) => { ready = undefined; throw err; });
  return ready;
}

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, message, created_at
        FROM guestbook
        ORDER BY created_at DESC
        LIMIT 50
      `;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // 隱藏欄位：真人看不到，機器人常會填，填了就當成功但不存
      if (body.website) return res.status(201).json({ ok: true });

      const name = String(body.name ?? '').trim();
      const message = String(body.message ?? '').trim();

      if (!name || name.length > NAME_MAX) {
        return res.status(400).json({ error: `名字需為 1–${NAME_MAX} 個字` });
      }
      if (!message || message.length > MESSAGE_MAX) {
        return res.status(400).json({ error: `留言需為 1–${MESSAGE_MAX} 個字` });
      }

      const [row] = await sql`
        INSERT INTO guestbook (name, message)
        VALUES (${name}, ${message})
        RETURNING id, name, message, created_at
      `;
      return res.status(201).json(row);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '伺服器發生錯誤，請稍後再試' });
  }
}
