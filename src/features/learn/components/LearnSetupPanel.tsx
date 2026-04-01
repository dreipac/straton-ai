import deleteIcon from '../../../assets/icons/delete.svg'
import fileIcon from '../../../assets/icons/file.svg'
import setupPng from '../../../assets/png/setup.png'
import starIcon from '../../../assets/icons/star.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { UploadedMaterial } from '../services/learn.persistence'
import { getMaterialTypeBadge } from '../utils/learnPageHelpers'

export type LearnSetupPanelProps = {
  setupStep: 1 | 2 | 3 | 4
  isAnalyzingSetupTopic: boolean
  setupAnalysisPercentClamped: number
  setupAnalysisArcRadius: number
  setupAnalysisArcLength: number
  setupAnalysisCircumference: number
  setupAnalysisArcOffset: number
  materials: UploadedMaterial[]
  isUploading: boolean
  effectiveTopic: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  aiGuidance: string
  onFilesChange: (files: FileList | null) => void
  onRemoveMaterial: (materialId: string) => void
  onContinueStepOne: () => void
  onContinueStepTwo: () => void
  onContinueStepThree: () => void
  onFinishSetup: () => void
  onBackToStep1: () => void
  onBackToStep2: () => void
  onBackToStep3: () => void
  onAiGuidanceChange: (value: string) => void
  onSelectProficiency: (level: 'low' | 'medium' | 'high') => void
}

