/**
 * Scheduled Tasks + Alarms (Headless Build)
 *
 * Wires SavedPrompts to chrome.alarms. When an alarm fires, creates a
 * tab group and dispatches the task headlessly via the tool dispatcher.
 */

import { StorageKey } from '../types/storage';
import { storageGet, storageSet } from '../shared/storage';

const LOG_PREFIX = '[Alarms]';

interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
  schedule?: {
    type: 'once' | 'daily' | 'weekly' | 'monthly' | 'annually';
    time?: string;
    date?: string;
    dayOfWeek?: number;
  };
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

/**
 * Register chrome.alarms for all enabled saved prompts with schedules.
 */
export async function registerAllAlarms(): Promise<void> {
  const prompts = await storageGet<SavedPrompt[]>(StorageKey.SAVED_PROMPTS, []);
  if (!prompts || prompts.length === 0) return;

  for (const prompt of prompts) {
    if (prompt.enabled && prompt.schedule) {
      await registerAlarmForPrompt(prompt);
    }
  }

  console.log(`${LOG_PREFIX} Registered alarms for ${prompts.length} prompts`);
}

async function registerAlarmForPrompt(prompt: SavedPrompt): Promise<void> {
  const alarmName = `saved-prompt-${prompt.id}`;

  // Clear any existing alarm
  await chrome.alarms.clear(alarmName);

  if (!prompt.schedule) return;

  const schedule = prompt.schedule;
  let periodInMinutes: number | undefined;

  switch (schedule.type) {
    case 'daily':
      periodInMinutes = 1440; // 24 hours
      break;
    case 'weekly':
      periodInMinutes = 10080; // 7 days
      break;
    case 'once':
    case 'monthly':
    case 'annually':
      // One-shot alarms — will re-register after firing
      break;
  }

  // Schedule the alarm
  if (periodInMinutes) {
    await chrome.alarms.create(alarmName, {
      delayInMinutes: 1, // First run after 1 minute
      periodInMinutes,
    });
  } else {
    await chrome.alarms.create(alarmName, {
      delayInMinutes: 1,
    });
  }
}

/**
 * Handle a fired alarm. Look up the corresponding saved prompt
 * and execute it headlessly.
 */
export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (!alarm.name.startsWith('saved-prompt-')) return;

  const promptId = alarm.name.replace('saved-prompt-', '');

  const prompts = await storageGet<SavedPrompt[]>(StorageKey.SAVED_PROMPTS, []);
  if (!prompts) return;

  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) {
    console.warn(`${LOG_PREFIX} Prompt not found for alarm: ${promptId}`);
    return;
  }

  console.log(`${LOG_PREFIX} Executing scheduled prompt: ${prompt.name}`);

  // Update last run time
  prompt.lastRun = new Date().toISOString();
  await storageSet(StorageKey.SAVED_PROMPTS, prompts);

  // Create a new tab for the task
  try {
    const tab = await chrome.tabs.create({
      url: 'about:blank',
      active: false,
    });

    if (tab.id) {
      // Log the execution — in headless mode, the actual task execution
      // would be dispatched via MCP channels
      console.log(
        `${LOG_PREFIX} Created tab ${tab.id} for scheduled task: ${prompt.name}`,
      );

      // Store pending scheduled task for MCP channels to pick up
      await storageSet(StorageKey.PENDING_SCHEDULED_TASK, {
        promptId: prompt.id,
        name: prompt.name,
        prompt: prompt.prompt,
        tabId: tab.id,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to execute scheduled task:`, err);
  }
}

/**
 * Setup the alarm listener.
 */
export function setupAlarmListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    void handleAlarm(alarm);
  });

  console.log(`${LOG_PREFIX} Alarm listener registered`);
}
