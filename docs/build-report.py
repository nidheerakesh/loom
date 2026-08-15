#!/usr/bin/env python3
"""Render docs/PROGRESS.md to a submission-ready PDF and DOCX.

    python3 docs/build-report.py                 # both, into docs/build/
    python3 docs/build-report.py --pdf           # just the PDF
    python3 docs/build-report.py --images DIR    # take screenshots from DIR

Images are embedded as data URIs, so the PDF and DOCX are self-contained and survive being
emailed or uploaded. A screenshot that is referenced but missing renders as a labelled
placeholder carrying its filename rather than a broken-image icon — the document stays
readable, and it says exactly what still has to be captured.

Needs: python3-markdown, Google Chrome (PDF), LibreOffice (DOCX). All three are already on
this machine; none is a project dependency, because this runs by hand before a submission
rather than in the build.
"""

import argparse
import base64
import mimetypes
import re
import shutil
import subprocess
import sys
from pathlib import Path

import markdown

DOCS = Path(__file__).resolve().parent
SRC = DOCS / "PROGRESS.md"
OUT = DOCS / "build"

# Malayalam has to resolve to a font that actually carries the script. Chrome falls back to
# boxes otherwise, which would silently gut the one claim the screenshots exist to support.
CSS = """
@page { size: A4; margin: 18mm 16mm; }
:root { --ink:#1c1c1c; --indigo:#26364F; --soft:#5a6a80; --rule:#d8d2c4; --cotton:#F7F4ED; }
* { box-sizing: border-box; }
body {
  font-family: "Source Serif 4", Georgia, "Liberation Serif", serif;
  font-size: 10.5pt; line-height: 1.5; color: var(--ink);
  margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
:lang(ml), .ml { font-family: "Manjari", "Gayathri", "Lohit Malayalam", "Noto Sans Malayalam", sans-serif; }
h1, h2, h3, h4 {
  font-family: "Inter", "Liberation Sans", system-ui, sans-serif;
  color: var(--indigo); line-height: 1.25; margin: 1.4em 0 .5em;
}
h1 { font-size: 23pt; margin-top: 0; letter-spacing: -.01em; }
h2 { font-size: 15pt; border-bottom: 2px solid var(--rule); padding-bottom: .25em; page-break-after: avoid; }
h3 { font-size: 12pt; page-break-after: avoid; }
h2 + p, h3 + p { margin-top: .3em; }
p { margin: .55em 0; orphans: 3; widows: 3; }
strong { color: var(--indigo); }
a { color: var(--indigo); text-decoration: none; border-bottom: 1px solid var(--rule); }
code {
  font-family: "JetBrains Mono", "DejaVu Sans Mono", monospace; font-size: 8.6pt;
  background: var(--cotton); padding: .1em .35em; border-radius: 3px;
}
pre {
  background: var(--cotton); border: 1px solid var(--rule); border-left: 3px solid var(--indigo);
  border-radius: 4px; padding: .7em .9em; overflow-x: auto; page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8pt; line-height: 1.45; }
blockquote {
  margin: .9em 0; padding: .55em .9em; background: var(--cotton);
  border-left: 3px solid #C9A227; page-break-inside: avoid;
}
blockquote p { margin: .2em 0; }
table {
  width: 100%; border-collapse: collapse; margin: .9em 0; font-size: 9pt;
  page-break-inside: avoid;
}
th, td { border: 1px solid var(--rule); padding: .38em .55em; text-align: left; vertical-align: top; }
th { background: var(--cotton); color: var(--indigo); font-weight: 600; }
tr:nth-child(even) td { background: #fbfaf6; }
ul, ol { margin: .5em 0; padding-left: 1.3em; }
li { margin: .25em 0; }
hr { border: none; border-top: 1px solid var(--rule); margin: 1.6em 0; }
/* Phone captures are twice as tall as they are wide. Constrained by width alone each one
   takes a whole page and pushes its caption onto the next, which separates every screenshot
   from the sentence explaining it. Height is the binding constraint, so bound that: tall
   images shrink to fit beside their text, wide ones still use the width they need. */
img {
  max-width: 74%; max-height: 128mm; width: auto; height: auto; object-fit: contain;
  display: block; margin: .9em auto;
  border: 1px solid var(--rule); border-radius: 6px; page-break-inside: avoid;
}
.missing {
  max-width: 62%; margin: .9em auto; padding: 2.2em 1em; text-align: center;
  border: 2px dashed var(--rule); border-radius: 6px; background: var(--cotton);
  color: var(--soft); font-family: "Inter", sans-serif; font-size: 9pt;
  page-break-inside: avoid;
}
.missing b { display: block; color: var(--indigo); font-size: 10pt; margin-bottom: .3em; }
/* Diagrams carry small type across their whole width, so the phone-screenshot height cap
   would render them unreadable. Marked with {: .wide } in the Markdown. */
img.wide { max-width: 100%; max-height: 215mm; }
"""

