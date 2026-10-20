// Interpreta, 100% local y gratis, frases dictadas para llenar el formulario de recepción.
// Se pueden decir varios campos en una sola frase:
//   "temperatura menos dos empaque bueno cumple especificaciones si responsable Juan Pérez"
//
// interpretarFormulario(norm, orig, { proveedores, hoy })
//   norm = frase sin tildes y en minúsculas, orig = la misma frase tal cual (para nombres y notas)
//   → null si no hay ningún campo, o { acciones: [...], errores: [...] }

import { sinTildes, tokenizar, parseNumero, DIGITO_PALABRA } from "./interpretarLocal";

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// Orden = prioridad: los patrones más específicos van primero y "consumen" su texto.
const PATRONES = [
  { tipo: "guardar", re: /\bguard(?:ar|a|e|en)\b(?:\s+(?:la|esta|esa))?\s+recepcion\b/g },
  { tipo: "borrar_linea", re: /\b(?:quita|quitar|borra|borrar|elimina|eliminar)\s+(?:la\s+|el\s+)?(?:linea|producto|renglon)(?:\s+numero)?\b/g },
  { tipo: "lote_proveedor", re: /\blote(?:\s+del\s+proveedor|\s+de\s+proveedor|\s+proveedor)?\b/g },
  { tipo: "factura", re: /\b(?:numero\s+de\s+|n\s+)?factura(?:\s+del\s+proveedor|\s+de\s+proveedor|\s+proveedor)?\b/g },
  { tipo: "temperatura_transporte", re: /\btemperatura\s+(?:del\s+|de\s+)?(?:transporte|vehiculo|camion|carro)\b/g },
  { tipo: "temperatura_recepcion", re: /\btemperatura(?:\s+del\s+producto|\s+de\s+recepcion|\s+producto)?\b/g },
  { tipo: "proveedor", re: /\bproveedor\b/g },
  { tipo: "fecha_vencimiento", re: /\b(?:fecha\s+de\s+)?(?:vencimiento|vence)\b/g },
  { tipo: "fecha", re: /\bfecha(?:\s+de\s+(?:recepcion|compra))?\b/g },
  { tipo: "hora_recepcion", re: /\bhora(?:\s+de\s+recepcion)?\b/g },
  { tipo: "estado_empaque", re: /\b(?:estado\s+(?:del|de)\s+)?empaque\b/g },
  { tipo: "vehiculo_limpio", re: /\bvehiculo(?:\s+limpio)?\b/g },
  { tipo: "libre_plagas", re: /\b(?:libre\s+de\s+)?plagas\b/g },
  { tipo: "cumple_especificaciones", re: /\b(no\s+cumple|incumple|cumple)(?:\s+con)?(?:\s+las)?\s+especificaciones\b|\bespecificaciones\b|^(no\s+cumple|cumple)\b/g },
  { tipo: "responsable", re: /\bresponsable\b/g },
  { tipo: "numero_unidades", re: /\b(?:numero\s+de\s+|cantidad\s+de\s+|n\s+de\s+)?unidades\b/g },
  { tipo: "numero_placa", re: /\b(?:numero\s+de\s+)?placa\b/g },
  { tipo: "nota_linea", libre: true, re: /\b(?:nota|observacion(?:es)?)\s+(?:del|de\s+la)\s+(?:producto|linea)\b/g },
  { tipo: "observaciones", libre: true, re: /\bobservacion(?:es)?(?:\s+generales|\s+de\s+la\s+entrega)?\b/g },
  { tipo: "cantidad", re: /\bcantidad\b/g },
  { tipo: "linea", re: /\b(?:linea|renglon|producto)(?:\s+numero)?\b/g },
];

// ---------- utilidades ----------
const pad = (n) => String(n).padStart(2, "0");
const isoFecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function primerNumero(tokens, desde = 0) {
  for (let i = desde; i < tokens.length; i++) {
    const r = parseNumero(tokens, i);
    if (r) return r;
  }
  return null;
}

function numeroConSigno(tokens) {
  const neg = tokens.includes("menos") || tokens.includes("negativo");
  const r = primerNumero(tokens);
  if (!r) return null;
  return neg ? -r.valor : r.valor;
}

const RELLENO = new Set(["es", "numero", "no", "n", "de", "del", "la", "el", "igual", "son", "seria", "para", "con", "punto", "coma", "guion", "y"]);

