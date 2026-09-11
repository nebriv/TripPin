"""
import_url.py — pull a stay out of a listing page.

Reads whatever a page is willing to tell a normal HTTP client: OpenGraph tags,
Twitter card tags and schema.org JSON-LD. That covers a lot of hotel sites,
Hipcamp, Booking, Vrbo, campground and cabin sites, and most small independent
places. It gets you a title, a description, a hero image, often coordinates,
a rating and a price — and geocodes the address when coordinates are missing.

Airbnb works too — it serves OpenGraph tags and JSON-LD to ordinary clients,
so you get the title, the hero photo, the rating and the amenity list. What
you do NOT get from Airbnb is a real location: listings publish only an
approximate area until you have booked. Anything this script fills in for
lat/lng is geocoded from the text and should be treated as a first guess.
Click the actual spot on the map in editor.html — that is what the game
scores against.

If a site does hand back a challenge page instead of the listing, the script
says so and points you at the manual route, which is about fifteen seconds:
paste the title, paste a screenshot, click the map.

Two ways to run it:

  One-shot, prints a ready-to-paste stay object:
      python tools/import_url.py "https://example.com/listing/123"

  Companion server, so the "Paste a listing URL" box in editor.html works:
      python tools/import_url.py --serve
  Leave it running in a terminal while you use the editor. It only listens on
  localhost and only fetches URLs you give it.

Standard library only.
"""

import argparse
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, HTTPServer

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
GEOCODE_UA = "TripPin-import/1.0 (personal daily game; contact: local user)"

MAX_IMAGE_BYTES = 8 * 1024 * 1024


# ----------------------------------------------------------------- fetching --

