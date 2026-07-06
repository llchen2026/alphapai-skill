# PaiPai Agent 交互技能 (paipai-agent-interact)

通过 `browser-use` CLI 操控浏览器，与 [Alpha派 AlphaPai](https://alphapai-web.rabyte.cn) 平台进行全功能交互。

支持**全平台模块导航**（首页/PaiPai/PaiWork/云盘/日历/会议/研报/转记/翻译/公告/社媒）、**人工介入登录**、**PaiWork 工作区操作**、**Skills 定向调用**、**生成文件提取**，覆盖从登录到获取深度报告的完整链路。

---

## 功能一览

| 能力 | 说明 |
|------|------|
| **全平台模块导航** | 切换 AlphaPai 全部 11 个功能模块（使用 `#aside-menu-*` ID 定位，稳定可靠） |
| **人工登录介入** | 启动有头浏览器，用户手动完成登录（手机号/验证码或账号密码），登录态持久化 |
| **工作区导航** | 切换工作区/Skills 标签页，浏览文件树，打开/关闭文档 |
| **Skills 广场浏览** | 查看全部 31 个内置 Skills（研究/日报/数据库/工具四大类） |
| **Skills 定向调用** | 通过自然语言指定技能名称，让 PaiPai 执行特定分析任务 |
| **自动提问与回答** | JS 注入输入文本 → 点击发送 → 轮询检测完成状态 → 提取回答 |
| **深度报告提取** | 定位生成文件（.file-item）、点击重新打开、分段提取完整报告内容 |
| **多轮对话** | 在同一会话中进行追问和深入分析 |
| **页面状态管理** | 模型切换(Ultra/Lite)、知识库范围设置、日期范围设置、新建会话 |

### 已验证的 Skills 调用

| Skill | 输入示例 | 输出 |
|-------|---------|------|
| **公司一页纸** | `使用「公司一页纸」技能分析恒逸石化` | 生成 `恒逸石化_一页纸.md`，含核心结论/投资逻辑/竞争壁垒/财务分析/调研大纲/盈利预测等 |
| **通用问答** | `最新半导体设备观点` | 流式返回行业研报观点 |

---

## 前期准备

### 1. 安装 browser-use CLI

```bash
curl -fsSL https://browser-use.com/cli/install.sh | bash
```

安装完成后，CLI 位于 `~/.browser-use/bin`，运行时环境位于 `~/.browser-use-env/bin`。

验证安装：

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
browser-use doctor
```

### 2. 拥有 PaiPai 账号

访问 [alphapai-web.rabyte.cn](https://alphapai-web.rabyte.cn/reading/paiwork) 注册账号。首次使用时需要在浏览器中手动登录，登录后技能会自动保存登录态（cookie + localStorage），后续 30 天内无需重复登录。

### 3. 安装本 Skill

```bash
# 复制到 WorkBuddy 的 user-level skills 目录
mkdir -p ~/.workbuddy/skills/paipai-agent-interact
cp SKILL.md ~/.workbuddy/skills/paipai-agent-interact/
```

---

## 快速上手

### 第一步：启动浏览器并登录

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
mkdir -p ~/.browser-use/cookies

# 启动有头浏览器
browser-use --headed --session paipai open https://alphapai-web.rabyte.cn/reading/paiwork

# 如果有已保存的登录态，自动恢复
if [ -f ~/.browser-use/cookies/paipai_cookies.json ]; then
  browser-use --session paipai cookies import ~/.browser-use/cookies/paipai_cookies.json
fi
if [ -f ~/.browser-use/cookies/paipai_localstorage.json ]; then
  browser-use --session paipai eval "
    var data = JSON.parse($(cat ~/.browser-use/cookies/paipai_localstorage.json));
    for (var key in data) { window.localStorage.setItem(key, data[key]); }
    'restored';
  "
  browser-use --session paipai open https://alphapai-web.rabyte.cn/reading/paiwork
  sleep 3
fi

# 检查登录状态
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var token = window.localStorage.getItem('USER_AUTH_TOKEN');
  t && token && token.length > 50 ? 'LOGGED_IN' : 'NEED_LOGIN';
"
```

- **`LOGGED_IN`**：直接开始使用
- **`NEED_LOGIN`**：在浏览器窗口手动登录，登录后保存登录态：

```bash
# 登录成功后保存（只需执行一次，后续自动恢复）
browser-use --session paipai cookies export ~/.browser-use/cookies/paipai_cookies.json --url https://alphapai-web.rabyte.cn

browser-use --session paipai eval "
  var keys = Object.keys(window.localStorage);
  var data = {};
  for (var i = 0; i < keys.length; i++) { data[keys[i]] = window.localStorage.getItem(keys[i]); }
  JSON.stringify(data);
" > ~/.browser-use/cookies/paipai_localstorage.json
```

### 第二步：提问或调用 Skill

```bash
# 方式1：直接输入公司名（PaiPai 会自动匹配"公司一页纸"技能）
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '恒逸石化');
  t.dispatchEvent(new Event('input', { bubbles: true }));
"
browser-use --session paipai eval "document.querySelector('.submit-btn').click()"
```

```bash
# 方式2：显式指定技能名称
# 输入："使用「公司一页纸」技能分析恒逸石化"
# 输入："使用「行业一页纸」技能分析半导体设备行业"
# 输入："使用「可比公司分析」技能对比北方华创和中微公司"
```

### 第三步：等待输出并提取

```bash
# 轮询检测是否完成
browser-use --session paipai eval "
  var b = document.body.innerText;
  var t = b.includes('马不停蹄') || b.includes('努力思考');
  var d = b.includes('搞定回答');
  t ? 'GENERATING' : (d ? 'DONE' : 'UNKNOWN');
"

# 提取回答摘要
browser-use --session paipai eval "
  var cs = document.querySelectorAll('.text-content');
  cs[cs.length - 1].innerText;
"
```

---

## 核心技术点

### 全平台模块导航（ID 选择器）

AlphaPai 平台左侧导航栏有 11 个功能模块，每个菜单项都有稳定的 `id` 属性（`#aside-menu-*`），比 class 选择器更可靠：

| 模块 | ID | 说明 |
|------|----|------|
| 首页 | `#aside-menu-myFocus` | 个人首页/关注 |
| PaiPai | `#aside-menu-paipai` | AI 对话助手（独立入口） |
| PaiWork | `#aside-menu-ai-workbench` | AI 工作台（核心模块） |
| 云盘 | `#aside-menu-knowledge-base` | 知识库/文件管理 |
| 日历 | `#aside-menu-calendar` | 日程管理 |
| 会议 | `#aside-menu-meeting` | 会议纪要 |
| 研报 | `#aside-menu-report` | 研究报告 |
| 转记 | `#aside-menu-convert-meeting` | 会议转写 |
| 翻译 | `#aside-menu-translate-tool` | 翻译工具 |
| 公告 | `#aside-menu-announcement` | 公告信息 |
| 社媒 | `#aside-menu-social-media` | 社交媒体 |

切换方式：`document.querySelector('#aside-menu-xxx').click()`

### 登录态持久化（cookie + localStorage）

PaiPai 的认证机制：
- **`USER_AUTH_TOKEN`**（JWT 格式）存储在 **localStorage** 中，不在 cookie 中
- cookie 仅含埋点数据（sajssdk、sensorsdata）
- JWT 有效期约 **30 天**

因此登录态恢复需要两步：
1. `browser-use cookies import` 恢复 cookie
2. JS 注入 localStorage（`window.localStorage.setItem`），然后刷新页面

存储位置：`~/.browser-use/cookies/paipai_cookies.json` + `~/.browser-use/cookies/paipai_localstorage.json`

### Vue 响应式输入

PaiPai 前端基于 Vue，直接设置 `textarea.value` 不会触发响应式更新。必须使用原生 setter + 事件派发：

```javascript
var setter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype, 'value'
).set;
setter.call(textarea, '输入内容');
textarea.dispatchEvent(new Event('input', { bubbles: true }));
```

### 流式输出检测

PaiPai 的回答是流式渲染的。状态关键词：
- **生成中**：页面包含 "马不停蹄" 或 "正在努力思考"
- **已完成**：页面包含 "搞定回答" 且不再包含上述生成中关键词

深度报告类 Skills（公司一页纸、行业一页纸、深度报告）耗时约 **3-5 分钟**。

### 深度报告提取

Skills 生成的深度报告结构：
- **对话区域** `.text-content` — 仅包含简短摘要
- **生成文件项** `.file-item > .right > .title` — 文件名（可点击重新打开）
- **中间栏文档编辑器** `<p>` 标签 — 完整报告正文（可能 300+ 段落）
- **表格数据** `<table>` — 事件追踪表、财务数据表

完整报告需分段提取后拼接。

---

## Skills 广场完整清单（31个）

### 研究类（8个）
公司一页纸、行业一页纸、可比公司分析、主题选股、公司边际变化跟踪、公司调研大纲、观点 Challenge、深度报告

### 日报/事件类（9个）
宏观事件分析、历史复盘、全球资本市场日报、公众号订阅日报、调研/策略会日程、业绩/公告/事件点评、每日涨跌复盘、私域预约会议日报、公募基金研究

### 数据库类（11个）
A股/港股/美股投资数据库、全球市场数据库、实时行情数据库、全球宏观经济数据库(EDB)、公募基金数据库、债市研究数据库、Alpha派投研私域/公共知识库、Alpha派市场情绪数据库

### 工具类（3个）
浏览器代理、AI PPT、有道云笔记同步

---

## 页面布局

```
┌─────────────────────────────────────────────────────┐
│  左侧栏              中间栏              右侧栏        │
│  .cp-aside-section   .work-content-left  .work-chat  │
│                                                       │
│  ┌──────────┐       ┌──────────────┐  ┌────────────┐ │
│  │ 我的工作台│       │              │  │ PaiPai 对话│ │
│  │          │       │  文档编辑器   │  │            │ │
│  │ [工作区]  │       │  (在线文档/   │  │ 历史记录   │ │
│  │ [Skills] │       │   表格)       │  │            │ │
│  │          │       │              │  │            │ │
│  │ 文件树    │       │              │  │ ┌────────┐│ │
│  │ /Skills  │       │              │  │ │输入框   ││ │
│  │  广场    │       │              │  │ │.submit ││ │
│  │          │       │              │  │ │-btn    ││ │
│  └──────────┘       └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 常见问题

**Q: 登录态会丢失吗？**
A: 登录态通过 cookie + localStorage 双重持久化保存（`~/.browser-use/cookies/`），有效期约 30 天。`--session` 参数仅维持浏览器进程运行期间的上下文，进程关闭后需要通过保存的 cookie + localStorage 恢复。首次登录后执行保存命令即可。

**Q: browser-use 命令找不到？**
A: 确保设置了 PATH：`export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"`

**Q: 发送按钮点击没反应？**
A: 检查按钮是否处于 disabled 状态（icon 含 `disabled` 类名）。可改用 focus textarea + Enter 键发送。

**Q: 深度报告内容在哪里？**
A: 不在 `.text-content` 中（那里只有摘要）。完整报告在中间栏文档编辑器的 `<p>` 标签里，需分段提取。详见 SKILL.md「生成文件定位与内容提取」章节。

**Q: PaiPai 改版了怎么办？**
A: 如果页面 DOM 结构变化，需要更新 SKILL.md 中的 CSS 选择器。核心选择器见「页面元素速查表」。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 完整技能定义，AI 读取后按指令操作浏览器 |
| `README.md` | 本文档，面向人类用户 |

---

## License

MIT
