export const NOTIFICATION_SOUND_URL = 'https://ik.imagekit.io/w2lf8dznx/notification'
export const REMINDER_SOUND_URL = 'https://ik.imagekit.io/w2lf8dznx/reminder'
export const NOTIFICATION_SOUND_FALLBACK = '/notification.mp3'
export const REMINDER_SOUND_FALLBACK = '/reminder.mp3'

const PLAY_DEBOUNCE_MS = 800

const players = {
  notification: { audio: null, url: NOTIFICATION_SOUND_URL, fallback: NOTIFICATION_SOUND_FALLBACK },
  reminder: { audio: null, url: REMINDER_SOUND_URL, fallback: REMINDER_SOUND_FALLBACK },
}

let lastPlayedAt = 0

function createAudio(src) {
  const next = new Audio(src)
  next.preload = 'auto'
  return next
}

function getAudio(kind) {
  if (typeof window === 'undefined') return null
  const player = players[kind] || players.notification
  if (!player.audio) {
    player.audio = createAudio(player.url)
    player.audio.addEventListener('error', () => {
      if (player.audio?.src?.includes('imagekit.io')) {
        player.audio = createAudio(player.fallback)
      }
    })
  }
  return player.audio
}

function nestedData(source) {
  if (!source || typeof source !== 'object') return {}
  return source.data && typeof source.data === 'object' ? source.data : {}
}

export function isReminderNotification(source = {}) {
  if (!source || typeof source !== 'object') return false
  if (source.kind === 'reminder') return true
  const data = nestedData(source)
  const category = String(
    source.notificationType
    || (source.type && source.type !== 'mmspro-notification' ? source.type : '')
    || data.type
    || '',
  ).toLowerCase()
  const title = String(
    source.title
    || source.notification?.title
    || data.title
    || '',
  ).toLowerCase()
  const sound = String(source.sound || data.sound || '').toLowerCase()
  return category.includes('reminder') || title.includes('reminder') || sound.includes('/reminder')
}

function unlockKind(kind) {
  const instance = getAudio(kind)
  if (!instance) return
  const play = instance.play()
  if (play?.then) {
    play.then(() => {
      instance.pause()
      instance.currentTime = 0
    }).catch(() => {})
  }
}

/** Call once after a user gesture so later plays are not blocked by autoplay rules. */
export function unlockNotificationSound() {
  unlockKind('notification')
  unlockKind('reminder')
}

export function playNotificationSound(source) {
  const kind = isReminderNotification(source) ? 'reminder' : 'notification'
  const instance = getAudio(kind)
  if (!instance) return
  const now = Date.now()
  if (now - lastPlayedAt < PLAY_DEBOUNCE_MS) return
  lastPlayedAt = now
  instance.currentTime = 0
  const play = instance.play()
  if (play?.catch) play.catch(() => {})
}
