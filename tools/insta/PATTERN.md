# Instagram post to structured record - the reusable pattern

A migration document. It describes a pipeline that reads a saved Instagram
collection and turns each post into a verified structured record, and how to
retarget it from **scientific articles** (the original) to **restaurants and
venues** (the new app).

Written for someone starting fresh on another machine. Nothing here depends on
the original project's files - it is the method, the hard-won decisions, and the
failure modes that cost real debugging time.

---

## 1. What the pipeline actually is

Five stages. Each one is dumb on its own; the value is in the order and in the
validation step.

```
download  ->  read the image  ->  extract candidate  ->  VALIDATE  ->  act
```

| Stage | Article version | Venue version |
|---|---|---|
| Download | gallery-dl over a saved collection | identical, no change |
| Read | RapidOCR over the first image | identical, no change |
| Extract | DOI regex, else largest-text title | venue name, address, phone |
| **Validate** | **Crossref lookup by DOI/title** | **geocoding / Places lookup** |
| Act | fetch the PDF | save the pin, build the list |

**The validation stage is the whole design.** Everything else is replaceable.
Read section 4 before writing any code.

---

## 2. Stage 1 - downloading a saved collection

### Use gallery-dl, not instaloader

instaloader's `:saved` only reaches the *All posts* bucket. gallery-dl has a
dedicated `collection` extractor that takes a **specific collection URL** and
exposes the fields you actually need as metadata.

```bash
pip install gallery-dl
```

### Config - `gallery-dl.conf`

```json
{
    "extractor": {
        "instagram": {
            "directory": ["{post_shortcode}"],
            "filename": "{num:>02}.{extension}",
            "sleep-request": [2.0, 5.0],
            "postprocessors": [
                { "name": "metadata", "mode": "json" }
            ]
        }
    },
    "downloader": { "http": { "retries": 3, "timeout": 30 } },
    "output": { "mode": "auto", "progress": true }
}
```

Three things matter here:

- `directory: ["{post_shortcode}"]` - one folder per post, named by shortcode.
  The shortcode is your primary key everywhere downstream.
- `metadata / json` postprocessor - writes a JSON sidecar next to every image.
  Without this you get pictures and no context.
- `sleep-request: [2.0, 5.0]` - **do not lower this.** Instagram issues
  temporary account locks for aggressive scraping. Never put this on a
  scheduler; run it by hand, occasionally.

### The command

```python
import shutil, subprocess, sys
from pathlib import Path

def gallery_dl_cmd() -> list[str]:
    """Prefer the console script, fall back to `python -m`."""
    exe = shutil.which("gallery-dl")
    return [exe] if exe else [sys.executable, "-m", "gallery_dl"]

cmd = gallery_dl_cmd() + [
    "--config", "gallery-dl.conf",
    "--destination", "posts",
    "--cookies", "cookies.txt",            # see section 3
    "--download-archive", "archive.sqlite3",
    collection_url,
]
```

`--download-archive` is what makes reruns incremental. A post already in the
archive is skipped entirely, so unsaving a post on Instagram later never causes
a re-download. It also means `--reset-archive` (just delete the file) is your
undo button if you ever delete local copies prematurely.

### Sidecar fields that are confirmed to exist

Verified against gallery-dl 1.32.9 on a real collection:

```
media_id, post_id, post_shortcode, post_url, description, post_date, date,
username, fullname, likes, liked, pinned, tagged_users, display_url,
video_url, width, height, num, count, collection_id, collection_name, type
```

`description` is the caption. `num`/`count` give the carousel position.

---

## 3. Authentication - the part that wastes a day

**`--cookies-from-browser chrome` does not work on modern Chrome.** Chrome 127+
App-Bound Encryption means gallery-dl reads the profile and extracts **0
cookies**, then silently redirects to the login page. Closing Chrome does not
help. This is not a bug you can fix.

### What works: exported cookies.txt

1. Install the **Get cookies.txt LOCALLY** extension (open source, exports
   locally, uploads nothing).
2. Open `https://www.instagram.com` while logged in.
3. Click the extension, Export in **Netscape** format, save as `cookies.txt`.
4. Run with `--cookies cookies.txt`. Chrome may stay open.

### Validate the file before trusting it

