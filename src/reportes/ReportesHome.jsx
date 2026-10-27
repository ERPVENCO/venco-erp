import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList, ReferenceLine,
} from 'recharts'
import { supabase } from '../supabase'

const MapaVentas = lazy(() => import('./MapaVentas'))

/* =====================================================================
   AJUSTAR AQUÍ los nombres reales de tabla y columnas de cada fuente.
   valor = columna numérica a sumar, grupo = columna de texto para rankings
   ===================================================================== */
const FUENTES = {
  ventas: { tabla: 'ventas', fecha: 'creado_en', valor: 'total', grupo: 'cliente_nombre', excluir: { col: 'estado', valores: ['anulado'] }, dinero: true, grupoNombre: 'Clientes', valorNombre: 'Vendido' },
  compras: { tabla: 'compras', fecha: 'fecha_compra', valor: 'total', grupo: 'proveedor_nombre', excluir: { col: 'estado_registro', valores: ['anulado', 'anulada'] }, dinero: true, grupoNombre: 'Proveedores', valorNombre: 'Comprado' },
  produccion: { tabla: 'producciones', fecha: 'fecha_produccion', valor: 'cantidad_batch', grupo: 'batch_nombre', dinero: false, unidad: '', grupoNombre: 'Productos', valorNombre: 'Cantidad producida' },
  clientes: { tabla: 'ventas', fecha: 'creado_en', valor: 'total', grupo: 'cliente_nombre', excluir: { col: 'estado', valores: ['anulado'] }, dinero: true, grupoNombre: 'Clientes', valorNombre: 'Comprado por clientes' },
}

const MODULOS = [
  {
    id: 'finanzas', nombre: 'Finanzas', desc: 'Caja, gastos y cartera.',
    secciones: [
      { id: 'flujo', nombre: 'Flujo de caja', desc: 'Ingresos, egresos y saldo mes a mes.' },
      { id: 'categorias', nombre: 'Gastos por categoría', desc: 'En qué se va el dinero.' },
      { id: 'cartera', nombre: 'Cartera', desc: 'Por cobrar, vencido y por pagar.' },
      { id: 'dashboard', nombre: 'Dashboard final', desc: 'Resumen de todo el módulo.' },
    ],
  },
  {
    id: 'ventas', nombre: 'Ventas', desc: 'Ventas, productos, clientes y vendedores.', fuente: 'ventas',
    secciones: [
      { id: 'evolucion', nombre: 'Evolución de ventas', desc: 'Tendencia, crecimiento y comparación con periodos anteriores.' },
      { id: 'meta', nombre: 'Ventas vs. meta', desc: 'Cumplimiento del presupuesto.' },
      { id: 'vendedores', nombre: 'Vendedores y comisiones', desc: 'Desempeño y comisiones por asesor.' },
      { id: 'productos', nombre: 'Productos', desc: 'Más y menos vendidos, unidades y margen.' },
      { id: 'clientes', nombre: 'Clientes', desc: 'Resumen de compras por cliente.' },
      { id: 'ubicacion', nombre: 'Ventas por ubicación', desc: 'Mapa de ventas, crecimiento y metas por zona.' },
      { id: 'descuentos', nombre: 'Descuentos y anulaciones', desc: 'Control de descuentos y ventas anuladas.' },
      { id: 'proyeccion', nombre: 'Proyección y pronóstico', desc: 'Cierre estimado y demanda esperada.' },
      { id: 'inventario', nombre: 'Inventario vs. ventas', desc: 'Agotados, rotación y baja salida.' },
      { id: 'dashboard', nombre: 'Dashboard final', desc: 'Resumen del módulo de ventas.' },
    ],
  },
  { id: 'compras', nombre: 'Compras', desc: 'Compras por mes y proveedores.', fuente: 'compras', secciones: [{ id: 'dashboard', nombre: 'Dashboard de compras', desc: 'Tendencia, ranking y detalle.' }] },
  { id: 'produccion', nombre: 'Producción', desc: 'Producción por mes y por producto.', fuente: 'produccion', secciones: [{ id: 'dashboard', nombre: 'Dashboard de producción', desc: 'Tendencia, ranking y detalle.' }] },
  { id: 'clientes', nombre: 'Clientes', desc: 'Quién compra más y cuánto.', fuente: 'clientes', secciones: [{ id: 'dashboard', nombre: 'Dashboard de clientes', desc: 'Ranking y participación.' }] },
]

const C = {
  crema: '#FFF6DC', dorado: '#D9C46A', tarjeta: '#FFFBCC', texto: '#1E1A12',
  verde: '#00B050', rojo: '#E5252A', azul: '#2E75B6', marca: '#B22222',
  saldo: '#A9D18E', cobrar: '#F4B183', pagar: '#9DC3E6',
}
const PIE = ['#2E75B6', '#ED7D31', '#A5A5A5', '#70AD47', '#FFC000', '#5B9BD5', '#7F6000', '#C55A9B']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const $ = (v) => (v < 0 ? '-$ ' : '$ ') + Math.round(Math.abs(v || 0)).toLocaleString('es-CO')
const num = (v, u) => Math.round(v || 0).toLocaleString('es-CO') + (u ? ' ' + u : '')
const compacto = (v) => {
  const a = Math.abs(v || 0), s = v < 0 ? '-' : ''
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M'
  if (a >= 1e3) return s + Math.round(a / 1e3).toLocaleString('es-CO') + ' k'
  return s + Math.round(a)
}
// Las fechas con hora (ventas.creado_en, auditoria.fecha) se guardan en UTC. Aquí se pasan al día de Bogotá (UTC-5)
// para que una venta de las 8 pm no caiga en el día siguiente. Las fechas sin hora (YYYY-MM-DD) quedan igual.
const diaBogota = (v) => {
  const s = String(v || '').trim().replace(' ', 'T')
  if (s.length <= 10) return s
  const d = new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/.test(s) ? s : s + 'Z')
  if (isNaN(d)) return s.slice(0, 10)
  return new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10)
}
const sum = (rows, k = 'monto') => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
const fmtF = (f) => (v) => (f.dinero ? $(v) : num(v, f.unidad))

/* ---------- datos ---------- */
function useDatos() {
  const [d, setD] = useState({ ing: [], egr: [], cxc: [], cxp: [], fuentes: {}, cargando: true })
  useEffect(() => {
    ;(async () => {
      const q = (t, c) => supabase.from(t).select(c).range(0, 9999)
      const [a, b, c, e] = await Promise.all([
        q('ingresos', 'fecha,monto'), q('egresos', 'fecha,monto,categoria_nombre'),
        q('vista_cuentas_por_cobrar', 'saldo,vencida'), q('vista_cuentas_por_pagar', 'saldo'),
      ])
      const fuentes = {}
      await Promise.all(Object.entries(FUENTES).map(async ([k, f]) => {
        const r = await q(f.tabla, `${f.fecha},${f.valor},${f.grupo}${f.excluir ? ',' + f.excluir.col : ''}`)
        fuentes[k] = r.error
          ? { error: r.error.message, rows: [] }
          : { rows: (r.data || []).filter((x) => !f.excluir || !f.excluir.valores.includes(String(x[f.excluir.col] || '').toLowerCase())).map((x) => ({ fecha: diaBogota(x[f.fecha]), valor: Number(x[f.valor]) || 0, grupo: x[f.grupo] == null ? 'Sin dato' : String(x[f.grupo]) })) }
      }))
      const it = await supabase.from('venta_items').select('cantidad,subtotal,nombre_producto,producto_id,ventas(creado_en,estado,vendedor,cliente_nombre),productos(costo_promedio,ultimo_costo)').range(0, 9999)
      fuentes.items = it.error
        ? { error: it.error.message, rows: [] }
        : {
            rows: (it.data || [])
              .filter((x) => x.ventas && String(x.ventas.estado || '').toLowerCase() !== 'anulado')
              .map((x) => ({
                fecha: diaBogota(x.ventas.creado_en), grupo: x.nombre_producto || 'Sin nombre', pid: x.producto_id, vend: x.ventas.vendedor || 'Sin vendedor', cli: x.ventas.cliente_nombre || 'Sin cliente',
                cant: Number(x.cantidad) || 0, valor: Number(x.subtotal) || 0,
                costo: (Number(x.cantidad) || 0) * (Number(x.productos?.costo_promedio) || Number(x.productos?.ultimo_costo) || 0),
              })),
          }
      const vv = await supabase.from('ventas').select('creado_en,total,vendedor,comision_valor,cliente_nombre,cliente_id,estado').range(0, 9999)
      fuentes.vend = vv.error
        ? { error: vv.error.message, rows: [] }
        : {
            rows: (vv.data || [])
              .filter((x) => String(x.estado || '').toLowerCase() !== 'anulado')
              .map((x) => ({ fecha: diaBogota(x.creado_en), grupo: x.vendedor || 'Sin vendedor', valor: Number(x.total) || 0, comision: Number(x.comision_valor) || 0, cliente: x.cliente_nombre || '', cid: x.cliente_id })),
          }
      const dd = await supabase.from('ventas').select('creado_en,folio,total,subtotal,descuento,estado,vendedor,cliente_nombre').range(0, 9999)
      fuentes.desc = dd.error
        ? { error: dd.error.message, rows: [] }
        : {
            rows: (dd.data || []).map((x) => ({
              fecha: diaBogota(x.creado_en), folio: x.folio || '', anulada: String(x.estado || '').toLowerCase() === 'anulado',
              total: Number(x.total) || 0, subtotal: Number(x.subtotal) || 0, descuento: Number(x.descuento) || 0,
              vendedor: x.vendedor || 'Sin vendedor', cliente: x.cliente_nombre || 'Sin cliente',
            })),
          }
      const au = await supabase.from('auditoria').select('accion,datos_anteriores,fecha,usuario_email').eq('tabla', 'ventas').eq('accion', 'ELIMINACIÓN')
      const vistos = new Set()
      fuentes.aud = {
        rows: au.error ? [] : (au.data || [])
          .map((x) => {
            let d = x.datos_anteriores
            if (typeof d === 'string') { try { d = JSON.parse(d) } catch (e) { d = null } }
            return d && d.id ? { d, x } : null
          })
          .filter((o) => o && !vistos.has(o.d.id) && vistos.add(o.d.id))
          .map(({ d, x }) => ({
            fecha: diaBogota(x.fecha), folio: d.folio || '', anulada: true,
            total: Number(d.total) || 0, subtotal: Number(d.subtotal) || 0, descuento: Number(d.descuento) || 0,
            vendedor: d.vendedor || 'Sin vendedor', cliente: d.cliente_nombre || 'Sin cliente', usuario: x.usuario_email || '',
          })),
      }
      setD({ ing: a.data || [], egr: (b.data || []).map((x) => ({ ...x, categoria: x.categoria_nombre })), cxc: c.data || [], cxp: e.data || [], fuentes, cargando: false })
    })()
  }, [])
  return d
}

const delMes = (f, mes) => mes === null || Number(f.slice(5, 7)) - 1 === mes

function calcFin(d, anio, mes, catSel = null) {
  const y = (r) => (r.fecha || '').slice(0, 4) === String(anio)
  const ing = d.ing.filter(y), egr = d.egr.filter(y)
  const egrC = catSel ? egr.filter((r) => (r.categoria || 'Sin categoría') === catSel) : egr
  const porMes = MESES.map((m, i) => {
    const k = String(i + 1).padStart(2, '0')
    const I = sum(ing.filter((r) => r.fecha.slice(5, 7) === k)), E = sum(egrC.filter((r) => r.fecha.slice(5, 7) === k))
    return { mes: m, Ingresos: I, Egresos: E, Saldo: I - E }
  })
  const egrSel = egr.filter((r) => delMes(r.fecha, mes))
  const cat = {}
  egrSel.forEach((r) => { const n = r.categoria || 'Sin categoría'; cat[n] = (cat[n] || 0) + (Number(r.monto) || 0) })
  const categorias = Object.entries(cat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const totI = sum(ing.filter((r) => delMes(r.fecha, mes))), totE = sum(egrC.filter((r) => delMes(r.fecha, mes)))
  return {
    porMes, categorias, totI, totE, saldo: totI - totE, prop: totE ? (totI / totE) * 100 : 0,
    cobrar: sum(d.cxc, 'saldo'), pagar: sum(d.cxp, 'saldo'), vencido: sum(d.cxc.filter((r) => r.vencida), 'saldo'),
  }
}

function calcGen(rows, anio, mes, grupoSel = null) {
  const r = rows.filter((x) => x.fecha.slice(0, 4) === String(anio))
  const rg = grupoSel ? r.filter((x) => x.grupo === grupoSel) : r
  const porMes = MESES.map((m, i) => ({ mes: m, valor: sum(rg.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), 'valor') }))
  const sel = rg.filter((x) => delMes(x.fecha, mes))
  const g = {}
  r.filter((x) => delMes(x.fecha, mes)).forEach((x) => { g[x.grupo] = (g[x.grupo] || 0) + x.valor })
  const top = Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const total = sum(sel, 'valor')
  return { porMes, top: top.slice(0, 12), total, n: sel.length, grupos: top.length, prom: sel.length ? total / sel.length : 0 }
}

/* ---------- logo con fondo transparente (quita el blanco del JPG al cargar) ---------- */
let LOGO_LISTO = null
function Logo({ alto = 54 }) {
  const [src, setSrc] = useState(LOGO_LISTO || '/logo.jpg')
  useEffect(() => {
    if (LOGO_LISTO) return
    const im = new Image()
    im.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = im.naturalWidth; c.height = im.naturalHeight
        const x = c.getContext('2d')
        x.drawImage(im, 0, 0)
        const d = x.getImageData(0, 0, c.width, c.height), p = d.data
        for (let i = 0; i < p.length; i += 4) {
          const m = Math.min(p[i], p[i + 1], p[i + 2])
          if (m > 245) p[i + 3] = 0
          else if (m > 215) p[i + 3] = Math.round((255 * (245 - m)) / 30)
        }
        x.putImageData(d, 0, 0)
        LOGO_LISTO = c.toDataURL('image/png')
        setSrc(LOGO_LISTO)
      } catch (e) { /* si falla, queda el JPG original */ }
    }
    im.src = '/logo.jpg'
  }, [])
  return <img src={src} alt="Ahumados M&Y" style={{ height: alto }} />
}

