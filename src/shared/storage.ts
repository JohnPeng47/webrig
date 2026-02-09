/**
 * Storage helpers — thin, typed wrappers around chrome.storage.local.
 */

import { StorageKey } from '../types/storage';

const DEFAULT_EXCLUDE_KEYS: Set<string> = new Set<string>([
  StorageKey.ANONYMOUS_ID,
  StorageKey.UPDATE_AVAILABLE,
]);

export async function storageGet<T>(
  key: StorageKey,
  defaultValue?: T,
): Promise<T | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    const value = result[key];
    return value !== undefined ? (value as T) : defaultValue;
  } catch (error) {
    console.error(`[Storage] Failed to get key "${key}":`, error);
    return defaultValue;
  }
}

export async function storageSet(
  key: StorageKey,
  value: unknown,
): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`[Storage] Failed to set key "${key}":`, error);
    throw error;
  }
}

export async function storageRemove(
  keys: StorageKey | StorageKey[],
): Promise<void> {
  try {
    const keyArray: string[] = Array.isArray(keys)
      ? keys.map((k) => k as string)
      : [keys as string];
    await chrome.storage.local.remove(keyArray);
  } catch (error) {
    console.error(`[Storage] Failed to remove key(s):`, error);
    throw error;
  }
}

export async function storageSetMultiple(
  items: Record<string, unknown>,
): Promise<void> {
  try {
    await chrome.storage.local.set(items);
  } catch (error) {
    console.error('[Storage] Failed to set multiple keys:', error);
    throw error;
  }
}

export async function storageClearAll(
  excludeKeys: Set<string> = DEFAULT_EXCLUDE_KEYS,
): Promise<void> {
  try {
    if (excludeKeys.size === 0) {
      await chrome.storage.local.clear();
      return;
    }

    const keysToPreserve = Array.from(excludeKeys);
    const preserved = await chrome.storage.local.get(keysToPreserve);

    await chrome.storage.local.clear();

    const toRestore: Record<string, unknown> = {};
    for (const key of keysToPreserve) {
      if (key in preserved) {
        toRestore[key] = preserved[key];
      }
    }
    if (Object.keys(toRestore).length > 0) {
      await chrome.storage.local.set(toRestore);
    }
  } catch (error) {
    console.error('[Storage] Failed to clear storage:', error);
    throw error;
  }
}
