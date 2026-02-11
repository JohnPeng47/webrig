/**
 * Phase 8: Tab Group Manager
 *
 * Manages Chrome tab groups for the Claude browser extension.  Tabs that
 * the agent interacts with are grouped together under an orange "Claude"
 * group so the user can easily see which tabs are under agent control.
 *
 * Responsibilities:
 * - Creating / finding / cleaning up tab groups.
 * - Adopting orphaned tabs into the active Claude group.
 * - Sending agent-indicator messages (show / hide) to content scripts
 *   so that the visual overlay follows the agent's activity.
 * - Heartbeat: periodically pings tabs with STATIC_INDICATOR_HEARTBEAT
 *   to keep the visual indicator alive.
 */

import { storageGet, storageSet, storageRemove } from '../shared/storage';
import { StorageKey } from '../types/storage';

// ── Constants ────────────────────────────────────────────────────────

const GROUP_COLOR = 'orange' as const;
const GROUP_TITLE = 'Claude';
const HEARTBEAT_INTERVAL_MS = 5_000;
const LOG_PREFIX = '[TabManager]';

// ── TabManager ───────────────────────────────────────────────────────

class TabManager {
  /** Maps `groupId` -> set of `tabId`s managed by this class. */
  private groups = new Map<number, Set<number>>();

  /** Maps `groupId` -> user-facing title. */
  private groupTitles = new Map<number, string>();

