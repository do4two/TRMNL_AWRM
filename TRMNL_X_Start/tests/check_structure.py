#!/usr/bin/env python3
"""Fail fast on markup patterns that commonly break TRMNL X rendering."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
MARKUP = ROOT / "markup"
LAYOUTS = (
    "full.liquid",
    "half_horizontal.liquid",
    "half_vertical.liquid",
    "quadrant.liquid",
)
failures = []


def check(condition, message):
    print(("ok   " if condition else "FAIL ") + message)
    if not condition:
        failures.append(message)


for filename in LAYOUTS:
    text = (MARKUP / filename).read_text(encoding="utf-8")
    check('class="layout layout--col"' in text, f"{filename}: column layout")
    check('class="x-canvas' in text, f"{filename}: inner canvas")
    check('class="screen' not in text, f"{filename}: no plugin Screen")
    check('class="view' not in text, f"{filename}: no plugin View")

shared = (MARKUP / "shared.liquid").read_text(encoding="utf-8")
check("--starter-revision:" in shared, "Shared has revision marker")
check(".trmnl .layout > .x-canvas" in shared, "Shared has specific fill rule")
check("flex: 1 1 100% !important" in shared, "Canvas fills layout")

for forbidden in (
    "100vw",
    "100vh",
    "position: fixed",
    "transform: none",
):
    check(forbidden not in shared, f"Shared excludes {forbidden!r}")

screen_rule = re.search(r"\.trmnl\s+\.screen\s*\{", shared)
view_rule = re.search(r"\.trmnl\s+\.view(?:\s|,|\{)", shared)
check(screen_rule is None, "Shared does not override platform Screen")
check(view_rule is None, "Shared does not override platform View")

if failures:
    print(f"\n{len(failures)} check(s) failed")
    sys.exit(1)
print("\nTRMNL X starter structure is valid")
