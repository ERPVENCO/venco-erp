// src/reportes/useDashboardData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { dashboardConfig } from './dashboardConfig';
import { obtenerCache, estaVencido, guardarCache } from './dashboardCache';
import { formatearSegunTipo, formatearNumero } from './formato';

const TTL_DEFAULT_MINUTOS = 10;

// Resuelve, por cada vista usada en un área, el TTL más corto entre los
// KPIs que la consumen. Si dos KPIs de la misma vista piden TTLs distintos,
// gana el más exigente: así nunca se muestra algo más viejo de lo que
// alguno de los dos esperaba.
function resolverVistasDeArea(area) {
  const kpisDelArea = dashboardConfig.filter((k) => k.area === area);
  const vistas = new Map(); // vista -> ttlMinutos
  kpisDelArea.forEach((kpi) => {
    const vista = kpi.fuente.vista;
    const ttl = kpi.cache?.ttlMinutos ?? TTL_DEFAULT_MINUTOS;
    const actual = vistas.get(vista);
    if (actual === undefined || ttl < actual) vistas.set(vista, ttl);
  });
  return vistas;
}

// Del resultado crudo de la vista, saca el valor que le corresponde a
// este KPI en particular según su tipo.
function extraerValor(kpi, filas) {
  if (!filas || filas.length === 0) return null;
  if (kpi.tipo === 'kpi_top' || kpi.tipo === 'kpi_lista') {
    const primera = filas[0];
    return { nombre: primera[kpi.fuente.campoNombre], valor: primera[kpi.fuente.campoValor] };
  }
  return filas[0][kpi.fuente.campo];
}

// Si el KPI tiene comparativo activo, busca <campo>_anterior en la misma
// fila (convención usada en las vistas, ej. total_dia / total_dia_anterior)
// y calcula el % de cambio. Devuelve null si no aplica o no hay base > 0.
function calcularTendencia(kpi, filas) {
  if (!kpi.comparativo?.activo || !filas || filas.length === 0) return null;
  const fila = filas[0];
  const actual = fila[kpi.fuente.campo];
  const anterior = fila[`${kpi.fuente.campo}_anterior`];
  if (actual == null || anterior == null || anterior === 0) return null;
  const cambio = ((actual - anterior) / anterior) * 100;
  return { porcentaje: cambio, subida: cambio >= 0 };
}

// Evalúa si el KPI debe mostrar el semáforo de alerta, según el umbral
// definido en dashboardConfig.js. Es una regla de negocio — por eso vive
// acá, no en el widget de presentación.
function evaluarAlerta(kpi, valor) {
  if (!kpi.alerta || valor == null) return false;
  const valorNumerico = typeof valor === 'object' ? valor.valor : valor;
  const { condicion, umbral } = kpi.alerta;
  if (condicion === 'mayor_que') return valorNumerico > umbral;
  if (condicion === 'menor_que') return valorNumerico < umbral;
  return false;
}

function textoComparativo(contra) {
  if (contra === 'dia_anterior') return 'vs ayer';
  if (contra === 'mes_anterior') return 'vs mes anterior';
  return '';
}

// Adaptador: convierte el KPI "crudo" (config + valor de la vista) en
// props ya listas para <KPICard/> — formateadas, con alerta resuelta y
// texto de tendencia armado. El widget ya no decide nada, solo pinta.
function prepararParaVista(kpi, valor, tendencia) {
  const esCompuesto = kpi.tipo === 'kpi_top' || kpi.tipo === 'kpi_lista';
  return {
    valorFormateado: esCompuesto
      ? (valor?.nombre ?? '—')
      : formatearSegunTipo(valor, kpi.formato),
    secundarioFormateado: esCompuesto && valor
      ? formatearNumero(valor.valor)
      : null,
    alertaActiva: evaluarAlerta(kpi, valor),
    alertaMensaje: kpi.alerta?.mensaje ?? null,
    tendenciaTexto: tendencia
      ? `${Math.abs(tendencia.porcentaje).toFixed(1)}% ${textoComparativo(kpi.comparativo?.contra)}`
      : null,
    tendenciaSubida: tendencia?.subida ?? null,
  };
}

/**
 * Carga los datos de un área del dashboard (ej. 'ventas', 'finanzas').
 *
 * - Widgets independientes: cada vista de la sección se pide en paralelo,
 *   cada una con su propio try/catch — si una falla, las demás igual
 *   se muestran con su dato.
 * - Lazy loading: no dispara ninguna consulta hasta que `activo` sea true.
 *   Quien use el hook (típicamente <SectionDashboard/> con un
 *   IntersectionObserver) decide cuándo la sección "entra en pantalla".
 * - Caché por TTL: si el dato en memoria no está vencido para esa vista,
 *   se usa el que ya hay y no se vuelve a consultar Supabase.
 *
 * El drill-down (detalle al hacer clic en un KPI) NO se carga acá —
 * vive en un hook aparte (useDrilldownData) que solo consulta cuando
 * el usuario abre el panel de detalle.
 */
export function useDashboardData(area, { activo = true } = {}) {
  const [datosPorVista, setDatosPorVista] = useState({});
  const [cargando, setCargando] = useState({});
  const [errores, setErrores] = useState({});
  const [ultimaActualizacion, setUltimaActualizacion] = useState({});
  const vistasRef = useRef(resolverVistasDeArea(area));

  const cargarVista = useCallback(async (vista, ttlMinutos, { forzar = false } = {}) => {
    if (!forzar && !estaVencido(vista, ttlMinutos)) {
      const enCache = obtenerCache(vista);
      setDatosPorVista((prev) => ({ ...prev, [vista]: enCache.data }));
      setUltimaActualizacion((prev) => ({ ...prev, [vista]: enCache.timestamp }));
      return;
    }
    setCargando((prev) => ({ ...prev, [vista]: true }));
    setErrores((prev) => ({ ...prev, [vista]: null }));
    try {
      const { data, error } = await supabase.from(vista).select('*');
      if (error) throw error;
      guardarCache(vista, data);
      setDatosPorVista((prev) => ({ ...prev, [vista]: data }));
      setUltimaActualizacion((prev) => ({ ...prev, [vista]: Date.now() }));
    } catch (err) {
      setErrores((prev) => ({ ...prev, [vista]: err.message }));
    } finally {
      setCargando((prev) => ({ ...prev, [vista]: false }));
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    // Cada vista se dispara por separado (Promise implícito en paralelo,
    // sin await entre ellas) — ninguna bloquea a las demás.
    vistasRef.current.forEach((ttlMinutos, vista) => {
      cargarVista(vista, ttlMinutos);
    });
  }, [activo, cargarVista]);

  const refrescarArea = useCallback(() => {
    vistasRef.current.forEach((ttlMinutos, vista) => {
      cargarVista(vista, ttlMinutos, { forzar: true });
    });
  }, [cargarVista]);

  // Combina la config declarativa con los datos ya cargados — listo para
  // que el componente solo itere y pinte, sin lógica de fetch.
  const kpis = dashboardConfig
    .filter((k) => k.area === area)
    .sort((a, b) => a.orden - b.orden)
    .map((kpi) => {
      const vista = kpi.fuente.vista;
      const valor = extraerValor(kpi, datosPorVista[vista]);
      const tendencia = calcularTendencia(kpi, datosPorVista[vista]);
      return {
        ...kpi,
        ...prepararParaVista(kpi, valor, tendencia),
        cargando: cargando[vista] ?? activo,
        error: errores[vista] ?? null,
        actualizadoEn: ultimaActualizacion[vista] ?? null,
      };
    });

  return { kpis, refrescarArea };
}