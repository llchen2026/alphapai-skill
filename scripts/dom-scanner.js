/**
 * dom-scanner.js
 * AlphaPai 平台 DOM 结构自动扫描器
 *
 * 用法: browser-use --session paipai eval "$(cat dom-scanner.js)"
 *
 * 扫描策略:
 *  1. 识别页面所有「板块容器」(带语义 class/id 的顶层区域)
 *  2. 在每个板块内递归提取「交互节点」(button/a/input/[role]/[onclick]/.cursor-pointer)
 *  3. 在每个板块内提取「内容节点」(卡片/列表项/标题/摘要)
 *  4. 生成可用的 CSS 选择器链
 *  5. 输出结构化 JSON
 */
(function () {
  'use strict';

  // ========== 配置 ==========
  var MAX_DEPTH = 8;          // 最大递归深度
  var MAX_NODES_PER_SECTION = 60;  // 每个板块最多采集的节点数
  var MAX_TEXT_LEN = 200;     // 文本截断长度
  var IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT', 'BR', 'HR', 'SVG', 'PATH']);
  var IGNORED_CLASSES = [
    'driver-active', 'driver-popover', 'driver-overlay', 'driver-page-overlay',
    'el-popper', 'el-select-dropdown', 'v-modal', 'modal-backdrop'
  ];

  // ========== 工具函数 ==========

  /** 判断元素是否应忽略 */
  function shouldIgnore(el) {
    if (!el || el.nodeType !== 1) return true;
    if (IGNORED_TAGS.has(el.tagName)) return true;
    var cls = el.classList ? Array.from(el.classList).join(' ') : '';
    for (var i = 0; i < IGNORED_CLASSES.length; i++) {
      if (el.classList && el.classList.contains(IGNORED_CLASSES[i])) return true;
    }
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (parseFloat(style.opacity) === 0) return true;
    return false;
  }

  /** 获取可见文本（去除多余空白） */
  function getVisibleText(el, maxLen) {
    var text = '';
    try {
      // 只取直接文本和第一层子元素文本，避免深层递归取太多
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var parts = [];
      var node;
      while ((node = walker.nextNode())) {
        var t = node.textContent.trim();
        if (t) parts.push(t);
        if (parts.join(' ').length >= (maxLen || MAX_TEXT_LEN) * 1.5) break;
      }
      text = parts.join(' ').substring(0, maxLen || MAX_TEXT_LEN);
    } catch (e) {
      text = (el.innerText || '').trim().substring(0, maxLen || MAX_TEXT_LEN);
    }
    return text;
  }

  /** 为元素生成最优 CSS 选择器 */
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];

    // 优先级: id > data-v-xxx > 唯一 class 组合 > tag
    if (el.id) {
      return '#' + el.id;
    }

    // 收集有意义的 class
    var classes = [];
    if (el.classList) {
      el.classList.forEach(function (c) {
        // 过滤掉工具类和动态类
        if (c.length > 1 &&
          !/^(is-|el-|v-|active|hover|focus|selected|disabled|checked|cursor|router|fade|slide|enter|leave|transition|animat)/i.test(c)) {
          classes.push(c);
        }
      });
    }

    var tag = el.tagName.toLowerCase();

    // 如果有 class，用 tag.firstClass
    if (classes.length > 0) {
      var selector = tag + '.' + classes[0];

      // 检查是否唯一
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch (e) { }

      // 不唯一，尝试加父级限定
      var parent = el.parentElement;
      if (parent && parent !== document.body) {
        var parentSel = buildSelector(parent);
        if (parentSel) {
          var combined = parentSel + ' .' + classes[0];
          try {
            if (document.querySelectorAll(combined).length === 1) {
              return combined;
            }
          } catch (e) { }
          // 再试 parent > tag.firstClass
          combined = parentSel + ' > ' + selector;
          try {
            if (document.querySelectorAll(combined).length === 1) {
              return combined;
            }
          } catch (e) { }
        }
      }

      return selector;
    }

    // 无 class，用 tag + nth-child 定位
    var parent = el.parentElement;
    if (parent) {
      var siblings = Array.prototype.filter.call(parent.children, function (c) {
        return c.tagName === el.tagName;
      });
      if (siblings.length > 1) {
        var index = siblings.indexOf(el) + 1;
        return tag + ':nth-of-type(' + index + ')';
      }
    }

    return tag;
  }

  /** 判断元素类型 */
  function classifyElement(el) {
    var tag = el.tagName;
    var type = el.getAttribute('type');
    var role = el.getAttribute('role');
    var cls = el.classList ? Array.from(el.classList).join(' ') : '';

    // 交互元素
    if (tag === 'BUTTON' || tag === 'A' || type === 'button' || type === 'submit' || role === 'button') {
      return 'interactive:button';
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || role === 'textbox' || role === 'combobox') {
      return 'interactive:input';
    }
    if (tag === 'IMG') {
      return 'content:image';
    }
    if (el.hasAttribute('contenteditable') || cls.indexOf('editor') >= 0) {
      return 'interactive:editor';
    }
    if (cls.indexOf('card') >= 0 || cls.indexOf('item') >= 0) {
      return 'content:card';
    }
    if (cls.indexOf('title') >= 0 || /^h[1-6]$/.test(tag)) {
      return 'content:title';
    }
    if (cls.indexOf('summary') >= 0 || cls.indexOf('desc') >= 0 || cls.indexOf('content') >= 0) {
      return 'content:text';
    }
    if (cls.indexOf('icon') >= 0 || tag === 'I') {
      return 'content:icon';
    }
    if (cls.indexOf('tab') >= 0) {
      return 'interactive:tab';
    }
    if (cls.indexOf('menu') >= 0 || cls.indexOf('nav') >= 0) {
      return 'interactive:nav';
    }
    if (tag === 'TABLE') {
      return 'content:table';
    }
    if (tag === 'P') {
      return 'content:paragraph';
    }
    if (tag === 'LI') {
      return 'content:listitem';
    }

    // 检测可点击性
    var style = window.getComputedStyle(el);
    if (style.cursor === 'pointer') {
      return 'interactive:clickable';
    }

    return 'container';
  }

  /** 判断是否是「板块容器」(section) */
  function isSectionContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.body || el === document.documentElement) return false;

    var cls = el.classList ? Array.from(el.classList).join(' ') : '';
    var id = el.id || '';

    // 匹配已知板块级容器模式
    var sectionPatterns = [
      /app-left-side/, /app-nav/, /work-content/, /cp-aside/, /cp-recommend/,
      /agent-door/, /blue-book/, /ai-workbench/, /input-card/, /chat-/,
      /aside-menu/, /my-focus/, /knowledge-base/, /calendar/, /meeting/,
      /report-/, /translate/, /announcement/, /social-media/,
      /header/, /footer/, /sidebar/, /panel/, /modal/, /dialog/,
      /main-content/, /page-content/, /content-area/, /work-/,
      /skill/, /tree/, /editor/, /document/
    ];

    for (var i = 0; i < sectionPatterns.length; i++) {
      if (sectionPatterns[i].test(cls) || sectionPatterns[i].test(id)) return true;
    }

    // 大尺寸容器（超过视口 30%）
    var rect = el.getBoundingClientRect();
    var viewportArea = window.innerWidth * window.innerHeight;
    var elArea = rect.width * rect.height;
    if (elArea > viewportArea * 0.05 && el.children.length > 2) return true;

    return false;
  }

  /** 检测元素是否有交互行为 */
  function hasInteraction(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    var role = el.getAttribute('role');
    if (role === 'button' || role === 'link' || role === 'tab' || role === 'textbox') return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('@click')) return true;

    var style = window.getComputedStyle(el);
    if (style.cursor === 'pointer') return true;

    var cls = el.classList ? Array.from(el.classList).join(' ') : '';
    if (/btn|button|tab|link|click|action|submit|switch|toggle/i.test(cls)) return true;

    return false;
  }

  // ========== 递归扫描 ==========

  function scanNode(el, depth, results, selectorPath) {
    if (!el || depth > MAX_DEPTH || results.length >= MAX_NODES_PER_SECTION) return;
    if (shouldIgnore(el)) return;

    var type = classifyElement(el);
    var hasInter = hasInteraction(el);

    // 如果是交互元素或有意义的内容元素，记录
    if (type.indexOf('interactive') === 0 || type.indexOf('content:') === 0) {
      var selector = buildSelector(el);
      var text = getVisibleText(el, MAX_TEXT_LEN);

      // 验证选择器有效性
      var valid = false;
      try {
        valid = document.querySelector(selector) === el;
      } catch (e) {
        valid = false;
      }

      results.push({
        type: type,
        selector: selector,
        tag: el.tagName.toLowerCase(),
        text: text || '',
        classes: el.classList ? Array.from(el.classList).filter(function (c) {
          return c.length > 1 && !/^(is-|el-|v-|router-)/.test(c);
        }).slice(0, 5) : [],
        hasInteraction: hasInter,
        depth: depth,
        validSelector: valid,
        rect: {
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height)
        }
      });
    }

    // 递归子元素
    var children = el.children;
    for (var i = 0; i < children.length; i++) {
      scanNode(children[i], depth + 1, results, selectorPath);
    }
  }

  /** 扫描单个板块 */
  function scanSection(sectionEl, sectionName, sectionSelector) {
    var nodes = [];
    scanNode(sectionEl, 0, nodes, sectionSelector);

    // 去重（按选择器）
    var seen = {};
    var unique = [];
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].selector + '|' + nodes[i].type;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(nodes[i]);
      }
    }

    return {
      name: sectionName,
      selector: sectionSelector,
      text: getVisibleText(sectionEl, 100),
      nodeCount: unique.length,
      nodes: unique
    };
  }

  // ========== 主入口 ==========

  function scanPage() {
    var startTime = Date.now();
    var pageUrl = window.location.href;
    var pageTitle = document.title;

    // 1. 检测当前模块
    var activeModule = '';
    var activeNav = document.querySelector('.el-menu-item.is-active');
    if (activeNav) {
      activeModule = activeNav.id || (activeNav.querySelector('.menu-name') ? activeNav.querySelector('.menu-name').innerText.trim() : '');
    }

    // 2. 检测所有导航项
    var navItems = [];
    var navEls = document.querySelectorAll('[id^="aside-menu-"]');
    navEls.forEach(function (el) {
      var nameEl = el.querySelector('.menu-name, .el-tooltip, span');
      navItems.push({
        id: el.id,
        text: nameEl ? nameEl.innerText.trim() : getVisibleText(el, 30),
        active: el.classList.contains('is-active')
      });
    });

    // 3. 识别板块容器
    // 先尝试已知选择器
    var knownSections = [
      { sel: '.app-left-side', name: '全局导航栏' },
      { sel: '.cp-aside-section', name: 'PaiWork左侧栏' },
      { sel: '.work-content-left', name: 'PaiWork中间栏' },
      { sel: '.work-content-chat', name: 'PaiWork右侧栏(对话区)' },
      { sel: '.input-card', name: '输入区' },
      { sel: '.agent-door', name: '首页-Agent卡片' },
      { sel: '.blue-book-container', name: '首页-蓝宝书' },
      { sel: '.cp-recommend-wrap', name: '首页-机构热议' },
      { sel: '.ai-workbench-main', name: 'Skills广场' },
      { sel: '.work-tree', name: '工作区文件树' },
      { sel: '.my-focus-header-container', name: '首页-头部Tab' }
    ];

    var sections = [];

    // 扫描已知板块
    for (var i = 0; i < knownSections.length; i++) {
      var el = document.querySelector(knownSections[i].sel);
      if (el && !shouldIgnore(el)) {
        sections.push(scanSection(el, knownSections[i].name, knownSections[i].sel));
      }
    }

    // 自动发现未知板块
    // 查找所有有语义 class 的顶层容器
    var allEls = document.querySelectorAll('[class]');
    var discoveredSelectors = knownSections.map(function (s) { return s.sel; });
    for (var j = 0; j < allEls.length; j++) {
      var candidate = allEls[j];
      if (shouldIgnore(candidate)) continue;
      if (candidate.children.length < 2) continue;

      // 检查是否已在已知板块内
      var insideKnown = false;
      for (var k = 0; k < discoveredSelectors.length; k++) {
        if (candidate.closest(discoveredSelectors[k].replace(/^([.#\w]+)\s.*$/, '$1'))) {
          // 简单检查：如果 candidate 的祖先包含已知板块，跳过
        }
      }

      // 自动发现的条件：有特殊 class 且尺寸较大
      var cls = Array.from(candidate.classList).join(' ');
      if (/^(cp-|work-|agent-|blue-|report-|comment-|skill-|file-|tree-|aside-|app-|my-)/.test(cls)) {
        var sel = buildSelector(candidate);
        if (sel && discoveredSelectors.indexOf(sel) < 0) {
          // 检查是否是已知板块的子元素
          var isChild = false;
          for (var m = 0; m < sections.length; m++) {
            var parentEl = document.querySelector(sections[m].selector);
            if (parentEl && parentEl.contains(candidate) && parentEl !== candidate) {
              isChild = true;
              break;
            }
          }
          if (!isChild) {
            var sectionText = getVisibleText(candidate, 50);
            if (sectionText.length > 3) {
              sections.push(scanSection(candidate, 'auto:' + candidate.tagName.toLowerCase() + '.' + (candidate.classList[0] || ''), sel));
              discoveredSelectors.push(sel);
            }
          }
        }
      }
    }

    // 4. 收集全局交互元素（不在特定板块内的）
    var globalInteractive = [];
    var allInteractive = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [role="tab"]');
    allInteractive.forEach(function (el) {
      if (shouldIgnore(el)) return;
      var sel = buildSelector(el);
      if (!sel) return;

      // 检查是否已在某个板块内被收录
      var inSection = false;
      for (var n = 0; n < sections.length; n++) {
        var sEl = document.querySelector(sections[n].selector);
        if (sEl && sEl.contains(el)) {
          inSection = true;
          break;
        }
      }

      if (!inSection) {
        globalInteractive.push({
          type: classifyElement(el),
          selector: sel,
          tag: el.tagName.toLowerCase(),
          text: getVisibleText(el, 50),
          placeholder: el.getAttribute('placeholder') || '',
          hasInteraction: true
        });
      }
    });

    var result = {
      scanTime: new Date().toISOString(),
      url: pageUrl,
      title: pageTitle,
      activeModule: activeModule,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      navItems: navItems,
      sections: sections,
      globalInteractive: globalInteractive,
      stats: {
        totalSections: sections.length,
        totalNodes: sections.reduce(function (sum, s) { return sum + s.nodeCount; }, 0),
        totalInteractive: globalInteractive.length,
        duration: Date.now() - startTime
      }
    };

    return JSON.stringify(result);
  }

  return scanPage();
})();
