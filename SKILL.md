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

## 七、完整工作流示例

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

## 关闭浏览器

```bash
browser-use --session paipai close
```
