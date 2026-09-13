// ⚠️ 已废弃：本函数已被 GitHub Actions 方案替代（.github/workflows/notify-comment.yml + scripts/notify_comment_mail.js）
// 原由：Supabase 计划外停用 pg_net 的 HTTP POST 功能，改用 GitHub Actions repository_dispatch 触发邮件。
// 如果你已切换到新方案，可以安全删除本函数和旧的 upgrade_notify_comment.sql。

// CORS：只允许本站调用；服务端调用（数据库触发器/curl）无 Origin 头，放行
const ALLOWED_ORIGINS = [
  "https://tkporl.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = !origin || ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, notify-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(allow ? { Vary: "Origin" } : {}),
  };
}

// 来源限制：无 Origin/Referer = 非浏览器调用（Supabase pg_net 触发器、curl），放行
function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (origin === null) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  const referer = req.headers.get("Referer");
  if (referer) {
    try {
      const r = new URL(referer);
      if (ALLOWED_ORIGINS.includes(r.protocol + "//" + r.host)) return true;
    } catch (_) { /* 无效 Referer，继续拒绝 */ }
  }
  return false;
}

const json = (data, status = 200, req: Request) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const mimeWord = (s: string) => "=?UTF-8?B?" + b64(s) + "?=";

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
}

// #45：SMTP 整体 10 秒超时，避免邮件服务器挂死时函数无限等待
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: number | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label + "超时(" + ms / 1000 + "s)")), ms) as unknown as number;
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
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
    const bodyB64 = b64(o.text).replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
    const msg = [
      "From: " + mimeWord(o.fromName) + " <" + o.from + ">",
      "To: <" + o.to + ">",
      "Subject: " + mimeWord(o.subject),
      "Date: " + new Date().toUTCString(),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      bodyB64,
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });

  try {
    // 来源限制：浏览器跨站调用必须是本站
    if (!checkOrigin(req)) {
      return json({ ok: false, error: "调用来源不被允许" }, 403, req);
    }

    const secret = req.headers.get("notify-secret") || "";
    const notifySecret = Deno.env.get("NOTIFY_SECRET") || "";
    if (!notifySecret || secret !== notifySecret) {
      return json({ ok: false, error: "notify-secret 不正确或未配置" }, 401, req);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "请求体不是有效 JSON" }, 400, req);

    const nick = String(body.nick || "匿名").trim();
    const content = String(body.content || "").trim();
    const url = String(body.url || "").replace(/^\//, "");
    if (!content) return json({ ok: false, error: "缺少评论内容" }, 400, req);

    const host = Deno.env.get("SMTP_HOST") || "";
    const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const user = Deno.env.get("SMTP_USER") || "";
    const pass = Deno.env.get("SMTP_PASS") || "";
    if (!host || !user || !pass) {
      return json({ ok: false, error: "SMTP 未配置（请设置 SMTP_HOST / SMTP_USER / SMTP_PASS 等密钥）" }, 500, req);
    }

    const from = Deno.env.get("SMTP_FROM") || user;
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "黄油站站长";
    const siteName = Deno.env.get("SITE_NAME") || "黄油分享";
    const to = Deno.env.get("ADMIN_EMAIL") || user;
    const siteUrl = (Deno.env.get("SITE_URL") || "https://tkporl.github.io/mrhyfx/").replace(/\/+$/, "/");

    const text = [
      "站点收到一条新的评论：",
      "",
      "评论者：" + nick,
      "评论内容：",
      "----------------------------------------",
      content,
      "----------------------------------------",
      "",
      "帖子链接：" + siteUrl + url,
      "",
      "（这是一封系统自动发送的通知邮件，请勿直接回复）",
    ].join("\n");

    await withTimeout(smtpSend({ host, port, user, pass, from, fromName, to, subject: "【" + siteName + "】收到一条新评论", text }), 10000, "SMTP");
    // 安全：不回传 SMTP 配置（避免泄露发件邮箱）
    return json({ ok: true }, 200, req);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500, req);
  }
});