export function LearnSetupPanel(props: LearnSetupPanelProps) {
  const {
    setupStep,
    isAnalyzingSetupTopic,
    setupAnalysisPercentClamped,
    setupAnalysisArcRadius,
    setupAnalysisArcLength,
    setupAnalysisCircumference,
    setupAnalysisArcOffset,
    materials,
    isUploading,
    effectiveTopic,
    proficiencyLevel,
    aiGuidance,
    onFilesChange,
    onRemoveMaterial,
    onContinueStepOne,
    onContinueStepTwo,
    onContinueStepThree,
    onFinishSetup,
    onBackToStep1,
    onBackToStep2,
    onBackToStep3,
    onAiGuidanceChange,
    onSelectProficiency,
  } = props

  return (
    <section className="learn-setup-standalone">
      <div className={`learn-setup-flow ${setupStep === 1 ? 'is-topic-step' : ''}`}>
        <div className="learn-setup-heading">
          <h3>Einrichtung</h3>
        </div>
        {setupStep === 1 ? (
          <div className="learn-setup-step">
            {isAnalyzingSetupTopic ? (
              <section className="learn-setup-analysis" aria-live="polite" aria-label="Dateianalyse">
                <div className="learn-setup-analysis-ring">
                  <svg className="learn-setup-analysis-ring-svg" width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                    <g transform="rotate(-130 52 52)">
                      <circle
                        className="learn-setup-analysis-ring-track"
                        cx="52"
                        cy="52"
                        r={setupAnalysisArcRadius}
                        fill="none"
                        strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                      />
                      <circle
                        className="learn-setup-analysis-ring-progress"
                        cx="52"
                        cy="52"
                        r={setupAnalysisArcRadius}
                        fill="none"
                        strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                        strokeDashoffset={setupAnalysisArcOffset}
                      />
                    </g>
                  </svg>
                  <span className="learn-setup-analysis-percent">{setupAnalysisPercentClamped}%</span>
                </div>
                <div className="learn-topic-suggestions-loader" role="status">
                  <span className="learn-topic-loader-orbit" aria-hidden="true">
                    <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                    <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                    <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                  </span>
                  <span className="learn-topic-loader-text">Dateien werden analysiert...</span>
                </div>
              </section>
            ) : (
              <>
                <p className="learn-setup-info">
                  Lade zuerst deine Unterlagen hoch (PDF, Word, Tabellen, Text; bei{' '}
                  <strong>Fotos von Arbeitsblättern</strong> wird Text per OCR erkannt). Danach analysiert die KI die
                  Inhalte und erkennt automatisch das Thema.
                </p>
                <div className="learn-file-upload-block">
                  <input
                    id="learn-files-input"
                    type="file"
                    multiple
                    className="learn-file-upload-input-sr"
                    onChange={(event) => {
                      onFilesChange(event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />
                  {materials.length === 0 ? (
                    <label htmlFor="learn-files-input" className="learn-file-upload-zone">
                      <span className="learn-file-upload-zone-inner">
                        <strong className="learn-file-upload-title">Dateien hochladen</strong>
                        <span className="learn-file-upload-hint">Klicke in das Feld oder w\u00E4hle Dateien aus</span>
                      </span>
                    </label>
                  ) : (
                    <div className="learn-file-upload-after-list">
                      <div className="learn-materials-list">
                        {materials.map((material) => {
                          const typeBadge = getMaterialTypeBadge(material.name)
                          return (
                            <div key={material.id} className="learn-material-item">
                              <div className="learn-material-main">
                                <img className="ui-icon learn-material-file-icon" src={fileIcon} alt="" aria-hidden="true" />
                                <div className="learn-material-copy">
                                  <div className="learn-material-title-row">
                                    <p className="learn-material-name">{material.name}</p>
                                    <span className={`learn-material-type-badge learn-material-type-badge--${typeBadge.variant}`}>
                                      {typeBadge.label}
                                    </span>
                                  </div>
                                  <p className="learn-muted learn-material-meta">{Math.round(material.size / 1024)} KB</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="learn-material-remove-button"
                                onClick={() => onRemoveMaterial(material.id)}
                                aria-label={`${material.name} entfernen`}
                              >
                                <img className="ui-icon learn-material-remove-icon" src={deleteIcon} alt="" aria-hidden="true" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <label htmlFor="learn-files-input" className="learn-file-upload-add-more">
                        <span className="learn-file-upload-add-more-icon" aria-hidden="true" />
                        <span className="learn-file-upload-add-more-label">Weitere Dateien hinzuf\u00FCgen</span>
                      </label>
                    </div>
                  )}
                </div>
                {isUploading ? <p className="learn-muted">Dateien werden verarbeitet...</p> : null}
                <div className="learn-setup-actions">
                  <PrimaryButton type="button" onClick={onContinueStepOne} disabled={isUploading || materials.length === 0}>
                    Dateien analysieren
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
        ) : null}

        {setupStep === 2 ? (
          <div className="learn-setup-step">
            <label>Thema aus Datei erkannt</label>
            <p className="learn-setup-info">
              Die KI hat aus deinen Unterlagen folgendes Hauptthema erkannt. Im naechsten Schritt waehlst du dein Niveau.
            </p>
            <div className="learn-topic-suggestions-panel">
              <p className="learn-topic-selection-info">
                Erkanntes Thema: <strong>{effectiveTopic || '-'}</strong>
              </p>
            </div>
            <div className="learn-setup-actions">
              <SecondaryButton type="button" onClick={onBackToStep1}>
                Zur\u00FCck
              </SecondaryButton>
              <PrimaryButton type="button" onClick={onContinueStepTwo}>
                Weiter
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {setupStep === 3 ? (
          <div className="learn-setup-step">
            <label>Selbsteinschaetzung</label>
            <p className="learn-setup-info">Wie gut bist du in diesem Thema?</p>
            <div className="learn-proficiency-options" role="radiogroup" aria-label="Niveauauswahl">
              <button
                type="button"
                className={`learn-proficiency-option ${proficiencyLevel === 'low' ? 'is-active' : ''}`}
                onClick={() => onSelectProficiency('low')}
              >
                Schlecht
              </button>
              <button
                type="button"
                className={`learn-proficiency-option ${proficiencyLevel === 'medium' ? 'is-active' : ''}`}
                onClick={() => onSelectProficiency('medium')}
              >
                Mittel
              </button>
              <button
                type="button"
                className={`learn-proficiency-option ${proficiencyLevel === 'high' ? 'is-active' : ''}`}
                onClick={() => onSelectProficiency('high')}
              >
                Gut
              </button>
            </div>
            <div className="learn-setup-actions">
              <SecondaryButton type="button" onClick={onBackToStep2}>
                Zur\u00FCck
              </SecondaryButton>
              <PrimaryButton type="button" onClick={onContinueStepThree} disabled={!proficiencyLevel}>
                Weiter
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {setupStep === 4 ? (
          <div className="learn-setup-step">
            <label>Optional: Info an die KI</label>
            <p className="learn-setup-info">
              Falls du besondere Wünsche hast (z. B. Fokus, Beispiele, Lernstil), kannst du sie hier angeben.
              Leer lassen = Standard-Verhalten der KI.
            </p>
            <textarea
              className="ui-textarea learn-setup-ai-guidance"
              rows={5}
              maxLength={900}
              placeholder="Beispiel: Fokus auf IPv4-Subnetting mit vielen Rechenbeispielen, wenig Theorie."
              value={aiGuidance}
              onChange={(event) => {
                onAiGuidanceChange(event.currentTarget.value)
              }}
            />
            <p className="learn-muted">{aiGuidance.trim().length}/900 Zeichen</p>
            <div className="learn-setup-actions">
              <SecondaryButton type="button" onClick={onBackToStep3}>
                Zurück
              </SecondaryButton>
              <PrimaryButton type="button" onClick={onFinishSetup}>
                Einrichtung abschliessen
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        <div className="learn-setup-progress">
          <div className={`learn-setup-progress-step ${setupStep >= 1 ? 'is-active' : ''}`}>1</div>
          <div className={`learn-setup-progress-segment ${setupStep >= 2 ? 'is-active' : ''}`} />
          <div className={`learn-setup-progress-step ${setupStep >= 2 ? 'is-active' : ''}`}>2</div>
          <div className={`learn-setup-progress-segment ${setupStep >= 3 ? 'is-active' : ''}`} />
          <div className={`learn-setup-progress-step ${setupStep >= 3 ? 'is-active' : ''}`}>3</div>
          <div className={`learn-setup-progress-segment ${setupStep >= 4 ? 'is-active' : ''}`} />
          <div className={`learn-setup-progress-step ${setupStep >= 4 ? 'is-active' : ''}`}>4</div>
        </div>
        {setupStep === 1 ? (
          <div className="learn-setup-step-hint" aria-label="Aktueller Schritt: Datei hochladen">
            <p className="learn-setup-step-hint-label">Datei hochladen</p>
            <img className="ui-icon learn-setup-step-hint-icon" src={setupPng} alt="" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </section>
  )
}
