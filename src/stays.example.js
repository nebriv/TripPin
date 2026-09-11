/* ===========================================================================
   stays.js — the game's data. Safe to edit by hand.

   SETTINGS  the entry word and share link
   CREW      the people whose trip lists feed the game
   STAYS     one entry per place. `booker` is whose list it came from, which
             is exactly what players are asked to name.

   Regenerate with tools/import_trips.py, or edit visually in editor.html.
   =========================================================================== */

window.SETTINGS = {
  // No word: this deck is fiction, and the copy you open straight off the
  // disk has nothing worth gating. The real one is the ENTRY_KEY Worker
  // secret, and the Worker is what checks it.
  key: null,
  shareUrl: 'https://example.workers.dev',
};

window.CREW = [
  {
    id: 'player1',
    name: 'Robin',
    color: '#3d7a8c',
    tell: 'Cold places, hot water. If it has a sauna, they booked it.'
  },
  {
    id: 'player2',
    name: 'Sam',
    color: '#8c4a6b',
    tell: 'Mountains, with a road to the door.'
  },
  {
    id: 'player3',
    name: 'Alex',
    color: '#5c7a4a',
    tell: 'Old cities, and always a balcony.'
  },
  {
    id: 'player4',
    name: 'Jo',
    color: '#b07c2e',
    tell: 'Desert and dust. Clearance required.'
  },
  {
    id: 'player5',
    name: 'Kit',
    color: '#4a5c8c',
    tell: 'The far end of the map, whichever end that is.'
  }
];

