/**
 * Browser Text-to-Speech wrapper. Replace this module to swap voice providers.
 */

const FEMALE_VOICE_HINTS = [
  'samantha',
  'karen',
  'victoria',
  'moira',
  'tessa',
  'fiona',
  'kate',
  'serena',
  'aria',
  'jenny',
  'zira',
  'google uk english female',
  'microsoft zira',
  'microsoft aria',
  'female',
]

const DEFAULT_RATE = 0.98
const DEFAULT_PITCH = 0.96
const FIELD_PAUSE_MS = 420
const SECTION_PAUSE_MS = 650
const TASK_PAUSE_MS = 900

function getSynth() {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis || null
}

function readVoices() {
  return getSynth()?.getVoices() || []
}

function isFemaleVoice(voice) {
  const name = voice.name.toLowerCase()
  if (/male|man\b|boy|daniel|david|james|fred|ralph|bruce/i.test(name)) return false
  if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) return true
  return /female|woman|girl/i.test(name)
}

function pickFemaleVoice({ preferLocal = true } = {}) {
  const voices = readVoices()
  if (!voices.length) return null

  const english = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'))
  const pools = []

  if (preferLocal) {
    const localEnglish = english.filter((voice) => voice.localService === true)
    if (localEnglish.length) pools.push(localEnglish)
  }
  if (english.length) pools.push(english)
  pools.push(voices)

  for (const pool of pools) {
    for (const hint of FEMALE_VOICE_HINTS) {
      const match = pool.find((voice) => voice.name.toLowerCase().includes(hint))
      if (match) return match
    }
    const female = pool.find(isFemaleVoice)
    if (female) return female
  }

  return null
}

function pauseMsForSegment(segment) {
  if (segment.pauseAfter === 'task') return TASK_PAUSE_MS
  if (segment.pauseAfter === 'section') return SECTION_PAUSE_MS
  if (segment.pauseAfter === 'field') return FIELD_PAUSE_MS
  if (typeof segment.pauseAfter === 'number') return segment.pauseAfter
  return FIELD_PAUSE_MS
}

function normalizeSpeechQueue(segments) {
  return (segments || []).map((segment, index) => {
    const text = typeof segment === 'string' ? segment : segment.text
    if (!text?.trim()) return null
    return {
      text: text.trim(),
      pauseAfter: pauseMsForSegment(segment || {}),
      scriptIndex: index,
      taskId: segment.taskId,
    }
  }).filter(Boolean)
}

export function scriptToSpeechText(segments) {
  return normalizeSpeechQueue(segments).map((item) => item.text).join(' ')
}

export function getSpeechBlockReason() {
  if (typeof window === 'undefined') return 'Voice is not available during server rendering.'
  if (!window.speechSynthesis) return 'Voice playback is not supported in this browser.'
  if (!window.isSecureContext) {
    return 'Voice requires a secure page. Use http://localhost:5173 (not a network IP like 192.168.x.x).'
  }
  return null
}

export class TextToSpeechService {
  constructor() {
    this.onStateChange = null
    this.onSegmentChange = null
    this.isPaused = false
    this.isActive = false
    this.retryTimer = null
    this.keepAliveTimer = null
    this.gapTimer = null
    this.queue = []
    this.queueIndex = 0
    this.startedOnce = false
    this.useFemaleVoice = true
    this.selectedVoice = null
    this.waitingForResume = false
    this.onEnd = null
    this.onError = null

    const synth = getSynth()
    if (synth) {
      synth.addEventListener('voiceschanged', () => synth.getVoices())
      synth.getVoices()
    }
  }

  static isSupported() {
    return !getSpeechBlockReason()
  }

  clearRetryTimer() {
    if (this.retryTimer) {
      window.clearInterval(this.retryTimer)
      this.retryTimer = null
    }
  }

