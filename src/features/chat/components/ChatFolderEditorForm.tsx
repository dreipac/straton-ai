import type { CSSProperties, FormEvent } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import {
  CHAT_FOLDER_COLOR_OPTIONS,
  type ChatFolderColorId,
} from '../constants/chatFolderColors'

type ChatFolderEditorFormProps = {
  name: string
  color: ChatFolderColorId | null
  onNameChange: (value: string) => void
  onColorChange: (value: ChatFolderColorId | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  inputId: string
  submitLabel: string
  className?: string
}

export function ChatFolderEditorForm({
  name,
  color,
  onNameChange,
  onColorChange,
  onSubmit,
  inputId,
  submitLabel,
  className = 'rename-form',
}: ChatFolderEditorFormProps) {
  return (
    <form className={className} onSubmit={onSubmit}>
      <label htmlFor={inputId}>Ordnername</label>
      <input
        id={inputId}
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="z. B. Arbeit"
        autoFocus
      />
      <fieldset className="chat-folder-color-fieldset">
        <legend className="chat-folder-color-legend">Ordnerfarbe</legend>
        <div className="chat-folder-color-grid" role="radiogroup" aria-label="Ordnerfarbe">
          <button
            type="button"
            className={`chat-folder-color-swatch chat-folder-color-swatch--default${
              color === null ? ' is-selected' : ''
            }`}
            role="radio"
            aria-checked={color === null}
            aria-label="Akzentfarbe"
            onClick={() => onColorChange(null)}
          >
            <span className="chat-folder-color-swatch-icon" aria-hidden="true" />
          </button>
          {CHAT_FOLDER_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chat-folder-color-swatch${color === option.id ? ' is-selected' : ''}`}
              role="radio"
              aria-checked={color === option.id}
              aria-label={option.label}
              style={{ '--chat-folder-swatch': option.swatch } as CSSProperties}
              onClick={() => onColorChange(option.id)}
            >
              <span className="chat-folder-color-swatch-icon" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="rename-actions">
        <PrimaryButton type="submit" disabled={!name.trim()}>
          {submitLabel}
        </PrimaryButton>
      </div>
    </form>
  )
}
