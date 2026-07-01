---
title: "派派Agent交互"
summary: "与 alphapai-web.rabyte.cn 平台全功能交互——支持全平台模块导航(首页/PaiPai/PaiWork/云盘/日历/会议/研报/转记/翻译/公告/社媒)、人工登录介入、工作区导航、Skills定向调用、自动输入提问、等待并提取回答"
read_when:
  - 需要操作 alphapai-web.rabyte.cn 上的任何功能模块
  - 需要在 AlphaPai 平台模块间导航切换
  - 需要人工先登录后自动操作的场景
  - 需要浏览/选择 PaiWork Skills 广场中的技能
  - 需要定向化调用特定 Skill 向 PaiPai 提问
---

# 派派Agent交互技能

与 `alphapai-web.rabyte.cn` 平台进行全功能交互。支持**全平台模块导航**（首页/PaiPai/PaiWork/云盘/日历/会议/研报/转记/翻译/公告/社媒）、**人工介入登录**、**PaiWork 工作区操作**、**Skills 定向调用**，登录后自动完成：输入提问 → 点击发送 → 等待输出 → 提取回答。

## 前提

- 已安装 `browser-use` CLI（`browser-use doctor` 通过）
- 如未安装：`curl -fsSL https://browser-use.com/cli/install.sh | bash`
- PATH 设置：`export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"`

## 环境变量（每个 bash 命令前需加）

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
```

## 页面布局概览

AlphaPai 平台分为两层：**全局导航栏**（左）+ **PaiWork 工作台**（右）。

### 全局导航栏（全平台模块切换）

| 模块 | ID 选择器 | 图标 class | 说明 |
|------|----------|-----------|------|
| **首页** | `#aside-menu-myFocus` | `.icon-shouye` | 个人首页/关注 |
| **PaiPai** | `#aside-menu-paipai` | `.icon-img` | AI 对话助手（独立入口） |
| **PaiWork** | `#aside-menu-ai-workbench` | `.icon-gongzuotai` | AI 工作台（核心模块） |
| **云盘** | `#aside-menu-knowledge-base` | `.icon-yunpan` | 知识库/文件管理 |
| **日历** | `#aside-menu-calendar` | `.icon-rili` | 日程管理 |
| **会议** | `#aside-menu-meeting` | `.icon-jiyao` | 会议纪要 |
| **研报** | `#aside-menu-report` | `.icon-yanbao1` | 研究报告 |
| **转记** | `#aside-menu-convert-meeting` | `.icon-zhuanji` | 会议转写记录 |
| **翻译** | `#aside-menu-translate-tool` | `.icon-fanyi` | 翻译工具 |
| **公告** | `#aside-menu-announcement` | `.icon-gonggao1` | 公告信息 |
| **社媒** | `#aside-menu-social-media` | `.icon-shemei` | 社交媒体 |

> **导航方式**：`document.querySelector('#aside-menu-xxx').click()` — 使用 ID 比 class 更稳定，不受样式变更影响。
> **当前选中模块**：带 `.is-active` 类的 `el-menu-item`。
> **导航容器**：`.app-left-side .app-nav .el-menu`

### PaiWork 工作台内部布局（三栏）

| 区域 | CSS 选择器 | 说明 |
|------|-----------|------|
| **左侧栏** | `.cp-aside-section` | 我的工作台、模式切换(PaiWork/AskPaiPai)、工作区文件树、Skills标签页、Skills广场入口 |
| **中间栏** | `.work-content-left` | 文档编辑器（在线文档/表格），支持多标签页 |
| **右侧栏** | `.work-content-chat` | PaiPai 对话区（历史记录 + 输入框） |

左侧栏有两个标签页：**工作区**（文件树）和 **Skills**（技能列表）。

---

## 一、启动与登录（含登录态持久化）

> **重要**：PaiPai 的认证令牌 `USER_AUTH_TOKEN`（JWT）存储在 **localStorage** 中，不在 cookie 中。cookie 仅含埋点数据。因此登录态持久化需要同时保存 cookie + localStorage。

### 登录态持久化目录

```
~/.browser-use/cookies/
  ├── paipai_cookies.json    # cookie 数据
  └── paipai_localstorage.json  # localStorage 数据（含 USER_AUTH_TOKEN）
```

### 第一步：尝试自动恢复登录态（无需人工登录）

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
mkdir -p ~/.browser-use/cookies

# 1. 启动浏览器并打开页面
browser-use --headed --session paipai open https://alphapai-web.rabyte.cn/reading/paiwork

# 2. 如果存在已保存的 cookie，先导入
if [ -f ~/.browser-use/cookies/paipai_cookies.json ]; then
  browser-use --session paipai cookies import ~/.browser-use/cookies/paipai_cookies.json
fi

# 3. 如果存在已保存的 localStorage，注入恢复
if [ -f ~/.browser-use/cookies/paipai_localstorage.json ]; then
  browser-use --session paipai eval "
    var data = JSON.parse($(cat ~/.browser-use/cookies/paipai_localstorage.json));
    for (var key in data) {
      window.localStorage.setItem(key, data[key]);
    }
    'localStorage_restored: ' + Object.keys(data).length + ' keys';
  "
  # 刷新页面让恢复的登录态生效
  browser-use --session paipai open https://alphapai-web.rabyte.cn/reading/paiwork
fi
```

### 第二步：检查登录状态

```bash
sleep 3
browser-use --session paipai eval "
  var hasTextarea = document.querySelector('textarea');
  var hasToken = window.localStorage.getItem('USER_AUTH_TOKEN');
  var tokenValid = hasToken && hasToken.length > 50;
  hasTextarea && tokenValid ? 'LOGGED_IN' : 'NEED_LOGIN';
"
```

- **返回 `LOGGED_IN`**：自动恢复成功，执行「清除新手引导遮罩」后开始使用
- **返回 `NEED_LOGIN`**：登录态已过期或不完整，进入第三步

### 清除新手引导遮罩（每次登录后必须执行）

PaiPai 登录后可能弹出新手引导浮层（driver.js 引导），会遮挡页面元素导致操作失败。必须清除后才能正常操作。

```bash
# 方法1（推荐）：循环点击"下一步"直到引导结束
browser-use --session paipai eval "
  var maxSteps = 10;
  var interval = setInterval(function() {
    var next = document.querySelector('.driver-popover-next-btn');
    if (next) {
      next.click();
      maxSteps--;
      if (maxSteps <= 0) clearInterval(interval);
    } else {
      clearInterval(interval);
    }
  }, 300);
  'dismissing_tour';
"

# 等待引导动画完成
sleep 3

# 检查是否清除成功
browser-use --session paipai eval "
  document.querySelector('.driver-active') ? 'STILL_BLOCKED' : 'CLEARED';
"

# 方法2（暴力）：直接移除遮罩 DOM 元素（如果方法1无效）
browser-use --session paipai eval "
  var driverEls = document.querySelectorAll('.driver-active, .driver-popover, .driver-overlay, .driver-page-overlay, [class*=\"driver-popover\"]');
  driverEls.forEach(function(el) { el.remove(); });
  'removed: ' + driverEls.length + ' elements';
"
```

### 第三步：人工登录（首次或 token 过期时）

```bash
# 提示用户在浏览器窗口中手动登录
# 登录方式：手机号+验证码 或 账号密码
# 登录完成后用户告知"已登录"
```

### 第四步：登录成功后保存登录态（关键！）

```bash
# 登录成功后，先清除新手引导遮罩（见上方），然后立即保存

# 1. 导出 cookie
browser-use --session paipai cookies export ~/.browser-use/cookies/paipai_cookies.json --url https://alphapai-web.rabyte.cn

# 2. 导出 localStorage（含 USER_AUTH_TOKEN）
browser-use --session paipai eval "
  var keys = Object.keys(window.localStorage);
  var data = {};
  for (var i = 0; i < keys.length; i++) {
    data[keys[i]] = window.localStorage.getItem(keys[i]);
  }
  JSON.stringify(data);
" > ~/.browser-use/cookies/paipai_localstorage.json

# 验证已保存
cat ~/.browser-use/cookies/paipai_localstorage.json | grep -o 'USER_AUTH_TOKEN' && echo 'TOKEN_SAVED' || echo 'NO_TOKEN'
```

### Token 有效期说明

- `USER_AUTH_TOKEN` 是 JWT 格式，`exp` 字段表示过期时间
- 当前观测有效期约 **30 天**（iat 1782917199 → exp 1785509199）
- 过期后需重新人工登录并重新保存

### 完整启动脚本（可直接复制使用）

```bash
#!/bin/bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
COOKIE_DIR="$HOME/.browser-use/cookies"
URL="https://alphapai-web.rabyte.cn/reading/paiwork"
mkdir -p "$COOKIE_DIR"

# 启动浏览器
browser-use --headed --session paipai open "$URL"
sleep 2

# 恢复 cookie
if [ -f "$COOKIE_DIR/paipai_cookies.json" ]; then
  browser-use --session paipai cookies import "$COOKIE_DIR/paipai_cookies.json"
fi

# 恢复 localStorage
if [ -f "$COOKIE_DIR/paipai_localstorage.json" ]; then
  browser-use --session paipai eval "
    var data = JSON.parse($(cat "$COOKIE_DIR/paipai_localstorage.json"));
    for (var key in data) { window.localStorage.setItem(key, data[key]); }
    'restored';
  "
  browser-use --session paipai open "$URL"
  sleep 3
fi

# 检查登录状态
STATUS=$(browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var token = window.localStorage.getItem('USER_AUTH_TOKEN');
  t && token && token.length > 50 ? 'LOGGED_IN' : 'NEED_LOGIN';
")

echo "STATUS: $STATUS"

if echo "$STATUS" | grep -q "NEED_LOGIN"; then
  echo "请手动在浏览器窗口完成登录"
  echo "登录完成后运行保存命令："
  echo "  browser-use --session paipai cookies export $COOKIE_DIR/paipai_cookies.json --url https://alphapai-web.rabyte.cn"
  echo "  browser-use --session paipai eval \"...localStorage dump...\" > $COOKIE_DIR/paipai_localstorage.json"
fi
```

---

## 二、工作区导航

### 切换标签页（工作区 ↔ Skills）

```bash
# 切换到 Skills 标签页
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.tab-item');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].innerText.includes('Skills')) { tabs[i].click(); break; }
  }
"

# 切换回工作区标签页
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.tab-item');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].innerText.includes('工作区')) { tabs[i].click(); break; }
  }
