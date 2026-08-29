// src/reportes/ReporteProduccion.jsx
//
// Pantalla real (nivel 2) del área Producción dentro de Reportes.
// Muestra TODOS los productos con producción registrada este mes:
// gráfico horizontal (crece con la cantidad de productos, no trunca)
// + tabla completa con buscador.
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import BarChartWidget from './graficos/BarChartWidget';
import DataTable from './graficos/DataTable';
import { formatearNumero } from './formato';
import './reportes.css';

export default function ReporteProduccion() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

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

  if (cargando) return <p className="reportes-proximamente">Cargando producción...</p>;
  if (error) return <p className="reportes-proximamente">No se pudo cargar: {error}</p>;
  if (filas.length === 0) return <p className="reportes-proximamente">No hay producción registrada este mes.</p>;

  // Datos para el gráfico: todos los productos, sin recortar a un top N
  const datosGrafico = filas.map((f) => ({
    producto: f.producto,
    cantidad: f.cantidad_producida,
  }));

  // Datos para la tabla
  const filasTabla = filas.map((f) => ({
    producto: f.producto,
    unidad: f.unidad,
    cantidad: formatearNumero(f.cantidad_producida),
  }));

  return (
    <div>
      <BarChartWidget
        titulo="Producción por producto — mes en curso"
        data={datosGrafico}
        xKey="producto"
        series={[{ key: 'cantidad', label: 'Cantidad producida', color: '#B22222' }]}
        orientacion="horizontal"
      />
      <DataTable
        columnas={[
          { key: 'producto', label: 'Producto' },
          { key: 'unidad', label: 'Unidad' },
          { key: 'cantidad', label: 'Cantidad producida' },
        ]}
        filas={filasTabla}
        buscarPlaceholder="Buscar producto..."
      />
    </div>
  );
}
