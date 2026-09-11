"""
make_example_deck.py - write src/stays.example.js, a deck to develop against.

The real deck is not in this repo: it is somebody's travel history, and the
live copy sits in the Worker's KV namespace. Without a stays file, though,
index.html has nothing to open and half the tools have nothing to read. This
writes a fabricated one in exactly the same shape.

    python tools/make_example_deck.py

Ten stays in ten countries, five players, photos generated as small SVGs so
the file stays a few kilobytes rather than a few megabytes. Nothing in it is
anyone's: the coordinates are town centres off a map.

Standard library only.
"""

import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsdata import write_stays_file  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CREW = [
    {'id': 'player1', 'name': 'Robin', 'color': '#3d7a8c',
     'tell': 'Cold places, hot water. If it has a sauna, they booked it.'},
    {'id': 'player2', 'name': 'Sam', 'color': '#8c4a6b',
     'tell': 'Mountains, with a road to the door.'},
    {'id': 'player3', 'name': 'Alex', 'color': '#5c7a4a',
     'tell': 'Old cities, and always a balcony.'},
    {'id': 'player4', 'name': 'Jo', 'color': '#b07c2e',
     'tell': 'Desert and dust. Clearance required.'},
    {'id': 'player5', 'name': 'Kit', 'color': '#4a5c8c',
     'tell': 'The far end of the map, whichever end that is.'},
]

# place, lat, lng, owner, who else came, type, title, when, nights, rating,
# reviews
PLACES = [
    ('Reykjavik, Iceland', 64.1466, -21.9426, 'player1', ['player3'],
     'Tiny home', 'The Turf House', 'March 2025', 3, 4.91, 62),
    ('Kyoto, Japan', 35.0116, 135.7681, 'player1', ['player2', 'player5'],
     'Entire rental unit', 'Machiya on the Lane', 'April 2025', 4, 4.83, 214),
    ('Queenstown, New Zealand', -45.0312, 168.6626, 'player2', ['player1'],
     'Entire cabin', 'The Wool Shed', 'November 2024', 5, 4.76, 88),
    ('Banff, Alberta', 51.1784, -115.5708, 'player2', [],
     'Entire chalet', 'Larch Chalet', 'February 2025', 2, 4.68, 41),
    ('Tromso, Norway', 69.6492, 18.9553, 'player3', ['player1', 'player4'],
     'Entire cabin', 'Above the Fjord', 'January 2025', 4, 4.95, 133),
    ('Porto, Portugal', 41.1579, -8.6291, 'player3', [],
     'Entire loft', 'Tiles and a Balcony', 'June 2024', 3, 4.72, 307),
    ('Moab, Utah', 38.5733, -109.5498, 'player4', ['player5'],
     'Entire home', 'Slickrock House', 'May 2025', 2, 4.59, 76),
    ('Chiang Mai, Thailand', 18.7883, 98.9853, 'player4', [],
     'Entire bungalow', 'Teak Bungalow', 'August 2024', 6, 4.88, 159),
    ('Ushuaia, Argentina', -54.8019, -68.3030, 'player5', ['player2'],
     'Entire guesthouse', 'End of the Road', 'December 2024', 3, 4.64, 29),
    ('Marrakesh, Morocco', 31.6295, -7.9811, 'player5', ['player3', 'player4'],
     'Private room in riad', 'Riad Courtyard', 'October 2024', 2, 4.79, 402),
]

AMENITIES = [
    ['Waterfront', 'Private sauna', 'Fast wifi - 73 Mbps', 'Wood stove'],
    ['Kitchen', 'Washer', 'Fast wifi - 120 Mbps', 'Dedicated workspace'],
    ['Hot tub', 'Fire pit', 'Free parking on premises', 'Pets allowed'],
    ['Mountain view', 'Wood stove', 'Free parking on premises', 'Heating'],
    ['Aurora view', 'Private sauna', 'Heated floors', 'Airport shuttle'],
    ['Balcony', 'River view', 'Air conditioning', 'Elevator'],
    ['Desert view', 'Pool', 'Air conditioning', 'Free parking on premises'],
    ['Garden view', 'Pool', 'Outdoor shower', 'Breakfast'],
    ['Harbour view', 'Wood stove', 'Luggage dropoff allowed', 'Heating'],
    ['Courtyard', 'Plunge pool', 'Rooftop terrace', 'Breakfast'],
]

STORIES = [
    'The water came out of the tap hot enough to steep tea. Nobody warned us.',
    None,
    'We drove the last mile on gravel and the map gave up entirely.',
    None,
    'The lights came out at two in the morning and we stood in the snow.',
    'Six flights up, no lift, and worth every one of them.',
    None,
    'The gecko lived in the bathroom. We named it and left it there.',
    'The wind took the door out of my hand and I chased it down the drive.',
    None,
]


def photo(seed, hue):
    """A small SVG standing in for a photograph.

    Real listings carry a JPEG apiece and the deck runs to megabytes. The game
    only needs something to put in the strip, so this is a gradient and a
    horizon - enough to see the layout work, and honest about being fake.
    """
    horizon = 300 + seed % 40
    ridge = 250 + seed % 60
    dip = 305 - seed % 30
    far = 240 + seed % 50
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="426">'
        '<defs><linearGradient id="g' + str(seed) + '" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="hsl(' + str(hue) + ',52%,74%)"/>'
        '<stop offset="1" stop-color="hsl(' + str((hue + 38) % 360) + ',46%,42%)"/>'
        '</linearGradient></defs>'
        '<rect width="640" height="426" fill="url(#g' + str(seed) + ')"/>'
        '<path d="M0 ' + str(horizon) + ' L200 ' + str(ridge)
        + ' L380 ' + str(dip) + ' L640 ' + str(far) + ' L640 426 L0 426 Z" '
        'fill="hsl(' + str((hue + 200) % 360) + ',30%,22%)" opacity="0.82"/>'
        '</svg>'
    )
    return 'data:image/svg+xml;base64,' + base64.b64encode(
        svg.encode('utf-8')).decode('ascii')


SETTINGS = """{
  // No word: this deck is fiction, and the copy you open straight off the
  // disk has nothing worth gating. The real one is the ENTRY_KEY Worker
  // secret, and the Worker is what checks it.
  key: null,
  shareUrl: 'https://example.workers.dev',
}"""


def main():
    stays = []
    for i, row in enumerate(PLACES):
        (place, lat, lng, owner, mates, kind, title, when, nights,
         rating, reviews) = row
        hue = (i * 36) % 360
        town = place.split(',')[0].lower().replace(' ', '-')
        stays.append({
            'id': town + '-' + when.split()[-1],
            'title': title,
            'type': kind,
            'guests': 2 + i % 5,
            'beds': 1 + i % 3,
            'baths': 1 + i % 2,
            'amenities': AMENITIES[i],
            'rating': rating,
            'reviews': reviews,
            'booker': owner,
            'crew': [owner] + mates,
            'lat': lat,
            'lng': lng,
            'place': place,
            'when': when,
            'nights': nights,
            'story': STORIES[i],
            'photo': photo(i, hue),
            'source': 'example',
            'photos': [
                photo(i, hue),
                photo(i + 50, (hue + 90) % 360),
                photo(i + 100, (hue + 180) % 360),
            ],
            'others': 0,
        })

    out = os.path.join(HERE, 'src', 'stays.example.js')
    write_stays_file(out, CREW, stays, SETTINGS)
    print('%-26s %d stays, %d players, %d KB'
          % (os.path.relpath(out, HERE), len(stays), len(CREW),
             os.path.getsize(out) // 1024))


if __name__ == '__main__':
    main()
