import { useState, useEffect } from 'react'
import { supabase } from './supabase'

// En PC deja la tabla intacta (sin scroll propio); en celular la envuelve
// en un contenedor con scroll horizontal para poder llegar a "Acciones".
function TablaScroll({ isMobile, children }) {
  if (!isMobile) return <>{children}</>
  return <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
}

// =========================================================
// UBICACIÓN AUTOMÁTICA (mapa de ventas)
// =========================================================
const DEPARTAMENTOS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá',
  'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila',
  'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'
]

// Sugerencias de municipios de Antioquia (también se puede escribir cualquier otro municipio)
const MUNICIPIOS_ANTIOQUIA = [
  'Abejorral', 'Abriaquí', 'Alejandría', 'Amagá', 'Amalfi', 'Andes', 'Angelópolis', 'Angostura', 'Anorí',
  'Anzá', 'Apartadó', 'Arboletes', 'Argelia', 'Armenia', 'Barbosa', 'Bello', 'Belmira', 'Betania', 'Betulia',
  'Briceño', 'Buriticá', 'Cáceres', 'Caicedo', 'Caldas', 'Campamento', 'Cañasgordas', 'Caracolí', 'Caramanta',
  'Carepa', 'Carolina del Príncipe', 'Caucasia', 'Chigorodó', 'Cisneros', 'Ciudad Bolívar', 'Cocorná',
  'Concepción', 'Concordia', 'Copacabana', 'Dabeiba', 'Donmatías', 'Ebéjico', 'El Bagre', 'El Carmen de Viboral',
  'El Peñol', 'El Retiro', 'El Santuario', 'Entrerríos', 'Envigado', 'Fredonia', 'Frontino', 'Giraldo',
  'Girardota', 'Gómez Plata', 'Granada', 'Guadalupe', 'Guarne', 'Guatapé', 'Heliconia', 'Hispania', 'Itagüí',
  'Ituango', 'Jardín', 'Jericó', 'La Ceja', 'La Estrella', 'La Pintada', 'La Unión', 'Liborina', 'Maceo',
  'Marinilla', 'Medellín', 'Montebello', 'Murindó', 'Mutatá', 'Nariño', 'Nechí', 'Necoclí', 'Olaya', 'Peque',
  'Pueblorrico', 'Puerto Berrío', 'Puerto Nare', 'Puerto Triunfo', 'Remedios', 'Rionegro', 'Sabanalarga',
  'Sabaneta', 'Salgar', 'San Andrés de Cuerquia', 'San Carlos', 'San Francisco', 'San Jerónimo',
  'San José de la Montaña', 'San Juan de Urabá', 'San Luis', 'San Pedro de los Milagros', 'San Pedro de Urabá',
  'San Rafael', 'San Roque', 'San Vicente Ferrer', 'Santa Bárbara', 'Santa Fe de Antioquia', 'Santa Rosa de Osos',
  'Santo Domingo', 'Segovia', 'Sonsón', 'Sopetrán', 'Támesis', 'Tarazá', 'Tarso', 'Titiribí', 'Toledo', 'Turbo',
  'Uramita', 'Urrao', 'Valdivia', 'Valparaíso', 'Vegachí', 'Venecia', 'Vigía del Fuerte', 'Yalí', 'Yarumal',
  'Yolombó', 'Yondó', 'Zaragoza'
]

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// Expande abreviaturas comunes de direcciones colombianas para que el buscador las entienda
function normalizarDireccion(d) {
  return (d || '')
    .replace(/\b(cra|cr|kra|carr)\b\.?/gi, 'Carrera')
    .replace(/\b(cl|cll|cale)\b\.?/gi, 'Calle')
    .replace(/\b(dg|diag)\b\.?/gi, 'Diagonal')
    .replace(/\b(tv|trans|transv)\b\.?/gi, 'Transversal')
    .replace(/\b(av|avda)\b\.?/gi, 'Avenida')
    .replace(/\b(cir)\b\.?/gi, 'Circular')
    .replace(/°|º|No\.?|N°/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Lee coordenadas pegadas desde Google Maps (clic derecho > copiar coordenadas), ej. "6.2105, -75.5712"
const leerCoordenadas = (t) => {
  const m = String(t || '').match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const lat = parseFloat(m[1].replace(',', '.')), lng = parseFloat(m[2].replace(',', '.'))
  return lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66 ? { lat, lng } : null
}

const cacheMunicipios = {}

// Tipos de vía y cómo se escriben en OpenStreetMap
const TIPOS_VIA = {
  carrera: { patron: 'Carrera|Cra\\.?|Cr\\.?|Kra\\.?|Kr\\.?', cruce: ['Calle'] },
  calle: { patron: 'Calle|Cl\\.?|Cll\\.?', cruce: ['Carrera'] },
  avenida: { patron: 'Avenida|Av\\.?', cruce: ['Calle', 'Carrera'] },
  diagonal: { patron: 'Diagonal|Dg\\.?|Diag\\.?', cruce: ['Calle', 'Carrera'] },
  transversal: { patron: 'Transversal|Tv\\.?|Trans\\.?|Transv\\.?', cruce: ['Calle', 'Carrera'] },
  circular: { patron: 'Circular|Cir\\.?', cruce: ['Calle', 'Carrera'] },
}

// Entiende la nomenclatura colombiana: "Carrera 43A # 10-20" = sobre la Carrera 43A, cerca de la Calle 10, número 20.
function leerDireccion(texto) {
  const m = normalizarDireccion(texto).match(
    /(Carrera|Calle|Avenida|Diagonal|Transversal|Circular)\s*(\d+)\s*([A-Za-z](?![A-Za-z]))?\s*(Sur|Norte|Este|Oeste)?\s*#?\s*(\d+)\s*([A-Za-z](?![A-Za-z]))?\s*(Sur|Norte|Este|Oeste)?\s*-\s*(\d+)/i
  )
  if (!m) return null
  const tipo = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return { tipo, num: m[2], letra: m[3] || '', orient: m[4] || '', cruceNum: m[5], cruceLetra: m[6] || '', cruceOrient: m[7] || '', casa: m[8] }
}

// Busca en OpenStreetMap el punto donde se cruzan la vía principal y la calle/carrera de cruce (precisión de cuadra).
async function buscarEsquina(direccion, caja) {
  const d = leerDireccion(direccion)
  if (!d) return null
  const [s, n, w, e] = caja
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const patron = (tipo, num, letra, orient) => `^(${TIPOS_VIA[tipo.toLowerCase()].patron})\\s*${num}\\s*${letra}${orient ? '\\s*' + orient : ''}( .*)?$`
  const principal = patron(d.tipo, d.num, d.letra, d.orient)
  for (const cruce of TIPOS_VIA[d.tipo.toLowerCase()].cruce) {
    const q = `[out:json][timeout:20];way["highway"]["name"~"${esc(principal)}",i](${s},${w},${n},${e})->.a;way["highway"]["name"~"${esc(patron(cruce, d.cruceNum, d.cruceLetra, d.cruceOrient))}",i](${s},${w},${n},${e})->.b;node(w.a)(w.b);out 5;`
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 22000)
      const r = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), { signal: ctl.signal })
      clearTimeout(t)
      const j = await r.json()
      const nodo = j && j.elements && j.elements[0]
      if (nodo) return { lat: nodo.lat, lng: nodo.lon, lugar: `Cruce de ${d.tipo} ${d.num}${d.letra} con ${cruce} ${d.cruceNum}${d.cruceLetra}` }
    } catch (err) { /* sigue con el siguiente método */ }
  }
  return null
}

