let audioContext = null

function getAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioContext = new Ctx()
  }
  return audioContext
}

export function playErrorSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'square'
    osc2.type = 'square'
    osc1.frequency.setValueAtTime(280, now)
    osc1.frequency.exponentialRampToValueAtTime(180, now + 0.12)
    osc2.frequency.setValueAtTime(140, now + 0.14)
    osc2.frequency.exponentialRampToValueAtTime(90, now + 0.32)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.16)
    osc2.start(now + 0.14)
    osc2.stop(now + 0.45)
  } catch {
    // Audio not available — fail silently
  }
}