function calcProd(rows, anio, mes, sel = null) {
  const r = rows.filter((x) => x.fecha.slice(0, 4) === String(anio))
  const rs = sel ? r.filter((x) => x.grupo === sel) : r
  const porMes = MESES.map((m, i) => ({ mes: m, valor: sum(rs.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), 'valor') }))
  const g = {}
  r.filter((x) => delMes(x.fecha, mes)).forEach((x) => {
    const a = g[x.grupo] || (g[x.grupo] = { name: x.grupo, value: 0, cant: 0, costo: 0 })
    a.value += x.valor; a.cant += x.cant; a.costo += x.costo
  })
  const lista = Object.values(g).sort((a, b) => b.value - a.value)
  const en = rs.filter((x) => delMes(x.fecha, mes))
  return { porMes, lista, total: sum(en, 'valor'), cant: sum(en, 'cant'), costo: sum(en, 'costo'), n: lista.length }
}

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const pct = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%')

function calcEvo(rows, anio, mes, gran) {
  const hoy = new Date()
  const del = (y) => rows.filter((x) => x.fecha.slice(0, 4) === String(y))
  const act = del(anio), ant = del(anio - 1)
  const mesDe = (x) => Number(x.fecha.slice(5, 7)) - 1
  const enMes = (x) => mes === null || mesDe(x) === mes
  const porMes = MESES.map((m, i) => ({
    mes: m, etq: m,
    valor: sum(act.filter((x) => mesDe(x) === i), 'valor'),
    anterior: sum(ant.filter((x) => mesDe(x) === i), 'valor'),
  }))
  let ultimo = -1
  porMes.forEach((m, i) => { if (m.valor > 0) ultimo = i })
  let acA = 0, acP = 0
  porMes.forEach((m, i) => {
    m.mom = i > 0 && porMes[i - 1].valor > 0 ? ((m.valor - porMes[i - 1].valor) / porMes[i - 1].valor) * 100 : null
    acA += m.valor; acP += m.anterior
    m.acumA = i <= ultimo ? acA : null
    m.acumP = acP
  })
  const dia = (x) => Number(x.fecha.slice(8, 10))
  const sem = (x) => {
    const [y, m, d] = x.fecha.split('-').map(Number)
    return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 / 7) + 1
  }
  let serie
  if (gran === 'mes') serie = porMes
  else if (gran === 'dia') {
    const m = mes ?? (anio === hoy.getFullYear() ? hoy.getMonth() : 11)
    const dias = new Date(anio, m + 1, 0).getDate()
    serie = Array.from({ length: dias }, (_, k) => {
      const igual = (x) => mesDe(x) === m && dia(x) === k + 1
      return { etq: String(k + 1), valor: sum(act.filter(igual), 'valor'), anterior: sum(ant.filter(igual), 'valor') }
    })
  } else {
    const A = act.filter(enMes), P = ant.filter(enMes)
    const maxS = Math.max(0, ...A.map(sem), ...P.map(sem))
    serie = Array.from({ length: maxS }, (_, k) => ({
      etq: 'S' + (k + 1), valor: sum(A.filter((x) => sem(x) === k + 1), 'valor'), anterior: sum(P.filter((x) => sem(x) === k + 1), 'valor'),
    }))
  }
  const A = act.filter(enMes)
  const totA = sum(A, 'valor'), totP = sum(ant.filter(enMes), 'valor')
  const activos = porMes.filter((m) => m.valor > 0)
  const dow = [1, 2, 3, 4, 5, 6, 0].map((k) => ({
    dia: DOW[k],
    valor: sum(A.filter((x) => { const [y, m, d] = x.fecha.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === k }), 'valor'),
  }))
  return {
    porMes, serie, totA, totP, dow, ultimo,
    crec: totP > 0 ? ((totA - totP) / totP) * 100 : null,
    mejor: activos.length ? activos.reduce((a, b) => (b.valor > a.valor ? b : a)) : null,
    prom: activos.length ? sum(porMes, 'valor') / activos.length : 0,
  }
}

function calcVend(rows, anio, mes, sel = null) {
  const r = rows.filter((x) => x.fecha.slice(0, 4) === String(anio))
  const rs = sel ? r.filter((x) => x.grupo === sel) : r
  const porMes = MESES.map((m, i) => ({ mes: m, valor: sum(rs.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), 'valor') }))
  const g = {}
  r.filter((x) => delMes(x.fecha, mes)).forEach((x) => {
    const a = g[x.grupo] || (g[x.grupo] = { name: x.grupo, value: 0, comision: 0, n: 0, clientes: new Set() })
    a.value += x.valor; a.comision += x.comision; a.n += 1; a.clientes.add(x.cliente)
  })
  const lista = Object.values(g).sort((a, b) => b.value - a.value)
  const en = rs.filter((x) => delMes(x.fecha, mes))
  const total = sum(en, 'valor')
  return { porMes, lista, total, comision: sum(en, 'comision'), n: en.length, ticket: en.length ? total / en.length : 0 }
}

function calcDesc(rows, anio, mes, sel = null) {
  const r = rows.filter((x) => x.fecha.slice(0, 4) === String(anio))
  const rs = sel ? r.filter((x) => x.vendedor === sel) : r
  const porMes = MESES.map((m, i) => {
    const mm = rs.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1)
    return { mes: m, desc: sum(mm.filter((x) => !x.anulada), 'descuento'), anul: mm.filter((x) => x.anulada).length }
  })
  const g = {}
  r.filter((x) => !x.anulada && delMes(x.fecha, mes)).forEach((x) => {
    const a = g[x.vendedor] || (g[x.vendedor] = { name: x.vendedor, value: 0 })
    a.value += x.descuento
  })
  const lista = Object.values(g).sort((a, b) => b.value - a.value)
  const en = rs.filter((x) => delMes(x.fecha, mes))
  const ok = en.filter((x) => !x.anulada), an = en.filter((x) => x.anulada)
  return {
    porMes, lista, desc: sum(ok, 'descuento'), bruto: sum(ok, 'subtotal'), nAnul: an.length, vAnul: sum(an, 'total'), n: en.length,
    anuladas: [...an].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 100),
  }
}

function calcProy(rows, items, metas, sel, H) {
  const hoy = new Date(), y = hoy.getFullYear(), m = hoy.getMonth(), dHoy = hoy.getDate()
  const filt = sel ? rows.filter((x) => x.grupo === sel) : rows
  const norm = (yy, mm) => { const t = yy * 12 + mm; return [Math.floor(t / 12), ((t % 12) + 12) % 12] }
  const clave = (yy, mm) => { const [a, b] = norm(yy, mm); return `${a}-${String(b + 1).padStart(2, '0')}` }
  const etq = (yy, mm) => { const [a, b] = norm(yy, mm); return `${MESES[b]} ${String(a).slice(2)}` }
  const tot = (yy, mm) => { const k = clave(yy, mm); return sum(filt.filter((x) => x.fecha.slice(0, 7) === k), 'valor') }
  const metaDe = (yy, mm) => { const [a, b] = norm(yy, mm); const f = metas.find((x) => x.anio === a && x.mes === b + 1 && x.vendedor === (sel || '')); return f ? Number(f.valor) || 0 : 0 }
  const diasMes = new Date(y, m + 1, 0).getDate()
  const acum = tot(y, m), ritmo = dHoy > 0 ? acum / dHoy : 0, proy = ritmo * diasMes
  const restan = diasMes - dHoy, meta = metaDe(y, m)
  const necesario = restan > 0 ? Math.max(0, (meta - acum) / restan) : 0
  const previos = [1, 2, 3].map((k) => tot(y, m - k))
  const conDatos = previos.filter((v) => v > 0)
  const avg3 = conDatos.length ? conDatos.reduce((a, b) => a + b, 0) / conDatos.length : proy
  const sumAct = previos.reduce((a, b) => a + b, 0)
  const sumPrev = [1, 2, 3].reduce((a, k) => a + tot(y - 1, m - k), 0)
  const factor = sumPrev > 0 ? Math.min(2, Math.max(0.5, sumAct / sumPrev)) : null

  const futuros = Array.from({ length: H }, (_, i) => {
    const k = i + 1, base = tot(y - 1, m + k)
    const estacional = factor !== null && base > 0
    const pron = estacional ? base * factor : avg3
    return { mes: etq(y, m + k), pron, meta: metaDe(y, m + k), metodo: estacional ? 'Estacional' : 'Promedio 3 meses' }
  })
  const pasados = [5, 4, 3, 2, 1].map((k) => ({ mes: etq(y, m - k), real: tot(y, m - k), meta: metaDe(y, m - k) }))
  const serie = [
    ...pasados,
    { mes: etq(y, m) + ' (mes actual)', real: acum, proy: Math.max(0, proy - acum), meta },
    ...futuros.map((f) => ({ mes: f.mes, pron: f.pron, meta: f.meta })),
  ]

  const claves = [1, 2, 3].map((k) => clave(y, m - k))
  const porProd = {}
  items.forEach((x) => {
    const i = claves.indexOf(x.fecha.slice(0, 7))
    if (i < 0) return
    const p = porProd[x.grupo] || (porProd[x.grupo] = [0, 0, 0])
    p[i] += x.cant
  })
  const W = [0.5, 0.3, 0.2]
  const demanda = Object.entries(porProd).map(([name, a]) => {
    let hasta = -1
    a.forEach((v, k) => { if (v > 0) hasta = k })
    if (hasta < 0) return null
    const usados = a.slice(0, hasta + 1)
    const sw = W.slice(0, hasta + 1).reduce((x, y) => x + y, 0)
    const pron = usados.reduce((acc, v, k) => acc + v * W[k], 0) / sw
    const prom = usados.reduce((x, y) => x + y, 0) / usados.length
    const tendencia = usados.length < 2 ? 'Pocos datos' : a[0] > prom * 1.1 ? '▲ sube' : a[0] < prom * 0.9 ? '▼ baja' : '= estable'
    return { name, prom, pron, ultimo: a[0], min: Math.min(...usados), max: Math.max(...usados), meses: usados.length, tendencia }
  }).filter(Boolean).sort((a, b) => b.pron - a.pron).slice(0, 12)

  const dowTot = [0, 0, 0, 0, 0, 0, 0]
  filt.forEach((x) => { const [yy, mm, dd] = x.fecha.split('-').map(Number); dowTot[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()] += x.valor })
  const mejorDia = filt.length >= 5 ? DOW[dowTot.indexOf(Math.max(...dowTot))] : null

  return {
    mesActual: etq(y, m), dHoy, diasMes, restan, acum, ritmo, proy, meta, necesario, brecha: proy - meta,
    serie, futuros, demanda, mejorDia, metodoBase: factor !== null ? 'estacional' : 'promedio', pocos: filt.length < 30,
  }
}

/* ---------- piezas visuales ---------- */
const sombra = '0 3px 8px rgba(90,70,0,.22)'

