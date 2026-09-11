"""
jsdata.py — read and write the JS object literals in src/stays.js.

stays.js is a hand-editable JavaScript file, so the importers have to be able
to read one back without executing it. Everything here is string- and
comment-aware, because the naive versions break on real data:

  * an apostrophe inside a comment ("a stay's booker") opens a string that
    never closes, and the brace counter runs off the end of the file
  * a "//" inside a photo URL looks like the start of a line comment
  * data: URIs are enormous single-token strings

Used by import_csv.py, import_trips.py and import_url.py.
"""

import json
import os
import re

__all__ = ["read_stays_file", "write_stays_file", "js_value", "ordered",
           "slug", "ORDER"]


# ------------------------------------------------------------------ reading --

_QUOTES = "\"'`"


def _skip_string(src, i):
    """i points at the opening quote; returns the index just past the close."""
    q, n = src[i], len(src)
    i += 1
    while i < n:
        if src[i] == "\\":
            i += 2
            continue
        if src[i] == q:
            return i + 1
        i += 1
    return n


def _skip_comment(src, i):
    """i points at '/'; returns the index just past the comment, or None."""
    n = len(src)
    if i + 1 >= n:
        return None
    if src[i + 1] == "/":
        j = src.find("\n", i)
        return n if j == -1 else j
    if src[i + 1] == "*":
        j = src.find("*/", i + 2)
        return n if j == -1 else j + 2
    return None


def slice_literal(src, start):
    """The complete [...] or {...} literal beginning at src[start]."""
    depth, i, n = 0, start, len(src)
    while i < n:
        c = src[i]
        if c in _QUOTES:
            i = _skip_string(src, i)
            continue
        if c == "/":
            j = _skip_comment(src, i)
            if j is not None:
                i = j
                continue
        if c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    return None


def strip_comments(text):
    """Remove comments, leaving string contents untouched."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c in _QUOTES:
            j = _skip_string(text, i)
            out.append(text[i:j])
            i = j
            continue
        if c == "/":
            j = _skip_comment(text, i)
            if j is not None:
                i = j
                continue
        out.append(c)
        i += 1
    return "".join(out)


_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
            "'": "'", '"': '"', "\\": "\\", "/": "/", "\n": ""}


def _sq_to_json(m):
    """A single-quoted JS string -> a JSON one, resolving escapes properly."""
    body, out, i, n = m.group(1), [], 0, len(m.group(1))
    while i < n:
        if body[i] == "\\" and i + 1 < n:
            nxt = body[i + 1]
            if nxt == "u" and i + 5 < n:
                try:
                    out.append(chr(int(body[i + 2:i + 6], 16)))
                    i += 6
                    continue
                except ValueError:
                    pass
            out.append(_ESCAPES.get(nxt, nxt))
            i += 2
        else:
            out.append(body[i])
            i += 1
    return json.dumps("".join(out))


def js_to_python(text):
    """Parse a JS array/object literal that is JSON apart from JS quoting."""
    t = strip_comments(text)
    t = re.sub(r"'((?:[^'\\]|\\.)*)'", _sq_to_json, t)          # single quotes
    t = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', t)  # bare keys
    t = re.sub(r",(\s*[\]}])", r"\1", t)                        # trailing commas
    try:
        return json.loads(t)
    except Exception as e:
        raise SystemExit(
            "could not parse a literal in stays.js (%s).\n"
            "Move the file aside and re-import, or fix it by hand." % e)


def read_stays_file(path):
    """Returns (crew, stays, settings_literal_or_None)."""
    if not os.path.exists(path):
        return [], [], None
    src = open(path, encoding="utf-8").read()

    def grab(var, opener):
        m = re.search(r"window\.%s\s*=\s*\%s" % (var, opener), src)
        if not m:
            return None
        return slice_literal(src, m.end() - 1)

    crew_lit = grab("CREW", "[")
    stays_lit = grab("STAYS", "[")
    return (js_to_python(crew_lit) if crew_lit else [],
            js_to_python(stays_lit) if stays_lit else [],
            grab("SETTINGS", "{"))


# ------------------------------------------------------------------ writing --

def quote_js(s):
    return "'" + (str(s).replace("\\", "\\\\").replace("'", "\\'")
                  .replace("\n", "\\n").replace("\r", "")) + "'"


def js_value(v, ind=""):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        v = round(v, 6)
        return str(int(v)) if v == int(v) else repr(v)
    if isinstance(v, int):
        return repr(v)
    if isinstance(v, str):
        return quote_js(v)
    if isinstance(v, list):
        if not v:
            return "[]"
        if all(isinstance(x, str) for x in v) and len("".join(v)) < 68:
            return "[" + ", ".join(quote_js(x) for x in v) + "]"
        return ("[\n" + ",\n".join(ind + "  " + js_value(x, ind + "  ") for x in v)
                + "\n" + ind + "]")
    if isinstance(v, dict):
        return ("{\n" + ",\n".join(
            ind + "  " + (k if re.match(r"^[A-Za-z_$][\w$]*$", k) else quote_js(k))
            + ": " + js_value(v[k], ind + "  ") for k in v) + "\n" + ind + "}")
    return "null"


ORDER = ["id", "title", "type", "guests", "bedrooms", "beds", "baths", "amenities",
         "price", "rating", "reviews", "quote", "quoteBy", "booker", "crew",
         "lat", "lng", "place", "when", "nights", "story", "alsoThere", "photo",
         "source"]


def ordered(stay):
    out = {k: stay[k] for k in ORDER if k in stay}
    out.update({k: v for k, v in stay.items() if k not in out})
    return out


def slug(s):
    return (re.sub(r"[^a-z0-9]+", "-", (s or "stay").lower()).strip("-")[:44]
            or "stay")


HEADER = """/* ===========================================================================
   stays.js — the game's data. Safe to edit by hand.

   SETTINGS  the entry word and share link
   CREW      the people whose trip lists feed the game
   STAYS     one entry per place. `booker` is whose list it came from, which
             is exactly what players are asked to name.

   Regenerate with tools/import_trips.py, or edit visually in editor.html.
   =========================================================================== */

"""


def write_stays_file(path, crew, stays, settings=None):
    parts = [HEADER]
    if settings:
        parts.append("window.SETTINGS = " + settings + ";\n\n")
    parts.append("window.CREW = " + js_value(crew) + ";\n\n")
    parts.append("window.STAYS = " + js_value([ordered(s) for s in stays]) + ";\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("".join(parts))
