import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Mapa real (OpenStreetMap). Dibuja:
//  - zonas pintadas (departamentos, municipios o barrios) si existe el archivo GeoJSON correspondiente
//  - círculos: tamaño = ventas, color = cumplimiento de meta (o crecimiento si no hay meta)
// Se carga solo cuando se abre "Ventas por ubicación" (lazy), para no pesar en el resto de Reportes.

const claveNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const nombreGeo = (f, claves) => {
  const p = f.properties || {}
  for (const k of claves) if (p[k]) return String(p[k])
  const k2 = Object.keys(p).find((k) => typeof p[k] === 'string' && p[k])
  return k2 ? p[k2] : ''
}

const esAntioquia = (f) => {
  const p = f.properties || {}
  const cod = p.DPTO_CCDGO ?? p.dpto_ccdgo ?? p.DPTO
  if (cod != null) return String(cod).padStart(2, '0') === '05'
  const n = p.DPTO_CNMBR || p.dpto_cnmbr
  return n ? claveNorm(n) === 'ANTIOQUIA' : true
}

const VISTAS = {
  colombia: { centro: [4.6, -74.1], zoom: 5 },
  antioquia: { centro: [6.7, -75.5], zoom: 8 },
  medellin: { centro: [6.2442, -75.5812], zoom: 12 },
  combinado: { centro: [6.5, -75.4], zoom: 8 },
}

const limpia = (t) => String(t).replace(/[<>&]/g, '')

export default function MapaVentas({ nivel, puntos, geo, claves, valores }) {
  const v = VISTAS[nivel] || VISTAS.colombia
  const features = geo && geo.features ? (nivel === 'antioquia' ? geo.features.filter(esAntioquia) : geo.features) : null
  const data = features ? { type: 'FeatureCollection', features } : null
  const firma = Object.values(valores || {}).map((x) => x.t.toFixed(2)).join(',')

  return (
    <MapContainer key={nivel} center={v.centro} zoom={v.zoom} scrollWheelZoom style={{ height: '100%', width: '100%', borderRadius: 12 }}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {data && (
        <GeoJSON
          key={nivel + '-' + data.features.length + '-' + firma}
          data={data}
          style={(f) => {
            const x = valores[claveNorm(nombreGeo(f, claves))]
            return x
              ? { color: '#8a6d00', weight: 1, fillColor: '#B22222', fillOpacity: 0.15 + 0.6 * x.t }
              : { color: '#999', weight: 0.6, fillColor: '#bbb', fillOpacity: 0.08 }
          }}
          onEachFeature={(f, layer) => {
            const nombre = nombreGeo(f, claves)
            const x = valores[claveNorm(nombre)]
            layer.bindTooltip(`<b>${limpia(nombre)}</b>${x ? '<br/>' + x.tip.map(limpia).join('<br/>') : '<br/>Sin ventas'}`, { sticky: true })
          }}
        />
      )}
      {puntos.map((p, i) => (
        <CircleMarker key={p.name + i} center={[p.lat, p.lng]} radius={p.radio} pathOptions={{ color: '#333', weight: 1, fillColor: p.color, fillOpacity: 0.75 }}>
          <Tooltip>
            <b>{p.name}</b>
            {p.tip.map((l, k) => <div key={k}>{l}</div>)}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
