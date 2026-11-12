import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { download, units } from '../lib/dates'
import type { Activity, Bootstrap, Journal, Unit, User } from '../lib/types'
import { Dialog } from './Dialog'

type Props = { data: Bootstrap; changed: () => void; close: () => void }
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')

export function ManageJournals({ data, changed, close }: Props) {
  const [editing, setEditing] = useState<Journal | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Journal | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function update(id: number, body: unknown) {
    setError('')
    setBusy(true)
    try {
      await api('PATCH', `/api/daily/journals/${id}`, body)
      changed()
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Manage journals" close={close}>
      <p>Separate spaces for different kinds of writing. Each journal has one entry per day.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="manage-list">
        {data.journals.map((journal, index) => (
          <div key={journal.id} className="manage-item">
            <div>
              <strong>{journal.name}</strong>
              <small>{journal.archived_at ? 'Archived · entries kept' : journal.prompt || 'Daily entries'}</small>
            </div>
            <div className="item-actions">
              <button
                aria-label={`Move ${journal.name} up`}
                disabled={busy || index === 0}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const ordered = [...data.journals]
                    ;[ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]]
                    for (const [position, item] of ordered.entries())
                      await api('PATCH', `/api/daily/journals/${item.id}`, { position })
                    changed()
                  } catch (error) {
                    setError(message(error))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                ↑
              </button>
              <button disabled={busy} onClick={() => setEditing(journal)}>
                Edit
              </button>
              <button disabled={busy} onClick={() => void update(journal.id, { archived: !journal.archived_at })}>
                {journal.archived_at ? 'Restore' : 'Archive'}
              </button>
              <button className="danger-text" disabled={busy} onClick={() => setDeleting(journal)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="primary" onClick={() => setEditing('new')}>
        ＋ New journal
      </button>
      {editing && (
        <JournalForm
          journal={editing}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null)
            changed()
          }}
        />
      )}
      {deleting && (
        <Dialog title="Permanently delete journal?" close={() => setDeleting(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              try {
                await api('DELETE', `/api/daily/journals/${deleting.id}`)
                setDeleting(null)
                changed()
              } catch (error) {
                setError(message(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            <p>
              This deletes <strong>{deleting.name}</strong> and every entry in it. Export your data first if you need a
              copy.
            </p>
            <label>
              Type DELETE to confirm
              <input required pattern="DELETE" autoComplete="off" />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="danger" disabled={busy}>
                Delete permanently
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Dialog>
  )
}

function JournalForm({ journal, close, saved }: { journal: Journal | 'new'; close: () => void; saved: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const existing = journal === 'new' ? null : journal
  return (
    <Dialog title={existing ? 'Edit journal' : 'New journal'} close={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setBusy(true)
          try {
            await api(existing ? 'PATCH' : 'POST', `/api/daily/journals${existing ? `/${existing.id}` : ''}`, {
              name: data.get('name'),
              prompt: data.get('prompt'),
            })
            saved()
          } catch (error) {
            setError(message(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Name
          <input
            name="name"
            defaultValue={existing?.name}
            required
            maxLength={100}
            placeholder="Dream journal, reflections…"
          />
        </label>
        <label>
          Writing prompt
          <input
            name="prompt"
            defaultValue={existing?.prompt}
            maxLength={300}
            placeholder="A gentle nudge to get started"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save journal
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function ManageActivities({ data, changed, close }: Props) {
  const [editing, setEditing] = useState<Activity | null>(null)
  const [deleting, setDeleting] = useState<Activity | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="Manage activities" close={close}>
      <p>Create activities and choose which days they repeat. Daily totals stay separate from your routine.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="manage-list">
        {data.activities.map((activity) => (
          <div key={activity.id} className="manage-item">
            <div>
              <strong>{activity.name}</strong>
              <small>
                {activity.archived_on
                  ? 'Archived · history kept'
                  : activity.rules.some((rule) => !rule.ends_on || rule.ends_on >= data.today)
                    ? 'Repeating routine'
                    : 'No repeating days'}{' '}
                · {units[activity.unit] || 'checkbox'}
              </small>
            </div>
            <div className="item-actions">
              <button disabled={busy} onClick={() => setEditing(activity)}>
                Edit / schedule
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await api('PATCH', `/api/daily/activities/${activity.id}`, { archived: !activity.archived_on })
                    changed()
                  } catch (error) {
                    setError(message(error))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {activity.archived_on ? 'Restore' : 'Archive'}
              </button>
              {activity.archived_on && (
                <button
                  className="danger-text"
                  disabled={busy}
                  onClick={() => {
                    setDeleteError('')
                    setDeleting(activity)
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!data.activities.length && <p className="muted">No activities yet. Start with one small habit.</p>}
      <button className="primary" onClick={() => setCreating(true)}>
        ＋ New activity
      </button>
      {creating && (
        <NewActivity
          close={() => setCreating(false)}
          saved={(activity) => {
            setCreating(false)
            setEditing(activity)
            changed()
          }}
        />
      )}
      {editing && (
        <ScheduleForm
          activity={editing}
          today={data.today}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null)
            changed()
          }}
        />
      )}
      {deleting && (
        <Dialog
          title="Permanently delete activity?"
          close={() => {
            if (!busy) setDeleting(null)
          }}
        >
          <p>
            This permanently deletes <strong>{deleting.name}</strong>, its routines and all its daily progress records.
            This cannot be undone.
          </p>
          {deleteError && (
            <p className="error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setDeleteError('')
                try {
                  await api('DELETE', `/api/daily/activities/${deleting.id}`)
                  setDeleting(null)
                  changed()
                } catch (error) {
                  setDeleteError(message(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Delete activity
            </button>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}

function NewActivity({ close, saved }: { close: () => void; saved: (activity: Activity) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="New activity" close={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setBusy(true)
          try {
            const activity = await api<Activity>('POST', '/api/daily/activities', {
              name: data.get('name'),
              unit: data.get('unit'),
            })
            saved({ ...activity, rules: [] })
          } catch (error) {
            setError(message(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Name
          <input name="name" maxLength={100} placeholder="Push-ups" required />
        </label>
        <label>
          Track by
          <select name="unit">
            <option value="repetitions">Repetitions</option>
            <option value="metres">Distance (metres)</option>
            <option value="seconds">Time (seconds)</option>
            <option value="checkbox">Just a checkbox</option>
          </select>
        </label>
        <p className="muted">The measurement unit cannot change later, keeping historical totals meaningful.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Create activity
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ScheduleForm({
  activity,
  today,
  close,
  saved,
}: {
  activity: Activity
  today: string
  close: () => void
  saved: () => void
}) {
  const current = [...activity.rules]
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
    .find((rule) => !rule.ends_on || rule.ends_on >= today)
  const [weekdays, setWeekdays] = useState<number[]>(current?.weekdays ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      await api('PATCH', `/api/daily/activities/${activity.id}`, { name: data.get('name') })
      if (!activity.archived_on)
        await api('PUT', `/api/daily/activities/${activity.id}/schedule`, {
          starts_on: data.get('starts_on'),
          weekdays,
          target: activity.unit === 'checkbox' ? null : Number(data.get('target')),
        })
      saved()
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Activity and routine" close={close}>
      <form onSubmit={submit}>
        <label>
          Name
          <input name="name" defaultValue={activity.name} maxLength={100} required />
        </label>
        {!activity.archived_on && (
          <>
            <label>
              Apply routine from
              <input
                name="starts_on"
                type="date"
                min={today}
                max="2100-12-31"
                defaultValue={current && current.starts_on > today ? current.starts_on : today}
                required
              />
            </label>
            <fieldset>
              <legend>Repeat on</legend>
              <div className="weekday-picker">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={weekdays.includes(index + 1)}
                    onClick={() =>
                      setWeekdays((days) =>
                        days.includes(index + 1) ? days.filter((day) => day !== index + 1) : [...days, index + 1],
                      )
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            </fieldset>
            {activity.unit !== 'checkbox' && (
              <label>
                Daily target ({units[activity.unit as Unit]})
                <input
                  name="target"
                  type="number"
                  min="0.01"
                  max="999999999"
                  step="0.01"
                  defaultValue={current?.target ?? 20}
                  required
                />
              </label>
            )}
            <p className="muted">
              No selected days stops the routine from this date. Earlier dates and saved daily targets stay unchanged.
              Any later scheduled changes are replaced.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save routine
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function Settings({ data, user, changed, close }: Props & { user: User }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const zones = Array.from(new Set(['Europe/London', data.timezone, ...Intl.supportedValuesOf('timeZone')])).sort()
  return (
    <Dialog title="Settings" close={close}>
      <p>
        Signed in as <strong>{user.display_name}</strong>
        {user.is_guest ? ' (guest)' : ''}.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          setBusy(true)
          setError('')
          try {
            await api('PATCH', '/api/daily/settings', { timezone: form.get('timezone') })
            changed()
          } catch (error) {
            setError(message(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Your timezone
          <select name="timezone" defaultValue={data.timezone}>
            {zones.map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <p className="muted">Determines “today” and your daily checklist. Existing entry dates do not move.</p>
        <button className="primary" disabled={busy}>
          Save timezone
        </button>
      </form>
      <hr />
      <h3>Your data, yours to keep</h3>
      <p>Export journals as Markdown text inside a JSON file, together with all routines and daily totals.</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const value = await api('GET', '/api/daily/export')
            download(JSON.stringify(value, null, 2), 'daily-export.json', 'application/json')
          } catch (error) {
            setError(message(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        Download all data
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
