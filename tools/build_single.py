"""
build_single.py — squash the game into one HTML file.

Everything except the Google Fonts link gets inlined: the CSS, the map data,
the code and your stays with their photos. The result is a single file you can
email, drop on any static host, or open by double-clicking with no server.

    python tools/build_single.py

Writes two things:

  dist/index.html               the game, one self-contained file
  dist/editor.html              the stay editor, likewise
  build/trippin.artifact.html   the same game page without the document
                                wrapper, for publishing as a Claude Artifact

Standard library only.
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsdata import read_stays_file  # noqa: E402


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def guard_js(js):
    """A literal </script> inside the code would close the tag early."""
    return js.replace("</script", "<\\/script")


def stays_stub(stays_path):
    """Just the settings block: no crew, no stays, no photos, no word.

    The deployed game reads its deck from the gated API, so the page it is
    served from should carry no data at all.

    The word goes too. It lives in src/stays.js so the offline copy can open
    without one, but shipping it here would put it in view-source on the
    public URL, which would make the gate decorative. The deployed page gets
    the word from the share link or from the player typing it, and the server
    is what decides whether it is right.
    """
    _, _, settings = read_stays_file(stays_path)
    kept = {}
    for name in ("shareUrl",):
        hit = re.search(
            r"\b%s\s*:\s*(?P<q>['\"])(?P<v>.*?)(?P=q)" % name, settings or "")
        if hit:
            kept[name] = hit.group("v")
    # Rebuilt from scratch rather than filtered, so nothing from stays.js can
    # ride along by accident — not the word, and not the comments about it.
    body = ", ".join("%s: %r" % (k, v) for k, v in sorted(kept.items()))
    return chr(10).join([
        "/* Deployed build: the deck lives behind the API, not in this file,",
        "   and neither does the word - the server is what checks it. */",
        "window.SETTINGS = {" + body + "};",
        "window.CREW = [];",
        "window.STAYS = [];",
    ])


def inline(html, root, substitute=None):
    missing = []
    substitute = substitute or {}

    def css(m):
        href = m.group(1)
        if href.startswith(("http://", "https://", "//")):
            return m.group(0)
        p = os.path.join(root, href)
        if not os.path.exists(p):
            missing.append(href)
            return m.group(0)
        return "<style>\n/* %s */\n%s\n</style>" % (href, read(p))

    def js(m):
        src = m.group(1)
        if src.startswith(("http://", "https://", "//")):
            return m.group(0)
        p = os.path.join(root, src)
        if not os.path.exists(p):
            missing.append(src)
            return m.group(0)
        body = substitute[src] if src in substitute else read(p)
        return "<script>\n/* %s */\n%s\n</script>" % (src, guard_js(body))

    html = re.sub(r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>',
                  css, html, flags=re.I)
    html = re.sub(r'<script[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>',
                  js, html, flags=re.I)

    if missing:
        raise SystemExit("could not find: " + ", ".join(missing))
    return html


def strip_document_wrapper(html):
    """Artifacts supply their own doctype/head/body, so hand back the inside."""
    head = re.search(r"<head[^>]*>(.*?)</head>", html, re.S | re.I)
    body = re.search(r"<body[^>]*>(.*?)</body>", html, re.S | re.I)
    if not head or not body:
        return html

    keep = []
    for m in re.finditer(r"<title>.*?</title>|<style>.*?</style>|<link[^>]*>",
                         head.group(1), re.S | re.I):
        tag = m.group(0)
        if tag.lower().startswith("<link") and "stylesheet" not in tag.lower():
            continue          # preconnect hints are pointless once inlined
        keep.append(tag)

    body_cls = re.search(r"<body[^>]*class=[\"']([^\"']+)[\"']", html, re.I)
    inner = body.group(1)
    if body_cls:
        # index.html toggles classes on <body>; the artifact has its own, so
        # move ours onto a wrapper the CSS can still see.
        inner = '<div class="%s">%s</div>' % (body_cls.group(1), inner)

    return "\n".join(keep) + "\n" + inner


def build(page, out_dir, name, substitute=None):
    root = os.path.dirname(os.path.abspath(page))
    html = inline(read(page), root, substitute)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return path, html


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--out", default=os.path.join(here, "dist"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    written = []

    index = os.path.join(here, "index.html")
    stays_js = os.path.join(here, "src", "stays.js")

    # The served game ships EMPTY and fetches its deck from the gated API.
    # Otherwise anyone who knows the hostname could curl the HTML and read
    # everybody's travel history without ever needing the word.
    game_path, _ = build(index, args.out, "index.html",
                         substitute={"src/stays.js": stays_stub(stays_js)})
    written.append(game_path)

    # The artifact has no API to call, so that build keeps the data inline.
    _, game_html = build(index, args.out, "_artifact_src.html")

    # import.html is the page friends get. It contains no stays at all.
    imp = os.path.join(here, "import.html")
    if os.path.exists(imp):
        written.append(build(imp, args.out, "import.html")[0])

    # admin.html is counts-and-health only; it holds no stays either.
    adm = os.path.join(here, "admin.html")
    if os.path.exists(adm):
        written.append(build(adm, args.out, "admin.html")[0])

    # editor.html is deliberately NOT built into dist/: it embeds the whole
    # library, so deploying it would hand every visitor everyone's history.
    # Run it locally from the repo instead.

    # Static assets are served by Cloudflare's asset handler without invoking
    # the Worker, so headers for them have to come from a _headers file.
    headers_path = os.path.join(args.out, "_headers")
    with open(headers_path, "w", encoding="utf-8") as fh:
        fh.write(chr(10).join([
            "/*",
            "  X-Robots-Tag: noindex, nofollow, noarchive",
            "  X-Content-Type-Options: nosniff",
            "  Referrer-Policy: no-referrer",
            "  X-Frame-Options: DENY",
            "  Cache-Control: private, no-store",
            "",
        ]))
    written.append(headers_path)

    # Same page again with the document wrapper removed, for Claude Artifacts.
    # Kept out of dist/ so it is not served — and not uploaded — by the Worker.
    art_dir = os.path.join(here, "build")
    os.makedirs(art_dir, exist_ok=True)
    art = os.path.join(art_dir, "trippin.artifact.html")
    with open(art, "w", encoding="utf-8") as fh:
        fh.write(strip_document_wrapper(game_html))
    written.append(art)

    os.remove(os.path.join(args.out, "_artifact_src.html"))

    for p in written:
        print("%-34s %6.0f KB" % (os.path.relpath(p, here), os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
