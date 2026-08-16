import { Link, useNavigate } from 'react-router-dom'
import './PageBack.css'

export const BACK_ICON_URL = 'https://ik.imagekit.io/w2lf8dznx/icons/arrow-left2-outline.svg'

function BackIcon() {
  return (
    <span
      className="page-back__icon"
      style={{
        WebkitMaskImage: `url("${BACK_ICON_URL}")`,
        maskImage: `url("${BACK_ICON_URL}")`,
      }}
      aria-hidden="true"
    />
  )
}

export default function PageBack({
  to,
  onClick,
  label = 'Back',
  className = '',
  hideLabel = false,
}) {
  const navigate = useNavigate()
  const rootClass = `page-back ${hideLabel ? 'page-back--icon-only' : ''} ${className}`.trim()

  const goBack = (event) => {
    if (onClick) {
      onClick(event)
      return
    }
    if (to) {
      navigate(to)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    }
  }

  const content = (
    <>
      <BackIcon />
      {!hideLabel && <span className="page-back__label">{label}</span>}
    </>
  )

  if (to && !onClick) {
    return (
      <Link to={to} className={rootClass} aria-label={label}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={rootClass} onClick={goBack} aria-label={label}>
      {content}
    </button>
  )
}
