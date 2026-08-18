#!/usr/bin/env python3
"""Build the Constitution AKN from the official Government PDF.

Source: Presidency of the Council of Ministers / Governo Italiano.
The PDF is kept immutable under raw/primary; this script only creates the
normalized AKN used by the existing parser/ingestion pipeline.
"""
import html
import os
import re
from pathlib import Path

from pypdf import PdfReader

PDF = Path('/opt/hermes-legal/raw/primary/costituzione_governo.pdf')
OUT = Path('/opt/hermes-legal/raw/primary/costituzione_1947-12-27_governo.xml')
URN = 'urn:nir:stato:costituzione:1947-12-27'
SOURCE_URL = 'https://presidenza.governo.it/Governo/Costituzione/CostituzioneRepubblicaItaliana.pdf'


def pdf_text():
    reader = PdfReader(str(PDF))
    return '\n'.join(page.extract_text() or '' for page in reader.pages)


def normalize_article_heads(text):
    """Remove PDF page numbers accidentally glued to Art. N headings.

    Examples produced by pypdf: ``Art. 577.`` means Art. 57 + page 7,
    ``Art. 13435.`` means Art. 134 + page 35, and ``Art. 56 6.`` means
    Art. 56 + page 6. The valid constitutional article range disambiguates
    these cases.
    """
    def repl(match):
        first = int(match.group(1))
        glued = match.group(2) or ''
        if 1 <= first <= 139:
            return f'Art. {first}.'
        digits = str(first)
        candidates = []
        for cut in range(1, min(3, len(digits)) + 1):
            base = int(digits[:cut])
            suffix = digits[cut:]
            if 1 <= base <= 139 and 1 <= len(suffix) <= 2:
                candidates.append((base, suffix))
        if len(candidates) == 1:
            return f'Art. {candidates[0][0]}.'
        if candidates:
            # Prefer the longest valid article prefix (e.g. 134 over 13).
            base = max(candidates, key=lambda item: len(str(item[0])))[0]
            return f'Art. {base}.'
        return match.group(0)

    return re.sub(r'Art\.\s*([0-9]+)(?:\s+([0-9]+))?\s*\.', repl, text)


_HEAD_LINE = re.compile(r'^(?:PARTE|TITOLO|SEZIONE|CAPO)\s+[IVXLC]+\b\s*\d*\s*$', re.I)
_ART_LINE = re.compile(r'^\s*Art\.?\s*\d+', re.I)
_PAGE_LINE = re.compile(r'^\d{1,2}$')


def strip_layout_noise(body):
    """Rimuove dal corpo le righe di layout del PDF: intestazioni di sezione
    (PARTE/TITOLO/SEZIONE/CAPO + riga del titolo) e numeri di pagina isolati,
    che altrimenti finirebbero incollati al testo degli articoli."""
    lines = body.split('\n')
    kept = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if _HEAD_LINE.match(line):
            # salta l'intestazione e l'eventuale riga-titolo subito dopo
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and not _ART_LINE.match(lines[j]) and not _HEAD_LINE.match(lines[j].strip()):
                i = j + 1
            else:
                i = j
            continue
        if _PAGE_LINE.fullmatch(line):
            i += 1
            continue
        kept.append(lines[i])
        i += 1
    return '\n'.join(kept)


def extract_articles(text):
    text = normalize_article_heads(text)
    matches = list(re.finditer(r'(?m)^\s*Art\.\s*([0-9]{1,3})\.', text))
    articles = []
    for index, match in enumerate(matches):
        number = int(match.group(1))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.end():end]
        body = strip_layout_noise(body)
        body = re.sub(r'\s+', ' ', body).strip()
        # Remove trailing disposition heading from art. 139 body only.
        body = re.sub(r'\s+DISPOSIZIONI TRANSITORIE.*$', '', body, flags=re.I)
        if body:
            articles.append((number, body))
    # A primary-source check: exactly one article for each 1..139.
    numbers = [n for n, _ in articles]
    expected = list(range(1, 140))
    if numbers != expected:
        missing = sorted(set(expected) - set(numbers))
        duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
        raise RuntimeError(f'Costituzione non valida: {len(articles)} articoli, missing={missing}, duplicates={duplicates}')
    return articles


def build_akn(articles):
    esc = lambda value: html.escape(value, quote=False)
    ns = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<akomaNtoso xmlns="{ns}">',
        '  <act>',
        '    <meta>',
        '      <identification>',
        '        <FRBRWork>',
        f'          <FRBRuri value="{URN}"/>',
        f'          <FRBRalias value="{URN}"/>',
        '          <FRBRname value="costituzione"/>',
        '        </FRBRWork>',
        '      </identification>',
        f'      <proprietary source="Governo Italiano" sourceUrl="{SOURCE_URL}"/>',
        '    </meta>',
        '    <body>',
        '      <mainBody>',
        '        <heading><p>COSTITUZIONE DELLA REPUBBLICA ITALIANA</p></heading>',
    ]
    for number, body in articles:
        lines.extend([
            '        <paragraph>',
            f'          <content><p>Art. {number}. {esc(body)}</p></content>',
            '        </paragraph>',
        ])
    lines.extend(['      </mainBody>', '    </body>', '  </act>', '</akomaNtoso>'])
    return '\n'.join(lines) + '\n'


def main():
    articles = extract_articles(pdf_text())
    OUT.write_text(build_akn(articles), encoding='utf-8')
    print(f'source_pdf={PDF}')
    print(f'official_url={SOURCE_URL}')
    print(f'articoli={len(articles)}')
    print(f'output={OUT}')


if __name__ == '__main__':
    main()
