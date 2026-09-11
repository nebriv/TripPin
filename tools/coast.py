"""Work out the nearest saltwater to each stay, once, offline.

WHY THIS IS A BUILD STEP AND NOT A LINE OF JAVASCRIPT

The map bundle the browser already ships contains country polygons, and it is
tempting to measure to the nearest point on those. It gives the wrong answer.
A country outline is coastline *and* land border in equal measure, so a stay in
Montana would be told its nearest sea is the Canadian prairie.

Real coastline is a separate Natural Earth layer, and shipping it to every
player to answer one question on one round would be a hundred-odd kilobytes on
every page load. The answer is two numbers per stay. So it is computed here and
baked in, the same way the listing detail is.

    python tools/coast.py --write

Stays without a coast point simply never draw that round; the format checks.
"""

import argparse
import io
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from jsdata import read_stays_file, write_stays_file      # noqa: E402

COASTLINE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
             "master/geojson/ne_50m_coastline.geojson")

R_MILES = 3958.7613


def fetch(cache_dir):
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, "coastline.geojson")
    if not os.path.exists(path):
        print("fetching the coastline (once) ...", file=sys.stderr)
        req = urllib.request.Request(COASTLINE, headers={
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/140.0.0.0 Safari/537.36",
        })
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def coast_points(path):
    """Every vertex of every coastline, as (lat, lng) radians plus a cache."""
    gj = json.load(io.open(path, encoding="utf-8"))
    pts = []
    for feat in gj.get("features", []):
        geom = feat.get("geometry") or {}
        lines = []
        if geom.get("type") == "LineString":
            lines = [geom["coordinates"]]
        elif geom.get("type") == "MultiLineString":
            lines = geom["coordinates"]
        for line in lines:
            for lng, lat in line:
                la = math.radians(lat)
                pts.append((lat, lng, la, math.radians(lng), math.cos(la)))
    return pts


def nearest(lat, lng, pts):
    """Closest coastline vertex, by great-circle distance."""
    la1, ln1 = math.radians(lat), math.radians(lng)
    cos1 = math.cos(la1)
    sin1 = math.sin(la1)
    best = None
    for plat, plng, la2, ln2, cos2 in pts:
        # Spherical law of cosines: cheaper than haversine and plenty accurate
        # at the ranges that matter here, and this runs a million times.
        d = sin1 * math.sin(la2) + cos1 * cos2 * math.cos(ln2 - ln1)
        if d > 1:
            d = 1.0
        elif d < -1:
            d = -1.0
        if best is None or d > best[0]:
            best = (d, plat, plng)
    return math.acos(best[0]) * R_MILES, best[1], best[2]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    root = os.path.dirname(HERE)
    ap.add_argument("--stays", default=os.path.join(root, "src", "stays.js"))
    ap.add_argument("--cache", default=os.path.join(root, ".cache"))
    ap.add_argument("--write", action="store_true", help="save back into stays.js")
    args = ap.parse_args()

    crew, stays, settings = read_stays_file(args.stays)
    pts = coast_points(fetch(args.cache))
    print("coastline vertices: %d" % len(pts), file=sys.stderr)

    inland = 0
    for s in stays:
        if s.get("lat") is None or s.get("lng") is None:
            continue
        miles, clat, clng = nearest(s["lat"], s["lng"], pts)
        s["coast"] = {"lat": round(clat, 4), "lng": round(clng, 4)}
        if miles > 60:
            inland += 1
        print("  %-34s %6.0f mi to the sea" % (s.get("place", s["id"])[:34], miles),
              file=sys.stderr)

    print("\n%d of %d stays are more than 60 miles inland, so that many can draw "
          "the round." % (inland, len(stays)), file=sys.stderr)

    if args.write:
        write_stays_file(args.stays, crew, stays, settings)
        print("written back to %s" % args.stays, file=sys.stderr)
    else:
        print("(dry run - pass --write to save)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
