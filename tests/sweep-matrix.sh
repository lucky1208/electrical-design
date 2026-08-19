#!/usr/bin/env bash
# 参数矩阵回归扫描：216 组参数全量生成，验证绘图闸门通过率
# 用法：bash sweep-matrix.sh <skill根目录>   （目录下应有 scripts/generate.js 与 engine/）
# 退出码：0 = 全部通过；1 = 存在闸门阻断或运行错误
set -uo pipefail
ROOT="${1:-.}"
TMP="$(mktemp -d)"
pass=0; block=0; err=0

for std in gb eu us; do
for guns in 1 2 3 4; do
for kw in 60 120 240 360 480 600; do
for ess in true false; do
for cpl in dc ac; do
  [ "$ess" = "false" ] && [ "$cpl" = "ac" ] && continue
  name="${std}_${guns}g_${kw}kw_ess${ess}_${cpl}"
  cat > "$TMP/p.json" <<J
{"pileName":"matrix","standard":"$std","outputKw":$kw,"gunCount":$guns,
 "gunCurrentA":250,"moduleKw":40,"voltageWindow":"200-1000","thermal":"liquid",
 "essEnabled":$ess,"essKwh":200,"essPowerKw":120,"essCoupling":"$cpl"}
J
  out=$(node "$ROOT/scripts/generate.js" --params "$TMP/p.json" --out "$TMP" --name "$name" 2>&1)
  case $? in
    0) pass=$((pass+1)) ;;
    2) block=$((block+1)); echo "闸门阻断: $name"
       echo "$out" | grep -oE '未处理 [0-9]+ 处.*|G0[0-9]+-[A-Z-]+' | head -2 | sed 's/^/          /' ;;
    *) err=$((err+1));  echo "运行错误: $name"; echo "$out" | tail -2 | sed 's/^/          /' ;;
  esac
done; done; done; done; done

echo "------------------------------------------------"
echo "通过 $pass | 闸门阻断 $block | 运行错误 $err"
rm -rf "$TMP"
[ $((block+err)) -eq 0 ] || exit 1
