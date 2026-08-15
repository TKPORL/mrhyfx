const tls = require('tls');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function buildHtml({ siteName, adminNick, toNick, postTitle, reply, url, logo }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f2f7;-webkit-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;color:#1d1d1f;">
<div style="max-width:500px;margin:0 auto;padding:28px 16px 40px;">
  <div style="text-align:center;padding:8px 0 20px;">
    <img src="${esc(logo)}" alt="${esc(siteName)}" width="120" style="display:block;margin:0 auto;width:120px;height:auto;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.12);">
    <div style="margin-top:10px;font-size:15px;font-weight:600;color:#1d1d1f;">${esc(siteName)}</div>
    <div style="margin-top:2px;font-size:12px;color:#86868b;">站长回复了你的评论</div>
  </div>
  <div style="background:#ffffff;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 8px 24px rgba(0,0,0,.06);overflow:hidden;">
    <div style="padding:24px 22px 0;">
      <div style="font-size:17px;font-weight:700;color:#1d1d1f;">Hi，${esc(toNick)} 👋</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#48484a;">你在「<span style="font-weight:600;color:#1d1d1f;">${esc(postTitle)}</span>」的评论收到了站长 <span style="font-weight:600;color:#e5484d;">${esc(adminNick)}</span> 的回复：</div>
    </div>
    <div style="margin:16px 16px 0;padding:14px 16px;background:#fdf0f0;border-left:4px solid #e5484d;border-radius:12px;font-size:14px;line-height:1.7;color:#3a3a3c;">“${nl2br(reply)}”</div>
    <div style="padding:20px 16px 26px;text-align:center;">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 34px;background:#e5484d;border-radius:13px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;box-shadow:0 4px 12px rgba(229,72,77,.35);">查看评论</a>
      <div style="margin-top:12px;font-size:12px;color:#86868b;">去帖子页查看完整的评论内容</div>
    </div>
  </div>
  <div style="padding:22px 12px 0;text-align:center;">
    <div style="font-size:12px;line-height:1.8;color:#a1a1a6;">这是一封由「${esc(siteName)}」自动发送的通知邮件</div>
    <div style="font-size:12px;line-height:1.8;color:#a1a1a6;">请勿直接回复，如需帮助请回到帖子评论区留言</div>
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

(async () => {
  const host = process.env.QQ_SMTP_HOST || 'smtp.qq.com';
  const port = parseInt(process.env.QQ_SMTP_PORT || '465', 10);
  const user = process.env.QQ_SMTP_USER || '';
  const pass = process.env.QQ_SMTP_PASS || '';
  const from = process.env.QQ_SMTP_FROM || user;
  const fromName = process.env.QQ_SMTP_FROM_NAME || '黄油站站长';
  const to = process.env.MAIL_TO || '';
  if (!user || !pass || !to) throw new Error('缺少配置：QQ_SMTP_USER / QQ_SMTP_PASS / MAIL_TO');
  const siteName = process.env.SITE_NAME || 'Tsinho黄油站';
  const adminNick = process.env.MAIL_ADMIN || '站长';
  const toNick = process.env.MAIL_TO_NICK || '朋友';
  const postTitle = process.env.MAIL_TITLE || '';
  const pageUrl = String(process.env.MAIL_URL || '').replace(/^\//, '');
  const siteUrl = (process.env.SITE_URL || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '/');
  const reply = String(process.env.MAIL_REPLY || '').trim();
  const subject = process.env.MAIL_SUBJECT || ('【' + siteName + '】' + adminNick + ' 回复了你的评论');
  const text = [
    'Hi ' + toNick + '：',
    '',
    '你在「' + postTitle + '」的评论收到了站长（' + adminNick + '）的回复：',
    '',
    '----------------------------------------',
    reply,
    '----------------------------------------',
    '',
    '去查看：' + siteUrl + pageUrl,
    '',
    '（这是一封系统自动发送的通知邮件，请勿直接回复）'
  ].join('\n');
  const url = siteUrl + pageUrl;
  const html = buildHtml({ siteName, adminNick, toNick, postTitle, reply, url, logo: siteUrl + 'logo.webp' });
  await smtpSend({ host, port, user, pass, from, fromName, to, subject, text, html });
  console.log('邮件发送成功 -> ' + to);
})().catch((e) => { console.error('邮件发送失败：' + (e && e.message || e)); process.exit(1); });