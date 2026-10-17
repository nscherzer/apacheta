# Apacheta

Poesía encontrada en el celu: te toca una página al azar de un libro de dominio público en
español, tachás palabras con un toque (o deslizando) y lo que queda es tu poema. Se baja como
imagen, se copia el texto o se comparte un link que abre la misma página tachada (y desde ahí
cualquiera puede hacer su propio poema con esa página).

Sitio estático (HTML + CSS + JS, sin build). Para probarlo local: `python3 -m http.server`.

## Libros
`books/` se genera con `python3 scripts/build_books.py` a partir de los `.txt` de Project
Gutenberg en `raw/` (no versionado; se bajan de `gutenberg.org/cache/epub/<id>/pg<id>.txt`).
La lista de libros está en el script.

## El link
`#b=<id libro>&p=<página>&x=<palabras tachadas como bitset en base64url>`. No hay servidor:
todo el poema vive en el link.

## Pendiente (v2)
- Muro con los poemas de otros (necesita base de datos).
