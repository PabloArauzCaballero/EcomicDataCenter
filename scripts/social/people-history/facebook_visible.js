async (page) => {
  await page.mouse.wheel(0, 2800);
  await page.waitForTimeout(2000);
  const data = await page.evaluate(() => {
    const articles = [...document.querySelectorAll('[role="article"]')].filter(el => !el.parentElement.closest('[role="article"]'));
    const posts = articles.map(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[role="article"]').forEach(node => node.remove());
      const links = [...clone.querySelectorAll('a[href]')].map(a => ({url: a.href.split('?')[0], label: a.textContent, aria: a.getAttribute('aria-label')}));
      return {text: clone.innerText || clone.textContent, links};
    }).filter(p => p.links.some(a => /\/reel\/|\/posts\/|\/videos\//.test(a.url)));
    return {url: location.href, captured_at: new Date().toISOString(), posts,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.innerText)};
  });
  return data;
}
