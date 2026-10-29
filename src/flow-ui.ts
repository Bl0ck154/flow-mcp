import type { Locator, Page } from "playwright-core";

// Verified UI variants: the old English button and the current Ukrainian checkbox.
const AGENT_NAME = /^(?:Agent|Агент)$/i;

// Accessible names mapped from the English UI and Ukrainian UI (2026-10-14).
export const UI_NAMES = {
  settingsTrigger: /^(?:Settings trigger|Активатор налаштувань)$/,
  startGeneration: /^(?:Start generation|Почати створення)$/,
  accountDetails: /^(?:Account details|Дані облікового запису)$/,
  closeAccountPanel: /^(?:Close account panel|Закрити панель облікового запису)$/,
  creditBalance: /Google Flow credits|кредити Google Flow/,
  allMedia: /^(?:All media|Усі медіафайли)$/,
  moreOptions: /^(?:More options|Інші опції)$/,
  reusePrompt: /^(?:Reuse prompt|Повторно використати запит)$/,
  clearPrompt: /^(?:Clear prompt|Очистити запит)$/,
  addIngredients: /^(?:Add ingredients to the prompt box|Додати інгредієнти у вікно запиту)$/,
  addMediaMenu: /^(?:Add media menu|Меню "Додати медіафайл")$/,
  settings: /^(?:Settings|Налаштування)$/,
  firstFrame: /^(?:Start|Початок)$/,
  lastFrame: /^(?:End|Кінець)$/,
  addToPrompt: /^(?:Add to prompt|Додати до запиту)$/,
  attachedIngredient: /^(?:Ingredient|Інгредієнт(?: зображення)?)$/,
  uploadsTab: /^(?:Uploads|Додані файли)$/,
  upload: /^(?:Upload|Завантажити)$/,
  image: /^(?:Image|Зображення)$/,
  video: /^(?:Video|Відео)$/,
  frames: /^(?:Frames|Кадри)$/,
  ingredients: /^(?:Ingredients|Інгредієнти)$/,
  selectModel: /^(?:Select model family|Вибрати сімейство моделей)$/,
  creditQuote: /credits?$|^стільки кредитів:\s*\d+$/i,
  download: /^(?:Download|Завантажити)$/,
  rename: /^(?:Rename|Перейменувати)$/,
  originalSize: /original|Оригінальний розмір/i,
  upscaled: /upscaled|Підвищена роздільна здатність/i,
};

const localizedRadioName = (name: string | RegExp): string | RegExp => {
  if (typeof name !== "string") return name;
  const modes: Record<string, RegExp> = { Image: UI_NAMES.image, Video: UI_NAMES.video, Frames: UI_NAMES.frames, Ingredients: UI_NAMES.ingredients };
  if (modes[name]) return modes[name];
  const duration = name.match(/^(\d+)s$/);
  return duration ? new RegExp(`^${duration[1]}(?:s|\\s*с)$`) : name;
};

export const allMediaControl = (page: Page): Locator =>
  page.getByRole("button", { name: UI_NAMES.allMedia })
    .or(page.getByRole("navigation", { name: "Project navigation" }).getByText("All media", { exact: true })).first();

export const agentModeToggle = (page: Page): Locator =>
  page.getByRole("checkbox", { name: AGENT_NAME }).or(page.getByRole("button", { name: AGENT_NAME })).first();

export async function completedMediaIds(page: Page, idScript: string): Promise<string[]> {
  return page.evaluate((script) => {
    const identify = eval(script) as (tile: Element) => string | undefined;
    return [...document.querySelectorAll("flow-grid-tile-container")]
      .filter((tile) => !tile.querySelector("flow-error-tile")
        && !/\d+\s*%/.test((tile as HTMLElement).innerText)
        && [...tile.querySelectorAll("img[src], video[src]")].some((media) => Boolean(media.getAttribute("src"))))
      .map(identify).filter((id): id is string => Boolean(id));
  }, idScript);
}