"
```

### 工作区文件树操作

工作区文件树包含用户创建的文件夹和文档：

```bash
# 获取工作区文件树中的所有节点名称
browser-use --session paipai eval "
  var nodes = document.querySelectorAll('.work-tree .node-label-name-wrap .node-name-ellipsis, .work-tree .node-label-name-wrap span');
  var names = [];
  nodes.forEach(function(n) { var t = n.innerText.trim(); if (t) names.push(t); });
  names.join(' | ');
"

# 展开某个文件夹（点击箭头图标）
browser-use --session paipai eval "
  var folders = document.querySelectorAll('.work-tree .tree-node');
  // 通过文件夹名称定位并点击展开
  for (var i = 0; i < folders.length; i++) {
    var label = folders[i].querySelector('.node-label-name-wrap');
    if (label && label.innerText.includes('快速入门')) {
      var arrow = folders[i].querySelector('.arrow i, .icon-arrow-right');
      if (arrow) arrow.click();
      break;
    }
  }
"

# 点击打开某个文档
browser-use --session paipai eval "
  var docs = document.querySelectorAll('.work-tree .node-row');
  for (var i = 0; i < docs.length; i++) {
    if (docs[i].innerText.includes('101_PaiWork是什么')) { docs[i].click(); break; }
  }
"
```

---

## 三、Skills 广场浏览与调用

### 已知 Skills 完整清单

PaiWork Skills 广场包含以下技能（截至 2026-06-30）：

**📋 研究类 Skills：**

| Skill 名称 | 用途 |
|-----------|------|
| 公司一页纸 | 为上市公司生成买方视角的投研快速了解报告 |
| 行业一页纸 | 为行业生成一页纸式的投研快速了解报告 |
| 可比公司分析 | 可比公司估值对比分析 |
| 主题选股 | 按主题/概念筛选股票池 |
| 公司边际变化跟踪 | 持续跟踪公司的重要边际变化 |
| 公司调研大纲 | 生成调研前的准备大纲 |
| 观点Challenge | 对某个投资观点进行多角度挑战和质疑 |
| 深度报告 | 生成深度投研报告 |

**📰 日报/事件类 Skills：**

| Skill 名称 | 用途 |
|-----------|------|
| 宏观事件分析 | 分析宏观事件对市场的影响 |
| 历史复盘 | 对特定事件/行情进行历史复盘 |
| 全球资本市场日报 | 全球市场每日概览 |
| 公众号订阅日报 | 订阅的公众号内容日报 |
| 调研/策略会日程 | 调研和策略会日程安排 |
| 业绩/公告/事件点评 | 对业绩/公告/事件进行快速点评 |
| 每日涨跌复盘 | 每日市场涨跌原因复盘 |
| 私域预约会议日报 | 私域预约会议的内容日报 |
| 公募基金研究 | 公募基金分析与研究 |

**🗄️ 数据库类 Skills：**

| Skill 名称 | 用途 |
|-----------|------|
| A股投资数据库 | A股基本面数据查询 |
| 港股投资数据库 | 港股基本面数据查询 |
| 美股投资数据库 | 美股基本面数据查询 |
| 全球市场数据库 | 全球市场行情数据 |
| 实时行情数据库 | 实时行情报价 |
| 全球宏观经济数据库（EDB） | 宏观经济指标数据 |
| 公募基金数据库 | 公募基金持仓/净值数据 |
| 债市研究数据库 | 债券市场数据 |
| Alpha派投研私域知识库 | 用户私域研究资料 |
| Alpha派投研公共文档库 | Alpha派公共投研文档 |
| Alpha派市场情绪数据库 | 热搜/蓝宝书等情绪数据 |

**🔧 工具类 Skills：**

| Skill 名称 | 用途 |
|-----------|------|
| 浏览器代理 | 自主浏览复杂网页获取信息 |
| AI PPT | 自动生成投研演示文稿 |
| 有道云笔记同步 | 同步有道云笔记内容 |

### 浏览 Skills 广场

```bash
# 切换到 Skills 标签
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.tab-item');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].innerText.includes('Skills')) { tabs[i].click(); break; }
  }
"
sleep 1

# 获取所有 Skill 名称（短文本行）
browser-use --session paipai eval "
  var main = document.querySelector('.ai-workbench-main');
  var lines = main.innerText.split('\\n');
  var skills = [];
  var seen = {};
  lines.forEach(function(line) {
    line = line.trim();
    if (line.length >= 2 && line.length <= 20 && !seen[line]) {
      if (!/^(我的|机构|官方|广场|数据|研究|工具|工作区|Skills|新建|搜索|刷新|多选)$/.test(line)) {
        seen[line] = 1;
        skills.push(line);
      }
    }
  });
  skills.join(' | ');
"

# 滚动查看更多 Skills
browser-use --session paipai scroll down --amount 2000

# 切换 Skills 分类标签（广场/数据/研究/工具/我的/机构/官方）
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.skills-label-tab');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].innerText.includes('研究')) { tabs[i].click(); break; }
  }
"
```

### 定向调用特定 Skill

在 PaiPai 输入框中通过 `/` 唤醒 Skills，或直接在提问中引用 Skill 名称：

```bash
# 方法1：在输入框中输入 "/" 触发 Skills 面板
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '/');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  'slash triggered';
"
sleep 1
# 然后查看 Skills 面板内容
browser-use --session paipai state

# 方法2（推荐）：直接在问题中引用 Skill 名称
# 例如调用"公司一页纸"技能
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '使用「公司一页纸」技能分析北方华创');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  'skill invoked';
"
# 点击发送
browser-use --session paipai eval "document.querySelector('.submit-btn').click(); 'sent'"

# 方法3：直接输入公司名/代码（PaiWork 会自动匹配"公司一页纸"技能）
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '北方华创');
  t.dispatchEvent(new Event('input', { bubbles: true }));
"
```

---

## 四、提问与回答提取

### 输入内容并发送

```bash
# 通过 JS 设置 textarea 值（解决 Vue 响应式问题）
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '你的问题内容');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  t.dispatchEvent(new Event('change', { bubbles: true }));
  'OK: ' + t.value;
"

# 点击发送按钮
browser-use --session paipai eval "
  var sendBtn = document.querySelector('.submit-btn');
  if (sendBtn) {
    var icon = sendBtn.querySelector('i');
    var isDisabled = icon ? icon.classList.contains('disabled') : false;
    if (!isDisabled) { sendBtn.click(); 'OK: clicked'; }
    else { 'BUTTON_DISABLED'; }
  } else { 'NO_BUTTON'; }
"
```

### 等待输出完成

```bash
# PaiPai 输出是流式的，需检测完成状态
# 状态关键词："正在努力思考" / "马不停蹄处理中" = 生成中；"搞定回答" = 完成

# 轮询检测（建议循环执行直到 DONE）
browser-use --session paipai eval "
  var body = document.body.innerText;
  var done = body.includes('搞定回答');
  var still = body.includes('马不停蹄') || body.includes('努力思考');
  done && !still ? 'DONE' : 'GENERATING';
"
```

### 提取回答

```bash
# 提取最新一条回答
browser-use --session paipai eval "
  var cs = document.querySelectorAll('.text-content');
  var last = cs[cs.length - 1];
  last ? last.innerText : 'NO_CONTENT';
"

# 提取指定关键词的回答（多轮对话时定位特定回答）
browser-use --session paipai eval "
  var cs = document.querySelectorAll('.text-content');
  var result = '';
  for (var i = 0; i < cs.length; i++) {
    var t = cs[i].innerText.trim();
    if (t.includes('半导体设备') && t.length > 200) { result = t; break; }
  }
  result.substring(0, 5000);
"

# 截图保存
browser-use --session paipai screenshot --full /tmp/paipai-answer.png
```

### 生成文件定位与内容提取（重要）

当 PaiPai 调用 Skills（如「公司一页纸」「行业一页纸」「深度报告」）时，会**生成文档文件**，该文件在对话区域和中间栏文档编辑器中同时出现。

**DOM 结构：**

```html
<!-- 对话区域中的文件项（可点击重新打开文档） -->
<div class="file-item">
  <img src="..." alt="">
  <div class="right">
    <div class="title">恒逸石化_一页纸.md</div>
  </div>
</div>
```

**点击文件项重新打开文档：**

```bash
# 点击 .file-item 在中间栏重新打开文档（即使之前关闭了标签页）
browser-use --session paipai eval "
  var items = document.querySelectorAll('.file-item');
  for (var i = 0; i < items.length; i++) {
    var title = items[i].querySelector('.title');
    if (title && title.innerText.includes('恒逸石化')) {
      items[i].click();
      break;
    }
  }
"
```

**定位生成的文件名：**

```bash
# 从对话区域 .file-item 提取生成的文件名
browser-use --session paipai eval "
  var items = document.querySelectorAll('.file-item .title');
  var names = [];
  items.forEach(function(t) { names.push(t.innerText.trim()); });
  names.join(' | ') || 'NO_FILES';
"
```

**提取报告完整内容（从中间栏文档编辑器）：**

> **关键：** Skills 生成的深度报告内容**不在 `.text-content` 中**（那里只有简短摘要），而是渲染在中间栏文档编辑器的多个 `<p>` 标签里，可能包含 300+ 个段落。需分段提取。

```bash
# 方法1：提取中间栏全部 <p> 段落（一次性获取，适合短报告）
browser-use --session paipai eval "
  var ps = document.querySelectorAll('.work-content-left p, .document-area p, .editor-area p');
  var r = [];
  for (var i = 0; i < ps.length; i++) {
    var t = ps[i].innerText.trim();
    if (t) r.push(t);
  }
  r.join('\n\n').substring(0, 5000);
"

# 方法2：分段提取长报告（推荐，适合公司一页纸等深度报告）
# 第一步：确认段落总数
browser-use --session paipai eval "document.querySelectorAll('p').length"

# 第二步：分段提取（每段约80-100个p）
browser-use --session paipai eval "
  var ps = document.querySelectorAll('p');
  var r = [];
  for (var i = 0; i < 90 && i < ps.length; i++) {
    var t = ps[i].innerText.trim();
    if (t) r.push(t);
  }
  r.join('\n').substring(0, 5000);
"
# 然后调整范围继续提取：i=90~180, 180~270, 270~330...

# 方法3：提取 table 数据（报告中的表格）
browser-use --session paipai eval "
  var tables = document.querySelectorAll('table');
  var r = [];
  for (var i = 0; i < 3; i++) {
    if (tables[i] && tables[i].innerText.trim()) {
      r.push('TABLE_' + i + ': ' + tables[i].innerText.substring(0, 1000));
    }
  }
  r.join(' || ') || 'no_tables';
