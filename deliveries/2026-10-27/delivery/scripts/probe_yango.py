"""Probe eats.yango.com/bo: one headless page with the browser geolocation set to a city;
log the XHR the web makes (with POST bodies) to learn the catalog call."""
import asyncio, sys
from playwright.async_api import async_playwright

OUT = "deliveries/2026-10-27/delivery/_work"
LAT, LNG = float(sys.argv[1]) if len(sys.argv) > 1 else -17.7833, float(sys.argv[2]) if len(sys.argv) > 2 else -63.1821


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(locale="es-BO", geolocation={"latitude": LAT, "longitude": LNG},
                                  permissions=["geolocation"], viewport={"width": 1280, "height": 800})
        pg = await ctx.new_page()
        n = [0]

        async def on_resp(r):
            if r.request.resource_type not in ("xhr", "fetch"):
                return
            if "yango" not in r.url or "log" in r.url or "stats" in r.url:
                return
            n[0] += 1
            try:
                body = await r.text()
            except Exception:
                body = ""
            print(r.status, r.request.method, r.url[:200], (r.request.post_data or "")[:300])
            open(f"{OUT}/y_{n[0]:03d}.txt", "w", encoding="utf-8").write(
                r.request.method + " " + r.url + "\n" + str(r.request.headers) + "\n" + (r.request.post_data or "") + "\n" + body)

        pg.on("response", lambda r: asyncio.ensure_future(on_resp(r)))
        await pg.goto("https://eats.yango.com/bo", wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(12000)
        print("title", await pg.title(), pg.url)
        pass
        await pg.mouse.wheel(0, 3000)
        await pg.wait_for_timeout(5000)
        await ctx.close()
        await b.close()

asyncio.run(main())
