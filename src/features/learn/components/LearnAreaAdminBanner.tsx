type LearnAreaAdminBannerProps = {
  text: string
}

export function LearnAreaAdminBanner(props: LearnAreaAdminBannerProps) {
  const trimmed = props.text.trim()
  if (!trimmed) {
    return null
  }

  return (
    <div className="learn-area-admin-banner" role="status" aria-live="polite">
      <span className="learn-area-admin-banner-accent" aria-hidden="true" />
      <p className="learn-area-admin-banner-text">{trimmed}</p>
    </div>
  )
}