```python
# First line must be: # Netscape HTTP Cookie File
# Must contain a `sessionid` row for .instagram.com - that IS the credential.
```

A file without `sessionid` will fail with a login redirect that looks like a
different problem entirely.

`cookies.txt` is a live credential. Never commit it. Re-export when runs start
redirecting to the login page - that means the session expired.

### Detecting the failure clearly

```python
COOKIE_LOCK_HINTS = ("could not copy", "database is locked",
                     "unable to read", "permission denied")

blob = " ".join(gallery_dl_output_lines).lower()
if any(h in blob for h in COOKIE_LOCK_HINTS) or "login page" in blob:
    raise SystemExit("Session expired or unreadable - re-export cookies.txt.")
```

---

## 4. Stage 2 - reading the image

### Use local OCR, not a vision model API

The original project started by reading images inside an LLM session. That
capped throughput at ~8 images per turn and required a human present for every
one. 269 images took hours of turn-taking.

**RapidOCR** replaced it: local, free, no API key, no network, ~7-10 s per
image. The full backlog ran unattended in 24 minutes.

```bash
pip install rapidocr-onnxruntime
```

```python
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()
result, _ = ocr("posts/ABC123/01.jpg")
# result is a list of [box, text, confidence]
#   box  = 4 corner points [[x,y], ...]
#   text = recognised string
boxes = result or []
text  = " ".join(b[1] for b in boxes)
```

### Measured accuracy on the original corpus

- 6 of 6 known DOIs matched **exactly**
- 0 false positives across 5 images containing no DOI at all
- Titles correctly recovered on all 3 title-only test cases

This should transfer well to restaurant posts: menu boards, shopfront signage
and address cards are also large, clean, printed text. It transfers **badly** to
handwritten chalkboards and heavy stylised script - expect those to fail, and
plan for the human fallback.

### The box-height trick for finding the headline

OCR gives you text plus geometry. The biggest text on the page is usually the
thing the image is *about* - an article title, or a restaurant name.

```python
def box_height(b) -> float:
    ys = [p[1] for p in b[0]]
    return max(ys) - min(ys)

ranked   = sorted(usable_boxes, key=box_height, reverse=True)
tallest  = box_height(ranked[0])
# merge same-size neighbours: a wrapped headline comes back as several boxes
lines = [b[1].strip() for b in usable_boxes if box_height(b) >= tallest * 0.85]
headline = " ".join(lines).strip()
```

---

## 5. The three guards - do not skip these

Each one exists because the naive version shipped a real, silent defect.

### Guard 1 - noise filter on "largest text"

The biggest text on a page is frequently **not** the content. On journal
screenshots it was publisher download stamps running the full page width:

```
Downloadedfromhttp://ahajournals.orgbymaria@bibliovirtual.es
```

```python
import re

TITLE_NOISE = re.compile(
    r"downloaded\s*from|www\.|https?:|@|\.com|\.org"
    r"|all\s*rights\s*reserved|check\s*for\s*updates"
    r"|follow\s*us|link\s*in\s*bio|swipe|tag\s*a\s*friend",
    re.I,
)

usable = [b for b in boxes
          if len(b[1].strip()) >= 3 and not TITLE_NOISE.search(b[1])]
```

**For the venue app**, extend this list with: `instagram.com`, `@`-handles,
`#hashtags`, `DM for`, `reservations via`, `open daily`, delivery-app names,
watermark text from reposting apps.

### Guard 2 - minimum length, so fragments never reach the validator

```python
MIN_CHARS, MIN_WORDS, MAX_CHARS = 25, 4, 300
if len(headline) < MIN_CHARS or len(headline) > MAX_CHARS: return None
if len(headline.split()) < MIN_WORDS: return None
```

