import { test, expect, type Page } from '@playwright/test'

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