def get(url, accept="text/html,application/xhtml+xml,*/*;q=0.8", timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": accept,
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.geturl()


# ------------------------------------------------------------------ parsing --

class MetaParser(HTMLParser):
    """Collects <meta> properties, <title>, and JSON-LD blocks."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.jsonld = []
        self.title = None
        self._in_title = False
        self._in_ld = False
        self._ld_buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("property") or a.get("name") or a.get("itemprop")
            val = a.get("content")
            if key and val and key.lower() not in self.meta:
                self.meta[key.lower()] = val.strip()
        elif tag == "title":
            self._in_title = True
        elif tag == "script" and (a.get("type") or "").lower() == "application/ld+json":
            self._in_ld = True
            self._ld_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            raw = "".join(self._ld_buf).strip()
            if raw:
                try:
                    self.jsonld.append(json.loads(raw))
                except Exception:
                    pass

    def handle_data(self, data):
        if self._in_title and not self.title:
            t = data.strip()
            if t:
                self.title = t
        if self._in_ld:
            self._ld_buf.append(data)


def walk_ld(node):
    """Yield every dict in a JSON-LD tree, however it is nested."""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk_ld(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk_ld(v)


def num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except Exception:
        return None


def from_jsonld(blocks):
    """Pick out the lodging-ish bits of any schema.org data on the page."""
    out = {}
    for block in blocks:
        for node in walk_ld(block):
            t = node.get("@type")
            types = [t] if isinstance(t, str) else (t or [])
            types = [str(x).lower() for x in types]

            geo = node.get("geo")
            if isinstance(geo, dict):
                la, ln = num(geo.get("latitude")), num(geo.get("longitude"))
                if la is not None and ln is not None:
                    out.setdefault("lat", la)
                    out.setdefault("lng", ln)

            addr = node.get("address")
            if isinstance(addr, dict):
                bits = [addr.get("addressLocality"), addr.get("addressRegion"),
                        addr.get("addressCountry")]
                bits = [b for b in bits if isinstance(b, str) and b.strip()]
                if bits:
                    out.setdefault("place", ", ".join(bits))
                street = addr.get("streetAddress")
                if street:
                    out.setdefault("address", ", ".join(
                        [b for b in [street] + bits if b]))
            elif isinstance(addr, str) and addr.strip():
                out.setdefault("place", addr.strip())

            agg = node.get("aggregateRating")
            if isinstance(agg, dict):
                r = num(agg.get("ratingValue"))
                c = num(agg.get("reviewCount") or agg.get("ratingCount"))
                if r is not None:
                    out.setdefault("rating", r)
                if c is not None:
                    out.setdefault("reviews", int(c))

            offers = node.get("offers")
            for off in (offers if isinstance(offers, list) else [offers]):
                if isinstance(off, dict):
                    p = num(off.get("price") or off.get("lowPrice"))
                    if p:
                        out.setdefault("price", p)

            if any(k in types for k in
                   ("hotel", "lodgingbusiness", "campground", "resort",
                    "bedandbreakfast", "apartment", "house", "product", "place",
                    "vacationrental", "touristattraction")):
                if node.get("name"):
                    out.setdefault("title", str(node["name"]).strip())
                if node.get("description"):
                    out.setdefault("description", str(node["description"]).strip())
                img = node.get("image")
                if isinstance(img, list) and img:
                    img = img[0]
                if isinstance(img, dict):
                    img = img.get("url")
                if isinstance(img, str):
                    out.setdefault("image_url", img)

            am = node.get("amenityFeature")
            if isinstance(am, list):
                names = [humanise(a.get("name")) for a in am
                         if isinstance(a, dict) and a.get("name")]
                if names:
                    out.setdefault("amenities", names[:6])
    return out


def humanise(code):
    """"outdoorGrill" -> "Outdoor grill". Sites hand these over as raw keys."""
    if not code:
        return code
    t = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", str(code).strip())
    t = t.replace("_", " ").replace("-", " ")
    t = re.sub(r"\s+", " ", t).strip()
    fixes = {"ac": "A/C", "tv": "TV", "wifi": "Wifi", "bbq": "BBQ", "ev": "EV"}
    if t.lower() in fixes:
        return fixes[t.lower()]
    # Sentence case reads better on a chip than Title Case.
    return t[:1].upper() + t[1:].lower()


def strip_site_suffix(title, site_name):
    """"Cosy A-Frame | Airbnb" -> "Cosy A-Frame". Titles read better without it."""
    if not title:
        return title
    t = title.strip()
    for sep in (" | ", " - ", " – ", " — ", " :: "):
        if site_name and t.endswith(sep + site_name):
            t = t[: -len(sep + site_name)].strip()
            break
    return t or title.strip()


def parse_page(html, base_url):
    p = MetaParser()
    try:
        p.feed(html)
    except Exception:
        pass

    m = p.meta
    data = from_jsonld(p.jsonld)

    def first(*keys):
        for k in keys:
            if m.get(k):
                return m[k]
        return None

    site_name = first("og:site_name")
    title = first("og:title", "twitter:title") or data.get("title") or p.title
    title = strip_site_suffix(title, site_name)
    desc = first("og:description", "twitter:description", "description") or data.get("description")
    image = first("og:image", "og:image:url", "twitter:image", "twitter:image:src") or data.get("image_url")
    if image:
        image = urllib.parse.urljoin(base_url, image)

    lat = num(first("place:location:latitude", "og:latitude", "geo.position")) or data.get("lat")
    lng = num(first("place:location:longitude", "og:longitude")) or data.get("lng")

    # "geo.position" is sometimes "lat;lng"
    gp = m.get("geo.position") or m.get("icbm")
    if (lat is None or lng is None) and gp:
        parts = re.split(r"[;,]", gp)
        if len(parts) == 2:
            lat, lng = num(parts[0]), num(parts[1])

    place = first("og:locality", "place:location:locality") or data.get("place")
    locality = m.get("og:locality")
    region = m.get("og:region")
    country = m.get("og:country-name")
    bits = [b for b in (locality, region, country) if b]
    if bits:
        place = ", ".join(bits)

    return {
        "title": (title or "").strip() or None,
        "description": (desc or "").strip() or None,
        "image_url": image,
        "lat": lat,
        "lng": lng,
        "place": place,
        "address": data.get("address"),
        "rating": data.get("rating"),
        "reviews": data.get("reviews"),
        "price": data.get("price"),
        "amenities": data.get("amenities"),
        "site": urllib.parse.urlparse(base_url).netloc,
    }


# --------------------------------------------------------------- geocoding --

_last_geo = [0.0]


def geocode(q):
    """Nominatim, respecting the one-request-per-second usage policy."""
    if not q:
        return None
    wait = 1.05 - (time.time() - _last_geo[0])
    if wait > 0:
        time.sleep(wait)
    _last_geo[0] = time.time()
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 1})
    req = urllib.request.Request(url, headers={"User-Agent": GEOCODE_UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            hits = json.load(r)
    except Exception:
        return None
    if not hits:
        return None
    h = hits[0]
    return {"lat": float(h["lat"]), "lng": float(h["lon"]),
            "place": h.get("display_name", "").split(",")[0]}


# ------------------------------------------------------------------ images --

def fetch_image_data_uri(url):
    """Download the hero image and hand it back inline. The editor resizes it."""
    if not url:
        return None, None
    try:
        raw, ctype, _ = get(url, accept="image/*,*/*;q=0.8", timeout=30)
    except Exception as e:
        return None, "image download failed: %s" % e
    if len(raw) > MAX_IMAGE_BYTES:
        return None, "image too large (%.1f MB)" % (len(raw) / 1048576)
    ctype = (ctype or "image/jpeg").split(";")[0].strip()
    if not ctype.startswith("image/"):
        ctype = "image/jpeg"
    return "data:%s;base64,%s" % (ctype, base64.b64encode(raw).decode("ascii")), None


# -------------------------------------------------------------------- main --

BLOCK_HINT = (
    "This site served a bot challenge instead of the listing (Airbnb does this "
    "to everything that is not a real browser).\n"
    "Fastest way in: open editor.html, paste the listing title, screenshot the "
    "main photo and paste it into the photo box, and click the map. ~15 seconds."
)


def scrape(url, want_image=True):
    """Returns (result_dict, error_string_or_None)."""
    try:
        raw, ctype, final = get(url)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 503):
            return None, "%s returned %d.\n%s" % (
                urllib.parse.urlparse(url).netloc, e.code, BLOCK_HINT)
        return None, "HTTP %d fetching the page" % e.code
    except Exception as e:
        return None, "could not fetch: %s" % e

    html = raw.decode("utf-8", "replace")
    info = parse_page(html, final)

    if not info["title"]:
        return None, "no listing data on that page.\n" + BLOCK_HINT

    # Most listing sites publish only an approximate location, and Airbnb
    # publishes none at all until you book — so treat any coordinates we find
    # as a starting point and say so. The map click in editor.html is the real
    # source of truth.
    if info["lat"] is None or info["lng"] is None:
        for candidate in (info.get("address"), info.get("place"), info.get("title")):
            hit = geocode(candidate)
            if hit:
                info["lat"], info["lng"] = hit["lat"], hit["lng"]
                if not info.get("place"):
                    info["place"] = hit["place"]
                info["geocoded"] = True
                break

    if want_image and info.get("image_url"):
        uri, err = fetch_image_data_uri(info["image_url"])
        info["photo"] = uri
        if err:
            info["image_error"] = err

    return info, None


def to_stay(info):
    """Shape a scrape result like an entry in src/stays.js."""
    slug = re.sub(r"[^a-z0-9]+", "-", (info.get("title") or "stay").lower()).strip("-")[:40]
    desc = info.get("description") or ""
    return {
        "id": slug or "stay",
        "title": info.get("title"),
        "type": None,
        "amenities": info.get("amenities") or [],
        "price": int(info["price"]) if info.get("price") else None,
        "rating": round(info["rating"], 2) if info.get("rating") else None,
        "reviews": info.get("reviews"),
        "quote": (desc[:160] + "…") if len(desc) > 160 else (desc or None),
        "quoteBy": None,
        "booker": "CHANGE_ME",
        "crew": [],
        "lat": info.get("lat"),
        "lng": info.get("lng"),
        "place": info.get("place"),
        "when": None,
        "story": None,
        "photo": info.get("photo"),
        "source": info.get("site"),
    }


def js_preview(stay):
    """Print it the way it should look in stays.js, with the photo elided."""
    shown = dict(stay)
    if shown.get("photo"):
        shown["photo"] = "<data URI, %.0f KB — use --serve + editor.html to keep it>" % (
            len(stay["photo"]) / 1024)
    return json.dumps(shown, indent=2, ensure_ascii=False)


# ------------------------------------------------------------------ server --

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)

        if u.path == "/ping":
            return self._send(200, {"ok": True, "service": "trippin-import"})

        if u.path == "/geocode":
            hit = geocode((qs.get("q") or [""])[0])
            return self._send(200, {"ok": bool(hit), "result": hit})

        if u.path == "/fetch":
            target = (qs.get("url") or [""])[0]
            if not target.startswith(("http://", "https://")):
                return self._send(400, {"ok": False, "error": "pass ?url=https://..."})
            info, err = scrape(target)
            if err:
                return self._send(200, {"ok": False, "error": err})
            return self._send(200, {"ok": True, "result": info, "stay": to_stay(info)})

        self._send(404, {"ok": False, "error": "try /fetch?url=..., /geocode?q=... or /ping"})

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def serve(port):
    srv = HTTPServer(("127.0.0.1", port), Handler)
    print("TripPin import helper listening on http://localhost:%d" % port)
    print("Leave this running, then use the 'Paste a listing URL' box in editor.html.")
    print("Ctrl-C to stop.\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", nargs="?", help="listing URL to import")
    ap.add_argument("--serve", action="store_true", help="run the companion server for editor.html")
    ap.add_argument("--port", type=int, default=8732)
    ap.add_argument("--no-image", action="store_true", help="skip the hero image")
    args = ap.parse_args()

    if args.serve:
        return serve(args.port)

    if not args.url:
        ap.print_help()
        return 2

    info, err = scrape(args.url, want_image=not args.no_image)
    if err:
        print(err, file=sys.stderr)
        return 1

    print(js_preview(to_stay(info)))
    if info.get("geocoded"):
        print("\n// coordinates came from geocoding the address — check them on the map",
              file=sys.stderr)
    if info.get("image_error"):
        print("\n// %s" % info["image_error"], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
