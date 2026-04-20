import cleanIcon from '../../../assets/icons/clean.svg'
import { AI_CHAT_MEMORY_MAX_CHARS } from '../../chat/constants/aiChatMemory'

type SettingsLanguage = 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'

type ChatSettingsSectionProps = {
  language: SettingsLanguage
  assistantEmojisEnabled: boolean
  onToggleAssistantEmojis: () => void
  autoRemoveEmptyChats: boolean
  isUpdatingChatSetting: boolean
  isCleaningEmptyChats: boolean
  chatCleanupInfo: string | null
  disableCleanup: boolean
  onToggleAutoRemoveEmptyChats: () => Promise<void>
  onCleanupEmptyChats: () => Promise<void>
  /** Persönlicher Kontext über alle Hauptchats (KI merkt sich z. B. Vorlieben). */
  aiChatMemoryEnabled: boolean
  hasAiChatMemoryNotes: boolean
  disableAiChatMemoryActions: boolean
  onToggleAiChatMemory: () => Promise<void>
  onClearAiChatMemory: () => Promise<void>
}

function assistantEmojiCopy(language: SettingsLanguage): { title: string; body: string } {
  switch (language) {
    case 'en':
      return {
        title: 'Emojis in AI replies',
        body: 'Headings (##/###) include one emoji in the title; occasional emojis in the body.',
      }
    case 'hr':
      return {
        title: 'Emoji u odgovorima AI-a',
        body: 'Asistent povremeno koristi prikladne emoji.',
      }
    case 'it':
      return {
        title: 'Emoji nelle risposte IA',
        body: "L'assistente può usare di tanto in tanto emoji pertinenti al contesto.",
      }
    case 'sq':
      return {
        title: 'Emoji në përgjigjet e IA',
        body: 'Asistenti mund të përdorë herë pas here emoji të përshtatshme me kontekstin.',
      }
    case 'es-PE':
      return {
        title: 'Emojis en respuestas de IA',
        body: 'El asistente puede usar de vez en cuando emojis acordes al contexto.',
      }
    default:
      return {
        title: 'Emoji in KI-Antworten',
        body: 'Die KI verwendet Emojis beim Antworten',
      }
  }
}

export function ChatSettingsSection({
  language,
  assistantEmojisEnabled,
  onToggleAssistantEmojis,
  autoRemoveEmptyChats,
  isUpdatingChatSetting,
  isCleaningEmptyChats,
  chatCleanupInfo,
  disableCleanup,
  onToggleAutoRemoveEmptyChats,
  onCleanupEmptyChats,
  aiChatMemoryEnabled,
  hasAiChatMemoryNotes,
  disableAiChatMemoryActions,
  onToggleAiChatMemory,
  onClearAiChatMemory,
}: ChatSettingsSectionProps) {
  const emojiLabels = assistantEmojiCopy(language)

  return (
    <section className="chat-settings-panel">
      <div className="chat-setting-row">
        <div className="chat-setting-copy">
          <h3>{emojiLabels.title}</h3>
          <p>{emojiLabels.body}</p>
        </div>
        <button
          type="button"
          className={`ios-switch ${assistantEmojisEnabled ? 'is-on' : ''}`}
          aria-label={
            language === 'en'
              ? 'Toggle emojis in AI replies'
              : 'Emoji in KI-Antworten umschalten'
          }
          aria-pressed={assistantEmojisEnabled}
          onClick={onToggleAssistantEmojis}
        >
          <span className="ios-switch-track" aria-hidden="true">
            <span className="ios-switch-thumb" />
          </span>
        </button>
      </div>
      <div className="chat-setting-divider" />
      <div className="chat-setting-row">
        <div className="chat-setting-copy">
          <h3>Persönlicher KI-Speicher</h3>
          <p>
            Die KI kann sich über alle Chats hinweg Notizen zu dir merken (Name, Interessen, Schwächen). Neuen Chats
            wird dieser Kontext automatisch mitgegeben. Gespeichert wird höchstens etwa{' '}
            {AI_CHAT_MEMORY_MAX_CHARS.toLocaleString('de-DE')} Zeichen; beim Aktualisieren werden ältere oder weniger
            wichtige Punkte zusammengefasst oder entfernt.
          </p>
        </div>
        <button
          type="button"
          className={`ios-switch ${aiChatMemoryEnabled ? 'is-on' : ''}`}
          disabled={disableAiChatMemoryActions}
          aria-label="Persönlichen KI-Speicher umschalten"
          aria-pressed={aiChatMemoryEnabled}
          onClick={() => {
            void onToggleAiChatMemory()
          }}
        >
          <span className="ios-switch-track" aria-hidden="true">
            <span className="ios-switch-thumb" />
          </span>
        </button>
      </div>
      <div className="chat-setting-divider" />
      <button
        type="button"
        className="chat-cleanup-button"
        disabled={disableAiChatMemoryActions || !hasAiChatMemoryNotes}
        onClick={() => {
          void onClearAiChatMemory()
        }}
      >
        Gespeicherten KI-Speicher löschen
      </button>
      <div className="chat-setting-divider" />
      <div className="chat-setting-row">
        <div className="chat-setting-copy">
          <h3>Auto löschen von leeren Chats</h3>
          <p>Leere neue Chats werden beim Wechsel automatisch entfernt.</p>
        </div>
        <button
          type="button"
          className={`ios-switch ${autoRemoveEmptyChats ? 'is-on' : ''}`}
          disabled={isUpdatingChatSetting}
          aria-label="Auto Löschen bei leeren Chats umschalten"
          aria-pressed={autoRemoveEmptyChats}
          onClick={() => {
            void onToggleAutoRemoveEmptyChats()
          }}
        >
          <span className="ios-switch-track" aria-hidden="true">
            <span className="ios-switch-thumb" />
          </span>
        </button>
      </div>
      <div className="chat-setting-divider" />
      <button
        type="button"
        className="chat-cleanup-button"
        disabled={disableCleanup || isCleaningEmptyChats}
        onClick={() => {
          void onCleanupEmptyChats()
        }}
      >
        <img className="ui-icon chat-cleanup-icon" src={cleanIcon} alt="" aria-hidden="true" />
        {isCleaningEmptyChats ? (
          <span className="chat-cleanup-loading">
            <span className="chat-cleanup-spinner" aria-hidden="true" />
            Leere Chats werden gelöscht
          </span>
        ) : (
          'Leere Chats löschen'
        )}
      </button>
      {chatCleanupInfo ? <p className="chat-cleanup-info">{chatCleanupInfo}</p> : null}
      <div className="chat-setting-divider chat-setting-divider-after-cleanup" />
    </section>
  )
}
