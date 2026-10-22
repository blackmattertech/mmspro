import './PlaceholderPage.css'

export default function OrgUnavailable() {
  return (
    <div className="placeholder-page">
      <h1 className="placeholder-page__title">No modules enabled</h1>
      <p className="placeholder-page__text">
        This organization has no modules enabled. Contact your administrator.
      </p>
    </div>
  )
}
