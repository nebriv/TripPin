"""
import_trips.py — turn an Airbnb "Trips" page into stays, tagged with an owner.

This is the intended way to fill the game. Each of you does this once:

  1. Log in to Airbnb, go to your past trips, scroll until everything has
     loaded.
  2. Right-click the list of trips -> Inspect, find the <div> that wraps all
     the trip cards, right-click it -> Copy -> Copy outerHTML.
  3. Paste it into a file and run:

         python tools/import_trips.py --html andrew.html --owner andrew

Every stay from that file is tagged `booker: "andrew"`, which is exactly the
thing the game asks players to name. It also pulls out the town, the dates,
the co-travellers Airbnb shows on the card, and the listing photo.

The town is all Airbnb puts on a trip card, and town names repeat — there is a
Whitehall in New York and one in Montana. The script geocodes each one and
prints anything it had to guess at, so you can fix those in editor.html before
anyone plays.

  --html FILE     the pasted trips markup
  --json FILE     already-extracted rows, same shape the parser produces
  --owner ID      crew id these trips belong to (required)
  --photos        download the listing photos and embed them
  --write         merge into src/stays.js (default is a dry run)

Standard library only.
"""

import argparse
import base64
import html as htmllib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_url import geocode, get                      # noqa: E402
from jsdata import (read_stays_file, write_stays_file, js_value, ordered,  # noqa: E402
                    slug)

PHOTO_WIDTH = 720          # muscache resizes for us with ?im_w=


# ------------------------------------------------------------------ parsing --

# Airbnb's class names are generated and change; anchor on structure instead.
TRIP_SPLIT = re.compile(r'<a\s+href="/trips/v1/(\d+)"')
PLACE_RE = re.compile(r'role="img"[^>]*aria-label="([^"]+)"')
PHOTO_RE = re.compile(r'data-original-uri="(https://a0\.muscache\.com/im/pictures/[^"]+)"')
FACE_RE = re.compile(r'aria-label="([^"]+)"[^>]*>\s*<img[^>]*aria-hidden="true"\s*alt="\1"')
ALT_RE = re.compile(r'<img[^>]*alt="([^"]+)"[^>]*src="https://a0\.muscache\.com/im/(?:users|pictures/user|Portrait)')
MORE_RE = re.compile(r'>\+(\d+)<')
# The two text lines on a card: town, then the date range.
TEXT_RE = re.compile(r'>([^<>]{2,60})</div>')

MONTHS = ('January February March April May June July August September '
          'October November December').split()
DATE_RE = re.compile(
    r'^(' + '|'.join(MONTHS) + r')\s+\d+' +
    r'(?:,\s*\d{4})?\s*[–-]\s*(?:(' + '|'.join(MONTHS) + r')\s+)?\d+,\s*(\d{4})$'
)


def clean(s):
    return htmllib.unescape(s or '').replace(' ', ' ').strip()


def parse_html(markup):
    """Pull one row per trip card out of the pasted markup."""
    parts = TRIP_SPLIT.split(markup)
    rows = []
    # split() gives [prefix, id, chunk, id, chunk, ...]
    for i in range(1, len(parts), 2):
        trip_id, chunk = parts[i], parts[i + 1]

        photo = PHOTO_RE.search(chunk)
        place = PLACE_RE.search(chunk)

        # The card prints the town then the dates as two sibling divs.
        texts = [clean(t) for t in TEXT_RE.findall(chunk)]
        texts = [t for t in texts if t and not t.startswith('+')]
        when = next((t for t in texts if DATE_RE.match(t)), None)
        town = clean(place.group(1)) if place else (texts[0] if texts else None)

        # Everyone on the facepile: their alt text is on a profile image.
        people, seen = [], set()
        for name in ALT_RE.findall(chunk):
            name = clean(name)
            if name and name != town and name not in seen:
                seen.add(name)
                people.append(name)

        more = MORE_RE.search(chunk)

        if not town:
            continue
        rows.append({
            'trip_id': trip_id,
            'place': town,
            'when': when,
            'photo_url': photo.group(1) if photo else None,
            'people': people,
            'others': int(more.group(1)) if more else 0,
        })
    return rows


