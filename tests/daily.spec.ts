import { test, expect, type Page } from '@playwright/test'
import { addDays, displayDayHeading, displayShortDayHeading } from '../src/lib/dates'

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

test('dark and light themes use neutral surfaces and accents without changing motion', async ({ page }) => {
  await join(page)
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const palette = await page.locator('html').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        colours: ['bg', 'panel', 'raised', 'hover', 'line', 'text', 'muted', 'accent', 'accent-bg', 'field'].map(
          (token) => style.getPropertyValue(`--${token}`).trim(),
        ),
        motion: style.getPropertyValue('--motion-duration').trim(),
      }
    })
    for (const colour of palette.colours) {
      expect(colour).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i)
      const hex =
        colour.length === 4
          ? colour
              .slice(1)
              .split('')
              .map((digit) => digit.repeat(2))
              .join('')
          : colour.slice(1)
      expect(hex.slice(0, 2)).toBe(hex.slice(2, 4))
      expect(hex.slice(2, 4)).toBe(hex.slice(4, 6))
    }
    const durationMs = parseFloat(palette.motion) * (palette.motion.endsWith('ms') ? 1 : 1000)
    expect(durationMs).toBeCloseTo(280)
    await page.screenshot({
      path: `/tmp/opencode/daily-neutral-${theme}-${test.info().project.name}.png`,
      fullPage: true,
    })
  }
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('activity picker is themed and groups already-added activities without allowing duplicates', async ({
  page,
}, testInfo) => {
  await join(page)
  const add = page.getByRole('dialog', { name: 'Activities', exact: true })
  for (const name of ['Walking', 'Reading']) {
    await page.getByRole('button', { name: '＋ Add', exact: true }).click()
    await add.getByLabel('Name', { exact: true }).fill(name)
    await add.getByRole('button', { name: 'Add to this day', exact: true }).click()
    await expect(add).not.toBeVisible()
  }
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(page.locator('.day-sections')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await add.getByLabel('Name', { exact: true }).fill('Stretching')
  await add.getByRole('button', { name: 'Add to this day', exact: true }).click()
  await expect(add).not.toBeVisible()
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect(page.locator('.day-sections')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  const picker = add.getByRole('combobox', { name: 'Activity', exact: true })
  await picker.click()
  const menu = add.getByRole('listbox', { name: 'Activity', exact: true })
  await expect(menu.getByRole('option')).toHaveText([
    'Create a new activity✓',
    'Stretching',
    'ReadingAlready added',
    'WalkingAlready added',
  ])
  await expect(menu.getByRole('group', { name: 'Available activities', exact: true }).getByRole('option')).toHaveCount(
    1,
  )
  await expect(menu.getByRole('group', { name: 'Already on this day', exact: true }).getByRole('option')).toHaveCount(2)
  const walking = menu.getByRole('option', { name: 'Walking Already added', exact: true })
  await expect(walking).toHaveAttribute('aria-disabled', 'true')
  await walking.dispatchEvent('click')
  await expect(picker).toContainText('Create a new activity')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveCSS(
    'background-color',
    await picker.evaluate((element) => getComputedStyle(element).backgroundColor),
  )
  await expect(menu).toHaveCSS('border-radius', '8px')
  if (testInfo.project.name !== 'firefox')
    await page.screenshot({ path: `/tmp/opencode/daily-picker-${testInfo.project.name}.png`, fullPage: true })
  await picker.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(add).toBeVisible()
  await picker.press('ArrowDown')
  await picker.press('End')
  await picker.press('Enter')
  await expect(picker).toContainText('Stretching')
  await expect(add.getByLabel('Name', { exact: true })).toHaveCount(0)
  await add.getByRole('button', { name: 'Add to this day', exact: true }).click()
  await expect(add).not.toBeVisible()
  await expect(page.getByRole('region', { name: 'Daily activities', exact: true }).getByRole('checkbox')).toHaveCount(3)
})

test('editor placeholder only appears for an empty document, never after spaces or line breaks', async ({ page }) => {
  await join(page)
  for (const name of ['Daily journal', 'Gratitude journal']) {
    const editor = page.getByRole('textbox', { name, exact: true })
    const placeholder = () => editor.evaluate((element) => getComputedStyle(element, '::before').content)
    await expect(editor).toHaveAttribute('data-empty', 'true')
    expect(await placeholder()).not.toBe('none')
    await editor.click()
    for (const word of ['Hello', 'world', 'again']) {
      await editor.pressSequentially(word)
      await editor.press('Space')
      await expect(editor).toHaveAttribute('data-empty', 'false')
      expect(await placeholder()).toBe('none')
    }
    await editor.press('Shift+Enter')
    expect(await placeholder()).toBe('none')
    await editor.press('Enter')
    expect(await placeholder()).toBe('none')
    await editor.fill(' ')
    expect(await placeholder()).toBe('none')
    await editor.fill('')
    await expect(editor).toHaveAttribute('data-empty', 'true')
    expect(await placeholder()).not.toBe('none')
    await editor.pressSequentially('Keep this text ')
    await saved(page, name)
  }
  await page.reload()
  for (const name of ['Daily journal', 'Gratitude journal']) {
    const editor = page.getByRole('textbox', { name, exact: true })
    await expect(editor).toHaveAttribute('data-empty', 'false')
    expect(await editor.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none')
  }
})

test('journal prompts stay in the clickable header while only the editor folds', async ({ page }) => {
  await join(page)
  const journal = section(page)
  const title = journal.locator('.journal-title')
  const prompt = title.locator('.journal-prompt')
  await expect(prompt).toBeVisible()
  const top = await prompt.evaluate((element) => element.getBoundingClientRect().top)
  await title.click({ position: { x: 5, y: 5 } })
  await expect(title).toHaveAttribute('aria-expanded', 'false')
  await expect(journal.locator('.journal-body')).toBeHidden()
  await expect(prompt).toBeVisible()
  expect(await prompt.evaluate((element) => element.getBoundingClientRect().top)).toBe(top)
  await prompt.click()
  await expect(title).toHaveAttribute('aria-expanded', 'true')
  await expect(journal.getByRole('toolbar')).toBeVisible()
  expect(await prompt.evaluate((element) => element.getBoundingClientRect().top)).toBe(top)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prompt.hover()
  await expect(title.locator('.journal-symbol')).toHaveCount(0)
})

test('profile menu contains settings and logout, while Today lives beside next day', async ({ page }) => {
  await join(page)
  const profile = page.getByRole('button', { name: 'Daily tester', exact: true })
  const menu = page.getByRole('menu', { name: 'Profile', exact: true })
  const today = page.getByRole('button', { name: 'Today', exact: true })
  const originalDate = new URL(page.url()).searchParams.get('date')!
  await expect(today.locator('svg')).toBeVisible()
  await expect(today).toHaveText('')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0)
  await profile.click()
  await expect(profile).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('menuitem')).toHaveText(['Settings', 'Manage journals', 'Manage activities', 'Log out'])
  await menu.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(settings).toBeVisible()
  await expect(menu).not.toBeVisible()
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(profile).toBeFocused()
  await profile.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Manage journals', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  const journals = page.getByRole('dialog', { name: 'Manage journals', exact: true })
  await expect(journals).toBeVisible()
  await journals.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(profile).toBeFocused()
  await profile.click()
  await menu.getByRole('menuitem', { name: 'Manage activities', exact: true }).click()
  const activities = page.getByRole('dialog', { name: 'Manage activities', exact: true })
  await expect(activities).toBeVisible()
  await expect(menu).not.toBeVisible()
  await activities.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(profile).toBeFocused()
  await profile.press('ArrowUp')
  await expect(menu.getByRole('menuitem', { name: 'Log out', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(profile).toBeFocused()
  await expect(menu).not.toBeVisible()
  await profile.press('ArrowUp')
  await expect(menu.getByRole('menuitem', { name: 'Log out', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  const logout = page.getByRole('dialog', { name: 'Log out and delete guest data?' })
  await expect(logout).toBeVisible()
  await logout.getByRole('button', { name: 'Cancel', exact: true }).click()
  await profile.click()
  await page.locator('.guest-notice').click()
  await expect(menu).not.toBeVisible()
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`date=${addDays(originalDate, 1)}`))
  await today.click()
  await expect(page).toHaveURL(new RegExp(`date=${originalDate}`))
})

test('long activity menus float outside the modal and scroll independently', async ({ page }) => {
  await join(page)
  await page.route('**/api/daily/bootstrap', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.activities = Array.from({ length: 50 }, (_, index) => ({
      id: 500000 + index,
      name: `Available activity ${String(index + 1).padStart(2, '0')}`,
      unit: 'checkbox',
      archived_on: null,
      rules: [],
    }))
    await route.fulfill({ response, json: data })
  })
  await page.reload()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Activities', exact: true })
  const picker = dialog.getByRole('combobox', { name: 'Activity', exact: true })
  const menu = dialog.getByRole('listbox', { name: 'Activity', exact: true })
  await picker.click()
  await menu.getByRole('option', { name: 'Available activity 01', exact: true }).click()
  const height = await dialog.evaluate((element) => element.scrollHeight)
  await picker.click()
  expect(await menu.evaluate((element) => element.matches(':popover-open'))).toBe(true)
  expect(await dialog.evaluate((element) => element.scrollHeight)).toBe(height)
  const geometry = await menu.evaluate((element) => {
    const popup = element.getBoundingClientRect()
    const modal = element.closest('dialog')!.getBoundingClientRect()
    return {
      outside: popup.bottom > modal.bottom || popup.top < modal.top,
      fits: popup.top >= 0 && popup.bottom <= window.innerHeight,
      scrolls: element.scrollHeight > element.clientHeight,
    }
  })
  expect(geometry.outside).toBe(true)
  expect(geometry.fits).toBe(true)
  expect(geometry.scrolls).toBe(true)
  await picker.press('End')
  expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0)
  await picker.press('Enter')
  await expect(picker).toContainText('Available activity 50')
  await expect(menu).not.toBeVisible()
})

test('activities fold with shared motion while Add remains independently usable', async ({ page }) => {
  await join(page)
  const activities = page.getByRole('region', { name: 'Daily activities', exact: true })
  const toggle = activities.getByRole('button', { name: 'Activities', exact: true })
  const body = activities.locator('.activity-body')
  const alignment = await activities.evaluate((element) => {
    const indicator = element.querySelector('.collapse-icon')!.getBoundingClientRect()
    const add = element.querySelector('.activity-add')!.getBoundingClientRect()
    const journal = document.querySelector('.journal-title .collapse-icon')!.getBoundingClientRect()
    const padding = getComputedStyle(element.querySelector('.activity-title')!).padding
    return {
      afterAdd: indicator.left > add.right,
      aligned: Math.abs(indicator.right - journal.right),
      padding,
      journalPadding: getComputedStyle(document.querySelector('.journal-title')!).padding,
    }
  })
  expect(alignment.afterAdd).toBe(true)
  expect(alignment.aligned).toBeLessThan(1)
  expect(alignment.padding).toBe(alignment.journalPadding)
  await expect(page.getByText('A LITTLE EVERY DAY', { exact: true })).toHaveCount(0)
  await expect(body).toHaveCSS('transition-duration', '0.28s, 0.28s')
  await toggle.click({ position: { x: 5, y: 5 } })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toHaveAttribute('inert', '')
  await expect(body).toBeHidden()
  await activities.getByRole('button', { name: '＋ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Activities', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill('Foldable habit')
  await dialog.getByRole('button', { name: 'Add to this day', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const checkbox = activities.getByRole('checkbox', { name: 'Complete Foldable habit', exact: true })
  await expect(checkbox).toBeVisible()
  const completion = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().includes('/activities/'),
  )
  await checkbox.check()
  expect((await completion).ok()).toBe(true)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.click()
  await expect(body).toBeHidden()
  await expect(body).toHaveCSS('transition-duration', '0s')
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(checkbox).toBeChecked()
})

test('all dropdowns use the floating component and inputs share its border treatment', async ({ page }) => {
  await join(page)
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Activities', exact: true })
  const name = dialog.getByLabel('Name', { exact: true })
  const track = dialog.getByRole('combobox', { name: 'Track by', exact: true })
  for (const property of ['font-size', 'line-height', 'padding', 'min-height', 'border-radius'] as const) {
    const expected = await track.evaluate(
      (element, property) => getComputedStyle(element).getPropertyValue(property),
      property,
    )
    await expect(name).toHaveCSS(property, expected)
    await expect(dialog.getByLabel('Daily target (reps)')).toHaveCSS(property, expected)
  }
  const height = await track.evaluate((element) => element.getBoundingClientRect().height)
  expect(await name.evaluate((element) => element.getBoundingClientRect().height)).toBe(height)
  expect(height).toBe(44)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await track.hover()
  const border = await track.evaluate((element) => getComputedStyle(element).borderColor)
  await name.fill('A checkbox habit')
  await expect(name).toHaveCSS('border-color', border)
  await expect(name).toHaveCSS('outline-style', 'none')
  await track.click()
  await expect(dialog.getByRole('listbox', { name: 'Track by', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'Just a checkbox', exact: true }).click()
  await expect(dialog.getByLabel('Daily target (reps)')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Add to this day', exact: true }).click()
  await expect(page.getByRole('button', { name: /A checkbox habit.*Check when done/ })).toBeVisible()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await dialog.getByRole('tab', { name: 'Manage activities', exact: true }).click()
  await dialog.getByRole('button', { name: '＋ New activity', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'New activity', exact: true })
  await expect(create.getByRole('combobox', { name: 'Track by', exact: true })).toBeVisible()
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Daily tester', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  const timezone = settings.getByRole('combobox', { name: 'Your timezone', exact: true })
  await timezone.click()
  await timezone.press('a')
  await timezone.press('s')
  await timezone.press('i')
  await timezone.press('a')
  await timezone.press('Enter')
  await expect(timezone).toContainText('Asia/')
  const savedZone = page.waitForResponse(
    (response) => response.url().endsWith('/api/daily/settings') && response.request().method() === 'PATCH',
  )
  await settings.getByRole('button', { name: 'Save timezone', exact: true }).click()
  expect((await savedZone).ok()).toBe(true)
  await expect(page.locator('select')).toHaveCount(0)
})

test('day headings include the year and correct ordinal suffixes', () => {
  expect(displayDayHeading('2026-11-12')).toBe('Thursday, 12th November 2026')
  for (const [day, ordinal] of [
    ['01', '1st'],
    ['02', '2nd'],
    ['03', '3rd'],
    ['11', '11th'],
    ['13', '13th'],
    ['21', '21st'],
    ['22', '22nd'],
    ['23', '23rd'],
    ['31', '31st'],
  ]) {
    expect(displayDayHeading(`2026-12-${day}`)).toContain(`, ${ordinal} December 2026`)
  }
})

test('management lives in the profile menu and tabbed activity dialog', async ({ page }) => {
  await join(page)
  await expect(page.locator('.sidebar').getByRole('button', { name: /Manage/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Manage activities/ })).toHaveCount(0)
  await expect(page.getByText('A record of your days. Just for you.', { exact: true })).toHaveCount(0)
  await expect(page.locator('.day-sections .journal-manager')).toHaveCount(0)
  await page.getByRole('button', { name: 'Daily tester', exact: true }).click()
  const journalManager = page.getByRole('menuitem', { name: 'Manage journals', exact: true })
  await journalManager.click()
  await expect(page.getByRole('dialog', { name: 'Manage journals', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Activities', exact: true })
  const add = dialog.getByRole('tab', { name: 'Add activity', exact: true })
  const manage = dialog.getByRole('tab', { name: 'Manage activities', exact: true })
  await expect(add).toHaveAttribute('aria-selected', 'true')
  await dialog.getByLabel('Name', { exact: true }).fill('Retain my unfinished activity')
  await add.focus()
  await add.press('ArrowRight')
  await expect(manage).toBeFocused()
  await expect(manage).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByText('No activities yet. Start with one small habit.')).toBeVisible()
  await manage.press('ArrowLeft')
  await expect(add).toBeFocused()
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Retain my unfinished activity')
  await dialog.getByRole('button', { name: 'Add to this day', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Complete Retain my unfinished activity' })).toBeVisible()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await manage.click()
  await expect(dialog.locator('.manage-item').filter({ hasText: 'Retain my unfinished activity' })).toBeVisible()
})

test('day navigation keeps existing content visible and inert until the new day arrives', async ({ page }) => {
  await join(page)
  const editor = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  await editor.fill('Keep the previous day visible while loading.')
  await saved(page)
  const today = new URL(page.url()).searchParams.get('date')!
  const tomorrow = addDays(today, 1)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/api/daily/days/${tomorrow}`, async (route) => {
    await gate
    await route.continue()
  })
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  const content = page.locator('.day-sections')
  await expect(content).toHaveAttribute('aria-busy', 'true')
  await expect(content).toHaveAttribute('inert', '')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveText('Keep the previous day visible while loading.')
  await expect(page.getByText('Opening this day…', { exact: true })).toHaveCount(0)
  release()
  await expect(content).toHaveAttribute('aria-busy', 'false')
  await expect(content).not.toHaveAttribute('inert')
  await expect(editor).toBeEmpty()
  await editor.fill('This belongs to tomorrow.')
  await saved(page)
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect(editor).toHaveText('Keep the previous day visible while loading.')
  await expect(page.locator('.sidebar-note, .hms-link')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Your homelab apps/ })).toHaveCount(0)
})

test('failed day navigation shows an error and can be retried', async ({ page }) => {
  await join(page)
  const today = new URL(page.url()).searchParams.get('date')!
  const target = `**/api/daily/days/${addDays(today, 1)}`
  await page.route(target, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Day temporarily unavailable.' }),
    }),
  )
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Day temporarily unavailable.')
  await page.unroute(target)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Daily journal', exact: true })).toBeVisible()
  await expect(page.locator('.day-sections')).not.toHaveAttribute('inert')
})

test('calendar months slide vertically with shared timing and reduced-motion support', async ({ page }) => {
  await join(page)
  const calendar = page.getByRole('region', { name: 'Calendar', exact: true })
  const title = calendar.locator('.month-title')
  const initial = (await title.textContent())!
  for (const [button, direction] of [
    ['Next month', 'forward'],
    ['Previous month', 'backward'],
  ] as const) {
    await calendar.getByRole('button', { name: button, exact: true }).click()
    const incoming = calendar.locator('.calendar-incoming')
    await expect(calendar.locator('.calendar-viewport')).toHaveClass(`calendar-viewport calendar-slide-${direction}`)
    await expect(incoming).toBeVisible()
    await expect(incoming).toHaveCSS('animation-duration', '0.28s')
    await expect(incoming).toHaveCSS('animation-timing-function', 'ease-out')
    await expect(calendar.locator('.calendar-outgoing')).toHaveAttribute('inert', '')
    await expect(calendar.locator('.calendar-outgoing')).toHaveCount(0)
    await expect(calendar.locator('.date-cell')).toHaveCount(42)
  }
  await expect(title).toHaveText(initial)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click()
  await expect(calendar.locator('.calendar-incoming')).toHaveCSS('animation-name', 'none')
  await expect(calendar.locator('.calendar-outgoing')).toBeHidden()
  await expect(title).not.toHaveText(initial)
})

test('mobile dates stay on one line and shrink with the available space', async ({ page }) => {
  await join(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?date=2026-09-23')
  const title = page.locator('.day-heading h1')
  await expect(title).toHaveAccessibleName(displayDayHeading('2026-09-23'))
  let previousFontSize = Infinity
  for (const width of [980, 800, 758, 721, 720, 390, 320, 280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(title).toHaveJSProperty('innerText', displayShortDayHeading('2026-09-23'))
    const metrics = await title.evaluate((element) => {
      const text = element.querySelector('.date-short')!
      const range = document.createRange()
      range.selectNodeContents(text)
      return {
        lines: range.getClientRects().length,
        textWidth: range.getBoundingClientRect().width,
        availableWidth: element.getBoundingClientRect().width,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
        centreOffset: (() => {
          const header = element.closest('.day-heading')!
          const previous = header.querySelector('[aria-label="Previous day"]')!.getBoundingClientRect()
          const next = header.querySelector('[aria-label="Next day"]')!.getBoundingClientRect()
          const date = element.getBoundingClientRect()
          return Math.abs(date.x + date.width / 2 - (previous.right + next.left) / 2)
        })(),
      }
    })
    expect(metrics.lines).toBe(1)
    expect(metrics.centreOffset).toBeLessThan(1)
    expect(metrics.textWidth).toBeLessThanOrEqual(metrics.availableWidth)
    // The sidebar disappears at 720px, giving the heading more room again.
    if (width <= 390) expect(metrics.fontSize).toBeLessThanOrEqual(previousFontSize)
    previousFontSize = metrics.fontSize
  }
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(title).toHaveJSProperty('innerText', displayShortDayHeading('2026-09-24'))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await expect(title).toHaveJSProperty('innerText', displayDayHeading('2026-09-24'))
})

test('date-only heading slides in both directions with shared timing and reduced-motion support', async ({ page }) => {
  await join(page)
  const header = page.locator('.day-heading')
  const title = header.getByRole('heading', { level: 1 })
  const initial = await title.innerText()
  const date = new URL(page.url()).searchParams.get('date')!
  await expect(title).toHaveAccessibleName(displayDayHeading(date))
  await expect(header.locator('.eyebrow, p')).toHaveCount(0)
  const duration = await page
    .locator('.journal-body')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration.split(',')[0])
  for (const [button, direction] of [
    ['Next day', 'forward'],
    ['Previous day', 'backward'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(header.locator('.day-date')).toHaveClass(`day-date date-slide-${direction}`)
    await expect(title).toHaveCSS('animation-duration', duration)
    await expect(title).toHaveCSS('animation-timing-function', 'ease-out')
    await expect(header.locator('.date-outgoing')).toHaveAttribute('aria-hidden', 'true')
    await expect(header.locator('.date-outgoing')).toHaveCount(0)
  }
  await expect(title).toHaveJSProperty('innerText', initial)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(title).toHaveCSS('animation-name', 'none')
  await expect(header.locator('.date-outgoing')).toBeHidden()
  await expect(title).not.toHaveJSProperty('innerText', initial)
})

test('journals slide closed and open without losing text, with reduced-motion support', async ({ page }) => {
  await join(page)
  const journal = section(page)
  const toggle = journal.getByRole('button', { name: /Daily journal/ })
  const body = journal.locator('.journal-body')
  const editor = journal.getByRole('textbox', { name: 'Daily journal', exact: true })
  // Anchor the absolute placeholder inside the editor so the sliding wrapper clips it.
  await expect(editor).toHaveCSS('position', 'relative')
  expect(await editor.evaluate((element) => getComputedStyle(element, '::before').position)).toBe('absolute')
  await editor.fill('Keep this text when folding the journal.')
  await expect(body).toHaveCSS('transition-duration', '0.28s, 0.28s')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toHaveAttribute('inert', '')
  await expect(body).toBeHidden()
  await expect.poll(() => body.evaluate((element) => element.getBoundingClientRect().height)).toBe(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveText('Keep this text when folding the journal.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(body).toHaveCSS('transition-duration', '0s')
  await toggle.click()
  await expect(body).toBeHidden()
  await toggle.click()
  await expect(editor).toBeVisible()
})

for (const offset of [-7, 7]) {
  test(`activities can be checked and totals edited on a ${offset < 0 ? 'past' : 'future'} date`, async ({ page }) => {
    await join(page)
    const today = new URL(page.url()).searchParams.get('date')!
    await page.goto(`/?date=${addDays(today, offset)}`)
    await page.getByRole('button', { name: '＋ Add', exact: true }).click()
    const add = page.getByRole('dialog', { name: 'Activities', exact: true })
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
  const add = page.getByRole('dialog', { name: 'Activities', exact: true })
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
  await page.getByRole('button', { name: 'Daily tester', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Manage journals', exact: true }).click()
  await page.getByRole('button', { name: '＋ New journal' }).click()
  const form = page.getByRole('dialog', { name: 'New journal', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Dreams')
  await form.getByLabel('Writing prompt').fill('What stayed with you?')
  await form.getByRole('button', { name: 'Save journal' }).click()
  const manager = page.getByRole('dialog', { name: 'Manage journals', exact: true })
  const item = manager.locator('.manage-item').filter({ hasText: 'Dreams' })
  await expect(item).toBeVisible()
  await expect(item.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(item.getByRole('button', { name: 'Restore' })).toBeVisible()
  await item.getByRole('button', { name: 'Restore' }).click()
  await expect(item.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Permanently delete journal?' })
  const deleteButton = confirm.getByRole('button', { name: 'Delete permanently' })
  await expect(deleteButton).toBeDisabled()
  await confirm.getByLabel('Type DELETE to confirm').fill('delete')
  await expect(deleteButton).toBeDisabled()
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE')
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(confirm.getByLabel('Type DELETE to confirm')).toHaveValue('')
  await expect(deleteButton).toBeDisabled()
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE')
  await confirm.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(item).toHaveCount(0)
})

test('recurring activities, mobile layout and guest deletion warning', async ({ page }, testInfo) => {
  await join(page)
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await page.getByRole('tab', { name: 'Manage activities', exact: true }).click()
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
    .getByRole('dialog', { name: 'Activities', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.getByRole('checkbox', { name: 'Complete Pull-ups' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: '/tmp/opencode/daily-desktop.png', fullPage: true })
  if (testInfo.project.name === 'mobile')
    await page.screenshot({ path: '/tmp/opencode/daily-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Daily tester' }).click()
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click()
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
  await page.getByRole('button', { name: 'Daily tester', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
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
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await page.getByRole('tab', { name: 'Manage activities', exact: true }).click()
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
  const manager = page.getByRole('dialog', { name: 'Activities', exact: true })
  const item = manager.locator('.manage-item').filter({ hasText: 'Temporary activity' })
  await expect(item.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Permanently delete activity?' })
  await expect(confirmation).toContainText('all its daily progress records')
  const deleteButton = confirmation.getByRole('button', { name: 'Delete permanently', exact: true })
  await expect(deleteButton).toBeDisabled()
  await confirmation.getByLabel('Type DELETE to confirm').fill('delete')
  await expect(deleteButton).toBeDisabled()
  await confirmation.getByLabel('Type DELETE to confirm').fill('DELETE')
  await expect(deleteButton).toBeEnabled()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(confirmation.getByLabel('Type DELETE to confirm')).toHaveValue('')
  await expect(deleteButton).toBeDisabled()
  await confirmation.getByLabel('Type DELETE to confirm').fill('DELETE')
  await deleteButton.click()
  await expect(item).toHaveCount(0)
})

test('day arrows flank the centred date and the writing area has no focus outline', async ({ page }, testInfo) => {
  await join(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const previous = page.getByRole('button', { name: 'Previous day', exact: true })
  const next = page.getByRole('button', { name: 'Next day', exact: true })
  const positions = await page.locator('.day-heading').evaluate((element) => {
    const header = element.getBoundingClientRect()
    const previous = element.querySelector('[aria-label="Previous day"]')!.getBoundingClientRect()
    const date = element.querySelector('.day-date')!.getBoundingClientRect()
    const next = element.querySelector('[aria-label="Next day"]')!.getBoundingClientRect()
    const today = element.querySelector('.day-today')!.getBoundingClientRect()
    return {
      left: Math.abs(previous.x - header.x),
      right: Math.abs(today.right - header.right),
      centre: Math.abs(date.x + date.width / 2 - (previous.right + next.left) / 2),
      ordered: previous.right <= date.left && date.right <= next.left && next.right < today.left,
    }
  })
  expect(positions.left).toBeLessThan(1)
  expect(positions.right).toBeLessThan(1)
  expect(positions.centre).toBeLessThan(1)
  expect(positions.ordered).toBe(true)
  const today = page.getByRole('button', { name: 'Today', exact: true })
  await expect(page.locator('.app-header').getByRole('button', { name: 'Today', exact: true })).toHaveCount(0)
  await expect(today).toHaveCSS('width', '40px')
  await expect(today).toHaveCSS('height', '48px')
  const month = page.getByRole('button', { name: 'Previous month', exact: true })
  await month.hover()
  const expected = await month.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: style.width, height: style.height, radius: style.borderRadius, background: style.backgroundColor }
  })
  for (const arrow of [previous, next]) {
    await arrow.hover()
    await expect(arrow).toHaveCSS('width', expected.width)
    await expect(arrow).toHaveCSS('height', expected.height)
    await expect(arrow).toHaveCSS('border-radius', expected.radius)
    await expect(arrow).toHaveCSS('background-color', expected.background)
  }
  const editor = page.getByRole('textbox', { name: 'Daily journal', exact: true })
  await editor.fill('The focus border should stay below the toolbar.')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveCSS('outline-style', 'none')
  const gap = await section(page).evaluate(
    (element) =>
      element.querySelector('.tiptap')!.getBoundingClientRect().top -
      element.querySelector('.editor-toolbar')!.getBoundingClientRect().bottom,
  )
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (testInfo.project.name !== 'firefox')
    await page.screenshot({ path: `/tmp/opencode/daily-date-editor-${testInfo.project.name}.png`, fullPage: true })
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
  await expect
    .poll(() =>
      journal.locator('.journal-title').evaluate((element) => {
        const style = getComputedStyle(element)
        return style.paddingBottom === style.paddingTop
      }),
    )
    .toBe(true)
  const title = journal.locator('.journal-title')
  await expect.poll(() => journal.evaluate((element) => element.getBoundingClientRect().height)).toBe(72)
  const inset = await title.evaluate((element) => {
    const button = element.getBoundingClientRect()
    const header = element.parentElement!.getBoundingClientRect()
    return (
      Math.abs(button.left - header.left) + Math.abs(button.width - header.width) + Math.abs(button.top - header.top)
    )
  })
  expect(inset).toBeLessThan(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await title.hover()
  if (testInfo.project.name !== 'firefox')
    await page.screenshot({ path: `/tmp/opencode/daily-tweaks-${testInfo.project.name}.png`, fullPage: true })
})
