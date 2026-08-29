// src/reportes/dashboardCache.js
//
// Caché en memoria para los datos del Dashboard Gerencial.
// Vive mientras la pestaña esté abierta — no usa localStorage: los KPIs
// deben reflejar datos frescos de esta sesión, no de hace días.
//
// Clave = nombre de la vista SQL (no el id del KPI, porque varios KPIs
// pueden compartir la misma vista — ver dashboardConfig.js).

const store = new Map(); // vista -> { data, timestamp }

export function obtenerCache(vista) {
  return store.get(vista) ?? null;
}

export function estaVencido(vista, ttlMinutos) {
  const entrada = store.get(vista);
  if (!entrada) return true;
  const edadMs = Date.now() - entrada.timestamp;
  return edadMs > ttlMinutos * 60 * 1000;
}

export function guardarCache(vista, data) {
  store.set(vista, { data, timestamp: Date.now() });
}

export function invalidar(vista) {
  store.delete(vista);
}

export function invalidarTodo() {
  store.clear();
}
