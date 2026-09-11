"""
enrich_stays.py — fill in the detail an Airbnb trip card leaves out.

A trip card gives you a town, a date and one photo. The listing page gives you
a great deal more, and the listing id is usually recoverable from the photo URL:

    .../im/pictures/miso/Hosting-27974739/original/....jpeg   -> 27974739
    .../Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTExMj.../....jpeg    -> base64 of
                                             "StaySupplyListing:1112193866275473455"

For each stay whose id we can recover, this reads www.airbnb.com/rooms/<id>
and takes:

    title       the host's own name for it ("The Metsamokki - A Finnish Cabin")
    type        Entire cabin, Tiny home, Entire rental unit ...
    guests / bedrooms / beds / baths
    rating, reviews
    amenities   the preview set the listing page shows as chips
    photos      several more of the listing's own photos
    lat, lng    the coordinates Airbnb publishes for the listing
    place       "Kerhonkson, New York" rather than bare "Kerhonkson"

That last pair matters most. Geocoding a bare town name is a coin flip between
the Whitehall in New York and the one in Montana; the listing page just says.
Anything enriched this way stops being a guess.

Everything is read out of the page's own embedded JSON rather than its <meta>
tags, because the meta tags are not reliably listing-specific — the same URL
will sometimes answer with a generic Airbnb head and a complete body.

Fetching goes through netpolite.Fetcher: robots-checked, cached permanently on
disk, one request at a time with a randomised gap, backing off on 429 and
stopping outright on 403. Re-running this costs zero requests.

    python tools/enrich_stays.py              # dry run, says what it would change
    python tools/enrich_stays.py --write

Standard library only.
"""

import argparse
import base64
import html as htmllib
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netpolite import Fetcher, Blocked, GaveUp                 # noqa: E402
import jsdata                                                  # noqa: E402
from jsdata import read_stays_file, write_stays_file           # noqa: E402

for _k in ("photos", "photoSource"):
    if _k not in jsdata.ORDER:
        jsdata.ORDER.insert(jsdata.ORDER.index("photo"), _k)

MIN_PAUSE = 2.0        # plus a random 0-3s on top
MAX_PHOTOS = 4         # the hero plus a few more, as extra evidence
PHOTO_W = 720


# ------------------------------------------------------------- listing ids --

def listing_id(photo_url):
    """Recover the Airbnb listing id from one of its photo URLs."""
    if not photo_url:
        return None
    u = urllib.parse.unquote(photo_url)
    m = re.search(r"/Hosting-([^/]+)/", u)
    if not m:
        return None
    token = m.group(1)
    if token.isdigit():
        return token
    try:
        decoded = base64.b64decode(token + "=" * (-len(token) % 4)).decode("utf-8", "replace")
    except Exception:
        return None
    m2 = re.search(r"(\d{6,})", decoded)
    return m2.group(1) if m2 else None


# ----------------------------------------------------------------- parsing --

# "Cabin in Kerhonkson . *4.99 . 1 bedroom . 4 beds . 1 bath"
SUMMARY_RE = re.compile(r'"PdpSharingConfig","title":"([^"]{5,160})"')
COUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s+(bedroom|bed|bath|guest)s?\b", re.I)

NAME_RES = [
    re.compile(r'"ogDescription"\s*:\s*"([^"]{3,140})"'),
    re.compile(r'"@type"\s*:\s*"Product"\s*,\s*"name"\s*:\s*"([^"]{3,140})"'),
]
TYPE_RE = re.compile(r'"propertyType"\s*:\s*"([^"]{3,50})"')
CAP_RE = re.compile(r'"personCapacity"\s*:\s*(\d+)')
RATING_RE = re.compile(r'"ratingValue"\s*:\s*"?(\d+(?:\.\d+)?)"?')
REVIEWS_RE = re.compile(r'"reviewCount"\s*:\s*"?(\d+)"?')
GEO_RE = re.compile(r'"latitude"\s*:\s*(-?\d+\.\d+).{0,60}?"longitude"\s*:\s*(-?\d+\.\d+)', re.S)
# "Kerhonkson, New York, United States"
PLACE_RE = re.compile(r'"subtitle"\s*:\s*"([A-Z][^",]{2,40},\s*[^"]{2,60})"')
PREVIEW_AMENITY_RE = re.compile(
    r'"__typename":"AmenityItem","available":true,"title":"([^"]{1,60})"')
PHOTO_RE = re.compile(r"https://a0\.muscache\.com/im/pictures/[A-Za-z0-9_\-/.%]+")

UNIT_KEY = {"bedroom": "bedrooms", "bed": "beds", "bath": "baths", "guest": "guests"}
GENERIC_TITLE = "Vacation Rentals, Cabins"


def unescape(s):
    return htmllib.unescape(s or "").replace("\\u002F", "/").strip()


def tidy_place(raw):
    """'Kerhonkson, New York, United States' -> 'Kerhonkson, New York'."""
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) >= 3 and parts[-1] in ("United States", "USA",
                                         "United States of America"):
        return ", ".join(parts[:2])
    if len(parts) >= 3:
        return parts[0] + ", " + parts[-1]
    return ", ".join(parts)


