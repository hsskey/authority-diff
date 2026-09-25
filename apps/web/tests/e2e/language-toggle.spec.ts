import { test, expect } from '@playwright/test';

test.use({ locale: 'en-US' });

test('the language toggle switches an English browser to Korean and remembers it', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: '한국어' }).click();

  await expect(page.getByRole('heading', { name: '로그인', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await page.reload();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
});
