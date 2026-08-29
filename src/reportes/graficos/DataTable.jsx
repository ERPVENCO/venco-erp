// src/reportes/graficos/DataTable.jsx
import { useState, useMemo } from 'react';
import '../reportes.css';

/**
 * Tabla genérica reutilizable: buscador + orden por columna, sin límite de
 * filas — pensada para listas largas (ej. inventario con 30+ productos)
 * donde no queremos ocultar información.
 *
 * columnas: [{ key, label, formato? }]
 *   formato: 'moneda' | 'numero' | 'texto' | 'badge' (badge espera un campo
 *   paralelo `${key}_variante` con 'exito' | 'alerta' | 'peligro' | 'neutro')
 * filas: [{ [colKey]: valor, ... }]
 */
export default function DataTable({ columnas, filas, buscarPlaceholder = 'Buscar...' }) {
  const [busqueda, setBusqueda] = useState('');
  const [ordenPor, setOrdenPor] = useState(null);
  const [ordenAsc, setOrdenAsc] = useState(true);

  const filasFiltradas = useMemo(() => {
    let resultado = filas;

    if (busqueda) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter((fila) =>
        columnas.some((col) => String(fila[col.key] ?? '').toLowerCase().includes(q))
      );
    }

    if (ordenPor) {
      resultado = [...resultado].sort((a, b) => {
        const va = a[ordenPor];
        const vb = b[ordenPor];
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number') return ordenAsc ? va - vb : vb - va;
        return ordenAsc
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    return resultado;
  }, [filas, busqueda, ordenPor, ordenAsc, columnas]);

  const cambiarOrden = (key) => {
    if (ordenPor === key) setOrdenAsc(!ordenAsc);
    else {
      setOrdenPor(key);
      setOrdenAsc(true);
    }
  };

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
                <th key={col.key} onClick={() => cambiarOrden(col.key)}>
                  {col.label} {ordenPor === col.key && (ordenAsc ? '▲' : '▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((fila, i) => (
              <tr key={i}>
                {columnas.map((col) => (
                  <td key={col.key}>
                    {col.formato === 'badge' ? (
                      <span className={`data-table__badge data-table__badge--${fila[`${col.key}_variante`] || 'neutro'}`}>
                        {fila[col.key]}
                      </span>
                    ) : (
                      fila[col.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="data-table__conteo">
        {filasFiltradas.length} de {filas.length} {filas.length === 1 ? 'producto' : 'productos'}
      </p>
    </div>
  );
}
