#!/usr/bin/env python3
"""力学实验系列构建脚本（仅标准库）。

用法：
  python3 build.py M01          # 构建单个模块
  python3 build.py all          # 构建全部已登记模块
  python3 build.py M01 --publish  # 另复制到 frontend/public/mech-lab-2027/

检查（任一失败则不出包）：外链、禁用 API、禁用 id、ES2020 语法、体积、JSON 结构、verify.mjs。
"""
import json
import html
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CORE = ROOT / "core"
DIST = ROOT / "dist"
PUBLIC = ROOT.parent.parent / "frontend" / "public" / "mech-lab-2027"

CORE_CSS = ["base.css", "paper.css"]
CORE_JS = ["ml.js", "math.js", "physics.js", "stage.js", "chart.js", "paper.js", "shell.js",
           "instruments/tape-model.js", "instruments/tape-view.js",
           "instruments/gauges-model.js", "instruments/gauges-view.js"]

MODULES = {
    "M00": {"dir": "M00-instruments", "out": "M00-基础仪器与读数.html"},
    "M01": {"dir": "M01-tape", "out": "M01-探究小车速度随时间变化的规律.html"},
    "M02": {"dir": "M02-spring", "out": "M02-探究弹簧弹力与形变量的关系.html"},
    "M03": {"dir": "M03-afm", "out": "M03-探究加速度与力、质量的关系.html"},
    "M04": {"dir": "M04-projectile", "out": "M04-探究平抛运动的特点.html"},
    "M05": {"dir": "M05-centripetal", "out": "M05-探究向心力大小与半径、角速度、质量的关系.html"},
    "M06": {"dir": "M06-forces", "out": "M06-探究两个互成角度的力的合成规律.html"},
    "M07": {"dir": "M07-energy", "out": "M07-验证机械能守恒定律.html"},
    "M08": {"dir": "M08-momentum", "out": "M08-验证动量守恒定律.html"},
    "M09": {"dir": "M09-pendulum", "out": "M09-用单摆测量重力加速度.html"},
}

SIZE_TARGET = 350 * 1024
SIZE_LIMIT = 600 * 1024
BANNED_IDS = ["left", "right", "eqb", "tabL", "tabR", "top"]
BANNED_API = [
    (r"\bfetch\s*\(", "fetch"), (r"XMLHttpRequest", "XMLHttpRequest"), (r"\bWebSocket\b", "WebSocket"),
    (r"getContext\(\s*['\"](?:webgl|experimental-webgl|webgl2)", "WebGL"), (r"backdrop-filter", "backdrop-filter"),
    (r"\beval\s*\(", "eval"), (r"new\s+Function\s*\(", "new Function"), (r"shadowBlur", "Canvas shadowBlur"),
    (r"<iframe", "iframe"), (r"\bimport\s*\(", "动态 import"), (r"<script[^>]+src=", "外部脚本"),
]
QTYPES = {"choice", "multi", "numeric", "expr", "text-choice", "plot"}


def fail(errors, msg):
    errors.append(msg)


def check_content(c, errors):
    for k in ["slug", "title", "learn", "equipment", "procedure", "errors", "reverse", "summary"]:
        if k not in c:
            fail(errors, f"content.json 缺少字段 {k}")
    err_ids = {e["id"] for e in c.get("errors", [])}
    proc_ids = {p["id"] for p in c.get("procedure", [])}
    for e in c.get("errors", []):
        for k in ["id", "name", "config", "observe", "consequence", "ask", "why"]:
            if k not in e:
                fail(errors, f"错误操作 {e.get('id')} 缺少 {k}")
        a = e.get("ask", {})
        if not (0 <= a.get("answer", -1) < len(a.get("options", []))):
            fail(errors, f"错误操作 {e.get('id')} 的 ask.answer 越界")
        if e.get("noteId") and e["noteId"] not in proc_ids:
            fail(errors, f"错误操作 {e['id']} 的 noteId {e['noteId']} 不存在")
    for p in c.get("procedure", []):
        if p.get("errorId") and p["errorId"] not in err_ids:
            fail(errors, f"步骤 {p['id']} 的 errorId {p['errorId']} 不存在")
    for r in c.get("reverse", []):
        if r.get("replay") and r["replay"] not in err_ids:
            fail(errors, f"反推 {r['id']} 的 replay {r['replay']} 不存在")
        if any(not (0 <= i < len(r["options"])) for i in r["answer"]):
            fail(errors, f"反推 {r['id']} 的 answer 越界")
    n_err = len([e for e in c.get("errors", []) if not e["id"].startswith("M")])
    if n_err < 4:
        fail(errors, f"错误操作只有 {n_err} 个（要求 ≥ 4）")
    if len(c.get("reverse", [])) < 2:
        fail(errors, "反推案例少于 2 个")
    return err_ids