"
```

**完整报告提取策略：**

1. 先从 `.text-content` 提取**核心摘要**（最后一轮对话的文字总结）
2. 从 `.file-item .title` 提取**文件名**
3. 从中间栏 `<p>` 标签**分段提取**完整报告正文（每次取80-100个p，substring截取5000字符）
4. 从 `<table>` 标签提取**表格数据**（事件追踪表、财务表等）
5. 将以上内容拼接整理为完整 Markdown 文件

---

## 五、全平台模块导航

AlphaPai 平台左侧导航栏包含 11 个功能模块，使用 `#aside-menu-*` ID 定位（比 class 更稳定）。

### 切换到指定模块

```bash
# 通用模板：替换 xxx 为目标模块名
browser-use --session paipai eval "
  var item = document.querySelector('#aside-menu-xxx');
  if (item) { item.click(); 'switched'; } else { 'not_found'; }
"
```

**各模块完整切换命令：**

```bash
# 首页
browser-use --session paipai eval "document.querySelector('#aside-menu-myFocus')?.click()"

# PaiPai（独立 AI 对话）
browser-use --session paipai eval "document.querySelector('#aside-menu-paipai')?.click()"

# PaiWork（AI 工作台 — 默认核心模块）
browser-use --session paipai eval "document.querySelector('#aside-menu-ai-workbench')?.click()"

# 云盘/知识库
browser-use --session paipai eval "document.querySelector('#aside-menu-knowledge-base')?.click()"

# 日历
browser-use --session paipai eval "document.querySelector('#aside-menu-calendar')?.click()"

# 会议
browser-use --session paipai eval "document.querySelector('#aside-menu-meeting')?.click()"

# 研报
browser-use --session paipai eval "document.querySelector('#aside-menu-report')?.click()"

# 转记（会议转写）
browser-use --session paipai eval "document.querySelector('#aside-menu-convert-meeting')?.click()"

# 翻译
browser-use --session paipai eval "document.querySelector('#aside-menu-translate-tool')?.click()"

# 公告
browser-use --session paipai eval "document.querySelector('#aside-menu-announcement')?.click()"

# 社媒
browser-use --session paipai eval "document.querySelector('#aside-menu-social-media')?.click()"
```

### 检测当前所在模块

```bash
browser-use --session paipai eval "
  var active = document.querySelector('.el-menu-item.is-active');
  active ? active.querySelector('.menu-name')?.innerText?.trim() : 'unknown';
"
```

### 等待模块加载

切换模块后，页面内容是异步加载的，需等待后才能操作：

```bash
# 切换后等待 2-3 秒
sleep 3
# 然后检查目标内容是否加载完成
browser-use --session paipai eval "document.querySelector('你的目标选择器') ? 'LOADED' : 'LOADING'"
```

---

## 六、其他页面操作

### 模型切换（Ultra ↔ Lite）

```bash
browser-use --session paipai eval "
  var pill = document.querySelector('.action-mode-pill');
  if (pill) { pill.click(); 'mode menu opened'; }
"
# 然后通过 state 选择 Ultra 或 Lite
```

### 设置知识库范围

```bash
# 展开问答范围选择器
browser-use --session paipai eval "
  document.querySelector('.plan-tag--trigger')?.click();
  'range opened';
"
# 可选的知识库：天华新能、中恒电气、天数智芯.HK、迅策.HK、滴普科技.HK、快速入门
```

### 设置日期范围

```bash
browser-use --session paipai eval "
  document.querySelector('.btn-date')?.click();
  'date range opened';
"
# 快捷选项：近一周/近一月/近三月/近半年/近一年/近二年/近三年
```

### 新建会话

```bash
browser-use --session paipai eval "
  var newBtn = document.querySelector('.icon-xinjianduihua');
  if (newBtn) { newBtn.closest('span, button, div')?.click(); 'new chat'; }
"
```

---

## 七、首页模块内容（#aside-menu-myFocus）

首页是聚合信息流，包含**一键唤醒 Agent 卡片**、**蓝宝书每日必看**、**机构热议**三大板块。

### 7.1 一键唤醒 Agent 卡片

首页顶部的快捷 Agent 入口（会议助手、公司一页纸、行业一页纸、写报告、画图）。

```bash
# 提取所有 Agent 卡片信息（名称 + 动作描述）
browser-use --session paipai eval "
  var cards = document.querySelectorAll('.agent-door .agent-card');
  var result = [];
  for (var i = 0; i < cards.length; i++) {
    var title = cards[i].querySelector('.card-title');
    var action = cards[i].querySelector('.card-action');
    result.push(
      (title ? title.innerText.trim() : 'N/A') +
      ' → ' +
      (action ? action.innerText.trim() : '')
    );
  }
  result.join(' | ');
"
```

**选择器：**

| 元素 | 选择器 | 说明 |
|------|--------|------|
| Agent 卡片容器 | `.agent-door .agent-card` | 单个 Agent 卡片 |
| 卡片标题 | `.agent-card .card-title` | 如"会议助手""公司一页纸" |
| 卡片动作描述 | `.agent-card .card-action` | 如"3分钟get公司基本面" |
| 更多入口 | `.agent-door .more-link` | "更多"链接 |
| 区域标题 | `.agent-door-header .header-title .title-text` | "一键唤醒" |

### 7.2 蓝宝书（每日必看）

PaiPai 总结的每日研报精选，分国内版和全球版。

```bash
# 提取蓝宝书卡片信息
browser-use --session paipai eval "
  var cards = document.querySelectorAll('.blue-book-card');
  var result = [];
  for (var i = 0; i < cards.length; i++) {
    var isDomestic = cards[i].classList.contains('domestic');
    var title = cards[i].querySelector('.card-title');
    var summary = cards[i].querySelector('.summary');
    var time = cards[i].querySelector('.update-time');
    result.push(
      (isDomestic ? '[国内]' : '[全球]') + ' ' +
      (title ? title.innerText.trim() : '') +
      ' | ' + (summary ? summary.innerText.trim() : '') +
      ' | ' + (time ? time.innerText.trim() : '')
    );
  }
  result.join('\n');
"
```

**选择器：**

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 蓝宝书容器 | `.blue-book-container` | 整个蓝宝书板块 |
| 国内版卡片 | `.blue-book-card.domestic` | 国内每日必看 |
| 全球版卡片 | `.blue-book-card.global` | 全球每日必看 |
| 卡片标题 | `.blue-book-card .card-title` | 如"7月1日晚间版" |
| 摘要 | `.blue-book-card .summary` | 核心要点摘要 |
| 更新时间 | `.blue-book-card .update-time` | 如"今天 20:06" |
| 播放按钮 | `.blue-book-card .play-btn` | 语音播报按钮 |
| 更多入口 | `.blue-book-container .more-btn` | "更多"链接 |

### 7.3 机构热议（研报 + 点评信息流）

基于用户自选股/板块定制的信息流，包含**研报卡片**和**机构点评卡片**两种类型。

```bash
# 提取所有研报卡片信息
browser-use --session paipai eval "
  var cards = document.querySelectorAll('.cp-recommend-wrap .report-card');
  var result = [];
  for (var i = 0; i < cards.length; i++) {
    var broker = cards[i].querySelector('.left .name');
    var title = cards[i].querySelector('.title-box .title');
    var summary = cards[i].querySelector('.summary');
    var industry = cards[i].querySelector('.industry-box .item-bottom-text');
    var time = cards[i].querySelector('.time');
    var page = cards[i].querySelector('.page');
    result.push(
      '[' + (broker ? broker.innerText.trim() : '') + '] ' +
      (title ? title.innerText.trim() : '') +
      ' | 行业: ' + (industry ? industry.innerText.trim() : 'N/A') +
      ' | ' + (page ? page.innerText.trim() : '') +
      ' | ' + (time ? time.innerText.trim() : '')
    );
  }
  result.join('\n');
"

# 提取所有机构点评卡片信息
browser-use --session paipai eval "
  var cards = document.querySelectorAll('.cp-recommend-wrap .comment-card');
  var result = [];
  for (var i = 0; i < cards.length; i++) {
    var source = cards[i].querySelector('.left .name');
    var title = cards[i].querySelector('.comment-title .title');
    var content = cards[i].querySelector('.content');
    var tags = cards[i].querySelectorAll('.comment-title .tag');
    var industry = cards[i].querySelector('.industry-box .item-bottom-text');
    var time = cards[i].querySelector('.industry-and-stock .time');
    var tagText = [];
    tags.forEach(function(t){ tagText.push(t.innerText.trim()); });
    result.push(
      '[' + (source ? source.innerText.trim() : '') + '] ' +
      (title ? title.innerText.trim() : '') +
      (tagText.length ? ' (' + tagText.join(',') + ')' : '') +
      ' | 行业: ' + (industry ? industry.innerText.trim() : 'N/A') +
      ' | ' + (time ? time.innerText.trim() : '')
    );
  }
  result.join('\n');
"
```

**选择器：**

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 信息流容器 | `.cp-recommend-wrap` | 机构热议内容区 |
| 空状态 | `.cp-no-follow-stock-wrap` | 未添加自选股时显示 |
| 空状态按钮 | `.cp-no-follow-stock-btn` | "立即添加自选股" |
| **研报卡片** | `.report-card` | 单条研报 |
| 研报-券商logo | `.report-card .left .logo` | 券商 logo |
| 研报-券商名称 | `.report-card .left .name` | 如"中泰证券""华泰期货" |
| 研报-标题 | `.report-card .title-box .title` | 研报标题 |
| 研报-摘要 | `.report-card .summary` | 研报摘要内容 |
| 研报-行业标签 | `.report-card .industry-box .item-bottom-text` | 如"电力设备""电子" |
| 研报-个股标签 | `.report-card .single-stock-with-focus .stock-name` | 关联个股名称 |
| 研报-页数 | `.report-card .page` | 如"15页""10页" |
| 研报-时间 | `.report-card .time` | 如"今天""昨天" |
| 研报-PDF图标 | `.report-card .pdf-icon` | 表示有 PDF |
| **点评卡片** | `.comment-card` | 单条机构点评 |
| 点评-来源 | `.comment-card .left .name` | 如"机构点评""华创海外""华西机械" |
| 点评-标题 | `.comment-card .comment-title .title` | 点评标题 |
| 点评-标签 | `.comment-card .comment-title .tag` | 如"干货""业绩点评" |
| 点评-正文 | `.comment-card .content` | 点评详细内容 |
| 点评-行业标签 | `.comment-card .industry-box .item-bottom-text` | 关联行业 |
| 点评-个股标签 | `.comment-card .single-stock-with-focus .stock-name` | 关联个股 |
| 点评-时间 | `.comment-card .industry-and-stock .time` | 如"23小时前""昨天" |
| 点评-关闭按钮 | `.comment-card .btn-close` | 关闭推荐卡片 |
| **板块切换** | `.my-focus-header-container .title .active` | 当前选中的 Tab（如"机构热议"） |