  /** Interval handle for the heartbeat timer. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Wire up Chrome tab / tabGroup event listeners and start the
   * heartbeat timer.
   */
  initialize(): void {
    // ── Tab listeners ──────────────────────────────────────────
    chrome.tabs.onRemoved.addListener((tabId) => {
      void this.handleTabClosed(tabId);
    });

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.groupId !== undefined && tab.id !== undefined) {
        this.syncTabGroupMembership(tab.id, changeInfo.groupId);
      }
    });

    // ── Tab-group listeners ────────────────────────────────────
    chrome.tabGroups.onUpdated.addListener((group) => {
      // If Chrome or the user renamed / recoloured our group,
      // force it back to the expected branding.
      if (this.groups.has(group.id)) {
        const expectedTitle = this.groupTitles.get(group.id) || GROUP_TITLE;
        if (group.title !== expectedTitle || group.color !== GROUP_COLOR) {
          chrome.tabGroups
            .update(group.id, { title: expectedTitle, color: GROUP_COLOR })
            .catch(() => {
              // Group may have been removed concurrently.
            });
        }
      }
    });

    // ── Heartbeat timer ────────────────────────────────────────
    this.startHeartbeat();

    console.log(`${LOG_PREFIX} Initialised`);
  }

  /**
   * Create a new Claude tab group containing the given tab.
   * Returns the new group ID.
   */
  async createGroup(tabId: number, title?: string): Promise<number> {
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });

    await chrome.tabGroups.update(groupId, {
      title: title || GROUP_TITLE,
      color: GROUP_COLOR,
      collapsed: false,
    });

    const groupTitle = title || GROUP_TITLE;
    this.groups.set(groupId, new Set([tabId]));
    this.groupTitles.set(groupId, groupTitle);
    await this.persistActiveGroupId(groupId);

    console.log(`${LOG_PREFIX} Created group ${groupId} ("${groupTitle}") with tab ${tabId}`);
    return groupId;
  }

  /**
   * Return the tab group ID that contains the given tab, or
   * `undefined` if the tab is not in any Claude-managed group.
   */
  findGroupByTab(tabId: number): number | undefined {
    for (const [groupId, tabs] of this.groups) {
      if (tabs.has(tabId)) {
        return groupId;
      }
    }
    return undefined;
  }

  /**
   * Return the first (main) tab ID in the given group.
   */
  getMainTabId(groupId: number): number | undefined {
    const tabs = this.groups.get(groupId);
    if (!tabs || tabs.size === 0) {
      return undefined;
    }
    return tabs.values().next().value as number;
  }

  /**
   * Find a managed group by its title (case-insensitive).
   * Returns the group ID or `undefined`.
   */
  findGroupByTitle(title: string): number | undefined {
    const lower = title.toLowerCase();
    for (const [groupId, groupTitle] of this.groupTitles) {
      if (groupTitle.toLowerCase() === lower && this.groups.has(groupId)) {
        return groupId;
      }
    }
    return undefined;
  }

  /**
   * Add a tab to an existing managed group.
   * Moves the tab to the group's window first if necessary.
   */
  async addTabToGroup(tabId: number, groupId: number): Promise<void> {
    // Ensure the tab is in the same window as the group
    const groupTabs = await chrome.tabs.query({ groupId });
    if (groupTabs.length > 0) {
      const groupWindowId = groupTabs[0].windowId;
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId !== groupWindowId) {
        await chrome.tabs.move(tabId, { windowId: groupWindowId, index: -1 });
      }
    }

    await chrome.tabs.group({ tabIds: [tabId], groupId });
    const tabs = this.groups.get(groupId);
    if (tabs) {
      tabs.add(tabId);
    }
    console.log(`${LOG_PREFIX} Added tab ${tabId} to group ${groupId}`);
  }

  /**
   * Return info about all managed tab groups, including titles and tab details.
   */
  async getGroups(): Promise<Array<{ groupId: number; title: string; tabs: Array<{ id: number; url: string; title: string }> }>> {
    const result: Array<{ groupId: number; title: string; tabs: Array<{ id: number; url: string; title: string }> }> = [];

    for (const [groupId, tabIds] of this.groups) {
      const title = this.groupTitles.get(groupId) || GROUP_TITLE;
      const tabs: Array<{ id: number; url: string; title: string }> = [];

      for (const tabId of tabIds) {
        try {
          const tab = await chrome.tabs.get(tabId);
          tabs.push({
            id: tab.id ?? tabId,
            url: tab.url ?? '',
            title: tab.title ?? '',
          });
        } catch {
          // Tab no longer exists
        }
      }

      if (tabs.length > 0) {
        result.push({ groupId, title, tabs });
      }
    }

    return result;
  }

  /**
   * If the given tab is not already in a Claude group, add it to
   * the most recently active Claude group (persisted in storage).
   */
  async adoptOrphanedGroup(tabId: number, title?: string): Promise<void> {
    // Already in a managed group.
    if (this.findGroupByTab(tabId) !== undefined) {
      return;
    }

    const activeGroupId = await storageGet<number>(StorageKey.MCP_TAB_GROUP_ID);
    if (activeGroupId === undefined || !this.groups.has(activeGroupId)) {
      // No active group — create a new one.
      await this.createGroup(tabId, title);
      return;
    }

    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: activeGroupId });
      this.groups.get(activeGroupId)!.add(tabId);
      console.log(`${LOG_PREFIX} Adopted tab ${tabId} into group ${activeGroupId}`);
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Failed to adopt tab ${tabId} into group ${activeGroupId}:`,
        err,
      );
      // Group may have been destroyed — create a fresh one.
      await this.createGroup(tabId);
    }
  }

  /**
   * Handle a tab being closed.  If it was the last tab in its
   * Claude group, clean up the group.
   */
  async handleTabClosed(tabId: number): Promise<void> {
    const groupId = this.findGroupByTab(tabId);
    if (groupId === undefined) {
      return;
    }

    const tabs = this.groups.get(groupId)!;
    tabs.delete(tabId);

    if (tabs.size === 0) {
      this.groups.delete(groupId);
      this.groupTitles.delete(groupId);

      // Clear persisted group ID if it was the active one.
      const storedId = await storageGet<number>(StorageKey.MCP_TAB_GROUP_ID);
      if (storedId === groupId) {
        await storageRemove(StorageKey.MCP_TAB_GROUP_ID);
      }

      console.log(
        `${LOG_PREFIX} Group ${groupId} removed (last tab ${tabId} closed)`,
      );
    }
  }

  /**
   * Remove all Claude-managed tab groups, ungrouping their tabs.
   */
  async clearAllGroups(): Promise<void> {
    for (const [groupId, tabs] of this.groups) {
      for (const tabId of tabs) {
        try {
          await chrome.tabs.ungroup(tabId);
        } catch {
          // Tab may no longer exist.
        }
      }
      this.groups.delete(groupId);
    }

    this.groupTitles.clear();
    await storageRemove(StorageKey.MCP_TAB_GROUP_ID);
    console.log(`${LOG_PREFIX} All groups cleared`);
  }

  // ── Indicator orchestration ──────────────────────────────────────

  /**
   * Send `SHOW_AGENT_INDICATORS` to all content scripts in the given
   * tab group (or a single tab).
   */
  async showAgentIndicators(tabIdOrGroupId: number, isGroup = false): Promise<void> {
    const tabIds = isGroup ? this.getTabIds(tabIdOrGroupId) : [tabIdOrGroupId];
    await this.broadcastToTabs(tabIds, { type: 'SHOW_AGENT_INDICATORS' });
  }

  /**
   * Send `HIDE_AGENT_INDICATORS` to all content scripts in the given
   * tab group (or a single tab).
   */
  async hideAgentIndicators(tabIdOrGroupId: number, isGroup = false): Promise<void> {
    const tabIds = isGroup ? this.getTabIds(tabIdOrGroupId) : [tabIdOrGroupId];
    await this.broadcastToTabs(tabIds, { type: 'HIDE_AGENT_INDICATORS' });
  }

  /**
   * Temporarily hide the indicator overlay before taking a screenshot.
   */
  async hideForToolUse(tabId: number): Promise<void> {
    await this.sendToTab(tabId, { type: 'HIDE_FOR_TOOL_USE' });
  }

  /**
   * Restore the indicator overlay after a screenshot completes.
   */
  async showAfterToolUse(tabId: number): Promise<void> {
    await this.sendToTab(tabId, { type: 'SHOW_AFTER_TOOL_USE' });
  }

  /**
   * Send `HIDE_STATIC_INDICATOR` to every tab in the given group.
   */
  async dismissStaticIndicatorsForGroup(groupId: number): Promise<void> {
    const tabIds = this.getTabIds(groupId);
    await this.broadcastToTabs(tabIds, { type: 'HIDE_STATIC_INDICATOR' });
    console.log(`${LOG_PREFIX} Dismissed static indicators for group ${groupId}`);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Keep the internal groups map in sync when Chrome moves a tab
   * into or out of a group.
   */
  private syncTabGroupMembership(tabId: number, newGroupId: number): void {
    // Remove from old group.
    for (const [gid, tabs] of this.groups) {
      if (tabs.has(tabId) && gid !== newGroupId) {
        tabs.delete(tabId);
        if (tabs.size === 0) {
          this.groups.delete(gid);
        }
      }
    }

    // Add to new group if it is one of ours.
    if (newGroupId !== -1 && this.groups.has(newGroupId)) {
      this.groups.get(newGroupId)!.add(tabId);
    }
  }

  /**
   * Get all tab IDs for a managed group.
   */
  private getTabIds(groupId: number): number[] {
    const tabs = this.groups.get(groupId);
    return tabs ? Array.from(tabs) : [];
  }

  /**
   * Send a message to a single tab's content script.
   */
  private async sendToTab(tabId: number, message: Record<string, unknown>): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Tab may not have a content script loaded (e.g. chrome:// pages).
    }
  }

  /**
   * Broadcast a message to multiple tabs.
   */
  private async broadcastToTabs(tabIds: number[], message: Record<string, unknown>): Promise<void> {
    await Promise.allSettled(
      tabIds.map((id) => this.sendToTab(id, message)),
    );
  }

  /**
   * Persist the active Claude group ID in storage so it survives
   * service-worker restarts.
   */
  private async persistActiveGroupId(groupId: number): Promise<void> {
    await storageSet(StorageKey.MCP_TAB_GROUP_ID, groupId);
  }

  // ── Heartbeat ────────────────────────────────────────────────────

  /**
   * Start a periodic heartbeat that sends `STATIC_INDICATOR_HEARTBEAT`
   * to every tab in every managed group.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      return; // Already running.
    }

    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatTick();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Single heartbeat tick — sends the heartbeat message to all
   * managed tabs and prunes any tabs that no longer exist.
   */
  private async heartbeatTick(): Promise<void> {
    for (const [groupId, tabs] of this.groups) {
      const deadTabs: number[] = [];

      for (const tabId of tabs) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'STATIC_INDICATOR_HEARTBEAT',
          });
        } catch {
          // Tab no longer exists or has no listener — mark for removal.
          deadTabs.push(tabId);
        }
      }

      // Prune dead tabs.
      for (const tabId of deadTabs) {
        tabs.delete(tabId);
      }

      if (tabs.size === 0) {
        this.groups.delete(groupId);
        this.groupTitles.delete(groupId);
      }
    }
  }

  /**
   * Stop the heartbeat timer.  Called internally if the manager is
   * ever torn down (not typical in a service-worker lifecycle).
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────

export const tabManager = new TabManager();