def check_questions(qs, err_ids, errors):
    kept, dropped = [], []
    for q in qs:
        if not q.get("verified", False):
            dropped.append(q.get("id"))
            continue
        if not q.get("source"):
            fail(errors, f"题目 {q.get('id')} 缺少来源")
        for i, p in enumerate(q.get("parts", [])):
            t = p.get("type")
            where = f"题目 {q.get('id')} 第 {i + 1} 空"
            if t not in QTYPES:
                fail(errors, f"{where} 类型 {t} 不支持")
            if ("answer" not in p and t != "plot") or not p.get("explain"):
                fail(errors, f"{where} 缺少答案或解析")
            if t in ("choice", "text-choice") and not (0 <= p["answer"] < len(p["options"])):
                fail(errors, f"{where} 答案越界")
            if t == "multi" and any(not (0 <= a < len(p["options"])) for a in p["answer"]):
                fail(errors, f"{where} 答案越界")
            if t == "plot":
                for k in ["x", "y", "points", "slope", "tol", "snap"]:
                    if k not in p:
                        fail(errors, f"{where} 作图题缺少 {k}")
            if p.get("replay") and p["replay"] not in err_ids:
                fail(errors, f"{where} replay {p['replay']} 不存在")
        kept.append(q)
    return kept, dropped


def build_quiz_manifest(key, content, questions, errors):
    items = []

    def add(source, question_id, title, kind, answer=None, options=None):
        source["quizId"] = question_id
        title = re.sub(r"<[^>]+>", "", title)
        item = {"id": question_id, "title": " ".join(html.unescape(title).split())[:200],
                "type": kind, "maxScore": 1}
        if options is not None:
            item["options"] = [f"{chr(65 + i)}. {option}" for i, option in enumerate(options)]
        if answer is not None:
            item["answer"] = str(answer)[:200]
        items.append(item)

    def letters(indices):
        return "、".join(chr(65 + i) for i in sorted(indices))

    for question in questions:
        for part in question["parts"]:
            label = part.get("label") or ""
            part_id = part.get("id") or label or "main"
            title = f"{question['source']}{label} {part.get('prompt', '')}"
            kind = part["type"]
            answer = part.get("answer")
            if kind in ("choice", "text-choice"):
                kind, answer = "choice", letters([answer])
            elif kind == "multi":
                answer = letters(answer)
            elif kind == "plot":
                answer = f"参考斜率 {part['slope']}"
            elif kind == "expr":
                answer = part.get("show") or answer
            add(part, f"{key}:paper:{question['id']}:{part_id}", title, kind, answer, part.get("options"))

    for error in content["errors"]:
        ask = error["ask"]
        add(ask, f"{key}:try:{error['id']}", f"试一试 · {error['name']} · {ask['stem']}", "choice",
            letters([ask["answer"]]), ask["options"])
    for case in content["reverse"]:
        add(case, f"{key}:reverse:{case['id']}", f"结果反推 · {case['stem']}",
            "multi" if len(case["answer"]) > 1 else "choice", letters(case["answer"]), case["options"])

    ids = [item["id"] for item in items]
    if not 0 < len(items) <= 200 or len(set(ids)) != len(ids) or any(len(id_) > 80 for id_ in ids):
        fail(errors, "平台题单题数超限、题目 ID 重复或题目 ID 超过 80 字符")
    manifest = {"version": 1, "questions": items}
    if len(safe_json(manifest).encode("utf-8")) > 64 * 1024:
        fail(errors, "平台题单超过 64 KB")
    return manifest


def safe_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def strip_js_comments_and_strings(js):
    js = re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"", "''", js)
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"(?m)//.*$", "", js)
    return js


