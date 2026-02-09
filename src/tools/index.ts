/**
 * Tool index — imports and registers all tool definitions.
 *
 * Import this file once (in the service worker entrypoint) to make
 * all tools available via `toolRegistry.get(name)`.
 */

import { toolRegistry } from './registry';

// ── Browser tools ────────────────────────────────────────────────────

import { navigateTool } from './browser/navigate';
import { screenshotTool } from './browser/screenshot';
import {
  clickTool,
  leftClickTool,
  rightClickTool,
  doubleClickTool,
  tripleClickTool,
} from './browser/click';
import { dragTool } from './browser/drag';
import { scrollTool, scrollToTool } from './browser/scroll';
import { typeTool } from './browser/type';
import { hoverTool } from './browser/hover';
import { keyTool } from './browser/key';
import { waitTool } from './browser/wait';
import { findTool } from './browser/find';
import { readPageTool, getPageTextTool } from './browser/readPage';
import { readConsoleTool } from './browser/readConsole';
import { readNetworkTool } from './browser/readNetwork';
import { javascriptTool } from './browser/javascript';
import { formInputTool } from './browser/formInput';
import { fileUploadTool } from './browser/fileUpload';
import { uploadImageTool } from './browser/uploadImage';
import { resizeWindowTool } from './browser/resizeWindow';
import { zoomTool } from './browser/zoom';
import { reloadTool } from './browser/reload';
import { gifCreatorTool } from './browser/gifCreator';
import { getCookiesTool } from './browser/getCookies';
import { extensionReloadTool } from './browser/extensionReload';

// ── Tab tools ────────────────────────────────────────────────────────

import { tabsContextTool, tabsContextMcpTool } from './tabs/tabsContext';
import { tabsCreateTool, tabsCreateMcpTool } from './tabs/tabsCreate';

// ── Agent tools ──────────────────────────────────────────────────────

import { updatePlanTool } from './agent/updatePlan';
import { turnAnswerStartTool } from './agent/turnAnswerStart';

// ── Shortcut tools ───────────────────────────────────────────────────

import { shortcutsListTool } from './shortcuts/shortcutsList';
import { shortcutsExecuteTool } from './shortcuts/shortcutsExecute';

// ── Register all tools ───────────────────────────────────────────────

// Browser
toolRegistry.register(navigateTool);
toolRegistry.register(screenshotTool);
toolRegistry.register(clickTool);
toolRegistry.register(leftClickTool);
toolRegistry.register(rightClickTool);
toolRegistry.register(doubleClickTool);
toolRegistry.register(tripleClickTool);
toolRegistry.register(dragTool);
toolRegistry.register(scrollTool);
toolRegistry.register(scrollToTool);
toolRegistry.register(typeTool);
toolRegistry.register(hoverTool);
toolRegistry.register(keyTool);
toolRegistry.register(waitTool);
toolRegistry.register(findTool);
toolRegistry.register(readPageTool);
toolRegistry.register(getPageTextTool);
toolRegistry.register(readConsoleTool);
toolRegistry.register(readNetworkTool);
toolRegistry.register(javascriptTool);
toolRegistry.register(formInputTool);
toolRegistry.register(fileUploadTool);
toolRegistry.register(uploadImageTool);
toolRegistry.register(resizeWindowTool);
toolRegistry.register(zoomTool);
toolRegistry.register(reloadTool);
toolRegistry.register(gifCreatorTool);
toolRegistry.register(getCookiesTool);
toolRegistry.register(extensionReloadTool);

// Tabs
toolRegistry.register(tabsContextTool);
toolRegistry.register(tabsContextMcpTool);
toolRegistry.register(tabsCreateTool);
toolRegistry.register(tabsCreateMcpTool);

// Agent
toolRegistry.register(updatePlanTool);
toolRegistry.register(turnAnswerStartTool);

// Shortcuts
toolRegistry.register(shortcutsListTool);
toolRegistry.register(shortcutsExecuteTool);

// ── Exports ──────────────────────────────────────────────────────────

export { toolRegistry };