  clearKeepAliveTimer() {
    if (this.keepAliveTimer) {
      window.clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  clearGapTimer() {
    if (this.gapTimer) {
      window.clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
  }

  resolveVoice() {
    if (!this.useFemaleVoice) return null
    if (this.selectedVoice) return this.selectedVoice
    this.selectedVoice = pickFemaleVoice({ preferLocal: true })
      || pickFemaleVoice({ preferLocal: false })
    return this.selectedVoice
  }

  createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = DEFAULT_RATE
    utterance.pitch = DEFAULT_PITCH
    utterance.volume = 1
    utterance.lang = 'en-US'
    const voice = this.resolveVoice()
    if (voice) utterance.voice = voice
    return utterance
  }

  finishPlayback(onEnd) {
    this.isActive = false
    this.clearRetryTimer()
    this.clearKeepAliveTimer()
    this.clearGapTimer()
    this.onStateChange?.('idle')
    onEnd?.()
  }

  scheduleNextSegment() {
    if (!this.isActive || this.queueIndex >= this.queue.length) {
      this.finishPlayback(this.onEnd)
      return
    }

    const pauseMs = this.queue[this.queueIndex - 1]?.pauseAfter ?? 0
    this.clearGapTimer()
    this.gapTimer = window.setTimeout(() => {
      this.gapTimer = null
      if (!this.isActive) return
      if (this.isPaused) {
        this.waitingForResume = true
        return
      }
      this.speakCurrentSegment()
    }, pauseMs)
  }

  speakCurrentSegment() {
    const synth = getSynth()
    if (!synth || !this.isActive || this.queueIndex >= this.queue.length) {
      this.finishPlayback(this.onEnd)
      return
    }

    const item = this.queue[this.queueIndex]
    const utterance = this.createUtterance(item.text)

    utterance.onstart = () => {
      if (!this.startedOnce) {
        this.startedOnce = true
        this.clearRetryTimer()
        this.clearKeepAliveTimer()
        this.keepAliveTimer = window.setInterval(() => {
          if (!this.isActive || this.isPaused) return
          if (synth.speaking || synth.pending) synth.resume()
        }, 8000)
      }
      this.onStateChange?.('playing')
      this.onSegmentChange?.(item.scriptIndex)
    }

    utterance.onend = () => {
      if (!this.isActive || this.isPaused) return
      this.queueIndex += 1
      if (this.queueIndex >= this.queue.length) {
        this.finishPlayback(this.onEnd)
        return
      }
      this.scheduleNextSegment()
    }

    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return
      if (!this.startedOnce && this.useFemaleVoice) {
        this.useFemaleVoice = false
        this.selectedVoice = null
        this.speakCurrentSegment()
        return
      }
      if (this.startedOnce) return
      this.isActive = false
      this.clearRetryTimer()
      this.clearKeepAliveTimer()
      this.clearGapTimer()
      this.onStateChange?.('error')
      this.onError?.(event)
    }

    synth.resume()
    synth.getVoices()
    synth.speak(utterance)
  }

  stop() {
    this.isActive = false
    this.isPaused = false
    this.waitingForResume = false
    this.queue = []
    this.queueIndex = 0
    this.startedOnce = false
    this.selectedVoice = null
    this.clearRetryTimer()
    this.clearKeepAliveTimer()
    this.clearGapTimer()
    getSynth()?.cancel()
    this.onStateChange?.('idle')
    this.onSegmentChange?.(-1)
  }

  speakFromUserGesture(segments, { onEnd, onError } = {}) {
    const blockReason = getSpeechBlockReason()
    if (blockReason) return { ok: false, reason: blockReason }

    const synth = getSynth()
    const queue = normalizeSpeechQueue(segments)
    if (!queue.length) return { ok: false, reason: 'Nothing to read for this period.' }

    this.stop()
    this.isActive = true
    this.isPaused = false
    this.useFemaleVoice = true
    this.selectedVoice = null
    this.queue = queue
    this.queueIndex = 0
    this.startedOnce = false
    this.onEnd = onEnd
    this.onError = onError

    let attempts = 0
    const maxAttempts = 30

    this.speakCurrentSegment()

    this.retryTimer = window.setInterval(() => {
      attempts += 1
      if (this.startedOnce) {
        this.clearRetryTimer()
        return
      }
      if (attempts >= maxAttempts) {
        this.clearRetryTimer()
        this.isActive = false
        synth?.cancel()
        this.onStateChange?.('error')
        this.onError?.({ error: 'not-started' })
        return
      }
      synth?.pause()
      synth?.resume()
      if (!synth?.speaking && !synth?.pending) {
        this.speakCurrentSegment()
      }
    }, 200)

    return { ok: true }
  }

  pause() {
    if (!this.isActive || this.isPaused) return
    this.isPaused = true
    this.clearRetryTimer()
    this.clearGapTimer()
    getSynth()?.pause()
    this.onStateChange?.('paused')
  }

  resume() {
    if (!this.isActive || !this.isPaused) return
    this.isPaused = false
    if (this.waitingForResume) {
      this.waitingForResume = false
      this.speakCurrentSegment()
      this.onStateChange?.('playing')
      return
    }
    getSynth()?.resume()
    this.onStateChange?.('playing')
  }
}

export const textToSpeech = new TextToSpeechService()
