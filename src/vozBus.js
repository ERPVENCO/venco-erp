// Puente entre el asistente de voz (que vive en App.jsx) y el formulario
// de recepción (RegistrarRecepcion.jsx). Tres canales:
//
// 1) LÍNEAS DICTADAS ("papada nacional sumar 22.7 más 10" + "listo")
//    publicarRecepcionVoz / tomarRecepcionesVoz. Si el formulario aún no está
//    abierto, las líneas esperan en una cola y se aplican al abrirse.
//
// 2) ÓRDENES DE FORMULARIO ("proveedor …", "factura …", "temperatura …")
//    El formulario se registra como manejador mientras está abierto;
//    el asistente le pasa cada frase y el formulario dice si la usó.
//
// 3) ABRIR EL FORMULARIO ("nueva recepción")
//    solicitarAperturaRecepcion / consumirAperturaRecepcion. Calidad.jsx lo escucha.

const CLAVE_COLA = '__vozRecepcionCola'
const CLAVE_ABRIR = '__vozAbrirRecepcion'

// ---- 1) líneas dictadas ----
export function publicarRecepcionVoz(detalle) {
  window[CLAVE_COLA] = [...(window[CLAVE_COLA] || []), detalle]
  window.dispatchEvent(new CustomEvent('voz:recepcion'))
}

export function tomarRecepcionesVoz() {
  const cola = window[CLAVE_COLA] || []
  window[CLAVE_COLA] = []
  return cola
}

// ---- 2) órdenes de formulario ----
let manejador = null

export function registrarManejadorVoz(fn) {
  manejador = fn
  return () => { if (manejador === fn) manejador = null }
}

// Devuelve null si nadie usó la frase, o { mensaje, error } si el formulario la atendió.
export function emitirComandoVoz(norm, _moduloId, orig) {
  return manejador ? manejador(norm, orig ?? norm) : null
}

// ---- 3) abrir el formulario ----
export function solicitarAperturaRecepcion() {
  window[CLAVE_ABRIR] = true
  window.dispatchEvent(new CustomEvent('voz:abrir-recepcion'))
}

// Mira si hay una solicitud pendiente SIN consumirla (la usa Calidad para abrir el submódulo;
// el formato de recepción la consume al abrir el formulario).
export function hayAperturaRecepcion() {
  return !!window[CLAVE_ABRIR]
}

export function consumirAperturaRecepcion() {
  const pedida = !!window[CLAVE_ABRIR]
  window[CLAVE_ABRIR] = false
  return pedida
}