import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

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
    const siteName = Deno.env.get("SITE_NAME") || "黄油分享";
    const adminNick = String(body.adminNick || "站长");
    const toNick = String(body.toNick || "朋友");
    const postTitle = String(body.postTitle || body.url || "");
    const pageUrl = String(body.url || "").replace(/^\//, "");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://tkporl.github.io/mrhyfx/").replace(/\/+$/, "/");

    const client = new SmtpClient();
    try {
      await client.connectTLS({
        hostname: host,
        port: port,
        username: user,
        password: pass,
      });
      await client.send({
        from: `${fromName} <${from}>`,
        to: to,
        subject: `【${siteName}】${adminNick} 回复了你的评论`,
        content: [
          `Hi ${toNick}：`,
          ``,
          `你在「${postTitle}」的评论收到了站长（${adminNick}）的回复：`,
          ``,
          `----------------------------------------`,
          reply,
          `----------------------------------------`,
          ``,
          `去查看：${siteUrl}${pageUrl}`,
          ``,
          `（这是一封系统自动发送的通知邮件，请勿直接回复）`,
        ].join("\n"),
      });
    } finally {
      try { await client.close(); } catch (_) {}
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
});
