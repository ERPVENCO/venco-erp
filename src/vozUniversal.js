// CONTROL UNIVERSAL POR VOZ
// Lee lo que hay en pantalla en este momento (botones, tarjetas, campos, listas) y obedece
// según los NOMBRES que ve, sin escribir código por módulo:
//
//   "nueva compra"                 → pulsa el botón que dice «Nueva compra»
//   "pulsa imprimir"               → pulsa «🖨️ Imprimir formato»
//   "proveedor Cárnicos del Valle" → elige esa opción en el campo «Proveedor»
//   "factura 4587 fecha ayer"      → llena varios campos en una sola frase
//   "marca activo"                 → marca la casilla «Activo»
//   "muestra números"              → numera todo lo pulsable; luego "pulsa 3" o "campo 5 Juan"
//   "qué puedo decir"              → lista lo que hay en pantalla
//
// Acciones que borran o guardan piden "confirmo" antes de ejecutarse.
// Los contraseñas nunca se llenan por voz.

import { sinTildes, tokenizar, parseNumero } from "./interpretarLocal";
import { parsearFecha, parsearRelativa, parsearHora, leerIdentificador } from "./vozFormulario";

const IGNORAR = "[data-voz-ignorar]";
const CONFIRMA_MS = 12000;
const NUMEROS_MS = 45000;

const STOP = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "y", "a", "en", "al", "por", "para", "con", "mi", "su", "que", "lo"]);

// Botones que solo tienen un icono: se nombran por lo que significan
const EMOJI = [
  ["✏", "editar"], ["👁", "ver detalle"], ["🗑", "eliminar"], ["✕", "cerrar"], ["✖", "cerrar"], ["×", "cerrar"],
  ["＋", "agregar"], ["➕", "agregar"], ["🖨", "imprimir"], ["🔄", "actualizar"], ["💾", "guardar"],
  ["←", "volver"], ["☰", "menu"], ["🔍", "buscar"],
];

const PELIGROSO = /\b(elimin|borr|anul|vaciar|descart|salir|cerrar sesion|reiniciar|resetear)/;
const COMPROMETE = /\b(guardar|registrar|crear|confirmar|finalizar|enviar|pagar|facturar|aprobar|abonar|despachar|cobrar|emitir|actualizar (compra|venta|pedido|registro))\b/;

const VERBOS_CLIC = "pulsa|pulsar|presiona|presionar|oprime|oprimir|toca|tocar|clic en|click en|haz clic en|haz click en|selecciona|seleccionar|elige|elegir|abre|abrir|ve a|ir a|entra a|entrar a|activa|activar";
const CONJUGA = {
  elimina: "eliminar", borra: "borrar", anula: "anular", edita: "editar", imprime: "imprimir", guarda: "guardar",
  registra: "registrar", descarga: "descargar", cierra: "cerrar", agrega: "agregar", crea: "crear",
  actualiza: "actualizar", busca: "buscar", vuelve: "volver", regresa: "regresar",
};
const VERBOS_CAMPO = new Set(["ingresa", "ingresar", "escribe", "escribir", "pon", "poner", "coloca", "colocar", "llena", "llenar", "digita", "digitar", "anota", "anotar", "cambia", "cambiar", "establece", "campo", "casilla", "selecciona", "seleccionar", "elige", "elegir"]);

// ------------------------------------------------------------------
// Utilidades de texto
// ------------------------------------------------------------------
const normTok = (w) => (/^\d+$/.test(w) ? String(parseInt(w, 10)) : w);

