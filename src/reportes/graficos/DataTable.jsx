// src/reportes/graficos/DataTable.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { formatearMoneda, formatearNumero } from '../formato';
import '../reportes.css';

/**
 * Tabla genérica reutilizable: buscador + orden por columna, sin límite de filas.
 *
 * columnas: [{ key, label, formato?, render? }]
 *   formato: 'moneda' | 'numero' | 'texto' | 'badge'
 *     - moneda / numero: pasa el número CRUDO en filas; la tabla lo formatea
 *       al mostrarlo y ordena por el valor real. (Si llega un string, se
 *       muestra tal cual, así que las pantallas antiguas siguen funcionando.)
 *     - badge: espera un campo paralelo `${key}_variante`
 *       ('exito' | 'alerta' | 'peligro' | 'neutro').
 *   render: (fila) => nodo, para celdas personalizadas (opcional).
 *
 * Props nuevas (opcionales):
 *   claveFila, seleccion, onSelectFila: filas clicables y resaltadas
 *     (para enlazar con un gráfico). Clic otra vez = deseleccionar.
 *   etiquetaItem: [singular, plural] para el conteo. Default ['producto', 'productos'].
 */
const FORMATEADORES = { moneda: formatearMoneda, numero: formatearNumero };
const esNumerica = (col) => col.formato === 'moneda' || col.formato === 'numero';

function textoCelda(fila, col) {
  const v = fila[col.key];
  if (v == null) return '';
  const f = FORMATEADORES[col.formato];
  return f && typeof v === 'number' ? f(v) : String(v);
}

export default function DataTable({
  columnas,
  filas,
  buscarPlaceholder = 'Buscar...',
  claveFila,
  seleccion = null,
  onSelectFila,
  etiquetaItem = ['producto', 'productos'],
}) {
  const [busqueda, setBusqueda] = useState('');
  const [ordenPor, setOrdenPor] = useState(null);
  const [ordenAsc, setOrdenAsc] = useState(true);
  const filaRefs = useRef(new Map());

  const filasFiltradas = useMemo(() => {
    let resultado = filas;

    if (busqueda) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter((fila) =>
        columnas.some((col) => textoCelda(fila, col).toLowerCase().includes(q))
      );
    }

    if (ordenPor) {
      resultado = [...resultado].sort((a, b) => {
        const va = a[ordenPor];
        const vb = b[ordenPor];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;   // vacíos siempre al final
        if (vb == null) return -1;
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'es', { numeric: true });
        return ordenAsc ? cmp : -cmp;
      });
    }

    return resultado;
  }, [filas, busqueda, ordenPor, ordenAsc, columnas]);

  // Si se selecciona desde el gráfico, lleva la fila a la vista
  useEffect(() => {
    if (seleccion == null) return;
    filaRefs.current.get(seleccion)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [seleccion]);

  const cambiarOrden = (col) => {
    if (ordenPor === col.key) {
      setOrdenAsc(!ordenAsc);
    } else {
      setOrdenPor(col.key);
      setOrdenAsc(!esNumerica(col)); // números: primero de mayor a menor
    }
  };

  const clicFila = (fila) => {
    if (!onSelectFila || !claveFila) return;
    const valor = fila[claveFila];
    onSelectFila(valor === seleccion ? null : valor);
  };

  const [singular, plural] = etiquetaItem;

  return (
    <div className="chart-widget">
      <input
        className="data-table__buscar"
        placeholder={buscarPlaceholder}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <div className="data-table__scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className={esNumerica(col) ? 'data-table__num' : undefined}
                  onClick={() => cambiarOrden(col)}
                  aria-sort={
                    ordenPor === col.key ? (ordenAsc ? 'ascending' : 'descending') : 'none'
                  }
                >
                  {col.label} {ordenPor === col.key && (ordenAsc ? '▲' : '▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((fila, i) => {
              const clave = claveFila ? fila[claveFila] : i;
              const seleccionada = claveFila && seleccion != null && clave === seleccion;
              return (
                <tr
                  key={clave ?? i}
                  ref={(el) => {
                    if (!claveFila) return;
                    if (el) filaRefs.current.set(clave, el);
                    else filaRefs.current.delete(clave);
                  }}
                  className={[
                    onSelectFila ? 'data-table__fila--clicable' : '',
                    seleccionada ? 'data-table__fila--seleccionada' : '',
                  ].join(' ').trim() || undefined}
                  onClick={() => clicFila(fila)}
                >
                  {columnas.map((col) => (
                    <td key={col.key} className={esNumerica(col) ? 'data-table__num' : undefined}>
                      {col.render ? (
                        col.render(fila)
                      ) : col.formato === 'badge' ? (
                        <span className={`data-table__badge data-table__badge--${fila[`${col.key}_variante`] || 'neutro'}`}>
                          {fila[col.key]}
                        </span>
                      ) : (
                        textoCelda(fila, col)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="data-table__conteo">
        {filasFiltradas.length} de {filas.length} {filas.length === 1 ? singular : plural}
      </p>
    </div>
  );
}