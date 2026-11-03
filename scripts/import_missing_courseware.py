#!/usr/bin/env python3
"""Unified import script for missing courseware from both:
1. zlmmxwl.com (9 items)
2. questionscope.cn (2 items)
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"

def run_script(script_name: str) -> int:
    script_path = SCRIPTS_DIR / script_name
    print(f"\n==========================================")
    print(f"Executing: {script_name}")
    print(f"==========================================")
    result = subprocess.run([sys.executable, str(script_path)], check=False)
    if result.returncode != 0:
        print(f"Error: {script_name} failed with code {result.returncode}", file=sys.stderr)
    return result.returncode

def main() -> int:
    code1 = run_script("import_zlmmxwl_missing.py")
    code2 = run_script("import_questionscope_missing.py")

    live_uploads = Path("/var/www/edusimu/backend/uploads")
    if live_uploads.exists() and shutil.which("chown"):
        print("\nFixing permissions on /var/www/edusimu/backend/uploads...")
        subprocess.run(["chown", "-R", "www-data:www-data", str(live_uploads)], check=False)

    if code1 == 0 and code2 == 0:
        print("\nAll missing courseware successfully processed!")
        return 0
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
