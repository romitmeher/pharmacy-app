"""Measure built initial script/style files without launching a browser."""
from pathlib import Path
from html.parser import HTMLParser
import gzip
import json

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "frontend" / ".next"
OUTPUT = ROOT / "data" / "ui-performance"


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = set()
        self.styles = set()
        self.legacy = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src", "").startswith("/_next/"):
            (self.legacy if "nomodule" in attrs else self.scripts).add(attrs["src"].split("?")[0])
        if tag == "link" and attrs.get("rel") == "stylesheet" and attrs.get("href", "").startswith("/_next/"):
            self.styles.add(attrs["href"].split("?")[0])


def measure(urls):
    return sum(len(gzip.compress((BUILD / url.removeprefix("/_next/")).read_bytes(), compresslevel=9, mtime=0)) for url in urls)


def main():
    baseline_path = ROOT / "data" / "ui-bundle-baseline.json"
    baseline = {row["route"]: row["gzip_kib"] for row in json.loads(baseline_path.read_text(encoding="utf-8"))} if baseline_path.exists() else {}
    results = []
    for file in sorted((BUILD / "server" / "app").rglob("*.html")):
        route = "/" if file.stem == "index" else "/" + file.relative_to(BUILD / "server" / "app").with_suffix("").as_posix()
        if route.startswith("/_"):
            continue
        parser = Assets()
        parser.feed(file.read_text(encoding="utf-8"))
        size = measure(parser.scripts)
        budget = 170_000 if route.startswith("/login") else 150_000
        results.append({"route": route, "initial_js_gzip_bytes": size, "initial_js_gzip_kib": round(size / 1024, 1), "css_gzip_bytes": measure(parser.styles), "legacy_nomodule_gzip_bytes": measure(parser.legacy), "budget_bytes": budget, "over_budget": size > budget, "baseline_kib": baseline.get(route), "scripts": sorted(parser.scripts)})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {"method": "Sum of individually gzipped built HTML script/style references, gzip level 9. Initial JS includes Next/React runtime; modern-browser totals exclude noModule polyfills. Deferred interactions/effects and route prefetches are additional downloads. This is artifact sizing, not network or browser timing.", "routes": results, "browser_metrics": {"Lighthouse": "not measured", "INP": "not measured", "LCP": "not measured", "CLS": "not measured"}}
    (OUTPUT / "routes.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = ["# UI performance audit", "", report["method"], "", "Budget interpretation: 150,000 bytes for app routes; 170,000 bytes for login. KiB below means 1,024 bytes.", "", "| Route | Baseline KiB | Final KiB | Budget |", "| --- | ---: | ---: | --- |"]
    for row in results:
        lines.append(f"| `{row['route']}` | {row['baseline_kib'] or '—'} | {row['initial_js_gzip_kib']} | {'Over' if row['over_budget'] else 'Within'} |")
    lines += ["", "## Changes", "", "- Copilot and inventory drawers load when opened; animation code loads after paint only when enabled.", "- Paginated tables avoid the virtualization engine until more than 50 rows exist.", "- POS uses a memoized virtual catalog without the sortable table engine. Search filtering and stock aggregation reuse their results while typing.", "- Table rows are memoized and measured. All loaded sortable-table rows are restored for printing.", "- Main UI font is preloaded locally. No external font or icon requests are needed.", "", "## Remaining limits", "", "Initial JavaScript remains over budget on app routes. The retained Next/React runtime and existing client-side screens account for most of the total. Deferred downloads are excluded from the initial totals, not eliminated. Further route/module restructuring would be needed to meet the total budget; these results do not claim compliance.", "", "Lighthouse, browser INP, LCP, CLS, mobile layouts, assistive technology and physical printing have not been measured or verified. A credible Lighthouse estimate cannot be derived from bundle sizes alone. Browser testing was not run, following the user's earlier instruction.", "", "## Reproduce", "", "Build frontend, run `python scripts/audit_ui_performance.py` from the project root, and run `node scripts/benchmark-pos.mjs` from frontend. Benchmark results are in `data/ui-performance/catalog-benchmark.json` and are not browser timings."]
    (ROOT / "plans" / "ui-performance-audit-20261021.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Measured {len(results)} routes; {sum(row['over_budget'] for row in results)} remain over their initial-JS budget.")


if __name__ == "__main__":
    main()
