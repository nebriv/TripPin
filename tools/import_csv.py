"""
import_csv.py — turn a spreadsheet of stays into stays.js entries.

This is the bulk route. Realistically the fastest way to fill this game is to
share one sheet with the four of you, everybody dumps their history into it,
and you run this once.

It reads any CSV and works out which column is which by looking at the header
names, so it copes with:

  * a Google Sheet you made from the template (data/stays-template.csv)
  * Airbnb's own data export — Account > Privacy > Request your data. The
    reservations file has the listing name, the dates and the location.
  * a hotel or campground booking export
  * anything else with a header row

Rows missing coordinates get geocoded from their place text (OpenStreetMap
Nominatim, one request a second — a hundred rows takes about two minutes).

    # see what it would do
    python tools/import_csv.py stays.csv

    # merge into src/stays.js, keeping what is already there
    python tools/import_csv.py stays.csv --write

    # if a header is not recognised, say so explicitly
    python tools/import_csv.py stays.csv --map "title=Listing Name" --map "place=City"

Standard library only.
"""

import argparse
import csv
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_url import geocode  # noqa: E402  (same folder)
from jsdata import (read_stays_file, write_stays_file, js_value, ordered,  # noqa: E402
                    slug, ORDER)


# Header aliases, checked as normalised substrings. First match wins, so the
# more specific patterns come first.
ALIASES = {
    "title":    ["listingname", "listing", "title", "property", "propertyname",
                 "name", "accommodation", "hotel", "place name"],
    "place":    ["placelabel", "city", "location", "where", "town", "destination",
                 "address", "citystate", "listinglocation"],
    "lat":      ["lat", "latitude"],
    "lng":      ["lng", "lon", "long", "longitude"],
    "booker":   ["booker", "bookedby", "who", "whobooked", "host", "organiser",
                 "organizer"],
    "crew":     ["crew", "with", "who else", "whoelse", "party", "travellers",
                 "travelers", "guestnames"],
    "when":     ["when", "date", "checkin", "startdate", "arrival", "arrivaldate",
                 "traveldate"],
    "type":     ["type", "propertytype", "roomtype", "listingtype"],
    "guests":   ["guests", "numberofguests", "guestcount", "sleeps"],
    "bedrooms": ["bedrooms", "beds rooms", "numbedrooms"],
    "beds":     ["beds", "numbeds"],
    "baths":    ["baths", "bathrooms", "numbaths"],
    "price":    ["pricepernight", "nightlyrate", "nightly", "price", "rate",
                 "cost", "amount", "total"],
    "rating":   ["rating", "stars", "score"],
    "reviews":  ["reviews", "reviewcount", "numreviews"],
    "amenities": ["amenities", "features", "tags"],
    "quote":    ["quote", "review", "reviewquote"],
    "quoteBy":  ["quoteby", "reviewer", "reviewauthor"],
    "story":    ["story", "note", "notes", "memory", "anecdote", "comment"],
    "photo":    ["photo", "image", "picture", "img", "photourl"],
}

NUMERIC = {"lat", "lng", "guests", "bedrooms", "beds", "baths", "price",
           "rating", "reviews"}
INT_FIELDS = {"guests", "bedrooms", "beds", "reviews", "price"}


def norm(h):
    return re.sub(r"[^a-z0-9]", "", (h or "").lower())


def detect_columns(headers, overrides):
    """Map our field names -> the column index that holds them."""
    found = {}
    normed = [norm(h) for h in headers]

    for field, target in overrides.items():
        t = norm(target)
        for i, h in enumerate(normed):
            if h == t:
                found[field] = i
                break
        else:
            raise SystemExit("no column named %r (headers: %s)"
                             % (target, ", ".join(headers)))

    for field, names in ALIASES.items():
        if field in found:
            continue
        # exact normalised match first, then substring
        for want in names:
            w = norm(want)
            for i, h in enumerate(normed):
                if h == w and i not in found.values():
                    found[field] = i
                    break
            if field in found:
                break
        if field in found:
            continue
        for want in names:
            w = norm(want)
            for i, h in enumerate(normed):
                if w and w in h and i not in found.values():
                    found[field] = i
                    break
            if field in found:
                break
    return found


