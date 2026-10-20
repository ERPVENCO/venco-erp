// Palabra de activación tolerante: "Hey Veya" / "Hey Ema".
// El reconocedor de voz escribe mal los nombres propios ("veta", "beta", "bella", "vera"…),
// así que en vez de una lista fija se aceptan palabras que SUENAN parecido.

const NOMBRES = ['veya', 'ema']

// Si tu micrófono escribe siempre otra variante, agrégala aquí (en minúsculas y sin tildes).
const VARIANTES_EXTRA = []

// Palabras comunes que se parecen a "ema" y no deben despertarla
const EXCLUIR = new Set(['ella', 'era', 'eres', 'esa', 'ese', 'eso', 'ama', 'dame', 'tema'])

// Saludos "fuertes" permiten nombres parecidos; los débiles (hola, hay, ay, eh) exigen el nombre exacto.
const FUERTES = new Set(['hey', 'ey', 'ei', 'hei', 'oye'])
const SALUDOS = /\b(hey|ey|ei|hei|oye|hola|hay|ay|eh)[\s,.:;-]+([a-z]{2,7})\b[\s,.:;-]*/g

// Escribe la palabra como suena: "bella" → "veya", "beta" → "veta"
const fonetica = (w) => w.replace(/ll/g, 'y').replace(/[bw]/g, 'v').replace(/h/g, '')

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return d[a.length][b.length]
}

function esNombre(palabra, saludoFuerte) {
  if (EXCLUIR.has(palabra)) return false
  if (NOMBRES.includes(palabra) || VARIANTES_EXTRA.includes(palabra)) return true
  if (!saludoFuerte) return false
  const f = fonetica(palabra)
  return NOMBRES.some((n) => distancia(f, n) <= 1)
}

// norm = frase sin tildes y en minúsculas. Devuelve { index, largo } o null.
export function buscarWake(norm) {
  for (const m of norm.matchAll(SALUDOS)) {
    if (esNombre(m[2], FUERTES.has(m[1]))) return { index: m.index, largo: m[0].length }
  }
  return null
}