function tokensDe(texto) {
  return sinTildes(texto || "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && (w.length > 1 || /\d/.test(w)))
    .map(normTok);
}
const sinStop = (t) => t.filter((w) => !STOP.has(w));

// Tolera plurales ("compras" ~ "compra") pero no confunde palabras cortas
function coincide(a, b) {
  if (a === b) return true;
  if (a.length <= 3 || b.length <= 3) return false;
  return (b.startsWith(a) && b.length - a.length <= 3) || (a.startsWith(b) && a.length - b.length <= 3);
}

function palabrasEmoji(texto) {
  const t = (texto || "").replace(/\uFE0F/g, "");
  return EMOJI.filter(([e]) => t.includes(e)).map(([, w]) => w).join(" ");
}

const textoVisible = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
const etiquetaLimpia = (s) => s.replace(/[^\p{L}\p{N}\s.\-/]/gu, "").replace(/\s+/g, " ").trim();

// Cuánto se parece lo dicho (h) al nombre de un elemento (n)
function puntuar(h, n) {
  if (!h.length || !n.length) return 0;
  const hDentro = h.filter((w) => n.some((x) => coincide(w, x))).length / h.length;
  const nDentro = n.filter((x) => h.some((w) => coincide(w, x))).length / n.length;
  if (hDentro === 1 && nDentro === 1) return 1;
  if (hDentro === 1) return 0.7 + 0.25 * (h.length / n.length);
  if (nDentro === 1) return 0.7 + 0.2 * (n.length / h.length);
  return 0.5 * Math.min(hDentro, nDentro);
}

// ------------------------------------------------------------------
// Lectura de la pantalla
// ------------------------------------------------------------------
function esVisible(el) {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
}

function enPantalla(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

// Si hay una ventana emergente (modal) abierta, solo se obedece lo que está dentro de ella
function raizActiva() {
  const modales = Array.from(document.querySelectorAll('[style*="fixed"]')).filter((e) => {
    if (e.closest(IGNORAR)) return false;
    const r = e.getBoundingClientRect();
    return (
      r.width >= window.innerWidth * 0.9 &&
      r.height >= window.innerHeight * 0.9 &&
      e.querySelector("button, input, select, textarea, [role=button]")
    );
  });
  return modales.length ? modales[modales.length - 1] : document.body;
}

const SEL_CLIC = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary, input[type="button"], input[type="submit"]';
const TAGS_POSIBLES = /^(DIV|SPAN|LI|TD|TR|P|IMG|SVG|SECTION|ARTICLE|H1|H2|H3|H4)$/;

function escanearClics(raiz) {
  const res = [];
  const elegidos = new WeakSet();
  const dentroDeElegido = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (elegidos.has(p)) return true;
    return false;
  };
  for (const el of raiz.querySelectorAll("*")) {
    if (el.closest(IGNORAR)) continue;
    let esClic = false;
    if (el.matches(SEL_CLIC)) {
      esClic = !dentroDeElegido(el) || el.matches("button, a[href]");
    } else if (TAGS_POSIBLES.test(el.tagName) && !dentroDeElegido(el)) {
      const cs = getComputedStyle(el);
      if (cs.cursor === "pointer") {
        const padre = el.parentElement ? getComputedStyle(el.parentElement).cursor : "";
        esClic = padre !== "pointer";
      }
    }
    if (!esClic) continue;
    if (el.disabled || el.getAttribute("aria-disabled") === "true" || !esVisible(el)) continue;

    elegidos.add(el);
    const crudo = [textoVisible(el), el.getAttribute("aria-label"), el.getAttribute("title"), el.tagName === "INPUT" ? el.value : ""]
      .filter(Boolean).join(" ");
    const sinTexto = !etiquetaLimpia(textoVisible(el));
    const palabrasIcono = sinTexto ? palabrasEmoji(crudo) : "";
    const base = sinStop(tokensDe(crudo + " " + palabrasIcono));
    // Botón sin texto dentro de una fila de tabla: se nombra con el texto de la fila ("editar COM-0012")
    const fila = el.closest("tr");
    const contexto = fila ? sinStop(tokensDe(textoVisible(fila))) : [];
    const lineas = (el.innerText || el.textContent || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const titulo = etiquetaLimpia(lineas[0] || "");
    // Botón de icono dentro de una fila: se nombra con la primera celda ("eliminar COM-0012")
    const primeraCelda = fila && fila.cells && fila.cells[0] ? etiquetaLimpia(textoVisible(fila.cells[0])).slice(0, 30) : "";
    res.push({
      el,
      tipo: "clic",
      etiqueta: titulo || [palabrasIcono, primeraCelda].filter(Boolean).join(" ") || "botón",
      tokens: sinTexto ? [...new Set([...base, ...contexto])] : base,
      tokensTitulo: sinStop(tokensDe(titulo + " " + palabrasIcono)),
      nombreNorm: sinTildes(etiquetaLimpia(textoVisible(el)) + " " + palabrasIcono),
    });
  }
  return res;
}

const TIPOS_OMITIDOS = new Set(["hidden", "password", "button", "submit", "reset", "file", "image", "range", "color"]);

function nombresDeCampo(el) {
  const fuentes = [];
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) fuentes.push(l.textContent);
  }
  const envolvente = el.closest("label");
  if (envolvente) fuentes.push(envolvente.textContent);
  if (el.getAttribute("aria-label")) fuentes.push(el.getAttribute("aria-label"));
  // Etiqueta hermana que va antes del campo (el patrón de tus formularios)
  let p = el.parentElement;
  for (let k = 0; k < 2 && p; k++, p = p.parentElement) {
    const l = Array.from(p.children).find(
      (c) => c.tagName === "LABEL" && c !== el && (c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
    if (l) { fuentes.push(l.textContent); break; }
  }
  if (el.placeholder) fuentes.push(el.placeholder);
  if (el.name) fuentes.push(el.name.replace(/[_-]+/g, " "));
  return fuentes.map((f) => sinStop(tokensDe(f))).filter((t) => t.length);
}

function escanearCampos(raiz) {
  const res = [];
  for (const el of raiz.querySelectorAll("input, select, textarea")) {
    if (el.closest(IGNORAR)) continue;
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (el.tagName === "INPUT" && TIPOS_OMITIDOS.has(t)) continue;
    if (el.disabled || el.readOnly || !esVisible(el)) continue;
    const nombres = nombresDeCampo(el);
    if (!nombres.length) continue;
    const tipo = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "texto" : t;
    res.push({ el, tipo: "campo", campoTipo: tipo, nombres, etiqueta: nombres[0].join(" ") });
  }
  return res;
}

// ------------------------------------------------------------------
// Acciones sobre la pantalla
// ------------------------------------------------------------------
function asegurarVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.top < 90 || r.bottom > window.innerHeight - 160) el.scrollIntoView?.({ block: "center", behavior: "smooth" });
}

