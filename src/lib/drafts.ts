import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import type { Entry } from './types'

export type Draft = {
  body: string
  revision: number
  savedBody: string
  state: 'saved' | 'editing' | 'saving' | 'error' | 'conflict'
  error?: string
}

/** Lives above day panels, so switching dates never cancels a pending save. */
export class Drafts {
  private values = new Map<string, Draft>()
  private listeners = new Set<() => void>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private inFlight = new Set<string>()
  private user: string
  private tab: string
  constructor(user: string) {
    this.user = user
    this.tab = crypto.randomUUID()
    try {
      this.tab = sessionStorage.getItem('daily-tab') ?? this.tab
      sessionStorage.setItem('daily-tab', this.tab)
    } catch {
      /* Recovery may be unavailable if browser storage is blocked. */
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private notify() {
    this.listeners.forEach((listener) => listener())
  }
  private storageKey(key: string) {
    // A successful save in one tab must never clear another tab's recovery draft.
    return `daily-draft:${this.user}:${key}:${this.tab}`
  }
  private persist(key: string, draft: Draft) {
    try {
      if (draft.body === draft.savedBody) localStorage.removeItem(this.storageKey(key))
      else localStorage.setItem(this.storageKey(key), JSON.stringify({ body: draft.body, revision: draft.revision }))
    } catch {
      /* Saving to HMS still works when browser storage is unavailable. */
    }
  }
  get(key: string, entry?: Entry | null): Draft {
    if (!this.values.has(key)) {
      let draft: Draft = {
        body: entry?.body ?? '',
        savedBody: entry?.body ?? '',
        revision: entry?.revision ?? 0,
        state: 'saved',
      }
      try {
        const value = localStorage.getItem(this.storageKey(key))
        if (value) {
          const stored = JSON.parse(value)
          if (typeof stored.body === 'string' && Number.isInteger(stored.revision) && stored.body !== draft.body) {
            draft = {
              ...draft,
              body: stored.body,
              revision: stored.revision,
              state: stored.revision === draft.revision ? 'error' : 'conflict',
              error: 'Recovered an unsaved draft from this browser.',
            }
          }
        }
      } catch {
        /* Ignore unavailable storage or invalid recovery data. */
      }
      this.values.set(key, draft)
    }
    return this.values.get(key)!
  }
  edit(key: string, body: string) {
    const draft = this.values.get(key)!
    const next: Draft = { ...draft, body, state: draft.state === 'conflict' ? 'conflict' : 'editing' }
    this.values.set(key, next)
    this.persist(key, next)
    clearTimeout(this.timers.get(key))
    if (next.state !== 'conflict')
      this.timers.set(
        key,
        setTimeout(() => this.save(key), 800),
      )
    this.notify()
  }
  async save(key: string) {
    const draft = this.values.get(key)!
    if (this.inFlight.has(key) || draft.state === 'conflict' || draft.body === draft.savedBody) return
    this.inFlight.add(key)
    this.values.set(key, { ...draft, state: 'saving', error: undefined })
    this.notify()
    const [journal, date] = key.split('/')
    let failed = false
    try {
      const entry = await api<Entry>('PUT', `/api/daily/journals/${journal}/entries/${date}`, {
        body: draft.body,
        revision: draft.revision,
      })
      const current = this.values.get(key)!
      const next: Draft = {
        ...current,
        savedBody: entry.body,
        revision: entry.revision,
        state: current.body === entry.body ? 'saved' : 'editing',
        error: undefined,
      }
      this.values.set(key, next)
      this.persist(key, next)
    } catch (error) {
      failed = true
      this.values.set(key, {
        ...this.values.get(key)!,
        state: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
        error: error instanceof Error ? error.message : 'Could not save. Your draft is still here.',
      })
    } finally {
      this.inFlight.delete(key)
      this.notify()
      if (!failed && this.values.get(key)!.state === 'editing') void this.save(key)
    }
  }
  hasUnsaved = () => [...this.values.values()].some((draft) => draft.body !== draft.savedBody)
  async flush() {
    await Promise.all([...this.values.keys()].map((key) => this.save(key)))
  }
  useSaved(key: string, entry: Entry | null) {
    const draft: Draft = {
      body: entry?.body ?? '',
      savedBody: entry?.body ?? '',
      revision: entry?.revision ?? 0,
      state: 'saved',
    }
    this.values.set(key, draft)
    this.persist(key, draft)
    this.notify()
  }
  clearRecovery() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`daily-draft:${this.user}:`))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      /* Storage is optional. */
    }
  }
}

export function useDraft(drafts: Drafts, key: string, entry?: Entry | null) {
  return useSyncExternalStore(drafts.subscribe, () => drafts.get(key, entry))
}
