import { useId } from 'react'
import './GooToggle.css'

export default function GooToggle({ checked, onChange, disabled = false, ariaLabel }) {
  const filterId = `goo-${useId().replace(/:/g, '')}`

  return (
    <div className="goo-toggle-container">
      <input
        type="checkbox"
        className="goo-toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 292 142" className="goo-toggle" aria-hidden="true">
        <path
          d="M71 142C31.7878 142 0 110.212 0 71C0 31.7878 31.7878 0 71 0C110.212 0 119 30 146 30C173 30 182 0 221 0C260 0 292 31.7878 292 71C292 110.212 260.212 142 221 142C181.788 142 173 112 146 112C119 112 110.212 142 71 142Z"
          className="goo-toggle-background"
        />
        <rect rx="6" height="64" width="12" y="39" x="64" className="goo-toggle-icon goo-toggle-icon--on" />
        <path
          d="M221 91C232.046 91 241 82.0457 241 71C241 59.9543 232.046 51 221 51C209.954 51 201 59.9543 201 71C201 82.0457 209.954 91 221 91ZM221 103C238.673 103 253 88.6731 253 71C253 53.3269 238.673 39 221 39C203.327 39 189 53.3269 189 71C189 88.6731 203.327 103 221 103Z"
          fillRule="evenodd"
          className="goo-toggle-icon goo-toggle-icon--off"
        />
        <g filter={`url(#${filterId})`}>
          <rect fill="#fff" rx="29" height="58" width="116" y="42" x="13" className="goo-toggle-circle-center" />
          <rect fill="#fff" rx="58" height="114" width="114" y="14" x="14" className="goo-toggle-circle goo-toggle-circle--left" />
          <rect fill="#fff" rx="58" height="114" width="114" y="14" x="164" className="goo-toggle-circle goo-toggle-circle--right" />
        </g>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="10" result="blur" in="SourceGraphic" />
            <feColorMatrix
              result="goo"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              mode="matrix"
              in="blur"
            />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
