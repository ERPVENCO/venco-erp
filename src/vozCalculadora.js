// CALCULADORA POR VOZ
// Funciona como una calculadora de bolsillo: va de izquierda a derecha y arrastra el resultado.
//
//   "veinte más treinta"          → 50
//   "por tres"                    → 150
//   "entre cinco"                 → 30
//   "menos diez"                  → 20
//   "veinte por ciento de 350"    → 70        "más diez por ciento" → suma el 10 % al total
//   "raíz de 144"  /  "al cuadrado"  /  "elevado a 3"
//   "igual" / "resultado"         → te lo dice en voz alta
//   "borra el último" / "limpia"  → deshace la última operación / empieza de cero
//
// Un número suelto cuando ya hay un resultado empieza un cálculo nuevo (el anterior queda en el historial).
// Si la frase trae palabras que no son de matemáticas, se devuelve null: no era para la calculadora.

import { tokenizar, parseNumero } from "./interpretarLocal";

const redondear = (n) => Math.round(n * 1e9) / 1e9;

export const fmtNum = (n) =>
  n === null || n === undefined ? "0" : redondear(n).toLocaleString("es-CO", { maximumFractionDigits: 6 });

// Cómo se lee en voz alta ("1250,5" → "1250 coma 5")
export const hablarNum = (n) => String(redondear(n)).replace("-", "menos ").replace(".", " coma ");

export const nuevaCalculadora = () => ({ total: null, pasos: [], historial: [], op: null });

const ADD = new Set(["mas", "suma", "sumar", "sumale", "agrega", "agregar"]);
const SUB = new Set(["menos", "resta", "restar", "restale", "negativo"]);
const MUL = new Set(["por", "x", "multiplica", "multiplicar"]);
const DIV = new Set(["entre", "divide", "dividir"]);

// Palabras que pueden acompañar una operación sin cambiar su sentido
const RELLENO = new Set([
  "de", "del", "a", "el", "la", "los", "las", "es", "son", "da", "dan", "seria", "igual", "cuanto", "cuantos",
  "resultado", "total", "y", "con", "me", "dame", "dime", "ahora", "luego", "despues", "entonces", "otra", "vez",
  "ya", "al", "calcula", "calcular", "operacion", "calculo", "nuevo", "nueva", "empezar", "empieza", "cero", "signo",
  "cambia", "cambiar", "limpia", "limpiar", "borra", "borrar", "elimina", "quita", "quitar", "ultimo", "ultima",
  "anterior", "todo", "todos", "reinicia", "reiniciar", "cancela", "cancelar", "deshaz", "deshacer", "atras", "listo",
]);
const PALABRAS_OP = new Set(["porciento", "raiz", "alcuadrado", "alcubo", "elevado"]);

function preparar(norm) {
  return " " + norm
    .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1 por $2")
    .replace(/(\d)\s*[/÷]\s*(\d)/g, "$1 entre $2")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 menos $2")
    .replace(/[×*]/g, " por ").replace(/[÷/]/g, " entre ").replace(/%/g, " porciento ").replace(/√/g, " raiz ")
    .replace(/\bpor\s+ciento\b/g, " porciento ")
    .replace(/\braiz\s+cuadrada\b/g, " raiz ")
    .replace(/\bal\s+cuadrado\b/g, " alcuadrado ")
    .replace(/\bal\s+cubo\b/g, " alcubo ")
    .replace(/\belevado\s+a(\s+la)?\b/g, " elevado ")
    .replace(/\b(dividido|dividida)(\s+(entre|por))?\b/g, " entre ")
    .replace(/\bmultiplicado(\s+por)?\b/g, " por ")
    .replace(/\sx\s/g, " por ") + " ";
}

const textoPasos = (pasos) => pasos.map((p) => p.texto).join(" ");

// ¿Toda la frase es matemática? (si trae una palabra desconocida, no es para la calculadora)
function esMatematica(tk) {
  let tieneAlgo = false;
  for (let i = 0; i < tk.length; ) {
    const t = tk[i];
    if (ADD.has(t) || SUB.has(t) || MUL.has(t) || DIV.has(t) || PALABRAS_OP.has(t)) { tieneAlgo = true; i++; continue; }
    const r = parseNumero(tk, i);
    if (r && r.next > i) { tieneAlgo = true; i = r.next; continue; }
    if (RELLENO.has(t)) { i++; continue; }
    return false;
  }
  return tieneAlgo || tk.length > 0;
}

/**
 * procesarCalculadora(estado, norm)
 *  → null si la frase no es para la calculadora
 *  → { estado, decir?, error?, accion? }  ("limpiar" | "deshacer" | "operacion")
 */
