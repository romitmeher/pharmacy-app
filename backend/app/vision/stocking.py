"""Reviewed stocking references and per-store correction memory."""
import csv
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from functools import lru_cache
from urllib.parse import urlparse, quote_plus
import xml.etree.ElementTree as ET

import requests
from sqlalchemy import or_
from app.models.medicine import Medicine, MedicineAlias
from app.services.medicine_service import serialize_medicine
from app.vision.data_paths import DATA_ROOT


def connect():
    from flask import has_app_context, current_app
    # SQLite is retained only for isolated automated tests and offline fixtures.
    fixture = (has_app_context() and current_app.testing) or (
        not has_app_context() and bool(os.environ.get("SMARTPHARM_STOCKING_DIR")))
    if not fixture:
        config = current_app.config if has_app_context() else os.environ
        url = config.get("PGVECTOR_URL", "")
        if not url:
            raise ValueError("Aiven PostgreSQL (PGVECTOR_URL) is required for stocking reference memory.")
        from app.vision.stocking_pg import PostgresStockingConnection
        return PostgresStockingConnection(url)
    root = Path(os.environ.get("SMARTPHARM_STOCKING_DIR", str(DATA_ROOT / "stocking")))
    root.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(root / "references.sqlite3", timeout=20)
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript('''
      CREATE VIRTUAL TABLE IF NOT EXISTS reference USING fts5(name, composition, manufacturer,
          pack UNINDEXED, source UNINDEXED, url UNINDEXED);
      CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,store_id INTEGER,user_id INTEGER,
          medicine_id INTEGER,query_key TEXT,text_key TEXT,details TEXT,created REAL);
      CREATE INDEX IF NOT EXISTS feedback_store ON feedback(store_id,query_key,created);
      CREATE INDEX IF NOT EXISTS feedback_text ON feedback(store_id,text_key,created);
    ''')
    return c


def key(value):
    return hashlib.sha256(re.sub(r"\W+", "", value.casefold()).encode()).hexdigest() if value else ""


def product_queries(raw_text):
    """Prioritize compact brand/dose lines over addresses and manufacturer text."""
    found = []
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    joined = [lines[index-1] + " " + line for index, line in enumerate(lines)
              if index and re.fullmatch(r"\d{1,4}", line)]
    for line in [*lines, *joined]:
        line = line.strip()
        match = re.fullmatch(r"([A-Za-z][A-Za-z .&+\-]{0,25}?)\s*[- .]?\s*(\d{1,4})\s*(?:mg|mcg|g)?\s*(?:(DT|DUO|SR|CR|XL|PLUS)\s*)?(?:tablets?|capsules?)?", line, re.I)
        if not match or re.search(r"\b(?:unit|batch|lic|mfg|exp|mrp|no|dose|daily|ip)\b", line, re.I):
            continue
        brand = match.group(1).strip(" .-")
        if not brand or not 0 < int(match.group(2)) < 2000 or re.search(r"\b(?:tablets?|capsules?)\b", brand, re.I):
            continue
        name = re.sub(r"\s+", "", brand) + " " + match.group(2)
        if match.group(3):
            name += " " + match.group(3)
        if name.casefold() not in {value.casefold() for value in found}:
            found.append(name)
    return found[:5]


def build_references():
    c = connect()
    with c:
        c.execute("DELETE FROM reference")
        for filename in ["India Medicines and Drug Info Dataset.csv", "medicines.csv"]:
            path = DATA_ROOT / filename
            if not path.exists():
                continue
            with path.open(encoding="utf-8-sig", newline="") as source:
                for row in csv.DictReader(source):
                    name = row.get("Medicine Name") or row.get("med_name") or ""
                    c.execute("INSERT INTO reference VALUES (?,?,?,?,?,?)", (
                        name, row.get("Composition") or row.get("generic_name") or "",
                        row.get("drug_manufacturer", "").removeprefix("* Mkt: "),
                        row.get("drug_varient", ""), filename, row.get("med_url", "")))
    count = c.execute("SELECT count(*) FROM reference").fetchone()[0]
    c.close()
    return count


def references(query):
    tokens = list(dict.fromkeys(re.findall(r"[a-zA-Z0-9]+", query)))[:6]
    if not tokens:
        return []
    c = connect()
    try:
        if getattr(c, "postgres", False):
            term = ' & '.join(t.lower() + (':*' if len(t)>=3 or t.isdigit() else '') for t in tokens)
            rows = c.execute("SELECT id,name,composition,manufacturer,pack,source,url FROM reference "
                "WHERE to_tsvector('simple', name) @@ to_tsquery('simple', ?) ORDER BY id LIMIT 80", (term,)).fetchall()
        else:
            rows = c.execute("SELECT rowid,name,composition,manufacturer,pack,source,url FROM reference "
                         "WHERE reference MATCH ? ORDER BY bm25(reference) LIMIT 80",
                         ("name : (" + " AND ".join('"' + t + '"' + ("*" if len(t) >= 3 or t.isdigit() else "") for t in tokens) + ")",)).fetchall()
        result = [dict(zip(["id", "name", "composition", "manufacturer", "pack", "source", "url"], row)) for row in rows]
        for item in result:
            if not _safe_url(item["url"]):
                item["url"] = ""
        canonical = lambda value: re.sub(r"[^a-z0-9]", "", value.casefold())
        result.sort(key=lambda item: (not canonical(item["name"]).startswith(canonical(query)),
                                      not bool(item["manufacturer"]), len(item["name"])))
        unique, seen = [], set()
        for item in result:
            identity = (canonical(item["name"]), canonical(item["manufacturer"]), item["pack"])
            if identity not in seen:
                seen.add(identity)
                unique.append(item)
        return unique[:8]
    finally:
        c.close()


