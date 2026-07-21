import { INFO_BUTTON_ICON_SRC } from '../../lib/infoIcon'

export default function WorkRequestSectionHead({ id, title, description }) {
  return (
    <div className="wr-section__head" id={id}>
      <div className="wr-section__title-row">
        <h2 className="wo-section__title">{title}</h2>
        {description ? (
          <button
            type="button"
            className="wr-section__info asset-field-info"
            aria-label={`About ${title}`}
          >
            <img
              src={INFO_BUTTON_ICON_SRC}
              alt=""
              className="asset-field-info__icon"
              width={16}
              height={16}
            />
            <span className="asset-field-info__tooltip" role="tooltip">
              {description}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
