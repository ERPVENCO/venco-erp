// src/reportes/formato.js
//
// Funciones puras de formateo. No conocen KPIs, ni Supabase, ni reglas
// de negocio — solo transforman un número en un string para mostrar.
// Las usa la capa de datos/adaptadores, NUNCA los widgets directamente.

export function formatearMoneda(valor) {
  if (valor == null) return '—';
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

export function formatearNumero(valor) {
  if (valor == null) return '—';
  return Number(valor).toLocaleString('es-CO');
}

export function formatearPorcentaje(valor, decimales = 0) {
  if (valor == null) return '—';
  return `${Number(valor).toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`;
}

export function formatearSegunTipo(valor, formato) {
  if (formato === 'moneda') return formatearMoneda(valor);
  if (formato === 'numero') return formatearNumero(valor);
  if (formato === 'porcentaje') return formatearPorcentaje(valor);
  return valor == null ? '—' : String(valor);
}
