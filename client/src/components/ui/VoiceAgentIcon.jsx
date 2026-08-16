import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { assetUrl } from '../../lib/assets'
import './VoiceAgentIcon.css'

const ORB_LOTTIE_SRC = assetUrl('Assets/orb.lottie')

export default function VoiceAgentIcon({ active = false, size = 22 }) {
  return (
    <span
      className={`voice-agent-icon${active ? ' voice-agent-icon--active' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <DotLottieReact
        className="voice-agent-icon__orb"
        src={ORB_LOTTIE_SRC}
        loop
        autoplay
      />
    </span>
  )
}