function resaltar(el) {
  asegurarVisible(el);
  const antes = [el.style.outline, el.style.outlineOffset];
  el.style.outline = "3px solid #1A9156";
  el.style.outlineOffset = "2px";
  setTimeout(() => { el.style.outline = antes[0]; el.style.outlineOffset = antes[1]; }, 1200);
}

function pulsar(el) {
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  resaltar(el);
  el.click();
}

// Funciona con los campos controlados de React (hay que usar el "setter" nativo y avisar con eventos)
function ponerValor(el, valor) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype
    : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Pide confirmación antes de borrar o guardar
let pendiente = null;
export const hayConfirmacionPendiente = () => !!pendiente && Date.now() < pendiente.hasta;

function conConfirmacion(c, ejecutar) {
  const n = c.nombreNorm || sinTildes(c.etiqueta || "");
  const peligroso = PELIGROSO.test(n) || c.el?.textContent?.includes("🗑");
  const compromete = !peligroso && COMPROMETE.test(n);
  if (!peligroso && !compromete) return ejecutar();
  pendiente = { ejecutar, hasta: Date.now() + CONFIRMA_MS };
  return { mensaje: `¿${peligroso ? "Seguro que quieres" : "Confirmas"} «${c.etiqueta}»? Di confirmo o cancela` };
}

// ------------------------------------------------------------------
// Números sobre la pantalla ("muestra números" → "pulsa 3")
// ------------------------------------------------------------------
let numerados = [];
let capa = null;
let timerNumeros = null;

function reposicionarNumeros() {
  if (!capa) return;
  Array.from(capa.children).forEach((b, i) => {
    const r = numerados[i]?.el.getBoundingClientRect();
    if (!r) return;
    b.style.display = r.bottom < 0 || r.top > window.innerHeight ? "none" : "block";
    b.style.top = `${Math.max(0, r.top - 6)}px`;
    b.style.left = `${Math.max(0, r.left - 6)}px`;
  });
}

