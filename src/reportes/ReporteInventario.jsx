// src/reportes/ReporteInventario.jsx
//
// Pantalla real (nivel 2) del área Inventario dentro de Reportes.
// Combina un resumen visual (dona por estado) con la tabla completa de
// TODOS los productos activos — el gráfico da la foto rápida, la tabla
// da el dato exacto de cada uno, sin ocultar ninguno.
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import DonutChartWidget from './graficos/DonutChartWidget';
import DataTable from './graficos/DataTable';
import { formatearNumero } from './formato';
import './reportes.css';

const ESTADO_LABEL = { suficiente: 'Suficiente', bajo: 'Stock bajo', agotado: 'Agotado' };
const ESTADO_VARIANTE = { suficiente: 'exito', bajo: 'alerta', agotado: 'peligro' };
const ESTADO_COLOR = { suficiente: '#1A9156', bajo: '#B8860B', agotado: '#B22222' };

export default function ReporteInventario() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from('vista_dashboard_inventario_productos')
      .select('*')
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error.message);
        else setFilas(data ?? []);
        setCargando(false);
      });
    return () => { activo = false; };
  }, []);

  if (cargando) return <p className="reportes-proximamente">Cargando inventario...</p>;
  if (error) return <p className="reportes-proximamente">No se pudo cargar: {error}</p>;
  if (filas.length === 0) return <p className="reportes-proximamente">No hay productos activos registrados.</p>;

  // Resumen para la dona: conteo de productos por estado
  const conteoPorEstado = ['suficiente', 'bajo', 'agotado']
    .map((estado) => ({
      nombre: ESTADO_LABEL[estado],
      valor: filas.filter((f) => f.estado === estado).length,
      color: ESTADO_COLOR[estado],
    }))
    .filter((d) => d.valor > 0);

  // Tabla completa: TODOS los productos, con su badge de estado
  const filasTabla = filas.map((f) => ({
    producto: f.producto,
    unidad: f.unidad,
    stock_actual: formatearNumero(f.stock_actual),
    estado: ESTADO_LABEL[f.estado],
    estado_variante: ESTADO_VARIANTE[f.estado],
  }));

  return (
    <div>
      <DonutChartWidget titulo="Estado del inventario" data={conteoPorEstado} altura={200} formatoValor="numero" />
      <DataTable
        columnas={[
          { key: 'producto', label: 'Producto' },
          { key: 'unidad', label: 'Unidad' },
          { key: 'stock_actual', label: 'Disponible' },
          { key: 'estado', label: 'Estado', formato: 'badge' },
        ]}
        filas={filasTabla}
        buscarPlaceholder="Buscar producto..."
      />
    </div>
  );
}