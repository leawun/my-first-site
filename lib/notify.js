import { Resend } from 'resend';

// 留言提到這些詞就寄信通知站長
export const KEYWORDS = ['服務', '費用'];

export function matchKeywords(text) {
  return KEYWORDS.filter((k) => text.includes(k));
}

// 收件信箱放在環境變數，避免寫進公開的 GitHub repo
// 寄信失敗只記錄錯誤，不影響訪客留言
export async function notifyKeywordMessage({ name, message, keywords, edited = false }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.warn('notify skipped: RESEND_API_KEY or NOTIFY_EMAIL is not set');
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.NOTIFY_FROM || '留言板通知 <onboarding@resend.dev>',
      to: [to],
      subject: `【留言板】${name} ${edited ? '修改了' : '留下了'}提到「${keywords.join('、')}」的留言`,
      text: [
        `訪客名稱：${name}`,
        `留言內容：${message}`,
        '',
        `${edited ? '這是修改後的內容。' : ''}關鍵字：${keywords.join('、')}`,
        '查看留言板：https://my-first-site-lemon-seven.vercel.app/#guestbook',
      ].join('\n'),
    });
    if (error) console.error('notify failed:', error);
  } catch (err) {
    console.error('notify failed:', err);
  }
}