def parse_number(raw):
    if raw is None:
        return None
    s = re.sub(r"[^0-9.\-]", "", str(raw))
    if s in ("", "-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None




def split_list(raw):
    if not raw:
        return []
    return [p.strip() for p in re.split(r"[;,|/]| and ", str(raw)) if p.strip()]


def row_to_stay(row, cols, crew_ids):
    def cell(field):
        i = cols.get(field)
        if i is None or i >= len(row):
            return None
        v = (row[i] or "").strip()
        return v or None

    stay = {}
    for field in ALIASES:
        v = cell(field)
        if v is None:
            continue
        if field in NUMERIC:
            n = parse_number(v)
            if n is None:
                continue
            stay[field] = int(round(n)) if field in INT_FIELDS else n
        elif field in ("amenities", "crew"):
            stay[field] = split_list(v)
        else:
            stay[field] = v

    if not stay.get("title"):
        return None

    # Names in the sheet are whatever people typed; match them to crew ids.
    def to_id(name):
        n = norm(name)
        for cid in crew_ids:
            if norm(cid) == n or norm(crew_ids[cid]) == n:
                return cid
        return None

    if stay.get("booker"):
        stay["booker"] = to_id(stay["booker"]) or "CHANGE_ME"
    if stay.get("crew"):
        stay["crew"] = [x for x in (to_id(c) for c in stay["crew"]) if x]

    stay["id"] = slug(stay["title"])
    return stay


# --------------------------------------------------------------- stays.js --

# ------------------------------------------------------------------- main --

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("csv", help="the spreadsheet, exported as CSV")
    ap.add_argument("--stays", default=os.path.join(here, "src", "stays.js"))
    ap.add_argument("--write", action="store_true",
                    help="merge into src/stays.js (default is a dry run)")
    ap.add_argument("--map", action="append", default=[], metavar="FIELD=COLUMN",
                    help="force a column, e.g. --map \"title=Listing Name\"")
    ap.add_argument("--no-geocode", action="store_true")
    ap.add_argument("--replace", action="store_true",
                    help="replace the existing stays rather than merging")
    args = ap.parse_args()

    overrides = {}
    for m in args.map:
        if "=" not in m:
            raise SystemExit("--map wants FIELD=COLUMN, got %r" % m)
        f, c = m.split("=", 1)
        if f not in ALIASES:
            raise SystemExit("unknown field %r. Known: %s"
                             % (f, ", ".join(sorted(ALIASES))))
        overrides[f] = c

    with io.open(args.csv, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    if not rows:
        raise SystemExit("that file is empty")

    headers, body = rows[0], rows[1:]
    cols = detect_columns(headers, overrides)
    if "title" not in cols:
        raise SystemExit(
            "could not find a title column.\nHeaders: %s\n"
            "Point at it with --map \"title=<column name>\"" % ", ".join(headers))

    print("column mapping:", file=sys.stderr)
    for f in ORDER:
        if f in cols:
            print("  %-10s <- %s" % (f, headers[cols[f]]), file=sys.stderr)
    unused = [h for i, h in enumerate(headers) if i not in cols.values()]
    if unused:
        print("  (ignored: %s)" % ", ".join(unused), file=sys.stderr)
    print("", file=sys.stderr)

    crew, existing, settings = read_stays_file(args.stays)
    crew_ids = {p["id"]: p.get("name", p["id"]) for p in crew}

    fresh, skipped = [], 0
    for row in body:
        if not any((c or "").strip() for c in row):
            continue
        stay = row_to_stay(row, cols, crew_ids)
        if not stay:
            skipped += 1
            continue
        fresh.append(stay)

    # Unique ids across old and new.
    taken = {s.get("id") for s in ([] if args.replace else existing)}
    for s in fresh:
        base, n = s["id"], 2
        while s["id"] in taken:
            s["id"] = "%s-%d" % (base, n)
            n += 1
        taken.add(s["id"])

    need = [s for s in fresh if s.get("lat") is None and s.get("place")]
    if need and not args.no_geocode:
        print("geocoding %d rows (about %d seconds)..." % (len(need), len(need)),
              file=sys.stderr)
        for s in need:
            hit = geocode(s["place"])
            if hit:
                s["lat"], s["lng"] = round(hit["lat"], 5), round(hit["lng"], 5)
            else:
                print("  no match for %r — set it in editor.html" % s["place"],
                      file=sys.stderr)

    incomplete = [s for s in fresh if s.get("lat") is None
                  or not s.get("booker") or s.get("booker") == "CHANGE_ME"]

    print("%d rows -> %d stays%s"
          % (len(body), len(fresh), (", %d skipped (no title)" % skipped) if skipped else ""),
          file=sys.stderr)
    if incomplete:
        print("%d still need a location or a booker — open editor.html and finish them:"
              % len(incomplete), file=sys.stderr)
        for s in incomplete[:10]:
            missing = []
            if s.get("lat") is None:
                missing.append("location")
            if not s.get("booker") or s["booker"] == "CHANGE_ME":
                missing.append("booker")
            print("  %-44s %s" % (s["title"][:44], ", ".join(missing)), file=sys.stderr)
        if len(incomplete) > 10:
            print("  ...and %d more" % (len(incomplete) - 10), file=sys.stderr)

    merged = fresh if args.replace else existing + fresh

    if not args.write:
        print("\n// dry run — nothing written. Add --write to merge into %s\n"
              % os.path.relpath(args.stays, here), file=sys.stderr)
        print(js_value([ordered(s) for s in fresh]))
        return 0

    if not crew:
        crew = [{"id": "CHANGE_ME", "name": "Player one", "color": "#3d7a8c", "tell": ""}]
    write_stays_file(args.stays, crew, merged, settings)
    print("\nwrote %d stays to %s" % (len(merged), args.stays), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
