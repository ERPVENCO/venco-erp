// src/reportes/graficos/KPIStrip.jsx
//
// Puramente presentacional: cada item ya trae su valor formateado.
// No decide cómo formatear moneda/número/porcentaje — eso vive en
// formato.js y lo aplica el componente contenedor antes de pasar los items.
import '../reportes.css';

/**
 * Tira horizontal de indicadores compactos, como la franja superior de
 * los reportes de Finanzas (Flujo total, Cuentas por pagar, Ratio efectivo...).
 *
 * items: [{ label, valorFormateado, destacado }]
 *   - destacado: true para el indicador principal (ej. "Flujo total")
 */
export default function KPIStrip({ items }) {
  return (
    <div className="kpi-strip">
      {items.map((item, i) => (
        <div key={i} className={`kpi-strip__item${item.destacado ? ' kpi-strip__item--destacado' : ''}`}>
          <p className="kpi-strip__valor">{item.valorFormateado}</p>
          <p className="kpi-strip__label">{item.label}</p>
        </div>
      ))}
    </div>
  );
}