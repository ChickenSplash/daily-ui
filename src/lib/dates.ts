// Calendar dates are strings, never instants. Noon avoids daylight-saving transitions.
export const parseDate = (date: string) => new Date(`${date}T12:00:00`)
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(date: string, amount: number): string {
  const value = parseDate(date)
  value.setDate(value.getDate() + amount)
  return dateKey(value)
}
export const displayDate = (date: string) =>
  parseDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export function monthGrid(month: string): string[] {
  const first = parseDate(`${month}-01`)
  const start = addDays(dateKey(first), -((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}
export function validDate(date: string | null): date is string {
  return (
    !!date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= '1900-01-01' &&
    date <= '2100-12-31' &&
    dateKey(parseDate(date)) === date
  )
}
export const units = { repetitions: 'reps', metres: 'm', seconds: 's', checkbox: '' }
export function download(content: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
