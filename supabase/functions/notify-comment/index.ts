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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = req.headers.get("notify-secret") || "";
    const notifySecret = Deno.env.get("NOTIFY_SECRET") || "";
    if (!notifySecret || secret !== notifySecret) {
      return json({ ok: false, error: "notify-secret 不正确或未配置" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "请求体不是有效 JSON" }, 400);

    const nick = String(body.nick || "匿名").trim();
    const content = String(body.content || "").trim();
    const url = String(body.url || "").replace(/^\//, "");
    if (!content) return json({ ok: false, error: "缺少评论内容" }, 400);

    const host = Deno.env.get("SMTP_HOST") || "";
    const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const user = Deno.env.get("SMTP_USER") || "";
    const pass = Deno.env.get("SMTP_PASS") || "";
    if (!host || !user || !pass) {
      return json({ ok: false, error: "SMTP 未配置（请设置 SMTP_HOST / SMTP_USER / SMTP_PASS 等密钥）" }, 500);
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

    await smtpSend({ host, port, user, pass, from, fromName, to, subject: "【" + siteName + "】收到一条新评论", text });
    return json({ ok: true, smtpHost: host, smtpPort: port, smtpUser: user });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
});