#!/usr/bin/env python3
"""
Builds the app's font files from the desktop client's variable sources.

Run by hand, not by the build. It needs `fonttools` and `brotli`, which are
Python and are not dependencies of this app:

    python3 -m venv /tmp/fonts && /tmp/fonts/bin/pip install fonttools brotli
    /tmp/fonts/bin/python scripts/fonts.py ../client/src/assets/fonts

The desktop's files are variable woff2 with a `wght` axis and an `ital` axis.
This instances the weights the app uses into static faces and writes them into
`assets/fonts`.

**They come out as real TrueType, and that is the point of this file
existing.** The faces this replaced were produced with the same instancing and
saved with the woff2 flavour still on them — `.ttf` on the end of the name and
`wOF2` in the first four bytes. iOS loads that, because CoreText has read woff2
since iOS 13, so it was invisible on the platform it was checked on. Android
does not: `expo-font` there takes `.ttf` and `.otf`, and a file it cannot parse
is a face that never registers. No error, no warning — every `fontFamily`
naming one falls through to Roboto, which looks like the app simply not having
been styled.

**One family name per weight**, matching what the app already relied on: iOS
assembles a family from the name table and Android wants an XML definition per
weight, so a grouped family with `fontWeight` picking within it behaves
differently on the two. Naming each face and setting `fontFamily` directly is
the version that behaves the same on both, and it is why the family name here
is the same string as the file name.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# (source, weight, italic, file stem). The stem is the family name, the
# PostScript name and the name `fontFamily` takes, all three.
FACES = [
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 400, 0, "AtkinsonHyperlegibleNext-Regular"),
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 500, 0, "AtkinsonHyperlegibleNext-Medium"),
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 600, 0, "AtkinsonHyperlegibleNext-SemiBold"),
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 700, 0, "AtkinsonHyperlegibleNext-Bold"),
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 800, 0, "AtkinsonHyperlegibleNext-ExtraBold"),
    # Emphasis in a message. Atkinson's italic is a real one on the `ital`
    # axis, not an oblique — which matters, because a `fontStyle: "italic"`
    # that no face can satisfy renders upright and silently loses the mark.
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 400, 1, "AtkinsonHyperlegibleNext-Italic"),
    ("AtkinsonHyperlegibleNextVF-Variable.woff2", 700, 1, "AtkinsonHyperlegibleNext-BoldItalic"),
    ("AtkinsonHyperlegibleMonoVF-Variable.woff2", 400, 0, "AtkinsonHyperlegibleMono-Regular"),
    ("AtkinsonHyperlegibleMonoVF-Variable.woff2", 600, 0, "AtkinsonHyperlegibleMono-SemiBold"),
]


def build(source: Path, weight: int, italic: int, stem: str) -> int:
    font = TTFont(source)
    axes = {a.axisTag for a in font["fvar"].axes}
    location = {"wght": weight}
    if "ital" in axes:
        location["ital"] = italic
    instantiateVariableFont(font, location, inplace=True, updateFontNames=False)

    for record in font["name"].names:
        # 1 family, 4 full name, 6 PostScript. 16 and 17 are the typographic
        # pair, and they have to agree with 1 and 2 or the OS builds a family
        # out of several of these files and picks within it by weight.
        if record.nameID in (1, 4, 6, 16):
            record.string = stem
        elif record.nameID in (2, 17):
            record.string = "Regular"

    if italic:
        # Not read when `fontFamily` names the face outright, but a face that
        # says it is upright while drawing an italic is a trap for anything
        # that does look — a PDF export, a system font picker, the next person.
        font["post"].italicAngle = -12.0
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0x40) | 0x01
        font["head"].macStyle |= 0x02

    # No flavour. This is the line the previous build was missing.
    font.flavor = None
    out = OUT / f"{stem}.ttf"
    font.save(out)
    return out.stat().st_size


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(f"usage: {sys.argv[0]} <path to the client's assets/fonts>")
    src = Path(sys.argv[1])
    total = 0
    for name, weight, italic, stem in FACES:
        size = build(src / name, weight, italic, stem)
        total += size
        print(f"{stem:<40} {size / 1024:6.1f} KB")
    print(f"{'total':<40} {total / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
