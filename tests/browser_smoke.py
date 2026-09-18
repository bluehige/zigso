"""Exercise the published site with real browser storage and touch input.
Run: pip install playwright; playwright install chromium; python tests/browser_smoke.py
"""
from pathlib import Path
import json
import os
import time
import urllib.request
from playwright.sync_api import sync_playwright

URL = os.environ.get('ZIGSO_URL', 'https://bluehige.github.io/zigso/')
OUT = Path('test-results')
OUT.mkdir(exist_ok=True)
# The Pages deployment runs in parallel with this read-only verification job.
for attempt in range(36):
    try:
        with urllib.request.urlopen(URL + 'version.json?qa=' + str(time.time_ns()), timeout=20) as response:
            version = json.load(response)
        if version.get('version') == '1.0.0':
            break
    except Exception as error:
        print(f'Waiting for Pages ({attempt + 1}/36): {error}', flush=True)
    time.sleep(10)
else:
    raise RuntimeError('The new Pages version is not reachable.')

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = page.goto(URL, wait_until='domcontentloaded')
    assert response and response.status == 200
    page.locator('#home').wait_for(state='visible', timeout=60000)
    assert page.locator('.stage-card').count() == 10
    assert page.locator('.stage-card.locked').count() == 9
    page.screenshot(path=str(OUT/'01-home.png'), full_page=True)
    page.locator('#continueGame').tap()
    page.wait_for_function('document.querySelectorAll(".piece-button").length === 12')
    page.screenshot(path=str(OUT/'02-mobile-game.png'))

    def place(ident, cols, rows):
        button = page.locator(f'.piece-button[data-piece="{ident}"]')
        button.scroll_into_view_if_needed()
        button.tap()
        r = page.locator('#board').bounding_box()
        assert r
        page.touchscreen.tap(r['x']+(ident%cols+.5)*r['width']/cols,r['y']+(ident//cols+.5)*r['height']/rows)

    def finish(cols,rows):
        ids = page.locator('.piece-button').evaluate_all('(els)=>els.map(e=>Number(e.dataset.piece))')
        for ident in ids:
            place(ident,cols,rows)
        page.locator('#nextStage').wait_for(state='visible')
        assert page.locator('.win-image').evaluate('(img)=>img.naturalWidth===1080 && img.naturalHeight===1600')

    # Native touch drag from tray to board, including pointer capture.
    cdp = context.new_cdp_session(page)
    first = page.locator('.piece-button').first
    ident = int(first.get_attribute('data-piece'))
    br, r = first.bounding_box(), page.locator('#board').bounding_box()
    sx, sy = br['x']+br['width']/2, br['y']+br['height']/2
    tx, ty = r['x']+(ident%3+.5)*r['width']/3, r['y']+(ident//3+.5)*r['height']/4
    def touch(kind,x=0,y=0):
        cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':1}]})
    touch('touchStart',sx,sy)
    touch('touchMove',sx,sy-15)
    for step in range(1,18):
        t=step/17
        touch('touchMove',sx+(tx-sx)*t,sy+(ty-sy)*t)
        page.wait_for_timeout(15)
    touch('touchEnd')
    page.wait_for_function('document.querySelector("#placedCount").textContent === "1"')

    # Persistence uses the actual site origin, not a fixture or in-memory mock.
    page.reload()
    page.locator('#home').wait_for(state='visible',timeout=60000)
    page.locator('#continueGame').tap()
    page.wait_for_function('document.querySelectorAll(".piece-button").length === 11')
    assert page.locator('#placedCount').inner_text() == '1'
    page.locator('#preview').tap()
    frozen = page.locator('#timer').inner_text()
    page.wait_for_timeout(1300)
    assert page.locator('#timer').inner_text() == frozen
    page.locator('#closePreview').tap()

    # Complete all stages through the visible interface; do not call a solver.
    for stage in range(10):
        assert f'{stage+1:02}' in page.locator('#stageLabel').inner_text()
        finish(3,4)
        state = page.evaluate('JSON.parse(localStorage.getItem("zigso-save-v1"))')
        assert state['unlocked'] == min(10,stage+2)
        if stage == 9:
            page.screenshot(path=str(OUT/'03-all-stages-complete.png'))
        page.locator('#nextStage').tap()
        if stage<9:
            page.wait_for_function('document.querySelectorAll(".piece-button").length === 12')
    page.locator('#home').wait_for(state='visible')
    assert page.locator('.stage-card.locked').count() == 0
    assert page.locator('#collected').inner_text() == '10 / 10'

    for diff,cols,rows in [('normal',4,6),('hard',6,9)]:
        page.locator(f'[data-diff="{diff}"]').tap()
        page.locator('#continueGame').tap()
        page.wait_for_function(f'document.querySelectorAll(".piece-button").length === {cols*rows}')
        if diff=='hard':
            page.screenshot(path=str(OUT/'04-hard.png'))
            page.locator('#edges').tap()
            assert page.locator('.piece-button').count() == 26
            page.locator('#edges').tap()
            page.locator('#hint').tap()
            assert page.locator('.piece-button.selected').count() == 1
            page.locator('#zoom').tap()
            assert page.locator('#zoom').get_attribute('aria-pressed') == 'true'
            page.locator('#zoom').tap()
        finish(cols,rows)
        page.locator('#winHome').tap()
        page.locator('#home').wait_for(state='visible')
    page.locator('#continueGame').tap()
    page.wait_for_function('document.querySelectorAll(".piece-button").length === 54')
    for width,height in [(320,568),(360,740),(390,844),(412,915),(844,390),(1280,800)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(180)
        br = page.locator('#board').bounding_box()
        tr = page.locator('#tray').bounding_box()
        assert br and br['height']>100 and br['y']>=0
        assert tr and tr['y']+tr['height']<=height+2
        page.screenshot(path=str(OUT/f'layout-{width}x{height}.png'))
    assert not errors, errors
    summary={'public_url':URL,'http_status':200,'stages':10,'easy_all_stages':'PASS','normal_24':'PASS','hard_54':'PASS','native_touch_drag':'PASS','tap_placement':'PASS','reload_persistence':'PASS','preview_timer_pause':'PASS','edge_filter':'PASS','hint':'PASS','zoom':'PASS','responsive_sizes':6,'javascript_errors':errors}
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    browser.close()
