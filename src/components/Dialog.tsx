import { useEffect, useRef, type ReactNode } from 'react'

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button aria-label="Close" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
