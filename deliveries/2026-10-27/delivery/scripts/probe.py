import asyncio, sys
from playwright.async_api import async_playwright

URLS = sys.argv[1:] or ["https://www.pedidosya.com.bo/", "https://www.pedidosya.com.bo/restaurantes/la-paz"]
OUT = "deliveries/2026-10-27/delivery/_work"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=False,
                                    args=["--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="es-BO", viewport={"width": 1366, "height": 850})
        pg = await ctx.new_page()
        reqs = []
        pg.on("response", lambda r: reqs.append((r.status, r.request.resource_type, r.url)))
        for i, u in enumerate(URLS):
            try:
                r = await pg.goto(u, wait_until="domcontentloaded", timeout=60000)
                await pg.wait_for_timeout(9000)
                print(u, r.status if r else None, await pg.title())
                html = await pg.content()
                print(len(html), html[:300].replace("\n", " "))
                open(f"{OUT}/probe_{i}.html", "w", encoding="utf-8").write(html)
            except Exception as e:
                print("ERR", u, e)
        for s, t, u in reqs:
            if t in ("xhr", "fetch", "document"):
                print(s, t, u[:220])
        await b.close()

asyncio.run(main())