### 7.4 点击研报/点评卡片查看详情

```bash
# 点击第1条研报卡片
browser-use --session paipai eval "
  var card = document.querySelectorAll('.cp-recommend-wrap .report-card')[0];
  if (card) { card.click(); 'clicked'; } else { 'no_card'; }
"

# 点击第1条点评卡片
browser-use --session paipai eval "
  var card = document.querySelectorAll('.cp-recommend-wrap .comment-card')[0];
  if (card) { card.click(); 'clicked'; } else { 'no_card'; }
"
```

---

## 八、完整工作流示例

### 示例1：定向调用 Skill 分析公司

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"

# 1. 确认已登录
browser-use --session paipai eval "document.querySelector('textarea') ? 'OK' : 'NEED_LOGIN'"

# 2. 浏览 Skills 列表
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.tab-item');
  for (var i = 0; i < tabs.length; i++) { if (tabs[i].innerText.includes('Skills')) tabs[i].click(); }
"
sleep 1
browser-use --session paipai eval "
  var main = document.querySelector('.ai-workbench-main');
  main.innerText.split('\\n').filter(function(l) {
    l = l.trim(); return l.length >= 2 && l.length <= 20;
  }).join(' | ');
"

# 3. 切回工作区
browser-use --session paipai eval "
  var tabs = document.querySelectorAll('.tab-item');
  for (var i = 0; i < tabs.length; i++) { if (tabs[i].innerText.includes('工作区')) tabs[i].click(); }
"

# 4. 调用"公司一页纸"技能
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, '使用公司一页纸技能分析北方华创');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  'OK';
"
browser-use --session paipai eval "document.querySelector('.submit-btn').click()"

# 5. 等待完成（循环检测）
sleep 20
browser-use --session paipai eval "
  var body = document.body.innerText;
  body.includes('搞定回答') && !body.includes('马不停蹄') ? 'DONE' : 'GENERATING';
"

# 6. 提取回答
browser-use --session paipai eval "
  var cs = document.querySelectorAll('.text-content');
  cs[cs.length - 1]?.innerText?.substring(0, 5000) || 'waiting';
"
```

### 示例2：多轮对话

```bash
# 第1轮
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  s.call(t, '最新半导体设备观点');
  t.dispatchEvent(new Event('input', {bubbles:true}));
"
browser-use --session paipai eval "document.querySelector('.submit-btn').click()"

# 等待完成...
sleep 25

# 第2轮（追问）
browser-use --session paipai eval "
  var t = document.querySelector('textarea');
  var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  s.call(t, '北方华创的最新订单情况如何？');
  t.dispatchEvent(new Event('input', {bubbles:true}));
"
browser-use --session paipai eval "document.querySelector('.submit-btn').click()"

# 提取所有回答
browser-use --session paipai eval "
  var cs = document.querySelectorAll('.text-content');
  var all = [];
  for (var i = 0; i < cs.length; i++) {
    all.push('--- 回答' + (i+1) + ' ---');
    all.push(cs[i].innerText.substring(0, 500));
  }
  all.join('\\n');
"
```

---

## 页面元素速查表

| 元素 | CSS 选择器 | 说明 |
|------|-----------|------|
| 输入框 | `textarea` / `textarea.input-textarea` | 输入提问内容 |
| 发送按钮 | `.submit-btn` | 提交提问 |
| 回答区域 | `.text-content` | AI 回答内容容器 |
| 回答状态 | `.step-title` | "搞定回答"/"正在努力思考" |
| 模型切换 | `.action-mode-pill` | Ultra/Lite 模型切换 |
| 问答范围 | `.plan-tag--trigger` | 设置知识库范围 |
| 日期范围 | `.btn-date` | 设置时间范围 |
| 附件上传 | `.upload-file input[type=file]` | 上传文件 |
| 上下文用量 | `.context-token-ring` | 显示上下文消耗百分比 |
| 工作区/Skills切换 | `.tab-item` | 左侧栏标签页 |
| 文件树节点 | `.work-tree .node-row` | 工作区文件/文件夹 |
| Skills卡片名称 | `.ai-workbench-main` (innerText) | Skills 广场技能列表 |
| 新会话按钮 | `.icon-xinjianduihua` | 新建对话 |
| 历史记录 | `.icon-lishijilu` | 查看历史对话 |
| 定时任务 | `.icon-dingshirenwu1` | 定时任务设置 |
| 参考资料链接 | `.reference-link` | 回答底部的参考资料 |
| **生成文件项** | `.file-item`（可点击）/ `.file-item .title` | Skills 生成的文档，点击可在中间栏重新打开 |
| **报告正文段落** | 中间栏 `.work-content-left p` 等 | Skills 生成的深度报告内容（300+段落） |
| **报告表格** | `table` | 报告中的数据表格（事件追踪/财务表） |
| **新手引导遮罩** | `.driver-active` / `.driver-popover-next-btn` | 登录后弹出，需点击"下一步"直到消失或直接移除 DOM |
| **导航-首页** | `#aside-menu-myFocus` | 全局导航：个人首页 |
| **导航-PaiPai** | `#aside-menu-paipai` | 全局导航：AI 对话助手 |
| **导航-PaiWork** | `#aside-menu-ai-workbench` | 全局导航：AI 工作台（核心） |
| **导航-云盘** | `#aside-menu-knowledge-base` | 全局导航：知识库/文件管理 |
| **导航-日历** | `#aside-menu-calendar` | 全局导航：日程管理 |
| **导航-会议** | `#aside-menu-meeting` | 全局导航：会议纪要 |
| **导航-研报** | `#aside-menu-report` | 全局导航：研究报告 |
| **导航-转记** | `#aside-menu-convert-meeting` | 全局导航：会议转写 |
| **导航-翻译** | `#aside-menu-translate-tool` | 全局导航：翻译工具 |
| **导航-公告** | `#aside-menu-announcement` | 全局导航：公告信息 |
| **导航-社媒** | `#aside-menu-social-media` | 全局导航：社交媒体 |
| **导航-当前模块** | `.el-menu-item.is-active` | 带 `.is-active` 类的为当前选中模块 |
| **首页-Agent卡片** | `.agent-door .agent-card` | 一键唤醒 Agent 入口（会议助手/公司一页纸等） |
| **首页-蓝宝书国内** | `.blue-book-card.domestic` | 每日必看国内版 |
| **首页-蓝宝书全球** | `.blue-book-card.global` | 每日必看全球版 |
| **首页-蓝宝书摘要** | `.blue-book-card .summary` | 核心要点摘要 |
| **首页-研报卡片** | `.report-card` | 机构热议中的研报 |
| **首页-研报券商** | `.report-card .left .name` | 研报来源券商 |
| **首页-研报标题** | `.report-card .title-box .title` | 研报标题 |
| **首页-点评卡片** | `.comment-card` | 机构热议中的点评 |
| **首页-点评来源** | `.comment-card .left .name` | 点评来源（如"华创海外"） |
| **首页-点评正文** | `.comment-card .content` | 点评详细内容 |
| **首页-空状态** | `.cp-no-follow-stock-btn` | 未添加自选股时的引导按钮 |

## 注意事项

1. **登录态持久化**：PaiPai 的认证令牌 `USER_AUTH_TOKEN`（JWT）存在 **localStorage** 中而非 cookie。需同时保存 cookie + localStorage 才能跨会话恢复登录态（见「一、启动与登录」）。Token 有效期约 30 天
2. **新手引导遮罩**：每次登录后 PaiPai 可能弹出 driver.js 新手引导（`.driver-active`），会遮挡所有操作。**登录后必须先清除遮罩**再执行后续操作（见「清除新手引导遮罩」章节）
3. **Vue 响应式**：设置 textarea 值时必须使用 `nativeInputValueSetter` + `dispatchEvent('input')`，否则 Vue 不会更新
4. **流式输出**：AI 回答是流式的，必须等待"搞定回答"且无"马不停蹄"再提取
5. **上下文限制**：页面有上下文消耗指示（`.context-token-ring`），超限（通常>80%）需新建会话
6. **Skills 自动匹配**：仅输入公司名/代码时，PaiWork 会自动匹配"公司一页纸"技能
7. **不要伪造内容**：所有内容必须通过 `browser-use eval` 实际获取
8. **PATH**：每个 bash 命令前需 `export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"`
9. **深度报告内容位置**：Skills 生成的深度报告（如公司一页纸）内容在**中间栏 `<p>` 标签**中（300+段落），不在 `.text-content` 中（那里只有简短摘要）。需分段提取后拼接
10. **等待时间**：深度报告类 Skills（公司一页纸、行业一页纸、深度报告）生成耗时较长（3-5分钟），需多次轮询检测完成状态

## 自动扫描工具（页面结构自动发现）

本 skill 内置了 **DOM 结构自动扫描器**，可以自动遍历 AlphaPai 全部 11 个模块，扫描每个页面的板块容器、交互节点、内容节点，生成结构化选择器表并更新到本文件末尾的附录中。

**无需手动粘贴 HTML**——当页面结构变化或需要发现新元素时，直接运行扫描器即可。

### 扫描工具文件

```
scripts/
├── dom-scanner.js           # JS 扫描器（注入页面执行）
├── scan-all-modules.sh      # 多模块遍历 runner
└── format-scan-results.py   # JSON→Markdown 格式化器
```

### 一键全量扫描

```bash
export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"
bash ~/.workbuddy/skills/paipai-agent-interact/scripts/scan-all-modules.sh
```

扫描完成后结果保存在 `scan-results/` 目录：
- `<module>.json` — 每个模块的原始扫描数据
- `_combined.json` — 合并文件

### 扫描指定模块

```bash
# 只扫描首页和 PaiWork
bash scripts/scan-all-modules.sh myFocus ai-workbench
```

### 更新 SKILL.md 附录

```bash
python3 scripts/format-scan-results.py --update-skill
```

该命令会读取 `_combined.json`，生成 Markdown 选择器表格，自动替换本文件末尾 `<!-- AUTO_SCAN_* -->` 标记之间的内容。

