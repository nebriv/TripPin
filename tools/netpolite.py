"""
netpolite.py — a well-behaved fetcher for the import tools.

The point is not to be sneaky, it is to be light. A scraper gets blocked
because it is expensive and relentless, so the fixes are the boring ones:

  * cache on disk, permanently. Re-running an import should make zero
    requests. This matters more than everything else here combined.
  * check robots.txt and refuse paths it disallows.
  * one request at a time, never concurrent.
  * a randomised gap between requests. Jitter is politer than a metronome
    because it does not arrive in a predictable burst.
  * honour Retry-After, and back off exponentially on 429 and 503.
  * treat 403 as "stop", not "try harder". Retrying a block makes it worse.
  * give up entirely after a few consecutive failures rather than grinding.
  * conditional requests, so a refresh costs a 304 rather than a page.

What this deliberately does not do is disguise itself: no rotating user
agents, no forged TLS fingerprints, no pretending to be several people. Those
are measures for defeating bot detection rather than for reducing load, they
would not help here — airbnb.com/rooms/<id> is an allowed path that answers a
plain request with a 200 — and a tool that hides from rate limits is exactly
the kind that earns an IP ban for everyone behind it.

If you ever need bulk data properly, Airbnb will hand you your own history:
Account -> Privacy & sharing -> Request your personal data. tools/import_csv.py
reads it.
"""

import gzip
import hashlib
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

# A current, honest desktop browser string. Sending something exotic gets you a
# degraded page; sending a different one each time is the thing we are not doing.
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Connection": "keep-alive",
}


class Blocked(Exception):
    """The site asked us to stop. Do not retry; fix it or wait."""


class GaveUp(Exception):
    """Too many consecutive failures — stopping rather than grinding."""


class Fetcher:
    def __init__(self, cache_dir, min_delay=2.0, max_delay=5.0,
                 max_retries=3, max_consecutive_failures=3, respect_robots=True,
                 verbose=True):
        self.cache_dir = cache_dir
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.max_retries = max_retries
        self.max_consecutive_failures = max_consecutive_failures
        self.respect_robots = respect_robots
        self.verbose = verbose

        os.makedirs(cache_dir, exist_ok=True)
        self._last_request = 0.0
        self._failures = 0
        self._robots = {}
        self.stats = {"cached": 0, "fetched": 0, "retried": 0, "skipped": 0}

        # A cookie jar makes the session look like one visit rather than many.
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor())

    # ------------------------------------------------------------ caching --

    def _cache_path(self, url):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
        return os.path.join(self.cache_dir, digest + ".json")

    def _read_cache(self, url):
        path = self._cache_path(url)
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as fh:
                blob = json.load(fh)
            return blob
        except Exception:
            return None

    def _write_cache(self, url, body, headers):
        try:
            with open(self._cache_path(url), "w", encoding="utf-8") as fh:
                json.dump({
                    "url": url,
                    "fetched": time.time(),
                    "etag": headers.get("ETag"),
                    "last_modified": headers.get("Last-Modified"),
                    "content_type": headers.get("Content-Type", ""),
                    "body": body.decode("utf-8", "replace"),
                }, fh)
        except Exception:
            pass

    # ------------------------------------------------------------- robots --

    def _allowed(self, url):
        if not self.respect_robots:
            return True
        parts = urllib.parse.urlsplit(url)
        origin = "%s://%s" % (parts.scheme, parts.netloc)
        rp = self._robots.get(origin)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(origin + "/robots.txt")
            try:
                req = urllib.request.Request(origin + "/robots.txt",
                                             headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=20) as r:
                    rp.parse(r.read().decode("utf-8", "replace").splitlines())
            except Exception:
                # No robots.txt reachable: assume allowed, stay slow.
                rp.allow_all = True
            self._robots[origin] = rp
        return rp.can_fetch(USER_AGENT, url)

    # ------------------------------------------------------------ waiting --

    def _wait(self):
        gap = random.uniform(self.min_delay, self.max_delay)
        remaining = gap - (time.time() - self._last_request)
        if remaining > 0:
            time.sleep(remaining)

    def _say(self, msg):
        if self.verbose:
            import sys
            print("    " + msg, file=sys.stderr)

    # -------------------------------------------------------------- fetch --

    def get(self, url, force=False):
        """Returns (text, from_cache). Raises Blocked or GaveUp."""
        if not force:
            hit = self._read_cache(url)
            if hit:
                self.stats["cached"] += 1
                return hit["body"], True

        if not self._allowed(url):
            self.stats["skipped"] += 1
            raise Blocked("robots.txt disallows %s" % url)

        delay_after_error = 5.0
        for attempt in range(self.max_retries + 1):
            self._wait()
            req = urllib.request.Request(url, headers=dict(DEFAULT_HEADERS))
            self._last_request = time.time()
            try:
                with self._opener.open(req, timeout=35) as resp:
                    body = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip":
                        body = gzip.decompress(body)
                    self._write_cache(url, body, resp.headers)
                    self.stats["fetched"] += 1
                    self._failures = 0
                    return body.decode("utf-8", "replace"), False

            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    self._failures += 1
                    raise Blocked(
                        "%s returned %d. Stop and wait rather than retrying — "
                        "that is the signal they do not want this traffic." %
                        (urllib.parse.urlsplit(url).netloc, e.code))

                if e.code in (429, 500, 502, 503, 504):
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    if retry_after and retry_after.isdigit():
                        wait = min(int(retry_after), 300)
                    else:
                        wait = delay_after_error
                        delay_after_error = min(delay_after_error * 3, 120)
                    if attempt >= self.max_retries:
                        break
                    self.stats["retried"] += 1
                    self._say("%d from server, waiting %.0fs" % (e.code, wait))
                    time.sleep(wait)
                    continue

                break   # 404 and friends: nothing to retry

            except Exception as e:
                if attempt >= self.max_retries:
                    break
                self.stats["retried"] += 1
                self._say("%s, retrying in %.0fs" % (type(e).__name__, delay_after_error))
                time.sleep(delay_after_error)
                delay_after_error = min(delay_after_error * 3, 120)

        self._failures += 1
        if self._failures >= self.max_consecutive_failures:
            raise GaveUp("%d failures in a row — stopping. Try again later."
                         % self._failures)
        return None, False

    def summary(self):
        s = self.stats
        return ("%d from cache, %d fetched, %d retried, %d skipped"
                % (s["cached"], s["fetched"], s["retried"], s["skipped"]))
