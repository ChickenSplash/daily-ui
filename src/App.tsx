import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './lib/api'
import { ACCOUNTS_URL, goToSignIn } from './lib/accounts'
import { addDays, displayDate, validDate } from './lib/dates'
import { Drafts } from './lib/drafts'
import type { Bootstrap, Day, User } from './lib/types'
import { Calendar } from './components/Calendar'
import { JournalEditor } from './components/JournalEditor'
import { Activities } from './components/Activities'
import { ManageActivities, ManageJournals, Settings } from './components/Manage'
import { Dialog } from './components/Dialog'

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
  })
  function select(date: string) {
    if (validDate(date)) {
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
  const completion = day.data?.activities.filter((activity) => activity.status === 'completed').length ?? 0
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
          <button onClick={() => select(data.today)}>Today</button>
          <button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button onClick={() => setModal('settings')}>Settings</button>
          <button
            className="account-button"
            aria-label={user.display_name}
            title="Account · log out"
            onClick={() => {
              setLogoutError('')
              setModal('logout')
            }}
          >
            <span className="avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
            <span>{user.display_name}</span>
          </button>
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
          <nav className="sidebar-nav" aria-label="Manage">
            <button onClick={() => setModal('journals')}>
              <span>▤</span> Manage journals <span>↗</span>
            </button>
            <button onClick={() => setModal('activities')}>
              <span>✓</span> Manage activities <span>↗</span>
            </button>
          </nav>
          <div className="sidebar-note">
            <span>ONE DAY AT A TIME</span>
            <p>
              Small things count.
              <br />
              There’s no perfect way to begin.
            </p>
          </div>
          <a className="hms-link" href={ACCOUNTS_URL}>
            ← Your homelab apps
          </a>
        </aside>
        <main id="day-content" className="day-panel">
          <header className="day-heading">
            <div>
              <span className="eyebrow">
                {selected === data.today
                  ? 'YOUR SPACE FOR TODAY'
                  : selected > data.today
                    ? 'A LITTLE LOOK AHEAD'
                    : 'A DAY TO REMEMBER'}
              </span>
              <h1>{displayDate(selected).replace(/,? \d{4}$/, '')}</h1>
              <p>
                {selected.slice(0, 4)} <span>·</span> {data.timezone.replace(/_/g, ' ')}{' '}
                {day.data?.activities.length ? (
                  <>
                    <span>·</span> {completion} of {day.data.activities.length} activities complete
                  </>
                ) : null}
              </p>
            </div>
            <div className="day-controls">
              <button aria-label="Previous day" onClick={() => select(addDays(selected, -1))}>
                ‹
              </button>
              <button aria-label="Next day" onClick={() => select(addDays(selected, 1))}>
                ›
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
            <div className="day-sections">
              <Activities
                key={selected}
                items={day.data.activities}
                date={selected}
                today={data.today}
                activities={data.activities}
                changed={changed}
                manage={() => setModal('activities')}
              />
              {day.data.journals.map((journal) => (
                <JournalEditor key={`${selected}/${journal.id}`} journal={journal} date={selected} drafts={drafts} />
              ))}
              {!day.data.journals.length && (
                <section className="journal-card empty-activities">
                  <h2>A space for your thoughts</h2>
                  <p>Create a journal to start writing.</p>
                  <button onClick={() => setModal('journals')}>＋ Create journal</button>
                </section>
              )}
              <p className="day-footer">A record of your days. Just for you.</p>
            </div>
          )}
        </main>
      </div>
      {modal === 'journals' && <ManageJournals data={data} changed={changed} close={() => setModal(null)} />}
      {modal === 'activities' && <ManageActivities data={data} changed={changed} close={() => setModal(null)} />}
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
