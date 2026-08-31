import type { TransitionEvent } from 'react'

type ChatImageLightboxProps = {
  src: string
  open: boolean
  onClose: () => void
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void
}

export function ChatImageLightbox({ src, open, onClose, onTransitionEnd }: ChatImageLightboxProps) {
  return (
    <div
      className={`chat-image-lightbox${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Bildvorschau"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('.chat-image-lightbox-img')) {
          return
        }
        onClose()
      }}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="chat-image-lightbox-frame">
        <img src={src} alt="" className="chat-image-lightbox-img" decoding="async" />
      </div>
    </div>
  )
}
