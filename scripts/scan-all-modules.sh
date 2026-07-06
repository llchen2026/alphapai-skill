#!/bin/bash
# scan-all-modules.sh
# 遍历 AlphaPai 全部 11 个模块，逐个扫描 DOM 结构并保存 JSON
#
# 用法:
#   bash scan-all-modules.sh              # 全量扫描
#   bash scan-all-modules.sh myFocus      # 仅扫描首页
#   bash scan-all-modules.sh paipai ai-workbench  # 扫描指定模块
#
# 注意: macOS 默认 /bin/bash 版本太旧(3.x)，此脚本使用兼容写法（无 associative array）
# 建议用 zsh 运行: zsh scan-all-modules.sh
#
# 输出: scan-results/<module>.json

set -e

export PATH="$HOME/.browser-use/bin:$HOME/.browser-use-env/bin:$PATH"

SESSION="paipai"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCANNER="$SCRIPT_DIR/dom-scanner.js"
OUTPUT_DIR="$SCRIPT_DIR/../scan-results"
mkdir -p "$OUTPUT_DIR"

# 模块列表（ID后缀|显示名称|等待秒数），用普通数组兼容 bash 3.x
MODULE_LIST=(
  "myFocus|首页|4"
  "paipai|PaiPai|3"
  "ai-workbench|PaiWork|3"
  "knowledge-base|云盘|4"
  "calendar|日历|4"
  "meeting|会议|4"
  "report|研报|4"
  "convert-meeting|转记|4"
  "translate-tool|翻译|4"
  "announcement|公告|4"
  "social-media|社媒|4"
)

# 解析函数: get_field "entry" position
get_field() {
  echo "$1" | cut -d'|' -f"$2"
}

# 如果传了参数，构建目标过滤集合
TARGET_IDS=""
if [ $# -gt 0 ]; then
  TARGET_IDS=" $* "
fi

echo "========================================="
echo " AlphaPai DOM 结构扫描器"
echo "========================================="
if [ -n "$TARGET_IDS" ]; then
  echo " 目标模块: $*"
else
  echo " 目标: 全部 11 个模块"
fi
echo " 输出目录: $OUTPUT_DIR"
echo ""

# 清除新手引导遮罩
clear_tour() {
  browser-use --session "$SESSION" eval "
    var driverEls = document.querySelectorAll('.driver-active, .driver-popover, .driver-overlay, [class*=\"driver-popover\"]');
    driverEls.forEach(function(el) { el.remove(); });
    'cleared';
  " 2>/dev/null || true
}

# 切换到指定模块
switch_module() {
  local mod_id="$1"
  browser-use --session "$SESSION" eval "
    var item = document.querySelector('#aside-menu-$mod_id');
    if (item) { item.click(); 'switched_to_$mod_id'; }
    else { 'NOT_FOUND'; }
  "
}

# 扫描当前页面
scan_current() {
  local mod_id="$1"
  local mod_name="$2"
  local output_file="$OUTPUT_DIR/${mod_id}.json"

  echo "[$mod_name] 扫描中..."

  # 运行扫描器，用 python3 清洗 browser-use 的 "result: " 前缀和转义
  browser-use --session "$SESSION" eval "$(cat "$SCANNER")" 2>/dev/null | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
# browser-use 输出格式: 'result: <json-string>'
# 需要去掉前缀，然后 JSON 解析（外层是字符串，内层也是 JSON）
if raw.startswith('result: '):
    raw = raw[len('result: '):]
try:
    # 外层可能是一个带转义的 JSON 字符串
    outer = json.loads(raw)
    # 如果 outer 还是字符串，再解析一次
    if isinstance(outer, str):
        outer = json.loads(outer)
    json.dump(outer, sys.stdout, ensure_ascii=False)
except:
    # 直接输出原始内容
    sys.stdout.write(raw)
" > "$output_file"

  if [ $? -eq 0 ] && [ -s "$output_file" ]; then
    # 统计结果
    local stats
    stats=$(python3 -c "
import json, sys
try:
    data = json.load(open('$output_file'))
    sections = data.get('sections', [])
    total = sum(s.get('nodeCount', 0) for s in sections)
    print(f'{len(sections)} sections, {total} nodes')
except Exception as e:
    print(f'parse error: {e}')
" 2>/dev/null || echo "done")
    echo "[$mod_name] OK: $stats -> $output_file"
  else
    echo "[$mod_name] FAILED"
  fi
}

# 滚动加载更多内容
scroll_and_load() {
  for i in 1 2 3; do
    browser-use --session "$SESSION" scroll down --amount 800 2>/dev/null || true
    sleep 1
  done
  browser-use --session "$SESSION" scroll up --amount 5000 2>/dev/null || true
  sleep 1
}

# 主流程
echo "--- 开始扫描 ---"
clear_tour

for entry in "${MODULE_LIST[@]}"; do
  mod_id=$(get_field "$entry" 1)
  mod_name=$(get_field "$entry" 2)
  wait_time=$(get_field "$entry" 3)

  # 如果有过滤，检查是否在目标列表中
  if [ -n "$TARGET_IDS" ]; then
    case "$TARGET_IDS" in
      *" $mod_id "*) ;;  # 在列表中，继续
      *) continue ;;      # 不在列表中，跳过
    esac
  fi

  echo ""
  echo ">>> Module: $mod_name (#aside-menu-$mod_id)"

  # 切换到模块
  switch_module "$mod_id"

  # 等待加载
  sleep "$wait_time"

  # 清除可能的遮罩
  clear_tour
  sleep 1

  # 滚动加载
  scroll_and_load

  # 扫描
  scan_current "$mod_id" "$mod_name"
done

# 生成合并文件
echo ""
echo "--- 合并所有模块结果 ---"
python3 -c "
import json, os, glob

output_dir = '$OUTPUT_DIR'
all_results = {}
for f in sorted(glob.glob(os.path.join(output_dir, '*.json'))):
    if os.path.basename(f).startswith('_'):
        continue
    mod = os.path.basename(f).replace('.json', '')
    try:
        data = json.load(open(f))
        all_results[mod] = data
    except:
        pass

combined_path = os.path.join(output_dir, '_combined.json')
with open(combined_path, 'w') as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

# 统计
total_sections = 0
total_nodes = 0
for mod, data in all_results.items():
    sections = data.get('sections', [])
    nodes = sum(s.get('nodeCount', 0) for s in sections)
    total_sections += len(sections)
    total_nodes += nodes
    print(f'  {mod}: {len(sections)} sections, {nodes} nodes')

print(f'\nTotal: {len(all_results)} modules, {total_sections} sections, {total_nodes} nodes')
print(f'Combined: {combined_path}')
"

echo ""
echo "========================================="
echo " Scan complete!"
echo " Results: $OUTPUT_DIR"
echo "========================================="
