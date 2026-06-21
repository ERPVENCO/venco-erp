import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function Inventario() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nuevo, setNuevo] = useState({
    codigo: '', nombre: '', categoria: 'fresco',
    precio_kg: '', stock_actual: '', stock_minimo: ''
  })

  useEffect(() => {
    cargarProductos()
  }, [])

  const cargarProductos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .order('nombre')
    setProductos(data || [])
    setLoading(false)
  }

  const guardarProducto = async () => {
    if (!nuevo.codigo || !nuevo.nombre) {
      alert('El código y nombre son obligatorios')
      return
    }
    const { error } = await supabase
      .from('productos')
      .insert([{
        codigo: nuevo.codigo,
        nombre: nuevo.nombre,
        categoria: nuevo.categoria,
        precio_kg: parseFloat(nuevo.precio_kg) || 0,
        stock_actual: parseFloat(nuevo.stock_actual) || 0,
        stock_minimo: parseFloat(nuevo.stock_minimo) || 0,
      }])
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setMostrarForm(false)
      setNuevo({ codigo: '', nombre: '', categoria: 'fresco', precio_kg: '', stock_actual: '', stock_minimo: '' })
      cargarProductos()
    }
  }

  const categoriaColor = (cat) => {
    const colores = { fresco: '#1A9156', embutido: '#1A5FA8', congelado: '#6B3FA0', materia_prima: '#C07D00' }
    return colores[cat] || '#9A8E85'
  }

  const estadoStock = (actual, minimo) => {
    if (actual <= 0) return { texto: 'Sin stock', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo) return { texto: 'Crítico', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo * 1.5) return { texto: 'Bajo', color: '#C07D00', bg: '#FEF3DC' }
    return { texto: 'OK', color: '#1A9156', bg: '#E8F7EF' }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>📦 Inventario</div>
          <div style={{ fontSize: 13, color: '#9A8E85', marginTop: 4 }}>{productos.length} productos registrados</div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{
          background: '#B22222', color: '#fff', border: 'none',
          borderRadius: 7, padding: '9px 18px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer'
        }}>
          ＋ Nuevo producto
        </button>
      </div>

      {/* Formulario nuevo producto */}
      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nuevo producto</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>CÓDIGO</label>
              <input value={nuevo.codigo} onChange={e => setNuevo({...nuevo, codigo: e.target.value})}
                placeholder="CAR-001" style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>NOMBRE</label>
              <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})}
                placeholder="Lomo fino vacuno" style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>CATEGORÍA</label>
              <select value={nuevo.categoria} onChange={e => setNuevo({...nuevo, categoria: e.target.value})}
                style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }}>
                <option value="fresco">Fresco</option>
                <option value="embutido">Embutido</option>
                <option value="congelado">Congelado</option>
                <option value="materia_prima">Materia prima</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>PRECIO / KG</label>
              <input type="number" value={nuevo.precio_kg} onChange={e => setNuevo({...nuevo, precio_kg: e.target.value})}
                placeholder="0" style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>STOCK INICIAL (KG)</label>
              <input type="number" value={nuevo.stock_actual} onChange={e => setNuevo({...nuevo, stock_actual: e.target.value})}
                placeholder="0" style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>STOCK MÍNIMO (KG)</label>
              <input type="number" value={nuevo.stock_minimo} onChange={e => setNuevo({...nuevo, stock_minimo: e.target.value})}
                placeholder="0" style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardarProducto} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Guardar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : productos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay productos aún</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo producto" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Código','Nombre','Categoría','Stock actual','Stock mínimo','Precio/kg','Estado'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productos.map(p => {
                const estado = estadoStock(p.stock_actual, p.stock_minimo)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>{p.codigo}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: categoriaColor(p.categoria) + '20', color: categoriaColor(p.categoria), padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {p.categoria}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.stock_actual} kg</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.stock_minimo} kg</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>${p.precio_kg?.toLocaleString()}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: estado.bg, color: estado.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {estado.texto}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}