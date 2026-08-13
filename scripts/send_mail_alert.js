const { execFileSync } = require('child_process');

try {
  const reportRaw = process.argv[2] || '{}';
  const report = JSON.parse(reportRaw);
  if (report.ok) { console.log('健康正常，无需告警'); process.exit(0); }
  const errors = (report.errors || []).join('\n  - ');
  const home = report.home === null ? '未检查' : report.home;
  console.log(JSON.stringify({
    errors,
    home,
    supabase: report.supabase || '未检查',
    backup: report.backup ? JSON.stringify(report.backup) : '无'
  }, null, 2));
  const text = [
    '站点巡检发现异常：',
    '',
    '首页 HTTP：' + home,
    'Supabase：' + (report.supabase || '未检查'),
    '备份结果：' + (report.backup ? JSON.stringify(report.backup) : '无'),
    '',
    '异常详情：',
    (errors || '（无）'),
    '',
    '时间：' + (report.at || new Date().toISOString())
  ].join('\n');
  const env = Object.assign({}, process.env, {
    MAIL_SUBJECT: '【' + (process.env.SITE_NAME || '黄油站') + '】定时巡检异常',
    MAIL_REPLY: text,
    MAIL_ADMIN: '系统巡检',
    MAIL_TITLE: '定时巡检',
    MAIL_URL: '',
    MAIL_TO_NICK: '站长'
  });
  execFileSync(process.execPath, [require.resolve('./send_mail.js')], { env, stdio: 'inherit' });
} catch (e) {
  console.error('告警发送失败：' + (e.message || e));
  process.exit(1);
}