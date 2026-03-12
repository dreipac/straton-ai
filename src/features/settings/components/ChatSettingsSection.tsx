import cleanIcon from '../../../assets/icons/clean.svg'

type ChatSettingsSectionProps = {
  autoRemoveEmptyChats: boolean
  isUpdatingChatSetting: boolean
  isCleaningEmptyChats: boolean
  chatCleanupInfo: string | null
  disableCleanup: boolean
  onToggleAutoRemoveEmptyChats: () => Promise<void>
  onCleanupEmptyChats: () => Promise<void>
}

export function ChatSettingsSection({
  autoRemoveEmptyChats,
  isUpdatingChatSetting,
  isCleaningEmptyChats,
  chatCleanupInfo,
  disableCleanup,
  onToggleAutoRemoveEmptyChats,
  onCleanupEmptyChats,
}: ChatSettingsSectionProps) {
  return (
    <section className="chat-settings-panel">
      <div className="chat-setting-row">
        <div className="chat-setting-copy">
          <h3>Auto löschen von leeren Chats</h3>
          <p>Leere neue Chats werden beim Wechsel automatisch entfernt.</p>
        </div>
        <button
          type="button"
          className={`ios-switch ${autoRemoveEmptyChats ? 'is-on' : ''}`}
          disabled={isUpdatingChatSetting}
          aria-label="Auto Loeschen bei leeren Chats umschalten"
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
