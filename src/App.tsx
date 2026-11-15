import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './lib/api'
import { goToSignIn } from './lib/accounts'
import { addDays, displayDate, displayDayHeading, displayShortDayHeading, validDate } from './lib/dates'
import { Drafts } from './lib/drafts'
import type { Bootstrap, Day, User } from './lib/types'
import { Calendar } from './components/Calendar'
import { JournalEditor } from './components/JournalEditor'
import { Activities } from './components/Activities'
import { ManageActivities, ManageJournals, Settings } from './components/Manage'
import { Dialog } from './components/Dialog'
import { ProfileMenu } from './components/ProfileMenu'

export default function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('GET', '/api/auth/me'),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })
  const bootstrap = useQuery({
    queryKey: ['bootstrap', me.data?.id],
    queryFn: () => api<Bootstrap>('GET', '/api/daily/bootstrap'),
    enabled: !!me.data,
    refetchInterval: 60_000,
  })
  if (me.error || bootstrap.error)
    return (
      <main className="loading">
        <h1>Daily</h1>
        <p role="alert">{(me.error ?? bootstrap.error)?.message}</p>
        <button
          onClick={() => {
            void me.refetch()
            void bootstrap.refetch()
          }}
        >
          Try again
        </button>
      </main>
    )
  if (!me.data || !bootstrap.data)
    return (
      <main className="loading">
        <span className="brand-mark">D</span>
        <p>Opening your day…</p>
      </main>
    )
  return <Workspace key={me.data.id} user={me.data} data={bootstrap.data} />
}