function Kpi({ label, value, bg = C.tarjeta, big }) {
  return (
    <div style={{ background: bg, borderRadius: 16, boxShadow: sombra, padding: big ? '16px 18px' : '12px 16px', textAlign: 'center', flex: '1 1 160px' }}>
      <div style={{ fontSize: big ? 30 : 24, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function BigKpi({ titulo, value, bg }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ borderTop: '2px solid #222', fontWeight: 900, fontSize: 19, padding: '10px 0 6px' }}>{titulo}</div>
      <div style={{ background: bg, fontSize: 27, fontWeight: 900, padding: '12px 6px', boxShadow: sombra }}>{value}</div>
    </div>
  )
}

function Panel({ titulo, children, alto = 270, onClick, mini, fijo }) {
  return (
    <div onClick={onClick} style={{ background: mini ? 'transparent' : C.crema, border: mini ? 'none' : '1px solid #E3D79A', borderRadius: 16, boxShadow: mini ? 'none' : sombra, padding: mini ? 0 : '14px 12px', cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}>
      {titulo && <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{titulo}</div>}
      <div style={{ height: fijo ? alto : Math.round(alto * Math.max(1, window.innerHeight / 800)) }}><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  )
}

const ejeY = <YAxis tickFormatter={compacto} width={48} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
const rejilla = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfc0" />

const GBarras = ({ data, labels = true }) => (
  <BarChart data={data} margin={{ top: 18 }}>
    {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}
    <Tooltip formatter={$} /><Legend />
    <Bar dataKey="Ingresos" fill={C.verde} radius={[4, 4, 0, 0]}>{labels && <LabelList dataKey="Ingresos" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />}</Bar>
    <Bar dataKey="Egresos" fill={C.rojo} radius={[4, 4, 0, 0]}>{labels && <LabelList dataKey="Egresos" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />}</Bar>
  </BarChart>
)
const GSaldo = ({ data }) => (
  <LineChart data={data} margin={{ top: 22, right: 14 }}>
    {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} />
    <Line dataKey="Saldo" stroke={C.azul} strokeWidth={3} dot={{ r: 4, fill: C.azul }}>
      <LabelList dataKey="Saldo" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
    </Line>
  </LineChart>
)
const GDona = ({ data }) => (
  <PieChart>
    <Pie data={data} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3}
      label={({ name, percent }) => (percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
      {data.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
    </Pie>
    <Tooltip formatter={$} />
  </PieChart>
)
const GRanking = ({ data, color = C.azul, fmt = compacto }) => (
  <BarChart data={data} layout="vertical" margin={{ right: 56 }}>
    <XAxis type="number" hide />
    <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
    <Tooltip formatter={fmt} />
    <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]}><LabelList dataKey="value" position="right" formatter={fmt === $ ? compacto : fmt} style={{ fontSize: 11, fontWeight: 700 }} /></Bar>
  </BarChart>
)
const GMes = ({ data, color = C.azul, fmt }) => (
  <BarChart data={data} margin={{ top: 18 }}>
    {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={fmt} />
    <Bar dataKey="valor" fill={color} radius={[4, 4, 0, 0]}><LabelList dataKey="valor" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} /></Bar>
  </BarChart>
)

function Tabla({ cols, filas }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: C.crema, fontSize: 13, boxShadow: sombra }}>
      <thead><tr>{cols.map((c, i) => <th key={c} style={{ background: C.dorado, padding: '7px 10px', textAlign: i ? 'right' : 'left' }}>{c}</th>)}</tr></thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} style={{ borderTop: '1px solid #eee', fontWeight: i === filas.length - 1 && f[0] === 'Total' ? 800 : 400 }}>
            {f.map((v, j) => <td key={j} style={{ padding: '6px 10px', textAlign: j ? 'right' : 'left', color: typeof v === 'string' && v.startsWith('-') ? C.rojo : typeof v === 'string' && v.startsWith('+') ? '#0a7a3d' : 'inherit' }}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const Banda = ({ titulo }) => (
  <div style={{ flex: 1, background: C.dorado, border: '3px solid #fff', outline: `1px solid ${C.dorado}`, padding: '8px 18px', textAlign: 'center', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>{titulo}</div>
)
const grid = (min = 320) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14, alignItems: 'start' })

/* ---------- reportes ---------- */
function ReporteFinanzas({ vista, k }) {
  const filasMes = k.porMes.map((m) => [m.mes, $(m.Egresos), $(m.Ingresos), $(m.Saldo)])
  const bigs = (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      <BigKpi titulo="SALDO DEL PERIODO" value={$(k.saldo)} bg={C.saldo} />
      <BigKpi titulo="CUENTAS POR COBRAR" value={$(k.cobrar)} bg={C.cobrar} />
      <BigKpi titulo="CUENTAS POR PAGAR" value={$(k.pagar)} bg={C.pagar} />
    </div>
  )
  if (vista === 'flujo')
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        <Tabla cols={['Mes', 'Egreso', 'Ingreso', 'Saldo']} filas={[...filasMes, ['Total', $(k.totE), $(k.totI), $(k.saldo)]]} />
        <Panel titulo="Distribución por categoría" alto={300}><GDona data={k.categorias} /></Panel>
        {bigs}
        <div style={{ gridColumn: '1 / -1' }}><Panel titulo="Ingresos vs egresos" alto={300}><GBarras data={k.porMes} /></Panel></div>
      </div>
    )
  if (vista === 'categorias')
    return (
      <div style={grid(360)}>
        <Panel titulo="Distribución de egresos" alto={360}><GDona data={k.categorias} /></Panel>
        <Tabla cols={['Categoría', 'Total']} filas={[...k.categorias.map((c) => [c.name, $(c.value)]), ['Total', $(k.totE)]]} />
      </div>
    )
  if (vista === 'cartera')
    return (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi big label="Por cobrar" value={$(k.cobrar)} bg={C.cobrar} />
        <Kpi big label="Vencido por cobrar" value={$(k.vencido)} bg="#F8C9C4" />
        <Kpi big label="Por pagar" value={$(k.pagar)} bg={C.pagar} />
        <Kpi big label="Cartera neta" value={$(k.cobrar - k.pagar)} bg={C.saldo} />
      </div>
    )
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label="Ingresos" value={$(k.totI)} />
        <Kpi label="Egresos" value={$(k.totE)} />
        <Kpi label="Flujo del periodo" value={$(k.saldo)} bg={C.saldo} />
        <Kpi label="Por cobrar" value={$(k.cobrar)} bg={C.cobrar} />
        <Kpi label="Por pagar" value={$(k.pagar)} bg={C.pagar} />
        <Kpi label="Proporción ingresos/egresos" value={k.prop.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%'} />
      </div>
      <div style={grid(420)}>
        <Panel titulo="Ingresos vs egresos" alto={290}><GBarras data={k.porMes} /></Panel>
        <Panel titulo="Saldo del flujo" alto={290}><GSaldo data={k.porMes} /></Panel>
        <Panel titulo="Categoría del flujo" alto={290}><GDona data={k.categorias} /></Panel>
        <Panel titulo="Principales egresos" alto={290}><GRanking data={k.categorias.slice(0, 8)} color={C.rojo} fmt={$} /></Panel>
      </div>
    </div>
  )
}

function ReporteGenerico({ f, g, error }) {
  const fmt = fmtF(f)
  if (error) return <div style={{ background: C.crema, padding: 20, borderRadius: 12 }}>No se pudo leer <b>{f.tabla}</b>: {error}. Revisa los nombres de columna en FUENTES.</div>
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi big label={f.valorNombre} value={fmt(g.total)} />
        <Kpi label="Registros" value={num(g.n)} />
        <Kpi label="Promedio por registro" value={fmt(g.prom)} />
        <Kpi label={f.grupoNombre} value={num(g.grupos)} bg={C.saldo} />
      </div>
      <div style={grid(420)}>
        <Panel titulo={`${f.valorNombre} por mes`} alto={300}><GMes data={g.porMes} fmt={fmt} /></Panel>
        <Panel titulo={`Principales ${f.grupoNombre.toLowerCase()}`} alto={300}><GRanking data={g.top} fmt={fmt} /></Panel>
      </div>
      <Tabla cols={[f.grupoNombre, f.valorNombre]} filas={[...g.top.map((t) => [t.name, fmt(t.value)]), ['Total', fmt(g.total)]]} />
    </div>
  )
}

/* ---------- dashboard final estilo Power BI ---------- */
const atenuar = (sel, v) => (sel === null || sel === v ? 1 : 0.3)

