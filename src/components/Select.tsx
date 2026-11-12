import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

export type SelectOption = { value: string; label: string; group?: string; disabled?: boolean; hint?: string }

export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const enabled = options.filter((option) => !option.disabled)
  const selected = options.find((option) => option.value === value)
  const groups = Array.from(new Set(options.map((option) => option.group ?? '')))
  const optionId = (optionValue: string) => `${id}-option-${encodeURIComponent(optionValue)}`

  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return
    const popup = menu.current
    const field = trigger.current
    // The top layer escapes the dialog's scroll container without leaving its
    // accessible subtree or adding overflow to the page behind the modal.
    popup.showPopover()
    const position = () => {
      const rect = field.getBoundingClientRect()
      const gutter = 8
      const below = Math.max(0, window.innerHeight - rect.bottom - gutter - 6)
      const above = Math.max(0, rect.top - gutter - 6)
      const upwards = below < Math.min(260, popup.scrollHeight) && above > below
      const available = upwards ? above : below
      popup.style.width = `${Math.min(rect.width, window.innerWidth - gutter * 2)}px`
      popup.style.maxHeight = `${Math.min(320, available)}px`
      popup.style.left = `${Math.max(gutter, Math.min(rect.left, window.innerWidth - rect.width - gutter))}px`
      popup.style.top = `${upwards ? Math.max(gutter, rect.top - popup.getBoundingClientRect().height - 6) : rect.bottom + 6}px`
    }
    position()
    const resized = new ResizeObserver(position)
    resized.observe(field)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      resized.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      if (popup.matches(':popover-open')) popup.hidePopover()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => {
    const popup = menu.current
    const option = document.getElementById(optionId(active))
    if (!open || !popup || !option) return
    const viewport = popup.getBoundingClientRect()
    const row = option.getBoundingClientRect()
    if (row.top < viewport.top) popup.scrollTop -= viewport.top - row.top + 5
    else if (row.bottom > viewport.bottom) popup.scrollTop += row.bottom - viewport.bottom + 5
  }, [open, active, id])

  function choose(next: string) {
    if (!options.some((option) => option.value === next && !option.disabled)) return
    onChange(next)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div
      className="select-field"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => {
          setActive(value)
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          } else if (event.key === 'Tab') {
            setOpen(false)
          } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const index = enabled.findIndex((option) => option.value === (open ? active : value))
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? enabled.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
            setActive(enabled[next]?.value ?? value)
            setOpen(true)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (open) choose(active)
            else {
              setActive(value)
              setOpen(true)
            }
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            const now = performance.now()
            const text = (now - search.current.time < 700 ? search.current.text : '') + event.key.toLowerCase()
            search.current = { text, time: now }
            const match = enabled.find((option) => option.label.toLowerCase().startsWith(text))
            if (match) {
              setActive(match.value)
              setOpen(true)
            }
          }
        }}
      >
        <span>{selected?.label ?? 'Choose an option'}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id={`${id}-list`} className="select-menu" role="listbox" aria-label={label} ref={menu} popover="manual">
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group || undefined}>
              {group && (
                <div className="select-group-label" aria-hidden="true">
                  {group}
                </div>
              )}
              {options
                .filter((option) => (option.group ?? '') === group)
                .map((option) => (
                  <div
                    key={option.value}
                    id={optionId(option.value)}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={!!option.disabled}
                    className={`select-option ${option.value === active ? 'active' : ''}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => {
                      if (!option.disabled) setActive(option.value)
                    }}
                    onClick={() => choose(option.value)}
                  >
                    <span>{option.label}</span>
                    {option.hint && <small>{option.hint}</small>}
                    {option.value === value && (
                      <span className="select-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
