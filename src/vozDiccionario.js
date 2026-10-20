// Palabras que el micrófono escribe mal y cómo deben quedar.
// Agrega las tuyas: a la izquierda cómo lo escribe el micrófono (en minúsculas y sin tildes),
// a la derecha cómo debe quedar escrito.
export const CORRECCIONES = {
  joe: 'Yohe',
  yoe: 'Yohe',
  yohe: 'Yohe',
  baches:'Batches',
  bache:'Batches',
}

export function corregirNombres(texto) {
  return texto.replace(/[A-Za-zÀ-ÿ]+/g, (palabra) => CORRECCIONES[palabra.toLowerCase()] ?? palabra)
}