Tune these down for venues - restaurant names are short ("Noma", "Osteria
Francescana"). Perhaps `MIN_CHARS = 3, MIN_WORDS = 1`. **But if you relax
these, Guard 3 becomes mandatory, not optional.**

### Guard 3 - similarity check on the validator's answer

**This is the most important guard in the document.**

The article version called a Crossref title search that returns its **top hit
with no score and no floor**. Hand it a three-word fragment and it returns a
real, well-formed, confidently wrong paper. Nothing downstream would ever
question it.

Actual rejections this guard caught in production:

| OCR read | What the API confidently returned |
|---|---|
| `NEJM PAPERS YOU CAN'T MISS` | *Things You Can Try: Don't miss the train* |
| `Why Would anyone Choose to work in an ICU?` | *Why Students Choose Social Work?* |
| `Consensus on the Use of Lung` | *Biologics Use in Eosinophilic Lung Disease* |

```python
def title_matches(wanted: str, returned: str, threshold: float = 0.55) -> bool:
    """Is what the API returned actually the thing we searched for?"""
    if not wanted or not returned:
        return False

    def words(t: str) -> set[str]:
        # drop short words - they inflate overlap between unrelated strings
        return {w for w in re.findall(r"[a-z0-9]+", t.lower()) if len(w) > 3}

    a, b = words(wanted), words(returned)
    if not a or not b:
        return False
    # a ratio alone is not enough: a 3-word fragment scores a perfect 1.0
    if len(a) < 4:
        return False
    # scored against the smaller set, so a truncated-but-correct read still passes
    return len(a & b) / min(len(a), len(b)) >= threshold
```

Verified behaviour: accepts exact matches, OCR-noisy reads
(`"...ultrasound Springer"`), and truncated prefixes. Rejects fragments,
watermarks, and unrelated papers.

**For venues the equivalent guard is geographic, and the word-overlap version is
too weak.** Validate a Places/geocoding hit by:

1. Name similarity (the function above, with a lower word floor)
2. **Distance** - if the post has geotag coordinates, reject a hit more than a
   few hundred metres away
3. City/region agreement between the OCR'd address and the returned address

"Joe's Pizza" returns hundreds of results worldwide. Name alone will pick the
wrong one with total confidence.

---

## 6. The repair step - OCR fails in predictable ways

Three failure modes were observed repeatedly. Only the first is repairable.

| Failure | Example | Fix |
|---|---|---|
| Welds adjacent text onto the value | `10.1164/rccm.202411-2165ClonApril16,2025` | retry progressively shorter prefixes |
| Transposes a digit | `16600617` for `16000617` | unrepairable - fall through to name search |
| Truncates mid-string | `10.1136/heartjnl-2025-` | unrepairable - fall through to name search |

```python
def value_variants(raw: str) -> list[str]:
    """Candidate repairs for a value OCR ran into surrounding text."""
    seen, out = set(), []
    def add(c: str) -> None:
        c = c.strip().rstrip(".,;:)]}")
        if c and c not in seen and len(c) > 8:
            seen.add(c); out.append(c)

    add(raw)
    # cut where lowercase meets a capital: "...2165ClonApril" -> "...2165"
    for m in re.finditer(r"(?<=[a-z0-9])(?=[A-Z])", raw):
        add(raw[: m.start()])
    # cut at punctuation that rarely ends a real value
    for sep in (",", ";", " ", ")", "("):
        if sep in raw:
            add(raw.split(sep)[0])
    # cut where digits give way to letters: the "2025on" seam
    for m in re.finditer(r"(?<=\d)(?=[A-Za-z]{2,})", raw):
        add(raw[: m.start()])
    return out
```

Try each in order against the validator. **A wrong guess cannot survive** - it
simply fails lookup like the original did. That property is what makes
aggressive repair safe.

**For venues**, the analogous repair targets are phone numbers and postcodes,
both of which have checkable formats. A postcode that does not match the city
is a repair signal, not a result.

---

## 7. The state machine - why a manifest beats a spreadsheet

One JSON file, one entry per post, keyed by shortcode. Status is **derived**,
never stored, so the manifest is self-consistent even if a stage is rerun or
interrupted.

```python
def status_for(entry: dict) -> str:
    if entry.get("record"):                       # validated result attached
        return "resolved"
    has_candidate = any(entry.get(k) for k in
                        ("name_from_caption", "name_from_image",
                         "address_from_image"))
    if has_candidate:
        return "failed_lookup" if entry.get("lookup_failed") else "ready_to_resolve"
    return "no_identifier" if entry.get("ocr_checked") else "needs_ocr"
```

| Status | Meaning |
|---|---|
| `needs_ocr` | caption had nothing; image not read yet |
| `ready_to_resolve` | has a candidate, waiting for validation |
| `resolved` | validated record attached (terminal) |
| `no_identifier` | image was read, genuinely contains no venue (terminal) |
| `failed_lookup` | had a candidate, validator found nothing (clearable, retryable) |

**`ocr_checked` is the critical flag.** It is what separates "not looked at yet"
from "looked at, nothing there". Without it, a post containing no venue gets
re-queued forever on every run.

### Ownership discipline

`scan_posts()` refreshes download-derived fields on every run but **never**
overwrites fields owned by later stages:

```python
entry.update(download_fields)          # shortcode, url, caption, images, date
for key in ("name_from_image", "address_from_image", "record"):
    entry.setdefault(key, None)        # create once, never clobber
entry.setdefault("ocr_checked", False)
entry["status"] = status_for(entry)
```

Get this wrong and a re-download silently wipes hours of OCR work.

---

## 8. The human confirmation step

Emit a CSV with a blank action column. The human marks it in Excel. The next
stage reads the marks back.

```
action,shortcode,status,name,address,city,phone,post_url
,ABC123,resolved,,...
```

Two conventions worth copying verbatim:

- **Marks survive regeneration.** The resolver rewrites the CSV every run but
  reads existing marks first and carries them across, so re-running after a new
  download does not blank a column the human spent time on.
- **A deleted row means "I handled this myself."** Compare CSV shortcodes against
  the manifest; anything missing gets flagged `handled_manually` and is treated
  as finished. This turned out to be a very natural way for a human to express
  "done, stop showing me this".

Excel takes an exclusive lock on an open CSV. Catch `PermissionError` and print
an instruction, not a traceback - this will happen constantly.

```python
try:
    write_csv(rows)
except PermissionError:
    raise SystemExit(
        f"\n{CSV.name} is open in Excel and cannot be written.\n"
        "Close it and run again. Your marks are safe - nothing was changed."
    )
```

---

## 9. Cleanup, and the safety property that makes it safe

Deleting local post folders after a record is confirmed keeps the working
directory small (261 MB freed over 276 posts in the original).

**The deletion is only safe because nothing has been unsaved on Instagram.** The
posts are still in the collection, so deleting the archive and re-running brings
any of them back. Once you start unsaving posts, that net disappears and
deletion becomes irreversible. Do not automate both in the same run.

A defect worth inheriting the fix for: cleanup derived the folder path from the
post's first *image*, so **video-only posts were skipped forever** - they carry
`images: []`. An empty image list is a real state, not an error.

```python
images = entry.get("images") or []
folder = (BASE / images[0]).parent if images else POSTS_DIR / entry["shortcode"]
```

---

## 10. Do not automate un-saving

The original explicitly refused to build this, and the reasoning holds.

gallery-dl is read-only. Removing a post from a saved collection requires
writing through Instagram's private API via an unofficial library. **Automated
write actions are the specific thing that triggers temporary account locks and
bans.** Instagram does not distinguish a careful script from a careless one.

Produce a checklist file of URLs and let the human do it. Gate that list on the
record having actually reached its destination, not merely on extraction
succeeding - otherwise you invite the user to delete the only copy of something
that never got saved.

---

## 11. Dependencies

```
gallery-dl>=1.32.9
rapidocr-onnxruntime>=1.2.3
requests>=2.31.0
```

Plus, for the venue app, one geocoding or Places client. Whichever you pick,
confirm it returns a **confidence or match score** - if it only ever returns a
top hit, Guard 3 is doing all the work by itself.

---

## 12. Suggested build order

1. Download + manifest + status machine. Verify sidecar field names against a
   real run before building on them.
2. OCR + headline extraction, with Guards 1 and 2. Test against ~10 posts you
   have read with your own eyes, and **count exact matches** - that number is
   your baseline.
3. Validation + Guard 3 + repair. Deliberately feed it a fragment and confirm it
   rejects rather than invents.
4. CSV + human marking.
5. Cleanup, last, and only once 1-4 are trustworthy.

### The one-line summary

Extraction is cheap and unreliable; validation is what makes the output
trustworthy. Build the validator first and let it tell you how good the
extractor needs to be.