def parse_listing(html, lid):
    out = {}
    flat = html.replace("\\u002F", "/")

    for rx in NAME_RES:
        m = rx.search(html)
        if m:
            name = unescape(m.group(1))
            # The site-wide tagline turns up whenever the head is not
            # listing-specific. It is not a stay name.
            if name and GENERIC_TITLE not in name:
                out["title"] = name
                break

    m = TYPE_RE.search(html)
    if m:
        out["type"] = unescape(m.group(1))

    m = SUMMARY_RE.search(html)
    if m:
        for value, unit in COUNT_RE.findall(unescape(m.group(1))):
            n = float(value)
            out[UNIT_KEY[unit.lower()]] = int(n) if n == int(n) else n

    m = CAP_RE.search(html)
    if m and not out.get("guests"):
        out["guests"] = int(m.group(1))

    m = RATING_RE.search(html)
    if m:
        val = float(m.group(1))
        if 0 < val <= 5:
            out["rating"] = val
    m = REVIEWS_RE.search(html)
    if m:
        out["reviews"] = int(m.group(1))

    m = GEO_RE.search(html)
    if m:
        out["lat"] = round(float(m.group(1)), 5)
        out["lng"] = round(float(m.group(2)), 5)

    m = PLACE_RE.search(html)
    if m:
        place = tidy_place(unescape(m.group(1)))
        if place:
            out["place"] = place

    seen, amenities = set(), []
    for name in PREVIEW_AMENITY_RE.findall(html):
        name = unescape(name)
        key = name.lower()
        if name and key not in seen:
            seen.add(key)
            amenities.append(name)
    if amenities:
        out["amenities"] = amenities[:6]

    pics, spotted = [], set()
    for url in PHOTO_RE.findall(flat):
        base = url.split("?")[0]
        if "Hosting-" not in base or lid not in base:
            continue
        if base in spotted:
            continue
        spotted.add(base)
        pics.append("%s?im_w=%d" % (base, PHOTO_W))
    if pics:
        out["photos"] = pics[:MAX_PHOTOS]

    return out


# -------------------------------------------------------------------- main --

WATCHED = ("title", "type", "guests", "bedrooms", "beds", "baths",
           "rating", "reviews", "amenities", "place", "lat", "lng", "photos")

# Anything a person may have written by hand is never overwritten.
PROTECTED = ("story", "quote", "quoteBy", "when", "booker", "crew", "others", "id")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--stays", default=os.path.join(here, "src", "stays.js"))
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="stop after N listings")
    ap.add_argument("--pause", type=float, default=MIN_PAUSE,
                    help="minimum seconds between fetches; a random 0-3s is added")
    ap.add_argument("--refresh", action="store_true", help="ignore the cache")
    args = ap.parse_args()

    crew, stays, settings = read_stays_file(args.stays)

    pairs = [(s, listing_id(s.get("photoSource") or s.get("photo") or "")) for s in stays]
    targets = [(s, lid) for s, lid in pairs if lid]

    print("%d of %d stays have a recoverable listing id"
          % (len(targets), len(stays)), file=sys.stderr)
    if args.limit:
        targets = targets[:args.limit]
    if not targets:
        print("nothing to do - no photo URL carries a Hosting- id", file=sys.stderr)
        return 1

    fetcher = Fetcher(
        cache_dir=os.path.join(here, "data", "cache", "airbnb"),
        min_delay=args.pause,
        max_delay=args.pause + 3.0,
    )

    changed, failed, moved_far = 0, [], []
    for i, (stay, lid) in enumerate(targets, 1):
        url = "https://www.airbnb.com/rooms/%s" % lid
        try:
            html, cached = fetcher.get(url, force=args.refresh)
        except (Blocked, GaveUp) as e:
            print("\nstopped: %s" % e, file=sys.stderr)
            break
        except Exception as e:
            failed.append((stay.get("place"), str(e)[:60]))
            continue

        info = parse_listing(html, lid) if html else {}
        if not info:
            failed.append((stay.get("place"), "nothing parsed"))
            continue

        before = {k: stay.get(k) for k in WATCHED}
        old_pos = (stay.get("lat"), stay.get("lng"))

        for k, v in info.items():
            if k in PROTECTED:
                continue
            if k == "title" and stay.get("title"):
                continue          # never clobber a hand-written title
            stay[k] = v

        if any(stay.get(k) != before.get(k) for k in WATCHED):
            changed += 1

        bits = []
        for key, fmt in (("type", "%s"), ("guests", "%sg"), ("bedrooms", "%sbr"),
                         ("beds", "%s bed"), ("baths", "%s bath")):
            if info.get(key):
                bits.append(fmt % info[key])
        if info.get("amenities"):
            bits.append("%d amenities" % len(info["amenities"]))
        if info.get("photos"):
            bits.append("%d photos" % len(info["photos"]))
        if old_pos[0] is not None and info.get("lat") is not None:
            drift = abs(old_pos[0] - info["lat"]) + abs(old_pos[1] - info["lng"])
            if drift > 0.25:
                moved_far.append((stay.get("place"), drift))
                bits.append("MOVED %.1f deg" % drift)

        label = (info.get("place") or stay.get("place") or "")[:26]
        print("  %2d/%d  %-26s %s%s"
              % (i, len(targets), label, " . ".join(bits),
                 "  (cached)" if cached else ""), file=sys.stderr)

    print("\n%d enriched, %d failed  [%s]"
          % (changed, len(failed), fetcher.summary()), file=sys.stderr)
    for place, why in failed:
        print("  failed: %-22s %s" % (place, why), file=sys.stderr)
    if moved_far:
        print("\ncoordinates moved a long way - the geocode had guessed wrong:",
              file=sys.stderr)
        for place, d in moved_far:
            print("  %-26s %.1f deg" % (place, d), file=sys.stderr)

    if not args.write:
        print("\ndry run - add --write to save", file=sys.stderr)
        return 0

    write_stays_file(args.stays, crew, stays, settings)
    print("wrote %s" % os.path.relpath(args.stays, here), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
