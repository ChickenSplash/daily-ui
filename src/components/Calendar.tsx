import { useRef, useState } from 'react'
import { addDays, dateKey, displayDate, monthGrid, parseDate } from '../lib/dates'
import type { Summary } from '../lib/types'

export function Calendar({
  month,
  setMonth,
  selected,
  today,
  select,
  summaries,
}: {
  month: string
  setMonth: (value: string) => void
  selected: string
  today: string
  select: (date: string) => void
  summaries: Summary[]
}) {
  const [expanded, setExpanded] = useState(false)
  const container = useRef<HTMLElement>(null)
  const grid = monthGrid(month)
  const info = new Map(summaries.map((summary) => [summary.date, summary]))
  function shiftMonth(amount: number) {
    const date = parseDate(`${month}-01`)
    date.setMonth(date.getMonth() + amount)
    if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) setMonth(dateKey(date).slice(0, 7))
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
      <div className="month-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <span className="weekday" key={index}>
            {day}
          </span>
        ))}
        {grid.map((date) => {
          const summary = info.get(date)
          const label = `${displayDate(date)}${summary?.entries ? `, ${summary.entries} journal entries` : ''}${summary?.total ? `, ${summary.completed} of ${summary.total} activities completed` : ''}`
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
              <span className="date-markers" aria-hidden="true">
                {summary?.entries ? <i className="writing-dot" /> : null}
                {summary?.total ? (
                  <small className={summary.completed === summary.total ? 'all-done' : ''}>
                    {summary.completed}/{summary.total}
                  </small>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, index) => addDays(selected, index - weekday)).map((date) => (
          <button
            className={date === selected ? 'selected' : ''}
            key={date}
            onClick={() => select(date)}
            aria-label={displayDate(date)}
            aria-pressed={date === selected}
          >
            <small>{parseDate(date).toLocaleDateString('en-GB', { weekday: 'short' })}</small>
            {Number(date.slice(-2))}
          </button>
        ))}
      </div>
      <p className="calendar-legend">
        <i className="writing-dot" /> Journal entry <span>0/2 Activities</span>
      </p>
    </section>
  )
}
