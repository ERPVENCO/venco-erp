// src/EscanerCodigoBarras.jsx
//
// Modal que activa la cámara del dispositivo y decodifica un código de
// barras en vivo usando html5-qrcode. Al detectar uno, llama a
// onDetectado(codigo) una sola vez y el padre se encarga de cerrar el modal.
//
// Nota técnica: en desarrollo, React monta/desmonta el efecto dos veces
// seguidas para detectar bugs (Strict Mode). Como abrir la cámara es una
// operación async y "cara", se usan refs (que sí persisten entre esos dos
// montajes fantasma) para asegurar que la cámara se cree y arranque UNA
// sola vez, y solo se detenga cuando el componente de verdad se cierra.
import { useEffect, useRef, useState, useId } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function EscanerCodigoBarras({ onDetectado, onCerrar }) {
  const contenedorId = `lector-codigo-barras-${useId().replace(/:/g, '')}`
  const scannerRef = useRef(null)
  const detectadoRef = useRef(false)
  const iniciandoRef = useRef(false)   // ya se llamó a start()
  const iniciadoRef = useRef(false)    // start() ya resolvió con éxito
  const debeDetenerRef = useRef(false) // se pidió cerrar antes de que start() resolviera
  const [error, setError] = useState('')

  useEffect(() => {
    debeDetenerRef.current = false // cancela cualquier intención de cierre del montaje fantasma anterior

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(contenedorId)
    }
    const scanner = scannerRef.current

    if (!iniciandoRef.current) {
      iniciandoRef.current = true
      scanner.start(
        { facingMode: 'environment' }, // cámara trasera si existe (celular)
        {
          fps: 10,
          qrbox: { width: 280, height: 180 },
          // Usa el detector nativo del navegador cuando esté disponible —
          // mucho más confiable para códigos de barras 1D (EAN, UPC, Code128)
          // que el decodificador en JS puro, que rinde mejor con QR.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (decodedText) => {
          if (detectadoRef.current) return
          detectadoRef.current = true
          onDetectado(decodedText)
        },
        () => {} // se dispara en cada frame sin lectura — normal mientras enfoca, se ignora
      ).then(() => {
        iniciadoRef.current = true
        if (debeDetenerRef.current) {
          // el componente ya se cerró de verdad mientras la cámara arrancaba
          scanner.stop().then(() => scanner.clear()).catch(() => {})
        }
      }).catch((err) => {
        setError('No se pudo acceder a la cámara. Revisa los permisos del navegador. (' + err + ')')
      })
    }

    return () => {
      debeDetenerRef.current = true
      if (iniciadoRef.current) {
        scanner.stop().then(() => scanner.clear()).catch(() => {})
      }
    }
  }, [])

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 380, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📷 Escanear código de barras</div>
          <span onClick={onCerrar} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
        </div>
        <div id={contenedorId} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#B22222' }}>{error}</div>}
        <div style={{ marginTop: 10, fontSize: 11, color: '#9A8E85', textAlign: 'center' }}>
          Apunta la cámara al código de barras — se llena solo al detectarlo
        </div>
      </div>
    </div>
  )
}