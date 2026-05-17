import { useTypewriterGreeting } from '../hooks/useTypewriterGreeting'

function TypewriterCaret() {
  return (
    <span className="chat-empty-title-caret-wrap" aria-hidden="true">
      <span className="chat-empty-title-caret-blur" />
      <span className="chat-empty-title-caret" />
    </span>
  )
}

type ChatEmptyGreetingTitleProps = {
  greet: string
  ask: string
  /** z. B. threadKey — Animation bei neuem leeren Chat neu starten */
  animationKey: string
}

export function ChatEmptyGreetingTitle({ greet, ask, animationKey }: ChatEmptyGreetingTitleProps) {
  const { greetText, askText, isTyping, showCaret } = useTypewriterGreeting(
    greet,
    ask,
    true,
    animationKey,
  )

  const fullLabel = `${greet} ${ask}`

  return (
    <h2
      className={`chat-empty-title${isTyping ? ' is-typewriting' : ''}`}
      aria-label={fullLabel}
    >
      <span
        className={`chat-empty-title-greet${
          showCaret && askText.length === 0 ? ' is-typewriting-line' : ''
        }`}
      >
        {greetText}
        {showCaret && askText.length === 0 ? <TypewriterCaret /> : null}
      </span>
      <span
        className={`chat-empty-title-ask${showCaret && askText.length > 0 ? ' is-typewriting-line' : ''}`}
      >
        {askText}
        {showCaret && askText.length > 0 ? <TypewriterCaret /> : null}
      </span>
    </h2>
  )
}
