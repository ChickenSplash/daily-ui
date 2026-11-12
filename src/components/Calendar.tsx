import { useRef, useState } from 'react'
import { addDays, dateKey, displayDate, monthGrid, parseDate } from '../lib/dates'

export function Calendar({
  month,
  setMonth,
  selected,
  today,
  select,
}: {
  month: string
  setMonth: (value: string) => void
  selected: string
  today: string
  select: (date: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [slide, setSlide] = useState<{ from: string; to: string; direction: 'forward' | 'backward' } | null>(null)
  const container = useRef<HTMLElement>(null)
  function shiftMonth(amount: number) {
    const date = parseDate(`${month}-01`)
    date.setMonth(date.getMonth() + amount)
    if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      const next = dateKey(date).slice(0, 7)
      setSlide({ from: month, to: next, direction: amount > 0 ? 'forward' : 'backward' })
      setMonth(next)
      // Month navigation should show the requested month even on compact mobile layouts.
      setExpanded(true)
    }
  }
  const weekday = (parseDate(selected).getDay() + 6) % 7
  return (
    <section ref={container} className={`calendar ${expanded ? 'expanded' : ''}`} aria-label="Calendar">
      <div className="calendar-heading">
        <button className="month-title" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {parseDate(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          <span className="mobile-only">⌄</span>
        </button>
        <div className="month-controls">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <button onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </div>
      <div className={`calendar-viewport ${slide?.to === month ? `calendar-slide-${slide.direction}` : ''}`}>
        {slide?.to === month && (
          <div key={`out-${month}`} className="month-grid calendar-outgoing" aria-hidden="true" inert>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span className="weekday" key={index}>
                {day}
              </span>
            ))}
            {monthGrid(slide.from).map((date) => (
              <span
                key={date}
                className={`date-cell ${date.slice(0, 7) !== slide.from ? 'outside' : ''} ${date === today ? 'today' : ''} ${date === selected ? 'selected' : ''}`}
              >
                <span>{Number(date.slice(-2))}</span>
                {date === today && <i className="today-dot" aria-hidden="true" />}
              </span>
            ))}
          </div>
        )}
        <div
          key={month}
          className={`month-grid ${slide?.to === month ? 'calendar-incoming' : ''}`}
          onAnimationEnd={() => setSlide(null)}
        >
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <span className="weekday" key={index}>
              {day}
            </span>
          ))}
          {monthGrid(month).map((date) => {
            const label = displayDate(date)
            return (
              <button
                key={date}
                data-date={date}
                aria-label={label}
                aria-pressed={date === selected}
                aria-current={date === today ? 'date' : undefined}
                title={label}
                className={`date-cell ${date.slice(0, 7) !== month ? 'outside' : ''} ${date === today ? 'today' : ''} ${date === selected ? 'selected' : ''}`}
                onClick={() => {
                  select(date)
                  setExpanded(false)
                }}
                onKeyDown={(event) => {
                  const offset: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
                  if (offset[event.key]) {
                    event.preventDefault()
                    const next = addDays(date, offset[event.key])
                    select(next)
                    requestAnimationFrame(() =>
                      container.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(),
                    )
                  }
                }}
              >
                <span>{Number(date.slice(-2))}</span>
                {date === today && <i className="today-dot" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, index) => addDays(selected, index - weekday)).map((date) => (
          <button
            className={date === selected ? 'selected' : ''}
            key={date}
            onClick={() => select(date)}
            aria-label={displayDate(date)}
            aria-pressed={date === selected}
            aria-current={date === today ? 'date' : undefined}
          >
            <small>{parseDate(date).toLocaleDateString('en-GB', { weekday: 'short' })}</small>
            {Number(date.slice(-2))}
            {date === today && <i className="today-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  )
}