# --------------------------------------------------------------- enrichment --

def pretty_when(when):
    """'August 1 – 4, 2026' -> 'August 2026'."""
    if not when:
        return None
    m = re.match(r'^(' + '|'.join(MONTHS) + r')\b.*?(\d{4})\s*$', when)
    return '%s %s' % (m.group(1), m.group(2)) if m else when


def nights(when):
    """Rough night count from the printed range, for the card's one fact."""
    if not when:
        return None
    nums = re.findall(r'\b(\d{1,2})\b(?!\d)', re.sub(r',\s*\d{4}', '', when))
    if len(nums) != 2:
        return None
    a, b = int(nums[0]), int(nums[1])
    return b - a if b > a else None


def fetch_photo(url):
    if not url:
        return None, 'no photo on the card'
    sized = '%s?im_w=%d' % (url.split('?')[0], PHOTO_WIDTH)
    try:
        raw, ctype, _ = get(sized, accept='image/*', timeout=40)
    except Exception as e:
        return None, str(e)
    ctype = (ctype or 'image/jpeg').split(';')[0].strip()
    if not ctype.startswith('image/'):
        ctype = 'image/jpeg'
    return 'data:%s;base64,%s' % (ctype, base64.b64encode(raw).decode('ascii')), None


# Town names repeat across states and countries. These are the readings that
# fit the surrounding trips (same week, same crew, same region); everything
# else is left for the geocoder and reported if it had to choose.
HINTS = {
    'New Russia': 'New Russia, Essex County, New York',
    'Elizabethtown': 'Elizabethtown, Essex County, New York',
    'Keeseville': 'Keeseville, New York',
    'Livingston Manor': 'Livingston Manor, Sullivan County, New York',
    'Town of Shandaken': 'Shandaken, Ulster County, New York',
    'Kerhonkson': 'Kerhonkson, New York',
    'Toyako': 'Toyako, Hokkaido, Japan',
    'Otaru': 'Otaru, Hokkaido, Japan',
    'San Isidro': 'San Isidro, Lima, Peru',
    'Queens': 'Queens, New York City',
    'Rincón': 'Rincon, Puerto Rico',
    'San Juan': 'San Juan, Puerto Rico',
}

# Same idea, but these ones are a judgement call rather than a certainty —
# the script prints them so you can check before anyone plays.
GUESSES = {
    'Whitehall': ('Whitehall, Montana', 'the night before Choteau, Montana'),
    'Choteau': ('Choteau, Montana', None),
    'Melbourne': ('Melbourne, Florida', 'same crew and week as Indian Harbour Beach, Florida'),
    'Washington': ('Washington, District of Columbia', 'assumed DC, not Washington CT/VA'),
    'Newry': ('Newry, Maine', 'August 2020, so Maine rather than Northern Ireland'),
    'Orleans': ('Orleans, California', 'sits between Point Arena and San Francisco that week'),
    'Stonington': ('Stonington, Connecticut', 'could equally be Stonington, Maine'),
    'Norwich': ('Norwich, Connecticut', 'could be Vermont, New York or England'),
    'Morris': ('Morris, New York', 'could be Morris, Connecticut'),
    'Jamestown': ('Jamestown, Rhode Island', 'could be Jamestown, New York'),
    'Stamford': ('Stamford, Connecticut', 'could be Stamford, New York'),
    'Mims': ('Mims, Florida', None),
    'Titusville': ('Titusville, Florida', None),
    'Indian Harbour Beach': ('Indian Harbour Beach, Florida', None),
    'South Padre Island': ('South Padre Island, Texas', None),
    'Laguna Vista': ('Laguna Vista, Texas', None),
    'Point Arena': ('Point Arena, California', None),
    'Boston': ('Boston, Massachusetts', None),
    'Nashville': ('Nashville, Tennessee', None),
    'New Orleans': ('New Orleans, Louisiana', None),
    'San Francisco': ('San Francisco, California', None),
}


def locate(place):
    """Returns (lat, lng, label, note_or_None)."""
    query, note = HINTS.get(place), None
    if not query:
        guess = GUESSES.get(place)
        if guess:
            query, note = guess
        else:
            query = place
    hit = geocode(query)
    if not hit:
        return None, None, place, 'could not geocode %r' % query
    return hit['lat'], hit['lng'], place, note


