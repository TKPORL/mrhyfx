const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const mimeWord = (s: string) => "=?UTF-8?B?" + b64(s) + "?=";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const nl2br = (s: unknown): string => esc(s).replace(/\n/g, "<br>");

function buildHtml(o: { siteName: string; adminNick: string; toNick: string; postTitle: string; reply: string; url: string; logo: string }): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f2f7;-webkit-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;color:#1d1d1f;">
<div style="max-width:500px;margin:0 auto;padding:28px 16px 40px;">
  <div style="text-align:center;padding:8px 0 20px;">
    <img src="${esc(o.logo)}" alt="${esc(o.siteName)}" width="120" style="display:block;margin:0 auto;width:120px;height:auto;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.12);">
    <div style="margin-top:10px;font-size:15px;font-weight:600;color:#1d1d1f;">${esc(o.siteName)}</div>
    <div style="margin-top:2px;font-size:12px;color:#86868b;">站长回复了你的评论</div>
  </div>
  <div style="background:#ffffff;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 8px 24px rgba(0,0,0,.06);overflow:hidden;">
    <div style="padding:24px 22px 0;">
      <div style="font-size:17px;font-weight:700;color:#1d1d1f;">Hi，${esc(o.toNick)} 👋</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#48484a;">你在「<span style="font-weight:600;color:#1d1d1f;">${esc(o.postTitle)}</span>」的评论收到了站长 <span style="font-weight:600;color:#e5484d;">${esc(o.adminNick)}</span> 的回复：</div>
    </div>
    <div style="margin:16px 16px 0;padding:14px 16px;background:#fdf0f0;border-left:4px solid #e5484d;border-radius:12px;font-size:14px;line-height:1.7;color:#3a3a3c;">“${nl2br(o.reply)}”</div>
    <div style="padding:20px 16px 26px;text-align:center;">
      <a href="${esc(o.url)}" style="display:inline-block;padding:13px 34px;background:#e5484d;border-radius:13px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;box-shadow:0 4px 12px rgba(229,72,77,.35);">查看评论</a>
      <div style="margin-top:12px;font-size:12px;color:#86868b;">去帖子页查看完整的评论内容</div>
    </div>
  </div>
  <div style="padding:22px 12px 0;text-align:center;">
    <div style="font-size:12px;line-height:1.8;color:#a1a1a6;">这是一封由「${esc(o.siteName)}」自动发送的通知邮件</div>
    <div style="font-size:12px;line-height:1.8;color:#a1a1a6;">请勿直接回复，如需帮助请回到帖子评论区留言</div>
  </div>
</div>
</body>
</html>`;
}

interface SmtpOpts {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function smtpSend(o: SmtpOpts) {
  const net = await Deno.connectTls({ hostname: o.host, port: o.port });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  const write = async (s: string) => {
    const data = enc.encode(s);
    let i = 0;
    while (i < data.length) i += await net.write(data.subarray(i));
  };
  const readReply = async (): Promise<string> => {
    while (!buf.includes("\n")) {
      const chunk = new Uint8Array(4096);
      const n = await net.read(chunk);
      if (n === null) throw new Error("SMTP 连接被对方关闭");
      buf += dec.decode(chunk.subarray(0, n));
    }
    const i = buf.indexOf("\n");
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    return line;
  };
  const cmd = async (line: string, expectOk = true): Promise<string> => {
    await write(line + "\r\n");
    const r = await readReply();
    if (expectOk && !/^[23]/.test(r)) throw new Error("SMTP 服务器拒绝：" + r);
    return r;
  };
  try {
    await readReply();
    await cmd("EHLO mrhyfx.local");
    await cmd("AUTH LOGIN");
    await cmd(b64(o.user));
    await cmd(b64(o.pass));
    await cmd("MAIL FROM:<" + o.from + ">");
    await cmd("RCPT TO:<" + o.to + ">");
    await cmd("DATA");
    const bodyB64 = (s: string) => b64(s).replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
    const boundary = "mrhx_alt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const parts: string[] = [];
    if (o.html) {
      parts.push("--" + boundary);
      parts.push("Content-Type: text/plain; charset=UTF-8");
      parts.push("Content-Transfer-Encoding: base64");
      parts.push("");
      parts.push(bodyB64(o.text));
    }
    parts.push("--" + boundary);
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    parts.push(bodyB64(o.html || o.text));
    parts.push("--" + boundary + "--");
    const msg = [
      "From: " + mimeWord(o.fromName) + " <" + o.from + ">",
      "To: <" + o.to + ">",
      "Subject: " + mimeWord(o.subject),
      "Date: " + new Date().toUTCString(),
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      "",
      parts.join("\r\n"),
      "",
      ".",
    ].join("\r\n");
    await write(msg + "\r\n");
    const r = await readReply();
    if (!/^250/.test(r)) throw new Error("SMTP 发送失败：" + r);
    await cmd("QUIT", false);
  } finally {
    try {
      net.close();
    } catch (_) {}
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = req.headers.get("notify-secret") || "";
    const notifySecret = Deno.env.get("NOTIFY_SECRET") || "";
    if (!notifySecret || secret !== notifySecret) {
      return json({ ok: false, error: "notify-secret 不正确或未配置" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "请求体不是有效 JSON" }, 400);

    const reply = String(body.reply || "").trim();
    const to = String(body.to || "").trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ ok: false, error: "缺少有效的收件邮箱" }, 400);
    }
    if (!reply) return json({ ok: false, error: "缺少回复内容" }, 400);

    const host = Deno.env.get("SMTP_HOST") || "";
    const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const user = Deno.env.get("SMTP_USER") || "";
    const pass = Deno.env.get("SMTP_PASS") || "";
    if (!host || !user || !pass) {
      return json({ ok: false, error: "SMTP 未配置（请设置 SMTP_HOST / SMTP_USER / SMTP_PASS 等密钥）" }, 500);
    }

    const from = Deno.env.get("SMTP_FROM") || user;
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "站长";
    const siteName = Deno.env.get("SITE_NAME") || "Tsinho黄油站";
    const adminNick = String(body.adminNick || "站长");
    const toNick = String(body.toNick || "朋友");
    const postTitle = String(body.postTitle || body.url || "");
    const pageUrl = String(body.url || "").replace(/^\//, "");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://tkporl.github.io/mrhyfx/").replace(/\/+$/, "/");

    const text = [
      "Hi " + toNick + "：",
      "",
      "你在「" + postTitle + "」的评论收到了站长（" + adminNick + "）的回复：",
      "",
      "----------------------------------------",
      reply,
      "----------------------------------------",
      "",
      "去查看：" + siteUrl + pageUrl,
      "",
      "（这是一封系统自动发送的通知邮件，请勿直接回复）",
    ].join("\n");

    const html = buildHtml({ siteName, adminNick, toNick, postTitle, reply, url: siteUrl + pageUrl, logo: siteUrl + "logo.webp" });

    await smtpSend({ host, port, user, pass, from, fromName, to, subject: "【" + siteName + "】" + adminNick + " 回复了你的评论", text, html });
    return json({ ok: true, smtpHost: host, smtpPort: port, smtpUser: user });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
});