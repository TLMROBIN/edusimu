import io
import json
import mimetypes
import os
import random
import re
import shutil
import time
import zipfile
from pathlib import Path
from typing import List, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_active_user, require_role
from ..database import get_db, settings
from ..models import Animation, AnimationInteraction, Rating, Subject, TextbookNode, User, ViewHistory
from ..physics_catalog import PHYSICS_CATALOG
from ..schemas import (
    AiPromptSuggestion,
    AnimationResponse,
    AnimationUpdate,
    GeoGebraImportRequest,
    InteractionCreate,
    TextbookImportRequest,
    TextbookNodeCreate,
    TextbookNodeResponse,
    TextbookNodeUpdate,
    ViewHistoryCreate,
    ViewHistoryUpdate,
    ViewHistoryResponse,
)
from ..subject_catalogs import BIOLOGY_CATALOG, CHEMISTRY_CATALOG, MATH_CATALOG

router = APIRouter(prefix="/api/animations", tags=["动画管理"])

PRESET_CATALOGS = {
    "math": MATH_CATALOG,
    "physics": PHYSICS_CATALOG,
    "chemistry": CHEMISTRY_CATALOG,
    "biology": BIOLOGY_CATALOG,
}

RECOMMENDED_MAX_FILE_SIZE = 15 * 1024 * 1024
WARNING_FILE_SIZE = 5 * 1024 * 1024
MAX_EXTERNAL_RESOURCE_SIZE = 8 * 1024 * 1024
MAX_EXTERNAL_TOTAL_SIZE = 25 * 1024 * 1024
MAX_EXTERNAL_RESOURCE_COUNT = 32
MOUSE_ONLY_PATTERNS = [
    "mouseover",
    "mouseenter",
    "mouseleave",
    "mouseout",
    "contextmenu",
    "wheel",
]
TOUCH_FRIENDLY_PATTERNS = [
    "touchstart",
    "touchend",
    "touchmove",
    "pointerdown",
    "pointerup",
    "click",
    "onclick",
]
COMMON_AI_CONSTRAINTS = (
    "请生成单个可直接运行的 HTML 文件，不依赖外部 CDN、外部图片、外部字体、外部脚本或任何外网请求。"
    " 页面必须适配平板横竖屏，包含 viewport，所有核心交互必须可触控完成。可以同时支持鼠标和触控，但不能仅依赖 hover、右键、滚轮、键盘快捷键或鼠标悬停。"
    " 页面应适合内网教学平板，按钮和热点区域要足够大，默认离线可运行，代码结构清晰，便于教师后续继续修改。"
)
HTML_EXTERNAL_RESOURCE_RE = re.compile(
    r'(?P<prefix><(?P<tag>script|img|source|audio|video|link)\b[^>]*?\b(?P<attr>src|href)\s*=\s*["\'])'
    r'(?P<url>https?://[^"\']+)'
    r'(?P<suffix>["\'])',
    re.IGNORECASE,
)
CSS_URL_RE = re.compile(r'url\((?P<quote>["\']?)(?P<url>[^)"\']+)(?P=quote)\)', re.IGNORECASE)
STATIC_CONTENT_TYPE_PREFIXES = ("image/", "audio/", "video/", "font/")
STATIC_EXACT_CONTENT_TYPES = {
    "text/css",
    "application/javascript",
    "text/javascript",
    "application/x-javascript",
    "application/font-woff",
    "application/font-woff2",
    "application/vnd.ms-fontobject",
}
STATIC_EXTENSIONS = {
    ".css", ".js", ".mjs", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".wav", ".ogg", ".mp4", ".webm",
}
ALLOWED_UPLOAD_EXTENSIONS = {".html", ".zip"}
VALID_SOURCE_TYPES = {"phet", "original", "geogebra"}
GEOGEBRA_MATERIAL_URL_PATTERNS = [
    re.compile(r"geogebra\.org/m/(?P<id>[A-Za-z0-9]+)", re.IGNORECASE),
    re.compile(r"geogebra\.org/material/show/id/(?P<id>[A-Za-z0-9]+)", re.IGNORECASE),
]
GEOGEBRA_TITLE_RE = re.compile(r"<title>(?P<title>.*?)</title>", re.IGNORECASE | re.DOTALL)
GEOGEBRA_META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
GEOGEBRA_META_ATTR_RE = re.compile(
    r'(?P<name>[a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"(?P<dq>[^"]*)"|\'(?P<sq>[^\']*)\'|(?P<bare>[^\s>]+))',
    re.IGNORECASE,
)
GEOGEBRA_DOWNLOAD_CANDIDATES = [
    "https://www.geogebra.org/material/download/format/file/id/{material_id}",
    "https://www.geogebra.org/material/download/id/{material_id}",
]


def build_file_url(file_path: str) -> str:
    normalized_path = os.path.abspath(file_path)
    upload_root = os.path.abspath(settings.upload_dir)
    if normalized_path.startswith(upload_root):
        relative_path = os.path.relpath(normalized_path, upload_root).replace(os.sep, "/")
        return f"/uploads/{relative_path}"
    return file_path


def build_textbook_path(node: Optional[TextbookNode]) -> Optional[str]:
    if not node:
        return None

    parts = []
    current = node
    while current:
        parts.append(current.name)
        current = current.parent
    return " / ".join(reversed(parts))


def normalize_source_type(source_type: Optional[str]) -> Optional[str]:
    if not source_type:
        return None
    normalized = source_type.strip().lower()
    if normalized not in VALID_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail="来源筛选无效")
    return normalized


def build_textbook_tree(nodes: List[TextbookNode], parent_id: Optional[int] = None) -> List[TextbookNodeResponse]:
    branch = []
    current_nodes = [node for node in nodes if node.parent_id == parent_id]
    current_nodes.sort(key=lambda item: (item.sort_order, item.id))
    for node in current_nodes:
        branch.append(TextbookNodeResponse(
            id=node.id,
            subject_id=node.subject_id,
            parent_id=node.parent_id,
            name=node.name,
            node_type=node.node_type,
            sort_order=node.sort_order,
            children=build_textbook_tree(nodes, node.id),
        ))
    return branch


def create_catalog_nodes(db: Session, subject_id: int, books: list[dict]):
    for book_index, book in enumerate(books, start=1):
        book_node = TextbookNode(
            subject_id=subject_id,
            name=book["name"],
            node_type="book",
            sort_order=book_index,
        )
        db.add(book_node)
        db.flush()

        for chapter_index, chapter in enumerate(book.get("children", []), start=1):
            chapter_node = TextbookNode(
                subject_id=subject_id,
                parent_id=book_node.id,
                name=chapter["name"],
                node_type="chapter",
                sort_order=chapter_index,
            )
            db.add(chapter_node)
            db.flush()

            for section_index, section in enumerate(chapter.get("children", []), start=1):
                db.add(TextbookNode(
                    subject_id=subject_id,
                    parent_id=chapter_node.id,
                    name=section["name"],
                    node_type="section",
                    sort_order=section_index,
                ))


def preset_catalog_to_tree(catalog: list[tuple[str, list[tuple[str, list[str]]]]]) -> list[dict]:
    return [
        {
            "name": book_name,
            "children": [
                {
                    "name": chapter_name,
                    "children": [{"name": section_name, "children": []} for section_name in sections],
                }
                for chapter_name, sections in chapters
            ],
        }
        for book_name, chapters in catalog
    ]


def validate_required_textbook_node(
    db: Session,
    subject_id: int,
    textbook_node_id: Optional[int],
) -> TextbookNode:
    if textbook_node_id is None:
        raise HTTPException(status_code=400, detail="上传课件时必须指定所属章节")

    textbook_node = db.query(TextbookNode).filter(TextbookNode.id == textbook_node_id).first()
    if not textbook_node or textbook_node.subject_id != subject_id:
        raise HTTPException(status_code=400, detail="教材目录与学科不匹配")

    has_children = db.query(TextbookNode.id).filter(TextbookNode.parent_id == textbook_node.id).first() is not None
    if has_children:
        raise HTTPException(status_code=400, detail="必须选择最末级章节节点，不能选择整本书或整章")

    return textbook_node


