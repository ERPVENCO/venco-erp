import { useState, useEffect } from 'react'

// Botón discreto que aparece solo cuando el navegador permite instalar la PWA
// (Android/Chrome disparan beforeinstallprompt; iOS/Safari no lo soporta,
// ahí el empleado usa "Compartir" > "Agregar a inicio" manualmente)
export default function InstalarApp() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [instalado, setInstalado] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setPromptEvent(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => setInstalado(true))

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!promptEvent || instalado) return null

  const instalar = async () => {
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setInstalado(true)
    setPromptEvent(null)
  }

  return (
    <div
      onClick={instalar}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 10px', margin: '0 10px 10px',
        background: '#B22222', borderRadius: 7,
        color: '#fff', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', textAlign: 'center', justifyContent: 'center'
      }}
    >
      📲 Instalar app
    </div>
  )
}
