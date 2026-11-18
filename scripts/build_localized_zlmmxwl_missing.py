#!/usr/bin/env python3
"""Build and validate localized packages for the 9 missing Mingxing Physics courseware."""

import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.routers.animations import validate_courseware

WORK_DIR = ROOT_DIR / "tmp/zlmmxwl-localized"
WORK_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def build_zip(index_html: str, assets: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", index_html.encode("utf-8"))
        for path, data in assets.items():
            zf.writestr(path, data)
    return buf.getvalue()

results = {}

# 1. res-msx8za0o-yhcnh7: 双星模型
print("Processing 1/9: 双星模型...")
raw = fetch("https://zlmmxwl.com/uploads/resources/09bbc09740d04cc7ad1e865e3074107d/file.html").decode("utf-8")
if "<head>" in raw:
    raw = raw.replace("<head>", "<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">")
else:
    raw = "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" + raw
status, summary, errors, warnings = validate_courseware(raw.encode("utf-8"))
assert status == "passed", f"双星模型 validation failed: {errors}"
results["res-msx8za0o-yhcnh7"] = {"type": "html", "data": raw.encode("utf-8"), "filename": "res-msx8za0o-yhcnh7.html"}

# 2. res-msx8vtat-zrymkp: 回旋加速器
print("Processing 2/9: 回旋加速器...")
raw_bytes = fetch("https://zlmmxwl.com/uploads/resources/9bab8725d8c244d686b47f086015207c/file.html")
status, summary, errors, warnings = validate_courseware(raw_bytes)
assert status == "passed", f"回旋加速器 validation failed: {errors}"
results["res-msx8vtat-zrymkp"] = {"type": "html", "data": raw_bytes, "filename": "res-msx8vtat-zrymkp.html"}

# 3. res-3b3f82baa79548c4: 安培力与导体棒
print("Processing 3/9: 安培力与导体棒...")
raw_bytes = fetch("https://zlmmxwl.com/uploads/resources/67025be54ec645da89b697e1ff38595d/file.html")
status, summary, errors, warnings = validate_courseware(raw_bytes)
assert status == "passed", f"安培力与导体棒 validation failed: {errors}"
results["res-3b3f82baa79548c4"] = {"type": "html", "data": raw_bytes, "filename": "res-3b3f82baa79548c4.html"}

# 4. res-msx6amp0-t2d7q3: 牛顿大炮
print("Processing 4/9: 牛顿大炮...")
raw = fetch("https://zlmmxwl.com/uploads/resources/6e925318dd34428e977ec9e960abcb1e/file.html").decode("utf-8")
raw = re.sub(r'<script\b[^>]*polyfill\.io[^>]*>.*?</script>', '', raw)
raw = re.sub(r'<script\b[^>]*mathjax[^>]*>.*?</script>', '', raw)
status, summary, errors, warnings = validate_courseware(raw.encode("utf-8"))
assert status == "passed", f"牛顿大炮 validation failed: {errors}"
results["res-msx6amp0-t2d7q3"] = {"type": "html", "data": raw.encode("utf-8"), "filename": "res-msx6amp0-t2d7q3.html"}

# 5. res-msx6lvyn-5tqu3v: 演示机械波动画
print("Processing 5/9: 演示机械波动画...")
wave_html = fetch("https://musk-online.fbcontent.cn/pub-musk-ai-studio/workflow/file/document/cpWo5yWNxAehmFxHtQUdsW.html").decode("utf-8")
if "<meta name=\"viewport\"" not in wave_html:
    wave_html = wave_html.replace("<head>", "<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">")
s1 = fetch("https://metis-online.fbcontent.cn/metis-misc/blER0Bn7vsa2JER9IEssf8.js")
s2 = fetch("https://metis-online.fbcontent.cn/metis-misc/cnObWiSohGePYbyhB6LlQ.js")
s3 = fetch("https://metis-online.fbcontent.cn/metis-misc/zgLDUdmazTYc0B4K6Cor.js")
wave_html = wave_html.replace("https://metis-online.fbcontent.cn/metis-misc/blER0Bn7vsa2JER9IEssf8.js", "./_localized/blER0Bn7vsa2JER9IEssf8.js")
wave_html = wave_html.replace("https://metis-online.fbcontent.cn/metis-misc/cnObWiSohGePYbyhB6LlQ.js", "./_localized/cnObWiSohGePYbyhB6LlQ.js")
wave_html = wave_html.replace("https://metis-online.fbcontent.cn/metis-misc/zgLDUdmazTYc0B4K6Cor.js", "./_localized/zgLDUdmazTYc0B4K6Cor.js")
zip_bytes = build_zip(wave_html, {
    "_localized/blER0Bn7vsa2JER9IEssf8.js": s1,
    "_localized/cnObWiSohGePYbyhB6LlQ.js": s2,
    "_localized/zgLDUdmazTYc0B4K6Cor.js": s3
})
status, summary, errors, warnings = validate_courseware(wave_html.encode("utf-8"))
assert status == "passed", f"演示机械波动画 validation failed: {errors}"
results["res-msx6lvyn-5tqu3v"] = {"type": "zip", "data": zip_bytes, "filename": "res-msx6lvyn-5tqu3v.zip"}

# 6. res-msx6l0ev-jtfs3v: 运动合成
print("Processing 6/9: 运动合成...")
comp_html = fetch("https://musk-online.fbcontent.cn/pub-musk-ai-studio/workflow/file/document/wRKJe7DDgBjEUmykhLTCyT.html").decode("utf-8")
if "<meta name=\"viewport\"" not in comp_html:
    comp_html = comp_html.replace("<head>", "<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">")
comp_html = comp_html.replace("https://metis-online.fbcontent.cn/metis-misc/cnObWiSohGePYbyhB6LlQ.js", "./_localized/cnObWiSohGePYbyhB6LlQ.js")
comp_html = comp_html.replace("https://metis-online.fbcontent.cn/metis-misc/zgLDUdmazTYc0B4K6Cor.js", "./_localized/zgLDUdmazTYc0B4K6Cor.js")
zip_bytes = build_zip(comp_html, {
    "_localized/cnObWiSohGePYbyhB6LlQ.js": s2,
    "_localized/zgLDUdmazTYc0B4K6Cor.js": s3
})
status, summary, errors, warnings = validate_courseware(comp_html.encode("utf-8"))
assert status == "passed", f"运动合成 validation failed: {errors}"
results["res-msx6l0ev-jtfs3v"] = {"type": "zip", "data": zip_bytes, "filename": "res-msx6l0ev-jtfs3v.zip"}

# 7. res-msxaveki-963lxr: 开普勒三定律——B版
print("Processing 7/9: 开普勒三定律——B版...")
kep_html = fetch("https://zlmmxwl.com/uploads/resources/3692cfe571344b6d86327b3c34e94beb/code-1.html").decode("utf-8")
tw_js = fetch("https://cdn.tailwindcss.com")
fa_css = fetch("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css")
# Remove google fonts link
kep_html = re.sub(r'<link\b[^>]*fonts\.googleapis\.com[^>]*>', '', kep_html)
kep_html = kep_html.replace("https://cdn.tailwindcss.com", "./_localized/tailwind.js")
kep_html = kep_html.replace("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css", "./_localized/all.min.css")
zip_bytes = build_zip(kep_html, {
    "_localized/tailwind.js": tw_js,
    "_localized/all.min.css": fa_css
})
status, summary, errors, warnings = validate_courseware(kep_html.encode("utf-8"))
assert status == "passed", f"开普勒三定律——B版 validation failed: {errors}"
results["res-msxaveki-963lxr"] = {"type": "zip", "data": zip_bytes, "filename": "res-msxaveki-963lxr.zip"}

# 8. res-msx8vh14-ruvk8v: 光学干涉衍射模拟平台
print("Processing 8/9: 光学干涉衍射模拟平台...")
opt_html = fetch("https://zlmmxwl.com/uploads/resources/fbb3462dab594669a4ec6887c2a19b16/file.html").decode("utf-8")
j1 = fetch("https://static.zxxk.com/h5/static/9472d769fd5984881a2562461b75c140.js")
j2 = fetch("https://static.zxxk.com/h5/static/4328ece7a486aa04b358fd751d187a7d.js")
c1 = fetch("https://static.zxxk.com/h5/static/a2a736faed492a6ca95c2dcfb0dba264.css")
opt_html = opt_html.replace("https://static.zxxk.com/h5/static/9472d769fd5984881a2562461b75c140.js", "./_localized/9472d769fd5984881a2562461b75c140.js")
opt_html = opt_html.replace("https://static.zxxk.com/h5/static/4328ece7a486aa04b358fd751d187a7d.js", "./_localized/4328ece7a486aa04b358fd751d187a7d.js")
opt_html = re.sub(r'https://static\.zxxk\.com/h5/static/a2a736faed492a6ca95c2dcfb0dba264\.css[^\'"]*', './_localized/a2a736faed492a6ca95c2dcfb0dba264.css', opt_html)
zip_bytes = build_zip(opt_html, {
    "_localized/9472d769fd5984881a2562461b75c140.js": j1,
    "_localized/4328ece7a486aa04b358fd751d187a7d.js": j2,
    "_localized/a2a736faed492a6ca95c2dcfb0dba264.css": c1
})
status, summary, errors, warnings = validate_courseware(opt_html.encode("utf-8"))
assert status == "passed", f"光学干涉衍射模拟平台 validation failed: {errors}"
results["res-msx8vh14-ruvk8v"] = {"type": "zip", "data": zip_bytes, "filename": "res-msx8vh14-ruvk8v.zip"}

# 9. res-msx8ungg-2t2bnh: 地球磁场3D可视化
print("Processing 9/9: 地球磁场3D可视化...")
mag_html = fetch("https://zlmmxwl.com/uploads/resources/abe493a1749844ee957612e5c9b3bab5/3D.html").decode("utf-8")
# Remove broken FontLoader script tag
mag_html = re.sub(r'<script\b[^>]*FontLoader\.js[^>]*>.*?</script>', '', mag_html)
three_js = fetch("https://static.zxxk.com/h5/static/eb8549863a97355411c3259a3f93b8e1.js")
orbit_js = fetch("https://static.zxxk.com/h5/static/48f274cfd49a802a7e05038955700e42.js")
font_json = fetch("https://static.zxxk.com/h5/static/73827a618c7eb2d2792b1d08b3329e97.json")
earth_jpg = fetch("https://static.zxxk.com/h5/static/e15eb8d2a32d001aa4e06884f6a566cd.jpg")

mag_html = mag_html.replace("https://static.zxxk.com/h5/static/eb8549863a97355411c3259a3f93b8e1.js", "./_localized/three.min.js")
mag_html = mag_html.replace("https://static.zxxk.com/h5/static/48f274cfd49a802a7e05038955700e42.js", "./_localized/OrbitControls.js")
mag_html = mag_html.replace("https://static.zxxk.com/h5/static/73827a618c7eb2d2792b1d08b3329e97.json", "./_localized/font.json")
mag_html = mag_html.replace("https://static.zxxk.com/h5/static/e15eb8d2a32d001aa4e06884f6a566cd.jpg", "./_localized/earth.jpg")

zip_bytes = build_zip(mag_html, {
    "_localized/three.min.js": three_js,
    "_localized/OrbitControls.js": orbit_js,
    "_localized/font.json": font_json,
    "_localized/earth.jpg": earth_jpg
})
status, summary, errors, warnings = validate_courseware(mag_html.encode("utf-8"))
assert status == "passed", f"地球磁场3D可视化 validation failed: {errors}"
results["res-msx8ungg-2t2bnh"] = {"type": "zip", "data": zip_bytes, "filename": "res-msx8ungg-2t2bnh.zip"}

print("\nALL 9 PACKAGES VALIDATED SUCCESSFULLY!")
for k, v in results.items():
    p = WORK_DIR / v["filename"]
    p.write_bytes(v["data"])
    print(f"Saved: {p} ({len(v['data'])} bytes)")