# -------------------------------------------------------------------- main --

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--html')
    ap.add_argument('--json')
    ap.add_argument('--owner', required=True, help='crew id these trips belong to')
    ap.add_argument('--photos', action='store_true')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--replace', action='store_true')
    ap.add_argument('--stays', default=os.path.join(here, 'src', 'stays.js'))
    args = ap.parse_args()

    if args.html:
        rows = parse_html(open(args.html, encoding='utf-8').read())
    elif args.json:
        rows = json.load(open(args.json, encoding='utf-8'))
    else:
        raise SystemExit('pass --html or --json')

    print('%d trips found' % len(rows), file=sys.stderr)
    if not rows:
        raise SystemExit('nothing parsed — check that you copied the wrapper div')

    crew, existing, settings = read_stays_file(args.stays)
    crew_ids = {p['id']: p.get('name', p['id']) for p in crew}
    if args.owner not in crew_ids:
        print('warning: %r is not in CREW yet — add them to src/stays.js'
              % args.owner, file=sys.stderr)

    def to_id(name):
        low = re.sub(r'[^a-z0-9]', '', name.lower())
        for cid, cname in crew_ids.items():
            if re.sub(r'[^a-z0-9]', '', cid.lower()) == low:
                return cid
            if re.sub(r'[^a-z0-9]', '', cname.lower()) == low:
                return cid
        return None

    taken = {s.get('id') for s in ([] if args.replace else existing)}
    stays, notes = [], []

    print('geocoding %d towns (about %d seconds)...' % (len(rows), len(rows)),
          file=sys.stderr)

    for row in rows:
        lat, lng, label, note = locate(row['place'])
        if note:
            notes.append((row['place'], note))

        with_ids, with_names = [], []
        for name in row.get('people', []):
            cid = to_id(name)
            if cid and cid != args.owner:
                with_ids.append(cid)
            elif not cid:
                with_names.append(name)

        base = slug('%s-%s' % (row['place'], (row.get('when') or '').split(',')[-1].strip()))
        sid, n = base, 2
        while sid in taken:
            sid = '%s-%d' % (base, n)
            n += 1
        taken.add(sid)

        nts = nights(row.get('when'))
        stay = {
            'id': sid,
            'title': None,          # Airbnb's trip card does not carry one
            'type': None,
            'guests': None,
            'amenities': [],
            'booker': args.owner,
            'crew': [args.owner] + with_ids,
            'lat': round(lat, 5) if lat is not None else None,
            'lng': round(lng, 5) if lng is not None else None,
            'place': label,
            'when': pretty_when(row.get('when')),
            'nights': nts,
            'story': None,
            'photo': None,
            'alsoThere': with_names + (
                ['%d more' % row['others']] if row.get('others') else []),
            'source': 'airbnb-trips',
        }
        stays.append(stay)

    if args.photos:
        print('downloading %d photos...' % len(rows), file=sys.stderr)
        for stay, row in zip(stays, rows):
            uri, err = fetch_photo(row.get('photo_url'))
            stay['photo'] = uri
            if err:
                notes.append((stay['place'], 'photo: %s' % err))
        got = sum(1 for s in stays if s['photo'])
        size = sum(len(s['photo'] or '') for s in stays) * 0.75
        print('  %d/%d photos, %.1f MB' % (got, len(stays), size / 1048576),
              file=sys.stderr)

    if notes:
        print('\ncheck these before anyone plays:', file=sys.stderr)
        for place, note in notes:
            print('  %-24s %s' % (place, note), file=sys.stderr)

    merged = stays if args.replace else existing + stays
    if not args.write:
        print('\ndry run — add --write to merge into %s'
              % os.path.relpath(args.stays, here), file=sys.stderr)
        slim = [dict(s, photo=('<%d KB>' % (len(s['photo']) / 1024)) if s['photo'] else None)
                for s in stays]
        print(js_value([ordered(s) for s in slim]))
        return 0

    write_stays_file(args.stays, crew, merged, settings)
    print('\nwrote %d stays to %s' % (len(merged), args.stays), file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