def parse_json_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def generate_default_thumbnail(subject_id: int) -> str:
    thumbnail_dir = os.path.join(settings.upload_dir, "thumbnails")
    os.makedirs(thumbnail_dir, exist_ok=True)

    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    thumbnail_filename = f"default_{subject_id}_{timestamp}_{random_id}.png"
    thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)
    render_default_thumbnail_image(thumbnail_path, subject_id)
    return f"/uploads/thumbnails/{thumbnail_filename}"


def render_default_thumbnail_image(thumbnail_path: str, subject_id: int) -> None:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (320, 180), color=(244, 249, 255))
    draw = ImageDraw.Draw(img)

    subject_colors = {
        1: ((250, 196, 84), (248, 231, 180)),
        2: ((74, 124, 255), (141, 202, 255)),
        3: ((78, 188, 215), (177, 238, 245)),
        4: ((80, 146, 255), (130, 227, 220)),
        5: ((128, 102, 255), (210, 174, 255)),
        6: ((58, 173, 132), (171, 234, 187)),
        7: ((105, 170, 88), (194, 228, 165)),
        8: ((236, 102, 120), (255, 183, 156)),
        9: ((110, 133, 161), (203, 216, 230)),
    }
    primary_color, secondary_color = subject_colors.get(subject_id, ((116, 144, 180), (210, 222, 235)))

    for offset in range(180):
        ratio = offset / 179
        line_color = tuple(
            int(244 + ((secondary_color[index] - 244) * ratio) * 0.15)
            for index in range(3)
        )
        draw.line((0, offset, 320, offset), fill=line_color)

    draw.rounded_rectangle((18, 18, 302, 162), radius=24, fill=(255, 255, 255), outline=(220, 231, 244), width=1)

    halo_color = tuple(int(channel * 0.9) for channel in secondary_color)
    draw.ellipse((194, -14, 330, 122), fill=halo_color)
    draw.ellipse((236, 12, 340, 116), fill=tuple(int(channel * 0.94) for channel in secondary_color))

    line_color = tuple(int(channel * 0.92) for channel in primary_color)
    draw.rounded_rectangle((34, 30, 286, 146), radius=22, fill=(246, 250, 255))
    draw.rounded_rectangle((34, 30, 286, 146), radius=22, outline=(228, 236, 246), width=1)

    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
        subtitle_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    subject_names = {
        1: "语文",
        2: "数学",
        3: "英语",
        4: "物理",
        5: "化学",
        6: "生物",
        7: "地理",
        8: "政治",
        9: "历史",
    }
    subject_name = subject_names.get(subject_id, "学科")
    chip_text = "HTML"
    chip_bbox = draw.textbbox((0, 0), chip_text, font=subtitle_font)
    chip_width = chip_bbox[2] - chip_bbox[0]
    chip_height = chip_bbox[3] - chip_bbox[1]
    chip_x = 48
    chip_y = 68
    draw.rounded_rectangle(
        (chip_x - 10, chip_y - 8, chip_x + chip_width + 10, chip_y + chip_height + 8),
        radius=14,
        fill=(246, 250, 255),
        outline=(217, 228, 241),
        width=1,
    )
    draw.text((chip_x, chip_y), chip_text, fill=(22, 97, 255), font=subtitle_font)

    title_y = 96
    draw.text((48, title_y), subject_name, fill=(16, 35, 63), font=title_font)
    draw.line((48, title_y + 34, 122, title_y + 34), fill=line_color, width=4)

    img.save(thumbnail_path, "PNG", quality=85)


def save_upload_file(content: bytes, subject_id: int) -> tuple[str, int]:
    subject_dir = os.path.join(settings.upload_dir, str(subject_id))
    os.makedirs(subject_dir, exist_ok=True)

    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    filename = f"{timestamp}_{random_id}.html"
    file_path = os.path.join(subject_dir, filename)

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    return file_path, len(content)


def save_generated_courseware_package(subject_id: int, entry_html: str, assets: dict[str, bytes]) -> tuple[str, int]:
    subject_dir = os.path.join(settings.upload_dir, str(subject_id))
    os.makedirs(subject_dir, exist_ok=True)

    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    package_dir = os.path.join(subject_dir, f"pkg_{timestamp}_{random_id}")
    os.makedirs(package_dir, exist_ok=True)

    total_size = 0
    for relative_path, content in assets.items():
        safe_name = ensure_safe_zip_member(relative_path)
        destination = os.path.join(package_dir, safe_name)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        Path(destination).write_bytes(content)
        total_size += len(content)

    entry_path = os.path.join(package_dir, "index.html")
    entry_bytes = entry_html.encode("utf-8")
    Path(entry_path).write_bytes(entry_bytes)
    total_size += len(entry_bytes)
    return entry_path, total_size


def ensure_safe_zip_member(member_name: str) -> str:
    normalized = member_name.replace("\\", "/").strip("/")
    if not normalized or normalized.startswith("../") or "/../" in normalized:
        raise ValueError("ZIP 包内包含非法路径。")
    return normalized


def extract_courseware_package(content: bytes, subject_id: int) -> tuple[str, bytes, int]:
    subject_dir = os.path.join(settings.upload_dir, str(subject_id))
    os.makedirs(subject_dir, exist_ok=True)

    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    package_dir = os.path.join(subject_dir, f"pkg_{timestamp}_{random_id}")
    os.makedirs(package_dir, exist_ok=True)

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            members = [item for item in archive.infolist() if not item.is_dir()]
            if not members:
                raise ValueError("ZIP 包中没有可用文件。")

            html_candidates: list[str] = []
            total_size = 0
            for member in members:
                safe_name = ensure_safe_zip_member(member.filename)
                total_size += member.file_size
                if total_size > settings.max_file_size:
                    raise ValueError(f"ZIP 解压后的总大小超过限制 {settings.max_file_size} 字节")

                destination = os.path.join(package_dir, safe_name)
                os.makedirs(os.path.dirname(destination), exist_ok=True)
                with archive.open(member) as source, open(destination, "wb") as target:
                    shutil.copyfileobj(source, target)

                if safe_name.lower().endswith(".html"):
                    html_candidates.append(safe_name)
        if not html_candidates:
            raise ValueError("ZIP 包内未找到 HTML 入口文件。")

        preferred_names = ["index.html", "main.html", "home.html"]
        entry_relative = None
        lower_map = {item.lower(): item for item in html_candidates}
        for preferred in preferred_names:
            if preferred in lower_map:
                entry_relative = lower_map[preferred]
                break

        if entry_relative is None:
            root_level = [item for item in html_candidates if "/" not in item]
            if len(root_level) == 1:
                entry_relative = root_level[0]
            elif len(html_candidates) == 1:
                entry_relative = html_candidates[0]
            else:
                raise ValueError("ZIP 包内存在多个 HTML 文件，请确保入口文件命名为 index.html。")

        entry_path = os.path.join(package_dir, entry_relative)
        entry_content = Path(entry_path).read_bytes()
        return entry_path, entry_content, total_size
    except Exception:
        shutil.rmtree(package_dir, ignore_errors=True)
        raise


