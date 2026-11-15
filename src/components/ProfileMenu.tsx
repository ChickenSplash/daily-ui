import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { User } from '../lib/types'

export function ProfileMenu({
  user,
  settings,
  journals,
  activities,
  logout,
}: {
  user: User
  settings: () => void
  journals: () => void
  activities: () => void
  logout: () => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const last = useRef(false)

  useEffect(() => {
    if (!open) return
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    items?.[last.current ? items.length - 1 : 0]?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function close() {
    // Remove the focused menu item before returning focus, so a following modal
    // records the persistent profile button as its opener.
    flushSync(() => setOpen(false))
    trigger.current?.focus()
  }

  return (
    <div
      className="profile-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        className="account-button"
        ref={trigger}
        aria-label={user.display_name}
        title="Profile"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          last.current = false
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            last.current = event.key === 'ArrowUp'
            setOpen(true)
          }
        }}
      >
        <span className="avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
        <span>{user.display_name}</span>
      </button>
      {open && (
        <div
          className="profile-menu-panel"
          id={id}
          role="menu"
          aria-label="Profile"
          ref={menu}
          onKeyDown={(event) => {
            const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
            const index = items.indexOf(document.activeElement as HTMLButtonElement)
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              items[next]?.focus()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            } else if (event.key === 'Tab') close()
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              close()
              settings()
            }}
          >
            Settings
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close()
              journals()
            }}
          >
            Manage journals
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close()
              activities()
            }}
          >
            Manage activities
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close()
              logout()
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
