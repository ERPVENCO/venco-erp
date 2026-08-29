// src/reportes/graficos/RankingList.jsx
//
// Puramente presentacional: recibe cada fila ya con su ancho de barra (%)
// y su valor ya formateado. No calcula Math.max ni formatea números —
// eso lo resuelve quien arma los datos (ver formato.js y el ejemplo de
// preparación al final de este archivo, como referencia).
import '../reportes.css';

/**
 * items: [{ nombre: 'Proveeduría El...', valorFormateado: '$54.231.540', ancho: 100 }, ...]
 *   - ancho: porcentaje (0-100) ya calculado respecto al máximo del set.
 */
export default function RankingList({ titulo, items }) {
  return (
    <div className="chart-widget">
      {titulo && <p className="chart-widget__titulo">{titulo}</p>}
      <div className="ranking-list">
        {items.map((item, i) => (
          <div key={i} className="ranking-list__fila">
            <span className="ranking-list__nombre">{item.nombre}</span>
            <div className="ranking-list__barra-fondo">
              <div className="ranking-list__barra" style={{ width: `${item.ancho}%` }} />
            </div>
            <span className="ranking-list__valor">{item.valorFormateado}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ejemplo de cómo la capa de datos debe preparar `items` antes de pasarlos
// (esto NO va en el widget — va en el componente contenedor, ej. la futura
// pantalla FinanzasFlujoCaja.jsx):
//
//   import { formatearMoneda } from '../formato';
//
//   function prepararRanking(filas) {
//     const max = Math.max(...filas.map((f) => f.total), 1);
//     return filas.map((f) => ({
//       nombre: f.cliente,
//       valorFormateado: formatearMoneda(f.total),
//       ancho: (f.total / max) * 100,
//     }));
//   }
// ---------------------------------------------------------------------------