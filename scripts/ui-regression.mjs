// Isolated HTML fixtures only: never attach to the user's Chrome/Flow session.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { allMediaControl, completedMediaIds, completeAssetSelection, newPolicyRefusal, UI_NAMES, agentModeEnabled, agentModeToggle, openTileDownloadMenu, pickRadio, setAgentMode, verifyResolution } from "../dist/flow-ui.js";

const executablePath = [process.env.FLOW_MCP_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome",
].find((path) => path && existsSync(path));
assert.ok(executablePath, "Install Chrome or set FLOW_MCP_CHROME to run UI fixture tests.");
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(1500);
  await page.setContent(`<flow-grid-tile-container aria-label="placeholder">Generated video</flow-grid-tile-container><flow-grid-tile-container aria-label="rendering"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">42 %</flow-grid-tile-container><flow-grid-tile-container aria-label="failed"><flow-error-tile>Failed</flow-error-tile><img src="failed.png"></flow-grid-tile-container><flow-grid-tile-container aria-label="complete"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></flow-grid-tile-container>`);
  const identifyFixture = "tile => tile.getAttribute('aria-label')";
  assert.deepEqual(await completedMediaIds(page, identifyFixture), ["complete"]);
  await page.locator('[aria-label=rendering]').evaluate((tile) => { tile.lastChild.textContent = ""; });
  assert.deepEqual(await completedMediaIds(page, identifyFixture), ["rendering", "complete"]);
  await page.setContent('<flow-grid-tile-container aria-label="new">Помилка Цей запит може порушувати наші правила щодо створення небезпечного контенту Вам буде повернено кошти</flow-grid-tile-container><flow-grid-tile-container aria-label="old">42%</flow-grid-tile-container>');
  assert.match(await newPolicyRefusal(page, ["old"], identifyFixture), /Цей запит/);
  assert.equal(await newPolicyRefusal(page, ["new", "old"], identifyFixture), undefined);
  for (const name of ["Agent", "Агент"]) {
    for (const fixture of [
      `<label><input type="checkbox" checked>${name}</label>`,
      `<button role="checkbox" aria-checked="true" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')">${name}</button>`,
      `<button aria-pressed="true" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true')">${name}</button>`,
    ]) {
      await page.setContent(fixture);
      assert.equal(await agentModeEnabled(agentModeToggle(page)), true);
      await setAgentMode(page, false);
      assert.equal(await agentModeEnabled(agentModeToggle(page)), false);
      await setAgentMode(page, true);
      assert.equal(await agentModeEnabled(agentModeToggle(page)), true);
    }
  }
  await page.setContent('<button>Agent</button>');
  await assert.rejects(setAgentMode(page, false), /no readable checked\/pressed state/);
  await page.setContent('<button>Усі медіафайли</button><button>Активатор налаштувань</button><button>Почати створення</button><button>Дані облікового запису</button><button>Вибрати сімейство моделей</button><a href="#">стільки кредитів: 7</a>');
  assert.equal(await allMediaControl(page).innerText(), "Усі медіафайли");
  for (const name of [UI_NAMES.settingsTrigger, UI_NAMES.startGeneration, UI_NAMES.accountDetails, UI_NAMES.selectModel]) {
    assert.equal(await page.getByRole("button", { name }).count(), 1);
  }
  assert.equal(await page.getByRole("link", { name: UI_NAMES.creditQuote }).innerText(), "стільки кредитів: 7");
  await page.setContent('<button aria-haspopup="dialog">Додати інгредієнти у вікно запиту</button><button aria-haspopup="menu">Меню "Додати медіафайл"</button><button aria-haspopup="dialog">Налаштування</button>');
  for (const name of [UI_NAMES.addIngredients, UI_NAMES.addMediaMenu, UI_NAMES.settings]) {
    assert.equal(await page.getByRole("button", { name }).count(), 1);
  }
  await page.setContent('<button>Початок</button><button>Кінець</button><button role="tab">Додані файли</button><button role="menuitem">Завантажити</button>');
  for (const name of [UI_NAMES.firstFrame, UI_NAMES.lastFrame]) assert.equal(await page.getByRole("button", { name }).count(), 1);
  assert.equal(await page.getByRole("tab", { name: UI_NAMES.uploadsTab }).count(), 1);
  assert.equal(await page.getByRole("menuitem", { name: UI_NAMES.upload }).count(), 1);
  // Selecting an option only previews the frame; attachment happens on confirmation.
  await page.setContent(`<div role="listbox" aria-label="Список об’єктів"><button role="option">frame-one</button></div><button id="confirm" hidden>Додати до запиту</button><output id="attached">no</output><script>document.querySelector('[role=option]').onclick=()=>{setTimeout(()=>{document.querySelector('#confirm').hidden=false},250)};document.querySelector('#confirm').onclick=()=>{document.querySelector('[role=listbox]').hidden=true;document.querySelector('#confirm').hidden=true;document.querySelector('#attached').textContent='yes'}</script>`);
  await completeAssetSelection(page, page.getByRole("listbox"), page.getByRole("option", { name: "frame-one" }));
  assert.equal(await page.locator('#attached').innerText(), "yes");
  // Retain compatibility with older frame pickers that attached on option click.
  await page.setContent(`<div role="listbox"><button role="option">frame-two</button></div><script>document.querySelector('[role=option]').onclick=()=>{document.querySelector('[role=listbox]').hidden=true}</script>`);
  await completeAssetSelection(page, page.getByRole("listbox"), page.getByRole("option", { name: "frame-two" }));
  assert.equal(await page.getByRole("listbox").count(), 0);
  // Preview becomes visible, then auto-attachment removes it while click waits.
  await page.setContent(`<div role="listbox"><button role="option">race-frame</button></div><button id="confirm" hidden disabled>Додати до запиту</button><div id="chips"></div><script>document.querySelector('[role=option]').onclick=()=>{document.querySelector('#confirm').hidden=false;setTimeout(()=>{document.querySelector('[role=listbox]').hidden=true;document.querySelector('#confirm').remove();document.querySelector('#chips').innerHTML='<button>Інгредієнт зображення</button>'},250)}</script>`);
  await completeAssetSelection(page, page.getByRole("listbox"), page.getByRole("option", { name: "race-frame" }));
  assert.equal(await page.getByRole("button", { name: UI_NAMES.attachedIngredient }).count(), 1);
  // A pre-existing chip cannot prove a newly selected frame attached.
  await page.setContent(`<button>Інгредієнт зображення</button><div role="listbox"><button role="option">missing-frame</button></div><button id="confirm" hidden disabled>Додати до запиту</button><script>document.querySelector('[role=option]').onclick=()=>{document.querySelector('#confirm').hidden=false;setTimeout(()=>{document.querySelector('[role=listbox]').hidden=true;document.querySelector('#confirm').remove()},250)}</script>`);
  await assert.rejects(completeAssetSelection(page, page.getByRole("listbox"), page.getByRole("option", { name: "missing-frame" })));
  for (const [requested, label] of [["Image", "Зображення"], ["Video", "Відео"], ["Frames", "Кадри"], ["Ingredients", "Інгредієнти"], ["4s", "4 с"], ["8s", "8 с"]]) {
    await page.setContent(`<label><input type="radio">${label}</label>`);
    await pickRadio(page, requested);
    assert.equal(await page.getByRole("radio").isChecked(), true);
  }
  await page.setContent('<label><input type="radio" name="resolution" checked>360p</label><label><input type="radio" name="resolution">720p</label>');
  await pickRadio(page, /^720p(?:\s|$)/);
  await verifyResolution(page, "720p");
  await pickRadio(page, "360p");
  await assert.rejects(verifyResolution(page, "720p"), /did not retain 720p/);
  await page.setContent('<button role="radio" aria-checked="false">720p</button>');
  await assert.rejects(pickRadio(page, "720p"), /did not retain/);
  const delayedMenu = `setTimeout(()=>{document.querySelector('#menu').innerHTML='<button role="menuitem">Download</button>'},250)`;
  await page.setContent(`<div id="tile"><button aria-label="More options">more</button></div><div id="menu"></div><script>document.querySelector('button').onclick=()=>{${delayedMenu}}</script>`);
  assert.equal(await (await openTileDownloadMenu(page, page.locator('#tile'))).innerText(), "Download");
  await page.setContent(`<div id="tile"><button aria-label="Інші опції">more</button></div><div id="menu"></div><script>document.querySelector('button').onclick=()=>{setTimeout(()=>{document.querySelector('#menu').innerHTML='<button role="menuitem">Завантажити</button>'},250)}</script>`);
  assert.equal(await (await openTileDownloadMenu(page, page.locator('#tile'))).innerText(), "Завантажити");
  await page.setContent('<button role="menuitem">360p Оригінальний розмір</button><button role="menuitem">720p Підвищена роздільна здатність</button>');
  assert.equal(await page.getByRole("menuitem", { name: UI_NAMES.originalSize }).innerText(), "360p Оригінальний розмір");
  assert.equal(await page.getByRole("menuitem", { name: UI_NAMES.upscaled }).innerText(), "720p Підвищена роздільна здатність");
  // A toolbar click can fail to open Flow's menu; fall back to the tile context menu.
  await page.setContent(`<div id="tile"><button aria-label="More options">more</button></div><div id="menu"></div><script>document.querySelector('#tile').oncontextmenu=(event)=>{event.preventDefault();${delayedMenu}}</script>`);
  assert.equal(await (await openTileDownloadMenu(page, page.locator('#tile'))).innerText(), "Download");
  console.log("PASS: English/Ukrainian native and ARIA Agent states, requested resolution checks, delayed tile menus and context-menu fallback.");
} finally {
  await browser.close();
}
