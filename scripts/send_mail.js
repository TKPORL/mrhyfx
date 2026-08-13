const tls = require('tls');

function smtpSend({ host, port, user, pass, from, fromName, to, subject, text }) {
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
            const bodyB64 = b64(text).replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
            const msg = [
              'From: ' + mimeWord(fromName) + ' <' + from + '>',
              'To: <' + to + '>',
              'Subject: ' + mimeWord(subject),
              'Date: ' + new Date().toUTCString(),
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=UTF-8',
              'Content-Transfer-Encoding: base64',
              '',
              bodyB64,
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
  const siteName = process.env.SITE_NAME || '黄油分享';
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
  await smtpSend({ host, port, user, pass, from, fromName, to, subject, text });
  console.log('邮件发送成功 -> ' + to);
})().catch((e) => { console.error('邮件发送失败：' + (e && e.message || e)); process.exit(1); });