function Workspace({ user, data }: { user: User; data: Bootstrap }) {
  const client = useQueryClient()
  const [selected, setSelected] = useState(() => {
    const date = new URLSearchParams(location.search).get('date')
    return validDate(date) ? date : data.today
  })
  const [month, setMonth] = useState(selected.slice(0, 7))
  const [dateSlide, setDateSlide] = useState<{ from: string; direction: 'forward' | 'backward' } | null>(null)
  const [modal, setModal] = useState<'journals' | 'activities' | 'settings' | 'logout' | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('daily-theme') ?? 'dark'
    } catch {
      return 'dark'
    }
  })
  const drafts = useMemo(() => new Drafts(user.id), [user.id])
  const day = useQuery({
    queryKey: ['day', user.id, selected],
    queryFn: () => api<Day>('GET', `/api/daily/days/${selected}`),
    placeholderData: keepPreviousData,
  })
  function select(date: string) {
    if (validDate(date)) {
      if (date !== selected) setDateSlide({ from: selected, direction: date > selected ? 'forward' : 'backward' })
      setSelected(date)
      setMonth(date.slice(0, 7))
      void drafts.flush()
    }
  }
  function changed() {
    void client.invalidateQueries({ queryKey: ['bootstrap'] })
    void client.invalidateQueries({ queryKey: ['day'] })
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('daily-theme', theme)
    } catch {
      /* Optional preference. */
    }
  }, [theme])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('date', selected)
    history.replaceState(null, '', url)
    document.title = `${displayDate(selected)} · Daily`
  }, [selected])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (drafts.hasUnsaved()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') void drafts.flush()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [drafts])
  return (
    <>
      <a className="skip-link" href="#day-content">
        Skip to your day
      </a>
      <header className="app-header">
        <a href="/" className="brand">
          <span className="brand-mark">D</span>
          <span>
            Daily<small>MAKE ROOM FOR YOURSELF</small>
          </span>
        </a>
        <nav aria-label="Account">
          <button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <ProfileMenu
            user={user}
            settings={() => setModal('settings')}
            journals={() => setModal('journals')}
            activities={() => setModal('activities')}
            logout={() => {
              setLogoutError('')
              setModal('logout')
            }}
          />
        </nav>
      </header>
      {user.is_guest && (
        <aside className="guest-notice">
          You’re using a guest account. Your journals and activities are deleted when you log out or your guest account
          expires.
        </aside>
      )}
      <div className="app-layout">
        <aside className="sidebar">
          <Calendar month={month} setMonth={setMonth} selected={selected} today={data.today} select={select} />
        </aside>
        <main id="day-content" className="day-panel">
          <header className="day-heading">
            <button className="day-nav" aria-label="Previous day" onClick={() => select(addDays(selected, -1))}>
              ‹
            </button>
            <div className={`day-date ${dateSlide ? `date-slide-${dateSlide.direction}` : ''}`}>
              {dateSlide && (
                <span key={`out-${selected}`} className="date-outgoing" aria-hidden="true">
                  <span className="date-long">{displayDayHeading(dateSlide.from)}</span>
                  <span className="date-short">{displayShortDayHeading(dateSlide.from)}</span>
                </span>
              )}
              <h1
                key={selected}
                aria-label={displayDayHeading(selected)}
                className={dateSlide ? 'date-incoming' : undefined}
                onAnimationEnd={() => setDateSlide(null)}
              >
                <span className="date-long" aria-hidden="true">
                  {displayDayHeading(selected)}
                </span>
                <span className="date-short" aria-hidden="true">
                  {displayShortDayHeading(selected)}
                </span>
              </h1>
            </div>
            <div className="day-next-controls">
              <button className="day-nav" aria-label="Next day" onClick={() => select(addDays(selected, 1))}>
                ›
              </button>
              <button className="day-nav day-today" aria-label="Today" title="Today" onClick={() => select(data.today)}>
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M7 3v4M17 3v4M3 10h18" />
                  <circle cx="12" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          </header>
          {day.isPending && (
            <p className="muted" role="status">
              Opening this day…
            </p>
          )}
          {day.error && (
            <p className="error" role="alert">
              {day.error.message} <button onClick={() => void day.refetch()}>Retry</button>
            </p>
          )}
          {day.data && (
            <div className="day-sections" inert={day.isPlaceholderData} aria-busy={day.isPlaceholderData}>
              <Activities
                key={day.data.date}
                items={day.data.activities}
                date={day.data.date}
                data={data}
                changed={changed}
              />
              {day.data.journals.map((journal) => (
                <JournalEditor
                  key={`${day.data.date}/${journal.id}`}
                  journal={journal}
                  date={day.data.date}
                  drafts={drafts}
                />
              ))}
            </div>
          )}
        </main>
      </div>
      {modal === 'journals' && <ManageJournals data={data} changed={changed} close={() => setModal(null)} />}
      {modal === 'activities' && (
        <Dialog title="Manage activities" close={() => setModal(null)}>
          <ManageActivities data={data} changed={changed} />
        </Dialog>
      )}
      {modal === 'settings' && <Settings data={data} user={user} changed={changed} close={() => setModal(null)} />}
      {modal === 'logout' && (
        <Dialog
          title={user.is_guest ? 'Log out and delete guest data?' : 'Log out of HMS?'}
          close={() => setModal(null)}
        >
          <p>
            {user.is_guest
              ? 'This permanently deletes your guest account, including its journals, entries, exercise records and data in other HMS apps.'
              : 'This signs you out of Daily and your other HMS apps.'}
          </p>
          <p className="muted">Unsaved drafts must be saved or resolved before logging out.</p>
          {logoutError && (
            <p className="error" role="alert">
              {logoutError}
            </p>
          )}
          <div className="dialog-actions">
            <button onClick={() => setModal(null)}>Cancel</button>
            <button
              className="danger"
              disabled={logoutBusy}
              onClick={async () => {
                setLogoutBusy(true)
                try {
                  await drafts.flush()
                  if (drafts.hasUnsaved()) {
                    setLogoutError(
                      'Some drafts are still saving or need attention. Close this dialog and resolve them first.',
                    )
                    return
                  }
                  await api('POST', '/api/auth/logout')
                  drafts.clearRecovery()
                  client.clear()
                  goToSignIn(window.location.origin)
                } catch (error) {
                  setLogoutError(error instanceof Error ? error.message : 'Could not log out.')
                } finally {
                  setLogoutBusy(false)
                }
              }}
            >
              Log out
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
