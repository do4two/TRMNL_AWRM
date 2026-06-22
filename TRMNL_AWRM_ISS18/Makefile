PYTHON ?= python3

.PHONY: check preview all

check:
	$(PYTHON) tests/check_structure.py

preview:
	node preview/render.mjs

all: check preview
