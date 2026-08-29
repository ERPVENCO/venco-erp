import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const EMPRESA = {
  nombre: 'AHUMADOS M&Y',
  direccion: 'Cll 72#38-04',
  ciudad: 'Medellín / Antioquia',
  telefonos: '3006293875 - 3022130107',
  correo: 'ahumadosmy@gmail.com',
  logo: '/logo.jpg'
}

export default function DocumentoVenta({ venta, onCerrar }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [clienteInfo, setClienteInfo] = useState(null)
  const [showWAMenu, setShowWAMenu] = useState(false)
  const [showMailMenu, setShowMailMenu] = useState(false)
  const waRef = useRef(null)
  const mailRef = useRef(null)

  useEffect(() => {
    if (venta) {
      cargarItems()
      cargarCliente()
    }
  }, [venta])

  useEffect(() => {
    const handleClick = (e) => {
      if (waRef.current && !waRef.current.contains(e.target)) setShowWAMenu(false)
      if (mailRef.current && !mailRef.current.contains(e.target)) setShowMailMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const cargarItems = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('venta_items')
      .select('*')
      .eq('venta_id', venta.id)
    setItems(data || [])
    setLoading(false)
  }

  const cargarCliente = async () => {
    setClienteInfo(null)
    if (venta.cliente_id) {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', venta.cliente_id)
        .single()
      if (!error && data) { setClienteInfo(data); return }
    }
    if (venta.cliente_nombre) {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa', venta.cliente_nombre)
        .maybeSingle()
      if (!error && data) setClienteInfo(data)
    }
  }

  // --- IMPRESIÓN ---
  // Nota: "half-letter" NO es una palabra clave válida de CSS @page en la mayoría
  // de los navegadores, por eso no se estaba aplicando el tamaño. Se reemplaza
  // por las dimensiones explícitas en mm (139.7mm x 215.9mm = media carta).
  const imprimir = () => {
    const contenido = document.getElementById('documento').innerHTML
    const ventanaImpresion = window.open('', '_blank')
    ventanaImpresion.document.write(`
      <html>
        <head>
          <title>${venta.folio}</title>
          <style>
            @page { margin: 6mm; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            html, body {
              margin: 0;
              padding: 0;
            }
            body {
              font-family: 'Georgia', 'Times New Roman', serif;
              font-size: 10px;
              width: 197mm;
              color: #2A2A2A;
              margin: 0;
            }
            table { width: 100%; border-collapse: collapse; }
            th { background: #9C7A29; color: #fff; padding: 6px 7px; text-align: left; font-size: 9.5px; letter-spacing: 0.3px; }
            td { padding: 5px 7px; border-bottom: 1px solid #eee; font-size: 10px; }
            img { max-width: 48px; }
          </style>
        </head>
        <body>${contenido}</body>
      </html>
    `)
    ventanaImpresion.document.close()
    ventanaImpresion.focus()
    setTimeout(() => { ventanaImpresion.print(); ventanaImpresion.close() }, 500)
  }

  const cargarLibreria = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })

  const capturarDocumento = async () => {
    await cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    const el = document.getElementById('documento')
    return await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff' })
  }

  const abrirWhatsAppParaAdjuntar = () => {
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (esMovil) {
      window.location.href = 'whatsapp://send'
    } else {
      window.open('https://web.whatsapp.com/', '_blank')
    }
  }

  const enviarWATexto = () => {
    setShowWAMenu(false)
    const texto = generarTextoPlano()
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const url = esMovil
      ? `whatsapp://send?text=${encodeURIComponent(texto)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank')
  }

  const enviarWAJPG = async () => {
    setShowWAMenu(false)
    try {
      const canvas = await capturarDocumento()
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${venta.folio || 'documento'}.jpg`
        a.click(); URL.revokeObjectURL(url)
        setTimeout(abrirWhatsAppParaAdjuntar, 600)
      }, 'image/jpeg', 0.95)
    } catch (e) { alert('Error al generar imagen') }
  }

  const enviarWAPDF = async () => {
    setShowWAMenu(false)
    try {
      await cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      await cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      const canvas = await capturarDocumento()
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const { jsPDF } = window.jspdf
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`${venta.folio || 'documento'}.pdf`)
      setTimeout(abrirWhatsAppParaAdjuntar, 600)
    } catch (e) { alert('Error al generar PDF') }
  }

  const enviarCorreoTexto = () => {
    setShowMailMenu(false)
    const texto = generarTextoPlano()
    const asunto = `${venta.tipo === 'remision' ? 'Remisión' : 'Factura'} ${venta.folio} - ${EMPRESA.nombre}`
    window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`
  }

  const enviarCorreoJPG = async () => {
    setShowMailMenu(false)
    try {
      const canvas = await capturarDocumento()
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${venta.folio || 'documento'}.jpg`
        a.click(); URL.revokeObjectURL(url)
        const asunto = `${venta.tipo === 'remision' ? 'Remisión' : 'Factura'} ${venta.folio} - ${EMPRESA.nombre}`
        setTimeout(() => window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent('Adjunto imagen del documento.')}`, 600)
      }, 'image/jpeg', 0.95)
    } catch (e) { alert('Error al generar imagen') }
  }

  const enviarCorreoPDF = async () => {
    setShowMailMenu(false)
    try {
      await cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      await cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      const canvas = await capturarDocumento()
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const { jsPDF } = window.jspdf
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`${venta.folio || 'documento'}.pdf`)
      const asunto = `${venta.tipo === 'remision' ? 'Remisión' : 'Factura'} ${venta.folio} - ${EMPRESA.nombre}`
      setTimeout(() => window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent('Adjunto PDF del documento.')}`, 600)
    } catch (e) { alert('Error al generar PDF') }
  }

  const generarTextoPlano = () => {
    const cuentas = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }
    let texto = `${EMPRESA.nombre}\n`
    texto += `${EMPRESA.direccion} - ${EMPRESA.ciudad}\n`
    texto += `Tel: ${EMPRESA.telefonos}\n`
    texto += `${EMPRESA.correo}\n`
    texto += `${'─'.repeat(40)}\n`
    texto += `${venta.tipo === 'remision' ? 'REMISIÓN' : 'FACTURA'}: ${venta.folio}\n`
    texto += `Fecha: ${new Date(venta.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}\n`
    texto += `Cliente: ${venta.cliente_nombre}\n`
    if (clienteInfo?.telefono) texto += `Teléfono: ${clienteInfo.telefono}\n`
    if (clienteInfo?.direccion) texto += `Dirección: ${clienteInfo.direccion}\n`
    if (clienteInfo?.encargado) texto += `Encargado: ${clienteInfo.encargado}\n`
    if (clienteInfo?.cedula_nit) texto += `Cédula/NIT: ${clienteInfo.cedula_nit}\n`
    texto += `Estado: ${venta.estado?.toUpperCase()}\n`
    if (venta.metodo_pago) texto += `Forma de pago: ${venta.metodo_pago}\n`
    if (venta.tipo_cuenta) texto += `Cuenta: ${cuentas[venta.tipo_cuenta] || ''}\n`
    texto += `${'─'.repeat(40)}\n`
    texto += `PRODUCTOS:\n`
    items.forEach(item => {
      texto += `• ${item.nombre_producto}\n`
      texto += `  ${item.cantidad} ${item.unidad} x $${item.precio_unitario?.toLocaleString()} = $${item.subtotal?.toLocaleString()}\n`
    })
    texto += `${'─'.repeat(40)}\n`
    texto += `Subtotal: $${venta.subtotal?.toLocaleString()}\n`
    if (venta.descuento > 0) texto += `Descuento: -$${venta.descuento?.toLocaleString()}\n`
    if (venta.iva > 0) texto += `IVA 19%: $${venta.iva?.toLocaleString()}\n`
    texto += `TOTAL: $${venta.total?.toLocaleString()}\n`
    texto += `${'─'.repeat(40)}\n`
    texto += `¡Gracias por su compra!\n`
    texto += `Su confianza nos motiva a seguir mejorando. ¡Lo esperamos pronto!`
    return texto
  }

  if (!venta) return null

  const cuentas = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }
  const fechaUTC = new Date(venta.creado_en + 'Z')
  const totalUnidades = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0)

  const estiloOpcion = {
    display: 'block', width: '100%', padding: '9px 16px', fontSize: 12,
    fontWeight: 500, background: 'transparent', border: 'none',
    borderBottom: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left', color: '#333'
  }

  // Tokens de estilo "formal" reutilizables
  const dorado = '#9C7A29'
  const cajaBase = { border: '1px solid #D9C7A3', borderRadius: 4, padding: '6px 9px', background: '#fff' }
  const tituloCaja = {
    fontSize: 9, fontWeight: 700, color: dorado, marginBottom: 4,
    letterSpacing: '0.6px', textTransform: 'uppercase',
    borderBottom: `1px solid #E8DCC0`, paddingBottom: 3
  }
  const etiquetaDato = { color: '#7A7268', fontFamily: "'Georgia', serif" }
  // Casilla compacta: "Etiqueta: Valor" en una sola línea, para grids densos como el de la muestra
  const casilla = { fontSize: 10, padding: '1px 0', lineHeight: 1.3 }
  // Variante con borde: para cuadrículas donde cada dato debe verse como una celda encerrada
  const casillaEncerrada = { fontSize: 10, padding: '3px 7px', lineHeight: 1.3, borderRight: '1px solid #D9C7A3', borderBottom: '1px solid #D9C7A3' }

  return (
    <div className="no-print" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 660, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 28px rgba(0,0,0,0.2)' }}>

        {/* Barra de botones */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {venta.tipo === 'remision' ? '📦 Remisión' : '🧾 Factura'} {venta.folio}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={imprimir} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              🖨️ Imprimir
            </button>

            {/* WhatsApp dropdown */}
            <div ref={waRef} style={{ position: 'relative' }}>
              <button onClick={() => { setShowWAMenu(v => !v); setShowMailMenu(false) }} style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📱 WhatsApp ▾
              </button>
              {showWAMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: 150, overflow: 'hidden' }}>
                  <button onClick={enviarWATexto} style={estiloOpcion}>💬 Texto</button>
                  <button onClick={enviarWAJPG} style={estiloOpcion}>🖼️ Imagen JPG</button>
                  <button onClick={enviarWAPDF} style={estiloOpcion}>📄 PDF</button>
                </div>
              )}
            </div>

            {/* Correo dropdown */}
            <div ref={mailRef} style={{ position: 'relative' }}>
              <button onClick={() => { setShowMailMenu(v => !v); setShowWAMenu(false) }} style={{ background: '#C07D00', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ✉️ Correo ▾
              </button>
              {showMailMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: 150, overflow: 'hidden' }}>
                  <button onClick={enviarCorreoTexto} style={estiloOpcion}>💬 Texto</button>
                  <button onClick={enviarCorreoJPG} style={estiloOpcion}>🖼️ Imagen JPG</button>
                  <button onClick={enviarCorreoPDF} style={estiloOpcion}>📄 PDF</button>
                </div>
              )}
            </div>

            <button onClick={onCerrar} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ✕ Cerrar
            </button>
          </div>
        </div>

        {/* Documento */}
        <div id="documento" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 10.5, width: '100%', background: '#fff', border: `1px solid ${dorado}`, borderRadius: 4, padding: '14px 16px', color: '#2A2A2A' }}>

          {/* Encabezado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, paddingBottom: 7, borderBottom: `3px double ${dorado}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={EMPRESA.logo} alt="Logo" style={{ width: 100, height: 100, objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: dorado, letterSpacing: '0.4px' }}>{EMPRESA.nombre}</div>
                <div style={{ fontSize: 9, color: '#6B6259', marginTop: 1, lineHeight: 1.3 }}>
                  {EMPRESA.direccion} · {EMPRESA.ciudad}<br />
                  Tel: {EMPRESA.telefonos}<br />
                  {EMPRESA.correo}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ border: `1px solid ${dorado}`, color: dorado, padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: 700, marginBottom: 4, letterSpacing: '0.5px' }}>
                {venta.tipo === 'remision' ? 'REMISIÓN' : 'FACTURA DE VENTA'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: dorado }}>N.° {venta.folio}</div>
              <div style={{ fontSize: 9, color: '#6B6259', marginTop: 2, lineHeight: 1.3 }}>
                Fecha: {fechaUTC.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })}
              </div>
              <div style={{ fontSize: 9, color: '#6B6259', lineHeight: 1.3 }}>
                Hora: {fechaUTC.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
              </div>
            </div>
          </div>

          {/* Datos del cliente y de la venta - agrupados por tipo, en celdas encerradas */}
          <div style={{ marginBottom: 8 }}>
            <div style={tituloCaja}>Datos del cliente</div>

            {/* Grupo 1: identidad y contacto del cliente - fila de 3 columnas + fila de 2 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: `1px solid #D9C7A3`, borderBottom: 'none' }}>
              <div style={{ ...casillaEncerrada, borderRight: '1px solid #D9C7A3', borderBottom: 'none' }}><span style={etiquetaDato}>Cliente: </span><b>{venta.cliente_nombre}</b></div>
              <div style={{ ...casillaEncerrada, borderRight: '1px solid #D9C7A3', borderBottom: 'none' }}><span style={etiquetaDato}>Cédula/NIT: </span><b>{clienteInfo?.cedula_nit || '—'}</b></div>
              <div style={{ ...casillaEncerrada, borderBottom: 'none' }}><span style={etiquetaDato}>Teléfono: </span><b>{clienteInfo?.telefono || '—'}</b></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid #D9C7A3` }}>
              <div style={{ ...casillaEncerrada, borderRight: '1px solid #D9C7A3', borderBottom: 'none' }}><span style={etiquetaDato}>Dirección: </span><b>{clienteInfo?.direccion || '—'}</b></div>
              <div style={{ ...casillaEncerrada, borderBottom: 'none' }}><span style={etiquetaDato}>Encargado: </span><b>{clienteInfo?.encargado || '—'}</b></div>
            </div>

            {/* Grupo 2: datos propios de esta venta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: `1px solid #D9C7A3`, borderTop: 'none', borderLeft: 'none', marginTop: 5 }}>
              <div style={{ ...casillaEncerrada, borderTop: '1px solid #D9C7A3', borderLeft: '1px solid #D9C7A3' }}><span style={etiquetaDato}>Estado: </span><b>{venta.estado?.toUpperCase()}</b></div>
              {venta.vendedor && <div style={{ ...casillaEncerrada, borderTop: '1px solid #D9C7A3' }}><span style={etiquetaDato}>Vendedor: </span><b>{venta.vendedor}</b></div>}
              {venta.fecha_vencimiento && <div style={{ ...casillaEncerrada, borderTop: '1px solid #D9C7A3' }}><span style={etiquetaDato}>Vence: </span><b>{venta.fecha_vencimiento}</b></div>}
            </div>
          </div>

          {venta.observaciones && (
            <div style={{ ...cajaBase, marginBottom: 8, background: '#F7F1E0' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: dorado, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Observaciones</div>
              <div style={{ fontSize: 10.5 }}>{venta.observaciones}</div>
            </div>
          )}

          {/* Tabla de productos */}
          <div style={{ border: '1px solid #D9C7A3', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: dorado, color: '#fff' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, letterSpacing: '0.4px' }}>CÓDIGO</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, letterSpacing: '0.4px' }}>PRODUCTO</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 9, letterSpacing: '0.4px' }}>CANT.</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 9, letterSpacing: '0.4px' }}>UNIDAD</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 9, letterSpacing: '0.4px' }}>PRECIO UNIT.</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 9, letterSpacing: '0.4px' }}>SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 8, textAlign: 'center', color: '#9A8E85' }}>Cargando productos...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 8, textAlign: 'center', color: '#9A8E85' }}>Sin productos registrados</td></tr>
                ) : (
                  items.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F7F1E0' }}>
                      <td style={{ padding: '3px 8px', fontFamily: "'Courier New', monospace", fontSize: 9.5, borderBottom: '1px solid #F0EAE2' }}>{item.codigo_producto}</td>
                      <td style={{ padding: '3px 8px', fontWeight: 500, borderBottom: '1px solid #F0EAE2' }}>{item.nombre_producto}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', borderBottom: '1px solid #F0EAE2' }}>{item.cantidad}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', borderBottom: '1px solid #F0EAE2' }}>{item.unidad}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: "'Courier New', monospace", borderBottom: '1px solid #F0EAE2' }}>${item.precio_unitario?.toLocaleString()}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: "'Courier New', monospace", fontWeight: 600, borderBottom: '1px solid #F0EAE2' }}>${item.subtotal?.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && items.length > 0 && (
            <div style={{ textAlign: 'right', fontSize: 9, color: '#6B6259', marginBottom: 8 }}>
              Total ítems: {items.length} · Total unidades: {totalUnidades}
            </div>
          )}

          {/* Condiciones de pago + Totales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={cajaBase}>
              <div style={tituloCaja}>Condiciones de pago</div>
              {venta.metodo_pago
                ? <div style={casilla}><span style={etiquetaDato}>Forma de pago: </span><b>{venta.metodo_pago}</b></div>
                : <div style={{ fontSize: 10, color: '#9A8E85' }}>No registra</div>}
              {venta.tipo_cuenta && <div style={casilla}><span style={etiquetaDato}>Cuenta: </span><b>{cuentas[venta.tipo_cuenta]}</b></div>}
            </div>
            <div style={{ ...cajaBase, borderColor: dorado }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10.5 }}>
                <span style={etiquetaDato}>Subtotal</span>
                <span style={{ fontFamily: "'Courier New', monospace" }}>${venta.subtotal?.toLocaleString()}</span>
              </div>
              {venta.descuento > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10.5, color: dorado }}>
                  <span>Descuento</span>
                  <span style={{ fontFamily: "'Courier New', monospace" }}>-${venta.descuento?.toLocaleString()}</span>
                </div>
              )}
              {venta.iva > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10.5 }}>
                  <span style={etiquetaDato}>IVA 19%</span>
                  <span style={{ fontFamily: "'Courier New', monospace" }}>${venta.iva?.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 13, fontWeight: 700, borderTop: `1px solid ${dorado}`, marginTop: 3 }}>
                <span style={{ color: dorado }}>TOTAL</span>
                <span style={{ fontFamily: "'Courier New', monospace", color: dorado }}>${venta.total?.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Firmas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 9, color: '#444' }}>
                Firma y sello emisor<br/>
                <span style={{ fontWeight: 600 }}>{EMPRESA.nombre}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 9, color: '#444' }}>
                Recibí conforme<br/>
                <span style={{ fontWeight: 600 }}>{venta.cliente_nombre}</span>
              </div>
            </div>
          </div>

          {/* Pie */}
          <div style={{ textAlign: 'center', borderTop: '1px solid #E8DCC0', paddingTop: 6, fontSize: 9, color: '#6B6259' }}>
            <div style={{ fontWeight: 700, color: dorado, marginBottom: 2, fontSize: 10.5 }}>¡Gracias por su compra!</div>
            <div>Su confianza nos motiva a seguir mejorando. ¡Lo esperamos pronto!</div>
            <div style={{ marginTop: 3, letterSpacing: '0.3px' }}>{EMPRESA.telefonos} · {EMPRESA.correo}</div>
          </div>
        </div>
      </div>
    </div>
  )
}