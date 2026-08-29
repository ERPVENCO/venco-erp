// src/reportes/ReportesHome.jsx
//
// Primera pantalla al entrar a "Reportes" (nivel 1 del boceto):
//   - Menú: botones por sección -> navega al submenú detallado de esa área
//   - Dashboard Resumen: widgets miniatura de cada sección, clic = amplía
//
// Ventas, Producción e Inventario ya usan datos reales de Supabase.
// Compras sigue con datos de ejemplo (TODO) hasta que construyamos esa vista.
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { AREAS } from './dashboardConfig';
import SectionDashboard from './SectionDashboard';
import ReporteProduccion from './ReporteProduccion';
import ReporteInventario from './ReporteInventario';
import BarChartWidget from './graficos/BarChartWidget';
import DonutChartWidget from './graficos/DonutChartWidget';
import './reportes.css';

const ESTADO_LABEL = { suficiente: 'Suficiente', bajo: 'Stock bajo', agotado: 'Agotado' };
const ESTADO_COLOR = { suficiente: '#1A9156', bajo: '#B8860B', agotado: '#B22222' };

// TODO: reemplazar por datos reales cuando exista una vista con serie diaria
const resumenMock = {
  ventas: {
    tipo: 'barra',
    data: [
      { dia: 'Lun', total: 1450000 },
      { dia: 'Mar', total: 980000 },
      { dia: 'Mié', total: 1620000 },
      { dia: 'Jue', total: 1240000 },
      { dia: 'Vie', total: 1890000 },
      { dia: 'Sáb', total: 2100000 },
      { dia: 'Hoy', total: 760000 },
    ],
    xKey: 'dia',
    series: [{ key: 'total', label: 'Ventas', color: '#1A5FA8' }],
  },
  compras: {
    tipo: 'barra',
    data: [
      { dia: 'Lun', total: 820000 },
      { dia: 'Mar', total: 410000 },
      { dia: 'Mié', total: 0 },
      { dia: 'Jue', total: 1350000 },
      { dia: 'Vie', total: 640000 },
      { dia: 'Sáb', total: 0 },
      { dia: 'Hoy', total: 290000 },
    ],
    xKey: 'dia',
    series: [{ key: 'total', label: 'Compras', color: '#B22222' }],
  },
};