MALAYALAM = re.compile(r"[ഀ-ൿ]")


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build_html(images: Path) -> tuple[str, list[str], list[str]]:
    html = markdown.markdown(
        SRC.read_text(encoding="utf-8"),
        extensions=["tables", "fenced_code", "sane_lists", "attr_list", "nl2br"],
    )

    found: list[str] = []
    missing: list[str] = []

    def swap(m: re.Match) -> str:
        before, src, after = m.group(1), m.group(2), m.group(3)
        name = Path(src).name
        # The Obsidian copy of this report keeps its attachments in one shared vault folder,
        # so the same files live there under a `loom-` prefix to avoid colliding with every
        # other note's images. Accept either, and the vault's Assets folder can be pointed at
        # directly with --images.
        for candidate in (images / name, images / f"loom-{name}"):
            if candidate.exists():
                found.append(candidate.name)
                return f'<img{before}src="{data_uri(candidate)}"{after}>'
        missing.append(name)
        return (
            f'<div class="missing"><b>Screenshot not yet captured</b>{name}<br>'
            f"see docs/images/README.md for how to take it</div>"
        )

    html = re.sub(r'<img([^>]*?)src="([^"]+)"([^>]*?)>', swap, html)

    # Tag Malayalam runs so the font stack applies to them and not to the Latin around them.
    html = MALAYALAM.sub(lambda m: m.group(0), html)
    html = re.sub(
        r"([ഀ-ൿ][ഀ-ൿ\s‌‍.,·()]*)",
        r'<span class="ml">\1</span>',
        html,
    )

    doc = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{html}</body></html>"
    return doc, found, missing


def to_pdf(html_path: Path, out: Path) -> bool:
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        print("  ✗ PDF skipped — no Chrome/Chromium on PATH")
        return False
    subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
         f"--print-to-pdf={out}", html_path.as_uri()],
        check=True, capture_output=True,
    )
    return out.exists()


def to_docx(html_path: Path, out: Path) -> bool:
    soffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not soffice:
        print("  ✗ DOCX skipped — no LibreOffice on PATH")
        return False
    subprocess.run(
        [soffice, "--headless", "--convert-to", "docx:MS Word 2007 XML",
         "--outdir", str(out.parent), str(html_path)],
        check=True, capture_output=True,
    )
    produced = out.parent / (html_path.stem + ".docx")
    if produced.exists() and produced != out:
        produced.replace(out)
    return out.exists()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=str(DOCS / "images"), help="where the screenshots live")
    ap.add_argument("--pdf", action="store_true", help="PDF only")
    ap.add_argument("--docx", action="store_true", help="DOCX only")
    args = ap.parse_args()
    both = not (args.pdf or args.docx)

    OUT.mkdir(exist_ok=True)
    doc, found, missing = build_html(Path(args.images).expanduser())
    html_path = OUT / "Loom-Progress-Check-Report.html"
    html_path.write_text(doc, encoding="utf-8")

    print(f"images embedded: {len(found)}")
    if missing:
        print(f"images missing:  {len(missing)}")
        for name in missing:
            print(f"  · {name}")

    if both or args.pdf:
        pdf = OUT / "Loom-Progress-Check-Report.pdf"
        if to_pdf(html_path, pdf):
            print(f"  ✓ {pdf}  ({pdf.stat().st_size // 1024} KB)")
    if both or args.docx:
        docx = OUT / "Loom-Progress-Check-Report.docx"
        if to_docx(html_path, docx):
            print(f"  ✓ {docx}  ({docx.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