export async function newPolicyRefusal(page: Page, known: string[], idScript: string): Promise<string | undefined> {
  return page.evaluate(([ids, script]: [string[], string]) => {
    const identify = eval(script) as (tile: Element) => string | undefined;
    const seen = new Set(ids);
    for (const tile of document.querySelectorAll("flow-grid-tile-container")) {
      const id = identify(tile);
      if (id && seen.has(id)) break;
      const text = (tile as HTMLElement).innerText;
      // Observed policy card; do not retry a rejected prompt as a transient render error.
      if (/Цей запит може порушувати наші правила/i.test(text)) return text.replace(/\s+/g, " ").trim();
    }
    return undefined;
  }, [known, idScript] as [string[], string]);
}

export async function completeAssetSelection(page: Page, list: Locator, option: Locator): Promise<void> {
  const attached = page.getByRole("button", { name: UI_NAMES.attachedIngredient });
  const attachedBefore = await attached.count();
  await option.click();
  const add = page.getByRole("button", { name: UI_NAMES.addToPrompt });
  // Older frame pickers attached immediately. The current picker first previews,
  // then requires explicit confirmation, just like the ingredients picker.
  await Promise.race([
    add.waitFor({ state: "visible", timeout: 5000 }),
    list.waitFor({ state: "hidden", timeout: 5000 }),
  ]).catch(() => { throw new Error("Flow did not show attachment confirmation or close the asset picker; nothing was generated."); });
  if (await list.isVisible()) {
    try {
      await add.click({ timeout: 5000 });
    } catch (error) {
      // Selection can auto-attach between the visibility check and the click.
      // A closed picker alone is insufficient: require a new attachment indicator.
      const closed = await list.waitFor({ state: "hidden", timeout: 1500 }).then(() => true, () => false);
      if (!closed || (await attached.count()) <= attachedBefore) throw error;
    }
  }
  await list.waitFor({ state: "hidden", timeout: 10000 });
  await page.waitForTimeout(500);
}

export async function agentModeEnabled(agent: Locator): Promise<boolean> {
  await agent.waitFor({ state: "visible", timeout: 8000 });
  return agent.evaluate((element) => {
    if (element instanceof HTMLInputElement && element.type === "checkbox") return element.checked;
    const state = element.getAttribute("aria-checked") ?? element.getAttribute("aria-pressed");
    if (state !== "true" && state !== "false") throw new Error("Flow's Agent control has no readable checked/pressed state.");
    return state === "true";
  });
}

export async function setAgentMode(page: Page, on: boolean): Promise<void> {
  // The agent session panel can cover the composer; never assume a click changed its state.
  const agent = agentModeToggle(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await agentModeEnabled(agent)) === on) return;
    await agent.click({ timeout: 8000 });
    await page.waitForTimeout(500);
  }
  if ((await agentModeEnabled(agent)) !== on) {
    throw new Error(`Could not switch Agent mode ${on ? "on" : "off"}; the composer may be covered by the agent session panel.`);
  }
}

export async function pickRadio(page: Page, name: string | RegExp): Promise<void> {
  const radio = page.getByRole("radio", { name: localizedRadioName(name), exact: typeof name === "string" }).first();
  await radio.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
    throw new Error(`Flow has no "${name}" option for the current mode/model.`);
  });
  if (!(await radio.isChecked())) {
    await radio.click();
    await page.waitForTimeout(500);
  }
  if (!(await radio.isChecked())) throw new Error(`Flow did not retain the requested "${name}" setting; nothing was generated.`);
}

export async function verifyResolution(page: Page, resolution: "360p" | "720p"): Promise<void> {
  const radio = page.getByRole("radio", { name: new RegExp(`^${resolution}(?:\\s|$)`) }).first();
  if (!(await radio.isChecked())) throw new Error(`Flow did not retain ${resolution}; nothing was generated.`);
}

export async function openTileDownloadMenu(page: Page, tile: Locator): Promise<Locator> {
  const download = page.getByRole("menuitem", { name: UI_NAMES.download });
  const more = tile.getByRole("button", { name: UI_NAMES.moreOptions });
  if (await more.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) {
    await more.click();
    if (await download.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false)) return download;
    await page.keyboard.press("Escape");
  }
  await tile.click({ button: "right" });
  if (await download.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false)) return download;
  const items = await page.getByRole("menuitem").allTextContents();
  throw new Error(items.length
    ? `Flow's tile menu has no Download item. It offered: ${items.map((item) => item.replace(/\s+/g, " ").trim()).join(" | ")}`
    : "Flow's tile menu did not open.");
}