export function ocultarNumeros() {
  clearTimeout(timerNumeros);
  window.removeEventListener("scroll", reposicionarNumeros, true);
  window.removeEventListener("resize", reposicionarNumeros);
  capa?.remove();
  capa = null;
  numerados = [];
}

function mostrarNumeros() {
  ocultarNumeros();
  const raiz = raizActiva();
  const items = [...escanearClics(raiz), ...escanearCampos(raiz)].filter((c) => enPantalla(c.el));
  items.sort((a, b) => {
    const ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
    const fa = Math.round(ra.top / 14), fb = Math.round(rb.top / 14);
    return fa - fb || ra.left - rb.left;
  });
  numerados = items.slice(0, 99);
  if (!numerados.length) return { mensaje: "No veo nada pulsable en esta pantalla", error: true };

  capa = document.createElement("div");
  capa.setAttribute("data-voz-ignorar", "");
  capa.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000;";
  numerados.forEach((c, i) => {
    const b = document.createElement("div");
    b.textContent = String(i + 1);
    b.style.cssText = `position:fixed;background:${c.tipo === "campo" ? "#1A5FA8" : "#B22222"};color:#fff;font:700 12px/1 sans-serif;padding:3px 5px;border-radius:9px;box-shadow:0 1px 4px rgba(0,0,0,.4);`;
    capa.appendChild(b);
  });
  document.body.appendChild(capa);
  reposicionarNumeros();
  window.addEventListener("scroll", reposicionarNumeros, true);
  window.addEventListener("resize", reposicionarNumeros);
  timerNumeros = setTimeout(ocultarNumeros, NUMEROS_MS);
  return { mensaje: `${numerados.length} numerados: rojo se pulsa, azul es un campo. Di «pulsa 3» o «campo 5 Juan»` };
}

// ------------------------------------------------------------------
// Valores de campos
// ------------------------------------------------------------------
const ES_CODIGO = /\b(factura|placa|lote|codigo|referencia|nit|cedula|documento|guia|serial|numero)\b/;

function elegirCampo(lista) {
  const activo = document.activeElement;
  return lista.find((c) => c.el === activo)
    || lista.find((c) => !c.el.value)
    || lista[0];
}

function coincideOpcion(valorNorm, el) {
  const tw = sinStop(tokensDe(valorNorm));
  if (!tw.length) return { estado: "vacio" };
  const filas = Array.from(el.options)
    .filter((o) => o.value !== "" || o.textContent.trim())
    .map((o) => {
      const ow = sinStop(tokensDe(o.textContent));
      const a = ow.length ? tw.filter((w) => ow.some((x) => coincide(w, x))).length / tw.length : 0;
      const b = ow.length ? ow.filter((x) => tw.some((w) => coincide(w, x))).length / ow.length : 0;
      return { o, a, b, ow };
    })
    .filter((f) => f.ow.length);
  let cand = filas.filter((f) => f.a === 1);
  if (!cand.length) {
    const mejor = Math.max(0, ...filas.map((f) => f.a));
    if (mejor < 0.67) return { estado: "ninguno" };
    cand = filas.filter((f) => f.a === mejor);
  }
  if (cand.length === 1) return { estado: "ok", opcion: cand[0].o };
  const completos = cand.filter((f) => f.b === 1);
  if (completos.length === 1) return { estado: "ok", opcion: completos[0].o };
  return { estado: "varios", opciones: cand.slice(0, 3).map((f) => f.o.textContent.trim()) };
}

