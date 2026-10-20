// src/reportes/graficos/BarChartWidget.jsx
import { useId } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { formatearMoneda, formatearNumero } from '../formato';
import '../reportes.css';

/**
 * Gráfico de barras genérico y reutilizable.
 *
 * - orientacion="vertical" (default): barras de pie, para series por tiempo.
 * - orientacion="horizontal": barras acostadas, ideal para rankings largos.
 *   La altura crece según la cantidad de filas.
 *
 * Props nuevas:
 * - formatoValor: cómo mostrar el valor en tooltip y etiquetas
 *   (default formatearMoneda, para no romper los gráficos existentes).
 * - mostrarEtiquetas: valor al final de cada barra (default true en horizontal).
 * - seleccion / onSelect: resalta una barra y avisa al hacer clic
 *   (para enlazar el gráfico con la tabla). Clic otra vez = deseleccionar.
 */
export default function BarChartWidget({
  titulo,
  data,
  xKey,
  series,
  altura,
  orientacion = 'vertical',
  formatoValor = formatearMoneda,
  mostrarEtiquetas,
  seleccion = null,
  onSelect,
}) {
  const esHorizontal = orientacion === 'horizontal';
  const conEtiquetas = mostrarEtiquetas ?? esHorizontal;
  const alturaFinal = altura ?? (esHorizontal ? Math.max(200, data.length * 36) : 260);
  const uid = useId().replace(/:/g, '');
  const gradId = (i) => `grad-${uid}-${i}`;

  const manejarClic = (fila) => {
    if (!onSelect || !fila) return;
    const valor = fila[xKey];
    onSelect(valor === seleccion ? null : valor);
  };

  return (
    <div className="chart-widget">
      {titulo && <p className="chart-widget__titulo">{titulo}</p>}
      <ResponsiveContainer width="100%" height={alturaFinal}>
        <BarChart
          data={data}
          layout={esHorizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: conEtiquetas && esHorizontal ? 56 : 16, left: 0, bottom: 0 }}
          barCategoryGap={esHorizontal ? '25%' : '20%'}
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient
                key={s.key}
                id={gradId(i)}
                x1="0" y1="0"
                x2={esHorizontal ? '1' : '0'}
                y2={esHorizontal ? '0' : '1'}
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={s.color} stopOpacity={1} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#eee"
            horizontal={!esHorizontal}
            vertical={esHorizontal}
          />

          {esHorizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 12, fill: '#6b6b6b' }} tickFormatter={formatearNumero} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 12, fill: '#444' }} width={130} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#6b6b6b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6b6b6b' }} tickFormatter={formatearNumero} axisLine={false} tickLine={false} />
            </>
          )}

          <Tooltip
            formatter={(v) => formatoValor(v)}
            cursor={{ fill: 'rgba(178, 34, 34, 0.06)' }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e0d8',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}

          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={`url(#${gradId(i)})`}
              radius={esHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              onClick={onSelect ? (fila) => manejarClic(fila) : undefined}
              cursor={onSelect ? 'pointer' : 'default'}
              animationDuration={600}
            >
              {onSelect &&
                data.map((fila) => (
                  <Cell
                    key={fila[xKey]}
                    fillOpacity={seleccion && fila[xKey] !== seleccion ? 0.3 : 1}
                  />
                ))}
              {conEtiquetas && (
                <LabelList
                  dataKey={s.key}
                  position={esHorizontal ? 'right' : 'top'}
                  formatter={(v) => formatoValor(v)}
                  style={{ fontSize: 11, fill: '#444' }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}