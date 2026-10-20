import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { interpretarLocal, tokenizar, parseNumero } from "./interpretarLocal";
import { buscarWake } from "./vozWake";
import { corregirNombres } from "./vozDiccionario";
import { nuevaCalculadora, procesarCalculadora, fmtNum, expresion } from "./vozCalculadora";
import { ejecutarUniversal, hayConfirmacionPendiente, ocultarNumeros } from "./vozUniversal";

// Móntalo UNA vez en el layout principal (App.jsx), fuera de los módulos,
// para que siga escuchando y conserve la cuenta al cambiar de módulo.
//
// <VozAsistente
//   productos={materiasPrimas}                       // [{ id, nombre }]
//   modulos={[
//     { id: "recepcion",  nombre: "Recepción",  alias: ["materia prima", "recibir"] },
//     { id: "produccion", nombre: "Producción", alias: ["manufactura"] },
//     { id: "ventas",     nombre: "Ventas" },
//   ]}
//   moduloActual={pagina}
//   onCambiarModulo={(id) => setPagina(id)}
//   onConfirmar={({ producto, cantidad, items, texto }) => ...}   // recepción
//   onComando={(texto, moduloId) => ...}             // gancho para otros módulos
// />
//
// Flujo: dormida → "Hey Veya" → despierta (20 s sin hablar y vuelve a dormir)
//        "Hey Veya, cambia a producción"
//        "Hey Veya, papada nacional sumar 22.7 más 10 más 8" ... "listo"

const SR = typeof window !== "undefined"
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

const NOMBRE = "Veya";
const VERBO_NAV = /\b(cambia|cambiar|cambiate|ve|ir|vamos|abre|abrir|llevame|muestrame|pasa|pasame)\b/;

const DESPIERTA_MS = 20000;       // inactividad sin cuenta abierta
const CUENTA_ABIERTA_MS = 10 * 60 * 1000;  // inactividad con una suma a medias (10 min)
const ESPERA_GUARDAR_MS = 4000;

const sinTildes = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sumar = (its) =>
  Math.round(its.reduce((t, i) => t + (i.op === "-" ? -i.valor : i.valor), 0) * 1000) / 1000;
const fmt = (n) => n.toLocaleString("es-CO", { maximumFractionDigits: 3 });

function pitido(veces = 1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < veces; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.1);
    }
  } catch { /* sin audio, no pasa nada */ }
}

