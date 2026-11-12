import { useState } from 'react'
import { api } from '../lib/api'
import { units } from '../lib/dates'
import type { ActivityDay, Activity, Unit } from '../lib/types'
import { Dialog } from './Dialog'

export function Activities({
  items,
  date,
  activities,
  changed,
  manage,
}: {
  items: ActivityDay[]
  date: string
  activities: Activity[]
  changed: () => void
  manage: () => void
}) {
  const [editing, setEditing] = useState<ActivityDay | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, ActivityDay>>({})
  const rows = items.map((item) =>
    overrides[item.activity_id] && overrides[item.activity_id].revision >= item.revision
      ? overrides[item.activity_id]
      : item,
  )
  async function save(item: ActivityDay, changes: Partial<ActivityDay>) {
    setError('')
    setBusy(true)
    setOverrides((previous) => ({ ...previous, [item.activity_id]: { ...item, ...changes } }))
    try {
      const saved = await api<ActivityDay>('PUT', `/api/daily/days/${date}/activities/${item.activity_id}`, {
        revision: item.revision,
        target: item.target,
        actual: item.actual,
        status: item.status,
        ...changes,
      })
      setOverrides((previous) => ({ ...previous, [item.activity_id]: { ...saved, preview: false } }))
      changed()
      setEditing(null)
    } catch (error) {
      setOverrides((previous) => {
        const next = { ...previous }
        delete next[item.activity_id]
        return next
      })
      setError(error instanceof Error ? error.message : 'Could not save activity.')
      throw error
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="activity-card" aria-label="Daily activities">
      <header>
        <div>
          <span className="eyebrow">A LITTLE EVERY DAY</span>
          <h2>
            Activities{' '}
            <small>
              {rows.filter((item) => item.status === 'completed').length}/{items.length}
            </small>
          </h2>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setError('')
            setAdding(true)
          }}
        >
          ＋ Add
        </button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={changed}>Refresh</button>
        </p>
      )}
      {!items.length && (
        <div className="empty-activities">
          <span>☀</span>
          <p>
            A little movement. A small habit.
            <br />
            Add something for today, or set up a routine.
          </p>
          <button className="text-button" onClick={manage}>
            Manage activities →
          </button>
        </div>
      )}
      {rows.map((item) => (
        <div className={`activity-row ${item.status}`} key={item.activity_id}>
          <input
            type="checkbox"
            aria-label={`Complete ${item.name}`}
            checked={item.status === 'completed'}
            disabled={busy}
            onChange={() =>
              void save(item, {
                actual: item.status === 'completed' ? 0 : (item.target ?? 0),
                status: item.status === 'completed' ? 'pending' : 'completed',
              }).catch(() => {})
            }
          />
          <button
            className="activity-label"
            onClick={() => {
              setError('')
              setEditing(item)
            }}
          >
            <span>{item.name}</span>
            <small>
              {item.status === 'skipped'
                ? 'Skipped'
                : item.unit === 'checkbox'
                  ? item.status === 'completed'
                    ? 'Done'
                    : 'Check when done'
                  : `${item.actual} / ${item.target} ${units[item.unit]}`}
              {item.preview ? ' · Planned' : ''}
            </small>
          </button>
          <button
            className="activity-edit"
            aria-label={`Edit ${item.name}`}
            onClick={() => {
              setError('')
              setEditing(item)
            }}
          >
            ···
          </button>
        </div>
      ))}
      {editing && (
        <EditActivity
          key={editing.activity_id}
          item={editing}
          busy={busy}
          error={error}
          close={() => setEditing(null)}
          save={(changes) => save(editing, changes)}
        />
      )}
      {adding && (
        <AddActivity
          date={date}
          activities={activities.filter((item) => !item.archived_on)}
          items={items}
          close={() => setAdding(false)}
          changed={() => {
            setAdding(false)
            changed()
          }}
        />
      )}
    </section>
  )
}

function EditActivity({
  item,
  busy,
  error,
  close,
  save,
}: {
  item: ActivityDay
  busy: boolean
  error: string
  close: () => void
  save: (value: Partial<ActivityDay>) => Promise<void>
}) {
  return (
    <Dialog title={item.name} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          void save({
            target: item.unit === 'checkbox' ? null : Number(data.get('target')),
            actual: item.unit === 'checkbox' ? 0 : Number(data.get('actual')),
            status: item.status === 'skipped' ? 'pending' : item.status,
          }).catch(() => {})
        }}
      >
        <p>Changes apply only to this day. Recurring targets stay unchanged.</p>
        {item.unit !== 'checkbox' && (
          <>
            <label>
              Target ({units[item.unit]})
              <input
                name="target"
                type="number"
                min="0.01"
                max="999999999"
                step="0.01"
                defaultValue={item.target!}
                required
              />
            </label>
            <label>
              Completed ({units[item.unit]})
              <input
                name="actual"
                type="number"
                min="0"
                max="999999999"
                step="0.01"
                defaultValue={item.actual}
                required
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ status: item.status === 'skipped' ? 'pending' : 'skipped' }).catch(() => {})}
          >
            {item.status === 'skipped' ? 'Undo skip' : 'Skip this day'}
          </button>
          <button className="primary" disabled={busy} type="submit">
            Save changes
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function AddActivity({
  date,
  activities,
  items,
  close,
  changed,
}: {
  date: string
  activities: Activity[]
  items: ActivityDay[]
  close: () => void
  changed: () => void
}) {
  const [selected, setSelected] = useState('new')
  const [unit, setUnit] = useState<Unit>('repetitions')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = activities.find((item) => String(item.id) === selected)
  const selectedUnit = existing?.unit ?? unit
  return (
    <Dialog title="Add an activity" close={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setBusy(true)
          const data = new FormData(event.currentTarget)
          try {
            const activity =
              existing ?? (await api<Activity>('POST', '/api/daily/activities', { name: data.get('name'), unit }))
            await api('PUT', `/api/daily/days/${date}/activities/${activity.id}`, {
              target: selectedUnit === 'checkbox' ? null : Number(data.get('target')),
              actual: 0,
              status: 'pending',
              revision: 0,
            })
            changed()
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Could not add activity.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <p>Add a checklist item for this day. Set up repeating days in Manage activities.</p>
        <label>
          Activity
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="new">Create a new activity</option>
            {activities
              .filter((activity) => !items.some((item) => item.activity_id === activity.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        {!existing && (
          <>
            <label>
              Name
              <input name="name" maxLength={100} placeholder="Push-ups, walking, reading…" required />
            </label>
            <label>
              Track by
              <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                <option value="repetitions">Repetitions</option>
                <option value="metres">Distance (metres)</option>
                <option value="seconds">Time (seconds)</option>
                <option value="checkbox">Just a checkbox</option>
              </select>
            </label>
          </>
        )}
        {selectedUnit !== 'checkbox' && (
          <label>
            Daily target ({units[selectedUnit]})
            <input name="target" type="number" min="0.01" max="999999999" step="0.01" defaultValue={20} required />
          </label>
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
          <button type="submit" className="primary" disabled={busy}>
            Add to this day
          </button>
        </div>
      </form>
    </Dialog>
  )
}
