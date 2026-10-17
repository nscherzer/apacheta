"""Convierte textos de Project Gutenberg (raw/) en páginas listas para tachar (books/)."""
import json, re, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = {  # id gutenberg: (título, autor)
    13507: ("Cuentos de amor de locura y de muerte", "Horacio Quiroga"),
    65689: ("Las fuerzas extrañas", "Leopoldo Lugones"),
    56451: ("El payador", "Leopoldo Lugones"),
    64668: ("El imperio jesuítico", "Leopoldo Lugones"),
    33267: ("Facundo", "Domingo F. Sarmiento"),
    52894: ("Azul...", "Rubén Darío"),
    53552: ("Obras escogidas", "Gustavo Adolfo Bécquer"),
    2000: ("Don Quijote", "Miguel de Cervantes"),
    320: ("Lazarillo de Tormes", "Anónimo"),
    49836: ("Niebla", "Miguel de Unamuno"),
    55514: ("Cuentos de amor", "Emilia Pardo Bazán"),
    52597: ("Insolación", "Emilia Pardo Bazán"),
    25640: ("Los argonautas", "Vicente Blasco Ibáñez"),
    27738: ("José", "Armando Palacio Valdés"),
}
MIN_WORDS, MAX_WORDS, PER_BOOK = 90, 140, 200


def body(text):
    start = re.search(r"\*\*\* ?START OF.*?\*\*\*", text)
    end = re.search(r"\*\*\* ?END OF", text)
    return text[start.end() if start else 0:end.start() if end else len(text)]


def clean(p):
    p = re.sub(r"\s+", " ", p).strip()
    p = re.sub(r"[_#*]", "", p).replace("--", "—")
    p = re.sub(r"\[\d+\]|\[\*\]", "", p)
    return p.strip()


def good(p):
    words = p.split()
    if len(words) < 25 or "[" in p or "http" in p.lower() or "gutenberg" in p.lower():
        return False
    letters = [c for c in p if c.isalpha()]
    return sum(c.isupper() for c in letters) / max(len(letters), 1) < 0.15


def sentences(p):
    return re.split(r"(?<=[.!?…»])\s+(?=[—¿¡«A-ZÁÉÍÓÚÑ])", p)


def pages(text):
    paras = [clean(p) for p in re.split(r"\n\s*\n", body(text))]
    paras = [p for p in paras if good(p)]
    paras = paras[len(paras) // 20:]  # saltear prólogos y dedicatorias
    out, cur, n = [], [], 0
    for p in paras:
        for s in sentences(p) if len(p.split()) > MAX_WORDS else [p]:
            w = len(s.split())
            if n + w > MAX_WORDS and n >= MIN_WORDS:
                out.append("\n".join(cur)); cur, n = [], 0
            if w > MAX_WORDS:  # oración larguísima: no sirve como página
                continue
            if cur and s is not p:  # oración suelta de un párrafo largo: se pega a la anterior
                cur[-1] += " " + s
            else:
                cur.append(s)
            n += w
        if n >= MIN_WORDS:
            out.append("\n".join(cur)); cur, n = [], 0
    return out


random.seed(17)
index = []
for gid, (title, author) in BOOKS.items():
    ps = pages((ROOT / "raw" / f"{gid}.txt").read_text(encoding="utf-8"))
    if len(ps) > PER_BOOK:
        step = len(ps) / PER_BOOK
        ps = [ps[int(i * step)] for i in range(PER_BOOK)]
    (ROOT / "books" / f"{gid}.json").write_text(json.dumps(ps, ensure_ascii=False), encoding="utf-8")
    index.append({"id": gid, "title": title, "author": author, "pages": len(ps)})
    print(f"{gid:>6} {len(ps):>4} págs  {title}")
(ROOT / "books" / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