export default function VozAsistente({
  productos, modulos = [], moduloActual, onCambiarModulo, onConfirmar, onComando, onNuevaRecepcion,
  idRecepcion = "recepcion", respuestasDeVoz = true,
  usarClaude = false, // false = 100% gratis y local; true = si el local no entiende, pregunta a Claude (API de pago)
}) {
  const [encendida, setEncendida] = useState(false);
  const [despierta, setDespierta] = useState(false);
  const [producto, setProducto] = useState(null);
  const [items, setItems] = useState([]);
  const [parcial, setParcial] = useState("");
  const [aviso, setAviso] = useState("");
  const [info, setInfo] = useState("");
  const [oido, setOido] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [micActivo, setMicActivo] = useState(false);
  const [lineaDestino, setLineaDestino] = useState(null);
  const [calc, setCalc] = useState(null);   // calculadora por voz (null = cerrada)
  const calcRef = useRef(null);

  // Los manejadores de voz se crean una sola vez: leen siempre lo último desde refs.
  const P = useRef({});
  P.current = { productos, modulos, onCambiarModulo, onConfirmar, onComando, onNuevaRecepcion, idRecepcion, respuestasDeVoz, usarClaude };
  const moduloRef = useRef(moduloActual);
  moduloRef.current = moduloActual;

  const recRef = useRef(null);
  const encendidaRef = useRef(false);
  const despiertaRef = useRef(false);
  const hablandoRef = useRef(false);
  const productoRef = useRef(null);
  const itemsRef = useRef([]);
  const textoRef = useRef([]);
  const guardandoRef = useRef(false);
  const timerRef = useRef(null);
  const suenoRef = useRef(null);
  const colaRef = useRef(Promise.resolve());
  const ultimoRef = useRef({ seg: "", t: 0 });
  const lockRef = useRef(null);
  const lineaDestinoRef = useRef(null);   // "línea 2 sumar…": suma sobre una línea que ya existe
  const nuevaLineaRef = useRef(false);    // "nueva línea …": fuerza una línea aparte
  const hablandoTimerRef = useRef(null);
  const reinicioRef = useRef(null);       // reinicio programado del micrófono
  const escuchandoRef = useRef(false);    // ¿el micrófono está realmente escuchando?
  const cambioMicRef = useRef(Date.now());
  const sesionIniRef = useRef(0);
  const esperaRef = useRef(300);

  function poner(prod, its) {
    productoRef.current = prod; itemsRef.current = its;
    setProducto(prod); setItems(its);
  }

  function limpiar() {
    clearTimeout(timerRef.current);
    guardandoRef.current = false; setGuardando(false);
    textoRef.current = [];
    lineaDestinoRef.current = null; setLineaDestino(null);
    nuevaLineaRef.current = false;
    poner(null, []); setAviso("");
  }

  function hablar(texto) {
    if (!P.current.respuestasDeVoz || !window.speechSynthesis) return;
    clearTimeout(hablandoTimerRef.current);
    hablandoRef.current = true; // mientras habla no se escucha a sí misma
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-CO";
    const liberar = () => {
      clearTimeout(hablandoTimerRef.current);
      hablandoTimerRef.current = setTimeout(() => { hablandoRef.current = false; }, 400);
    };
    u.onend = liberar; u.onerror = liberar;
    try { window.speechSynthesis.speak(u); } catch { liberar(); return; }
    // Seguro: si el navegador nunca avisa que terminó de hablar, se libera sola
    // (antes eso la dejaba sorda hasta apagarla y volverla a encender)
    hablandoTimerRef.current = setTimeout(() => { hablandoRef.current = false; }, Math.min(8000, 1500 + texto.length * 90));
  }

  function dormir() {
    clearTimeout(suenoRef.current);
    despiertaRef.current = false; setDespierta(false); setParcial("");
  }

  const cuentaAbierta = () => itemsRef.current.length > 0 || !!productoRef.current || !!lineaDestinoRef.current;
  const cerrarCalc = () => { if (calcRef.current) { calcRef.current = null; setCalc(null); } };

  function armarSueno() {
    clearTimeout(suenoRef.current);
    if (guardandoRef.current) return;
    const ms = (cuentaAbierta() || calcRef.current) ? CUENTA_ABIERTA_MS : DESPIERTA_MS;
    suenoRef.current = setTimeout(dormir, ms);
  }

  function despertar() {
    despiertaRef.current = true; setDespierta(true);
    pitido(1); armarSueno();
  }

  async function interpretar(seg) {
    // 1) Intérprete local (gratis, instantáneo)
    const local = interpretarLocal(seg, P.current.productos);
    if (local.nuevos.length || !P.current.usarClaude) return local;
    // 2) Respaldo opcional con Claude (solo si usarClaude={true})
    const { data, error } = await supabase.functions.invoke("interpretar-voz", {
      body: { texto: seg, productos: P.current.productos },
    });
    if (error || data?.error) throw new Error("fallo");
    const prod = P.current.productos.find((p) => String(p.id) === String(data.producto_id)) || null;
    return { prod, nuevos: data.items || [] };
  }

  function iniciarGuardado() {
    if ((!productoRef.current && !lineaDestinoRef.current) || !itemsRef.current.length) return;
    if (sumar(itemsRef.current) <= 0) return setAviso("El total debe ser mayor que cero.");
    clearTimeout(suenoRef.current);
    guardandoRef.current = true; setGuardando(true);
    pitido(1);
    timerRef.current = setTimeout(() => {
      const total = sumar(itemsRef.current);
      P.current.onNuevaRecepcion?.(); // asegura que el formulario de recepción esté abierto
      P.current.onConfirmar?.({
        producto: productoRef.current,
        cantidad: total,
        items: itemsRef.current,
        texto: textoRef.current.join(" | "),
        lineaDestino: lineaDestinoRef.current, // si dijo "línea 2 sumar…", suma sobre esa línea
        nueva: nuevaLineaRef.current,          // si dijo "nueva línea…", crea una aparte
      });
      pitido(2);
      limpiar();
      hablar(`Listo, ${fmt(total)} kilos`);
      armarSueno();
    }, ESPERA_GUARDAR_MS);
  }

  // Muestra (y dice en voz alta) el resultado de una orden
  function aplicarResultado(r, mantenerCalc = false) {
    if (!r.error && !mantenerCalc) cerrarCalc(); // otra función hizo algo: la calculadora se cierra
    if (r.error) { setAviso(r.mensaje || ""); setInfo(""); }
    else { setAviso(""); setInfo(r.mensaje || ""); }
    if (r.mensaje) hablar(r.mensaje);
  }

  async function manejar(seg) {
    seg = corregirNombres(seg); // "Joe" → "Yohe", etc. (ver vozDiccionario.js)
    let resto = sinTildes(seg);
    let restoOrig = seg; // mismo texto con tildes y mayúsculas, para nombres y notas

    // 1) Palabra de activación
    const m = buscarWake(resto);
    if (m) {
      resto = resto.slice(m.index + m.largo).trim();
      restoOrig = seg.slice(m.index + m.largo).trim();
      if (!despiertaRef.current) despertar(); else armarSueno();
      if (!resto) { hablar("Dime"); return; }
    } else if (!despiertaRef.current) {
      setOido(seg); // se muestra en gris para ver cómo escribe el micrófono el nombre
      return;       // dormida: ignora todo lo que no empiece con el nombre
    }
    setOido(restoOrig);
    let forzarRecepcion = false; // true cuando dijo "sumar recepción"

    // 2) Cuenta regresiva de guardado: solo vale "cancela"
    if (guardandoRef.current) {
      if (/\b(cancela|cancelar|deten|detener|espera)\b/.test(resto)) {
        limpiar(); pitido(1); hablar("Cancelado"); armarSueno();
      }
      return;
    }

    // 3) Dormir
    if (/\b(duermete|gracias)\b/.test(resto)) { dormir(); return; }

    // 3a) El control universal pidió confirmación ("confirmo" / "cancela")
    if (hayConfirmacionPendiente()) {
      const u = ejecutarUniversal(resto, restoOrig);
      if (u) { aplicarResultado(u); armarSueno(); return; }
    }

    // 3a2) CALCULADORA: "abrir calculadora" … operaciones … "cerrar calculadora"
    //      Mientras está abierta, los números son suyos. Si pides otra función, se cierra sola y se hace esa función.
    const reAbrirCalc = /\b(?:abre|abrir|abra|inicia|iniciar|activa|activar|enciende|encender|prende|prender|usa|usar)\s+(?:la\s+)?calculadora\b|^(?:la\s+)?calculadora$/;
    const reCerrarCalc = /\b(?:cierra|cerrar|cierre|salir|sal|termina|terminar|apaga|apagar|quita|quitar)\s+(?:de\s+)?(?:la\s+)?calculadora\b/;
    if (calcRef.current && reCerrarCalc.test(resto)) {
      cerrarCalc(); setAviso(""); setInfo("Calculadora cerrada"); hablar("Calculadora cerrada");
      armarSueno(); return;
    }
    const mCalc = resto.match(reAbrirCalc);
    if (mCalc) {
      const yaAbierta = !!calcRef.current;
      if (!yaAbierta && cuentaAbierta()) {
        setAviso('Hay una suma sin guardar. Di "listo" para guardarla o "cancela" para borrarla.');
        hablar("Primero guarda o cancela la suma");
        armarSueno(); return;
      }
      if (!yaAbierta) {
        calcRef.current = nuevaCalculadora(); setCalc(calcRef.current);
        setAviso(""); setInfo("Calculadora abierta. Dime las operaciones");
      }
      const sinFrase = (t) => (t.slice(0, mCalc.index) + " " + t.slice(mCalc.index + mCalc[0].length)).trim();
      resto = sinFrase(resto); restoOrig = sinFrase(restoOrig);
      if (!resto) {
        if (yaAbierta) setInfo("La calculadora ya está abierta"); else hablar("Calculadora abierta");
        armarSueno(); return;
      }
    }
    if (calcRef.current) {
      // "pasa el resultado al campo cantidad" / "escribe el resultado": lo lleva al campo, la calculadora sigue abierta
      const mPasa = resto.match(/\b(?:pasa|pasar|escribe|escribir|pon|poner|copia|copiar|lleva|llevar|ingresa|ingresar|coloca|colocar)\s+(?:el\s+|la\s+)?(?:resultado|total)(?:\s+(?:al|en\s+el|en\s+la|en|a\s+la|a)\s+(?:campo\s+)?(.+))?\s*$/);
      if (mPasa) {
        const t = calcRef.current.total;
        if (t === null) { setInfo(""); setAviso("Todavía no hay un resultado para pasar."); armarSueno(); return; }
        const valor = String(Math.round(t * 1e9) / 1e9);
        const campo = (mPasa[1] || "").trim();
        const frase = campo ? `${campo} ${valor}` : `escribe ${valor}`;
        let u = null;
        try { u = ejecutarUniversal(frase, frase); }
        catch (e) { console.error("[Veya] pasar resultado:", e); }
        if (u) aplicarResultado(u, true);
        else { setInfo(""); setAviso(campo ? `No encontré el campo «${campo}»` : "Toca o nombra primero un campo, por ejemplo: pasa el resultado al campo cantidad"); }
        armarSueno(); return;
      }
      const rc = procesarCalculadora(calcRef.current, resto);
      if (rc) {
        calcRef.current = rc.estado; setCalc(rc.estado);
        if (rc.error) { setInfo(""); setAviso(rc.error); hablar(rc.error); }
        else { setAviso(""); setInfo(""); if (rc.decir) hablar(rc.decir); }
        armarSueno(); return;
      }
      // No era matemática: sigue el flujo normal. Si otra función la atiende, la calculadora se cierra.
    }

    // 3b) "Sumar recepción" (o "nueva recepción"): abre Calidad y el formulario.
    //     Un "sumar" solo NO sirve para esto, porque otros módulos también suman.
    const reSumarRec = /\bsumar\s+(?:la\s+)?recepcion\b/;
    const reNueva = /\b(nueva|registrar|iniciar|empezar|comenzar)\b.*\brecepcion\b/;
    const msr = resto.match(reSumarRec);
    if (msr) {
      if (!P.current.modulos.some((x) => x.id === P.current.idRecepcion)) {
        setAviso("No tienes acceso al módulo de recepción.");
        hablar("No tienes acceso a recepción");
        armarSueno();
        return;
      }
      forzarRecepcion = true;
      cerrarCalc();
      const quitar = (t) => (t.slice(0, msr.index) + " " + t.slice(msr.index + msr[0].length)).trim();
      resto = quitar(resto);
      restoOrig = quitar(restoOrig);
      setAviso(""); setInfo("");
      P.current.onNuevaRecepcion?.();
      if (!resto) {
        setInfo("Recepción: dime el producto y las cantidades");
        hablar("Dime el producto y las cantidades");
        armarSueno();
        return;
      }
    } else if (reNueva.test(resto)) {
      if (!P.current.modulos.some((x) => x.id === P.current.idRecepcion)) {
        setAviso("No tienes acceso al módulo de recepción.");
        hablar("No tienes acceso a recepción");
      } else if (cuentaAbierta()) {
        setAviso('Hay una cuenta sin guardar. Di "listo" para guardar o "cancela" para borrarla.');
        hablar("Primero guarda o cancela la cuenta");
      } else {
        cerrarCalc();
        setAviso(""); setInfo("");
        P.current.onNuevaRecepcion?.();
        hablar("Abriendo recepción");
      }
      armarSueno();
      return;
    }

    // 3c) "Línea 2 sumar 10 más 5": suma sobre una línea que ya está en el formulario.
    //     "Nueva línea papada nacional sumar 10": fuerza una línea aparte.
    //     (Sin esto, repetir un producto en el formulario siempre creaba otra línea.)
    if ((moduloRef.current === P.current.idRecepcion || forzarRecepcion) && /\bsumar\b/.test(resto)) {
      const quitarPor = (mm) => {
        const f = (t) => t.slice(0, mm.index) + " " + t.slice(mm.index + mm[0].length);
        resto = f(resto); restoOrig = f(restoOrig);
      };
      const mNueva = resto.match(/\bnueva\s+linea\b/);
      if (mNueva) { nuevaLineaRef.current = true; quitarPor(mNueva); }
      const mLin = resto.match(/\b(?:a\s+la\s+|en\s+la\s+|la\s+)?(?:linea|renglon)\s+(?:numero\s+)?([a-z0-9]+)\b/);
      if (mLin) {
        const tk = tokenizar(mLin[1]);
        const rl = tk.length ? parseNumero(tk, 0) : null;
        if (rl && rl.next === tk.length && Number.isInteger(rl.valor) && rl.valor >= 1) {
          cerrarCalc();
          lineaDestinoRef.current = rl.valor; setLineaDestino(rl.valor);
          quitarPor(mLin);
        }
      }
      resto = resto.replace(/\s+/g, " ").trim();
      restoOrig = restoOrig.replace(/\s+/g, " ").trim();
    }

    // 4) Cambiar de módulo
    if (VERBO_NAV.test(resto)) {
      const destino = P.current.modulos.find((mod) =>
        [mod.nombre, ...(mod.alias || [])].some((a) =>
          new RegExp(`\\b${escapar(sinTildes(a))}\\b`).test(resto)));
      if (destino) {
        if (cuentaAbierta()) {
          setAviso('Hay una cuenta sin guardar. Di "listo" para guardar o "cancela" para borrarla.');
          hablar("Primero guarda o cancela la cuenta");
        } else {
          cerrarCalc();
          setAviso(""); setInfo("");
          P.current.onCambiarModulo?.(destino.id);
          hablar(`Abriendo ${destino.nombre}`);
        }
        armarSueno();
        return;
      }
    }

    // 5) Formularios por voz: el módulo en pantalla puede quedarse con la frase
    //    ("proveedor …", "temperatura …", "guardar recepción"…)
    const r = P.current.onComando?.(resto, moduloRef.current, restoOrig);
    if (r) {
      aplicarResultado(r);
      armarSueno();
      return;
    }

    // 5b) Fuera del módulo de recepción solo se atiende "sumar recepción".
    //     Un "sumar" suelto en otro módulo le pertenece a ese módulo.
    //     Lo demás se intenta con el control universal: botones y campos por su nombre en pantalla
    //     ("nueva compra", "pulsa imprimir", "proveedor Cárnicos del Valle"…).
    if (moduloRef.current !== P.current.idRecepcion && !forzarRecepcion) {
      let u = null;
      try { u = ejecutarUniversal(resto, restoOrig); }
      catch (e) { console.error("[Veya] control universal:", e); u = { mensaje: "Error en el control universal: " + (e?.message || e), error: true }; }
      if (u) aplicarResultado(u);
      else { setInfo(""); setAviso(`No encontré «${restoOrig}» en esta pantalla. Di «qué puedo decir»`); }
      armarSueno();
      return;
    }

    // 6) Recepción: dictado tipo calculadora
    //    "borra" / "quita el último" → quita SOLO el último número
    //    "quita el número 2"         → quita ese número
    //    "borra todo" / "cancela"    → borra toda la suma
    if (/\b(cancela|cancelar|reinicia|reiniciar|borra todo|borrar todo|elimina todo|borra la suma|borra la cuenta|empezar de nuevo|desde cero)\b/.test(resto)) {
      limpiar(); hablar("Suma borrada"); armarSueno(); return;
    }
    if (cuentaAbierta()) {
      const mNum = resto.match(/\b(?:quita|quitar|borra|borrar|elimina|eliminar)\s+(?:el\s+)?(?:numero|valor)\s+([a-z0-9]+)\b/);
      if (mNum) {
        const tk = tokenizar(mNum[1]);
        const rn = tk.length ? parseNumero(tk, 0) : null;
        const k = rn && rn.next === tk.length && Number.isInteger(rn.valor) ? rn.valor - 1 : -1;
        if (k >= 0 && k < itemsRef.current.length) {
          const q = itemsRef.current[k];
          poner(productoRef.current, itemsRef.current.filter((_, j) => j !== k));
          setAviso(""); setInfo(`Quité el ${fmt(q.valor)}`); hablar(`Quité el ${fmt(q.valor)}`);
        } else {
          setAviso(`No hay un número ${rn ? rn.valor : ""} en la suma.`);
        }
        armarSueno(); return;
      }
      if (/^(?:quita|quitar|borra|borrar|elimina|eliminar)(?:\s+(?:el|la))?(?:\s+(?:ultimo|ultima|anterior))?(?:\s+(?:numero|valor|cantidad))?$/.test(resto)) {
        if (itemsRef.current.length) {
          const q = itemsRef.current[itemsRef.current.length - 1];
          poner(productoRef.current, itemsRef.current.slice(0, -1));
          setAviso(""); setInfo(`Quité el ${fmt(q.valor)}`); hablar(`Quité el ${fmt(q.valor)}`);
        } else {
          setAviso("No hay números para quitar.");
        }
        armarSueno(); return;
      }
    }

    const reListo = /\b(listo|confirmo|confirmar)\b/;
    const terminar = reListo.test(resto);
    const texto = terminar ? resto.replace(new RegExp(reListo.source, "g"), "").trim() : resto;

    if (texto && /[a-z0-9]/.test(texto)) {
      try {
        const { prod, nuevos } = await interpretar(texto);
        if (productoRef.current && prod && String(prod.id) !== String(productoRef.current.id)) {
          setAviso(`Dijiste "${prod.nombre}" pero hay una cuenta de "${productoRef.current.nombre}". Di "cancela" para empezar de nuevo.`);
          armarSueno();
          return;
        }
        if (nuevos.length) {
          cerrarCalc();
          setAviso(""); setInfo("");
          textoRef.current.push(texto);
          poner(productoRef.current || prod, [...itemsRef.current, ...nuevos]);
          pitido(1);
        } else if (prod && !productoRef.current) {
          // Llegó solo el nombre del producto (el micrófono parte la frase en las pausas):
          // se guarda y se esperan los números en la siguiente frase.
          cerrarCalc();
          setAviso("");
          poner(prod, itemsRef.current);
          setInfo(`${prod.nombre}: dime las cantidades`);
          pitido(1);
        } else if (lineaDestinoRef.current && !terminar && !productoRef.current) {
          setAviso(""); setInfo(`Línea ${lineaDestinoRef.current}: dime las cantidades`);
        } else if (!terminar) {
          let u = null;
          try { u = ejecutarUniversal(resto, restoOrig); }
          catch (e) { console.error("[Veya] control universal:", e); }
          if (u) aplicarResultado(u);
          else setAviso(`No entendí las cantidades. Oí: «${restoOrig}»`);
        }
      } catch {
        setAviso("Falló la interpretación. Repite el último número.");
      }
    }

    if (terminar) {
      if (!productoRef.current && !lineaDestinoRef.current) setAviso("No sé qué producto es. Di el nombre del producto.");
      else if (!itemsRef.current.length) setAviso("Faltan las cantidades.");
      else iniciarGuardado();
    }
    armarSueno();
  }

  function encolar(seg) {
    if (!seg || hablandoRef.current) return; // no escucharse a sí misma
    const ahora = Date.now();
    // Chrome en Android a veces repite el mismo resultado final
    if (seg === ultimoRef.current.seg && ahora - ultimoRef.current.t < 1500) return;
    ultimoRef.current = { seg, t: ahora };
    colaRef.current = colaRef.current
      .then(() => manejar(seg))
      .catch((e) => { console.error("[Veya] error:", e); setAviso("Error interno: " + (e?.message || e)); });
  }

  // El micrófono se vuelve a crear desde cero cada vez que se corta. Antes, si Chrome rechazaba
  // un reinicio, quedaba sordo para siempre (había que apagar y volver a activar).
  function programarReinicio(ms) {
    clearTimeout(reinicioRef.current);
    if (!encendidaRef.current) return;
    reinicioRef.current = setTimeout(() => { if (encendidaRef.current) arrancarReconocimiento(); }, ms);
  }

  function arrancarReconocimiento() {
    clearTimeout(reinicioRef.current);
    const vieja = recRef.current;
    if (vieja) {
      vieja.onresult = vieja.onend = vieja.onerror = vieja.onstart = null;
      try { vieja.abort(); } catch { /* ya estaba detenida */ }
    }
    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      escuchandoRef.current = true; cambioMicRef.current = Date.now(); sesionIniRef.current = Date.now();
      setMicActivo(true);
    };
    rec.onresult = (e) => {
      let interino = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) encolar(r[0].transcript.trim());
        else interino += r[0].transcript;
      }
      setParcial(despiertaRef.current ? interino : "");
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        encendidaRef.current = false; setEncendida(false);
        setAviso("Permite el micrófono en el navegador.");
      }
    };
    rec.onend = () => {
      escuchandoRef.current = false; cambioMicRef.current = Date.now();
      setMicActivo(false); setParcial("");
      // Si la sesión duró poco (error o sin red) se espera más antes de reintentar
      const duro = Date.now() - sesionIniRef.current;
      esperaRef.current = duro < 1500 ? Math.min(3000, esperaRef.current * 2) : 300;
      programarReinicio(esperaRef.current);
    };
    recRef.current = rec;
    cambioMicRef.current = Date.now();
    try { rec.start(); }
    catch { escuchandoRef.current = false; programarReinicio(1000); }
  }

  async function encender() {
    if (!SR) return setAviso("Este navegador no soporta voz. Usa Chrome en Android.");
    encendidaRef.current = true; setEncendida(true); setAviso("");
    esperaRef.current = 300;
    try { lockRef.current = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
    arrancarReconocimiento();
  }

  function apagar() {
    encendidaRef.current = false; setEncendida(false); setMicActivo(false);
    clearTimeout(reinicioRef.current);
    const r = recRef.current;
    if (r) { r.onresult = r.onend = r.onerror = r.onstart = null; try { r.abort(); } catch { /* nada */ } }
    lockRef.current?.release?.();
    dormir(); limpiar(); setInfo(""); setOido(""); ocultarNumeros(); cerrarCalc();
  }

  // Vigilante: si el micrófono lleva más de 2,5 s sin escuchar estando encendida, lo reinicia
  useEffect(() => {
    const t = setInterval(() => {
      if (encendidaRef.current && !escuchandoRef.current && Date.now() - cambioMicRef.current > 2500) {
        arrancarReconocimiento();
      }
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => {
    encendidaRef.current = false;
    clearTimeout(reinicioRef.current);
    clearTimeout(hablandoTimerRef.current);
    recRef.current?.stop();
    lockRef.current?.release?.();
    clearTimeout(timerRef.current);
    clearTimeout(suenoRef.current);
  }, []);

  const total = sumar(items);
  const moduloNombre = modulos.find((x) => x.id === moduloActual)?.nombre;
  const estado = !encendida ? "Apagada"
    : guardando ? 'Guardando… di "cancela" para detener'
    : !despierta ? `Dormida — di «Hey ${NOMBRE}»`
    : calc ? "Calculadora — dime las operaciones"
    : (producto || lineaDestino) ? 'Te escucho — di "listo" al terminar'
    : "Te escucho";
  const estadoMic = encendida && !micActivo ? " · reconectando micrófono…" : "";

  return (
    <div data-voz-ignorar style={s.raiz}>
      <style>{`@keyframes llenar { from { width: 0 } to { width: 100% } }`}</style>

      {!encendida ? (
        // APAGADA: solo un icono redondo. Al tocarlo se activa a Veya y se abre la ventana.
        <button aria-label="Activar asistente de voz" onClick={encender} style={s.burbuja}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4" y1="4" x2="20" y2="20" />
          </svg>
        </button>
      ) : (
        // ENCENDIDA: la ventana pequeña de siempre. Al pulsar «Apagar» vuelve el icono.
        <div style={s.caja}>
          <div style={s.barra}>
            <span style={{ ...s.punto, background: guardando ? "#2e7d32" : despierta ? "#B22222" : "#999" }} />
            <div style={s.textos}>
              <span style={s.estado}>{estado}{estadoMic}</span>
              {moduloNombre && <span style={s.modulo}>Módulo: {moduloNombre}</span>}
            </div>
            <button style={s.apagar} onClick={apagar}>Apagar</button>
          </div>

          {aviso && <p style={s.aviso}>{aviso}</p>}
          {info && <p style={s.info}>{info}</p>}
          {oido && <p style={s.oido}>Oí: «{oido}»</p>}

          {calc && (
            <div style={s.calc}>
              <div style={s.calcTitulo}>
                <span>🧮 Calculadora</span>
                <button style={s.calcCerrar} onClick={cerrarCalc}>Cerrar</button>
              </div>
              {calc.historial.slice(-3).map((h, k) => (
                <p key={k} style={s.calcHist}>{h.expr} = {fmtNum(h.total)}</p>
              ))}
              <p style={s.calcExpr}>
                {expresion(calc) || "…"}{calc.op ? ` ${{ "+": "+", "-": "−", "*": "×", "/": "÷" }[calc.op]}` : ""}
              </p>
              <p style={s.total}>{fmtNum(calc.total)}</p>
            </div>
          )}

          {(producto || items.length > 0 || lineaDestino) && (
            <div style={s.resultado}>
              <p style={s.producto}>
                {lineaDestino
                  ? `Línea ${lineaDestino}${producto ? " · " + producto.nombre : ""}`
                  : producto ? producto.nombre : "Producto sin identificar"}
              </p>
              <p style={s.cuenta}>
                {items.map((i, k) => (
                  <span key={k}>{k > 0 || i.op === "-" ? ` ${i.op} ` : ""}{fmt(i.valor)}</span>
                ))}
              </p>
              <p style={s.total}>{fmt(total)} kg</p>
              {guardando && <div style={s.progreso}><div style={s.progresoRelleno} /></div>}
            </div>
          )}

          {parcial && <p style={s.parcial}>{parcial}</p>}
        </div>
      )}
    </div>
  );
}

const s = {
  raiz: { position: "fixed", right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 30 },
  burbuja: { width: 52, height: 52, borderRadius: "50%", border: "2px solid #fff", background: "#8a8178", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(0,0,0,.35)", cursor: "pointer", padding: 0 },
  caja: { display: "flex", flexDirection: "column", gap: 12, padding: 12, background: "#F4F1ED", borderRadius: 10, width: "min(340px, calc(100vw - 24px))", boxSizing: "border-box", boxShadow: "0 4px 18px rgba(0,0,0,.28)", maxHeight: "70vh", overflowY: "auto" },
  barra: { display: "flex", alignItems: "center", gap: 10 },
  punto: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0 },
  textos: { flex: 1, display: "flex", flexDirection: "column" },
  estado: { fontSize: 18, color: "#333" },
  modulo: { fontSize: 14, color: "#777" },
  apagar: { fontSize: 14, padding: "6px 12px", background: "#fff", border: "1px solid #bbb", borderRadius: 8 },
  aviso: { margin: 0, fontSize: 18, color: "#B22222" },
  info: { margin: 0, fontSize: 18, color: "#1A7F45" },
  oido: { margin: 0, fontSize: 13, color: "#999" },
  resultado: { display: "flex", flexDirection: "column", gap: 4 },
  calc: { display: "flex", flexDirection: "column", gap: 4 },
  calcTitulo: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 700, color: "#444" },
  calcCerrar: { fontSize: 13, padding: "4px 10px", background: "#fff", border: "1px solid #bbb", borderRadius: 8, color: "#555" },
  calcHist: { margin: 0, fontSize: 14, color: "#999", wordBreak: "break-word" },
  calcExpr: { margin: 0, fontSize: 20, color: "#555", wordBreak: "break-word" },
  producto: { margin: 0, fontSize: 26, fontWeight: 700, color: "#222" },
  cuenta: { margin: 0, fontSize: 24, color: "#444", wordBreak: "break-word" },
  total: { margin: 0, fontSize: 64, fontWeight: 800, color: "#222", lineHeight: 1.1 },
  parcial: { margin: 0, fontSize: 18, color: "#888", fontStyle: "italic" },
  progreso: { height: 10, background: "#ddd", borderRadius: 5, overflow: "hidden", marginTop: 6 },
  progresoRelleno: { height: "100%", background: "#2e7d32", animation: `llenar ${ESPERA_GUARDAR_MS}ms linear forwards` },
};