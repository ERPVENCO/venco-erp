// src/reportes/ReporteProduccion.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import BarChartWidget from './graficos/BarChartWidget';
import DataTable from './graficos/DataTable';
import { formatearNumero } from './formato';
import './reportes.css';

export default function ReporteProduccion() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from('vista_dashboard_produccion_por_producto')
      .select('*')
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error.message);
        else setFilas(data ?? []);
        setCargando(false);
      });
    return () => { activo = false; };
  }, []);

  // Los hooks van ANTES de los return condicionales
  const ordenadas = useMemo(
    () =>
      filas
        .map((f) => ({ ...f, cantidad_producida: Number(f.cantidad_producida) }))
        .sort((a, b) => b.cantidad_producida - a.cantidad_producida),
    [filas]
  );

  // Total por unidad: no se mezclan kg con unidades o litros
  const totalesPorUnidad = useMemo(() => {
    const m = new Map();
    ordenadas.forEach((f) => m.set(f.unidad, (m.get(f.unidad) ?? 0) + f.cantidad_producida));
    return [...m];
  }, [ordenadas]);

  if (cargando) {
    return (
      <div>
        <div className="kpi-card__skeleton" style={{ height: 64, marginBottom: 16 }} />
        <div className="kpi-card__skeleton" style={{ height: 260 }} />
      </div>
    );
  }
  if (error) return <p className="reportes-proximamente">No se pudo cargar: {error}</p>;
  if (ordenadas.length === 0) {
    return <p className="reportes-proximamente">No hay producción registrada este mes.</p>;
  }

  const lider = ordenadas[0];

  const datosGrafico = ordenadas.map((f) => ({
    producto: f.producto,
    cantidad: f.cantidad_producida,
  }));

  return (
    <div>
      <div className="kpi-strip">
        <div className="kpi-strip__item">
          <p className="kpi-strip__valor">{ordenadas.length}</p>
          <p className="kpi-strip__label">Productos con producción</p>
        </div>
        <div className="kpi-strip__item kpi-strip__item--destacado">
          <p className="kpi-strip__valor">{lider.producto}</p>
          <p className="kpi-strip__label">
            Líder · {formatearNumero(lider.cantidad_producida)} {lider.unidad}
          </p>
        </div>
        {totalesPorUnidad.map(([unidad, total]) => (
          <div className="kpi-strip__item" key={unidad}>
            <p className="kpi-strip__valor">{formatearNumero(total)}</p>
            <p className="kpi-strip__label">Total · {unidad}</p>
          </div>
        ))}
      </div>

      <BarChartWidget
        titulo="Producción por producto — mes en curso"
        data={datosGrafico}
        xKey="producto"
        series={[{ key: 'cantidad', label: 'Cantidad producida', color: '#B22222' }]}
        orientacion="horizontal"
        formatoValor={formatearNumero}
        seleccion={seleccion}
        onSelect={setSeleccion}
      />

      <DataTable
        columnas={[
          { key: 'producto', label: 'Producto' },
          { key: 'unidad', label: 'Unidad' },
          { key: 'cantidad_producida', label: 'Cantidad producida', formato: 'numero' },
        ]}
        filas={ordenadas}
        claveFila="producto"
        seleccion={seleccion}
        onSelectFila={setSeleccion}
        buscarPlaceholder="Buscar producto..."
      />
    </div>
  );
}