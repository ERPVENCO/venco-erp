// Intérprete 100% local y gratuito para el dictado de recepción.
// interpretarLocal("papada nacional sumar veintidós punto siete más 10 menos 2", productos)
//   → { prod: {id, nombre} | null, nuevos: [{ valor: 22.7, op: "+" }, ...] }

export const sinTildes = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const UNI = {
  cero: 0, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DEC = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CEN = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const ES_DIGITO = /^\d+(\.\d+)?$/;

// Lee un entero escrito con palabras ("treinta y cinco", "ciento veinte", "dos mil quinientos").
export function parseEntero(t, i) {
  let total = 0, cur = 0, any = false, prevDec = false;
  const ini = i;
  while (i < t.length) {
    const w = t[i];
    if (w in UNI) { cur += UNI[w]; any = true; prevDec = false; }
    else if (w in DEC) { cur += DEC[w]; any = true; prevDec = true; }
    else if (w in CEN) { cur += CEN[w]; any = true; prevDec = false; }
    else if (w === "y" && prevDec && t[i + 1] in UNI && UNI[t[i + 1]] >= 1 && UNI[t[i + 1]] <= 9) { prevDec = false; }
    else if (w === "mil" && any) { total += (cur || 1) * 1000; cur = 0; prevDec = false; }
    else if (w === "mil") { total += 1000; any = true; }
    else break;
    i++;
  }
  if (!any || i === ini) return null;
  return { valor: total + cur, next: i };
}

// Lee un número: "22.7", "veintidós punto siete", "ocho y medio", "punto cinco".
export function parseNumero(t, i) {
  let entero = null, next = i;
  if (ES_DIGITO.test(t[i])) {
    entero = parseFloat(t[i]); next = i + 1;
  } else {
    const r = parseEntero(t, i);
    if (r) { entero = r.valor; next = r.next; }
  }

  // Decimales hablados: "punto siete", "coma cero cinco", "punto veinticinco"
  if (t[next] === "punto" || t[next] === "coma") {
    let j = next + 1, ceros = "";
    while (t[j] === "cero") { ceros += "0"; j++; }
    let dec = null;
    if (j < t.length && ES_DIGITO.test(t[j]) && !t[j].includes(".")) { dec = t[j]; j++; }
    else {
      const r = parseEntero(t, j);
      if (r) { dec = String(r.valor); j = r.next; }
      else if (ceros) { dec = ""; }
    }
    if (dec !== null && (entero !== null || ceros || dec)) {
      return { valor: parseFloat(`${entero ?? 0}.${ceros}${dec}` || "0"), next: j };
    }
  }

  if (entero === null) return null;

  // "ocho y medio"
  if (t[next] === "y" && (t[next + 1] === "medio" || t[next + 1] === "media")) {
    return { valor: entero + 0.5, next: next + 2 };
  }
  return { valor: entero, next };
}

function buscarProducto(norm, productos) {
  const palabras = norm.split(/\s+/);
  // Tolera plurales ("papadas") pero no confunde palabras cortas ("sal" ≠ "sale")
  const coincide = (w, x) => {
    if (w === x) return true;
    if (w.length <= 3 || x.length <= 3) return false;
    return (x.startsWith(w) && x.length - w.length <= 3) || (w.startsWith(x) && w.length - x.length <= 3);
  };
  const candidatos = [];
  for (const p of productos) {
    const ws = sinTildes(p.nombre).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (!ws.length) continue;
    const hits = ws.filter((w) => palabras.some((x) => coincide(w, x))).length;
    const puntaje = hits / ws.length;
    // Basta con decir parte del nombre ("papada") si solo un producto la tiene
    if (hits >= 1 && puntaje >= 0.5) candidatos.push({ p, hits, puntaje });
  }
  if (!candidatos.length) return null;
  candidatos.sort((x, y) => y.puntaje - x.puntaje || y.hits - x.hits);
  const [a, b] = candidatos;
  if (b && a.puntaje === b.puntaje && a.hits === b.hits) return null; // empate: no adivina
  return a.p;
}

// Deja el texto listo para leer números: sin tildes, "22,7" → "22.7", "+" → "mas", "-2" → "menos 2".
export function normalizar(texto) {
  return sinTildes(texto)
    .replace(/(\d),(\d)/g, "$1.$2")        // 22,7 → 22.7
    .replace(/\+/g, " mas ")
    .replace(/(^|\s)-(?=\d)/g, " menos ")  // "-2" → menos 2
    .replace(/(^|\s)-(\s|$)/g, " menos ")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/(\d)\.(?!\d)/g, "$1 ")       // punto final de frase
    .trim();
}

export const tokenizar = (texto) => normalizar(texto).split(/\s+/).filter(Boolean);

// Palabras que son un solo dígito (para leer "cuatro cinco ocho siete" como 4587).
export const DIGITO_PALABRA = {
  cero: "0", un: "1", uno: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};

export function interpretarLocal(texto, productos = []) {
  const norm = normalizar(texto);
  const t = norm.split(/\s+/).filter(Boolean);
  const prod = buscarProducto(norm, productos);

  const OP_MENOS = new Set(["menos", "resta", "restar", "restale", "tara", "quita", "quitar"]);
  const OP_MAS = new Set(["mas", "sumar", "suma", "sume", "agrega", "agregar", "sumale"]);

  const nuevos = [];
  let op = "+", i = 0;
  while (i < t.length) {
    if (OP_MENOS.has(t[i])) { op = "-"; i++; continue; }
    if (OP_MAS.has(t[i])) { op = "+"; i++; continue; }
    const r = parseNumero(t, i);
    if (r && r.valor >= 0 && r.valor <= 100000) {
      nuevos.push({ valor: Math.round(r.valor * 1000) / 1000, op });
      op = "+";
      i = r.next;
    } else {
      i++;
    }
  }
  return { prod, nuevos };
}