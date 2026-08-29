// src/reportes/KPICard.jsx
//
// Componente 100% presentacional. No formatea, no evalúa alertas, no
// calcula tendencias — todo eso ya viene resuelto en las props.
// Quien decide esos valores es la capa de datos (useDashboardData.js).
import './reportes.css';

export default function KPICard({ kpi, onClick }) {
  const {
    label,
    cargando,
    error,
    valorFormateado,
    secundarioFormateado,
    alertaActiva,
    alertaMensaje,
    tendenciaTexto,
    tendenciaSubida,
  } = kpi;

  return (
    <div
      className={`kpi-card${alertaActiva ? ' kpi-card--alerta' : ''}`}
      onClick={() => onClick?.(kpi)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(kpi); }}
    >
      <div className="kpi-card__header">
        <span className="kpi-card__label">{label}</span>
        {alertaActiva && <span className="kpi-card__alerta-dot" title={alertaMensaje} />}
      </div>

      {cargando ? (
        <div className="kpi-card__skeleton" />
      ) : error ? (
        <span className="kpi-card__error">No se pudo cargar</span>
      ) : (
        <>
          <p className="kpi-card__valor">{valorFormateado}</p>
          {secundarioFormateado && <p className="kpi-card__secundario">{secundarioFormateado}</p>}
          {tendenciaTexto && (
            <p className={`kpi-card__tendencia${tendenciaSubida ? ' kpi-card__tendencia--up' : ' kpi-card__tendencia--down'}`}>
              {tendenciaSubida ? '▲' : '▼'} {tendenciaTexto}
            </p>
          )}
        </>
      )}
    </div>
  );
}