import { test, expect, type Page } from '@playwright/test'
import { addDays } from '../src/lib/dates'

async function join(page: Page) {
  await page.context().setExtraHTTPHeaders({
    'CF-Connecting-IP': `10.${Math.ceil(Math.random() * 250)}.${Math.ceil(Math.random() * 250)}.${Math.ceil(Math.random() * 250)}`,
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Join as guest', exact: true }).click()
  await page.getByLabel('Display name').fill('Daily tester')
  const terms = page.getByRole('checkbox', { name: /agree to the terms/ })
  await terms.focus()
  await terms.press('Space')
  await expect(terms).toBeChecked()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Daily journal', exact: true })).toBeVisible()
}
const section = (page: Page, name = 'Daily journal') =>
  page.getByRole('region', { name: `${name} section`, exact: true })
async function saved(page: Page, name = 'Daily journal') {
  await expect(section(page, name).getByRole('status')).toHaveText('✓ Saved')
}

for (const offset of [-7, 7]) {
  test(`activities can be checked and totals edited on a ${offset < 0 ? 'past' : 'future'} date`, async ({ page }) => {
    await join(page)
    const today = new URL(page.url()).searchParams.get('date')!
    await page.goto(`/?date=${addDays(today, offset)}`)
    await page.getByRole('button', { name: '＋ Add', exact: true }).click()
    const add = page.getByRole('dialog', { name: 'Add an activity', exact: true })
    await add.getByLabel('Name', { exact: true }).fill('Any-date push-ups')
    await add.getByRole('button', { name: 'Add to this day' }).click()
    const checkbox = page.getByRole('checkbox', { name: 'Complete Any-date push-ups', exact: true })
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
    await expect(checkbox).not.toBeChecked()
    await page.getByRole('button', { name: 'Edit Any-date push-ups', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Any-date push-ups', exact: true })
    await edit.getByLabel('Completed (reps)').fill('12')
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(edit).not.toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /Any-date push-ups.*12 \/ 20/ })).toBeVisible()
    await page.getByRole('button', { name: 'Edit Any-date push-ups', exact: true }).click()
    await edit.getByLabel('Completed (reps)').fill('25')
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(edit).not.toBeVisible()
    await expect(checkbox).toBeChecked()
    await page.getByRole('button', { name: 'Edit Any-date push-ups', exact: true }).click()
    await edit.getByRole('button', { name: 'Skip this day', exact: true }).click()
    await expect(page.getByRole('button', { name: /Any-date push-ups.*Skipped/ })).toBeVisible()
  })
}

test('shared sign-in, independent Markdown journals, date navigation and reload', async ({ page }) => {
  await join(page)
  const editor = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  await editor.fill('A lovely day in Norfolk.')
  await saved(page)
  const gratitude = page.getByRole('textbox', { name: 'Gratitude journal', exact: true })
  await gratitude.fill('Grateful for a quiet morning.')
  await saved(page, 'Gratitude journal')
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect(editor).toBeEmpty()
  await editor.fill('Yesterday was good too.')
  // Navigate immediately: pending autosaves must outlive their editor.
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(editor).toHaveText('A lovely day in Norfolk.')
  await page.reload()
  await expect(gratitude).toHaveText('Grateful for a quiet morning.')
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect(editor).toHaveText('Yesterday was good too.')
})

test('rich formatting is stored as Markdown and exports privately', async ({ page }) => {
  await join(page)
  await section(page).getByRole('button', { name: 'Bold', exact: true }).click()
  await page.getByRole('textbox', { name: 'Daily journal', exact: true }).pressSequentially('A strong thought')
  await saved(page)
  const result = await page.evaluate(async () => (await fetch('/api/daily/export')).json())
  expect(result.journals[0].entries[0].body).toContain('**A strong thought**')
  const download = page.waitForEvent('download')
  await section(page).getByRole('button', { name: 'Download Markdown', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.md$/)
})

test('one-off totals, complete, undo and skip', async ({ page }) => {
  await join(page)
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  const add = page.getByRole('dialog', { name: 'Add an activity', exact: true })
  await add.getByLabel('Name', { exact: true }).fill('Push-ups')
  await add.getByRole('button', { name: 'Add to this day' }).click()
  const complete = page.getByRole('checkbox', { name: 'Complete Push-ups' })
  await expect(complete).toBeVisible()
  await complete.check()
  await expect(complete).toBeChecked()
  await expect(page.getByRole('button', { name: /Push-ups.*20 \/ 20/ })).toBeVisible()
  await complete.uncheck()
  await expect(complete).not.toBeChecked()
  await page.getByRole('button', { name: 'Edit Push-ups', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Push-ups', exact: true })
  await edit.getByLabel('Completed (reps)').fill('12')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: /Push-ups.*12 \/ 20/ })).toBeVisible()
  await page.getByRole('button', { name: 'Edit Push-ups', exact: true }).click()
  await edit.getByRole('button', { name: 'Skip this day' }).click()
  await expect(page.getByRole('button', { name: /Push-ups.*Skipped/ })).toBeVisible()
})

test('journals can be created, archived, restored and deleted', async ({ page }) => {
  await join(page)
  await page.getByRole('button', { name: /Manage journals/ }).click()
  await page.getByRole('button', { name: '＋ New journal' }).click()
  const form = page.getByRole('dialog', { name: 'New journal', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Dreams')
  await form.getByLabel('Writing prompt').fill('What stayed with you?')
  await form.getByRole('button', { name: 'Save journal' }).click()
  const manager = page.getByRole('dialog', { name: 'Manage journals', exact: true })
  const item = manager.locator('.manage-item').filter({ hasText: 'Dreams' })
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(item.getByRole('button', { name: 'Restore' })).toBeVisible()
  await item.getByRole('button', { name: 'Restore' }).click()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Permanently delete journal?' })
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE')
  await confirm.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(item).toHaveCount(0)
})

test('recurring activities, mobile layout and guest deletion warning', async ({ page }, testInfo) => {
  await join(page)
  await page
    .getByRole('navigation', { name: 'Manage', exact: true })
    .getByRole('button', { name: /Manage activities/ })
    .click()
  await page.getByRole('button', { name: '＋ New activity' }).click()
  const form = page.getByRole('dialog', { name: 'New activity', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Pull-ups')
  await form.getByRole('button', { name: 'Create activity', exact: true }).click()
  const schedule = page.getByRole('dialog', { name: 'Activity and routine' })
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    await schedule.getByRole('button', { name: day, exact: true }).click()
  await schedule.getByRole('button', { name: 'Save routine' }).click()
  await expect(schedule).not.toBeVisible()
  await page
    .getByRole('dialog', { name: 'Manage activities', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.getByRole('checkbox', { name: 'Complete Pull-ups' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: '/tmp/opencode/daily-desktop.png', fullPage: true })
  if (testInfo.project.name === 'mobile')
    await page.screenshot({ path: '/tmp/opencode/daily-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Daily tester' }).click()
  const logout = page.getByRole('dialog', { name: 'Log out and delete guest data?' })
  await expect(logout).toContainText('permanently deletes')
  await logout.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Homelab accounts' })).toBeVisible()
})

test('two tabs cannot silently overwrite the same entry', async ({ page }) => {
  await join(page)
  const other = await page.context().newPage()
  await other.goto(page.url())
  const original = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  const stale = other.getByRole('textbox', { name: 'Daily journal', exact: true })
  await expect(stale).toBeVisible()
  let releaseResponse!: () => void
  let firstStored!: () => void
  const held = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  const stored = new Promise<void>((resolve) => {
    firstStored = resolve
  })
  await page.route('**/api/daily/journals/*/entries/*', async (route) => {
    const response = await route.fetch()
    firstStored()
    await held
    await route.fulfill({ response })
  })
  await original.fill('First tab wins')
  await stored
  await stale.fill('Second tab draft')
  await expect(section(other).getByRole('status')).toContainText('Changed in another tab')
  // First tab's delayed success must not delete the second tab's recovery draft.
  releaseResponse()
  await saved(page)
  await expect(stale).toHaveText('Second tab draft')
  await other.reload()
  await expect(stale).toHaveText('Second tab draft')
  await expect(section(other).getByRole('status')).toContainText('Changed in another tab')
  await other.close()
})

test('failed saves retain a recoverable draft and can be retried', async ({ page }) => {
  await join(page)
  await page.route('**/api/daily/journals/*/entries/*', (route) => route.abort())
  const editor = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  await editor.fill('Keep this even when the connection drops.')
  await expect(section(page).getByRole('status')).toContainText('Couldn’t save')
  await page.reload()
  await expect(editor).toHaveText('Keep this even when the connection drops.')
  await page.unroute('**/api/daily/journals/*/entries/*')
  await section(page).getByRole('button', { name: 'Retry save' }).click()
  await saved(page)
})

test('raw HTML is inert while code and quotations remain intact', async ({ page }) => {
  await join(page)
  const body =
    '<script>window.__dailyXss = true</script>\n\n![Remote](https://example.invalid/tracker.png)\n\n```html\n<div>Hello</div>\n```\n\n> A quotation'
  await page.evaluate(async (body) => {
    await fetch('/sanctum/csrf-cookie')
    const bootstrap = await (await fetch('/api/daily/bootstrap')).json()
    const token = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)![1]
    const response = await fetch(`/api/daily/journals/${bootstrap.journals[0].id}/entries/${bootstrap.today}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-XSRF-TOKEN': decodeURIComponent(token),
      },
      body: JSON.stringify({ body, revision: 0 }),
    })
    if (!response.ok) throw new Error('Could not seed Markdown')
  }, body)
  await page.reload()
  const editor = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  await expect(editor).toContainText('<script>window.__dailyXss = true</script>')
  await expect(editor.locator('script, img, iframe')).toHaveCount(0)
  await expect(editor.locator('pre')).toHaveText('<div>Hello</div>')
  await expect(editor.locator('blockquote')).toHaveText('A quotation')
  await editor.click()
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('More thoughts')
  await saved(page)
  const result = await page.evaluate(async () => (await fetch('/api/daily/export')).json())
  expect(result.journals[0].entries[0].body).toContain('<div>Hello</div>')
  expect(await page.evaluate(() => '__dailyXss' in window)).toBe(false)
})

test('settings keeps the export section concise and downloads all data', async ({ page }) => {
  await join(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(
    settings.getByText(
      'Export journals as Markdown text inside a JSON file, together with all routines and daily totals.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(settings).not.toContainText('Individual entries also')
  await expect(settings).not.toContainText('Only unsaved recovery drafts')
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Download all data', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('daily-export.json')
})

test('archived activities can be deleted with confirmation or kept by cancelling', async ({ page }) => {
  await join(page)
  await page
    .getByRole('navigation', { name: 'Manage', exact: true })
    .getByRole('button', { name: /Manage activities/ })
    .click()
  await page.getByRole('button', { name: '＋ New activity' }).click()
  const form = page.getByRole('dialog', { name: 'New activity', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Temporary activity')
  await form.getByRole('button', { name: 'Create activity', exact: true }).click()
  const routine = page.getByRole('dialog', { name: 'Activity and routine' })
  const tuesday = routine.getByRole('button', { name: 'Tue', exact: true })
  await tuesday.click()
  await expect(tuesday).toHaveAttribute('aria-pressed', 'true')
  await expect(tuesday).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
  await routine.getByRole('button', { name: 'Save routine' }).click()
  await expect(routine).not.toBeVisible()
  const manager = page.getByRole('dialog', { name: 'Manage activities', exact: true })
  const item = manager.locator('.manage-item').filter({ hasText: 'Temporary activity' })
  await expect(item.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Permanently delete activity?' })
  await expect(confirmation).toContainText('all its daily progress records')
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await expect(item).toHaveCount(0)
})

test('month heading and arrows have padded hover areas matching the days', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await join(page)
  const calendar = page.getByRole('region', { name: 'Calendar', exact: true })
  const title = calendar.locator('.month-title')
  if (!(await calendar.locator('.month-grid').isVisible())) await title.click()
  const day = calendar.locator('.date-cell:not(.selected):not(.outside)').first()
  await day.hover()
  const reference = await day.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, radius: style.borderRadius, height: style.height }
  })
  for (const button of [
    title,
    calendar.getByRole('button', { name: 'Previous month', exact: true }),
    calendar.getByRole('button', { name: 'Next month', exact: true }),
  ]) {
    await button.hover()
    await expect(button).toHaveCSS('background-color', reference.background)
    await expect(button).toHaveCSS('border-radius', reference.radius)
    await expect(button).toHaveCSS('height', reference.height)
  }
  expect(await title.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(
    12,
  )
  expect(await title.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight))).toBeGreaterThanOrEqual(
    12,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('calendar is centred with only a today dot and collapsed journal padding is balanced', async ({
  page,
}, testInfo) => {
  await join(page)
  const calendar = page.getByRole('region', { name: 'Calendar', exact: true })
  const expandMonth = async () => {
    if (!(await calendar.locator('.month-grid').isVisible())) await calendar.locator('.month-title').click()
  }
  await expandMonth()
  const today = calendar.locator('.date-cell[aria-current="date"]')
  await expect(today.locator('.today-dot')).toHaveCount(1)
  await expect(calendar.locator('.today-dot:visible')).toHaveCount(1)
  await expect(calendar.locator('.date-markers, .writing-dot, .calendar-legend')).toHaveCount(0)
  const other = calendar.locator('.date-cell:not(.today):not(.outside)').first()
  const ordinaryColour = await other.evaluate((element) => getComputedStyle(element).color)
  await expect(today).toHaveCSS('color', ordinaryColour)
  await expect(today.locator('span')).toHaveCSS('text-decoration-line', 'none')
  const alignment = await today.evaluate((element) => {
    const cell = element.getBoundingClientRect()
    const number = element.querySelector('span')!.getBoundingClientRect()
    return Math.abs(number.y + number.height / 2 - (cell.y + cell.height / 2))
  })
  expect(alignment).toBeLessThan(1)
  await expect(today).toHaveCSS('box-shadow', 'none')
  await expect(today).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
  await other.click()
  await expandMonth()
  await expect(today.locator('.today-dot')).toHaveCount(1)
  await expect(today).toHaveCSS('color', ordinaryColour)
  const journal = section(page)
  await journal.getByRole('button', { name: /Daily journal/ }).click()
  await expect(journal).toHaveClass(/collapsed/)
  const spacing = await journal.locator('header').evaluate((element) => {
    const style = getComputedStyle(element)
    return { top: style.paddingTop, bottom: style.paddingBottom }
  })
  expect(spacing.bottom).toBe(spacing.top)
  await expect(journal.locator('.journal-title')).toHaveCSS('padding-bottom', '0px')
  if (testInfo.project.name !== 'firefox')
    await page.screenshot({ path: `/tmp/opencode/daily-tweaks-${testInfo.project.name}.png`, fullPage: true })
})
