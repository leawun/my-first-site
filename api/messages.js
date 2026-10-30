import { createHash, randomBytes } from 'node:crypto';
import { sql, ensureTables } from '../lib/db.js';
import { matchKeywords, notifyKeywordMessage } from '../lib/notify.js';

const NAME_MAX = 30;
const MESSAGE_MAX = 200;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function validateMessage(raw) {
  const message = String(raw ?? '').trim();
  if (!message || message.length > MESSAGE_MAX) return null;
  return message;
}

export default async function handler(req, res) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, message, created_at, updated_at
        FROM guestbook
        ORDER BY created_at DESC
        LIMIT 50
      `;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = parseBody(req);

      // 隱藏欄位：真人看不到，機器人常會填，填了就當成功但不存
      if (body.website) return res.status(201).json({ ok: true });

      const name = String(body.name ?? '').trim();
      const message = validateMessage(body.message);

      if (!name || name.length > NAME_MAX) {
        return res.status(400).json({ error: `名字需為 1–${NAME_MAX} 個字` });
      }
      if (!message) {
        return res.status(400).json({ error: `留言需為 1–${MESSAGE_MAX} 個字` });
      }

      // 編輯憑證只回傳給留言者這一次，資料庫裡只存雜湊值
      const editToken = randomBytes(24).toString('base64url');
      const [row] = await sql`
        INSERT INTO guestbook (name, message, edit_token_hash)
        VALUES (${name}, ${message}, ${hashToken(editToken)})
        RETURNING id, name, message, created_at, updated_at
      `;
      const keywords = matchKeywords(message);
      if (keywords.length) await notifyKeywordMessage({ name, message, keywords });
      return res.status(201).json({ ...row, editToken });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const id = Number(body.id);
      const editToken = String(body.editToken ?? '');
      const message = validateMessage(body.message);

      if (!Number.isInteger(id) || !editToken) {
        return res.status(400).json({ error: '缺少留言編號或編輯憑證' });
      }
      if (!message) {
        return res.status(400).json({ error: `留言需為 1–${MESSAGE_MAX} 個字` });
      }

      const [row] = await sql`
        UPDATE guestbook
        SET message = ${message}, updated_at = now()
        WHERE id = ${id} AND edit_token_hash = ${hashToken(editToken)}
        RETURNING id, name, message, created_at, updated_at
      `;
      if (!row) {
        return res.status(403).json({ error: '只能修改自己的留言' });
      }
      // 內容變了，讓下一次 AI 總結重新產生
      await sql`DELETE FROM guestbook_summary`;
      const keywords = matchKeywords(message);
      if (keywords.length) {
        await notifyKeywordMessage({ name: row.name, message, keywords, edited: true });
      }
      return res.status(200).json(row);
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '伺服器發生錯誤，請稍後再試' });
  }
}
