"""Second probe: load PedidosYa home, then navigate inside the SPA and log the XHR it makes."""
import asyncio, json
from playwright.async_api import async_playwright

OUT = "deliveries/2026-10-27/delivery/_work"
SKIP = ("px-cloud", "px-client", "perseus", "google", "doubleclick", "pinterest", "facebook", "sentry",
        "tiktok", "crcldu", "on.aws", "hotjar", "braze", "appsflyer")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=False,
                                    args=["--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="es-BO", viewport={"width": 1366, "height": 850})
        pg = await ctx.new_page()
        n = [0]

        async def on_resp(r):
            if r.request.resource_type not in ("xhr", "fetch", "document"):
                return
            if any(s in r.url for s in SKIP):
                return
            print(r.status, r.request.resource_type, r.url[:260])
            try:
                body = await r.text()
            except Exception:
                return
            n[0] += 1
            open(f"{OUT}/x_{n[0]:03d}.txt", "w", encoding="utf-8").write(r.url + "\n" + body)

        pg.on("response", lambda r: asyncio.ensure_future(on_resp(r)))
        await pg.goto("https://www.pedidosya.com.bo/", wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(8000)
        print("--- click restaurantes")
        try:
            await pg.click("a[href='/restaurantes']", timeout=10000)
        except Exception as e:
            print("click err", e)
        await pg.wait_for_timeout(10000)
        print("URL now", pg.url, await pg.title())
        await pg.mouse.wheel(0, 4000)
        await pg.wait_for_timeout(6000)
        open(f"{OUT}/probe2_list.html", "w", encoding="utf-8").write(await pg.content())
        await b.close()

asyncio.run(main())