// Lee códigos como factura, lote o placa: "a b c 1 2 3", "abc 123", "cuatro cinco ocho siete", "FV-4587"
export function leerIdentificador(tokens) {
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (RELLENO.has(w)) continue;
    if (/^\d+(\.\d+)?$/.test(w)) { out += w.replace(".", ""); continue; }
    if (/^[a-z]+\d+[a-z0-9]*$|^\d+[a-z]+[a-z0-9]*$/.test(w)) { out += w.toUpperCase(); continue; }
    const r = parseNumero(tokens, i);
    if (r && r.next > i) {
      const grupo = tokens.slice(i, r.next);
      out += grupo.every((g) => g in DIGITO_PALABRA)
        ? grupo.map((g) => DIGITO_PALABRA[g]).join("")
        : String(r.valor);
      i = r.next - 1;
      continue;
    }
    if (/^[a-z]{1,3}$/.test(w)) out += w.toUpperCase();
  }
  return out;
}

export function parsearFecha(texto, hoy) {
  const t = texto.trim();
  if (/\bhoy\b/.test(t)) return isoFecha(hoy);
  if (/\b(anteayer|antier|antes de ayer)\b/.test(t)) return isoFecha(sumarDias(hoy, -2));
  if (/\bayer\b/.test(t)) return isoFecha(sumarDias(hoy, -1));

  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    let y = m[3] ? +m[3] : hoy.getFullYear();
    if (y < 100) y += 2000;
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }

  const tk = tokenizar(t);
  const iMes = tk.findIndex((w) => w in MESES);
  if (iMes >= 0) {
    const antes = tk.slice(0, iMes).filter((w) => !["de", "del", "el", "dia"].includes(w));
    let dia = null;
    for (let i = 0; i < antes.length && dia === null; i++) {
      const r = parseNumero(antes, i);
      if (r && r.next === antes.length) dia = r.valor;
    }
    if (dia === null || dia < 1 || dia > 31) return null;
    let anio = hoy.getFullYear();
    const despues = tk.slice(iMes + 1).filter((w) => w !== "de" && w !== "del");
    const ry = primerNumero(despues);
    if (ry) { anio = ry.valor < 100 ? 2000 + ry.valor : ry.valor; }
    return `${anio}-${pad(MESES[tk[iMes]])}-${pad(dia)}`;
  }
  return null;
}

// "vence en 30 días", "en tres semanas", "en seis meses"
export function parsearRelativa(texto, hoy) {
  const m = texto.match(/\ben\s+(.+?)\s+(dias?|semanas?|meses|mes|anos?)\b/);
  if (!m) return null;
  const r = primerNumero(tokenizar(m[1]));
  if (!r) return null;
  const n = r.valor;
  const d = new Date(hoy);
  if (/^dia/.test(m[2])) d.setDate(d.getDate() + n);
  else if (/^semana/.test(m[2])) d.setDate(d.getDate() + n * 7);
  else if (/^mes/.test(m[2])) d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return isoFecha(d);
}

export function parsearHora(texto) {
  const tk = tokenizar(texto);
  const r1 = primerNumero(tk);
  if (!r1) return null;
  let h = Math.floor(r1.valor);
  let min = 0;
  if (r1.valor % 1 === 0.5) min = 30; // "ocho y media"
  else {
    const resto = tk.slice(r1.next).filter((w) => w !== "y" && w !== "con");
    if (/\bcuarto\b/.test(texto)) min = 15;
    else if (/\bmedia\b|\bmedio\b/.test(texto)) min = 30;
    else {
      const r2 = primerNumero(resto);
      if (r2 && r2.valor >= 0 && r2.valor < 60) min = r2.valor;
    }
  }
  const pm = /\b(p\.?\s?m\.?|tarde|noche)\b/.test(texto);
  const am = /\b(a\.?\s?m\.?|manana|madrugada)\b/.test(texto);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return `${pad(h)}:${pad(Math.round(min))}`;
}