### 扫描器输出字段说明

每个扫描到的节点包含：

| 字段 | 说明 |
|------|------|
| `type` | 元素类型（`interactive:button`/`content:card`/`container` 等） |
| `selector` | 自动生成的 CSS 选择器 |
| `text` | 可见文本（截断200字） |
| `classes` | 有意义的 class 列表 |
| `hasInteraction` | 是否有交互行为 |
| `depth` | DOM 层级深度 |
| `validSelector` | 选择器是否经 `querySelector` 验证有效 |
| `rect` | 元素尺寸 `{w, h}` |

### 扫描器发现的板块

扫描器自动识别以下已知板块 + 自动发现未知板块：

**已知板块**：全局导航栏、PaiWork 左/中/右栏、输入区、首页 Agent 卡片、蓝宝书、机构热议、Skills 广场、工作区文件树、首页头部 Tab

**自动发现**：扫描所有带 `cp-`/`work-`/`agent-`/`blue-`/`report-`/`comment-`/`skill-`/`file-`/`tree-`/`aside-`/`app-`/`my-` 前缀 class 的容器，且不被已知板块包含的独立容器

## 关闭浏览器

```bash
browser-use --session paipai close
```


---

## 附录：自动扫描结果（页面结构明细）

<!-- AUTO_SCAN_DETAIL_START -->
<!-- Auto-generated by format-scan-results.py at 2026-07-01 23:08 -->
<!-- Source: scan-results/_combined.json -->

### PaiWork（#ai-workbench）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork ← 当前
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### PaiWork左侧栏
> 容器: `.cp-aside-section`
> 内容: 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 工作区 Skills 创建文件夹 创建在线文档 ...

**标签页（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.tab-header-wrap` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格 多选 刷新 | 200×41 | ✓ |
| `div.tab-header` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格 多选 刷新 | 200×35 | ✓ |

**导航项（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 | 200×80 | ✓ |

**可点击区域（4个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle` |  | 24×24 | ✓ |
| `div.skills-square-entry` | Skills广场 | 200×38 | ✓ |
| `span.action-btn` |  | 67×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn` |  | 67×20 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-title` | PaiWork | 107×22 | ✓ |
| `div.entry-title` | Skills广场 | 141×22 | ✓ |

**卡片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-item` | PaiWork AI工作台 | 192×34 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-desc` | AI工作台 | 47×20 | ✓ |
| `div.entry-content` | Skills广场 | 141×22 | ✓ |

**图片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.entry-icon` |  | 14×19 | ✓ |

**图标（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle .iconfont` |  | 20×20 | ✓ |
| `i.iconfont` |  | 16×24 | ⚠ |
| `div.skills-square-entry .iconfont` |  | 13×20 | ✓ |
| `div.btn-icon` |  | 20×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn .iconfont` |  | 14×21 | ✓ |

---

#### PaiWork中间栏
> 容器: `.work-content-left`
> 内容: 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表格 快速入门 101...

**编辑器（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.ai-workbench-work-editor-container` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 650×691 | ✓ |
| `div.work-editor-main` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 650×691 | ✓ |
| `div.work-editor-tabs` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 650×691 | ✓ |
| `div.work-editor-tab-bar` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 650×30 | ✓ |
| `div.work-editor-tab-nav-cluster` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 630×30 | ✓ |
| `div.work-editor-tab-nav` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 630×30 | ✓ |
| `span.work-editor-tab-add-dropdown-wrap` | 创建在线文档 创建在线表格 | 36×12 | ✓ |
| `div.work-editor-tab-close` |  | 20×18 | ✓ |
| `div.work-editor-tab-panels` | 快速入门 101_PaiWork是什么.md Word MarkDown 复制 历史版本 存入左侧工... | 650×661 | ✓ |
| `div.work-editor-tab-panel` | 快速入门 101_PaiWork是什么.md Word MarkDown 复制 历史版本 存入左侧工... | 650×661 | ✓ |
| `div.ai-workbench-work-editor-content` | 快速入门 101_PaiWork是什么.md Word MarkDown 复制 历史版本 存入左侧工... | 650×659 | ✓ |

**卡片（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.custom-item` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 | 250×30 | ✓ |
| `div.custom-item-tooltip-wrap` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 | 250×21 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.work-content-left` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 650×699 | ✓ |
| `div.ai-workbench-doc-content` | 目录 PaiWork 101 PaiWork是什么 PaiWork = PaiPai + CoWor... | 650×619 | ✓ |

**图标（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.work-editor-tab-close .iconfont` |  | 12×18 | ✓ |

---

#### PaiWork右侧栏(对话区)
> 容器: `.work-content-chat`
> 内容: PaiPai 新会话 定时任务 历史记录 使用「公司一页纸」技能分析恒逸石化 提问时间：06.30 12:18 PaiP...

**按钮（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.action-mode-pill` | Ultra | 84×28 | ✓ |

**输入框（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `textarea.input-textarea` |  | 270×52 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.reference-link` | 全部参考资料 | 124×34 | ✓ |
| `span.plan-tag` |  | 24×24 | ✓ |
| `span.btn-action-right` |  | 28×28 | ✓ |
| `span.btn-action-right .upload-file` |  | 28×28 | ✓ |
| `div.upload-button` |  | 28×28 | ✓ |
| `span` | 近一周 近一月 近三月 近半年 近一年 近二年 近三年 2026年 6 月 日 一 二 三 四 五 ... | 28×25 | ⚠ |

**卡片（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.file-item` | 恒逸石化_一页纸.md | 292×40 | ✓ |
| `div.input-card` | 天华新能 中恒电气 天数智芯.HK 迅策.HK 滴普科技.HK 快速入门 Ultra 顶配模型 Li... | 288×147 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.work-content-chat` | PaiPai 新会话 定时任务 历史记录 使用「公司一页纸」技能分析恒逸石化 提问时间：06.30 ... | 328×699 | ✓ |
| `div.text-content` | 已完成恒逸石化（000703.SZ）一页纸报告，保存于 恒逸石化_一页纸.md 。 核心结论：恒逸石... | 292×734 | ✓ |

**图片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.logo-circle .logo-img` |  | 24×24 | ✓ |

**图标（7个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.icon-btn` |  | 24×24 | ⚠ |
| `i.iconfont` |  | 16×24 | ⚠ |
| `span.icon-line` |  | 1×12 | ✓ |
| `div.header-right > span.icon-btn` |  | 24×24 | ✓ |
| `div.header-right > span.icon-btn .iconfont` |  | 16×24 | ✓ |
| `span.plan-tag .iconfont` |  | 11×10 | ✓ |
| `span.btn-action-right > i.iconfont` |  | 26×27 | ✓ |

**段落（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `p.input-disclaimer` | 回答由AI生成,仅供研究参考,不构成任何投资建议 | 288×15 | ✓ |

---

#### 输入区
> 容器: `.input-card`
> 内容: 天华新能 中恒电气 天数智芯.HK 迅策.HK 滴普科技.HK 快速入门 Ultra 顶配模型 Lite 高性价比 Ul...

**按钮（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.action-mode-pill` | Ultra | 84×28 | ✓ |

**输入框（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `textarea.input-textarea` |  | 270×52 | ✓ |

**可点击区域（7个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.plan-tag` |  | 24×24 | ✓ |
| `span.mode-pill-label` | Ultra | 28×14 | ✓ |
| `span.btn-action-right` |  | 28×28 | ✓ |
| `span.btn-action-right .upload-file` |  | 28×28 | ✓ |
| `div.upload-button` |  | 28×28 | ✓ |
| `span` | 近一周 近一月 近三月 近半年 近一年 近二年 近三年 2026年 6 月 日 一 二 三 四 五 ... | 28×25 | ⚠ |
| `div.btn-date` |  | 28×28 | ✓ |

**卡片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.input-card` | 天华新能 中恒电气 天数智芯.HK 迅策.HK 滴普科技.HK 快速入门 Ultra 顶配模型 Li... | 288×147 | ✓ |

**图标（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.plan-tag .iconfont` |  | 11×10 | ✓ |
| `i.iconfont` |  | 14×14 | ⚠ |
| `div.upload-button .iconfont` |  | 18×27 | ✓ |
| `div.btn-date .iconfont` |  | 18×28 | ✓ |
| `span.btn-action-right > i.iconfont` |  | 26×27 | ✓ |

---

#### Skills广场
> 容器: `.ai-workbench-main`
> 内容: 工作区 Skills 创建文件夹 创建在线文档 创建在线表格 多选 刷新 天华新能 中恒电气 天数智芯.HK 迅策.HK...

**标签页（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.tab-header-wrap` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格 多选 刷新 | 200×41 | ✓ |
| `div.tab-header` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格 多选 刷新 | 200×35 | ✓ |
| `div.tabs` | 工作区 Skills | 87×22 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.node-row` | 天华新能 | 200×28 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row` | 中恒电气 | 200×28 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row` | 天数智芯.HK | 200×28 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row` | 迅策.HK | 200×28 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row` | 滴普科技.HK | 200×28 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row` | 快速入门 | 200×28 | ✓ |

**卡片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.tab-item` | 工作区 | 42×22 | ✓ |

**图标（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.actions > span.icon-btn` |  | 22×22 | ✓ |
| `div.actions > span.icon-btn .iconfont` |  | 15×23 | ✓ |
| `div.workspace-add-wrap .icon-btn` |  | 22×22 | ✓ |
| `div.workspace-add-wrap .icon-btn .iconfont` |  | 14×21 | ✓ |
| `div.more-wrap .icon-btn` |  | 22×22 | ✓ |
| `div.more-wrap .icon-btn .iconfont` |  | 15×21 | ✓ |

---

#### 工作区文件树
> 容器: `.work-tree`
> 内容: 天华新能 中恒电气 天数智芯.HK 迅策.HK 滴普科技.HK 快速入门 101_PaiWork是什么.md 102_使...

**可点击区域（18个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.node-row` | 天华新能 | 200×28 | ✓ |
| `span.arrow` |  | 12×22 | ✓ |
| `div.node-label` | 天华新能 | 156×22 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row` | 中恒电气 | 200×28 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row .node-row-content .arrow` |  | 12×22 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row .node-row-content .node-label` | 中恒电气 | 156×22 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row` | 天数智芯.HK | 200×28 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row .node-row-content .arrow` |  | 12×22 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row .node-row-content .node-label` | 天数智芯.HK | 156×22 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row` | 迅策.HK | 200×28 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row .node-row-content .arrow` |  | 12×22 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row .node-row-content .node-label` | 迅策.HK | 156×22 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row` | 滴普科技.HK | 200×28 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row .node-row-content .arrow` |  | 12×22 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row .node-row-content .node-label` | 滴普科技.HK | 156×22 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row` | 快速入门 | 200×28 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row .node-row-content .arrow` |  | 12×22 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row .node-row-content .node-label` | 快速入门 | 156×22 | ✓ |

