"""
build_map.py — turns Natural Earth source data into src/worldmap.js

Downloads (or reuses) three public-domain datasets and bakes them into a single
JS file of raw lat/lng rings that the game projects at runtime.

  countries  world-atlas 50m TopoJSON  -> coastlines + national borders
  admin1     Natural Earth 50m         -> states / provinces (drawn when zoomed)
  cities     Natural Earth 50m simple  -> labelled reference dots

Usage:  python tools/build_map.py [--src DIR]
Output: src/worldmap.js  (defines window.WORLDMAP)
"""

import json, math, os, sys, argparse, urllib.request

SOURCES = {
    "countries-50m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
    "admin1.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lakes.geojson",
    "cities.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson",
}

# ---------------------------------------------------------------- geometry ---

def dp_simplify(points, tol):
    """Douglas-Peucker on a lng/lat ring. tol is in degrees."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    tol2 = tol * tol
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        ax, ay = points[lo]
        bx, by = points[hi]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for i in range(lo + 1, hi):
            px, py = points[i]
            if denom == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / denom
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > worst:
                worst, wi = d2, i
        if worst > tol2:
            keep[wi] = True
            stack.append((lo, wi))
            stack.append((wi, hi))
    return [p for p, k in zip(points, keep) if k]


def ring_bbox_span(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def clean(ring, tol, min_span, dp):
    """Simplify, drop specks, round."""
    if len(ring) < 4 or ring_bbox_span(ring) < min_span:
        return None
    ring = dp_simplify(ring, tol)
    if len(ring) < 4:
        return None
    out, prev = [], None
    for x, y in ring:
        pt = [round(x, dp), round(y, dp)]
        if pt != prev:
            out.append(pt)
        prev = pt
    return out if len(out) >= 4 else None


# ------------------------------------------------------------------ encode ---

def encode_ring(ring, factor):
    """Google-polyline encoding of an [lng,lat] ring. ~3x smaller than JSON."""
    out = []
    px = py = 0
    for x, y in ring:
        ix, iy = int(round(x * factor)), int(round(y * factor))
        for d in (ix - px, iy - py):
            d = ~(d << 1) if d < 0 else (d << 1)
            while d >= 0x20:
                out.append(chr((0x20 | (d & 0x1F)) + 63))
                d >>= 5
            out.append(chr(d + 63))
        px, py = ix, iy
    return "".join(out)


# ---------------------------------------------------------------- topojson ---

def topo_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def stitch(arc_ids, arcs):
    ring = []
    for i in arc_ids:
        pts = arcs[~i][::-1] if i < 0 else arcs[i]
        ring.extend(pts[1:] if ring else pts)
    return ring


def topo_rings(topo, obj_name):
    arcs = topo_arcs(topo)
    out = []
    for geom in topo["objects"][obj_name]["geometries"]:
        t = geom.get("type")
        if t == "Polygon":
            polys = [geom["arcs"]]
        elif t == "MultiPolygon":
            polys = geom["arcs"]
        else:
            continue
        for poly in polys:
            for ring_ids in poly:            # incl. holes; drawn as outlines
                out.append(stitch(ring_ids, arcs))
    return out


# -------------------------------------------------------------------- main ---

def fetch(cache_dir, name):
    path = os.path.join(cache_dir, name)
    if not os.path.exists(path):
        print(f"  downloading {name} ...")
        os.makedirs(cache_dir, exist_ok=True)
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--src", default=os.path.join(here, "data", "geo"))
    ap.add_argument("--out", default=os.path.join(here, "src", "worldmap.js"))
    args = ap.parse_args()

    print("countries ...")
    topo = json.load(open(fetch(args.src, "countries-50m.json"), encoding="utf-8"))
    countries = []
    for ring in topo_rings(topo, "countries"):
        r = clean(ring, tol=0.035, min_span=0.02, dp=3)
        if r:
            countries.append(r)
    print(f"  {len(countries)} rings, {sum(len(r) for r in countries)} points")

    print("admin1 ...")
    a1 = json.load(open(fetch(args.src, "admin1.geojson"), encoding="utf-8"))
    admin1 = []
    for f in a1["features"]:
        g = f.get("geometry") or {}
        polys = ([g["coordinates"]] if g.get("type") == "Polygon"
                 else g.get("coordinates", []) if g.get("type") == "MultiPolygon" else [])
        for poly in polys:
            for ring in poly:
                r = clean([tuple(p) for p in ring], tol=0.05, min_span=0.12, dp=3)
                if r:
                    admin1.append(r)
    print(f"  {len(admin1)} rings, {sum(len(r) for r in admin1)} points")

    print("cities ...")
    cj = json.load(open(fetch(args.src, "cities.geojson"), encoding="utf-8"))
    cities = []
    for f in cj["features"]:
        p = f["properties"]
        name = p.get("name")
        if not name:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        pop = int(p.get("pop_max") or 0)
        # scalerank ~= the zoom level at which Natural Earth intends the label
        # to appear (0 = world capitals, 10 = small towns). We reuse it directly
        # as the map's label threshold.
        rank = int(p.get("scalerank") if p.get("scalerank") is not None else 10)
        # Thin the long tail: keep anything reasonably prominent, plus any place
        # NE considers label-worthy early, so mid-size towns survive.
        if pop < 20000 and rank > 7:
            continue
        cities.append([name, round(lon, 3), round(lat, 3), min(rank, 10), pop])
    cities.sort(key=lambda c: (c[3], -c[4]))
    cities = [c[:4] for c in cities]
    print(f"  {len(cities)} cities")

    FACTOR = 1000
    payload = {
        "factor": FACTOR,
        "countries": [encode_ring(r, FACTOR) for r in countries],
        "admin1": [encode_ring(r, FACTOR) for r in admin1],
        "cities": cities,
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    header = (
        "// GENERATED FILE - do not edit by hand. Rebuild with: python tools/build_map.py\n"
        "// Geometry: Natural Earth (public domain) via world-atlas + natural-earth-vector.\n"
        "// countries/admin1: polyline-encoded [lng,lat] rings (see decodeRing in map.js).\n"
        "// cities: [name, lng, lat, labelrank].\n"
    )
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(header + "window.WORLDMAP = " + body + ";\n")

    kb = os.path.getsize(args.out) / 1024
    print(f"\nwrote {args.out}  ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
