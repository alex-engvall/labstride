import { test, expect } from '@playwright/test';

async function openMobileMenu(page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
}

test('overview preserves the development status and fits the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Labstride documentation', exact: true })).toBeVisible();
  await expect(page.getByText('There is no installable release yet.', { exact: false })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://docs.labstride.dev/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sidebar opens a documentation page', async ({ page }) => {
  await page.goto('/');
  await openMobileMenu(page);
  await page.getByRole('link', { name: 'Architecture', exact: true }).first().click();
  await expect(page).toHaveURL(/\/concepts\/architecture\/$/);
  await expect(page.getByRole('heading', { name: 'Architecture', exact: true })).toBeVisible();
});

test('local search finds and opens indexed documentation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /search/i }).first().click();
  const input = page.locator('.pagefind-ui__search-input');
  await expect(input).toBeVisible();
  await input.fill('coordinator');
  const result = page.locator('.pagefind-ui__result-link').first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole('main')).toBeVisible();
});

test('theme selector changes the active theme', async ({ page }) => {
  await page.goto('/');
  await openMobileMenu(page);
  // Starlight renders both responsive variants; role queries exclude the hidden one.
  const theme = page.getByRole('combobox', { name: /Select theme/ });
  await expect(theme).toBeVisible();
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