// Ubica al cliente solo, sin que nadie tenga que hacerlo a mano. Primero encuentra el municipio y su recuadro;
// después busca SOLO dentro de ese recuadro, para que nunca caiga en otra ciudad. Orden de intentos:
// 1) esquina (vía principal × calle de cruce)   2) número exacto de la dirección   3) barrio escrito en la dirección
// 4) la calle   5) el centro del municipio.
// Devuelve { lat, lng, precision, lugar } o null. Usa OpenStreetMap (máx. 1 consulta por segundo).
async function ubicar(direccion, municipio, departamento) {
  const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co'
  const pedir = async (q, extra = '') => {
    try {
      const r = await fetch(`${base}${extra}&q=${encodeURIComponent(q)}`)
      const j = await r.json()
      return j && j[0] ? j[0] : null
    } catch (e) {
      return null
    }
  }
  const aPunto = (x, precision) => ({ lat: parseFloat(x.lat), lng: parseFloat(x.lon), precision, lugar: x.display_name })
  const lugar = [municipio, departamento, 'Colombia'].filter(Boolean).join(', ')
  let m = cacheMunicipios[lugar]
  if (!m) {
    m = await pedir(lugar)
    if (m) cacheMunicipios[lugar] = m
    await esperar(1100)
  }
  if (!m) return null
  const bb = (m.boundingbox || []).map(parseFloat) // [sur, norte, oeste, este]
  const hayCaja = bb.length === 4 && bb.every((v) => !isNaN(v))
  const caja = hayCaja ? `&viewbox=${bb[2]},${bb[1]},${bb[3]},${bb[0]}&bounded=1` : ''
  const dir = normalizarDireccion(direccion)
  let calleEncontrada = null

  if (dir && hayCaja) {
    // 1) esquina
    const esq = await buscarEsquina(dir, bb)
    if (esq) return { ...esq, precision: 'esquina' }

    // 2) dirección completa: solo vale como "exacta" si el resultado es una casa/local, no la calle entera
    await esperar(1100)
    const p = await pedir(`${dir}, ${municipio}`, caja)
    if (p) {
      if (p.class === 'highway' || p.addresstype === 'road') calleEncontrada = p
      else return aPunto(p, 'direccion')
    }
  }

  // 3) barrio escrito después de la primera coma ("Carrera 43A # 10-20, El Poblado") o con la palabra "barrio"
  if (hayCaja && direccion) {
    const partes = String(direccion).split(',').slice(1).map((t) => t.replace(/^(barrio|b\/|sector|urbanizaci[oó]n|urb\.?)\s+/i, '').trim()).filter((t) => t && !/\d/.test(t))
    const marcado = String(direccion).match(/(?:barrio|sector|urbanizaci[oó]n|urb\.?)\s+([^,;#\d]+)/i)
    if (marcado) partes.unshift(marcado[1].trim())
    for (const b of partes) {
      await esperar(1100)
      const pb = await pedir(`${b}, ${municipio}`, caja)
      if (pb) return aPunto(pb, 'barrio')
    }
  }

  // 4) la calle
  if (calleEncontrada) return aPunto(calleEncontrada, 'calle')
  if (dir && hayCaja) {
    const calle = dir.split(/#|\s\d+\s*-\s*\d+/)[0].trim()
    if (calle && calle !== dir) {
      await esperar(1100)
      const pc = await pedir(`${calle}, ${municipio}`, caja)
      if (pc) return aPunto(pc, 'calle')
    }
  }

  // 5) municipio
  return aPunto(m, 'municipio')
}

const TEXTO_PRECISION = {
  direccion: '📍 Dirección',
  esquina: '📍 Esquina (cuadra)',
  barrio: '📌 Barrio aprox.',
  calle: '📌 Calle aprox.',
  manual: '📍 Exacta (coordenadas)',
  municipio: '⚠️ Solo municipio'
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [guardando, setGuardando] = useState(false)
  const [clienteDetalle, setClienteDetalle] = useState(null)
  const [edit, setEdit] = useState(null)
  const [ubicando, setUbicando] = useState(false)
  const [aviso, setAviso] = useState('')
  // Detecta pantalla táctil — así una ventana de PC angosta no activa el scroll de tabla
  const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const vacio = {
    tipo_cliente: 'registrado',
    empresa: '', encargado: '', cedula_nit: '',
    telefono: '', direccion: '', departamento: 'Antioquia', municipio: '', cumpleanos: '',
    informacion_adicional: '', limite_credito: '', dias_credito: ''
  }
  const [nuevo, setNuevo] = useState(vacio)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('creado_en')
    setClientes(data || [])
    setLoading(false)
  }

  const siguienteNumero = async () => {
    const { data } = await supabase.from('clientes').select('id')
    return String((data?.length || 0) + 1).padStart(3, '0')
  }

  const textoAviso = (p) =>
    !p ? 'El cliente quedó guardado, pero no se pudo ubicar en el mapa. Revisa el municipio y la dirección.'
    : p.precision === 'municipio' ? 'El cliente quedó guardado, pero solo se pudo ubicar el municipio (no la dirección exacta).'
    : p.precision === 'calle' ? `Cliente guardado, pero solo se pudo ubicar la calle (puede estar lejos del número exacto).${p.lugar ? ' Encontrado: ' + p.lugar : ''}`
    : p.precision === 'barrio' ? `Cliente guardado y ubicado de forma aproximada (en el barrio).${p.lugar ? ' Encontrado: ' + p.lugar : ''}`
    : `Cliente guardado y ubicado en el mapa.${p.lugar ? ' Encontrado: ' + p.lugar : ''}`

  const guardar = async () => {
    if (!nuevo.empresa) { alert('El nombre/empresa es obligatorio'); return }
    if (!nuevo.telefono) { alert('El teléfono es obligatorio'); return }
    if (!nuevo.departamento || !nuevo.municipio.trim()) { alert('El departamento y el municipio son obligatorios'); return }

    setGuardando(true)
    const numero = await siguienteNumero()
    const p = await ubicar(nuevo.direccion, nuevo.municipio.trim(), nuevo.departamento)

    const { error } = await supabase.from('clientes').insert([{
      nombre: nuevo.empresa,
      codigo_manual: numero,
      tipo_cliente: nuevo.tipo_cliente,
      empresa: nuevo.empresa,
      encargado: nuevo.encargado,
      cedula_nit: nuevo.cedula_nit,
      telefono: nuevo.telefono,
      direccion: nuevo.direccion,
      departamento: nuevo.departamento,
      municipio: nuevo.municipio.trim(),
      latitud: p ? p.lat : null,
      longitud: p ? p.lng : null,
      ubicacion_precision: p ? p.precision : null,
      cumpleanos: nuevo.cumpleanos || null,
      informacion_adicional: nuevo.informacion_adicional,
      limite_credito: parseFloat(nuevo.limite_credito) || 0,
      dias_credito: parseInt(nuevo.dias_credito) || 0,
      saldo_pendiente: 0,
    }])

    if (error) {
      alert('Error: ' + error.message)
    } else {
      setMostrarForm(false)
      setNuevo(vacio)
      setAviso(textoAviso(p))
      cargar()
    }
    setGuardando(false)
  }

  // Cambia departamento, municipio o dirección de un cliente y lo vuelve a ubicar solo
  const actualizarUbicacion = async (c, datos) => {
    const p = datos.coords ? { lat: datos.coords.lat, lng: datos.coords.lng, precision: 'manual' } : await ubicar(datos.direccion, datos.municipio, datos.departamento)
    const cambios = {
      direccion: datos.direccion,
      departamento: datos.departamento,
      municipio: datos.municipio,
      latitud: p ? p.lat : null,
      longitud: p ? p.lng : null,
      ubicacion_precision: p ? p.precision : null
    }
    const { error } = await supabase.from('clientes').update(cambios).eq('id', c.id)
    return { error, cambios, p }
  }

  const abrirDetalle = (c) => {
    setClienteDetalle(c)
    setEdit({ departamento: c.departamento || 'Antioquia', municipio: c.municipio || '', direccion: c.direccion || '', coordenadas: '' })
  }

  const guardarUbicacion = async () => {
    if (!edit.municipio.trim()) { alert('El municipio es obligatorio'); return }
    const coords = edit.coordenadas ? leerCoordenadas(edit.coordenadas) : null
    if (edit.coordenadas && !coords) { alert('No entendí las coordenadas. Cópialas desde Google Maps, por ejemplo: 6.2105, -75.5712'); return }
    setUbicando(true)
    const { error, cambios, p } = await actualizarUbicacion(clienteDetalle, { ...edit, municipio: edit.municipio.trim(), coords })
    setUbicando(false)
    if (error) { alert('Error: ' + error.message); return }
    setClienteDetalle({ ...clienteDetalle, ...cambios })
    setAviso(textoAviso(p).replace('Cliente guardado y ubicado', 'Ubicación actualizada y ubicada').replace('El cliente quedó guardado, pero', 'Ubicación guardada, pero'))
    cargar()
  }

  // Ubica de una vez los clientes que ya tienen municipio pero todavía no tienen coordenadas
  const ubicarPendientes = async (todos = false) => {
    if (todos && !window.confirm('Se volverán a ubicar todos los clientes con la búsqueda mejorada (menos los que tienen coordenadas exactas). Tarda unos segundos por cliente. ¿Continuar?')) return
    const pend = clientes.filter(c => c.municipio && c.ubicacion_precision !== 'manual' && (todos || !c.latitud))
    if (!pend.length) return
    setUbicando(true)
    for (let i = 0; i < pend.length; i++) {
      setAviso(`Ubicando clientes… ${i + 1} de ${pend.length}`)
      await actualizarUbicacion(pend[i], { direccion: pend[i].direccion || '', municipio: pend[i].municipio, departamento: pend[i].departamento || 'Antioquia' })
      await esperar(1100)
    }
    setAviso('Listo: los clientes pendientes ya fueron ubicados.')
    setUbicando(false)
    cargar()
  }

  const eliminar = async (c) => {
    const confirmar = window.confirm(`¿Estás segura que deseas eliminar a "${c.empresa}"?`)
    if (!confirmar) return

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'clientes',
      accion: 'ELIMINACIÓN',
      descripcion: `${c.codigo_manual} — ${c.empresa}`,
      datos_anteriores: c,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])

    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) {
      alert('Error al eliminar: ' + error.message)
    } else {
      cargar()
    }
  }

  const clientesFiltrados = filtroTipo === 'todos'
    ? clientes
    : clientes.filter(c => c.tipo_cliente === filtroTipo)

  const pendientes = clientes.filter(c => c.municipio && !c.latitud).length
  const sinMunicipio = clientes.filter(c => !c.municipio).length

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      <datalist id="municipios-antioquia">
        {MUNICIPIOS_ANTIOQUIA.map(m => <option key={m} value={m} />)}
      </datalist>

      {clienteDetalle && (
        <div onClick={() => setClienteDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 420, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{clienteDetalle.empresa}</div>
              <span onClick={() => setClienteDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÓDIGO</span><br/>{clienteDetalle.codigo_manual}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TIPO</span><br/>{clienteDetalle.tipo_cliente === 'registrado' ? 'Cliente Registrado' : 'Cliente Temporal'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ENCARGADO</span><br/>{clienteDetalle.encargado || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÉDULA / NIT</span><br/>{clienteDetalle.cedula_nit || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TELÉFONO</span><br/>{clienteDetalle.telefono}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DIRECCIÓN</span><br/>{clienteDetalle.direccion || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DEPARTAMENTO / MUNICIPIO</span><br/>{clienteDetalle.municipio ? `${clienteDetalle.municipio}, ${clienteDetalle.departamento || ''}` : '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>UBICACIÓN EN EL MAPA</span><br/>{TEXTO_PRECISION[clienteDetalle.ubicacion_precision] || 'Sin ubicar'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CUMPLEAÑOS</span><br/>{clienteDetalle.cumpleanos || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>LÍMITE DE CRÉDITO</span><br/>{clienteDetalle.limite_credito ? '$' + clienteDetalle.limite_credito.toLocaleString() : '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DÍAS DE CRÉDITO</span><br/>{clienteDetalle.dias_credito || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SALDO PENDIENTE</span><br/>${(clienteDetalle.saldo_pendiente || 0).toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>INFORMACIÓN ADICIONAL</span><br/>{clienteDetalle.informacion_adicional || '—'}</div>
            </div>

            {edit && (
              <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginTop: 16 }}>
                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>📍 CORREGIR UBICACIÓN</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={lbl}>DEPARTAMENTO</label>
                    <select value={edit.departamento} onChange={e => setEdit({ ...edit, departamento: e.target.value })} style={inp}>
                      {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>MUNICIPIO</label>
                    <input list="municipios-antioquia" value={edit.municipio} onChange={e => setEdit({ ...edit, municipio: e.target.value })} placeholder="Ej. Medellín" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>DIRECCIÓN</label>
                    <input value={edit.direccion} onChange={e => setEdit({ ...edit, direccion: e.target.value })} placeholder="Ej. Carrera 43A # 10-20" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>COORDENADAS DE GOOGLE MAPS (opcional, solo si la dirección quedó mal)</label>
                    <input value={edit.coordenadas} onChange={e => setEdit({ ...edit, coordenadas: e.target.value })} placeholder="Ej. 6.2105, -75.5712" style={inp} />
                  </div>
                  <button onClick={guardarUbicacion} disabled={ubicando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {ubicando ? 'Ubicando...' : 'Guardar y ubicar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👥 Clientes</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4, fontWeight: 500 }}>
            {loading ? '...' : `${clientes.length} clientes registrados`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo cliente
        </button>
      </div>

      {aviso && (
        <div style={{ background: '#FEF3DC', border: '1px solid #E8D3A0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{aviso}</span>
          {!ubicando && <span onClick={() => setAviso('')} style={{ cursor: 'pointer', color: '#9A8E85' }}>×</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {['todos', 'registrado', 'temporal'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none',
            background: filtroTipo === t ? '#B22222' : '#fff',
            color: filtroTipo === t ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {t === 'todos' ? 'Todos' : t === 'registrado' ? 'Registrado' : 'Temporal'}
          </button>
        ))}
        {pendientes > 0 && (
          <button onClick={() => ubicarPendientes(false)} disabled={ubicando} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#E8F0FB', color: '#1A5FA8' }}>
            {ubicando ? 'Ubicando...' : `📍 Ubicar ${pendientes} cliente${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'}`}
          </button>
        )}
        {clientes.some(c => c.municipio && c.ubicacion_precision !== 'manual') && (
          <button onClick={() => ubicarPendientes(true)} disabled={ubicando} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#F4F1ED', color: '#5A4F47' }}>
            🔄 Volver a ubicar todos
          </button>
        )}
        {sinMunicipio > 0 && (
          <span style={{ fontSize: 12, color: '#C07D00' }}>{sinMunicipio} sin municipio: ábrelos con VER para completar su ubicación</span>
        )}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nuevo cliente</div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>TIPO DE CLIENTE</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={nuevo.tipo_cliente === 'registrado'} onChange={() => setNuevo({...nuevo, tipo_cliente: 'registrado'})} />
                Cliente Registrado
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={nuevo.tipo_cliente === 'temporal'} onChange={() => setNuevo({...nuevo, tipo_cliente: 'temporal'})} />
                Cliente Temporal
              </label>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OBLIGATORIOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>EMPRESA / NOMBRE *</label>
                <input value={nuevo.empresa} onChange={e => setNuevo({...nuevo, empresa: e.target.value})} placeholder="Ej. Restaurante El Asado" style={inp} maxLength={100} />
              </div>
              <div>
                <label style={lbl}>TELÉFONO *</label>
                <input value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
              </div>
              <div>
                <label style={lbl}>ENCARGADO</label>
                <input value={nuevo.encargado} onChange={e => setNuevo({...nuevo, encargado: e.target.value})} placeholder="Nombre de contacto" style={inp} />
              </div>
              <div>
                <label style={lbl}>DEPARTAMENTO *</label>
                <select value={nuevo.departamento} onChange={e => setNuevo({...nuevo, departamento: e.target.value})} style={inp}>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>MUNICIPIO *</label>
                <input list="municipios-antioquia" value={nuevo.municipio} onChange={e => setNuevo({...nuevo, municipio: e.target.value})} placeholder="Ej. Medellín" style={inp} />
              </div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OPCIONALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>CÉDULA / NIT</label>
                <input value={nuevo.cedula_nit} onChange={e => setNuevo({...nuevo, cedula_nit: e.target.value})} placeholder="Ej. 900123456-7" style={inp} />
              </div>
              <div>
                <label style={lbl}>CUMPLEAÑOS</label>
                <input type="date" value={nuevo.cumpleanos} onChange={e => setNuevo({...nuevo, cumpleanos: e.target.value})} style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>DIRECCIÓN (con ella se ubica solo en el mapa)</label>
                <input value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})} placeholder="Ej. Carrera 43A # 10-20, barrio El Poblado" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>INFORMACIÓN ADICIONAL</label>
                <textarea value={nuevo.informacion_adicional} onChange={e => setNuevo({...nuevo, informacion_adicional: e.target.value})} placeholder="Notas, preferencias, etc." style={{ ...inp, height: 60, resize: 'none' }} />
              </div>
            </div>
          </div>

          {nuevo.tipo_cliente === 'registrado' && (
            <div style={{ background: '#FEF3DC', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#C07D00', fontWeight: 600, marginBottom: 12 }}>💳 CONDICIONES DE CRÉDITO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>LÍMITE DE CRÉDITO</label>
                  <input type="number" value={nuevo.limite_credito} onChange={e => setNuevo({...nuevo, limite_credito: e.target.value})} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={lbl}>DÍAS DE CRÉDITO</label>
                  <input type="number" value={nuevo.dias_credito} onChange={e => setNuevo({...nuevo, dias_credito: e.target.value})} placeholder="Ej. 30" style={inp} />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando y ubicando...' : 'Guardar cliente'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay clientes registrados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo cliente" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <TablaScroll isMobile={isMobile}>
            <table style={{ width: '100%', ...(isMobile ? { minWidth: 1000 } : {}), borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F1ED' }}>
                  {['#','Empresa','Encargado','Dirección','Ubicación','Teléfono','Tipo','Crédito','Saldo','Detalle','Eliminar'].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.codigo_manual}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {c.empresa}<br/>
                      <span style={{ fontSize: 11, color: '#9A8E85', fontWeight: 400 }}>{c.cedula_nit}</span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.encargado || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.direccion || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.municipio || '—'}<br/>
                      <span style={{ fontSize: 11, color: ['direccion', 'esquina', 'manual'].includes(c.ubicacion_precision) ? '#1A9156' : '#C07D00' }}>{TEXTO_PRECISION[c.ubicacion_precision] || 'Sin ubicar'}</span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.telefono}</td>
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: c.tipo_cliente === 'registrado' ? '#E8F0FB' : '#FEF3DC', color: c.tipo_cliente === 'registrado' ? '#1A5FA8' : '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                        {c.tipo_cliente === 'registrado' ? 'Registrado' : 'Temporal'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.limite_credito ? '$' + c.limite_credito.toLocaleString() : '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', color: c.saldo_pendiente > 0 ? '#B22222' : '#1A9156', whiteSpace: 'nowrap' }}>${(c.saldo_pendiente || 0).toLocaleString()}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirDetalle(c)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          👁️ VER
                        </button>
                        <button onClick={() => eliminar(c)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </div>
      )}
    </div>
  )
}