def _safe_url(url):
    p = urlparse(url or "")
    return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password


@lru_cache(maxsize=128)
def _tavily_search(query, token, hour):
    response = requests.post("https://api.tavily.com/search",
        headers={"Authorization": f"Bearer {token}"},
        json={"query": query + " medicine India", "search_depth": "basic", "auto_parameters": False,
              "max_results": 5, "include_answer": False, "include_raw_content": False}, timeout=(3, 10))
    response.raise_for_status()
    return [{"title": item.get("title", ""), "url": item.get("url", ""),
             "snippet": html.unescape(re.sub("<[^>]+>", "", item.get("content", "")))[:1500]}
            for item in response.json().get("results", [])]


def web_search(query):
    """Search only the corrected product query; never upload the image or full OCR."""
    terms = [s.casefold() for s in re.findall(r"[a-zA-Z]{3,}", query)
             if s.casefold() not in {"tablet", "tablets", "medicine", "capsule", "india"}]
    fallback = "https://www.google.com/search?q=" + quote_plus(query + " medicine India")
    try:
        token = os.environ.get("BRAVE_SEARCH_API_KEY", "")
        tavily_token = os.environ.get("TAVILY_API_KEY", "")
        if tavily_token:
            items = _tavily_search(query, tavily_token, int(time.time() // 3600))
        elif token:
            r = requests.get("https://api.search.brave.com/res/v1/web/search",
                params={"q": query + " medicine India", "count": 8, "country": "IN"},
                headers={"X-Subscription-Token": token}, timeout=(3, 8))
            r.raise_for_status()
            items = [{"title": x.get("title", ""), "url": x.get("url", ""),
                      "snippet": html.unescape(re.sub("<[^>]+>", "", x.get("description", "")))}
                     for x in r.json().get("web", {}).get("results", [])]
        else:
            r = requests.get("https://www.bing.com/search", params={"q": query + " medicine India",
                "format": "rss", "setlang": "en-IN"}, timeout=(3, 8))
            r.raise_for_status()
            if len(r.content) > 1_000_000:
                raise ValueError("Search response too large")
            items = [{"title": x.findtext("title", ""), "url": x.findtext("link", ""),
                      "snippet": html.unescape(re.sub("<[^>]+>", "", x.findtext("description", "")))}
                     for x in ET.fromstring(r.content).findall("./channel/item")]
        # Suppress irrelevant search-engine responses, rather than fabricate a match.
        items = [x for x in items if _safe_url(x["url"]) and terms and
                 any(t in (x["title"] + " " + x["snippet"]).casefold() for t in terms)][:5]
        return {"status": "results" if items else "no_relevant_results", "results": items,
                "search_url": fallback, "requires_verification": True}
    except (requests.RequestException, ValueError, ET.ParseError):
        return {"status": "unavailable", "results": [], "search_url": fallback,
                "requires_verification": True}


def search(store_id, query, raw_text="", include_web=False):
    conditions = [Medicine.brand_name.ilike(f"%{query}%"),
                  Medicine.aliases.any(MedicineAlias.alias_name.ilike(f"%{query}%"))]
    medicines = Medicine.query.filter(Medicine.store_id == store_id, Medicine.is_active.is_(True),
                                     or_(*conditions)).limit(12).all()
    c = connect()
    try:
        learned = c.execute("SELECT medicine_id FROM feedback WHERE store_id=? AND "
            "(query_key=? OR (text_key<>'' AND text_key=?)) ORDER BY created DESC LIMIT 1",
            (store_id, key(query), key(raw_text))).fetchone()
    finally:
        c.close()
    remembered = None
    if learned:
        med = Medicine.query.filter_by(id=learned[0], store_id=store_id, is_active=True).first()
        if med:
            remembered = serialize_medicine(med)
            medicines = [med] + [m for m in medicines if m.id != med.id]
    return {"catalog": [serialize_medicine(m) for m in medicines], "remembered": remembered,
            "references": references(query), "web": web_search(query) if include_web else None}


def remember(store_id, user_id, medicine, query, raw_text, sources):
    c = connect()
    try:
        with c:
            c.execute("INSERT INTO feedback(store_id,user_id,medicine_id,query_key,text_key,details,created) "
                "VALUES (?,?,?,?,?,?,?)", (store_id, user_id, medicine.id, key(query), key(raw_text),
                    json.dumps({"name": medicine.brand_name, "strength": medicine.strength,
                                "query": query, "raw_text": raw_text,
                                "source_urls": [s for s in sources[:5] if isinstance(s, str) and _safe_url(s)]}), time.time()))
    finally:
        c.close()


if __name__ == "__main__":
    print(json.dumps({"indexed_references": build_references()}))
