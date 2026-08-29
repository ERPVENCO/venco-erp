// src/reportes/SectionDashboard.jsx
import { useEffect, useRef, useState } from 'react';
import { useDashboardData } from './useDashboardData';
import { AREAS } from './dashboardConfig';
import KPICard from './KPICard';
import './reportes.css';

// Convierte "hace cuánto" en texto legible, para el timestamp de la sección
function formatearHace(timestampMs) {
  if (!timestampMs) return null;
  const minutos = Math.round((Date.now() - timestampMs) / 60000);
  if (minutos < 1) return 'justo ahora';
  if (minutos === 1) return 'hace 1 min';
  return `hace ${minutos} min`;
}

export default function SectionDashboard({ area }) {
  const [enPantalla, setEnPantalla] = useState(false);
  const [kpiSeleccionado, setKpiSeleccionado] = useState(null);
  const contenedorRef = useRef(null);

  // Lazy loading: la sección solo pide datos cuando entra al viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEnPantalla(true);
          observer.disconnect(); // ya se activó, no necesita seguir observando
        }
      },
      { rootMargin: '200px' } // empieza a cargar un poco antes de que sea visible
    );
    if (contenedorRef.current) observer.observe(contenedorRef.current);
    return () => observer.disconnect();
  }, []);

  const { kpis, refrescarArea } = useDashboardData(area, { activo: enPantalla });
  const infoArea = AREAS[area];

  const ultimaActualizacion = kpis
    .map((k) => k.actualizadoEn)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  const handleClickKpi = (kpi) => {
    setKpiSeleccionado((actual) => (actual?.id === kpi.id ? null : kpi));
  };

  return (
    <section className="section-dashboard" ref={contenedorRef}>
      <div className="section-dashboard__header">
        <h2 className="section-dashboard__titulo">
          <i className={infoArea.icon} aria-hidden="true" /> {infoArea.label}
        </h2>
        <div className="section-dashboard__acciones">
          {ultimaActualizacion && (
            <span className="section-dashboard__timestamp">
              Actualizado {formatearHace(ultimaActualizacion)}
            </span>
          )}
          <button className="section-dashboard__refrescar" onClick={refrescarArea}>
            Actualizar
          </button>
        </div>
      </div>

      {enPantalla ? (
        <div className="section-dashboard__grid">
          {kpis.map((kpi) => (
            <KPICard key={kpi.id} kpi={kpi} onClick={handleClickKpi} />
          ))}
        </div>
      ) : (
        <div className="section-dashboard__grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="kpi-card__skeleton" />
            </div>
          ))}
        </div>
      )}

      {kpiSeleccionado && (
        <DetallePanel kpi={kpiSeleccionado} onCerrar={() => setKpiSeleccionado(null)} />
      )}
    </section>
  );
}

// Panel de detalle inline (drill-down). Consulta la vista de detalle solo
// cuando se abre — nunca se precarga junto con los KPIs de la sección.
function DetallePanel({ kpi, onCerrar }) {
  // La consulta real a `kpi.drilldown.vista` (con el filtro `filtroDefault`)
  // se implementa aquí con el cliente de Supabase, igual que en
  // useDashboardData pero sin caché de TTL largo — el detalle debe ser
  // siempre fresco al abrirse.
  return (
    <div className="detalle-panel">
      <div className="detalle-panel__header">
        <p className="detalle-panel__titulo">Detalle — {kpi.label}</p>
        <button className="detalle-panel__cerrar" onClick={onCerrar} aria-label="Cerrar detalle">
          ×
        </button>
      </div>
      <p className="detalle-panel__placeholder">
        Aquí va la tabla de {kpi.drilldown?.vista} con el filtro {JSON.stringify(kpi.drilldown?.filtroDefault ?? {})}.
      </p>
    </div>
  );
}