function llenarCampo(c, valorOrig) {
  const el = c.el;
  const valor = valorOrig.trim();
  const valorN = sinTildes(valor);
  const nombre = c.etiqueta;

  if (el.type === "checkbox" || el.type === "radio") {
    const quiere = /\b(no|inactivo|desmarcado|falso|apagado)\b/.test(valorN) ? false : true;
    if (el.checked !== quiere) el.click();
    resaltar(el);
    return { ok: true, texto: `${nombre} ${quiere ? "marcado" : "desmarcado"}` };
  }
  if (!valor) return { ok: false, texto: `¿Qué valor para ${nombre}?` };

  if (c.campoTipo === "select") {
    const r = coincideOpcion(valorN, el);
    if (r.estado === "ok") {
      ponerValor(el, r.opcion.value);
      resaltar(el);
      return { ok: true, texto: `${nombre}: ${r.opcion.textContent.trim()}` };
    }
    if (r.estado === "varios") return { ok: false, texto: `En ${nombre} hay varios parecidos: ${r.opciones.join(", ")}` };
    return { ok: false, texto: `No encontré «${valor}» en ${nombre}` };
  }

  let final = valor;
  let mostrar = valor;
  if (c.campoTipo === "number") {
    const tk = tokenizar(valor);
    const neg = tk.includes("menos") || tk.includes("negativo");
    let r = null;
    for (let i = 0; i < tk.length && !r; i++) r = parseNumero(tk, i);
    if (!r) return { ok: false, texto: `No entendí el número para ${nombre}` };
    final = String(neg ? -r.valor : r.valor); mostrar = final;
  } else if (c.campoTipo === "date") {
    const hoy = new Date();
    const f = parsearFecha(valorN, hoy) || parsearRelativa(valorN, hoy);
    if (!f) return { ok: false, texto: `No entendí la fecha para ${nombre}` };
    final = f; mostrar = f;
  } else if (c.campoTipo === "time") {
    const h = parsearHora(valorN);
    if (!h) return { ok: false, texto: `No entendí la hora para ${nombre}` };
    final = h; mostrar = h;
  } else if (c.campoTipo === "email") {
    final = valorN.replace(/\s+arroba\s+/g, "@").replace(/\s+punto\s+/g, ".").replace(/\s+/g, "");
    mostrar = final;
  } else if (c.campoTipo === "tel") {
    final = leerIdentificador(tokensDe(valor)).replace(/\D/g, "");
    mostrar = final;
  } else if (c.nombres.some((n) => ES_CODIGO.test(n.join(" ")))) {
    const id = leerIdentificador(tokensDe(valor));
    if (id) { final = id; mostrar = id; }
  }

  ponerValor(el, final);
  resaltar(el);
  return { ok: true, texto: `${nombre}: ${mostrar}` };
}

// ------------------------------------------------------------------
// Entender la frase
// ------------------------------------------------------------------
function tokensConPosicion(orig) {
  const out = [];
  const re = /[A-Za-zÀ-ÿ0-9]+(?:[.,][0-9]+)?/g;
  let m;
  while ((m = re.exec(orig))) {
    out.push({ raw: m[0], norm: normTok(sinTildes(m[0]).replace(/[.,]/g, "")), ini: m.index, fin: m.index + m[0].length });
  }
  return out;
}

// Alias de cada campo: cualquier tramo seguido de su nombre ("factura" sirve para «N° Factura prov.»)
function construirAlias(campos) {
  const mapa = new Map();
  for (const c of campos) {
    for (const nombre of c.nombres) {
      for (let i = 0; i < nombre.length; i++) {
        for (let j = i + 1; j <= nombre.length; j++) {
          const toks = nombre.slice(i, j);
          const clave = toks.join(" ");
          if (!mapa.has(clave)) mapa.set(clave, { toks, campos: [] });
          const e = mapa.get(clave);
          if (!e.campos.includes(c)) e.campos.push(c);
        }
      }
    }
  }
  return mapa;
}

