#!/usr/bin/env python3
"""Extract all E1 timing sheet PDFs from the media centre."""
import json
import os
import subprocess
import re
import time

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(DATA_DIR, "pdfs")
RESULTS = os.path.join(DATA_DIR, "results.json")
BASE_URL = "https://mediacentre.e1series.com"

def safe_name(name):
    return re.sub(r'[^\w\s\-\.]', '', name).strip().replace('  ', ' ')

def collect_feeds(node, path_parts=None):
    if path_parts is None:
        path_parts = []
    name = node.get("name", "")
    current = path_parts + [name] if name else path_parts
    feeds = []
    feed = node.get("feed")
    if feed and not node.get("hasChilds", False):
        feeds.append({"path_parts": current, "feed": feed})
    for child in node.get("children", []):
        feeds.extend(collect_feeds(child, current))
    return feeds

def main():
    os.makedirs(PDF_DIR, exist_ok=True)

    with open(RESULTS) as f:
        data = json.load(f)

    all_feeds = []
    for folder in data.get("folders", []):
        all_feeds.extend(collect_feeds(folder))

    print(f"Found {len(all_feeds)} timing sheet feeds\n")

    all_pdfs = []
    total = 0
    downloaded = 0
    errors = 0

    for i, feed_info in enumerate(all_feeds):
        parts = feed_info["path_parts"]
        feed_url = BASE_URL + feed_info["feed"]
        path_str = " / ".join(parts)
        print(f"[{i+1}/{len(all_feeds)}] {path_str}")

        try:
            result = subprocess.run(
                ["curl", "-s", "--compressed", feed_url],
                capture_output=True, text=True, timeout=30
            )
            session = json.loads(result.stdout)
        except Exception as e:
            print(f"  ERROR: {e}")
            errors += 1
            continue

        items = session.get("items", [])
        if not items:
            print(f"  No items found")
            continue

        dir_parts = [safe_name(p) for p in parts[1:]]
        dir_path = os.path.join(PDF_DIR, *dir_parts)
        os.makedirs(dir_path, exist_ok=True)

        for item in items:
            pdf_url = item.get("url", "")
            pdf_title = item.get("title", "")
            if not pdf_url or not pdf_title.lower().endswith(".pdf"):
                continue

            total += 1
            safe_pdf = safe_name(pdf_title)
            if not safe_pdf.endswith('.pdf'):
                safe_pdf += '.pdf'
            filepath = os.path.join(dir_path, safe_pdf)

            if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                print(f"  SKIP: {safe_pdf}")
                downloaded += 1
            else:
                try:
                    encoded_url = pdf_url.replace(" ", "%20")
                    subprocess.run(
                        ["curl", "-s", "-L", "-o", filepath, encoded_url],
                        capture_output=True, timeout=60
                    )
                    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                        print(f"  OK: {safe_pdf}")
                        downloaded += 1
                    else:
                        print(f"  FAIL: {safe_pdf}")
                        errors += 1
                        if os.path.exists(filepath):
                            os.remove(filepath)
                        continue
                except Exception as e:
                    print(f"  ERROR: {e}")
                    errors += 1
                    continue

            all_pdfs.append({
                "season": parts[1] if len(parts) > 1 else "",
                "race": parts[2] if len(parts) > 2 else "",
                "event": parts[3] if len(parts) > 3 else "",
                "session": parts[4] if len(parts) > 4 else parts[-1],
                "title": pdf_title,
                "url": pdf_url,
                "local": filepath
            })
            time.sleep(0.1)

    index_path = os.path.join(DATA_DIR, "pdf_index.json")
    with open(index_path, 'w') as f:
        json.dump(all_pdfs, f, indent=2)

    print(f"\n{'='*50}")
    print(f"Total PDFs found: {total}")
    print(f"Downloaded: {downloaded}")
    print(f"Errors: {errors}")
    print(f"Index: {index_path}")

if __name__ == "__main__":
    main()