window.STAYS = [
  {
    id: 'reykjavik-2025',
    title: 'The Turf House',
    type: 'Tiny home',
    guests: 2,
    beds: 1,
    baths: 1,
    amenities: ['Waterfront', 'Private sauna', 'Fast wifi - 73 Mbps', 'Wood stove'],
    rating: 4.91,
    reviews: 62,
    booker: 'player1',
    crew: ['player1', 'player3'],
    lat: 64.1466,
    lng: -21.9426,
    place: 'Reykjavik, Iceland',
    when: 'March 2025',
    nights: 3,
    story: 'The water came out of the tap hot enough to steep tea. Nobody warned us.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcwIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMCw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDM4LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzApIi8+PHBhdGggZD0iTTAgMzAwIEwyMDAgMjUwIEwzODAgMzA1IEw2NDAgMjQwIEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjAwLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcwIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMCw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDM4LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzApIi8+PHBhdGggZD0iTTAgMzAwIEwyMDAgMjUwIEwzODAgMzA1IEw2NDAgMjQwIEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjAwLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1MCIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDkwLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMTI4LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzUwKSIvPjxwYXRoIGQ9Ik0wIDMxMCBMMjAwIDMwMCBMMzgwIDI4NSBMNjQwIDI0MCBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDI5MCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDAiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgxODAsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgyMTgsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTAwKSIvPjxwYXRoIGQ9Ik0wIDMyMCBMMjAwIDI5MCBMMzgwIDI5NSBMNjQwIDI0MCBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDIwLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+'
    ],
    others: 0
  },
  {
    id: 'kyoto-2025',
    title: 'Machiya on the Lane',
    type: 'Entire rental unit',
    guests: 3,
    beds: 2,
    baths: 2,
    amenities: ['Kitchen', 'Washer', 'Fast wifi - 120 Mbps', 'Dedicated workspace'],
    rating: 4.83,
    reviews: 214,
    booker: 'player1',
    crew: ['player1', 'player2', 'player5'],
    lat: 35.0116,
    lng: 135.7681,
    place: 'Kyoto, Japan',
    when: 'April 2025',
    nights: 4,
    story: null,
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMzYsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCg3NCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2cxKSIvPjxwYXRoIGQ9Ik0wIDMwMSBMMjAwIDI1MSBMMzgwIDMwNCBMNjQwIDI0MSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDIzNiwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMzYsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCg3NCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2cxKSIvPjxwYXRoIGQ9Ik0wIDMwMSBMMjAwIDI1MSBMMzgwIDMwNCBMNjQwIDI0MSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDIzNiwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1MSIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDEyNiw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDE2NCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1MSkiLz48cGF0aCBkPSJNMCAzMTEgTDIwMCAzMDEgTDM4MCAyODQgTDY0MCAyNDEgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgzMjYsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDEiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgyMTYsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgyNTQsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTAxKSIvPjxwYXRoIGQ9Ik0wIDMyMSBMMjAwIDI5MSBMMzgwIDI5NCBMNjQwIDI0MSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDU2LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+'
    ],
    others: 0
  },
  {
    id: 'queenstown-2024',
    title: 'The Wool Shed',
    type: 'Entire cabin',
    guests: 4,
    beds: 3,
    baths: 1,
    amenities: ['Hot tub', 'Fire pit', 'Free parking on premises', 'Pets allowed'],
    rating: 4.76,
    reviews: 88,
    booker: 'player2',
    crew: ['player2', 'player1'],
    lat: -45.0312,
    lng: 168.6626,
    place: 'Queenstown, New Zealand',
    when: 'November 2024',
    nights: 5,
    story: 'We drove the last mile on gravel and the map gave up entirely.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcyIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woNzIsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgxMTAsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMikiLz48cGF0aCBkPSJNMCAzMDIgTDIwMCAyNTIgTDM4MCAzMDMgTDY0MCAyNDIgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgyNzIsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcyIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woNzIsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgxMTAsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMikiLz48cGF0aCBkPSJNMCAzMDIgTDIwMCAyNTIgTDM4MCAzMDMgTDY0MCAyNDIgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgyNzIsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1MiIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDE2Miw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDIwMCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1MikiLz48cGF0aCBkPSJNMCAzMTIgTDIwMCAzMDIgTDM4MCAyODMgTDY0MCAyNDIgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgyLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDIiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgyNTIsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgyOTAsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTAyKSIvPjxwYXRoIGQ9Ik0wIDMyMiBMMjAwIDI5MiBMMzgwIDI5MyBMNjQwIDI0MiBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDkyLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+'
    ],
    others: 0
  },
  {
    id: 'banff-2025',
    title: 'Larch Chalet',
    type: 'Entire chalet',
    guests: 5,
    beds: 1,
    baths: 2,
    amenities: ['Mountain view', 'Wood stove', 'Free parking on premises', 'Heating'],
    rating: 4.68,
    reviews: 41,
    booker: 'player2',
    crew: ['player2'],
    lat: 51.1784,
    lng: -115.5708,
    place: 'Banff, Alberta',
    when: 'February 2025',
    nights: 2,
    story: null,
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImczIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTA4LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMTQ2LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzMpIi8+PHBhdGggZD0iTTAgMzAzIEwyMDAgMjUzIEwzODAgMzAyIEw2NDAgMjQzIEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMzA4LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImczIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTA4LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMTQ2LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzMpIi8+PHBhdGggZD0iTTAgMzAzIEwyMDAgMjUzIEwzODAgMzAyIEw2NDAgMjQzIEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMzA4LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1MyIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDE5OCw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDIzNiw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1MykiLz48cGF0aCBkPSJNMCAzMTMgTDIwMCAzMDMgTDM4MCAyODIgTDY0MCAyNDMgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgzOCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDMiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgyODgsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgzMjYsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTAzKSIvPjxwYXRoIGQ9Ik0wIDMyMyBMMjAwIDI5MyBMMzgwIDI5MiBMNjQwIDI0MyBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDEyOCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg=='
    ],
    others: 0
  },
  {
    id: 'tromso-2025',
    title: 'Above the Fjord',
    type: 'Entire cabin',
    guests: 6,
    beds: 2,
    baths: 1,
    amenities: ['Aurora view', 'Private sauna', 'Heated floors', 'Airport shuttle'],
    rating: 4.95,
    reviews: 133,
    booker: 'player3',
    crew: ['player3', 'player1', 'player4'],
    lat: 69.6492,
    lng: 18.9553,
    place: 'Tromso, Norway',
    when: 'January 2025',
    nights: 4,
    story: 'The lights came out at two in the morning and we stood in the snow.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc0IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTQ0LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMTgyLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzQpIi8+PHBhdGggZD0iTTAgMzA0IEwyMDAgMjU0IEwzODAgMzAxIEw2NDAgMjQ0IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMzQ0LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc0IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTQ0LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMTgyLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzQpIi8+PHBhdGggZD0iTTAgMzA0IEwyMDAgMjU0IEwzODAgMzAxIEw2NDAgMjQ0IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMzQ0LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1NCIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDIzNCw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDI3Miw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1NCkiLz48cGF0aCBkPSJNMCAzMTQgTDIwMCAzMDQgTDM4MCAyODEgTDY0MCAyNDQgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCg3NCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDQiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgzMjQsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgyLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzEwNCkiLz48cGF0aCBkPSJNMCAzMjQgTDIwMCAyOTQgTDM4MCAyOTEgTDY0MCAyNDQgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgxNjQsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4='
    ],
    others: 0
  },
  {
    id: 'porto-2024',
    title: 'Tiles and a Balcony',
    type: 'Entire loft',
    guests: 2,
    beds: 3,
    baths: 2,
    amenities: ['Balcony', 'River view', 'Air conditioning', 'Elevator'],
    rating: 4.72,
    reviews: 307,
    booker: 'player3',
    crew: ['player3'],
    lat: 41.1579,
    lng: -8.6291,
    place: 'Porto, Portugal',
    when: 'June 2024',
    nights: 3,
    story: 'Six flights up, no lift, and worth every one of them.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTgwLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjE4LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzUpIi8+PHBhdGggZD0iTTAgMzA1IEwyMDAgMjU1IEwzODAgMzAwIEw2NDAgMjQ1IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjAsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMTgwLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjE4LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzUpIi8+PHBhdGggZD0iTTAgMzA1IEwyMDAgMjU1IEwzODAgMzAwIEw2NDAgMjQ1IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjAsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1NSIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDI3MCw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDMwOCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1NSkiLz48cGF0aCBkPSJNMCAzMTUgTDIwMCAzMDUgTDM4MCAyODAgTDY0MCAyNDUgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgxMTAsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDUiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgwLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMzgsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTA1KSIvPjxwYXRoIGQ9Ik0wIDMyNSBMMjAwIDI5NSBMMzgwIDI5MCBMNjQwIDI0NSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDIwMCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg=='
    ],
    others: 0
  },
  {
    id: 'moab-2025',
    title: 'Slickrock House',
    type: 'Entire home',
    guests: 3,
    beds: 1,
    baths: 1,
    amenities: ['Desert view', 'Pool', 'Air conditioning', 'Free parking on premises'],
    rating: 4.59,
    reviews: 76,
    booker: 'player4',
    crew: ['player4', 'player5'],
    lat: 38.5733,
    lng: -109.5498,
    place: 'Moab, Utah',
    when: 'May 2025',
    nights: 2,
    story: null,
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc2IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjE2LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjU0LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzYpIi8+PHBhdGggZD0iTTAgMzA2IEwyMDAgMjU2IEwzODAgMjk5IEw2NDAgMjQ2IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woNTYsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc2IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjE2LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjU0LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzYpIi8+PHBhdGggZD0iTTAgMzA2IEwyMDAgMjU2IEwzODAgMjk5IEw2NDAgMjQ2IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woNTYsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1NiIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDMwNiw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDM0NCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c1NikiLz48cGF0aCBkPSJNMCAzMTYgTDIwMCAzMDYgTDM4MCAyNzkgTDY0MCAyNDYgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgxNDYsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgzNiw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDc0LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzEwNikiLz48cGF0aCBkPSJNMCAzMjYgTDIwMCAyOTYgTDM4MCAyODkgTDY0MCAyNDYgTDY0MCA0MjYgTDAgNDI2IFoiIGZpbGw9ImhzbCgyMzYsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4='
    ],
    others: 0
  },
  {
    id: 'chiang-mai-2024',
    title: 'Teak Bungalow',
    type: 'Entire bungalow',
    guests: 4,
    beds: 2,
    baths: 2,
    amenities: ['Garden view', 'Pool', 'Outdoor shower', 'Breakfast'],
    rating: 4.88,
    reviews: 159,
    booker: 'player4',
    crew: ['player4'],
    lat: 18.7883,
    lng: 98.9853,
    place: 'Chiang Mai, Thailand',
    when: 'August 2024',
    nights: 6,
    story: 'The gecko lived in the bathroom. We named it and left it there.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc3IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjUyLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjkwLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzcpIi8+PHBhdGggZD0iTTAgMzA3IEwyMDAgMjU3IEwzODAgMjk4IEw2NDAgMjQ3IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woOTIsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc3IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjUyLDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMjkwLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzcpIi8+PHBhdGggZD0iTTAgMzA3IEwyMDAgMjU3IEwzODAgMjk4IEw2NDAgMjQ3IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woOTIsMzAlLDIyJSkiIG9wYWNpdHk9IjAuODIiLz48L3N2Zz4=',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1NyIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDM0Miw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDIwLDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzU3KSIvPjxwYXRoIGQ9Ik0wIDMxNyBMMjAwIDMwNyBMMzgwIDI3OCBMNjQwIDI0NyBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDE4MiwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDciIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCg3Miw1MiUsNzQlKSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iaHNsKDExMCw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2cxMDcpIi8+PHBhdGggZD0iTTAgMzI3IEwyMDAgMjk3IEwzODAgMjg4IEw2NDAgMjQ3IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjcyLDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+'
    ],
    others: 0
  },
  {
    id: 'ushuaia-2024',
    title: 'End of the Road',
    type: 'Entire guesthouse',
    guests: 5,
    beds: 3,
    baths: 1,
    amenities: ['Harbour view', 'Wood stove', 'Luggage dropoff allowed', 'Heating'],
    rating: 4.64,
    reviews: 29,
    booker: 'player5',
    crew: ['player5', 'player2'],
    lat: -54.8019,
    lng: -68.303,
    place: 'Ushuaia, Argentina',
    when: 'December 2024',
    nights: 3,
    story: 'The wind took the door out of my hand and I chased it down the drive.',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc4IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjg4LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMzI2LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzgpIi8+PHBhdGggZD0iTTAgMzA4IEwyMDAgMjU4IEwzODAgMjk3IEw2NDAgMjQ4IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMTI4LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc4IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMjg4LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMzI2LDQ2JSw0MiUpIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjYiIGZpbGw9InVybCgjZzgpIi8+PHBhdGggZD0iTTAgMzA4IEwyMDAgMjU4IEwzODAgMjk3IEw2NDAgMjQ4IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMTI4LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1OCIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDE4LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woNTYsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnNTgpIi8+PHBhdGggZD0iTTAgMzE4IEwyMDAgMzA4IEwzODAgMjc3IEw2NDAgMjQ4IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjE4LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDgiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgxMDgsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgxNDYsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTA4KSIvPjxwYXRoIGQ9Ik0wIDMyOCBMMjAwIDI5OCBMMzgwIDI4NyBMNjQwIDI0OCBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDMwOCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg=='
    ],
    others: 0
  },
  {
    id: 'marrakesh-2024',
    title: 'Riad Courtyard',
    type: 'Private room in riad',
    guests: 6,
    beds: 1,
    baths: 2,
    amenities: ['Courtyard', 'Plunge pool', 'Rooftop terrace', 'Breakfast'],
    rating: 4.79,
    reviews: 402,
    booker: 'player5',
    crew: ['player5', 'player3', 'player4'],
    lat: 31.6295,
    lng: -7.9811,
    place: 'Marrakesh, Morocco',
    when: 'October 2024',
    nights: 2,
    story: null,
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc5IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMzI0LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMiw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c5KSIvPjxwYXRoIGQ9Ik0wIDMwOSBMMjAwIDI1OSBMMzgwIDI5NiBMNjQwIDI0OSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDE2NCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
    source: 'example',
    photos: [
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc5IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSJoc2woMzI0LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woMiw0NiUsNDIlKSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2IiBmaWxsPSJ1cmwoI2c5KSIvPjxwYXRoIGQ9Ik0wIDMwOSBMMjAwIDI1OSBMMzgwIDI5NiBMNjQwIDI0OSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDE2NCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg==',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imc1OSIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iaHNsKDU0LDUyJSw3NCUpIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJoc2woOTIsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnNTkpIi8+PHBhdGggZD0iTTAgMzE5IEwyMDAgMzA5IEwzODAgMjc2IEw2NDAgMjQ5IEw2NDAgNDI2IEwwIDQyNiBaIiBmaWxsPSJoc2woMjU0LDMwJSwyMiUpIiBvcGFjaXR5PSIwLjgyIi8+PC9zdmc+',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDI2Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImcxMDkiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9ImhzbCgxNDQsNTIlLDc0JSkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImhzbCgxODIsNDYlLDQyJSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQyNiIgZmlsbD0idXJsKCNnMTA5KSIvPjxwYXRoIGQ9Ik0wIDMyOSBMMjAwIDI5OSBMMzgwIDI4NiBMNjQwIDI0OSBMNjQwIDQyNiBMMCA0MjYgWiIgZmlsbD0iaHNsKDM0NCwzMCUsMjIlKSIgb3BhY2l0eT0iMC44MiIvPjwvc3ZnPg=='
    ],
    others: 0
  }
];