function intentarLlenarCampos(orig, campos) {
  if (!campos.length) return null;
  let toks = tokensConPosicion(orig);
  // Quitar verbos y artículos del principio ("ingresa el nombre Juan")
  while (toks.length && (VERBOS_CAMPO.has(toks[0].norm) || STOP.has(toks[0].norm))) toks = toks.slice(1);
  const U = toks.filter((t) => !STOP.has(t.norm));
  if (!U.length) return null;

  const alias = construirAlias(campos);
  const halladas = [];
  for (const { toks: nt, campos: cs } of alias.values()) {
    for (let i = 0; i + nt.length <= U.length; i++) {
      if (nt.every((w, k) => coincide(w, U[i + k].norm))) halladas.push({ i, len: nt.length, campos: cs });
    }
  }
  if (!halladas.length) return null;
  halladas.sort((a, b) => b.len - a.len || a.i - b.i);
  const usadas = [];
  for (const h of halladas) {
    if (usadas.some((u) => h.i < u.i + u.len && h.i + h.len > u.i)) continue;
    usadas.push(h);
  }
  usadas.sort((a, b) => a.i - b.i);
  if (usadas[0].i !== 0) return null; // la frase tiene que empezar con el nombre de un campo

  const resultados = [];
  usadas.forEach((h, k) => {
    const inicio = U[h.i + h.len - 1].fin;
    const fin = k + 1 < usadas.length ? U[usadas[k + 1].i].ini : orig.length;
    let valor = orig.slice(inicio, fin).trim()
      .replace(/^[,:;=\s-]+/, "")
      .replace(/^(es|son|sera|seria|igual a|igual|a|con|de|como)\s+/i, "")
      .replace(/\s+(y|e|tambien|luego|despues|ademas)\s*$/i, "") // conector antes del siguiente campo
      .replace(/[,;.\s]+$/, "");
    resultados.push(llenarCampo(elegirCampo(h.campos), valor));
  });

  const bien = resultados.filter((r) => r.ok).map((r) => r.texto);
  const mal = resultados.filter((r) => !r.ok).map((r) => r.texto);
  if (mal.length) return { mensaje: [...bien, ...mal].join(". "), error: true };
  return { mensaje: bien.join(". ") };
}

function buscarClic(hablado, candidatos, minimo = 0.7) {
  const h = sinStop(tokensDe(hablado));
  if (!h.length) return { estado: "vacio" };
  const puntuados = candidatos
    .map((c) => ({ c, s: Math.max(puntuar(h, c.tokens), c.tokensTitulo?.length ? puntuar(h, c.tokensTitulo) : 0) }))
    .filter((x) => x.s >= minimo)
    .sort((a, b) => b.s - a.s);
  if (!puntuados.length) return { estado: "ninguno" };
  const empatados = puntuados.filter((x) => puntuados[0].s - x.s < 0.05);
  if (empatados.length > 1) {
    // varios botones iguales (por ejemplo, uno por fila): sin números no se puede decidir
    const nombres = empatados.slice(0, 4).map((x) => x.c.etiqueta);
    const unicos = [...new Set(nombres)];
    return { estado: "varios", opciones: unicos, repetidos: unicos.length === 1 ? empatados.length : 0 };
  }
  return { estado: "ok", candidato: puntuados[0].c, puntaje: puntuados[0].s };
}

function listarPantalla() {
  const raiz = raizActiva();
  const clics = escanearClics(raiz).filter((c) => c.etiqueta !== "botón");
  const campos = escanearCampos(raiz);
  const unicos = (arr) => [...new Set(arr)].slice(0, 8);
  const partes = [];
  if (clics.length) partes.push(`Puedo pulsar: ${unicos(clics.map((c) => c.etiqueta)).join(", ")}`);
  if (campos.length) partes.push(`Campos: ${unicos(campos.map((c) => c.etiqueta)).join(", ")}`);
  return { mensaje: partes.join(". ") || "No veo nada para controlar en esta pantalla" };
}

