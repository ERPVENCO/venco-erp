// src/reportes/graficos/DonutChartWidget.jsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatearMoneda, formatearNumero } from '../formato';
import '../reportes.css';

const PALETA = ['#B22222', '#D98C8C', '#E8B84B', '#7A9E7E', '#4E7A94', '#9A7BAE'];

/**
 * Dona genérica (ej. "Distribución por categoría", "Estado del inventario").
 *
 * data: [{ nombre: 'COMPRA MP', valor: 3266026, color? }, ...]
 * formatoValor: 'moneda' (default, para totales en $) | 'numero' (para
 *   conteos, ej. "3 productos" en vez de "$3")
 */
export default function DonutChartWidget({ titulo, data, altura = 240, formatoValor = 'moneda' }) {
  const formatearTooltip = formatoValor === 'numero' ? formatearNumero : formatearMoneda;
  return (
    <div className="chart-widget">
      {titulo && <p className="chart-widget__titulo">{titulo}</p>}
      <ResponsiveContainer width="100%" height={altura}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="nombre"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.map((item, i) => (
              <Cell key={i} fill={item.color || PALETA[i % PALETA.length]} />
            ))}
          </Pie>
          <Tooltip formatter={formatearTooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}