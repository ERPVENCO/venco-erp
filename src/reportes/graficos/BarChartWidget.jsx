// src/reportes/graficos/BarChartWidget.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatearMoneda, formatearNumero } from '../formato';
import '../reportes.css';

/**
 * Gráfico de barras genérico y reutilizable.
 *
 * - orientacion="vertical" (default): barras de pie, para series por tiempo (días, meses).
 * - orientacion="horizontal": barras acostadas, categoría en el eje Y — ideal
 *   cuando hay muchos ítems (productos, clientes) y no se quiere truncar la lista.
 *   La altura crece automáticamente según la cantidad de filas, en vez de
 *   recortar información para que quepa en un tamaño fijo.
 *
 * data: [{ [xKey]: 'Chorizo ahumado', cantidad: 412 }, ...]
 * series: [{ key: 'cantidad', label: 'Kg producidos', color: '#B22222' }]
 */
export default function BarChartWidget({ titulo, data, xKey, series, altura, orientacion = 'vertical' }) {
  const esHorizontal = orientacion === 'horizontal';
  // Si no se fija una altura explícita, se calcula según cuántas filas hay
  // (evita que un gráfico con 30 productos se vea aplastado o recorte datos)
  const alturaFinal = altura ?? (esHorizontal ? Math.max(200, data.length * 34) : 260);

  return (
    <div className="chart-widget">
      {titulo && <p className="chart-widget__titulo">{titulo}</p>}
      <ResponsiveContainer width="100%" height={alturaFinal}>
        <BarChart
          data={data}
          layout={esHorizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 16, left: esHorizontal ? 90 : 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          {esHorizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={formatearNumero} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 12 }} width={110} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={formatearNumero} />
            </>
          )}
          <Tooltip formatter={formatearMoneda} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={esHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}