"""Prepare the fixed PDF form from the supplied DOCX exported by Microsoft Word.

Usage: python scripts/prepare-acta-pdf.py source.pdf output.pdf
Only the example date, Carabineros name and rank are removed. All institutional
artwork, wording, blank PDI fields and the acta number remain in place.
"""
import sys
from pathlib import Path
import pymupdf

source, destination = map(Path, sys.argv[1:])
pdf = pymupdf.open(source)
assert len(pdf) == 1 and tuple(pdf[0].rect) == (0, 0, 612, 936)
page = pdf[0]
for rect in [(490.8, 97.8, 584.3, 111.7), (217, 709.7, 341.3, 722.3), (132.7, 735, 187.4, 747.6)]:
    page.add_redact_annot(pymupdf.Rect(rect), fill=(1, 1, 1))
page.apply_redactions(images=0, graphics=0)
pdf.set_metadata({"title": "Acta de control de identidad a extranjero - artículo 12 bis", "author": "Subcomisaría de Asuntos Migratorios"})
destination.parent.mkdir(parents=True, exist_ok=True)
pdf.save(destination, garbage=4, deflate=True)
print(f"Prepared original form: {destination} (612 x 936 pt, one page)")
