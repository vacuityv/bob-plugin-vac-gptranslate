#!/bin/bash
set -e
cd "$(dirname "$0")"

PLUGIN="bob-plugin-vac-gptranslate.bobplugin"

# 从 info.json 读取版本号
VERSION=$(python3 -c "import json;print(json.load(open('info.json'))['version'])")

# 打包
rm -f temp.zip "$PLUGIN"
zip -q -r temp.zip icon.png info.json main.js
mv temp.zip "$PLUGIN"

# 计算 sha256
SHA256=$(shasum -a 256 "$PLUGIN" | awk '{print $1}')

# 回填到 appcast.json（版本、desc、sha256、url）
python3 - "$VERSION" "$SHA256" <<'PY'
import json, sys
version, sha256 = sys.argv[1], sys.argv[2]
base = "https://github.com/vacuityv/bob-plugin-vac-gptranslate"
with open("appcast.json") as f:
    data = json.load(f)
data["versions"] = [{
    "version": version,
    "desc": f"{base}/releases/tag/{version}",
    "sha256": sha256,
    "url": f"{base}/releases/download/{version}/bob-plugin-vac-gptranslate.bobplugin",
    "minBobVersion": "0.5.0",
}]
with open("appcast.json", "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

echo "version: $VERSION"
echo "sha256:  $SHA256"
echo "appcast.json updated."
open .
