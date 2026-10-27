"""Fourth probe: from the public PedidosYa home, call the home's own lazy_load XHR for a few
coordinates and count distinct vendors per call. Stops on any non-200."""
import asyncio, json
from playwright.async_api import async_playwright

OUT = "deliveries/2026-10-27/delivery/_work"
PTS = {"lpz": (-16.5000, -68.1300), "eal": (-16.5100, -68.1700), "cbba": (-17.3900, -66.1600),
       "scz": (-17.7833, -63.1821), "srz2": (-17.7500, -63.1700)}
LL = ("/home-page/v44/home/lazy_load?country_id=17&area_id={area}&lat={lat}&lng={lng}"
      "&broker_version=v1&has_matches_in_progress=false&component_suffix=_v2")
JS = """async (u) => { const r = await fetch(u, {credentials: 'include'});
         return {status: r.status, body: await r.text()}; }"""


def vendors(d):
    out = {}
    def walk(o):
        if isinstance(o, dict):
            c = o.get("content")
            if isinstance(c, dict) and c.get("vendorId"):
                out[c["vendorId"]] = c.get("vendorName")
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(d)
    return out


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=False,
                                    args=["--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="es-BO", viewport={"width": 1366, "height": 850})
        pg = await ctx.new_page()
        await pg.goto("https://www.pedidosya.com.bo/", wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(8000)
        for k, (lat, lng) in PTS.items():
            for area in ("36503", "0"):
                r = await pg.evaluate(JS, LL.format(area=area, lat=lat, lng=lng))
                print(k, area, r["status"], len(r["body"]))
                if r["status"] != 200:
                    print(r["body"][:300]); continue
                d = json.loads(r["body"])
                v = vendors(d)
                print("  vendors", len(v), list(v.values())[:6])
                open(f"{OUT}/ll_{k}_{area}.json", "w", encoding="utf-8").write(r["body"])
                await pg.wait_for_timeout(2500)
        for u in ["/restaurantes/santa-cruz-de-la-sierra/kfc-la-salle-2c46385a-9724-4cf7-bc75-1bd2c064fe88-menu",
                  "/cadenas", "/sitemap.xml", "/robots.txt"]:
            r = await pg.evaluate(JS, u)
            print(u, r["status"], len(r["body"]), r["body"][:150].replace("\n", " "))
        await b.close()

asyncio.run(main())