// ------------------------------------------------------------------
// Punto de entrada
//   norm = frase sin tildes y en minúsculas; orig = la misma frase tal cual
//   → null si no era una orden para la pantalla; { mensaje, error } si la atendió
// ------------------------------------------------------------------
export function ejecutarUniversal(norm, orig) {
  const frase = norm.replace(/\b(por favor|porfa|ahora|ya)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!frase) return null;

  // 0) Confirmaciones pendientes
  if (pendiente) {
    if (Date.now() > pendiente.hasta) pendiente = null;
    else if (/^(confirmo|confirmar|si|dale|hazlo|adelante|correcto)\b/.test(frase)) {
      const p = pendiente; pendiente = null; return p.ejecutar();
    } else if (/^(cancela|cancelar|no|deten|detener|olvidalo)\b/.test(frase)) {
      pendiente = null; return { mensaje: "Cancelado" };
    } else pendiente = null;
  }

  // 1) Ayuda y números
  if (/^(muestra|mostrar|ver|pon|enumera|numera)\b.*\bnumeros?\b|^numera\b/.test(frase)) return mostrarNumeros();
  if (/^(oculta|ocultar|quita|quitar|esconde|esconder|borra)\b.*\bnumeros?\b/.test(frase)) { ocultarNumeros(); return { mensaje: "Números ocultos" }; }
  if (/^(que|cuales)\b.*\b(puedo|botones|opciones|campos|hay)\b|^ayuda\b|^lee la pantalla\b/.test(frase)) return listarPantalla();

  const raiz = raizActiva();

  // 2) Con números en pantalla: "pulsa 3" / "campo 5 Juan"
  if (numerados.length) {
    const reNum = new RegExp(`^(?:${VERBOS_CLIC}|numero|el numero|el)?\\s*(?:numero\\s+)?(.+)$`);
    const m = frase.match(reNum);
    if (m) {
      const tk = tokenizar(m[1]);
      const r = tk.length ? parseNumero(tk, 0) : null;
      if (r && r.next === tk.length && Number.isInteger(r.valor) && r.valor >= 1) {
        const c = numerados[r.valor - 1];
        if (!c) return { mensaje: `No hay un elemento ${r.valor}`, error: true };
        ocultarNumeros();
        if (c.tipo === "campo") { c.el.focus(); resaltar(c.el); return { mensaje: `Campo ${c.etiqueta}. Dicta el valor con «escribe …»` }; }
        return conConfirmacion(c, () => { pulsar(c.el); return { mensaje: `Pulsando ${c.etiqueta}` }; });
      }
    }
    const mc = frase.match(/^(?:campo|en el campo|escribe en|llena|en)\s+(?:el\s+)?(?:numero\s+)?(.+)$/);
    if (mc) {
      const U = tokensConPosicion(orig).filter((t) => !["campo", "en", "el", "escribe", "llena", "numero"].includes(t.norm));
      const r = U.length ? parseNumero(U.map((t) => t.norm), 0) : null;
      if (r && Number.isInteger(r.valor) && r.valor >= 1) {
        const c = numerados[r.valor - 1];
        if (c && c.tipo === "campo") {
          const valor = orig.slice(U[r.next - 1].fin).trim().replace(/^[,:;=\s-]+/, "");
          ocultarNumeros();
          const res = llenarCampo(c, valor);
          return { mensaje: res.texto, error: !res.ok };
        }
      }
    }
  }

  const clics = escanearClics(raiz);
  const campos = escanearCampos(raiz);

  const ejecutarClic = (c) => conConfirmacion(c, () => { pulsar(c.el); return { mensaje: `Pulsando ${c.etiqueta}` }; });
  const resolverClic = (objetivo) => {
    const r = buscarClic(objetivo, clics);
    if (r.estado === "ok") return ejecutarClic(r.candidato);
    if (r.estado === "varios") {
      const lista = r.repetidos ? `${r.repetidos} botones «${r.opciones[0]}»` : r.opciones.join(", ");
      return { mensaje: `Hay varios: ${lista}. Di «muestra números»`, error: true };
    }
    return null;
  };

  // 3) Marcar / desmarcar casillas
  const mcheck = frase.match(/^(marca|marcar|activa|activar|desmarca|desmarcar|desactiva|desactivar)\s+(.+)$/);
  if (mcheck) {
    const quiere = !/^des/.test(mcheck[1]);
    const cajas = campos.filter((c) => c.el.type === "checkbox" || c.el.type === "radio");
    const ht = sinStop(tokensDe(mcheck[2]));
    const mejor = cajas
      .map((c) => ({ c, s: Math.max(...c.nombres.map((n) => puntuar(ht, n))) }))
      .filter((x) => x.s >= 0.7)
      .sort((a, b) => b.s - a.s)[0];
    if (mejor) {
      if (mejor.c.el.checked !== quiere) mejor.c.el.click();
      resaltar(mejor.c.el);
      return { mensaje: `${mejor.c.etiqueta} ${quiere ? "marcado" : "desmarcado"}` };
    }
  }

  // 4) Vaciar un campo ("borra el nombre")
  const mborra = frase.match(/^(borra|limpia|vacia|vaciar|limpiar|borrar)\s+(?:el\s+|la\s+)?(?:campo\s+)?(.+)$/);
  if (mborra) {
    const ht = sinStop(tokensDe(mborra[2]));
    const mejor = campos
      .map((c) => ({ c, s: Math.max(...c.nombres.map((n) => puntuar(ht, n))) }))
      .filter((x) => x.s >= 0.85)
      .sort((a, b) => b.s - a.s)[0];
    if (mejor && mejor.c.campoTipo !== "select") {
      ponerValor(mejor.c.el, "");
      resaltar(mejor.c.el);
      return { mensaje: `${mejor.c.etiqueta} vacío` };
    }
  }

  // 5) Verbo + botón: "pulsa nueva compra", "abre imprimir"
  const mv = frase.match(new RegExp(`^(?:${VERBOS_CLIC})\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+|en\\s+)?(.+)$`));
  if (mv) {
    const r = resolverClic(mv[1]);
    if (r) return r;
    // "selecciona proveedor frigorífico": no es un botón, es un campo con su valor
    const relleno = intentarLlenarCampos(orig, campos);
    if (relleno) return relleno;
    // "ve a nombre": si es un campo, se lleva el cursor ahí
    const ht = sinStop(tokensDe(mv[1]));
    const campo = campos
      .map((c) => ({ c, s: Math.max(...c.nombres.map((n) => puntuar(ht, n))) }))
      .filter((x) => x.s >= 0.85)
      .sort((a, b) => b.s - a.s)[0];
    if (campo) { campo.c.el.focus(); resaltar(campo.c.el); return { mensaje: `Campo ${campo.c.etiqueta}` }; }
    return { mensaje: `No encontré «${mv[1]}» en esta pantalla. Di «qué puedo decir»`, error: true };
  }

  // 5b) El verbo ES el nombre del botón: "elimina com 12" → botón 🗑 de esa fila, "imprime" → «Imprimir»
  const ma = frase.match(/^(elimina|eliminar|borra|borrar|anula|anular|edita|editar|ver|imprime|imprimir|guarda|guardar|registra|registrar|descarga|descargar|cierra|cerrar|agrega|agregar|crea|crear|actualiza|actualizar|busca|buscar|vuelve|volver|regresa|regresar)\b(.*)$/);
  if (ma) {
    const r = resolverClic(`${CONJUGA[ma[1]] || ma[1]} ${ma[2]}`);
    if (r) return r;
  }

  // 6) Llenar campos: "factura 4587 fecha ayer"
  const llenado = intentarLlenarCampos(orig, campos);
  if (llenado) return llenado;

  // 7) Siguiente / anterior campo
  if (/^(siguiente|proximo|anterior)( campo)?$/.test(frase)) {
    const lista = campos.map((c) => c.el);
    const i = lista.indexOf(document.activeElement);
    const j = /^anterior/.test(frase) ? Math.max(0, i - 1) : Math.min(lista.length - 1, i + 1);
    if (lista[j]) { lista[j].focus(); resaltar(lista[j]); return { mensaje: `Campo ${campos[j].etiqueta}` }; }
  }

  // 8) "escribe …" en el campo donde está el cursor
  const me = orig.match(/^\s*(?:escribe|anota|dicta|digita|teclea)\s+(.+)$/i);
  if (me && document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    const c = campos.find((x) => x.el === document.activeElement);
    if (c) { const r = llenarCampo(c, me[1]); return { mensaje: r.texto, error: !r.ok }; }
  }

  // 9) Solo el nombre del botón: "nueva compra", "imprimir"
  const rb = buscarClic(frase, clics, 0.9);
  if (rb.estado === "ok") return ejecutarClic(rb.candidato);

  return null;
}