function buscarProveedor(texto, proveedores) {
  const STOP = new Set(["los", "del", "con", "para", "las", "una", "uno", "que", "por", "es"]);
  const tw = texto.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!tw.length) return { estado: "vacio" };
  const coincide = (a, b) => a.startsWith(b) || b.startsWith(a);

  const filas = proveedores.map((p) => {
    const pw = sinTildes(p.empresa || "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    if (!pw.length) return { p, a: 0, b: 0 };
    // a = qué parte de lo dictado está en el nombre; b = qué parte del nombre se dictó
    const a = tw.filter((w) => pw.some((x) => coincide(x, w))).length / tw.length;
    const b = pw.filter((x) => tw.some((w) => coincide(x, w))).length / pw.length;
    return { p, a, b };
  });

  // Candidatos: todo lo dictado aparece en el nombre
  let cand = filas.filter((f) => f.a === 1);
  if (cand.length === 0) {
    // tolerancia: casi todo lo dictado coincide
    const mejorA = Math.max(...filas.map((f) => f.a));
    if (mejorA < 0.67) return { estado: "ninguno" };
    cand = filas.filter((f) => f.a === mejorA);
  }
  if (cand.length === 1) return { estado: "ok", proveedor: cand[0].p };

  // Varios candidatos: gana el que se dictó completo (b = 1), si es único
  const completos = cand.filter((f) => f.b === 1);
  if (completos.length === 1) return { estado: "ok", proveedor: completos[0].p };
  return { estado: "varios", opciones: cand.slice(0, 3).map((f) => f.p.empresa) };
}

const parseInspeccion = (texto) => {
  if (/\b(no\s+aplica|na|n\s+a)\b/.test(texto)) return "na";
  if (/\b(no\s+cumple|no|sucio|sucia|hay\s+plagas|con\s+plagas|presenta)\b/.test(texto)) return "no_cumple";
  if (/\b(cumple|si|limpio|limpia|libre|bien|ok)\b/.test(texto)) return "cumple";
  return null;
};

