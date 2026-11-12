export type User = { id: string; display_name: string; is_guest: boolean }
export type Entry = { id: number; body: string; revision: number; entry_date: string }
export type Journal = {
  id: number
  name: string
  prompt: string
  archived_at: string | null
  position: number
  entry?: Entry | null
}
export type Unit = 'repetitions' | 'metres' | 'seconds' | 'checkbox'
export type Rule = { id: number; starts_on: string; ends_on: string | null; weekdays: number[]; target: number | null }
export type Activity = { id: number; name: string; unit: Unit; archived_on: string | null; rules: Rule[] }
export type ActivityDay = {
  activity_id: number
  activity_date: string
  name: string
  unit: Unit
  target: number | null
  actual: number
  status: 'pending' | 'completed' | 'skipped'
  revision: number
  preview: boolean
}
export type Bootstrap = { timezone: string; today: string; journals: Journal[]; activities: Activity[] }
export type Day = { date: string; journals: Journal[]; activities: ActivityDay[] }
export type Summary = { date: string; entries: number; total: number; completed: number; skipped: number }