export function procesarCalculadora(est, norm) {
  const tk = tokenizar(preparar(norm));
  if (!tk.length || !esMatematica(tk)) return null;
  const tiene = (...ws) => ws.some((w) => tk.includes(w));

  let total = est.total;
  let pasos = [...est.pasos];
  let historial = [...est.historial];
  let op = est.op || null;
  const pedirResultado = tiene("igual", "resultado", "total", "cuanto", "cuantos");

  // ---- comandos de la propia calculadora ----
  const soloComando = !tk.some((t) => ADD.has(t) || SUB.has(t) || MUL.has(t) || DIV.has(t) || PALABRAS_OP.has(t))
    && !tk.some((t, i) => { const r = parseNumero(tk, i); return !!r && r.next > i && t !== "cero"; });
  if (tiene("limpia", "limpiar", "reinicia", "reiniciar", "cancela", "cancelar")
      || (tiene("borra", "borrar", "elimina") && tiene("todo", "todos"))
      || (tiene("empezar", "empieza") && tiene("nuevo", "nueva"))
      || (tiene("nueva", "nuevo") && tiene("operacion", "calculo") && soloComando)) {
    if (total !== null) historial = [...historial, { expr: textoPasos(pasos), total }].slice(-4);
    return { estado: { total: null, pasos: [], historial, op: null }, accion: "limpiar", decir: null };
  }
  if (tiene("deshaz", "deshacer", "atras") || (tiene("borra", "borrar", "quita", "quitar", "elimina") && tiene("ultimo", "ultima", "anterior"))) {
    if (!pasos.length) return { estado: est, error: "No hay nada que deshacer" };
    const ult = pasos[pasos.length - 1];
    return { estado: { total: ult.antes, pasos: pasos.slice(0, -1), historial, op: null }, accion: "deshacer", decir: null };
  }

  // ---- operaciones ----
  let hizo = false;
  const nuevoCalculo = (v, texto) => {
    if (total !== null) historial = [...historial, { expr: textoPasos(pasos), total }].slice(-4);
    pasos = [{ antes: null, texto: texto || fmtNum(v) }];
    total = v;
  };
  const aplicar = (a, o, b) => {
    if (o === "+") return a + b;
    if (o === "-") return a - b;
    if (o === "*") return a * b;
    if (b === 0) throw new Error("No se puede dividir entre cero");
    return a / b;
  };
  const SIMBOLO = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  const operando = (v, textoValor) => {
    const tv = textoValor || fmtNum(v);
    if (total === null) {
      total = op === "-" ? -v : v;
      pasos = [{ antes: null, texto: op === "-" ? `−${tv}` : tv }];
    } else if (!op) {
      nuevoCalculo(v, tv);
    } else {
      const antes = total;
      total = aplicar(total, op, v);
      pasos.push({ antes, texto: `${SIMBOLO[op]} ${tv}` });
    }
    op = null; hizo = true;
  };
  const sobreTotal = (nuevo, texto) => {
    if (total === null) return false;
    pasos.push({ antes: total, texto });
    total = nuevo; op = null; hizo = true;
    return true;
  };

  try {
    for (let i = 0; i < tk.length; ) {
      const t = tk[i];
      if (ADD.has(t)) { op = "+"; i++; continue; }
      if (SUB.has(t)) { op = "-"; i++; continue; }
      if (MUL.has(t)) { op = "*"; i++; continue; }
      if (DIV.has(t)) { op = "/"; i++; continue; }

      if (t === "raiz") {
        let j = i + 1;
        if (tk[j] === "de") j++;
        if (SUB.has(tk[j])) throw new Error("No existe la raíz de un número negativo");
        const r = parseNumero(tk, j);
        if (r && r.next > j) {
          if (r.valor < 0) throw new Error("No existe la raíz de un número negativo");
          operando(Math.sqrt(r.valor), `√${fmtNum(r.valor)}`);
          i = r.next;
        } else {
          if (total !== null && total < 0) throw new Error("No existe la raíz de un número negativo");
          if (!sobreTotal(total === null ? 0 : Math.sqrt(total), "√")) throw new Error("Primero dime un número");
          i++;
        }
        continue;
      }
      if (t === "alcuadrado" || t === "alcubo") {
        const e = t === "alcuadrado" ? 2 : 3;
        if (!sobreTotal(total === null ? 0 : total ** e, e === 2 ? "²" : "³")) throw new Error("Primero dime un número");
        i++; continue;
      }
      if (t === "elevado") {
        const r = parseNumero(tk, i + 1);
        if (!r) throw new Error("¿Elevado a cuánto?");
        if (!sobreTotal(total === null ? 0 : total ** r.valor, `^${fmtNum(r.valor)}`)) throw new Error("Primero dime un número");
        i = r.next; continue;
      }
      if (t === "signo" && total !== null) { sobreTotal(-total, "±"); i++; continue; }

      const r = parseNumero(tk, i);
      if (r && r.next > i) {
        let v = r.valor;
        i = r.next;
        if (tk[i] === "porciento") {
          i++;
          if (tk[i] === "de") {
            const r2 = parseNumero(tk, i + 1);
            if (!r2) throw new Error("¿El porcentaje de cuánto?");
            operando((v / 100) * r2.valor, `${fmtNum(v)}% de ${fmtNum(r2.valor)}`);
            i = r2.next;
          } else if ((op === "+" || op === "-") && total !== null) {
            const nuevo = total * (1 + (op === "+" ? v : -v) / 100);
            pasos.push({ antes: total, texto: `${SIMBOLO[op]} ${fmtNum(v)}%` });
            total = nuevo; op = null; hizo = true;
          } else if (total !== null && !op) {
            sobreTotal((total * v) / 100, `${fmtNum(v)}% de ${fmtNum(total)}`);
          } else {
            operando(v / 100, `${fmtNum(v)}%`);
          }
        } else {
          operando(v);
        }
        continue;
      }
      i++; // relleno
    }
  } catch (e) {
    return { estado: { ...est, op: null }, error: e.message };
  }

  const nuevo = { total, pasos, historial, op };
  if (!hizo && !pedirResultado && op === est.op) return null;
  let decir = null;
  if (pedirResultado) decir = total === null ? "Todavía no hay operaciones" : hablarNum(total);
  return { estado: nuevo, decir, accion: "operacion" };
}

export const expresion = (est) => textoPasos(est.pasos);
