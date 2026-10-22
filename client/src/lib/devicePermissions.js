const CAMERA_KEY = 'mmspro-camera-permission'

export function notificationsSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && typeof Notification !== 'undefined'
}

export function cameraSupported() {
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
  return typeof window !== 'undefined'
    && window.isSecureContext
    && Boolean(devices && typeof devices.getUserMedia === 'function')
}

export function notificationPermissionState() {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

function rememberCamera(state) {
  try {
    localStorage.setItem(CAMERA_KEY, state)
  } catch {
    // ignore storage errors
  }
}

function rememberedCamera() {
  try {
    const value = localStorage.getItem(CAMERA_KEY)
    if (value === 'granted' || value === 'denied' || value === 'unsupported') return value
  } catch {
    // ignore storage errors
  }
  return null
}

async function queryCameraPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null
  try {
    const status = await navigator.permissions.query({ name: 'camera' })
    if (status?.state === 'granted' || status?.state === 'denied' || status?.state === 'prompt') {
      return status.state
    }
  } catch {
    // Safari rejects camera permission queries.
  }
  return null
}

export async function cameraPermissionState() {
  if (!cameraSupported()) return 'unsupported'
  const queried = await queryCameraPermission()
  if (queried === 'granted' || queried === 'denied') {
    rememberCamera(queried)
    return queried
  }
  if (rememberedCamera() === 'unsupported') return 'unsupported'
  if (queried === 'prompt') return 'prompt'
  return rememberedCamera() || 'prompt'
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop())
}

async function openCameraStream() {
  const devices = navigator.mediaDevices
  const attempts = [
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ]
  let lastError = null
  for (const constraints of attempts) {
    try {
      return await devices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') throw err
    }
  }
  throw lastError || new Error('Could not start the camera.')
}

export async function requestCameraAccess() {
  if (!cameraSupported()) return 'unsupported'
  try {
    const stream = await openCameraStream()
    stopStream(stream)
    rememberCamera('granted')
    return 'granted'
  } catch (err) {
    const queried = await queryCameraPermission()
    if (queried === 'granted') {
      rememberCamera('granted')
      return 'granted'
    }
    if (queried === 'denied') {
      rememberCamera('denied')
      return 'denied'
    }
    if (queried === 'prompt') return 'prompt'
    const name = err?.name || ''
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      rememberCamera('unsupported')
      return 'unsupported'
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      rememberCamera('denied')
      return 'denied'
    }
    return 'prompt'
  }
}
