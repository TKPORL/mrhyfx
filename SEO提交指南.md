# 搜索引擎收录指南（照着点就行）

## 你只需要做一件事

去下面 5 个平台注册 → 添加网站 → 选「HTML 标签」验证方式 → 把它给你的一行代码复制发给 AI → 等推送后回去点「完成验证」→ 提交 sitemap。

网站地址统一填：`https://tkporl.github.io/mrhyfx/`

---

## 平台清单（按优先级排序）

### 1. 谷歌 Google Search Console（最简单，先做这个）
1. 打开 https://search.google.com/search-console 用谷歌账号登录（没有就注册一个）
2. 点「添加资源」→ 选「网址前缀」→ 填 `https://tkporl.github.io/mrhyfx/`
3. 验证方式选「HTML 标记」→ 复制那行 `<meta name="google-site-verification" ...>` 代码
4. **把代码发给 AI**，AI 会加进网站并推送
5. 推送完成后回到谷歌页面点「验证」
6. 左侧菜单「站点地图」→ 输入 `sitemap.xml` → 提交

### 2. 必应 Bing Webmaster Tools（可以一键从谷歌导入）
1. 打开 https://www.bing.com/webmasters 用微软账号登录
2. 最方便：选「从 Google Search Console 导入」（做完第 1 步就能直接导）
3. 手动添加的话同上：填网址 → HTML 标签验证 → 代码发 AI → 验证
4. sitemap 提交 `https://tkporl.github.io/mrhyfx/sitemap.xml`

### 3. 百度搜索资源平台（国内用户主要靠它）
1. 打开 https://ziyuan.baidu.com 用百度账号登录（需要手机号）
2. 「用户中心」→「站点管理」→「添加网站」→ 填 `https://tkporl.github.io/mrhyfx/`
3. 验证方式选「HTML 标签」→ 复制 `<meta name="baidu-site-verification" ...>` 发给 AI
4. 验证通过后在「普通收录」→「sitemap」提交 `https://tkporl.github.io/mrhyfx/sitemap.xml`
5. 注意：百度对 github.io 收录很慢（几周），属正常现象，不用反复提交

### 4. 搜狗站长平台（可选）
1. 打开 https://zhanzhang.sogou.com 用搜狗或微信账号登录
2. 「添加网站」→ 填网址 → 「HTML 标签验证」→ 代码发 AI
3. sitemap 同样提交上面的地址

### 5. Yandex（可选，俄罗斯引擎）
1. 打开 https://webmaster.yandex.com 注册/登录
2. 「添加站点」→ 填网址 → 「HTML 文件里的 Meta 标记」→ 代码发 AI
3. 「索引»站点地图」提交 sitemap

---

## AI 这边已经做好的（不用管）

- ✅ 全站每页都有 description / keywords / canonical / Open Graph 标签
- ✅ 关键词已埋好：Tsinho黄油站、Tsinho、tsinho、Tsinho工作室、黄油、黄油站、黄油分享、黄油游戏、PC黄油、安卓黄油、galgame、汉化黄油 等 21 个
- ✅ sitemap.xml 自动生成（每次更新帖子自动带上新页面）
- ✅ robots.txt 允许所有爬虫抓取
- ✅ 全站图标统一为网站 favicon
- ✅ site.json 已留好 `seo.verification` 字段，拿到验证码填进去重新生成即可

## 流程图

```
你注册账号 → 复制验证码发 AI → AI 填入并推送 → 你回平台点验证 → 提交 sitemap → 等几天开始被收录
```

有任何一个平台卡住了，把页面截图或提示发给 AI 就行。