function DashboardPBI({ k, anio, setAnio, mes, setMes, cat, setCat }) {
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const hayFiltro = mes !== null || cat !== null
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'center', background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const nombreCat = (d) => d.name ?? d.payload?.name
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={seg(mes === i)}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Categoría de egreso</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {k.categorias.map((c) => <div key={c.name} onClick={() => setCat(cat === c.name ? null : c.name)} style={{ ...seg(cat === c.name), textAlign: 'left' }}>{c.name}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setCat(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Ingresos', $(k.totI), C.verde)}
          {kpi('Egresos', $(k.totE), C.rojo)}
          {kpi('Flujo del periodo', $(k.saldo), C.azul)}
          {kpi('Por cobrar', $(k.cobrar), '#ED7D31')}
          {kpi('Por pagar', $(k.pagar), '#5B9BD5')}
          {kpi('Ingresos / egresos', k.prop.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%', '#7F6000')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {cat && `· ${cat}`} (toca de nuevo para quitar)</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Ingresos vs egresos (toca un mes)">
            <BarChart data={k.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
              {['Ingresos', 'Egresos'].map((key) => (
                <Bar key={key} dataKey={key} fill={key === 'Ingresos' ? C.verde : C.rojo} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                  {k.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                  <LabelList dataKey={key} position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
                </Bar>
              ))}
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Saldo del flujo"><GSaldo data={k.porMes} /></Panel>
          <Panel fijo alto={alto} titulo="Categoría del flujo (toca una porción)">
            <PieChart>
              <Pie data={k.categorias} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3} cursor="pointer"
                onClick={(d) => setCat(cat === nombreCat(d) ? null : nombreCat(d))}
                label={({ name, percent }) => (percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
                {k.categorias.map((c, i) => <Cell key={i} fill={PIE[i % PIE.length]} fillOpacity={atenuar(cat, c.name)} />)}
              </Pie>
              <Tooltip formatter={$} />
            </PieChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Principales egresos">
            <BarChart data={k.categorias.slice(0, 8)} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={$} />
              <Bar dataKey="value" fill={C.rojo} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => setCat(cat === nombreCat(d) ? null : nombreCat(d))}>
                {k.categorias.slice(0, 8).map((c, i) => <Cell key={i} fillOpacity={atenuar(cat, c.name)} />)}
                <LabelList dataKey="value" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function DashboardGenerico({ f, g, error, anio, setAnio, mes, setMes, sel, setSel }) {
  const fmt = fmtF(f)
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const hayFiltro = mes !== null || sel !== null
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const nombre = (d) => d.name ?? d.payload?.name
  const alternar = (d) => setSel(sel === nombre(d) ? null : nombre(d))
  if (error) return <div style={{ background: C.crema, border: '1px solid #E3D79A', padding: 20, borderRadius: 12 }}>No se pudo leer <b>{f.tabla}</b>: {error}</div>
  const top8 = g.top.slice(0, 8)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, border: '1px solid #E3D79A', borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={{ ...seg(mes === i), textAlign: 'center' }}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>{f.grupoNombre}</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {g.top.map((t) => <div key={t.name} onClick={() => setSel(sel === t.name ? null : t.name)} style={seg(sel === t.name)}>{t.name}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setSel(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi(f.valorNombre, fmt(g.total), C.azul)}
          {kpi('Registros', num(g.n), C.verde)}
          {kpi('Promedio por registro', fmt(g.prom), '#ED7D31')}
          {kpi(f.grupoNombre, num(g.grupos), '#7F6000')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {sel && `· ${sel}`} (toca de nuevo para quitar)</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo={`${f.valorNombre} por mes (toca un mes)`}>
            <BarChart data={g.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={fmt} />
              <Bar dataKey="valor" fill={C.azul} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                {g.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                <LabelList dataKey="valor" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo={`Principales ${f.grupoNombre.toLowerCase()}`}>
            <BarChart data={top8} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={fmt} />
              <Bar dataKey="value" fill={C.azul} radius={[0, 4, 4, 0]} cursor="pointer" onClick={alternar}>
                {top8.map((t, i) => <Cell key={i} fillOpacity={atenuar(sel, t.name)} />)}
                <LabelList dataKey="value" position="right" formatter={(v) => (f.dinero ? compacto(v) : num(v))} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Participación (toca una porción)">
            <PieChart>
              <Pie data={top8} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3} cursor="pointer" onClick={alternar}
                label={({ name, percent }) => (percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
                {top8.map((t, i) => <Cell key={i} fill={PIE[i % PIE.length]} fillOpacity={atenuar(sel, t.name)} />)}
              </Pie>
              <Tooltip formatter={fmt} />
            </PieChart>
          </Panel>
          <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              <Tabla cols={[f.grupoNombre, f.valorNombre]} filas={[...g.top.map((t) => [t.name, fmt(t.value)]), ['Total', fmt(g.top.reduce((a, t) => a + t.value, 0))]]} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const margenTxt = (costo, valor) => (costo > 0 && valor > 0 ? (((valor - costo) / valor) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%' : 'Sin costo')

function Pendiente({ nombre }) {
  return <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: 40, textAlign: 'center', fontWeight: 700 }}>{nombre} se construye en la siguiente fase.</div>
}

function DashboardProductos({ g, error, anio, setAnio, mes, setMes, sel, setSel }) {
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const hayFiltro = mes !== null || sel !== null
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const nombre = (d) => d.name ?? d.payload?.name
  const alternar = (d) => setSel(sel === nombre(d) ? null : nombre(d))
  if (error) return <div style={{ background: C.crema, border: '1px solid #E3D79A', padding: 20, borderRadius: 12 }}>No se pudo leer las ventas por producto: {error}. Puede faltar la relación entre venta_items, ventas y productos.</div>
  const top8 = g.lista.slice(0, 8)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, border: '1px solid #E3D79A', borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={{ ...seg(mes === i), textAlign: 'center' }}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Producto</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {g.lista.slice(0, 15).map((p) => <div key={p.name} onClick={() => setSel(sel === p.name ? null : p.name)} style={seg(sel === p.name)}>{p.name}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setSel(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Ingresos por productos', $(g.total), C.azul)}
          {kpi('Unidades vendidas', num(g.cant), C.verde)}
          {kpi('Productos vendidos', num(g.n), '#ED7D31')}
          {kpi('Margen bruto', margenTxt(g.costo, g.total), '#7F6000')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {sel && `· ${sel}`} (toca de nuevo para quitar)</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Ingresos por mes (toca un mes)">
            <BarChart data={g.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} />
              <Bar dataKey="valor" fill={C.azul} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                {g.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                <LabelList dataKey="valor" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Productos más vendidos (toca uno)">
            <BarChart data={top8} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={$} />
              <Bar dataKey="value" fill={C.azul} radius={[0, 4, 4, 0]} cursor="pointer" onClick={alternar}>
                {top8.map((p, i) => <Cell key={i} fillOpacity={atenuar(sel, p.name)} />)}
                <LabelList dataKey="value" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Participación en ingresos">
            <PieChart>
              <Pie data={top8} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3} cursor="pointer" onClick={alternar}
                label={({ name, percent }) => (percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
                {top8.map((p, i) => <Cell key={i} fill={PIE[i % PIE.length]} fillOpacity={atenuar(sel, p.name)} />)}
              </Pie>
              <Tooltip formatter={$} />
            </PieChart>
          </Panel>
          <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle (de más a menos vendido)</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              <Tabla cols={['Producto', 'Unidades', 'Ingresos', 'Margen']} filas={[...g.lista.map((p) => [p.name, num(p.cant), $(p.value), margenTxt(p.costo, p.value)]), ['Total', num(g.lista.reduce((a, p) => a + p.cant, 0)), $(g.lista.reduce((a, p) => a + p.value, 0)), margenTxt(g.lista.reduce((a, p) => a + p.costo, 0), g.lista.reduce((a, p) => a + p.value, 0))]]} />
            </div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Margen calculado con el costo promedio actual de cada producto.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardEvolucion({ rows, error, anio, setAnio, mes, setMes }) {
  const [gran, setGran] = useState('mes')
  const e = useMemo(() => calcEvo(rows, anio, mes, gran), [rows, anio, mes, gran])
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'center', background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  if (error) return <div style={{ background: C.crema, border: '1px solid #E3D79A', padding: 20, borderRadius: 12 }}>No se pudo leer las ventas: {error}</div>
  const nombreGran = gran === 'dia' ? 'día' : gran === 'semana' ? 'semana' : 'mes'
  const etiqueta = (v) => (v ? compacto(v) : '')
  const dif = (v) => (v > 0 ? '+' : '') + $(v)
  const variacion = (a, p) => (p > 0 ? ((a - p) / p) * 100 : null)
  const hasta = e.porMes.filter((_, i) => i <= e.ultimo)
  const tA = sum(hasta, 'valor'), tP = sum(hasta, 'anterior')
  const filasComp = [
    ...e.porMes.map((m) => [m.mes, $(m.anterior), $(m.valor), dif(m.valor - m.anterior), pct(variacion(m.valor, m.anterior)), pct(m.mom)]),
    [e.ultimo >= 0 ? `Total (Ene–${MESES[e.ultimo]})` : 'Total', $(tP), $(tA), dif(tA - tP), pct(variacion(tA, tP)), ''],
  ]
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, border: '1px solid #E3D79A', borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0 }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(ev) => setAnio(Number(ev.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Agrupar por</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, n]) => <div key={k} onClick={() => setGran(k)} style={seg(gran === k)}>{n}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={seg(mes === i)}>{m}</div>)}
          </div>
        </div>
        {mes !== null && <button onClick={() => setMes(null)} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi(`Ventas ${mes === null ? anio : MESES[mes] + ' ' + anio}`, $(e.totA), C.azul)}
          {kpi(`Crecimiento vs ${anio - 1}`, pct(e.crec), e.crec == null || e.crec >= 0 ? C.verde : C.rojo)}
          {kpi('Mejor mes', e.mejor ? `${e.mejor.mes} · ${compacto(e.mejor.valor)}` : '—', '#ED7D31')}
          {kpi('Promedio mensual', $(e.prom), '#7F6000')}
        </div>
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo={`Ventas por ${nombreGran} (línea: ${anio - 1})`}>
            <ComposedChart data={e.serie} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="etq" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
              <Bar dataKey="valor" name={String(anio)} fill={C.azul} radius={[4, 4, 0, 0]} cursor={gran === 'mes' ? 'pointer' : 'default'} onClick={(_, i) => gran === 'mes' && setMes(mes === i ? null : i)}>
                {gran === 'mes' && e.serie.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                {gran === 'mes' && <LabelList dataKey="valor" position="top" formatter={etiqueta} style={{ fontSize: 10, fontWeight: 700 }} />}
              </Bar>
              <Line dataKey="anterior" name={String(anio - 1)} stroke="#ED7D31" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Acumulado del año vs año anterior">
            <LineChart data={e.porMes} margin={{ top: 18, right: 14 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
              <Line dataKey="acumA" name={String(anio)} stroke={C.azul} strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
              <Line dataKey="acumP" name={String(anio - 1)} stroke="#ED7D31" strokeWidth={2.5} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Crecimiento frente al mes anterior">
            <BarChart data={e.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => v + '%'} width={48} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={pct} />
              <Bar dataKey="mom" radius={[4, 4, 0, 0]}>
                {e.porMes.map((m, i) => <Cell key={i} fill={(m.mom || 0) >= 0 ? C.verde : C.rojo} />)}
                <LabelList dataKey="mom" position="top" formatter={(v) => (v == null ? '' : pct(v))} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Estacionalidad: ventas por día de la semana">
            <BarChart data={e.dow} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="dia" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} />
              <Bar dataKey="valor" fill={C.dorado} stroke="#b9a54a" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="valor" position="top" formatter={etiqueta} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <div style={{ gridColumn: '1 / -1', background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle comparativo mes a mes</div>
            <Tabla cols={['Mes', String(anio - 1), String(anio), 'Diferencia', 'Variación', 'Vs mes anterior']} filas={filasComp} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardVendedores({ g, error, anio, setAnio, mes, setMes, sel, setSel }) {
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const hayFiltro = mes !== null || sel !== null
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const nombre = (d) => d.name ?? d.payload?.name
  const alternar = (d) => setSel(sel === nombre(d) ? null : nombre(d))
  if (error) return <div style={{ background: C.crema, border: '1px solid #E3D79A', padding: 20, borderRadius: 12 }}>No se pudo leer las ventas por vendedor: {error}</div>
  const top = g.lista.slice(0, 10)
  const totales = g.lista.reduce((a, v) => ({ value: a.value + v.value, n: a.n + v.n, comision: a.comision + v.comision }), { value: 0, n: 0, comision: 0 })
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, border: '1px solid #E3D79A', borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={{ ...seg(mes === i), textAlign: 'center' }}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Vendedor</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {g.lista.map((v) => <div key={v.name} onClick={() => setSel(sel === v.name ? null : v.name)} style={seg(sel === v.name)}>{v.name}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setSel(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Ventas', $(g.total), C.azul)}
          {kpi('Comisiones', $(g.comision), '#ED7D31')}
          {kpi('Ticket promedio', $(g.ticket), C.verde)}
          {kpi('Ventas realizadas', num(g.n), '#7F6000')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {sel && `· ${sel}`} (toca de nuevo para quitar)</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Ventas por mes (toca un mes)">
            <BarChart data={g.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} />
              <Bar dataKey="valor" fill={C.azul} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                {g.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                <LabelList dataKey="valor" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Ventas por vendedor (toca uno)">
            <BarChart data={top} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={$} />
              <Bar dataKey="value" fill={C.azul} radius={[0, 4, 4, 0]} cursor="pointer" onClick={alternar}>
                {top.map((v, i) => <Cell key={i} fillOpacity={atenuar(sel, v.name)} />)}
                <LabelList dataKey="value" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Comisión por vendedor">
            <BarChart data={top} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={$} />
              <Bar dataKey="comision" fill="#ED7D31" radius={[0, 4, 4, 0]} cursor="pointer" onClick={alternar}>
                {top.map((v, i) => <Cell key={i} fillOpacity={atenuar(sel, v.name)} />)}
                <LabelList dataKey="comision" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle por vendedor</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              <Tabla cols={['Vendedor', 'Ventas', '# ventas', 'Clientes', 'Ticket', 'Comisión']}
                filas={[...g.lista.map((v) => [v.name, $(v.value), num(v.n), num(v.clientes.size), $(v.n ? v.value / v.n : 0), $(v.comision)]), ['Total', $(totales.value), num(totales.n), '', $(totales.n ? totales.value / totales.n : 0), $(totales.comision)]]} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardDescuentos({ g, error, anio, setAnio, mes, setMes, sel, setSel }) {
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const hayFiltro = mes !== null || sel !== null
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const nombre = (d) => d.name ?? d.payload?.name
  const alternar = (d) => setSel(sel === nombre(d) ? null : nombre(d))
  const p1 = (v) => v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%'
  if (error) return <div style={{ background: C.crema, border: '1px solid #E3D79A', padding: 20, borderRadius: 12 }}>No se pudo leer las ventas: {error}</div>
  const top = g.lista.slice(0, 10)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, background: C.crema, border: '1px solid #E3D79A', borderRadius: 12, boxShadow: sombra, padding: 12, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={{ ...seg(mes === i), textAlign: 'center' }}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Vendedor</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {g.lista.map((v) => <div key={v.name} onClick={() => setSel(sel === v.name ? null : v.name)} style={seg(sel === v.name)}>{v.name}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setSel(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Descuentos otorgados', $(g.desc), '#ED7D31')}
          {kpi('Descuento sobre ventas', g.bruto > 0 ? p1((g.desc / g.bruto) * 100) : '—', C.azul)}
          {kpi('Ventas anuladas', `${num(g.nAnul)} · ${compacto(g.vAnul)}`, C.rojo)}
          {kpi('% de ventas anuladas', g.n > 0 ? p1((g.nAnul / g.n) * 100) : '—', '#7F6000')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {sel && `· ${sel}`} (toca de nuevo para quitar)</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Descuentos por mes (toca un mes)">
            <BarChart data={g.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} />
              <Bar dataKey="desc" name="Descuentos" fill="#ED7D31" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                {g.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                <LabelList dataKey="desc" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Descuentos por vendedor (toca uno)">
            <BarChart data={top} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={$} />
              <Bar dataKey="value" fill="#ED7D31" radius={[0, 4, 4, 0]} cursor="pointer" onClick={alternar}>
                {top.map((v, i) => <Cell key={i} fillOpacity={atenuar(sel, v.name)} />)}
                <LabelList dataKey="value" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Ventas anuladas por mes (cantidad)">
            <BarChart data={g.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="anul" name="Anuladas" fill={C.rojo} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="anul" position="top" formatter={(v) => (v ? v : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Ventas anuladas o eliminadas (fecha de eliminación)</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              {g.anuladas.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', fontWeight: 700 }}>No hay ventas anuladas en este periodo.</div>
                : <Tabla cols={['Fecha', 'Folio', 'Cliente', 'Vendedor', 'Total', 'Eliminó']} filas={g.anuladas.map((a) => [a.fecha, a.folio, a.cliente, a.vendedor, $(a.total), a.usuario || '—'])} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SQL_METAS = `create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  anio int not null,
  mes int not null check (mes between 1 and 12),
  vendedor text not null default '',
  valor numeric not null default 0,
  creado_en timestamptz default now(),
  unique (anio, mes, vendedor)
);
alter table metas disable row level security;`

function ModalMetas({ anio, vendedores, metas, onClose, onGuardado }) {
  const [quien, setQuien] = useState('')
  const [vals, setVals] = useState(MESES.map(() => ''))
  const [todos, setTodos] = useState('')
  const [clave, setClave] = useState('')
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    setVals(MESES.map((_, i) => { const f = metas.find((x) => x.mes === i + 1 && x.vendedor === quien); return f ? String(Number(f.valor)) : '' }))
  }, [quien, metas])
  const guardar = async () => {
    if (clave !== '1234') return setMsg('Contraseña incorrecta.')
    const filas = vals.map((v, i) => (v === '' ? null : { anio, mes: i + 1, vendedor: quien, valor: Number(v) || 0 })).filter(Boolean)
    if (!filas.length) return setMsg('Escribe al menos una meta.')
    setGuardando(true)
    const r = await supabase.from('metas').upsert(filas, { onConflict: 'anio,mes,vendedor' })
    setGuardando(false)
    if (r.error) return setMsg('No se pudo guardar: ' + r.error.message)
    onGuardado()
  }
  const campo = { padding: 6, borderRadius: 6, border: '1px solid #bbb', width: '100%', boxSizing: 'border-box' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.crema, borderRadius: 16, padding: 20, width: 560, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: sombra }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 10 }}>Fijar metas de ventas {anio}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Meta para</div>
            <select value={quien} onChange={(e) => setQuien(e.target.value)} style={campo}>
              <option value="">General (toda la empresa)</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Mismo valor para todos los meses</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" value={todos} onChange={(e) => setTodos(e.target.value)} style={campo} />
              <button onClick={() => todos !== '' && setVals(MESES.map(() => todos))} style={{ background: C.dorado, border: 'none', borderRadius: 6, fontWeight: 800, padding: '0 12px', cursor: 'pointer' }}>Aplicar</button>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {MESES.map((m, i) => (
            <div key={m}>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{m}</div>
              <input type="number" value={vals[i]} onChange={(e) => setVals(vals.map((x, k) => (k === i ? e.target.value : x)))} style={campo} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Contraseña</div>
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} style={campo} />
          </div>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid #bbb', borderRadius: 8, padding: '9px 16px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 800, cursor: 'pointer' }}>{guardando ? 'Guardando…' : 'Guardar metas'}</button>
        </div>
        {msg && <div style={{ marginTop: 10, fontWeight: 700, color: C.rojo }}>{msg}</div>}
        <div style={{ fontSize: 11, marginTop: 10 }}>Un mes vacío no cambia su meta anterior. Para quitar una meta, escribe 0.</div>
      </div>
    </div>
  )
}

function DashboardMeta({ rows, error, anio, setAnio, mes, setMes, sel, setSel }) {
  const [metas, setMetas] = useState([])
  const [errMeta, setErrMeta] = useState(null)
  const [modal, setModal] = useState(false)
  const cargar = async () => {
    const r = await supabase.from('metas').select('anio,mes,vendedor,valor').eq('anio', anio)
    if (r.error) setErrMeta(r.error.message)
    else { setErrMeta(null); setMetas(r.data || []) }
  }
  useEffect(() => { cargar() }, [anio])
  const vendedores = useMemo(() => [...new Set(rows.map((x) => x.grupo))].sort(), [rows])
  const d = useMemo(() => {
    const r = rows.filter((x) => x.fecha.slice(0, 4) === String(anio) && (!sel || x.grupo === sel))
    const porMes = MESES.map((m, i) => {
      const venta = sum(r.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), 'valor')
      const f = metas.find((x) => x.mes === i + 1 && x.vendedor === (sel || ''))
      const meta = f ? Number(f.valor) || 0 : 0
      return { mes: m, venta, meta, dif: venta - meta, pct: meta > 0 ? (venta / meta) * 100 : null }
    })
    const periodo = mes === null ? porMes : [porMes[mes]]
    const venta = sum(periodo, 'venta'), meta = sum(periodo, 'meta')
    return { porMes, venta, meta, dif: venta - meta, pct: meta > 0 ? (venta / meta) * 100 : null }
  }, [rows, metas, anio, mes, sel])

  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const p1 = (v) => (v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%')
  const colorPct = (p) => (p == null ? '#999' : p >= 100 ? C.verde : p >= 70 ? '#E6A800' : C.rojo)
  const dif = (v) => (v > 0 ? '+' : '') + $(v)
  const caja = { background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }
  if (error) return <div style={{ ...caja, padding: 20 }}>No se pudo leer las ventas: {error}</div>
  const faltaTabla = errMeta && /metas/i.test(errMeta)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, ...caja, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <button onClick={() => setModal(true)} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontWeight: 800, cursor: 'pointer' }}>⚙ Fijar metas</button>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={{ ...seg(mes === i), textAlign: 'center' }}>{m}</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Meta de</div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div onClick={() => setSel(null)} style={seg(sel === null)}>General</div>
            {vendedores.map((v) => <div key={v} onClick={() => setSel(sel === v ? null : v)} style={seg(sel === v)}>{v}</div>)}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        {faltaTabla && (
          <div style={{ ...caja, borderColor: C.rojo }}>
            <b>Falta crear la tabla de metas.</b> Ejecuta esto en el SQL Editor de Supabase y recarga:
            <pre style={{ background: '#fff8', padding: 10, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>{SQL_METAS}</pre>
          </div>
        )}
        {errMeta && !faltaTabla && <div style={{ ...caja, borderColor: C.rojo }}>No se pudieron leer las metas: {errMeta}</div>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Ventas del periodo', $(d.venta), C.azul)}
          {kpi('Meta del periodo', d.meta > 0 ? $(d.meta) : 'Sin meta', '#ED7D31')}
          {kpi('Cumplimiento', p1(d.pct), colorPct(d.pct))}
          {kpi(d.dif >= 0 ? 'Superávit' : 'Faltante', d.meta > 0 ? $(Math.abs(d.dif)) : '—', d.dif >= 0 ? C.verde : C.rojo)}
        </div>
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Ventas vs. meta por mes (toca un mes)">
            <ComposedChart data={d.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
              <Bar dataKey="venta" name="Ventas" fill={C.azul} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                {d.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                <LabelList dataKey="venta" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
              <Line dataKey="meta" name="Meta" stroke="#ED7D31" strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          </Panel>
          <Panel fijo alto={alto} titulo="% de cumplimiento por mes">
            <BarChart data={d.porMes} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => v + '%'} width={48} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={p1} />
              <ReferenceLine y={100} stroke="#333" strokeDasharray="4 4" />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {d.porMes.map((m, i) => <Cell key={i} fill={colorPct(m.pct)} />)}
                <LabelList dataKey="pct" position="top" formatter={(v) => (v == null ? '' : Math.round(v) + '%')} style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Avance de la meta {mes === null ? anio : MESES[mes]}{sel ? ` · ${sel}` : ''}</div>
            <div style={{ height: alto, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 58, fontWeight: 900, color: colorPct(d.pct), lineHeight: 1 }}>{p1(d.pct)}</div>
              <div style={{ background: '#eadfa9', height: 26, borderRadius: 13, overflow: 'hidden' }}>
                <div style={{ width: Math.min(100, d.pct || 0) + '%', height: '100%', background: colorPct(d.pct) }} />
              </div>
              <div style={{ fontWeight: 700 }}>Vendido {$(d.venta)} de {d.meta > 0 ? $(d.meta) : 'una meta sin definir'}</div>
              {d.meta > 0 && <div style={{ fontWeight: 800 }}>{d.dif >= 0 ? `Superaste la meta por ${$(d.dif)}` : `Faltan ${$(-d.dif)} para llegar a la meta`}</div>}
            </div>
          </div>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle mes a mes</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              <Tabla cols={['Mes', 'Meta', 'Ventas', 'Diferencia', 'Cumplimiento']}
                filas={[...d.porMes.map((m) => [m.mes, m.meta > 0 ? $(m.meta) : '—', $(m.venta), m.meta > 0 ? dif(m.dif) : '—', p1(m.pct)]),
                  ['Total', $(sum(d.porMes, 'meta')), $(sum(d.porMes, 'venta')), dif(sum(d.porMes, 'venta') - sum(d.porMes, 'meta')), p1(sum(d.porMes, 'meta') > 0 ? (sum(d.porMes, 'venta') / sum(d.porMes, 'meta')) * 100 : null)]]} />
            </div>
          </div>
        </div>
      </div>
      {modal && <ModalMetas anio={anio} vendedores={vendedores} metas={metas} onClose={() => setModal(false)} onGuardado={() => { setModal(false); cargar() }} />}
    </div>
  )
}

function DashboardProyeccion({ rows, items, error, sel, setSel }) {
  const [metas, setMetas] = useState([])
  const [H, setH] = useState(3)
  useEffect(() => {
    supabase.from('metas').select('anio,mes,vendedor,valor').then((r) => { if (!r.error) setMetas(r.data || []) })
  }, [])
  const vendedores = useMemo(() => [...new Set(rows.map((x) => x.grupo))].sort(), [rows])
  const p = useMemo(() => calcProy(rows, items, metas, sel, H), [rows, items, metas, sel, H])
  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const caja = { background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }
  const dif = (v) => (v > 0 ? '+' : '') + $(v)
  if (error) return <div style={{ ...caja, padding: 20 }}>No se pudo leer las ventas: {error}</div>

  const acciones = []
  if (p.meta > 0) {
    if (p.restan === 0) acciones.push(p.acum >= p.meta ? `El mes cerró cumpliendo la meta (${$(p.acum)}).` : `El mes cerró ${$(p.meta - p.acum)} por debajo de la meta.`)
    else if (p.proy >= p.meta) acciones.push(`Vas en camino: al ritmo actual proyectas superar la meta por ${$(p.brecha)}.`)
    else {
      acciones.push(`Al ritmo actual cerrarías ${$(-p.brecha)} por debajo de la meta.`)
      acciones.push(`Para llegar necesitas vender ${$(p.necesario)} por día durante los ${p.restan} días que quedan${p.ritmo > 0 ? ` (ahora vendes ${$(p.ritmo)} por día, ${Math.round((p.necesario / p.ritmo - 1) * 100)}% más)` : ''}.`)
    }
  } else acciones.push('Fija la meta del mes con el botón "Fijar metas" de Ventas vs. meta para ver la brecha y lo que hay que vender por día.')
  if (p.mejorDia) acciones.push(`Tu mejor día de la semana en ventas es el ${p.mejorDia.toLowerCase()}: conviene reforzar visitas y pedidos ese día.`)
  if (p.pocos) acciones.push('Hay pocas ventas registradas todavía, así que el pronóstico es una guía y mejorará con más historial.')

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, ...caja, display: 'grid', gap: 14, flexShrink: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div>
          <div style={tit}>Pronosticar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {[3, 6, 12].map((n) => <div key={n} onClick={() => setH(n)} style={{ ...seg(H === n), textAlign: 'center' }}>{n} meses</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Vendedor</div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div onClick={() => setSel(null)} style={seg(sel === null)}>Todos</div>
            {vendedores.map((v) => <div key={v} onClick={() => setSel(sel === v ? null : v)} style={seg(sel === v)}>{v}</div>)}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi(`Vendido en ${p.mesActual} (día ${p.dHoy} de ${p.diasMes})`, $(p.acum), C.azul)}
          {kpi('Proyección al cierre', $(p.proy), '#5B9BD5')}
          {kpi('Meta del mes', p.meta > 0 ? $(p.meta) : 'Sin meta', '#ED7D31')}
          {kpi(p.meta <= 0 ? 'Brecha frente a la meta' : p.brecha >= 0 ? 'Superávit proyectado' : 'Faltante proyectado', p.meta > 0 ? $(Math.abs(p.brecha)) : 'Sin meta', p.meta <= 0 ? '#999' : p.brecha >= 0 ? C.verde : C.rojo)}
          {kpi('Ritmo diario', $(p.ritmo), '#7F6000')}
        </div>
        <div style={grid(420)}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Panel fijo alto={alto} titulo="Ventas reales, proyección del mes y pronóstico">
              <ComposedChart data={p.serie} margin={{ top: 18 }}>
                {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
                <Bar dataKey="real" stackId="a" name="Ventas reales" fill={C.azul}><LabelList dataKey="real" position="insideTop" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700, fill: '#fff' }} /></Bar>
                <Bar dataKey="proy" stackId="a" name="Proyectado del mes" fill="#9DC3E6" />
                <Bar dataKey="pron" stackId="a" name="Pronóstico" fill={C.dorado} stroke="#b9a54a"><LabelList dataKey="pron" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} /></Bar>
                <Line dataKey="meta" name="Meta" stroke="#ED7D31" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </Panel>
          </div>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Qué hacer para cerrar el mes</div>
            <div style={{ display: 'grid', gap: 10, fontWeight: 600, lineHeight: 1.4 }}>
              {acciones.map((a, i) => <div key={i} style={{ background: '#fff6', borderLeft: `5px solid ${C.dorado}`, padding: '8px 12px', borderRadius: 8 }}>{a}</div>)}
            </div>
          </div>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Pronóstico mes a mes</div>
            <div style={{ maxHeight: alto, overflow: 'auto' }}>
              <Tabla cols={['Mes', 'Método', 'Pronóstico', 'Meta', 'Brecha']}
                filas={p.futuros.map((f) => [f.mes, f.metodo, $(f.pron), f.meta > 0 ? $(f.meta) : '—', f.meta > 0 ? dif(f.pron - f.meta) : '—'])} />
            </div>
          </div>
          <div style={{ ...caja, gridColumn: '1 / -1' }}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 2 }}>Demanda esperada por producto (para planear producción y compras)</div>
            <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Pronóstico = promedio ponderado de los últimos 3 meses completos (50 % el más reciente, 30 % y 20 %), solo con los meses que ya tienen ventas.</div>
            {p.demanda.length === 0
              ? <div style={{ padding: 16, textAlign: 'center', fontWeight: 700 }}>Aún no hay ventas por producto en los últimos 3 meses.</div>
              : <Tabla cols={['Producto', 'Mes anterior', 'Promedio', 'Pronóstico próximo mes', 'Rango esperado', 'Tendencia']}
                  filas={p.demanda.map((d) => [d.name, num(d.ultimo), num(d.prom), num(d.pron), d.meses < 2 ? '—' : `${num(d.min)} a ${num(d.max)}`, d.tendencia])} />}
          </div>
        </div>
      </div>
    </div>
  )
}

const ESTADOS_INV = { Agotado: C.rojo, 'Bajo mínimo': '#ED7D31', 'Baja salida': '#FFC000', Sobrestock: C.azul, OK: C.verde }
const PUNTO_INV = { Agotado: '🔴', 'Bajo mínimo': '🟠', 'Baja salida': '🟡', Sobrestock: '🔵', OK: '🟢' }

function DashboardInventario({ items, error }) {
  const [prods, setProds] = useState([])
  const [errP, setErrP] = useState(null)
  const [dias, setDias] = useState(30)
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    supabase.from('productos').select('id,nombre,stock_actual,stock_minimo,unidad,activo').eq('tipo_inventario', 'producto_terminado')
      .then((r) => { if (r.error) setErrP(r.error.message); else setProds((r.data || []).filter((p) => p.activo !== false)) })
  }, [])
  const filas = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - dias)
    const corte = d.toISOString().slice(0, 10)
    const rec = items.filter((x) => x.fecha >= corte)
    return prods.map((p) => {
      const vendido = sum(rec.filter((x) => (x.pid ? x.pid === p.id : x.grupo === p.nombre)), 'cant')
      const stock = Number(p.stock_actual) || 0, min = Number(p.stock_minimo) || 0
      const vd = vendido / dias
      const cob = vd > 0 ? stock / vd : null
      const est = stock <= 0 ? 'Agotado' : min > 0 && stock <= min ? 'Bajo mínimo' : vendido === 0 ? 'Baja salida' : cob > 60 ? 'Sobrestock' : 'OK'
      return { nombre: p.nombre, stock, min, vendido, vd, cob, est }
    }).sort((a, b) => b.vendido - a.vendido)
  }, [prods, items, dias])

  const alto = Math.max(230, Math.floor((window.innerHeight - 330) / 2))
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const caja = { background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }
  if (error || errP) return <div style={{ ...caja, padding: 20 }}>No se pudo leer los datos: {error || errP}</div>

  const cuenta = (e) => filas.filter((f) => f.est === e).length
  const dona = Object.keys(ESTADOS_INV).map((e) => ({ name: e, value: cuenta(e) })).filter((x) => x.value > 0)
  const vis = estado ? filas.filter((f) => f.est === estado) : filas
  const conCob = filas.filter((f) => f.cob !== null)
  const cobProm = conCob.length ? conCob.reduce((a, f) => a + f.cob, 0) / conCob.length : null
  const porAgotar = [...vis].filter((f) => f.cob !== null).sort((a, b) => a.cob - b.cob).slice(0, 10).map((f) => ({ name: f.nombre, value: Math.round(f.cob) }))
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 200, ...caja, display: 'grid', gap: 14, flexShrink: 0 }}>
        <div>
          <div style={tit}>Ventas de los últimos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {[30, 60, 90].map((n) => <div key={n} onClick={() => setDias(n)} style={{ ...seg(dias === n), textAlign: 'center' }}>{n} días</div>)}
          </div>
        </div>
        <div>
          <div style={tit}>Estado</div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div onClick={() => setEstado(null)} style={seg(estado === null)}>Todos</div>
            {Object.keys(ESTADOS_INV).map((e) => <div key={e} onClick={() => setEstado(estado === e ? null : e)} style={seg(estado === e)}>{PUNTO_INV[e]} {e} ({cuenta(e)})</div>)}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {kpi('Productos agotados', num(cuenta('Agotado')), C.rojo)}
          {kpi('Bajo el mínimo', num(cuenta('Bajo mínimo')), '#ED7D31')}
          {kpi('Baja salida (sin ventas)', num(cuenta('Baja salida')), '#E6A800')}
          {kpi('Cobertura promedio', cobProm === null ? '—' : `${Math.round(cobProm)} días`, C.azul)}
        </div>
        {filas.length === 0 && <div style={{ ...caja, fontWeight: 700 }}>No hay productos terminados activos para analizar.</div>}
        <div style={grid(420)}>
          <Panel fijo alto={alto} titulo="Estado del inventario (toca una porción)">
            <PieChart>
              <Pie data={dona} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3} cursor="pointer"
                onClick={(d) => setEstado(estado === (d.name ?? d.payload?.name) ? null : (d.name ?? d.payload?.name))}
                label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                {dona.map((x, i) => <Cell key={i} fill={ESTADOS_INV[x.name]} fillOpacity={atenuar(estado, x.name)} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </Panel>
          <Panel fijo alto={alto} titulo={`Existencias vs. vendido en ${dias} días`}>
            <BarChart data={vis.slice(0, 10)} margin={{ top: 18 }}>
              {rejilla}<XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} />{ejeY}<Tooltip formatter={(v) => num(v)} /><Legend />
              <Bar dataKey="stock" name="Existencias" fill={C.azul} radius={[4, 4, 0, 0]}><LabelList dataKey="stock" position="top" formatter={(v) => (v ? num(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} /></Bar>
              <Bar dataKey="vendido" name="Vendido" fill="#ED7D31" radius={[4, 4, 0, 0]}><LabelList dataKey="vendido" position="top" formatter={(v) => (v ? num(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} /></Bar>
            </BarChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Cobertura: días que alcanza lo que hay (los que se agotan primero)">
            <BarChart data={porAgotar} layout="vertical" margin={{ right: 56 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => v + ' días'} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {porAgotar.map((x, i) => <Cell key={i} fill={x.value < 7 ? C.rojo : x.value < 15 ? '#E6A800' : C.verde} />)}
                <LabelList dataKey="value" position="right" formatter={(v) => v + ' d'} style={{ fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </Panel>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Detalle por producto</div>
            <div style={{ height: alto, overflow: 'auto' }}>
              <Tabla cols={['Producto', 'Existencias', 'Mínimo', `Vendido ${dias} d`, 'Cobertura', 'Estado']}
                filas={vis.map((f) => [f.nombre, num(f.stock), f.min > 0 ? num(f.min) : '—', num(f.vendido), f.cob === null ? '—' : `${Math.round(f.cob)} d`, `${PUNTO_INV[f.est]} ${f.est}`])} />
            </div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Las ventas perdidas por falta de stock no se pueden medir porque el sistema no registra lo que no se vendió.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardFinalVentas({ rows, items, descRows, error, anio, setAnio, mes, setMes }) {
  const [metas, setMetas] = useState([])
  const [prods, setProds] = useState([])
  const [fVend, setFVend] = useState(null)
  const [fCli, setFCli] = useState(null)
  useEffect(() => {
    supabase.from('metas').select('anio,mes,vendedor,valor').eq('anio', anio).then((r) => { if (!r.error) setMetas(r.data || []) })
  }, [anio])
  useEffect(() => {
    supabase.from('productos').select('nombre,stock_actual,stock_minimo,activo').eq('tipo_inventario', 'producto_terminado')
      .then((r) => { if (!r.error) setProds((r.data || []).filter((p) => p.activo !== false)) })
  }, [])
  const d = useMemo(() => {
    const enY = (x, y) => x.fecha.slice(0, 4) === String(y)
    const enM = (x) => mes === null || Number(x.fecha.slice(5, 7)) - 1 === mes
    const okV = (x, k) => !fVend || x[k] === fVend
    const okC = (x, k) => !fCli || x[k] === fCli
    const mDe = (x) => Number(x.fecha.slice(5, 7))
    const base = rows.filter((x) => enY(x, anio))
    const baseM = base.filter(enM)
    const en = baseM.filter((x) => okV(x, 'grupo') && okC(x, 'cliente'))
    const anioFiltrado = base.filter((x) => okV(x, 'grupo') && okC(x, 'cliente'))
    const prev = rows.filter((x) => enY(x, anio - 1) && okV(x, 'grupo') && okC(x, 'cliente'))
    const total = sum(en, 'valor'), totPrev = sum(prev.filter(enM), 'valor')
    const metaDe = (i) => { if (fCli) return 0; const f = metas.find((x) => x.mes === i + 1 && x.vendedor === (fVend || '')); return f ? Number(f.valor) || 0 : 0 }
    const porMes = MESES.map((m, i) => ({ mes: m, venta: sum(anioFiltrado.filter((x) => mDe(x) === i + 1), 'valor'), meta: metaDe(i) }))
    const ultimo = porMes.reduce((u, m, i) => (m.venta > 0 ? i : u), -1)
    let a1 = 0, a0 = 0
    porMes.forEach((m, i) => { a1 += m.venta; a0 += sum(prev.filter((x) => mDe(x) === i + 1), 'valor'); m.acum = i <= ultimo ? a1 : null; m.acumPrev = a0 })
    const meta = mes === null ? sum(porMes, 'meta') : porMes[mes].meta
    const agrupa = (arr, key, val) => {
      const g = {}
      arr.forEach((x) => { g[x[key]] = (g[x[key]] || 0) + x[val] })
      return Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }
    const it = items.filter((x) => enY(x, anio) && enM(x) && okV(x, 'vend') && okC(x, 'cli'))
    const ds = descRows.filter((x) => !x.anulada && enY(x, anio) && enM(x) && okV(x, 'vendedor') && okC(x, 'cliente'))
    return {
      porMes, total, meta, n: en.length,
      crec: totPrev > 0 ? ((total - totPrev) / totPrev) * 100 : null,
      cumpl: meta > 0 ? (total / meta) * 100 : null,
      ticket: en.length ? total / en.length : 0,
      clientes: new Set(en.map((x) => x.cliente)).size,
      descPct: sum(ds, 'subtotal') > 0 ? (sum(ds, 'descuento') / sum(ds, 'subtotal')) * 100 : null,
      margen: margenTxt(sum(it, 'costo'), sum(it, 'valor')),
      productos: agrupa(it, 'grupo', 'valor').slice(0, 5),
      topClientes: agrupa(baseM.filter((x) => okV(x, 'grupo')), 'cliente', 'valor').slice(0, 5),
      vendedores: agrupa(baseM.filter((x) => okC(x, 'cliente')), 'grupo', 'valor').slice(0, 8),
    }
  }, [rows, items, descRows, metas, anio, mes, fVend, fCli])

  const alto = Math.max(220, Math.floor((window.innerHeight - 350) / 2))
  const ancho = window.innerWidth >= 1250
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'center', background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const p1 = (v) => (v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%')
  const colorPct = (p) => (p == null ? '#999' : p >= 100 ? C.verde : p >= 70 ? '#E6A800' : C.rojo)
  const kpi = (label, value, color, sub, subColor) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: subColor || '#6b6652', minHeight: 15 }}>{sub || ''}</div>
    </div>
  )
  const caja = { background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }
  const bloque = { borderTop: '1px solid #E3D79A', paddingTop: 10 }
  if (error) return <div style={{ ...caja, padding: 20 }}>No se pudo leer las ventas: {error}</div>

  const hayFiltro = mes !== null || fVend || fCli
  const agotados = prods.filter((p) => (Number(p.stock_actual) || 0) <= 0)
  const bajos = prods.filter((p) => { const st = Number(p.stock_actual) || 0, mn = Number(p.stock_minimo) || 0; return st > 0 && mn > 0 && st <= mn })
  const quitar = (d) => d.name ?? d.payload?.name
  const ranking = (data, color, sel, onPick) => (
    <BarChart data={data} layout="vertical" margin={{ right: 56 }}>
      <XAxis type="number" hide />
      <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
      <Tooltip formatter={$} />
      <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} cursor={onPick ? 'pointer' : 'default'} onClick={onPick ? (e) => onPick(quitar(e)) : undefined}>
        {data.map((x, i) => <Cell key={i} fillOpacity={onPick ? atenuar(sel, x.name) : 1} />)}
        <LabelList dataKey="value" position="right" formatter={compacto} style={{ fontSize: 11, fontWeight: 700 }} />
      </Bar>
    </BarChart>
  )
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 235, ...caja, display: 'grid', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={seg(mes === i)}>{m}</div>)}
          </div>
        </div>
        {hayFiltro && <button onClick={() => { setMes(null); setFVend(null); setFCli(null) }} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 800, cursor: 'pointer' }}>Borrar filtros</button>}

        <div style={bloque}>
          <div style={tit}>Resumen del periodo</div>
          <div style={{ display: 'grid', gap: 3, fontSize: 13 }}>
            {[['Ventas', $(d.total)], ['Meta', d.meta > 0 ? $(d.meta) : 'Sin meta'], [d.total >= d.meta ? 'Superávit' : 'Faltante', d.meta > 0 ? $(Math.abs(d.total - d.meta)) : '—'], ['Facturas', num(d.n)]].map(([a, b]) => (
              <div key={a} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{a}</span><b>{b}</b></div>
            ))}
          </div>
          <div style={{ background: '#eadfa9', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: Math.min(100, d.cumpl || 0) + '%', height: '100%', background: colorPct(d.cumpl) }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: colorPct(d.cumpl), marginTop: 2 }}>{d.cumpl == null ? 'Fija la meta para ver el avance' : `${p1(d.cumpl)} de la meta`}</div>
        </div>

        <div style={bloque}>
          <div style={tit}>Vendedores (toca uno)</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {d.vendedores.slice(0, 5).map((v) => (
              <div key={v.name} onClick={() => setFVend(fVend === v.name ? null : v.name)} style={{ ...seg(fVend === v.name), textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{v.name}</span><span>{compacto(v.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={bloque}>
          <div style={tit}>Alertas de inventario</div>
          {agotados.length + bajos.length === 0
            ? <div style={{ fontSize: 13, fontWeight: 700, color: C.verde }}>Sin alertas</div>
            : <div style={{ display: 'grid', gap: 3, fontSize: 12.5, fontWeight: 700 }}>
                {agotados.slice(0, 3).map((p) => <div key={p.nombre}>🔴 {p.nombre}: agotado</div>)}
                {bajos.slice(0, 3).map((p) => <div key={p.nombre}>🟠 {p.nombre}: bajo el mínimo</div>)}
              </div>}
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kpi('Ventas', $(d.total), C.azul, d.crec == null ? `Sin datos de ${anio - 1}` : `${d.crec >= 0 ? '▲' : '▼'} ${p1(Math.abs(d.crec))} vs ${anio - 1}`, d.crec == null ? null : d.crec >= 0 ? '#0a7a3d' : C.rojo)}
          {kpi('Cumplimiento de meta', p1(d.cumpl), colorPct(d.cumpl), d.meta > 0 ? `Meta ${compacto(d.meta)}` : 'Sin meta definida')}
          {kpi('Ticket promedio', $(d.ticket), '#ED7D31', `${num(d.n)} ventas`)}
          {kpi('Clientes activos', num(d.clientes), '#7F6000', 'que compraron en el periodo')}
          {kpi('Descuento sobre ventas', p1(d.descPct), '#5B9BD5', 'del valor bruto facturado')}
          {kpi('Margen bruto', d.margen, '#70AD47', 'sobre costo de producto')}
        </div>
        {hayFiltro && <div style={{ fontSize: 12, fontWeight: 700 }}>Filtrando por: {mes !== null && MESES[mes]} {fVend && `· ${fVend}`} {fCli && `· ${fCli}`} (toca de nuevo para quitar)</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
          <div style={{ gridColumn: ancho ? 'span 2' : 'auto' }}>
            <Panel fijo alto={alto} titulo="Ventas vs. meta (toca un mes)">
              <ComposedChart data={d.porMes} margin={{ top: 18 }}>
                {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
                <Bar dataKey="venta" name="Ventas" fill={C.azul} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_, i) => setMes(mes === i ? null : i)}>
                  {d.porMes.map((_, i) => <Cell key={i} fillOpacity={atenuar(mes, i)} />)}
                  <LabelList dataKey="venta" position="top" formatter={(v) => (v ? compacto(v) : '')} style={{ fontSize: 10, fontWeight: 700 }} />
                </Bar>
                <Line dataKey="meta" name="Meta" stroke="#ED7D31" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </Panel>
          </div>
          <Panel fijo alto={alto} titulo="Ventas por vendedor (toca una porción)">
            <PieChart>
              <Pie data={d.vendedores} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={3} cursor="pointer"
                onClick={(e) => setFVend(fVend === quitar(e) ? null : quitar(e))}
                label={({ name, percent }) => (percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
                {d.vendedores.map((v, i) => <Cell key={i} fill={PIE[i % PIE.length]} fillOpacity={atenuar(fVend, v.name)} />)}
              </Pie>
              <Tooltip formatter={$} />
            </PieChart>
          </Panel>
          <Panel fijo alto={alto} titulo={`Acumulado del año vs ${anio - 1}`}>
            <LineChart data={d.porMes} margin={{ top: 18, right: 14 }}>
              {rejilla}<XAxis dataKey="mes" tick={{ fontSize: 11 }} />{ejeY}<Tooltip formatter={$} /><Legend />
              <Line dataKey="acum" name={String(anio)} stroke={C.azul} strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="acumPrev" name={String(anio - 1)} stroke="#ED7D31" strokeWidth={2.5} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </Panel>
          <Panel fijo alto={alto} titulo="Productos más vendidos">{ranking(d.productos, C.azul, null, null)}</Panel>
          <Panel fijo alto={alto} titulo="Mejores clientes (toca uno)">{ranking(d.topClientes, '#70AD47', fCli, (n) => setFCli(fCli === n ? null : n))}</Panel>
        </div>
      </div>
    </div>
  )
}

const claveNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const nombreGeo = (f, claves) => {
  const p = f.properties || {}
  for (const k of claves) if (p[k]) return String(p[k])
  const k2 = Object.keys(p).find((k) => typeof p[k] === 'string' && p[k])
  return k2 ? p[k2] : ''
}
const CLAVES_DEP = ['DPTO_CNMBR', 'dpto_cnmbr', 'NOMBRE_DPT', 'NOMBRE_DEPARTAMENTO', 'NAME_1', 'name', 'NOMBRE']
const CLAVES_MUN = ['MPIO_CNMBR', 'mpio_cnmbr', 'MPIO_NOMBRE', 'NOMBRE_MPIO', 'NAME_2', 'name', 'NOMBRE']
const CLAVES_BAR = ['NOMBRE_BARRIO', 'NOMBRE', 'nombre', 'NOMBRE_BARRIO_VEREDA', 'name']
const CAPITALES = {
  Amazonas: [-4.2153, -69.9406], Antioquia: [6.2442, -75.5812], Arauca: [7.0847, -70.7591], Atlántico: [10.9685, -74.7813],
  'Bogotá D.C.': [4.711, -74.0721], Bolívar: [10.391, -75.4794], Boyacá: [5.5353, -73.3678], Caldas: [5.0703, -75.5138],
  Caquetá: [1.6144, -75.6062], Casanare: [5.3378, -72.3959], Cauca: [2.4448, -76.6147], Cesar: [10.4631, -73.2532],
  Chocó: [5.6919, -76.6583], Córdoba: [8.7479, -75.8814], Cundinamarca: [5.0, -74.1], Guainía: [3.8653, -67.9239],
  Guaviare: [2.5729, -72.6459], Huila: [2.9273, -75.2819], 'La Guajira': [11.5444, -72.9072], Magdalena: [11.2408, -74.199],
  Meta: [4.142, -73.6266], Nariño: [1.2136, -77.2811], 'Norte de Santander': [7.8939, -72.5078], Putumayo: [1.1491, -76.6477],
  Quindío: [4.5339, -75.6811], Risaralda: [4.8133, -75.6961], 'San Andrés y Providencia': [12.5847, -81.7006],
  Santander: [7.1254, -73.1198], Sucre: [9.3047, -75.3978], Tolima: [4.4389, -75.2322], 'Valle del Cauca': [3.4516, -76.532],
  Vaupés: [1.2536, -70.2341], Vichada: [6.1892, -67.4859],
}

// ¿Está el punto dentro del polígono (o multipolígono)? Así cada cliente cae en su barrio sin escribirlo.
function puntoEnGeo(pt, geom) {
  if (!geom) return false
  const enAnillo = (anillo) => {
    let c = false
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
      if (yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const poligono = (coords) => enAnillo(coords[0]) && !coords.slice(1).some(enAnillo)
  if (geom.type === 'Polygon') return poligono(geom.coordinates)
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(poligono)
  return false
}

// Los clientes ubicados solo por municipio comparten el mismo punto: se separan un poco para que no se tapen entre sí
const desplazo = (txt) => {
  let h = 0
  for (const ch of String(txt)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.03
}

function useGeo(url) {
  const [g, setG] = useState(null)
  useEffect(() => {
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => setG(j && j.features ? j : null)).catch(() => setG(null))
  }, [url])
  return g
}

const SQL_METAS_UBI = `create table if not exists metas_ubicacion (
  id uuid primary key default gen_random_uuid(),
  anio int not null,
  nivel text not null check (nivel in ('departamento','municipio','barrio')),
  clave text not null,
  valor_mensual numeric not null default 0,
  unique (anio, nivel, clave)
);
alter table metas_ubicacion disable row level security;`

function ModalMetasUbi({ anio, opciones, metas, onClose, onGuardado }) {
  const niveles = [['departamento', 'Departamento'], ['municipio', 'Municipio'], ['barrio', 'Barrio de Medellín']]
  const [niv, setNiv] = useState('departamento')
  const [vals, setVals] = useState({})
  const [clave, setClave] = useState('')
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    const o = {}
    ;(opciones[niv] || []).forEach((n) => { const f = metas.find((m) => m.nivel === niv && claveNorm(m.clave) === claveNorm(n)); o[n] = f ? String(Number(f.valor_mensual)) : '' })
    setVals(o)
  }, [niv, metas])
  const guardar = async () => {
    if (clave !== '1234') return setMsg('Contraseña incorrecta.')
    const filas = Object.entries(vals).filter(([, v]) => v !== '').map(([n, v]) => ({ anio, nivel: niv, clave: n, valor_mensual: Number(v) || 0 }))
    if (!filas.length) return setMsg('Escribe al menos una meta.')
    setGuardando(true)
    const r = await supabase.from('metas_ubicacion').upsert(filas, { onConflict: 'anio,nivel,clave' })
    setGuardando(false)
    if (r.error) return setMsg('No se pudo guardar: ' + r.error.message)
    onGuardado()
  }
  const campo = { padding: 6, borderRadius: 6, border: '1px solid #bbb', width: '100%', boxSizing: 'border-box' }
  const lista = opciones[niv] || []
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.crema, borderRadius: 16, padding: 20, width: 520, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: sombra }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>Metas por ubicación {anio}</div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>Escribe la meta de ventas <b>por mes</b> de cada zona. Al ver un año completo, el reporte la multiplica por los meses transcurridos.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {niveles.map(([k, n]) => <button key={k} onClick={() => setNiv(k)} style={{ border: 'none', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', fontWeight: 800, background: niv === k ? C.marca : C.dorado, color: niv === k ? '#fff' : C.texto }}>{n}</button>)}
        </div>
        {lista.length === 0
          ? <div style={{ fontWeight: 700, padding: 10 }}>{niv === 'barrio' ? 'Los barrios aparecen cuando existe el archivo medellin-barrios.geojson.' : 'Aún no hay clientes con esta ubicación.'}</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {lista.map((n) => (
                <div key={n}>
                  <div style={{ fontWeight: 800, fontSize: 12 }}>{n}</div>
                  <input type="number" value={vals[n] ?? ''} onChange={(e) => setVals({ ...vals, [n]: e.target.value })} style={campo} />
                </div>
              ))}
            </div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Contraseña</div>
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} style={campo} />
          </div>
          <button onClick={onClose} style={{ background: C.crema, border: '1px solid #bbb', borderRadius: 8, padding: '9px 16px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 800, cursor: 'pointer' }}>{guardando ? 'Guardando…' : 'Guardar metas'}</button>
        </div>
        {msg && <div style={{ marginTop: 10, fontWeight: 700, color: C.rojo }}>{msg}</div>}
        <div style={{ fontSize: 11, marginTop: 10 }}>Un campo vacío no cambia la meta anterior. Para quitar una meta, escribe 0.</div>
      </div>
    </div>
  )
}

function DashboardUbicacion({ rows, error, anio, setAnio, mes, setMes }) {
  const [clientes, setClientes] = useState([])
  const [metasU, setMetasU] = useState([])
  const [errMeta, setErrMeta] = useState(null)
  const [nivel, setNivel] = useState('colombia')
  const [modal, setModal] = useState(false)
  const gDep = useGeo('/geo/colombia-departamentos.geojson')
  const gMun = useGeo('/geo/antioquia-municipios.geojson')
  const gBar = useGeo('/geo/medellin-barrios.geojson')
  useEffect(() => {
    supabase.from('clientes').select('id,empresa,departamento,municipio,latitud,longitud,ubicacion_precision').then((r) => { if (!r.error) setClientes(r.data || []) })
  }, [])
  const cargarMetas = async () => {
    const r = await supabase.from('metas_ubicacion').select('nivel,clave,valor_mensual').eq('anio', anio)
    if (r.error) setErrMeta(r.error.message)
    else { setErrMeta(null); setMetasU(r.data || []) }
  }
  useEffect(() => { cargarMetas() }, [anio])

  const d = useMemo(() => {
    const hoy = new Date()
    const enY = (x, y) => x.fecha.slice(0, 4) === String(y)
    const enM = (x) => mes === null || Number(x.fecha.slice(5, 7)) - 1 === mes
    const porCli = {}
    const sumar = (x, k) => { const o = porCli[x.cid] || (porCli[x.cid] = { venta: 0, prev: 0 }); o[k] += x.valor }
    rows.filter((x) => x.cid && enY(x, anio) && enM(x)).forEach((x) => sumar(x, 'venta'))
    rows.filter((x) => x.cid && enY(x, anio - 1) && enM(x)).forEach((x) => sumar(x, 'prev'))
    const meses = mes === null ? (anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12) : 1
    const metaDe = (niv, nombre) => { const f = metasU.find((m) => m.nivel === niv && claveNorm(m.clave) === claveNorm(nombre)); return f ? (Number(f.valor_mensual) || 0) * meses : 0 }
    const finaliza = (niv, o) => {
      const meta = metaDe(niv, o.name)
      return { ...o, meta, crec: o.prev > 0 ? ((o.venta - o.prev) / o.prev) * 100 : null, cumpl: meta > 0 ? (o.venta / meta) * 100 : null }
    }
    const agrupa = (niv, keyFn, filtro = () => true) => {
      const g = {}
      clientes.forEach((c) => {
        const pc = porCli[c.id]
        if (!pc || !filtro(c)) return
        const k = keyFn(c)
        if (!k) return
        const o = g[k] || (g[k] = { name: k, venta: 0, prev: 0, sLat: 0, sLng: 0, np: 0 })
        o.venta += pc.venta; o.prev += pc.prev
        if (c.latitud != null && c.longitud != null) { o.sLat += Number(c.latitud); o.sLng += Number(c.longitud); o.np += 1 }
      })
      return Object.values(g).map((o) => finaliza(niv, { ...o, lat: o.np ? o.sLat / o.np : null, lng: o.np ? o.sLng / o.np : null })).sort((a, b) => b.venta - a.venta)
    }
    const esMed = (c) => claveNorm(c.municipio) === 'MEDELLIN'
    const barrioDe = (c) => {
      if (!gBar || c.latitud == null || !['direccion', 'esquina', 'barrio', 'manual'].includes(c.ubicacion_precision)) return null
      const pt = { lat: Number(c.latitud), lng: Number(c.longitud) }
      const f = gBar.features.find((ft) => puntoEnGeo(pt, ft.geometry))
      return f ? nombreGeo(f, CLAVES_BAR) : null
    }
    const deptos = agrupa('departamento', (c) => c.departamento).map((o) => (CAPITALES[o.name] ? { ...o, lat: CAPITALES[o.name][0], lng: CAPITALES[o.name][1] } : o))
    const munis = agrupa('municipio', (c) => c.municipio, (c) => c.departamento === 'Antioquia')
    const barrios = gBar ? agrupa('barrio', barrioDe, esMed) : []
    const porCliente = clientes.filter((c) => porCli[c.id] && c.latitud != null && c.longitud != null).map((c) => {
      const pc = porCli[c.id]
      return { name: c.empresa, venta: pc.venta, prev: pc.prev, crec: pc.prev > 0 ? ((pc.venta - pc.prev) / pc.prev) * 100 : null, cumpl: null, meta: 0, lat: Number(c.latitud) + (c.ubicacion_precision === 'municipio' ? desplazo(c.id + 'a') : 0), lng: Number(c.longitud) + (c.ubicacion_precision === 'municipio' ? desplazo(c.id + 'b') : 0), med: esMed(c) }
    }).sort((a, b) => b.venta - a.venta)
    const sinUbicar = clientes.filter((c) => porCli[c.id] && !c.departamento)
    const ventasSin = sinUbicar.reduce((a, c) => a + porCli[c.id].venta, 0)
    const total = clientes.filter((c) => porCli[c.id] && c.departamento).reduce((a, c) => a + porCli[c.id].venta, 0)
    const totPrev = clientes.filter((c) => porCli[c.id] && c.departamento).reduce((a, c) => a + porCli[c.id].prev, 0)
    return { deptos, munis, barrios, porCliente, sinUbicar: sinUbicar.length, ventasSin, total, totPrev }
  }, [rows, clientes, metasU, gBar, anio, mes])

  // lo que se muestra según la pestaña
  const vista = {
    colombia: { lista: d.deptos, geo: gDep, claves: CLAVES_DEP, titulo: 'Departamentos' },
    antioquia: { lista: d.munis, geo: gMun, claves: CLAVES_MUN, titulo: 'Municipios de Antioquia' },
    medellin: d.barrios.length
      ? { lista: d.barrios, geo: gBar, claves: CLAVES_BAR, titulo: 'Barrios de Medellín' }
      : { lista: d.porCliente.filter((c) => c.med), geo: null, claves: CLAVES_BAR, titulo: 'Clientes en Medellín' },
    combinado: { lista: d.porCliente, geo: gMun, claves: CLAVES_MUN, titulo: 'Clientes' },
  }[nivel]
  const maxV = Math.max(1, ...vista.lista.map((o) => o.venta))
  const colorPct = (p) => (p == null ? '#999' : p >= 100 ? C.verde : p >= 70 ? '#E6A800' : C.rojo)
  const colorDe = (o) => (o.meta > 0 ? colorPct(o.cumpl) : o.crec == null ? C.azul : o.crec >= 0 ? C.verde : C.rojo)
  const p1 = (v) => (v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%')
  const tipDe = (o) => [`Ventas: ${$(o.venta)}`, `Crecimiento: ${o.crec == null ? 'sin datos del año anterior' : pct(o.crec)}`, ...(o.meta > 0 ? [`Meta: ${$(o.meta)} (${p1(o.cumpl)})`] : [])]
  const puntos = vista.lista.filter((o) => o.lat != null).map((o) => ({ name: o.name, lat: o.lat, lng: o.lng, color: colorDe(o), radio: 6 + 26 * Math.sqrt(o.venta / maxV), tip: tipDe(o) }))
  const valores = {}
  vista.lista.forEach((o) => { valores[claveNorm(o.name)] = { t: o.venta / maxV, tip: tipDe(o) } })

  const opciones = {
    departamento: [...new Set(clientes.map((c) => c.departamento).filter(Boolean))].sort(),
    municipio: [...new Set(clientes.filter((c) => c.departamento === 'Antioquia').map((c) => c.municipio).filter(Boolean))].sort(),
    barrio: gBar ? [...new Set(gBar.features.map((f) => nombreGeo(f, CLAVES_BAR)).filter(Boolean))].sort() : [],
  }

  const alto = Math.max(380, window.innerHeight - 330)
  const tit = { fontWeight: 900, fontSize: 13, marginBottom: 6 }
  const seg = (on) => ({ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'center', background: on ? C.dorado : '#f4f1e6', outline: on ? `2px solid ${C.marca}` : 'none' })
  const kpi = (label, value, color) => (
    <div style={{ background: C.crema, border: '1px solid #E3D79A', borderRadius: 10, boxShadow: sombra, padding: '10px 14px', borderLeft: `6px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6652' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  )
  const caja = { background: C.crema, border: '1px solid #E3D79A', borderRadius: 16, boxShadow: sombra, padding: '14px 12px' }
  if (error) return <div style={{ ...caja, padding: 20 }}>No se pudo leer las ventas: {error}</div>
  const crecTotal = d.totPrev > 0 ? ((d.total - d.totPrev) / d.totPrev) * 100 : null
  const faltaTabla = errMeta && /metas_ubicacion/i.test(errMeta)
  const sinClientes = clientes.length === 0 || (d.deptos.length === 0 && d.porCliente.length === 0)

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <aside style={{ width: 215, ...caja, display: 'grid', gap: 14, flexShrink: 0 }}>
        <button onClick={() => setModal(true)} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontWeight: 800, cursor: 'pointer' }}>⚙ Fijar metas por zona</button>
        <div>
          <div style={tit}>Año</div>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
        </div>
        <div>
          <div style={tit}>Mes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MESES.map((m, i) => <div key={m} onClick={() => setMes(mes === i ? null : i)} style={seg(mes === i)}>{m}</div>)}
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <b>Cómo leer el mapa</b><br />
          Tamaño del círculo = ventas.<br />
          <span style={{ color: C.verde, fontWeight: 800 }}>●</span> cumple la meta o crece<br />
          <span style={{ color: '#E6A800', fontWeight: 800 }}>●</span> entre 70 % y 100 % de la meta<br />
          <span style={{ color: C.rojo, fontWeight: 800 }}>●</span> bajo la meta o decrece<br />
          <span style={{ color: C.azul, fontWeight: 800 }}>●</span> sin dato del año anterior
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
        {faltaTabla && (
          <div style={{ ...caja, borderColor: C.rojo }}>
            <b>Falta crear la tabla de metas por ubicación.</b> Ejecuta esto en Supabase y recarga:
            <pre style={{ background: '#fff8', padding: 10, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>{SQL_METAS_UBI}</pre>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kpi('Ventas ubicadas', $(d.total), C.azul)}
          {kpi(`Crecimiento vs ${anio - 1}`, pct(crecTotal), crecTotal == null || crecTotal >= 0 ? C.verde : C.rojo)}
          {kpi(vista.titulo, num(vista.lista.length), '#ED7D31')}
          {kpi('Ventas sin ubicar', d.sinUbicar ? `${compacto(d.ventasSin)} · ${d.sinUbicar} cliente${d.sinUbicar === 1 ? '' : 's'}` : 'Todas ubicadas', d.sinUbicar ? '#E6A800' : C.verde)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['colombia', 'Colombia'], ['antioquia', 'Antioquia'], ['medellin', 'Medellín'], ['combinado', 'Combinado con clientes']].map(([k, n]) => (
            <button key={k} onClick={() => setNivel(k)} style={{ border: 'none', borderRadius: 12, padding: '6px 16px', cursor: 'pointer', fontWeight: 800, background: nivel === k ? C.marca : C.dorado, color: nivel === k ? '#fff' : C.texto }}>{n}</button>
          ))}
        </div>
        {sinClientes && <div style={{ ...caja, fontWeight: 700 }}>Todavía no hay ventas de clientes con ubicación. Completa el departamento y el municipio de tus clientes (módulo Clientes) y el mapa se llenará solo.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
          <div style={{ gridColumn: 'span 2', ...caja, padding: 8, height: alto, minWidth: 0 }}>
            <Suspense fallback={<div style={{ padding: 20, fontWeight: 700 }}>Cargando mapa…</div>}>
              <MapaVentas nivel={nivel} puntos={puntos} geo={vista.geo} claves={vista.claves} valores={valores} />
            </Suspense>
          </div>
          <div style={caja}>
            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{vista.titulo}</div>
            <div style={{ height: alto - 40, overflow: 'auto' }}>
              <Tabla cols={['Zona', 'Ventas', 'Crec.', 'Meta']}
                filas={[...vista.lista.slice(0, 40).map((o) => [o.name, $(o.venta), pct(o.crec), o.meta > 0 ? p1(o.cumpl) : '—']),
                  ['Total', $(vista.lista.reduce((a, o) => a + o.venta, 0)), '', '']]} />
            </div>
            {nivel === 'medellin' && !gBar && <div style={{ fontSize: 11, marginTop: 6 }}>Para ver los barrios pintados falta el archivo <b>medellin-barrios.geojson</b> en la carpeta public/geo.</div>}
            {nivel === 'colombia' && !gDep && <div style={{ fontSize: 11, marginTop: 6 }}>Los departamentos se pintan al agregar <b>colombia-departamentos.geojson</b> en public/geo; mientras tanto se ven los círculos.</div>}
            {nivel === 'antioquia' && !gMun && <div style={{ fontSize: 11, marginTop: 6 }}>Los municipios se pintan al agregar <b>antioquia-municipios.geojson</b> en public/geo.</div>}
          </div>
        </div>
      </div>
      {modal && <ModalMetasUbi anio={anio} opciones={opciones} metas={metasU} onClose={() => setModal(false)} onGuardado={() => { setModal(false); cargarMetas() }} />}
    </div>
  )
}

/* ---------- tarjetas del inicio ---------- */
function MiniModulo({ m, fin, gen, datos, onClick }) {
  const f = m.fuente ? FUENTES[m.fuente] : null
  const g = m.fuente ? gen[m.fuente] : null
  return (
    <div onClick={onClick} style={{ background: C.tarjeta, borderRadius: 16, boxShadow: sombra, cursor: 'pointer', overflow: 'hidden' }}>
      <div style={{ background: C.dorado, padding: '7px 14px', fontWeight: 900, fontSize: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>{m.nombre}</span><span style={{ fontSize: 12 }}>Ver reporte ›</span>
      </div>
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{f ? fmtF(f)(g.total) : $(fin.saldo)}</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{f ? f.valorNombre : 'Flujo del año'}</div>
        {m.fuente && datos.fuentes[m.fuente]?.error && <div style={{ fontSize: 11, color: C.rojo }}>Revisa columnas de {f.tabla}</div>}
        <Panel mini alto={130}>
          {f ? (
            <BarChart data={g.porMes}><XAxis dataKey="mes" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Bar dataKey="valor" fill={C.azul} radius={[3, 3, 0, 0]} /></BarChart>
          ) : (
            <BarChart data={fin.porMes}><XAxis dataKey="mes" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Bar dataKey="Ingresos" fill={C.verde} radius={[3, 3, 0, 0]} /><Bar dataKey="Egresos" fill={C.rojo} radius={[3, 3, 0, 0]} /></BarChart>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ---------- módulo principal ---------- */
export default function ReportesHome({ onSalir }) {
  const datos = useDatos()
  const hoy = new Date()
  const [nav, setNav] = useState({ mod: null, vista: null })
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(null)
  const [cat, setCat] = useState(null)
  const movil = window.matchMedia('(pointer: coarse)').matches

  const mod = MODULOS.find((m) => m.id === nav.mod)
  const enReporte = !!(mod && nav.vista)
  const esPBI = enReporte && mod.id === 'finanzas' && nav.vista === 'dashboard'
  const esGen = enReporte && mod.id !== 'finanzas'
  const A = enReporte ? anio : hoy.getFullYear()
  const M = enReporte ? mes : null
  const fin = useMemo(() => calcFin(datos, A, M, esPBI ? cat : null), [datos, A, M, cat, esPBI])
  const gen = useMemo(() => Object.fromEntries(Object.keys(FUENTES).map((k) => [k, calcGen(datos.fuentes[k]?.rows || [], A, M, esGen ? cat : null)])), [datos, A, M, cat, esGen])
  const prod = useMemo(() => calcProd(datos.fuentes.items?.rows || [], A, M, esGen && nav.vista === 'productos' ? cat : null), [datos, A, M, cat, esGen, nav.vista])
  const vend = useMemo(() => calcVend(datos.fuentes.vend?.rows || [], A, M, esGen && nav.vista === 'vendedores' ? cat : null), [datos, A, M, cat, esGen, nav.vista])
  const desc = useMemo(() => calcDesc([...(datos.fuentes.desc?.rows || []), ...(datos.fuentes.aud?.rows || [])], A, M, esGen && nav.vista === 'descuentos' ? cat : null), [datos, A, M, cat, esGen, nav.vista])

  const ir = (m, v = null) => { setMes(null); setCat(null); setNav({ mod: m, vista: v }) }
  const volver = () => (enReporte ? ir(mod.id) : mod ? ir(null) : onSalir && onSalir())
  const textoVolver = enReporte ? `Volver a ${mod.nombre}` : mod ? 'Volver al inicio' : 'Volver al sistema'
  const titulo = enReporte ? mod.secciones.find((s) => s.id === nav.vista)?.nombre.toUpperCase() : mod ? mod.nombre.toUpperCase() : 'REPORTES'

  const chip = (activo) => ({ border: 'none', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', fontWeight: 800, background: activo ? C.marca : C.dorado, color: activo ? '#fff' : C.texto })
  const item = (activo) => ({ padding: '10px 16px', cursor: 'pointer', fontWeight: 800, borderRadius: 8, whiteSpace: 'nowrap', background: activo ? C.marca : 'transparent', color: activo ? '#fff' : C.texto })

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: C.crema, color: C.texto, fontFamily: "'Segoe UI', Arial, sans-serif", padding: 14, boxSizing: 'border-box' }}>
      {/* libera el ancho: quita el límite de ancho de la plantilla de Vite mientras Reportes está abierto */}
      <style>{'html,body{width:100%;margin:0}body{display:block!important;place-items:initial!important}#root{max-width:none!important;width:100%!important;margin:0!important;padding:0!important;text-align:left!important}'}</style>
      {/* barra superior: Volver + título */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <Logo alto={54} />
        <button onClick={volver} style={{ background: C.marca, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: sombra, whiteSpace: 'nowrap' }}>← {textoVolver}</button>
        <Banda titulo={titulo} />
        {!movil && <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())} style={{ background: C.crema, border: '1px solid #bbb', borderRadius: 10, padding: '12px 14px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>⛶ Pantalla completa</button>}
      </div>

      {/* filtros: solo dentro de un reporte (el dashboard final trae sus propios segmentadores) */}
      {enReporte && !esPBI && !esGen && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <select value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setMes(null) }} style={{ padding: 6, borderRadius: 6, fontWeight: 700 }}>
            {[0, 1, 2].map((i) => { const y = hoy.getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
          {[null, ...MESES.keys()].map((i) => <button key={String(i)} onClick={() => setMes(i)} style={chip(mes === i)}>{i === null ? 'Todo el año' : MESES[i]}</button>)}
          <button onClick={() => { setAnio(hoy.getFullYear()); setMes(hoy.getMonth()) }} style={{ ...chip(false), background: C.crema, border: '1px solid #bbb' }}>Hoy</button>
        </div>
      )}

      {datos.cargando && <div style={{ padding: 10 }}>Cargando datos…</div>}

      {/* inicio y portada: menú de módulos + contenido */}
      {!enReporte && (
        <div style={{ display: 'flex', flexDirection: movil ? 'column' : 'row', gap: 14 }}>
          <aside style={{ width: movil ? 'auto' : 190, background: '#EFE3A6', borderRadius: 12, padding: 10, flexShrink: 0, display: 'flex', flexDirection: movil ? 'row' : 'column', gap: 4, overflowX: 'auto', alignSelf: 'flex-start' }}>
            <div style={item(!mod)} onClick={() => ir(null)}>Inicio</div>
            {MODULOS.map((m) => <div key={m.id} style={item(nav.mod === m.id)} onClick={() => ir(m.id)}>{m.nombre}</div>)}
          </aside>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!mod && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Resumen del año {A}. Toca un módulo para ver su reporte.</div>
                <div style={grid(320)}>
                  {MODULOS.map((m) => <MiniModulo key={m.id} m={m} fin={fin} gen={gen} datos={datos} onClick={() => ir(m.id)} />)}
                </div>
              </>
            )}
            {mod && (
              <div style={{ background: C.tarjeta, borderRadius: 16, boxShadow: sombra, padding: 28 }}>
                <Logo alto={90} />
                <h2 style={{ margin: '10px 0 2px', fontSize: 28 }}>{mod.nombre}</h2>
                <p style={{ margin: 0 }}>{mod.desc}</p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 22 }}>
                  {mod.secciones.map((s) => (
                    <div key={s.id} onClick={() => ir(mod.id, s.id)} style={{ background: C.crema, borderRadius: 14, boxShadow: sombra, padding: 16, width: 220, cursor: 'pointer', borderTop: `5px solid ${C.dorado}` }}>
                      <div style={{ fontWeight: 900 }}>{s.nombre}</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* reporte a pantalla completa */}
      {enReporte && (mod.id === 'finanzas'
        ? (esPBI ? <DashboardPBI k={fin} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} cat={cat} setCat={setCat} /> : <ReporteFinanzas vista={nav.vista} k={fin} />)
        : nav.vista === 'ubicacion'
          ? <DashboardUbicacion rows={datos.fuentes.vend?.rows || []} error={datos.fuentes.vend?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} />
          : nav.vista === 'inventario'
          ? <DashboardInventario items={datos.fuentes.items?.rows || []} error={datos.fuentes.items?.error} />
          : nav.vista === 'proyeccion'
          ? <DashboardProyeccion rows={datos.fuentes.vend?.rows || []} items={datos.fuentes.items?.rows || []} error={datos.fuentes.vend?.error} sel={cat} setSel={setCat} />
          : nav.vista === 'meta'
          ? <DashboardMeta rows={datos.fuentes.vend?.rows || []} error={datos.fuentes.vend?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} sel={cat} setSel={setCat} />
          : nav.vista === 'descuentos'
          ? <DashboardDescuentos g={desc} error={datos.fuentes.desc?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} sel={cat} setSel={setCat} />
          : nav.vista === 'vendedores'
          ? <DashboardVendedores g={vend} error={datos.fuentes.vend?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} sel={cat} setSel={setCat} />
          : nav.vista === 'evolucion'
          ? <DashboardEvolucion rows={datos.fuentes.ventas?.rows || []} error={datos.fuentes.ventas?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} />
          : nav.vista === 'productos'
          ? <DashboardProductos g={prod} error={datos.fuentes.items?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} sel={cat} setSel={setCat} />
          : (mod.id === 'ventas' && nav.vista === 'dashboard')
            ? <DashboardFinalVentas rows={datos.fuentes.vend?.rows || []} items={datos.fuentes.items?.rows || []} descRows={datos.fuentes.desc?.rows || []} error={datos.fuentes.vend?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} />
            : (nav.vista === 'dashboard' || (mod.id === 'ventas' && nav.vista === 'clientes'))
            ? <DashboardGenerico f={FUENTES[mod.id === 'ventas' && nav.vista === 'clientes' ? 'clientes' : mod.fuente]} g={gen[mod.id === 'ventas' && nav.vista === 'clientes' ? 'clientes' : mod.fuente]} error={datos.fuentes[mod.fuente]?.error} anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} sel={cat} setSel={setCat} />
            : <Pendiente nombre={mod.secciones.find((x) => x.id === nav.vista)?.nombre} />)}
    </div>
  )
}