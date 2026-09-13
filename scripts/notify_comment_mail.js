const tls = require('tls');

// Escaping helpers
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function buildCommentHtml({ siteName, nick, content, url, logo }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f2f7;-webkit-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;color:#1d1d1f;">
<div style="max-width:560px;margin:0 auto;padding:28px 16px 40px;">
  <div style="text-align:center;padding:8px 0 24px;">
    <img src="${esc(logo)}" alt="${esc(siteName)}" width="100" style="display:block;margin:0 auto;width:100px;height:100px;border-radius:22px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.18);">
    <div style="margin-top:12px;font-size:18px;font-weight:700;color:#1d1d1f;">${esc(siteName)}</div>
    <div style="margin-top:3px;font-size:14px;color:#86868b;">💬 有新评论啦</div>
  </div>
  <div style="background:#ffffff;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 8px 24px rgba(0,0,0,.06);overflow:hidden;">
    <div style="padding:24px 22px 0;">
      <div style="font-size:20px;font-weight:700;color:#1d1d1f;">${esc(nick)} 评论了你的站点</div>
      <div style="margin-top:6px;font-size:14px;color:#86868b;">请前往帖子页面查看并回复</div>
    </div>
    <div style="margin:18px 18px 0;padding:16px 18px;background:#f0f5ff;border-left:4px solid #3b82f6;border-radius:12px;font-size:16px;line-height:1.7;color:#3a3a3c;">"${nl2br(content)}"</div>
    <div style="padding:22px 16px 28px;text-align:center;">
      <a href="${esc(url)}" style="display:inline-block;padding:15px 42px;background:#e5484d;border-radius:14px;font-size:17px;font-weight:600;color:#ffffff;text-decoration:none;box-shadow:0 4px 12px rgba(229,72,77,.35);">查看评论</a>
      <div style="margin-top:12px;font-size:13px;color:#86868b;">去帖子页查看并回复该评论</div>
    </div>
  </div>
  <div style="padding:22px 12px 0;text-align:center;">
    <div style="font-size:13px;line-height:1.8;color:#a1a1a6;">这是一封由「${esc(siteName)}」自动发送的通知邮件</div>
    <div style="font-size:13px;line-height:1.8;color:#a1a1a6;">请勿直接回复，如需帮助请回到帖子评论区留言</div>
  </div>
</div>
</body>
</html>`;
}

function smtpSend({ host, port, user, pass, from, fromName, to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(port, host, { servername: host });
    let buf = '';
    let timer = setTimeout(() => { sock.destroy(); reject(new Error('SMTP 连接超时')); }, 60000);
    const kill = () => { clearTimeout(timer); };
    const send = (s) => sock.write(s + '\r\n');
    let step = 0;
    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
    const mimeWord = (s) => '=?UTF-8?B?' + b64(s) + '?=';
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!/^\d{3}-/.test(line)) {
          const code = parseInt(line.slice(0, 3), 10);
          const cont = line.slice(4);
          if (step === 0 && code === 220) { step = 1; send('EHLO mrhyfx.local'); return; }
          if (step === 1 && code === 250) { step = 2; send('AUTH LOGIN'); return; }
          if (step === 2 && code === 334) { step = 3; send(b64(user)); return; }
          if (step === 3 && code === 334) { step = 4; send(b64(pass)); return; }
          if (step === 4 && code === 235) { step = 5; send('MAIL FROM:<' + from + '>'); return; }
          if (step === 5 && code === 250) { step = 6; send('RCPT TO:<' + to + '>'); return; }
          if (step === 6 && code === 250) { step = 7; send('DATA'); return; }
          if (step === 7 && code === 354) {
            step = 8;
            const b64w = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
            const boundary = 'mrhx_alt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            const parts = [];
            if (html) {
              parts.push('--' + boundary);
              parts.push('Content-Type: text/plain; charset=UTF-8');
              parts.push('Content-Transfer-Encoding: base64');
              parts.push('');
              parts.push(b64w(text));
            }
            parts.push('--' + boundary);
            parts.push('Content-Type: text/html; charset=UTF-8');
            parts.push('Content-Transfer-Encoding: base64');
            parts.push('');
            parts.push(b64w(html || text));
            parts.push('--' + boundary + '--');
            const body = parts.join('\r\n');
            const msg = [
              'From: ' + mimeWord(fromName) + ' <' + from + '>',
              'To: <' + to + '>',
              'Subject: ' + mimeWord(subject),
              'Date: ' + new Date().toUTCString(),
              'MIME-Version: 1.0',
              'Content-Type: multipart/alternative; boundary="' + boundary + '"',
              '',
              body,
              '',
              '.'
            ].join('\r\n');
            send(msg);
            return;
          }
          if (step === 8 && code === 250) { step = 9; send('QUIT'); return; }
          if (step === 9 && code === 221) { kill(); sock.end(); resolve(); return; }
          if (/^[45]/.test(line)) { kill(); sock.destroy(); reject(new Error('SMTP 服务器拒绝：' + line)); return; }
          if (cont) { return; }
        }
      }
    });
    sock.on('error', (e) => { kill(); reject(e); });
  });
}

// --- Main ---
(async () => {
  const host = process.env.QQ_SMTP_HOST || 'smtp.qq.com';
  const port = parseInt(process.env.QQ_SMTP_PORT || '465', 10);
  const user = process.env.QQ_SMTP_USER || '';
  const pass = process.env.QQ_SMTP_PASS || '';
  const from = process.env.QQ_SMTP_FROM || user;
  const fromName = process.env.QQ_SMTP_FROM_NAME || '黄油站站长';
  const to = process.env.ADMIN_EMAIL || process.env.MAIL_TO || user;
  if (!user || !pass || !to) throw new Error('缺少配置：QQ_SMTP_USER / QQ_SMTP_PASS / ADMIN_EMAIL');

  const siteName = process.env.SITE_NAME || 'Tsinho黄油站';
  const nick = process.env.COMMENT_NICK || '匿名';
  const content = String(process.env.COMMENT_CONTENT || '').trim();
  const pageUrl = String(process.env.COMMENT_URL || '').replace(/^\//, '');
  const siteUrl = (process.env.SITE_URL || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '/');

  if (!content) throw new Error('缺少评论内容');
  const url = siteUrl + pageUrl;

  const subject = '【' + siteName + '】收到一条新评论';
  const text = [
    '站点收到一条新的评论：',
    '',
    '评论者：' + nick,
    '评论内容：',
    '----------------------------------------',
    content,
    '----------------------------------------',
    '',
    '帖子链接：' + url,
    '',
    '（这是一封系统自动发送的通知邮件，请勿直接回复）'
  ].join('\n');

  const html = buildCommentHtml({ siteName, nick, content, url, logo: 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main/favicon.webp' });
  await smtpSend({ host, port, user, pass, from, fromName, to, subject, text, html });
  console.log('新评论通知邮件发送成功 -> ' + to);
})().catch((e) => { console.error('邮件发送失败：' + (e && e.message || e)); process.exit(1); });