def process_courseware_upload(content: bytes, filename: str, subject_id: int) -> tuple[str, int, str, str, List[str], List[str]]:
    extension = os.path.splitext(filename or "")[1].lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="只支持 HTML 文件或 ZIP 课件包")

    if extension == ".zip":
        try:
            file_path, file_content, saved_size = extract_courseware_package(content, subject_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        file_content, localization_errors, localization_warnings = localize_external_resources(content, subject_id)
        validation_status, validation_summary, validation_errors, validation_warnings = validate_courseware(file_content)
        validation_errors.extend(localization_errors)
        validation_warnings.extend(localization_warnings)
        validation_status = "passed" if not validation_errors else "failed"
        validation_summary = f"校验{'通过' if validation_status == 'passed' else '未通过'}：{len(validation_errors)} 个问题，{len(validation_warnings)} 条提醒"
        file_path, saved_size = save_upload_file(file_content, subject_id)
        return file_path, saved_size, validation_status, validation_summary, validation_errors, validation_warnings

    file_content, localization_errors, localization_warnings = localize_external_resources(file_content, subject_id)
    validation_status, validation_summary, validation_errors, validation_warnings = validate_courseware(file_content)
    validation_errors.extend(localization_errors)
    validation_warnings.extend(localization_warnings)
    validation_status = "passed" if not validation_errors else "failed"
    validation_summary = f"校验{'通过' if validation_status == 'passed' else '未通过'}：{len(validation_errors)} 个问题，{len(validation_warnings)} 条提醒"
    if localization_errors or localization_warnings or file_content != Path(file_path).read_bytes():
        Path(file_path).write_bytes(file_content)
    return file_path, saved_size, validation_status, validation_summary, validation_errors, validation_warnings


def is_allowed_external_response(content_type: str, extension: str) -> bool:
    normalized_type = (content_type or "").split(";")[0].strip().lower()
    if normalized_type in STATIC_EXACT_CONTENT_TYPES:
        return True
    if any(normalized_type.startswith(prefix) for prefix in STATIC_CONTENT_TYPE_PREFIXES):
        return True
    return extension.lower() in STATIC_EXTENSIONS


def guess_extension_from_response(url: str, content_type: str) -> str:
    parsed_url = urllib_parse.urlparse(url)
    extension = os.path.splitext(parsed_url.path)[1].lower()
    if extension in STATIC_EXTENSIONS:
        return extension

    normalized_type = (content_type or "").split(";")[0].strip().lower()
    guessed = mimetypes.guess_extension(normalized_type) or ""
    if guessed == ".jpe":
        guessed = ".jpg"
    if guessed:
        return guessed
    return ".bin"


def localize_external_resources(content: bytes, subject_id: int) -> tuple[bytes, List[str], List[str]]:
    html_text = content.decode("utf-8", errors="ignore")
    if "http://" not in html_text.lower() and "https://" not in html_text.lower():
        return content, [], []

    warnings: List[str] = []
    errors: List[str] = []
    state = {
        "count": 0,
        "bytes": 0,
        "cache": {},
        "subject_id": subject_id,
        "dir": os.path.join(
            settings.upload_dir,
            "external_cache",
            str(subject_id),
            f"{int(time.time() * 1000)}_{random.randint(1000, 9999)}",
        ),
    }
    os.makedirs(state["dir"], exist_ok=True)

    def download_asset(url: str) -> str:
        cached = state["cache"].get(url)
        if cached:
            return cached

        if state["count"] >= MAX_EXTERNAL_RESOURCE_COUNT:
            raise ValueError(f"外链资源数量超过 {MAX_EXTERNAL_RESOURCE_COUNT} 个，无法自动本地化。")

        request = urllib_request.Request(url, headers={"User-Agent": "EduSimuCoursewareLocalizer/1.0"})
        try:
            with urllib_request.urlopen(request, timeout=8) as response:
                content_type = response.headers.get("Content-Type", "")
                extension = guess_extension_from_response(url, content_type)
                if not is_allowed_external_response(content_type, extension):
                    raise ValueError(f"资源类型不允许自动本地化：{url}")

                chunks = []
                total = 0
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_EXTERNAL_RESOURCE_SIZE:
                        raise ValueError(f"单个外链资源超过 {MAX_EXTERNAL_RESOURCE_SIZE // (1024 * 1024)}MB：{url}")
                    if state["bytes"] + total > MAX_EXTERNAL_TOTAL_SIZE:
                        raise ValueError("外链资源总大小超过 25MB，无法自动本地化。")
                    chunks.append(chunk)
        except (urllib_error.URLError, TimeoutError) as exc:
            raise ValueError(f"下载外链资源失败：{url}") from exc

        state["count"] += 1
        state["bytes"] += total
        filename = f"asset_{state['count']}{extension}"
        absolute_path = os.path.join(state["dir"], filename)
        content_bytes = b"".join(chunks)

        if extension == ".css":
            css_text = content_bytes.decode("utf-8", errors="ignore")
            css_text = localize_css_content(css_text, url)
            content_bytes = css_text.encode("utf-8")

        with open(absolute_path, "wb") as buffer:
            buffer.write(content_bytes)

        relative_url = build_file_url(absolute_path)
        state["cache"][url] = relative_url
        return relative_url

    def localize_css_content(css_text: str, base_url: str) -> str:
        def replace_css_url(match: re.Match[str]) -> str:
            raw_url = match.group("url").strip()
            if not raw_url or raw_url.startswith("data:"):
                return match.group(0)
            absolute_url = urllib_parse.urljoin(base_url, raw_url)
            if not absolute_url.startswith(("http://", "https://")):
                return match.group(0)
            try:
                local_url = download_asset(absolute_url)
                return f"url('{local_url}')"
            except ValueError as exc:
                warnings.append(str(exc))
                return match.group(0)

        return CSS_URL_RE.sub(replace_css_url, css_text)

    def replace_html_resource(match: re.Match[str]) -> str:
        tag = (match.group("tag") or "").lower()
        full_tag = match.group(0).lower()
        url = match.group("url")
        if tag == "link" and "stylesheet" not in full_tag:
            return match.group(0)

        try:
            local_url = download_asset(url)
            return f"{match.group('prefix')}{local_url}{match.group('suffix')}"
        except ValueError as exc:
            errors.append(str(exc))
            return match.group(0)

    localized_html = HTML_EXTERNAL_RESOURCE_RE.sub(replace_html_resource, html_text)
    if state["count"] > 0:
        warnings.append(f"系统已自动本地化 {state['count']} 个外链静态资源。")

    return localized_html.encode("utf-8"), errors, warnings


def extract_geogebra_material_id(link: str) -> Optional[str]:
    normalized_link = (link or "").strip()
    for pattern in GEOGEBRA_MATERIAL_URL_PATTERNS:
        matched = pattern.search(normalized_link)
        if matched:
            return matched.group("id")

    parsed = urllib_parse.urlparse(normalized_link)
    query_id = urllib_parse.parse_qs(parsed.query).get("id", [])
    if query_id and re.fullmatch(r"[A-Za-z0-9]+", query_id[0]):
        return query_id[0]
    return None


def read_remote_response_bytes(response, size_limit: int) -> bytes:
    chunks = []
    total = 0
    while True:
        chunk = response.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > size_limit:
            raise ValueError(f"GeoGebra 课件文件超过限制 {size_limit} 字节")
        chunks.append(chunk)
    return b"".join(chunks)


def clean_geogebra_title(raw_title: str) -> Optional[str]:
    title = re.sub(r"\s+", " ", raw_title or "").strip()
    if not title:
        return None
    title = re.sub(r"\s+[–-]\s+GeoGebra$", "", title, flags=re.IGNORECASE).strip()
    return title or None


def extract_html_title(html_bytes: bytes) -> Optional[str]:
    html_text = html_bytes.decode("utf-8", errors="ignore")
    meta_candidates: dict[str, str] = {}
    for tag_match in GEOGEBRA_META_TAG_RE.finditer(html_text):
        attrs: dict[str, str] = {}
        for attr_match in GEOGEBRA_META_ATTR_RE.finditer(tag_match.group(0)):
            raw_value = attr_match.group("dq")
            if raw_value is None:
                raw_value = attr_match.group("sq")
            if raw_value is None:
                raw_value = attr_match.group("bare")
            attrs[attr_match.group("name").strip().lower()] = raw_value or ""

        meta_key = (attrs.get("property") or attrs.get("name") or "").strip().lower()
        meta_content = clean_geogebra_title(attrs.get("content") or "")
        if meta_key and meta_content:
            meta_candidates.setdefault(meta_key, meta_content)

    for preferred_key in ("og:title", "twitter:title", "title"):
        if meta_candidates.get(preferred_key):
            return meta_candidates[preferred_key]

    matched = GEOGEBRA_TITLE_RE.search(html_text)
    if not matched:
        return None
    return clean_geogebra_title(matched.group("title"))


def build_geogebra_import_html(title: str, description: str, original_link: str, material_filename: str) -> str:
    safe_title = title.strip() or "GeoGebra 课件"
    safe_description = description.strip() or "由线上 GeoGebra 链接导入并本地化保存。"
    escaped_title = safe_title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped_description = safe_description.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped_link = original_link.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped_material_filename = material_filename.replace("\\", "/").replace("'", "\\'")
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>{escaped_title}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #eef5ff;
      --panel: rgba(255, 255, 255, 0.95);
      --line: rgba(80, 124, 196, 0.18);
      --text: #10233f;
      --muted: #617897;
      --accent: #1661ff;
      --accent-soft: #12a9c4;
      --shadow: 0 22px 50px rgba(16, 35, 63, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(18, 169, 196, 0.12), transparent 32%),
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
      color: var(--text);
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    }}
    body {{ touch-action: manipulation; }}
    .page {{
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 14px;
      padding: 16px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      align-items: center;
      flex-wrap: wrap;
    }}
    .eyebrow {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--accent);
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .eyebrow::before {{
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--accent), var(--accent-soft));
    }}
    h1 {{ margin: 0; font-size: clamp(24px, 3vw, 34px); line-height: 1.2; }}
    .desc {{
      margin-top: 8px;
      color: var(--muted);
      line-height: 1.6;
      white-space: pre-wrap;
    }}
    .actions {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }}
    button {{
      appearance: none;
      border: none;
      border-radius: 14px;
      padding: 12px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }}
    .primary {{
      background: linear-gradient(135deg, var(--accent), var(--accent-soft));
      color: #fff;
    }}
    .secondary {{
      background: #f7faff;
      color: var(--text);
      border: 1px solid var(--line);
    }}
    .content {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 14px;
      min-height: 0;
    }}
    .stage {{
      padding: 14px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }}
    .canvas {{
      flex: 1;
      min-height: 520px;
      border-radius: 18px;
      border: 1px solid rgba(80, 124, 196, 0.14);
      background: linear-gradient(180deg, rgba(250, 252, 255, 0.96), rgba(240, 246, 255, 0.92));
      overflow: hidden;
    }}
    #ggb-element, #ggb-element > div {{
      width: 100%;
      height: 100%;
    }}
    .side {{
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}
    .side-title {{
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    .side-card {{
      border: 1px solid rgba(80, 124, 196, 0.12);
      border-radius: 16px;
      padding: 14px;
      background: rgba(247, 250, 255, 0.92);
    }}
    .status {{
      font-weight: 700;
      color: var(--accent);
    }}
    .link {{
      word-break: break-all;
      line-height: 1.6;
      color: var(--muted);
    }}
    @media (max-width: 980px) {{
      .content {{
        grid-template-columns: 1fr;
      }}
      .canvas {{
        min-height: 420px;
      }}
    }}
  </style>
</head>
<body>
  <div class="page">
    <section class="panel header">
      <div>
        <div class="eyebrow">GeoGebra Import</div>
        <h1>{escaped_title}</h1>
        <div class="desc">{escaped_description}</div>
      </div>
      <div class="actions">
        <button class="secondary" id="reload-button" type="button">重新载入</button>
        <button class="primary" id="reset-button" type="button">重置课件</button>
      </div>
    </section>
    <section class="content">
      <div class="panel stage">
        <div class="canvas">
          <div id="ggb-element"></div>
        </div>
      </div>
      <aside class="panel side">
        <div class="side-card">
          <div class="side-title">状态</div>
          <div id="status-text" class="status">正在加载本地 GeoGebra 课件…</div>
        </div>
        <div class="side-card">
          <div class="side-title">来源链接</div>
          <div class="link"><a href="{escaped_link}" rel="noreferrer">{escaped_link}</a></div>
        </div>
        <div class="side-card">
          <div class="side-title">说明</div>
          <div class="link">该课件已将 GeoGebra 数据保存到本地包内，运行时使用站内 `/geogebra` 引擎，不依赖 GeoGebra 官方运行脚本。</div>
        </div>
      </aside>
    </section>
  </div>

  <script src="/geogebra/GeoGebra/deployggb.js"></script>
  <script>
    (() => {{
      const statusText = document.getElementById('status-text')
      const setStatus = message => {{
        statusText.textContent = message
      }}
      const applet = new window.GGBApplet({{
        filename: './{escaped_material_filename}',
        appName: 'classic',
        showToolBar: true,
        showAlgebraInput: false,
        showMenuBar: false,
        showResetIcon: false,
        showZoomButtons: true,
        enableRightClick: false,
        enableLabelDrags: true,
        enableShiftDragZoom: false,
        useBrowserForJS: true,
        language: 'zh',
        country: 'CN',
        borderColor: '#dce7f7',
        appletOnLoad: api => {{
          window.ggbApplet = api
          setStatus('GeoGebra 课件已加载完成。')
        }}
      }}, true)

      if (typeof applet.setHTML5Codebase === 'function') {{
        applet.setHTML5Codebase('/geogebra/GeoGebra/HTML5/5.0/web3d/')
      }}

      document.getElementById('reset-button').addEventListener('click', () => {{
        if (window.ggbApplet && typeof window.ggbApplet.reset === 'function') {{
          window.ggbApplet.reset()
          setStatus('课件已重置到初始状态。')
        }}
      }})

      document.getElementById('reload-button').addEventListener('click', () => {{
        window.location.reload()
      }})

      window.addEventListener('error', event => {{
        setStatus('运行时错误：' + (event.message || '未知错误'))
      }})

      if (typeof window.GGBApplet !== 'function') {{
        setStatus('未检测到本地 GeoGebra 运行库。')
        return
      }}

      applet.inject('ggb-element', 'preferhtml5')
    }})()
  </script>
</body>
</html>"""


def download_geogebra_material(link: str) -> tuple[bytes, str, Optional[str]]:
    normalized_link = (link or "").strip()
    if not normalized_link:
        raise HTTPException(status_code=400, detail="GeoGebra 链接不能为空")

    material_id = extract_geogebra_material_id(normalized_link)
    if not material_id:
        raise HTTPException(status_code=400, detail="暂不支持该 GeoGebra 链接格式，请提供 geogebra.org/m/... 或 material/show/id/... 链接")

    page_title: Optional[str] = None
    page_request = urllib_request.Request(normalized_link, headers={"User-Agent": "EduSimuGeoGebraImporter/1.0"})
    try:
        with urllib_request.urlopen(page_request, timeout=8) as response:
            page_title = extract_html_title(read_remote_response_bytes(response, 2 * 1024 * 1024))
    except Exception:
        page_title = None

    for url_template in GEOGEBRA_DOWNLOAD_CANDIDATES:
        candidate_url = url_template.format(material_id=material_id)
        request = urllib_request.Request(candidate_url, headers={"User-Agent": "EduSimuGeoGebraImporter/1.0"})
        try:
            with urllib_request.urlopen(request, timeout=12) as response:
                content = read_remote_response_bytes(response, settings.max_file_size)
                if content[:2] != b"PK":
                    continue
                filename = f"geogebra-material-{material_id}.ggb"
                return content, filename, page_title
        except (urllib_error.URLError, TimeoutError, ValueError):
            continue

    raise HTTPException(status_code=400, detail="未能从该链接下载 GeoGebra 课件数据，请确认链接公开可访问，且资源允许下载")


def remove_file_if_exists(file_path: Optional[str]):
    if file_path and os.path.exists(file_path):
        os.remove(file_path)


def remove_courseware_path(file_path: Optional[str]):
    if not file_path:
        return
    if not os.path.exists(file_path):
        return
    parent_dir = os.path.dirname(file_path)
    if os.path.basename(parent_dir).startswith("pkg_"):
        shutil.rmtree(parent_dir, ignore_errors=True)
        return
    os.remove(file_path)


def validate_courseware(content: bytes) -> tuple[str, str, List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []
    size = len(content)
    html_text = content.decode("utf-8", errors="ignore")
    lower_html = html_text.lower()

    if size > RECOMMENDED_MAX_FILE_SIZE:
        errors.append("课件体积超过 15MB，不适合平板内网场景。")
    elif size > WARNING_FILE_SIZE:
        warnings.append("课件体积超过 5MB，建议压缩图片、脚本和样式资源。")

    if not re.search(r'<meta[^>]+name=["\']viewport["\'][^>]+content=["\'][^"\']*width=device-width', lower_html):
        errors.append("缺少适配平板的 viewport 设置。")

    external_resources = re.findall(
        r'<(?:script|img|source|audio|video|link|iframe|embed)\b[^>]*\b(?:src|href)\s*=\s*["\'](https?:)?//[^"\']+["\']',
        lower_html,
    )
    if external_resources:
        errors.append("检测到外链资源，内网平板环境必须使用本地资源。")

    has_external_fetch = re.search(r'fetch\s*\(\s*["\']https?://', lower_html)
    has_external_xhr = re.search(
        r'xmlhttprequest[\s\S]{0,400}\.open\s*\([^)]*["\']https?://',
        lower_html,
    )
    has_external_socket = re.search(r'new\s+websocket\s*\(\s*["\']wss?://', lower_html)
    has_external_beacon = re.search(r'sendbeacon\s*\(\s*["\']https?://', lower_html)
    if has_external_fetch or has_external_xhr or has_external_socket or has_external_beacon:
        errors.append("检测到外部网络请求，课件需支持内网离线使用。")

    mouse_patterns_found = [pattern for pattern in MOUSE_ONLY_PATTERNS if pattern in lower_html]

    if ":hover" in lower_html:
        warnings.append("检测到 :hover 样式，请确认主要功能不依赖悬停触发。")

    has_touch_friendly_patterns = any(pattern in lower_html for pattern in TOUCH_FRIENDLY_PATTERNS)
    if mouse_patterns_found and not has_touch_friendly_patterns:
        errors.append(
            "检测到鼠标相关交互事件，但未检测到明确的点击、触摸或 pointer 事件。"
            " 课件可以同时支持鼠标和触控，但核心操作必须能直接触摸完成。"
        )
    elif mouse_patterns_found:
        warnings.append(
            "检测到鼠标相关交互事件。若这些事件只用于增强体验可保留，但请确认所有核心操作在平板触控下同样可完成。"
        )

    if not has_touch_friendly_patterns:
        warnings.append("未检测到明确的触控、点击或 pointer 事件，请确认核心操作可直接触摸完成。")

    if "target=\"_blank\"" in lower_html or "target='_blank'" in lower_html or "window.open(" in lower_html:
        warnings.append("检测到新窗口跳转，平板内网环境通常不建议依赖多窗口行为。")

    if "touch-action" not in lower_html:
        warnings.append("未检测到 touch-action 配置，复杂手势场景下可能出现误触或滚动冲突。")

    if not re.search(r'@media\s*\(', lower_html):
        warnings.append("未检测到响应式媒体查询，请确认横竖屏下布局仍可用。")

    if re.search(r'(min-width|min-height)\s*:\s*(9\d{2,}|[1-9]\d{3,})px', lower_html):
        warnings.append("检测到较大的固定尺寸设置，可能在平板上出现溢出。")

    validation_status = "passed" if not errors else "failed"
    summary = f"校验{ '通过' if validation_status == 'passed' else '未通过' }：{len(errors)} 个问题，{len(warnings)} 条提醒"
    return validation_status, summary, errors, warnings


def build_issue_prompts(errors: List[str], warnings: List[str]) -> List[AiPromptSuggestion]:
    prompts: List[AiPromptSuggestion] = [
        AiPromptSuggestion(
            title="完整重写版 Prompt",
            prompt=(
                "请为课堂教学平板生成一个单文件 HTML 动画课件。"
                f"{COMMON_AI_CONSTRAINTS}"
                " 如果需要使用 React，请直接输出最终可离线运行的 HTML 结果，不要要求我再执行 npm、构建或打包命令。"
                " 如果引用过 CDN，请改成本地内嵌或页面内可直接运行的脚本。"
                " 课件应包含标题区、内容展示区、至少一个可点击互动环节、明显的返回/重置按钮，并使用原生 HTML/CSS/JavaScript。"
                " 输出时只返回完整 HTML 代码，不要附加解释。"
            ),
        ),
        AiPromptSuggestion(
            title="局部修复版 Prompt",
            prompt=(
                "下面是一个已有的 HTML 教学课件，请在保留原有教学内容的前提下修复其平板兼容性和内网部署问题。"
                f"{COMMON_AI_CONSTRAINTS}"
                " 如果当前代码使用 React 或其他前端框架，请直接改成最终可离线运行的 HTML，不要保留需要联网加载的框架依赖。"
                " 请优先修复触控操作、资源本地化、体积控制和响应式布局问题。"
                " 输出时返回修复后的完整 HTML 代码。"
            ),
        ),
    ]

    issue_rules = [
        (
            "viewport",
            "补充平板 viewport Prompt",
            "请为这个 HTML 课件补充适合平板的 viewport 配置，并确保在 10-13 英寸平板横竖屏下都能正常显示，不出现整体缩放异常或横向滚动。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "外链资源",
            "移除外链资源 Prompt",
            "请把这个 HTML 课件中所有外链资源改成本地内嵌或同文件内可运行的实现，不能引用 CDN、远程图片、远程字体、远程脚本。"
            " 如果你使用了 React CDN、Vue CDN 或其他框架 CDN，请直接输出最终离线可运行版本，不要保留任何运行时外链。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "外部网络请求",
            "移除联网请求 Prompt",
            "请删除这个 HTML 课件中的外网请求和联网依赖，保证课件在完全离线的内网平板环境中也能正常运行。"
            " 即使页面使用 React，也不要依赖 fetch、XHR、WebSocket、远程接口或远程配置文件。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "鼠标",
            "改为触控交互 Prompt",
            "请把这个课件中的核心交互改成适合平板触控的实现。课件可以同时支持鼠标和触控，但主要操作必须支持点击、触摸或 pointer 事件，不能只依赖 hover、右键、滚轮。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "15MB",
            "压缩体积 Prompt",
            "请重构这个 HTML 课件以显著减小文件体积，减少大图片、冗余脚本和重复样式，优先保证首屏加载速度和内网平板流畅度。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            ":hover",
            "去除 Hover 依赖 Prompt",
            "请检查这个课件是否把 hover 作为主要交互方式，如果有，请改为点击或触控即可完成的交互。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "touch-action",
            "补充触控手势 Prompt",
            "请为这个课件补充适合平板操作的 touch-action 和触控事件处理，避免页面滚动与交互手势冲突。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "响应式",
            "增强响应式布局 Prompt",
            "请为这个课件补充响应式布局，确保在平板横屏和竖屏下文字、按钮、图形区域都不会溢出或重叠。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
        (
            "固定尺寸",
            "去除大尺寸固定布局 Prompt",
            "请把这个课件中的大尺寸固定宽高布局改成适合平板的自适应布局，避免使用过大的 min-width 或 min-height。"
            f"{COMMON_AI_CONSTRAINTS}",
        ),
    ]

    combined_issues = errors + warnings
    for keyword, title, prompt in issue_rules:
        if any(keyword in issue for issue in combined_issues):
            prompts.append(AiPromptSuggestion(title=title, prompt=prompt))

    return prompts


def build_ai_guidance(errors: List[str], warnings: List[str]) -> str:
    if not errors and not warnings:
        return "当前课件已通过必检项。若仍想用 AI 优化，可要求其继续提升平板横竖屏布局、按钮触控面积和首屏加载速度。"
    return (
        "把下方 Prompt 直接发给 AI，并附上你当前的 HTML 代码。"
        " 如果课件问题较多，优先使用“完整重写版 Prompt”；如果只是修补现有课件，优先使用“局部修复版 Prompt”或对应的专项 Prompt。"
        " 让 AI 只返回完整 HTML，不要解释。"
        " 如果课件原来用了 React、CDN 或在线脚本，也要要求 AI 输出最终离线可运行版本，而不是继续保留 npm、构建命令或运行时外链。"
    )


def serialize_animation(animation: Animation, db: Session) -> AnimationResponse:
    avg_rating = db.query(func.avg(Rating.score)).filter(Rating.animation_id == animation.id).scalar()
    rating_count = db.query(func.count(Rating.id)).filter(Rating.animation_id == animation.id).scalar()
    creator_name = animation.creator.real_name or animation.creator.username if animation.creator else None
    subject_name = animation.subject.display_name if animation.subject else None
    textbook_path = build_textbook_path(animation.textbook_node)

    validation_errors = parse_json_list(animation.validation_errors)
    validation_warnings = parse_json_list(animation.validation_warnings)
    ai_prompts = build_issue_prompts(validation_errors, validation_warnings)

    anim_dict = {
        **animation.__dict__,
        "source_type": animation.source_type or "original",
        "file_url": build_file_url(animation.file_path),
        "creator_name": creator_name,
        "subject_name": subject_name,
        "textbook_path": textbook_path,
        "avg_rating": round(avg_rating, 2) if avg_rating else None,
        "rating_count": rating_count or 0,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "ai_guidance": build_ai_guidance(validation_errors, validation_warnings),
        "ai_prompts": ai_prompts,
    }
    return AnimationResponse(**anim_dict)


def compute_review_state(current_user: User, wants_publish: bool, validation_status: str, force_publish: bool = False) -> tuple[bool, str]:
    if force_publish and current_user.role == "admin":
        should_publish = wants_publish
        review_status = "approved" if wants_publish else "needs_fix"
        return should_publish, review_status
    
    should_publish = current_user.role == "admin" and wants_publish and validation_status == "passed"
    if validation_status == "failed":
        review_status = "needs_fix"
    elif should_publish:
        review_status = "approved"
    else:
        review_status = "pending_review"
    return should_publish, review_status


def ensure_animation_access(animation: Animation, current_user: User):
    if current_user.role == "student" and not animation.is_published:
        raise HTTPException(status_code=403, detail="无权访问此动画")
    if current_user.role == "teacher" and not animation.is_published and animation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此动画")


def build_animation_query(
    db: Session,
    current_user: User,
    subject_id: Optional[int] = None,
    grade_level: Optional[str] = None,
    search: Optional[str] = None,
    textbook_node_id: Optional[int] = None,
    source_type: Optional[str] = None,
    mine_only: bool = False,
    is_published: Optional[bool] = None,
    review_status: Optional[str] = None,
    validation_status: Optional[str] = None,
):
    query = db.query(Animation).outerjoin(TextbookNode, Animation.textbook_node_id == TextbookNode.id)

    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    if grade_level:
        query = query.filter(Animation.grade_level == grade_level)
    if search:
        query = query.filter(
            (Animation.title.ilike(f"%{search}%"))
            | (Animation.keywords.ilike(f"%{search}%"))
            | (Animation.description.ilike(f"%{search}%"))
            | (Animation.author.ilike(f"%{search}%"))
            | (TextbookNode.name.ilike(f"%{search}%"))
        )
    if textbook_node_id:
        query = query.filter(Animation.textbook_node_id == textbook_node_id)
    if source_type:
        query = query.filter(Animation.source_type == source_type)
    if review_status:
        query = query.filter(Animation.review_status == review_status)
    if validation_status:
        query = query.filter(Animation.validation_status == validation_status)

    if current_user.role == "student":
        query = query.filter(Animation.is_published.is_(True))
    elif current_user.role == "teacher":
        if mine_only:
            query = query.filter(Animation.created_by == current_user.id)
        if is_published is True:
            query = query.filter(Animation.is_published.is_(True))
        elif is_published is False:
            query = query.filter(
                Animation.is_published.is_(False),
                Animation.created_by == current_user.id,
            )
        elif not mine_only:
            query = query.filter(
                (Animation.is_published.is_(True))
                | (Animation.created_by == current_user.id)
            )
    elif is_published is not None:
        query = query.filter(Animation.is_published == is_published)

    return query


@router.get("/subjects")
async def get_subjects(db: Session = Depends(get_db)):
    return db.query(Subject).order_by(Subject.sort_order).all()


@router.get("/textbook-tree", response_model=List[TextbookNodeResponse])
async def get_textbook_tree(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = db.query(TextbookNode)
    if subject_id:
        query = query.filter(TextbookNode.subject_id == subject_id)
    nodes = query.order_by(TextbookNode.subject_id, TextbookNode.sort_order, TextbookNode.id).all()
    return build_textbook_tree(nodes)


@router.post("/textbook-nodes", response_model=TextbookNodeResponse, status_code=status.HTTP_201_CREATED)
async def create_textbook_node(
    node_data: TextbookNodeCreate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    subject = db.query(Subject).filter(Subject.id == node_data.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="学科不存在")

    parent = None
    if node_data.parent_id is not None:
        parent = db.query(TextbookNode).filter(TextbookNode.id == node_data.parent_id).first()
        if not parent or parent.subject_id != node_data.subject_id:
            raise HTTPException(status_code=400, detail="父节点与学科不匹配")
        valid_children = {
            "book": "chapter",
            "chapter": "section",
        }
        expected_type = valid_children.get(parent.node_type)
        if expected_type != node_data.node_type:
            raise HTTPException(status_code=400, detail="目录层级不合法")
    elif node_data.node_type != "book":
        raise HTTPException(status_code=400, detail="顶级节点只能是册次")

    node = TextbookNode(
        subject_id=node_data.subject_id,
        parent_id=node_data.parent_id,
        name=node_data.name,
        node_type=node_data.node_type,
        sort_order=node_data.sort_order,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return TextbookNodeResponse.model_validate(node)


@router.put("/textbook-nodes/{node_id}", response_model=TextbookNodeResponse)
async def update_textbook_node(
    node_id: int,
    node_data: TextbookNodeUpdate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    node = db.query(TextbookNode).filter(TextbookNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="教材目录不存在")

    update_data = node_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(node, field, value)

    db.commit()
    db.refresh(node)
    return TextbookNodeResponse.model_validate(node)


@router.delete("/textbook-nodes/{node_id}")
async def delete_textbook_node(
    node_id: int,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    node = db.query(TextbookNode).filter(TextbookNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="教材目录不存在")

    has_children = db.query(TextbookNode.id).filter(TextbookNode.parent_id == node_id).first() is not None
    if has_children:
        raise HTTPException(status_code=400, detail="请先删除子节点")

    has_animations = db.query(Animation.id).filter(Animation.textbook_node_id == node_id).first() is not None
    if has_animations:
        raise HTTPException(status_code=400, detail="该章节下已有课件，不能删除")

    db.delete(node)
    db.commit()
    return {"message": "教材目录已删除"}


@router.post("/textbook-import")
async def import_textbook_catalog(
    payload: TextbookImportRequest,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    subject = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="学科不存在")

    if payload.replace_existing:
        bound_count = db.query(Animation.id).filter(
            Animation.subject_id == payload.subject_id,
            Animation.textbook_node_id.is_not(None),
        ).count()
        if bound_count > 0:
            raise HTTPException(status_code=400, detail="该学科已有课件绑定教材目录，不能整体覆盖导入")

    if payload.use_preset:
        preset = PRESET_CATALOGS.get(subject.name)
        if not preset:
            raise HTTPException(status_code=400, detail="当前学科没有预置目录")
        books = preset_catalog_to_tree(preset)
    else:
        books = [book.model_dump() for book in payload.books]

    if not books:
        raise HTTPException(status_code=400, detail="请提供要导入的教材目录")

    if payload.replace_existing:
        db.query(TextbookNode).filter(TextbookNode.subject_id == payload.subject_id).delete(synchronize_session=False)
        db.flush()

    create_catalog_nodes(db, payload.subject_id, books)
    db.commit()
    return {
        "message": "教材目录导入成功",
        "subject": subject.display_name,
        "book_count": len(books),
        "replace_existing": payload.replace_existing,
    }


@router.get("/", response_model=List[AnimationResponse])
async def get_animations(
    subject_id: Optional[int] = None,
    grade_level: Optional[str] = None,
    search: Optional[str] = None,
    textbook_node_id: Optional[int] = None,
    source_type: Optional[str] = None,
    mine_only: bool = False,
    is_published: Optional[bool] = None,
    review_status: Optional[str] = None,
    validation_status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = build_animation_query(
        db=db,
        current_user=current_user,
        subject_id=subject_id,
        grade_level=grade_level,
        search=search,
        textbook_node_id=textbook_node_id,
        source_type=normalize_source_type(source_type),
        mine_only=mine_only,
        is_published=is_published,
        review_status=review_status,
        validation_status=validation_status,
    )

    animations = query.order_by(Animation.created_at.desc()).offset(skip).limit(limit).all()
    return [serialize_animation(animation, db) for animation in animations]


@router.get("/count")
async def get_animation_count(
    subject_id: Optional[int] = None,
    grade_level: Optional[str] = None,
    search: Optional[str] = None,
    textbook_node_id: Optional[int] = None,
    source_type: Optional[str] = None,
    mine_only: bool = False,
    is_published: Optional[bool] = None,
    review_status: Optional[str] = None,
    validation_status: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = build_animation_query(
        db=db,
        current_user=current_user,
        subject_id=subject_id,
        grade_level=grade_level,
        search=search,
        textbook_node_id=textbook_node_id,
        source_type=normalize_source_type(source_type),
        mine_only=mine_only,
        is_published=is_published,
        review_status=review_status,
        validation_status=validation_status,
)
    return {"total": query.count()}


@router.post("/import-geogebra-link", response_model=AnimationResponse, status_code=status.HTTP_201_CREATED)
async def import_geogebra_link(
    payload: GeoGebraImportRequest,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    subject = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="学科不存在")

    validate_required_textbook_node(db, payload.subject_id, payload.textbook_node_id)

    if payload.force_publish and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="只有管理员可以强制发布")

    material_bytes, material_filename, remote_title = download_geogebra_material(payload.link)
    animation_title = (payload.title or remote_title or "GeoGebra 导入课件").strip()
    animation_description = (payload.description or "由线上 GeoGebra 链接导入并本地化保存。").strip()
    entry_html = build_geogebra_import_html(
        title=animation_title,
        description=animation_description,
        original_link=payload.link.strip(),
        material_filename=material_filename,
    )
    file_path, saved_size = save_generated_courseware_package(
        payload.subject_id,
        entry_html,
        {material_filename: material_bytes},
    )

    validation_status, validation_summary, validation_errors, validation_warnings = validate_courseware(entry_html.encode("utf-8"))
    validation_warnings.append("课件内容由线上 GeoGebra 链接导入，若原资源被设置为私有或禁止下载，后续重新导入可能失败。")
    validation_status = "passed" if not validation_errors else "failed"
    validation_summary = f"校验{'通过' if validation_status == 'passed' else '未通过'}：{len(validation_errors)} 个问题，{len(validation_warnings)} 条提醒"

    should_publish, review_status_value = compute_review_state(
        current_user, payload.is_published, validation_status, force_publish=payload.force_publish
    )

    animation = Animation(
        title=animation_title,
        subject_id=payload.subject_id,
        textbook_node_id=payload.textbook_node_id,
        description=animation_description,
        author=current_user.real_name or current_user.username,
        file_path=file_path,
        thumbnail=None,
        grade_level=payload.grade_level,
        keywords=payload.keywords,
        source_type="geogebra",
        is_published=should_publish,
        review_status=review_status_value,
        validation_status=validation_status,
        validation_summary=validation_summary,
        validation_errors=json.dumps(validation_errors, ensure_ascii=False),
        validation_warnings=json.dumps(validation_warnings, ensure_ascii=False),
        file_size=saved_size,
        created_by=current_user.id,
    )

    db.add(animation)
    db.commit()
    db.refresh(animation)
    return serialize_animation(animation, db)


@router.get("/{animation_id}", response_model=AnimationResponse)
async def get_animation(
    animation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    ensure_animation_access(animation, current_user)
    return serialize_animation(animation, db)


@router.post("/", response_model=AnimationResponse, status_code=status.HTTP_201_CREATED)
async def create_animation(
    title: str = Form(...),
    subject_id: int = Form(...),
    textbook_node_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    grade_level: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    source_type: Optional[str] = Form(None),
    is_published: bool = Form(False),
    force_publish: bool = Form(False),
    file: UploadFile = File(...),
    thumbnail: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    if not file.filename or os.path.splitext(file.filename)[1].lower() not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="只支持 HTML 文件或 ZIP 课件包")

    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="学科不存在")
    validate_required_textbook_node(db, subject_id, textbook_node_id)
    normalized_source_type = normalize_source_type(source_type) or "original"

    file_content = await file.read()
    file_size = len(file_content)
    if file_size > settings.max_file_size:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制 {settings.max_file_size} 字节")

    file_path, saved_size, validation_status, validation_summary, validation_errors, validation_warnings = process_courseware_upload(
        file_content,
        file.filename,
        subject_id,
    )

    thumbnail_path = None
    if thumbnail and thumbnail.filename:
        thumbnail_ext = os.path.splitext(thumbnail.filename)[1].lower()
        if thumbnail_ext in [".jpg", ".jpeg", ".png", ".gif"]:
            thumbnail_dir = os.path.join(settings.upload_dir, "thumbnails")
            os.makedirs(thumbnail_dir, exist_ok=True)
            timestamp = int(time.time() * 1000)
            random_id = random.randint(1000, 9999)
            thumbnail_filename = f"{timestamp}_{random_id}{thumbnail_ext}"
            thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)
            with open(thumbnail_path, "wb") as buffer:
                shutil.copyfileobj(thumbnail.file, buffer)
            thumbnail_path = f"/uploads/thumbnails/{thumbnail_filename}"

    author_name = current_user.real_name or current_user.username
    
    if force_publish and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="只有管理员可以强制发布")
    
    should_publish, review_status_value = compute_review_state(
        current_user, is_published, validation_status, force_publish=force_publish
    )

    animation = Animation(
        title=title,
        subject_id=subject_id,
        textbook_node_id=textbook_node_id,
        description=description,
        author=author_name,
        file_path=file_path,
        thumbnail=thumbnail_path,
        grade_level=grade_level,
        keywords=keywords,
        source_type=normalized_source_type,
        is_published=should_publish,
        review_status=review_status_value,
        validation_status=validation_status,
        validation_summary=validation_summary,
        validation_errors=json.dumps(validation_errors, ensure_ascii=False),
        validation_warnings=json.dumps(validation_warnings, ensure_ascii=False),
        file_size=saved_size,
        created_by=current_user.id,
    )

    db.add(animation)
    db.commit()
    db.refresh(animation)
    return serialize_animation(animation, db)


@router.post("/{animation_id}/replace-file", response_model=AnimationResponse)
async def replace_animation_file(
    animation_id: int,
    file: UploadFile = File(...),
    thumbnail: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    subject_id: Optional[int] = Form(None),
    textbook_node_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    grade_level: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    source_type: Optional[str] = Form(None),
    is_published: bool = Form(False),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    if current_user.role == "teacher" and animation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权更新此课件")

    if not file.filename or os.path.splitext(file.filename)[1].lower() not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="只支持 HTML 文件或 ZIP 课件包")

    target_subject_id = subject_id if subject_id is not None else animation.subject_id
    target_subject = db.query(Subject).filter(Subject.id == target_subject_id).first()
    if not target_subject:
        raise HTTPException(status_code=404, detail="学科不存在")

    target_textbook_node_id = textbook_node_id if textbook_node_id is not None else animation.textbook_node_id
    validate_required_textbook_node(db, target_subject_id, target_textbook_node_id)
    normalized_source_type = normalize_source_type(source_type) or animation.source_type or "original"

    file_content = await file.read()
    file_size = len(file_content)
    if file_size > settings.max_file_size:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制 {settings.max_file_size} 字节")

    new_file_path, saved_size, validation_status, validation_summary, validation_errors, validation_warnings = process_courseware_upload(
        file_content,
        file.filename,
        target_subject_id,
    )

    new_thumbnail_path = animation.thumbnail
    if thumbnail and thumbnail.filename:
        thumbnail_ext = os.path.splitext(thumbnail.filename)[1].lower()
        if thumbnail_ext in [".jpg", ".jpeg", ".png", ".gif"]:
            thumbnail_dir = os.path.join(settings.upload_dir, "thumbnails")
            os.makedirs(thumbnail_dir, exist_ok=True)
            timestamp = int(time.time() * 1000)
            random_id = random.randint(1000, 9999)
            thumbnail_filename = f"{timestamp}_{random_id}{thumbnail_ext}"
            absolute_thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)
            with open(absolute_thumbnail_path, "wb") as buffer:
                shutil.copyfileobj(thumbnail.file, buffer)
            new_thumbnail_path = f"/uploads/thumbnails/{thumbnail_filename}"
    elif animation.thumbnail and os.path.basename(animation.thumbnail).startswith("default_"):
        new_thumbnail_path = None

    old_file_path = animation.file_path
    old_thumbnail_path = animation.thumbnail

    animation.file_path = new_file_path
    animation.file_size = saved_size
    animation.validation_status = validation_status
    animation.validation_summary = validation_summary
    animation.validation_errors = json.dumps(validation_errors, ensure_ascii=False)
    animation.validation_warnings = json.dumps(validation_warnings, ensure_ascii=False)
    animation.author = current_user.real_name or current_user.username
    animation.subject_id = target_subject_id
    animation.textbook_node_id = target_textbook_node_id
    animation.source_type = normalized_source_type

    if title is not None:
        animation.title = title
    if description is not None:
        animation.description = description
    if grade_level is not None:
        animation.grade_level = grade_level
    if keywords is not None:
        animation.keywords = keywords

    if new_thumbnail_path:
        animation.thumbnail = new_thumbnail_path

    should_publish, review_status_value = compute_review_state(current_user, is_published, validation_status)
    animation.is_published = should_publish
    animation.review_status = review_status_value

    db.commit()
    db.refresh(animation)

    if old_file_path != new_file_path:
        remove_courseware_path(old_file_path)
    if thumbnail and old_thumbnail_path and old_thumbnail_path != new_thumbnail_path and old_thumbnail_path.startswith("/uploads/thumbnails/"):
        remove_file_if_exists(os.path.join(settings.upload_dir, old_thumbnail_path.replace("/uploads/", "")))

    return serialize_animation(animation, db)


@router.put("/{animation_id}", response_model=AnimationResponse)
async def update_animation(
    animation_id: int,
    animation_data: AnimationUpdate,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    if current_user.role == "teacher" and animation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改此动画")
    if current_user.role == "teacher" and animation_data.is_published is not None:
        raise HTTPException(status_code=403, detail="教师不能直接发布课件")
    if current_user.role == "teacher" and animation_data.review_notes is not None:
        raise HTTPException(status_code=403, detail="教师不能修改审核意见")

    update_data = animation_data.model_dump(exclude_unset=True)
    review_notes = update_data.pop("review_notes", None)

    if "subject_id" in update_data or "textbook_node_id" in update_data:
        subject_id = update_data.get("subject_id", animation.subject_id)
        textbook_node_id = update_data.get("textbook_node_id", animation.textbook_node_id)
        validate_required_textbook_node(db, subject_id, textbook_node_id)

    for field, value in update_data.items():
        setattr(animation, field, value)

    if current_user.role == "admin":
        force_publish = bool(getattr(animation_data, "force_publish", False))
        if review_notes is not None:
            animation.review_notes = review_notes

        if animation_data.is_published is not None:
            if animation_data.is_published and animation.validation_status != "passed" and not force_publish:
                raise HTTPException(status_code=400, detail="课件校验未通过，不能发布")
            animation.is_published = animation_data.is_published
            if animation.is_published:
                animation.review_status = "approved"
            else:
                animation.review_status = "needs_fix" if animation.validation_status == "failed" else "pending_review"

    db.commit()
    db.refresh(animation)
    return serialize_animation(animation, db)


@router.delete("/{animation_id}")
async def delete_animation(
    animation_id: int,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    if current_user.role == "teacher" and animation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此动画")

    remove_courseware_path(animation.file_path)

    db.delete(animation)
    db.commit()
    return {"message": "动画已删除"}


@router.post("/{animation_id}/view", response_model=ViewHistoryResponse)
async def record_view(
    animation_id: int,
    view_data: ViewHistoryCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    ensure_animation_access(animation, current_user)
    animation.view_count += 1

    view_history = ViewHistory(
        user_id=current_user.id,
        animation_id=animation_id,
        view_duration=view_data.view_duration,
        interaction_count=view_data.interaction_count,
        quiz_score=view_data.quiz_score,
        quiz_total=view_data.quiz_total,
    )

    db.add(view_history)
    db.commit()
    db.refresh(view_history)
    return view_history


@router.patch("/{animation_id}/view/{view_history_id}", response_model=ViewHistoryResponse)
async def update_view_record(
    animation_id: int,
    view_history_id: int,
    view_data: ViewHistoryUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    ensure_animation_access(animation, current_user)

    view_history = db.query(ViewHistory).filter(
        ViewHistory.id == view_history_id,
        ViewHistory.animation_id == animation_id,
        ViewHistory.user_id == current_user.id,
    ).first()
    if not view_history:
        raise HTTPException(status_code=404, detail="观看记录不存在")

    update_data = view_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(view_history, field, value)

    db.commit()
    db.refresh(view_history)
    return view_history


@router.post("/{animation_id}/interactions")
async def record_interaction(
    animation_id: int,
    interaction_data: InteractionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    ensure_animation_access(animation, current_user)
    latest_view = db.query(ViewHistory).filter(
        ViewHistory.user_id == current_user.id,
        ViewHistory.animation_id == animation_id,
    ).order_by(ViewHistory.viewed_at.desc()).first()

    if not latest_view:
        raise HTTPException(status_code=404, detail="未找到观看记录")

    interaction = AnimationInteraction(
        view_history_id=latest_view.id,
        interaction_type=interaction_data.interaction_type,
        interaction_data=interaction_data.interaction_data,
    )

    latest_view.interaction_count += 1
    db.add(interaction)
    db.commit()
    return {"message": "交互记录已保存"}


@router.get("/{animation_id}/file")
async def get_animation_file(
    animation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    ensure_animation_access(animation, current_user)
    if not os.path.exists(animation.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        animation.file_path,
        media_type="text/html",
        filename=f"{animation.title}.html",
    )
