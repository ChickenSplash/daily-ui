import { useState } from 'react'
import { api } from '../lib/api'
import { units } from '../lib/dates'
import type { ActivityDay, Activity, Bootstrap, Unit } from '../lib/types'
import { Dialog } from './Dialog'
import { ManageActivities } from './Manage'
import { Select } from './Select'

export function Activities({
  items,
  date,
  data,
  changed,
}: {
  items: ActivityDay[]
  date: string
  data: Bootstrap
  changed: () => void
}) {
  const [editing, setEditing] = useState<ActivityDay | null>(null)
  const [adding, setAdding] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('daily-activities-collapsed') === 'true'
    } catch {
      return false
    }
  })
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
    <section className={`activity-card ${collapsed ? 'collapsed' : ''}`} aria-label="Daily activities">
      <header>
        <button
          className="activity-title"
          aria-label="Activities"
          aria-expanded={!collapsed}
          aria-controls="daily-activities-body"
          onClick={() => {
            const value = !collapsed
            setCollapsed(value)
            try {
              localStorage.setItem('daily-activities-collapsed', String(value))
            } catch {
              /* Optional preference. */
            }
          }}
        >
          <h2>
            Activities{' '}
            <small>
              {rows.filter((item) => item.status === 'completed').length}/{items.length}
            </small>
          </h2>
          <span className="collapse-icon" aria-hidden="true">
            {collapsed ? '＋' : '−'}
          </span>
        </button>
        <button
          className="text-button activity-add"
          onClick={() => {
            setError('')
            setAdding(true)
          }}
        >
          ＋ Add
        </button>
      </header>
      <div className="activity-body journal-body" id="daily-activities-body" inert={collapsed} aria-hidden={collapsed}>
        <div className="journal-body-inner">
          <div className="activity-content">
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
          </div>
        </div>
      </div>
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
        <ActivityDialog date={date} data={data} items={items} close={() => setAdding(false)} changed={changed} />
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

function ActivityDialog({
  date,
  data,
  items,
  close,
  changed,
}: {
  date: string
  data: Bootstrap
  items: ActivityDay[]
  close: () => void
  changed: () => void
}) {
  const [tab, setTab] = useState<'add' | 'manage'>('add')
  return (
    <Dialog title="Activities" close={close}>
      <div className="activity-tabs" role="tablist" aria-label="Activities">
        {(['add', 'manage'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            id={`activity-tab-${value}`}
            aria-controls={`activity-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const next =
                  event.key === 'Home' ? 'add' : event.key === 'End' ? 'manage' : value === 'add' ? 'manage' : 'add'
                setTab(next)
                document.getElementById(`activity-tab-${next}`)?.focus()
              }
            }}
          >
            {value === 'add' ? 'Add activity' : 'Manage activities'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="activity-panel-add" aria-labelledby="activity-tab-add" hidden={tab !== 'add'}>
        <AddActivity
          date={date}
          activities={data.activities.filter((item) => !item.archived_on)}
          items={items}
          close={close}
          changed={() => {
            changed()
            close()
          }}
        />
      </div>
      <div role="tabpanel" id="activity-panel-manage" aria-labelledby="activity-tab-manage" hidden={tab !== 'manage'}>
        <ManageActivities data={data} changed={changed} />
      </div>
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
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (existing && items.some((item) => item.activity_id === existing.id)) {
          setError('This activity is already on this day.')
          return
        }
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
      <p>Add a checklist item for this day. Set up repeating days in the Manage activities tab.</p>
      <Select
        label="Activity"
        value={selected}
        onChange={setSelected}
        disabled={busy}
        options={[
          { value: 'new', label: 'Create a new activity' },
          ...activities
            .filter((activity) => !items.some((item) => item.activity_id === activity.id))
            .map((activity) => ({ value: String(activity.id), label: activity.name, group: 'Available activities' })),
          ...activities
            .filter((activity) => items.some((item) => item.activity_id === activity.id))
            .map((activity) => ({
              value: String(activity.id),
              label: activity.name,
              group: 'Already on this day',
              disabled: true,
              hint: 'Already added',
            })),
        ]}
      />
      {!existing && (
        <>
          <label>
            Name
            <input name="name" maxLength={100} placeholder="Push-ups, walking, reading…" required />
          </label>
          <Select
            label="Track by"
            value={unit}
            onChange={(value) => setUnit(value as Unit)}
            disabled={busy}
            options={[
              { value: 'repetitions', label: 'Repetitions' },
              { value: 'metres', label: 'Distance (metres)' },
              { value: 'seconds', label: 'Time (seconds)' },
              { value: 'checkbox', label: 'Just a checkbox' },
            ]}
          />
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
  )
}
