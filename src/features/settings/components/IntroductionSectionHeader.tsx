import { USER_INTRODUCTION_SUBTITLE } from '../../auth/constants/userIntroduction'

type IntroductionSectionHeaderProps = {
  /** false im Mobile-Sheet — Titel steht bereits in der Sheet-Kopfzeile. */
  showTitle?: boolean
  subtitle?: string
}

export function IntroductionSectionHeader({
  showTitle = true,
  subtitle = USER_INTRODUCTION_SUBTITLE,
}: IntroductionSectionHeaderProps) {
  return (
    <header className="introduction-section-header">
      {showTitle ? <h2 className="introduction-section-title">Einführung</h2> : null}
      <p className="introduction-section-subtitle">{subtitle}</p>
    </header>
  )
}
