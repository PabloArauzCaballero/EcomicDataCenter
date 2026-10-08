async (page) => {
  const data = await page.evaluate(() => ({
    url: location.href, captured_at: new Date().toISOString(),
    posts: [...document.querySelectorAll('a[href*="/video/"]')].map(a => ({
      url: a.href.split('?')[0], text: a.querySelector('img')?.alt || a.innerText,
      views_display: a.querySelector('strong')?.textContent || null
    })),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.innerText),
    title: document.title
  }));
  if (!data.dialogs.length) {
    await page.mouse.wheel(0, 2800);
    await page.waitForTimeout(2000);
  }
  return data;
}
