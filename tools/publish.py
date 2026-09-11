"""
publish.py — push src/stays.js up to the Worker's pooled deck.

The deployed game reads its stays from the gated API, not from the page, so
the page can ship with no data in it. This is what puts the data where the
game can find it.

Photos are sent as CDN links rather than embedded data URIs: the local file
keeps the embedded copies (the Claude Artifact build needs them, since its CSP
blocks third-party images), but a 5 MB KV value helps nobody.

    export TRIPPIN_ENTRY_KEY=...   # the group word; --key overrides
    export TRIPPIN_PASSCODE=...    # the owner's passcode; --pass overrides
    export TRIPPIN_ADMIN_KEY=...   # admin word; writes without a passcode
    python tools/publish.py --url https://trippin.<sub>.workers.dev
    python tools/publish.py ... --owner player1      # just one person's stays

Standard library only.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsdata import read_stays_file                              # noqa: E402


def slim(stay):
    """Swap embedded photos for links and drop fields the server ignores."""
    out = dict(stay)

    # photos[] are already CDN links; photoSource is the original trip-card URL.
    links = [p for p in (out.get("photos") or []) if str(p).startswith("http")]
    if links:
        out["photo"] = links[0]
    elif str(out.get("photo", "")).startswith("data:"):
        src = out.get("photoSource")
        out["photo"] = (src + "?im_w=720") if src else None

    out.pop("photoSource", None)
    out.pop("source", None)
    return out


# Cloudflare's bot filter rejects urllib's default agent with a 1010 before
# the request ever reaches the Worker.
HEADERS = {
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/140.0.0.0 Safari/537.36",
    "accept": "application/json",
}


def auth_headers(args):
    """What every request carries.

    Built in one place because it was not: the stays POST is assembled
    inline further down, and when --admin was added here only, that one
    kept sending no admin word and kept being refused.
    """
    return dict(HEADERS, **{
        "x-trippin-key": args.key,
        "x-trippin-pass": urllib.parse.quote(args.passcode or "", safe=""),
        "x-trippin-admin": args.admin or "",
    })


def post(args, path, payload):
    """POST some JSON. Returns (status, body-ish) and never raises for HTTP."""
    req = urllib.request.Request(
        args.url.rstrip("/") + path,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers=auth_headers(args),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--url", required=True, help="the Worker's base URL")
    ap.add_argument("--key", default=os.environ.get("TRIPPIN_ENTRY_KEY"),
                    help="ENTRY_KEY, the group word. Defaults to "
                         "$TRIPPIN_ENTRY_KEY, so it stays out of the repo.")
    ap.add_argument("--pass", dest="passcode",
                    default=os.environ.get("TRIPPIN_PASSCODE"),
                    help="the passcode for --owner, or $TRIPPIN_PASSCODE. Every owner you publish "
                         "must be claimed and must share this passcode, so in "
                         "practice publish one owner at a time.")
    ap.add_argument("--admin", default=os.environ.get("TRIPPIN_ADMIN_KEY"),
                    help="ADMIN_KEY, or $TRIPPIN_ADMIN_KEY. Writes any "
                         "owner's stays without that owner's passcode, "
                         "which is how a deck gets seeded before anybody "
                         "has claimed a name.")
    ap.add_argument("--claim", action="store_true",
                    help="claim the owner with --pass if nobody has yet")
    ap.add_argument("--owner", help="only publish this person's stays")
    ap.add_argument("--stays", default=os.path.join(here, "src", "stays.js"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.key:
        print("No group word. Pass --key or set $TRIPPIN_ENTRY_KEY.",
              file=sys.stderr)
        return 2

    if not args.passcode and not args.admin and not args.dry_run:
        print("A passcode is needed now: each name is claimed by one person.\n"
              "  --pass <passcode>           if you have already claimed it\n"
              "  --pass <passcode> --claim   to claim it for the first time\n"
              "  --admin <admin word>        to write without one",
              file=sys.stderr)
        return 2

    crew, stays, _ = read_stays_file(args.stays)
    owners = sorted({s.get("booker") or s.get("owner") for s in stays} - {None})
    if args.owner:
        owners = [args.owner]

    print("crew: %s" % ", ".join(p["id"] for p in crew), file=sys.stderr)

    for owner in owners:
        if args.claim and not args.dry_run:
            code, detail = post(args, "/api/claim",
                                {"owner": owner, "pass": args.passcode})
            if code == 200:
                print("  %-10s claimed" % owner, file=sys.stderr)
            elif code == 409:
                pass                       # already claimed; the passcode decides
            else:
                print("  %-10s claim failed: HTTP %s %s" % (owner, code, detail),
                      file=sys.stderr)
                return 1

        mine = [slim(s) for s in stays
                if (s.get("booker") or s.get("owner")) == owner]
        if not mine:
            continue
        body = json.dumps({"owner": owner, "crew": crew, "stays": mine}).encode("utf-8")
        print("  %-10s %3d stays, %.0f KB" % (owner, len(mine), len(body) / 1024),
              file=sys.stderr)
        if args.dry_run:
            continue

        req = urllib.request.Request(
            args.url.rstrip("/") + "/api/stays",
            data=body,
            method="POST",
            headers=auth_headers(args),
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                res = json.load(r)
            print("             -> added %d, replaced %d, pool now %d"
                  % (res.get("added", 0), res.get("replaced", 0), res.get("total", 0)),
                  file=sys.stderr)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            print("             -> HTTP %d %s" % (e.code, detail), file=sys.stderr)
            return 1

    if args.dry_run:
        print("\ndry run - nothing sent", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