export default function ReportesHome() {
  const [areaActiva, setAreaActiva] = useState(null); // null = portada
  const [widgetAmpliado, setWidgetAmpliado] = useState(null);
  const [inventarioResumen, setInventarioResumen] = useState(null); // conteo real por estado
  const [produccionResumen, setProduccionResumen] = useState(null); // top productos reales

  // Datos reales para las tarjetas del Dashboard Resumen (portada)
  useEffect(() => {
    supabase.from('vista_dashboard_inventario_productos').select('*').then(({ data }) => {
      if (!data) return;
      const conteo = ['suficiente', 'bajo', 'agotado']
        .map((estado) => ({
          nombre: ESTADO_LABEL[estado],
          valor: data.filter((f) => f.estado === estado).length,
          color: ESTADO_COLOR[estado],
        }))
        .filter((d) => d.valor > 0);
      setInventarioResumen(conteo);
    });

    supabase.from('vista_dashboard_produccion_por_producto').select('*').then(({ data }) => {
      if (!data) return;
      setProduccionResumen(
        data.slice(0, 6).map((f) => ({ producto: f.producto, cantidad: f.cantidad_producida }))
      );
    });
  }, []);

  // ------- Nivel 2: dentro de una sección específica -------
  if (areaActiva) {
    const info = AREAS[areaActiva];
    return (
      <div>
        <button className="reportes-volver" onClick={() => setAreaActiva(null)}>
          ← Volver a Reportes
        </button>
        <h2 className="reportes-titulo-seccion">
          <i className={info.icon} aria-hidden="true" /> {info.label}
        </h2>

        {areaActiva === 'ventas' ? (
          <SectionDashboard area="ventas" />
        ) : areaActiva === 'produccion' ? (
          <ReporteProduccion />
        ) : areaActiva === 'inventario' ? (
          <ReporteInventario />
        ) : (
          <p className="reportes-proximamente">
            Reportes detallados de {info.label} — próximamente
          </p>
        )}
      </div>
    );
  }

  // ------- Nivel 1: portada (Menú + Dashboard Resumen) -------
  return (
    <div>
      <h2 className="reportes-titulo-seccion">Menú</h2>
      <div className="reportes-menu">
        {Object.entries(AREAS).map(([key, info]) => (
          <button key={key} className="reportes-menu__item" onClick={() => setAreaActiva(key)}>
            <i className={info.icon} aria-hidden="true" />
            <span>{info.label}</span>
          </button>
        ))}
      </div>

      <h2 className="reportes-titulo-seccion" style={{ marginTop: 28 }}>Dashboard Resumen</h2>
      <div className="reportes-resumen-grid">

        {/* Ventas — tarjeta mock (aún no hay vista con serie diaria), expande al reporte real */}
        <div
          className="reportes-resumen-card"
          onClick={() => setWidgetAmpliado((actual) => (actual === 'ventas' ? null : 'ventas'))}
          role="button"
          tabIndex={0}
        >
          <p className="reportes-resumen-card__titulo">Ventas</p>
          <BarChartWidget
            data={resumenMock.ventas.data}
            xKey={resumenMock.ventas.xKey}
            series={resumenMock.ventas.series}
            altura={130}
          />
        </div>

        {/* Inventario — dato real */}
        <div
          className="reportes-resumen-card"
          onClick={() => setWidgetAmpliado((actual) => (actual === 'inventario' ? null : 'inventario'))}
          role="button"
          tabIndex={0}
        >
          <p className="reportes-resumen-card__titulo">Inventario</p>
          {inventarioResumen ? (
            <DonutChartWidget data={inventarioResumen} altura={130} formatoValor="numero" />
          ) : (
            <p className="reportes-proximamente">Cargando...</p>
          )}
        </div>

        {/* Producción — dato real */}
        <div
          className="reportes-resumen-card"
          onClick={() => setWidgetAmpliado((actual) => (actual === 'produccion' ? null : 'produccion'))}
          role="button"
          tabIndex={0}
        >
          <p className="reportes-resumen-card__titulo">Producción</p>
          {produccionResumen ? (
            <BarChartWidget
              data={produccionResumen}
              xKey="producto"
              series={[{ key: 'cantidad', label: 'Producido', color: '#7A9E7E' }]}
              altura={130}
            />
          ) : (
            <p className="reportes-proximamente">Cargando...</p>
          )}
        </div>

        {/* Compras — mock por ahora */}
        <div
          className="reportes-resumen-card"
          onClick={() => setWidgetAmpliado((actual) => (actual === 'compras' ? null : 'compras'))}
          role="button"
          tabIndex={0}
        >
          <p className="reportes-resumen-card__titulo">Compras</p>
          <BarChartWidget
            data={resumenMock.compras.data}
            xKey={resumenMock.compras.xKey}
            series={resumenMock.compras.series}
            altura={130}
          />
        </div>
      </div>

      {widgetAmpliado === 'ventas' && (
        <div className="detalle-panel">
          <div className="detalle-panel__header">
            <p className="detalle-panel__titulo">Detalle — Ventas</p>
            <button className="detalle-panel__cerrar" onClick={() => setWidgetAmpliado(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
          <SectionDashboard area="ventas" />
        </div>
      )}

      {widgetAmpliado === 'inventario' && (
        <div className="detalle-panel">
          <div className="detalle-panel__header">
            <p className="detalle-panel__titulo">Detalle — Inventario</p>
            <button className="detalle-panel__cerrar" onClick={() => setWidgetAmpliado(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
          <ReporteInventario />
        </div>
      )}

      {widgetAmpliado === 'produccion' && (
        <div className="detalle-panel">
          <div className="detalle-panel__header">
            <p className="detalle-panel__titulo">Detalle — Producción</p>
            <button className="detalle-panel__cerrar" onClick={() => setWidgetAmpliado(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
          <ReporteProduccion />
        </div>
      )}

      {widgetAmpliado === 'compras' && (
        <div className="detalle-panel">
          <div className="detalle-panel__header">
            <p className="detalle-panel__titulo">Detalle — Compras</p>
            <button className="detalle-panel__cerrar" onClick={() => setWidgetAmpliado(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
          <BarChartWidget
            data={resumenMock.compras.data}
            xKey={resumenMock.compras.xKey}
            series={resumenMock.compras.series}
            altura={280}
          />
          <p className="reportes-proximamente" style={{ marginTop: 8 }}>
            Datos de ejemplo — se conectan cuando construyamos la vista de Compras.
          </p>
        </div>
      )}
    </div>
  );
}