// ---------- principal ----------
export function interpretarFormulario(norm, orig, ctx = {}) {
  const hoy = ctx.hoy || new Date();
  const proveedores = ctx.proveedores || [];

  // 1) Ubicar las palabras clave (sin solaparse)
  const ocupado = [];
  const hallados = [];
  for (const pat of PATRONES) {
    for (const m of norm.matchAll(pat.re)) {
      const ini = m.index, fin = m.index + m[0].length;
      if (ocupado.some(([a, b]) => ini < b && fin > a)) continue;
      ocupado.push([ini, fin]);
      hallados.push({ tipo: pat.tipo, libre: !!pat.libre, ini, fin, texto: m[0] });
    }
  }
  if (!hallados.length) return null;
  hallados.sort((a, b) => a.ini - b.ini);

  const acciones = [];
  const errores = [];

  // 2) Procesar cada campo con el texto que lo sigue
  for (let i = 0; i < hallados.length; i++) {
    const h = hallados[i];
    const finTexto = h.libre ? norm.length : (hallados[i + 1]?.ini ?? norm.length);
    const valN = norm.slice(h.fin, finTexto).trim();
    const valO = orig.slice(h.fin, finTexto).trim();
    const tk = tokenizar(valN);

    switch (h.tipo) {
      case "guardar":
        acciones.push({ tipo: "guardar" });
        break;

      case "proveedor": {
        const r = buscarProveedor(valN, proveedores);
        if (r.estado === "ok") acciones.push({ tipo: "proveedor", id: r.proveedor.id, nombre: r.proveedor.empresa });
        else if (r.estado === "varios") errores.push(`Hay varios proveedores parecidos: ${r.opciones.join(", ")}`);
        else if (r.estado === "vacio") errores.push("¿Qué proveedor?");
        else errores.push(`No encontré el proveedor «${valO}»`);
        break;
      }
      case "factura": {
        const v = leerIdentificador(tk);
        if (v) acciones.push({ tipo: "factura", valor: v });
        else errores.push("No entendí el número de factura");
        break;
      }
      case "fecha": {
        const v = parsearFecha(valN, hoy);
        if (v) acciones.push({ tipo: "fecha", valor: v });
        else errores.push("No entendí la fecha");
        break;
      }
      case "fecha_vencimiento": {
        const v = parsearFecha(valN, hoy) || parsearRelativa(valN, hoy);
        if (v) acciones.push({ tipo: "traz", campo: "fecha_vencimiento", valor: v, etiqueta: "Vencimiento" });
        else errores.push("No entendí la fecha de vencimiento");
        break;
      }
      case "hora_recepcion": {
        const v = parsearHora(valN);
        if (v) acciones.push({ tipo: "traz", campo: "hora_recepcion", valor: v, etiqueta: "Hora" });
        else errores.push("No entendí la hora");
        break;
      }
      case "temperatura_recepcion":
      case "temperatura_transporte": {
        const v = numeroConSigno(tk);
        if (v === null || v < -60 || v > 100) { errores.push("No entendí la temperatura"); break; }
        acciones.push({
          tipo: "traz", campo: h.tipo, valor: String(v),
          etiqueta: h.tipo === "temperatura_transporte" ? "Temperatura transporte" : "Temperatura",
        });
        break;
      }
      case "estado_empaque": {
        const v = /\b(bueno|buena|buen)\b/.test(valN) ? "bueno"
          : /\bregular\b/.test(valN) ? "regular"
          : /\b(malo|mala|mal)\b/.test(valN) ? "malo" : null;
        if (v) acciones.push({ tipo: "traz", campo: "estado_empaque", valor: v, etiqueta: "Empaque" });
        else errores.push("Empaque: di bueno, regular o malo");
        break;
      }
      case "vehiculo_limpio":
      case "libre_plagas": {
        const v = parseInspeccion(valN);
        const esVeh = h.tipo === "vehiculo_limpio";
        if (v) acciones.push({ tipo: "traz", campo: h.tipo, valor: v, etiqueta: esVeh ? "Vehículo" : "Plagas",
          mostrar: v === "cumple" ? "cumple" : v === "no_cumple" ? "no cumple" : "no aplica" });
        else errores.push(`${esVeh ? "Vehículo limpio" : "Plagas"}: di cumple, no cumple o no aplica`);
        break;
      }
      case "cumple_especificaciones": {
        const neg = /^(no\s+cumple|incumple)/.test(h.texto) || /\bno\b/.test(valN);
        const pos = /^cumple/.test(h.texto) || /\b(si|cumple|afirmativo)\b/.test(valN);
        if (neg || pos) acciones.push({ tipo: "traz", campo: "cumple_especificaciones", valor: neg ? "no" : "si", etiqueta: "Cumple especificaciones", mostrar: neg ? "no" : "sí" });
        else errores.push("Especificaciones: di sí o no");
        break;
      }
      case "responsable": {
        const v = valO.replace(/^(es|:)\s+/i, "").trim();
        if (v) acciones.push({ tipo: "traz", campo: "responsable", valor: v, etiqueta: "Responsable" });
        else errores.push("¿Quién es el responsable?");
        break;
      }
      case "lote_proveedor": {
        const v = leerIdentificador(tk);
        if (v) acciones.push({ tipo: "traz", campo: "lote_proveedor", valor: v, etiqueta: "Lote proveedor" });
        else errores.push("No entendí el lote");
        break;
      }
      case "numero_placa": {
        const v = leerIdentificador(tk);
        if (v) acciones.push({ tipo: "traz", campo: "numero_placa", valor: v, etiqueta: "Placa" });
        else errores.push("No entendí la placa");
        break;
      }
      case "numero_unidades": {
        const r = primerNumero(tk);
        if (r && r.valor >= 0) acciones.push({ tipo: "traz", campo: "numero_unidades", valor: String(Math.round(r.valor)), etiqueta: "Unidades" });
        else errores.push("Unidades: di el número después de «unidades»");
        break;
      }
      case "nota_linea": {
        if (valO) acciones.push({ tipo: "traz", campo: "observaciones", valor: valO, etiqueta: "Nota del producto" });
        break;
      }
      case "observaciones": {
        if (valO) acciones.push({ tipo: "obs", valor: valO });
        else errores.push("¿Qué observación?");
        break;
      }
      case "cantidad": {
        const r = primerNumero(tk);
        if (r && r.valor > 0) acciones.push({ tipo: "cantidad", valor: r.valor });
        else errores.push("No entendí la cantidad");
        break;
      }
      case "linea": {
        const r = primerNumero(tk);
        if (r && Number.isInteger(r.valor) && r.valor >= 1) acciones.push({ tipo: "linea_sel", n: r.valor });
        // si no hay número, no era una orden de formulario: se ignora
        break;
      }
      case "borrar_linea": {
        const r = primerNumero(tk);
        if (r && Number.isInteger(r.valor) && r.valor >= 1) acciones.push({ tipo: "linea_borrar", n: r.valor });
        else errores.push("¿Qué línea quito? Di «quita la línea dos»");
        break;
      }
      default:
        break;
    }
    if (h.libre) break;
  }

  if (!acciones.length && !errores.length) return null;
  return { acciones, errores };
}