**文本（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.node-row-content` | 天华新能 | 188×22 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row .node-row-content` | 中恒电气 | 188×22 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row .node-row-content` | 天数智芯.HK | 188×22 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row .node-row-content` | 迅策.HK | 188×22 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row .node-row-content` | 滴普科技.HK | 188×22 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row .node-row-content` | 快速入门 | 188×22 | ✓ |

**图标（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.node-icon` |  | 12×22 | ✓ |
| `div:nth-of-type(2) > div.tree-node .node-row .node-row-content .node-icon` |  | 12×22 | ✓ |
| `div:nth-of-type(3) .tree-node .node-row .node-row-content .node-icon` |  | 12×22 | ✓ |
| `div:nth-of-type(4) .tree-node .node-row .node-row-content .node-icon` |  | 12×22 | ✓ |
| `div:nth-of-type(5) .tree-node .node-row .node-row-content .node-icon` |  | 12×22 | ✓ |
| `div:nth-of-type(6) > div.tree-node > div.node-row .node-row-content .node-icon` |  | 12×22 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 工作区 Skills 创建文... | 1222×707 | ✓ |
| `div.work-content` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭右侧 关闭全部 创建在线文档 创建在线表... | 986×699 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-logo .logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 公告（#announcement）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告 ← 当前
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-card` | 康强电子(002119.SZ):关于设立杭州分公司的公告 同步至PaiWork 电子 康强电子 07... | 736×83 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 行业 全部 农林牧渔 基础化工 钢铁 有色金属 电子 纺织服饰 轻工制造 医药生物 公用事业 交通运... | 1222×707 | ✓ |
| `div.content-left` | 行业 全部 农林牧渔 基础化工 钢铁 有色金属 电子 纺织服饰 轻工制造 医药生物 公用事业 交通运... | 788×697 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 日历（#calendar）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历 ← 当前
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**输入框（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `input` |  | 234×24 | ⚠ |

**标签页（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.cp-tab` | 全市场活动 我的日历 A股业绩日历 港股业绩日历 美股业绩日历 | 1206×34 | ✓ |
| `div.tab-wrap` | 全市场活动 我的日历 A股业绩日历 港股业绩日历 美股业绩日历 | 1206×34 | ✓ |
| `div.tab-container` | 全市场活动 我的日历 A股业绩日历 港股业绩日历 美股业绩日历 | 1202×34 | ✓ |

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.date-btn` | 回今天 | 60×24 | ✓ |

**卡片（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `span.item` | 日度 | 48×24 | ✓ |
| `div.tab-item` | 全市场活动 | 94×34 | ✓ |

**文本（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 搜索结果 回今天 2026年 7月 日 一 二 三 四 五 六 28 29 30 今 2 3 4 5... | 1222×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |
| `span.icon-wrap` |  | 24×21 | ✓ |

---

### 转记（#convert-meeting）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork ← 当前
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### PaiWork左侧栏
> 容器: `.cp-aside-section`
> 内容: 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更多 底部利润确认，静...

**导航项（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 | 200×80 | ✓ |
| `div.aside-history-list` | 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会话 | 200×32 | ✓ |

**可点击区域（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle` |  | 24×24 | ✓ |
| `span.view-more-text` | 更多 | 48×30 | ✓ |
| `div.skills-square-entry` | Skills广场 | 200×38 | ✓ |
| `span.action-btn` |  | 67×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn` |  | 67×20 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-title` | PaiWork | 107×22 | ✓ |
| `div.entry-title` | Skills广场 | 141×22 | ✓ |

**卡片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-item` | PaiWork AI工作台 | 192×34 | ✓ |
| `div.menu-item` | Ask PaiPai历史 更多 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会... | 200×466 | ✓ |
| `div.menu-title-item` | Ask PaiPai历史 更多 | 200×32 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-desc` | AI工作台 | 47×20 | ✓ |
| `div.entry-content` | Skills广场 | 141×22 | ✓ |

**图片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.entry-icon` |  | 14×19 | ✓ |

**图标（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle .iconfont` |  | 20×20 | ✓ |
| `i.iconfont` |  | 16×24 | ⚠ |
| `div.menu-title-item > i.iconfont` |  | 16×30 | ✓ |
| `div.skills-square-entry .iconfont` |  | 13×20 | ✓ |
| `div.btn-icon` |  | 20×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn .iconfont` |  | 14×21 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更... | 1222×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 云盘（#knowledge-base）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（8个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `div.upload-button` | 上传文件 | 106×34 | ✓ |
| `div.view-switch` |  | 86×36 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `h2.title` | 我的云盘 | 80×30 | ✓ |
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 我的云盘 上传文件 置顶 IM信息同步 取消置顶 IM自动同步的信息 信息·0 全部 按来源分类 按... | 1222×707 | ✓ |
| `div.knowledge-base-content` | 置顶 IM信息同步 取消置顶 IM自动同步的信息 信息·0 全部 按来源分类 按类型分类 按业务分类... | 1226×647 | ✓ |
| `div.folder-view-pinned-content` | IM信息同步 取消置顶 IM自动同步的信息 信息·0 | 1178×120 | ✓ |
| `div.folder-view-content` | 全部 按来源分类 按类型分类 按业务分类 IM信息同步 取消置顶 IM自动同步的信息 信息·0 IM... | 1204×324 | ✓ |
| `div.folder-view-content-header` | 全部 按来源分类 按类型分类 按业务分类 | 1182×26 | ✓ |
| `div.folder-view-content-body` | IM信息同步 取消置顶 IM自动同步的信息 信息·0 IM转发 置顶 通过IM转发的内容 信息·0 ... | 1182×256 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 会议（#meeting）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议 ← 当前
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（8个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 会议 今日发布 10 篇 美股会议 10 篇 投资者关系记录 我的会议 预约的会议 分享的会议 收藏... | 1222×707 | ✓ |
| `div.summary-box` | 会议 今日发布 10 篇 美股会议 10 篇 投资者关系记录 我的会议 预约的会议 分享的会议 收藏... | 1222×707 | ✓ |
| `div.summary-aside-container` | 会议 今日发布 10 篇 美股会议 10 篇 投资者关系记录 我的会议 预约的会议 分享的会议 收藏... | 254×707 | ✓ |
| `div.summary-input-container` |  | 254×54 | ✓ |
| `div.summary-menu` | 会议 今日发布 10 篇 美股会议 10 篇 投资者关系记录 我的会议 预约的会议 分享的会议 收藏... | 250×144 | ✓ |
| `div.summary-filter` | 标签 高管出席 新财富 中概股 会议内容 公司交流 业绩会 公司分析 行业分析 行业 农林牧渔 基础... | 250×572 | ✓ |
| `div.summary-box .content` | 会议时间 全部 今天·17 昨天·96 06-29·91 2026年 6 月 日 一 二 三 四 五... | 968×707 | ✓ |
| `div.library-content-container` | 会议时间 全部 今天·17 昨天·96 06-29·91 2026年 6 月 日 一 二 三 四 五... | 960×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 首页（#myFocus）

**导航项：**
- `#aside-menu-myFocus` — 首页 ← 当前
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### 首页-Agent卡片
> 容器: `.agent-door`
> 内容: 一键唤醒 研究Agent 更多 会议助手 交手机也能预约会议 公司一页纸 3分钟get公司基本面 行业一页纸 3分钟上手...

**可点击区域（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.more-link` | 更多 | 38×18 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.header-title` | 一键唤醒 研究Agent | 163×24 | ✓ |
| `div.header-title .title-text` | 一键唤醒 | 64×24 | ✓ |

**卡片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.agent-cards` | 会议助手 交手机也能预约会议 公司一页纸 3分钟get公司基本面 行业一页纸 3分钟上手新行业 写报... | 774×66 | ✓ |
| `div.agent-card` | 会议助手 交手机也能预约会议 | 148×66 | ✓ |
| `div.card-icon` | 会议助手 | 124×22 | ✓ |
| `div.card-title` | 会议助手 | 56×22 | ✓ |
| `div.card-content` | 交手机也能预约会议 | 124×20 | ✓ |
| `div.card-action` | 交手机也能预约会议 | 124×20 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.star` |  | 16×16 | ✓ |
| `img.card-icon-img` |  | 18×18 | ✓ |
| `img:nth-of-type(2)` |  | 25×12 | ⚠ |

**图标（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.more-link .iconfont` |  | 12×18 | ✓ |
| `i.iconfont` |  | 10×20 | ⚠ |

---

#### 首页-蓝宝书
> 容器: `.blue-book-container`
> 内容: PaiPai 总结的每日必看 更多 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨...

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.blue-book-container .header .more-btn` | 更多 | 38×22 | ✓ |
| `span.domestic-tag` | 国内 | 32×23 | ✓ |
| `span.line` |  | 1×12 | ⚠ |
| `span.update-time` | 更新时间 今天 20:06 | 112×20 | ✓ |
| `div.more-btn` | 更多 | 38×20 | ⚠ |
| `div.play-btn` |  | 28×28 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.blue-book-container .header .title` | PaiPai 总结的每日必看 | 208×24 | ✓ |
| `div.blue-book-container .header .title .title-text` | PaiPai 总结的每日必看 | 143×22 | ✓ |

**卡片（7个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.cards-wrapper` | 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨价、生猪去产能加... | 774×72 | ✓ |
| `div.blue-book-card` | 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨价、生猪去产能加... | 383×72 | ✓ |
| `div.card-content` | 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨价、生猪去产能加... | 383×72 | ⚠ |
| `div.card-left` | 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨价、生猪去产能加... | 323×48 | ✓ |
| `div.card-header` | 国内 7月1日晚间版 更新时间 今天 20:06 | 323×24 | ✓ |
| `span.card-title` | 国内 7月1日晚间版 | 135×24 | ✓ |
| `div.card-desc` | 字节AIDC租金上涨、电子布加速涨价、生猪去产能加速 更多 | 323×20 | ✓ |

**文本（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.summary` | 字节AIDC租金上涨、电子布加速涨价、生猪去产能加速 | 268×20 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.blue-book-img` |  | 48×24 | ✓ |
| `img.time-icon` |  | 16×16 | ✓ |
| `img.play-icon` |  | 28×28 | ✓ |