def build(key, publish=False):
    mod = MODULES[key]
    mdir = ROOT / "modules" / mod["dir"]
    errors, warns = [], []
    content = json.loads((mdir / "content.json").read_text("utf-8"))
    questions = json.loads((mdir / "questions.json").read_text("utf-8"))
    err_ids = check_content(content, errors)
    questions, dropped = check_questions(questions, err_ids, errors)
    if dropped:
        warns.append(f"未核对（verified=false）的题目已剔除：{', '.join(dropped)}")
    manifest = build_quiz_manifest(key, content, questions, errors) if not errors else None

    css = "\n".join((CORE / f).read_text("utf-8") for f in CORE_CSS)
    if (mdir / "scene.css").exists():
        css += "\n" + (mdir / "scene.css").read_text("utf-8")
    css += "\n" + (CORE / "layout.css").read_text("utf-8")
    js_files = [(f, (CORE / f).read_text("utf-8")) for f in CORE_JS] + [("scene.js", (mdir / "scene.js").read_text("utf-8"))]

    for name, js in js_files:
        code = strip_js_comments_and_strings(js)
        if re.search(r"\?\.[A-Za-z_$(\[]", code) or "??" in code:
            fail(errors, f"{name} 使用了 ES2020 语法（?. 或 ??）")
        if re.search(r"^\s*(import|export)\s", code, re.M):
            fail(errors, f"{name} 使用了 ES module 语法")
    # Chrome 106 CSS 兼容性扫描
    css_no_cmt = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    if "@starting-style" in css_no_cmt:
        fail(errors, "CSS 使用了 Chrome 117+ 特性 @starting-style")
    if re.search(r"\b\d+(?:\.\d+)?(?:dvh|svh|lvh|dvw|svw|lvw)\b", css_no_cmt):
        fail(errors, "CSS 使用了 Chrome 108+ 动态视口单位（dvh/svh/lvh）")

    js_all = "\n".join(f"/* ==== {n} ==== */\n{s}" for n, s in js_files)
    html = (
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
        f"<title>{content['title']}</title>\n<style>\n{css}\n</style>\n</head>\n<body>\n"
        f"<script type=\"application/json\" id=\"ml-content\">{safe_json(content)}</script>\n"
        f"<script type=\"application/json\" id=\"ml-questions\">{safe_json(questions)}</script>\n"
        f"<script type=\"application/json\" id=\"edusimu-quiz-manifest\">{safe_json(manifest)}</script>\n"
        f"<script>\n{js_all}\n</script>\n</body>\n</html>\n"
    )

    # 外链：除 SVG 命名空间外不允许出现任何 http(s)://
    for m in re.finditer(r"https?://[^\s\"'<>)]+", html):
        if not m.group(0).startswith("http://www.w3.org/"):
            fail(errors, f"发现外部链接：{m.group(0)[:80]}")
    for pat, label in BANNED_API:
        if re.search(pat, html):
            fail(errors, f"使用了禁用 API / 元素：{label}")
    for bid in BANNED_IDS:
        if re.search(rf"id=[\"']{bid}[\"']|#{bid}\b(?![-\w])|getElementById\([\"']{bid}[\"']\)", html):
            fail(errors, f"使用了禁用 id：{bid}")

    size = len(html.encode("utf-8"))
    if size > SIZE_LIMIT:
        fail(errors, f"体积 {size / 1024:.0f} KB 超过上限 600 KB")
    elif size > SIZE_TARGET:
        warns.append(f"体积 {size / 1024:.0f} KB 超过目标 350 KB")

    verify = mdir / "verify.mjs"
    if verify.exists():
        r = subprocess.run(["node", str(verify)], capture_output=True, text=True, cwd=mdir)
        if r.returncode != 0:
            fail(errors, "verify.mjs 未通过：\n" + r.stdout + r.stderr)
        else:
            print(r.stdout.strip().splitlines()[-1])

    for w in warns:
        print("  注意：" + w)
    if errors:
        print(f"[{key}] 构建失败：")
        for e in errors:
            print("  ✕ " + e)
        return False
    DIST.mkdir(exist_ok=True)
    out = DIST / mod["out"]
    out.write_text(html, "utf-8")
    print(f"[{key}] ✓ {out.relative_to(ROOT)}  {size / 1024:.0f} KB  平台题项 {len(manifest['questions'])} 道")
    if publish:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out, PUBLIC / mod["out"])
        print(f"      已复制到 {PUBLIC / mod['out']}")
    return True


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    publish = "--publish" in argv
    keys = [a for a in argv if not a.startswith("--")]
    targets = list(MODULES) if keys == ["all"] else keys
    ok = True
    for k in targets:
        if k not in MODULES:
            print(f"未登记的模块：{k}")
            ok = False
            continue
        ok = build(k, publish) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