**图标（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.blue-book-container .header .more-btn .iconfont` |  | 12×22 | ✓ |
| `i.iconfont` |  | 12×12 | ⚠ |

---

#### 首页-头部Tab
> 容器: `.my-focus-header-container`
> 内容: 机构热议 New 自选个股 自选板块 管理

**可点击区域（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span` | 机构热议 New | 64×23 | ⚠ |
| `div.new-tag` | New | 25×14 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.my-focus-header-container .title` | 机构热议 New | 80×24 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**标签页（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.tab-box` | 公募榜 私募榜 保险榜 | 392×26 | ✓ |

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.agent-cards` | 会议助手 交手机也能预约会议 公司一页纸 3分钟get公司基本面 行业一页纸 3分钟上手新行业 写报... | 774×66 | ✓ |
| `div.cards-wrapper` | 国内 7月1日晚间版 更新时间 今天 20:06 字节AIDC租金上涨、电子布加速涨价、生猪去产能加... | 774×72 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（4个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 一键唤醒 研究Agent 更多 会议助手 交手机也能预约会议 公司一页纸 3分钟get公司基本面 行... | 1222×707 | ✓ |
| `div.content-left` | 一键唤醒 研究Agent 更多 会议助手 交手机也能预约会议 公司一页纸 3分钟get公司基本面 行... | 806×3240 | ✓ |
| `div.content-left-container` | 机构热议 New 自选个股 自选板块 管理 立即添加自选股，定制我的信息流 中泰证券 曾彪 吴鹏 电... | 806×2950 | ✓ |
| `div.content-right` | 热搜个股 更新时间:21:24 公募榜 私募榜 保险榜 1 江丰电子 300666.SZ +6.98... | 392×709 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### PaiPai（#paipai）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork ← 当前
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### PaiWork左侧栏
> 容器: `.cp-aside-section`
> 内容: 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更多 底部利润确认，静...

**导航项（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 | 200×80 | ✓ |
| `div.aside-history-list` | 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会话 | 200×32 | ✓ |

**可点击区域（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle` |  | 24×24 | ✓ |
| `span.view-more-text` | 更多 | 48×30 | ✓ |
| `div.skills-square-entry` | Skills广场 | 200×38 | ✓ |
| `span.action-btn` |  | 67×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn` |  | 67×20 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-title` | PaiWork | 107×22 | ✓ |
| `div.entry-title` | Skills广场 | 141×22 | ✓ |

**卡片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-item` | PaiWork AI工作台 | 192×34 | ✓ |
| `div.menu-item` | Ask PaiPai历史 更多 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会... | 200×466 | ✓ |
| `div.menu-title-item` | Ask PaiPai历史 更多 | 200×32 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-desc` | AI工作台 | 47×20 | ✓ |
| `div.entry-content` | Skills广场 | 141×22 | ✓ |

**图片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.entry-icon` |  | 14×19 | ✓ |

**图标（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle .iconfont` |  | 20×20 | ✓ |
| `i.iconfont` |  | 16×24 | ⚠ |
| `div.menu-title-item > i.iconfont` |  | 16×30 | ✓ |
| `div.skills-square-entry .iconfont` |  | 13×20 | ✓ |
| `div.btn-icon` |  | 20×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn .iconfont` |  | 14×21 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ⚠ |

**文本（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更... | 1222×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 研报（#report）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报 ← 当前
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**标签页（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.table-list-container` | 全部 标题 阳光电源 300274.SZ 长光华芯 688048.SH 水晶光电 002273.SZ... | 952×647 | ✓ |

**导航项（16个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |
| `div.report-menu` | 研报库 今日 123 篇 独立研究 123 篇 我的研报 订阅研报 | 254×140 | ✓ |
| `div.library-menu-container` | 研报库 今日 123 篇 独立研究 123 篇 我的研报 订阅研报 | 254×140 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ⚠ |

**文本（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 搜标题 搜全文 搜个股 搜作者 搜标题 研报库 今日 123 篇 独立研究 123 篇 我的研报 订... | 1222×707 | ✓ |
| `div.report-box .content` | 研报时间 全部 今天·123 昨天·299 本周·662 2026年 6 月 日 一 二 三 四 五... | 968×707 | ✓ |
| `div.library-content-container` | 研报时间 全部 今天·123 昨天·299 本周·662 2026年 6 月 日 一 二 三 四 五... | 960×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

### 社媒（#social-media）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒 ← 当前

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（16个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |
| `div.library-menu-container` | 社媒 我的订阅 PaiPai社区 今日 13922 篇 | 230×106 | ✓ |
| `ul.library-menu-vertical` | 社媒 我的订阅 PaiPai社区 今日 13922 篇 | 230×98 | ✓ |

**可点击区域（7个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `div.btn-subscribe-manage` | 订阅管理 | 230×34 | ✓ |
| `span` | 订阅管理 | 56×22 | ⚠ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.title` | 平台 | 230×20 | ⚠ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.filter-item-container` | 平台 公众号 | 230×56 | ✓ |

**文本（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 订阅管理 社媒 我的订阅 PaiPai社区 今日 13922 篇 平台 公众号 标签 原创 内容分类... | 1222×707 | ✓ |
| `div.summary-input-container` |  | 254×54 | ✓ |
| `div.summary-library-search` |  | 234×28 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |
| `div.btn-subscribe-manage .iconfont` |  | 16×22 | ✓ |

---

### 翻译（#translate-tool）

**导航项：**
- `#aside-menu-myFocus` — 首页
- `#aside-menu-paipai` — PaiPai
- `#aside-menu-ai-workbench` — PaiWork
- `#aside-menu-knowledge-base` — 云盘
- `#aside-menu-calendar` — 日历
- `#aside-menu-meeting` — 会议
- `#aside-menu-report` — 研报
- `#aside-menu-convert-meeting` — 转记
- `#aside-menu-translate-tool` — 翻译 ← 当前
- `#aside-menu-announcement` — 公告
- `#aside-menu-social-media` — 社媒

#### 全局导航栏
> 容器: `.app-left-side`
> 内容: 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒

**导航项（13个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**卡片（11个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |

**图片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

#### PaiWork左侧栏
> 容器: `.cp-aside-section`
> 内容: 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更多 底部利润确认，静...

**导航项（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 | 200×80 | ✓ |
| `div.aside-history-list` | 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会话 | 200×32 | ✓ |

**可点击区域（5个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle` |  | 24×24 | ✓ |
| `span.view-more-text` | 更多 | 48×30 | ✓ |
| `div.skills-square-entry` | Skills广场 | 200×38 | ✓ |
| `span.action-btn` |  | 67×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn` |  | 67×20 | ✓ |

**标题（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-title` | PaiWork | 107×22 | ✓ |
| `div.entry-title` | Skills广场 | 141×22 | ✓ |

**卡片（3个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.mode-item` | PaiWork AI工作台 | 192×34 | ✓ |
| `div.menu-item` | Ask PaiPai历史 更多 底部利润确认，静待景气反转 帮我写个10-15字的标题 置顶 删除会... | 200×466 | ✓ |
| `div.menu-title-item` | Ask PaiPai历史 更多 | 200×32 | ✓ |

**文本（2个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.mode-desc` | AI工作台 | 47×20 | ✓ |
| `div.entry-content` | Skills广场 | 141×22 | ✓ |

**图片（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.entry-icon` |  | 14×19 | ✓ |

**图标（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.btn-toggle .iconfont` |  | 20×20 | ✓ |
| `i.iconfont` |  | 16×24 | ⚠ |
| `div.menu-title-item > i.iconfont` |  | 16×30 | ✓ |
| `div.skills-square-entry .iconfont` |  | 13×20 | ✓ |
| `div.btn-icon` |  | 20×20 | ✓ |
| `div.bottom-actions__yunpan .action-btn .iconfont` |  | 14×21 | ✓ |

---

#### auto:div.app-layout
> 容器: `div.app-layout`
> 内容: 个股热搜榜 更新时间:21:24 1 科伦药业 002422.SZ 2 金宏气体 688106.SH 3 天禄科技 30...

**导航项（14个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 下载Alpha派 张洪 17301634... | 331×50 | ✓ |
| `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 转记 翻译 公告 社媒 | 58×596 | ✓ |
| `#aside-menu-myFocus .menu-name` | 首页 | 24×20 | ✓ |
| `#aside-menu-paipai .menu-name` | PaiPai | 35×20 | ✓ |
| `#aside-menu-ai-workbench .menu-name` | PaiWork | 46×20 | ✓ |
| `#aside-menu-knowledge-base .menu-name` | 云盘 | 24×20 | ✓ |
| `#aside-menu-calendar .menu-name` | 日历 | 24×20 | ✓ |
| `#aside-menu-meeting .menu-name` | 会议 | 24×20 | ✓ |
| `#aside-menu-report .menu-name` | 研报 | 24×20 | ✓ |
| `#aside-menu-convert-meeting .menu-name` | 转记 | 24×20 | ✓ |
| `#aside-menu-translate-tool .menu-name` | 翻译 | 24×20 | ✓ |
| `#aside-menu-announcement .menu-name` | 公告 | 24×20 | ✓ |
| `#aside-menu-social-media .menu-name` | 社媒 | 24×20 | ✓ |

**可点击区域（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-download-text` |  | 32×50 | ⚠ |
| `div.cp-customer-service` |  | 33×50 | ✓ |
| `div.app-userinfo-container` | 陈律楼 | 92×50 | ✓ |
| `div.user-points` | 2,242 | 76×50 | ✓ |
| `span.points-text` | 2,242 | 32×18 | ✓ |
| `span.btn-close` |  | 12×12 | ✓ |

**标题（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `span.c-title` | 体验真正的 AI Agent | 113×17 | ✓ |

**卡片（12个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus` | 首页 | 58×50 | ✓ |
| `#aside-menu-paipai` | PaiPai | 58×50 | ✓ |
| `#aside-menu-ai-workbench` | PaiWork | 58×50 | ✓ |
| `#aside-menu-knowledge-base` | 云盘 | 58×50 | ✓ |
| `#aside-menu-calendar` | 日历 | 58×50 | ✓ |
| `#aside-menu-meeting` | 会议 | 58×50 | ✓ |
| `#aside-menu-report` | 研报 | 58×50 | ✓ |
| `#aside-menu-convert-meeting` | 转记 | 58×50 | ✓ |
| `#aside-menu-translate-tool` | 翻译 | 58×50 | ✓ |
| `#aside-menu-announcement` | 公告 | 58×50 | ✓ |
| `#aside-menu-social-media` | 社媒 | 58×50 | ✓ |
| `div.item-wrap` | 体验真正的 AI Agent 扫描添加待办助手 | 211×70 | ✓ |

**文本（1个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `div.app-right-content` | 我的工作台 PaiWork AI工作台 Ask PaiPai 单次提问 Ask PaiPai历史 更... | 1222×707 | ✓ |

**图片（6个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `img.logo-img` |  | 75×20 | ✓ |
| `img.free-img` |  | 40×18 | ✓ |
| `img` |  | 20×20 | ⚠ |
| `img.icon-img` |  | 16×16 | ✓ |
| `img.menu-flag` |  | 14×14 | ✓ |
| `img.triangle-radius` |  | 10×10 | ✓ |

**图标（10个）**

| 选择器 | 文本/标签 | 尺寸 | 有效 |
|--------|----------|------|------|
| `#aside-menu-myFocus .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-ai-workbench .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-knowledge-base .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-calendar .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-report .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-convert-meeting .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-translate-tool .iconfont` |  | 16×20 | ✓ |
| `#aside-menu-announcement .iconfont` |  | 17×20 | ✓ |
| `#aside-menu-social-media .iconfont` |  | 16×20 | ✓ |

---

<!-- AUTO_SCAN_DETAIL_END -->


## 附录：自动扫描速查表

<!-- AUTO_SCAN_QUICKREF_START -->
| 模块 | 板块 | 元素类型 | 选择器 | 文本 |
|------|------|---------|--------|------|
| PaiWork | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| PaiWork | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| PaiWork | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| PaiWork | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| PaiWork | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| PaiWork | PaiWork左侧栏 | 可点击区域 | `div.btn-toggle` |  |
| PaiWork | PaiWork左侧栏 | 图标 | `div.btn-toggle .iconfont` |  |
| PaiWork | PaiWork左侧栏 | 导航项 | `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 |
| PaiWork | PaiWork左侧栏 | 卡片 | `div.mode-item` | PaiWork AI工作台 |
| PaiWork | PaiWork左侧栏 | 标题 | `span.mode-title` | PaiWork |
| PaiWork | PaiWork中间栏 | 文本 | `div.work-content-left` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭... |
| PaiWork | PaiWork中间栏 | 编辑器 | `div.ai-workbench-work-editor-container` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭... |
| PaiWork | PaiWork中间栏 | 编辑器 | `div.work-editor-main` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭... |
| PaiWork | PaiWork中间栏 | 编辑器 | `div.work-editor-tabs` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭... |
| PaiWork | PaiWork中间栏 | 编辑器 | `div.work-editor-tab-bar` | 101_PaiWork是什么.md 关闭当前 关闭左侧 关闭... |
| PaiWork | PaiWork右侧栏(对话区) | 文本 | `div.work-content-chat` | PaiPai 新会话 定时任务 历史记录 使用「公司一页纸」... |
| PaiWork | PaiWork右侧栏(对话区) | 图片 | `div.logo-circle .logo-img` |  |
| PaiWork | PaiWork右侧栏(对话区) | 图标 | `span.icon-line` |  |
| PaiWork | PaiWork右侧栏(对话区) | 图标 | `div.header-right > span.icon-btn` |  |
| PaiWork | PaiWork右侧栏(对话区) | 图标 | `div.header-right > span.icon-btn .iconfont` |  |
| PaiWork | 输入区 | 卡片 | `div.input-card` | 天华新能 中恒电气 天数智芯.HK 迅策.HK 滴普科技.H... |
| PaiWork | 输入区 | 可点击区域 | `span.plan-tag` |  |
| PaiWork | 输入区 | 图标 | `span.plan-tag .iconfont` |  |
| PaiWork | 输入区 | 输入框 | `textarea.input-textarea` |  |
| PaiWork | 输入区 | 按钮 | `div.action-mode-pill` | Ultra |
| PaiWork | Skills广场 | 标签页 | `div.tab-header-wrap` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格... |
| PaiWork | Skills广场 | 标签页 | `div.tab-header` | 工作区 Skills 创建文件夹 创建在线文档 创建在线表格... |
| PaiWork | Skills广场 | 标签页 | `div.tabs` | 工作区 Skills |
| PaiWork | Skills广场 | 卡片 | `span.tab-item` | 工作区 |
| PaiWork | Skills广场 | 图标 | `div.actions > span.icon-btn` |  |
| PaiWork | 工作区文件树 | 可点击区域 | `div.node-row` | 天华新能 |
| PaiWork | 工作区文件树 | 文本 | `span.node-row-content` | 天华新能 |
| PaiWork | 工作区文件树 | 可点击区域 | `span.arrow` |  |
| PaiWork | 工作区文件树 | 图标 | `span.node-icon` |  |
| PaiWork | 工作区文件树 | 可点击区域 | `div.node-label` | 天华新能 |
| PaiWork | auto:div.app-layout | 图片 | `div.app-logo .logo-img` |  |
| PaiWork | auto:div.app-layout | 图片 | `img.free-img` |  |
| PaiWork | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| PaiWork | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| PaiWork | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 公告 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 公告 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 公告 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 公告 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 公告 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 公告 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 公告 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 公告 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 公告 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 公告 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 日历 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 日历 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 日历 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 日历 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 日历 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 日历 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 日历 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 日历 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 日历 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 日历 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 转记 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 转记 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 转记 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 转记 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 转记 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 转记 | PaiWork左侧栏 | 可点击区域 | `div.btn-toggle` |  |
| 转记 | PaiWork左侧栏 | 图标 | `div.btn-toggle .iconfont` |  |
| 转记 | PaiWork左侧栏 | 导航项 | `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 |
| 转记 | PaiWork左侧栏 | 卡片 | `div.mode-item` | PaiWork AI工作台 |
| 转记 | PaiWork左侧栏 | 标题 | `span.mode-title` | PaiWork |
| 转记 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 转记 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 转记 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 转记 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 转记 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 云盘 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 云盘 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 云盘 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 云盘 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 云盘 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 云盘 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 云盘 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 云盘 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 云盘 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 云盘 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 会议 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 会议 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 会议 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 会议 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 会议 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 会议 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 会议 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 会议 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 会议 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 会议 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 首页 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 首页 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 首页 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 首页 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 首页 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 首页 | 首页-Agent卡片 | 标题 | `div.header-title` | 一键唤醒 研究Agent |
| 首页 | 首页-Agent卡片 | 标题 | `div.header-title .title-text` | 一键唤醒 |
| 首页 | 首页-Agent卡片 | 图片 | `img.star` |  |
| 首页 | 首页-Agent卡片 | 可点击区域 | `div.more-link` | 更多 |
| 首页 | 首页-Agent卡片 | 图标 | `div.more-link .iconfont` |  |
| 首页 | 首页-蓝宝书 | 标题 | `div.blue-book-container .header .title` | PaiPai 总结的每日必看 |
| 首页 | 首页-蓝宝书 | 图片 | `img.blue-book-img` |  |
| 首页 | 首页-蓝宝书 | 标题 | `div.blue-book-container .header .title .title-text` | PaiPai 总结的每日必看 |
| 首页 | 首页-蓝宝书 | 可点击区域 | `div.blue-book-container .header .more-btn` | 更多 |
| 首页 | 首页-蓝宝书 | 图标 | `div.blue-book-container .header .more-btn .iconfont` |  |
| 首页 | 首页-头部Tab | 标题 | `div.my-focus-header-container .title` | 机构热议 New |
| 首页 | 首页-头部Tab | 可点击区域 | `div.new-tag` | New |
| 首页 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 首页 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 首页 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 首页 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 首页 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| PaiPai | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| PaiPai | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| PaiPai | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| PaiPai | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| PaiPai | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| PaiPai | PaiWork左侧栏 | 可点击区域 | `div.btn-toggle` |  |
| PaiPai | PaiWork左侧栏 | 图标 | `div.btn-toggle .iconfont` |  |
| PaiPai | PaiWork左侧栏 | 导航项 | `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 |
| PaiPai | PaiWork左侧栏 | 卡片 | `div.mode-item` | PaiWork AI工作台 |
| PaiPai | PaiWork左侧栏 | 标题 | `span.mode-title` | PaiWork |
| PaiPai | auto:div.app-layout | 图片 | `img.logo-img` |  |
| PaiPai | auto:div.app-layout | 图片 | `img.free-img` |  |
| PaiPai | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| PaiPai | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| PaiPai | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 研报 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 研报 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 研报 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 研报 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 研报 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 研报 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 研报 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 研报 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 研报 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 研报 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 社媒 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 社媒 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 社媒 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 社媒 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 社媒 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 社媒 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 社媒 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 社媒 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 社媒 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 社媒 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
| 翻译 | 全局导航栏 | 导航项 | `div.app-nav` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 翻译 | 全局导航栏 | 导航项 | `ul.mouse-in` | 首页 PaiPai PaiWork 云盘 日历 会议 研报 ... |
| 翻译 | 全局导航栏 | 卡片 | `#aside-menu-myFocus` | 首页 |
| 翻译 | 全局导航栏 | 图标 | `#aside-menu-myFocus .iconfont` |  |
| 翻译 | 全局导航栏 | 导航项 | `#aside-menu-myFocus .menu-name` | 首页 |
| 翻译 | PaiWork左侧栏 | 可点击区域 | `div.btn-toggle` |  |
| 翻译 | PaiWork左侧栏 | 图标 | `div.btn-toggle .iconfont` |  |
| 翻译 | PaiWork左侧栏 | 导航项 | `div.mode-menu` | PaiWork AI工作台 Ask PaiPai 单次提问 |
| 翻译 | PaiWork左侧栏 | 卡片 | `div.mode-item` | PaiWork AI工作台 |
| 翻译 | PaiWork左侧栏 | 标题 | `span.mode-title` | PaiWork |
| 翻译 | auto:div.app-layout | 图片 | `img.logo-img` |  |
| 翻译 | auto:div.app-layout | 图片 | `img.free-img` |  |
| 翻译 | auto:div.app-layout | 导航项 | `div.app-menu` | 自动整理报告底稿 一键截图，精准抠数 立即下载 扫描二维码 ... |
| 翻译 | auto:div.app-layout | 可点击区域 | `div.cp-customer-service` |  |
| 翻译 | auto:div.app-layout | 可点击区域 | `div.app-userinfo-container` | 陈律楼 |
<!-- AUTO_SCAN_QUICKREF_END -->
