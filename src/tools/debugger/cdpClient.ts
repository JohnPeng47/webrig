/**
 * Chrome Debugger Protocol (CDP) client — wraps chrome.debugger to
 * provide a clean async interface for attaching to tabs and sending
 * CDP commands.
 *
 * Usage:
 *   import { cdpClient } from './cdpClient';
 *   await cdpClient.sendCommand(tabId, 'Page.captureScreenshot', { format: 'png' });
 */

export class CdpClient {
  private attachedTabs = new Set<number>();

  constructor() {
    this.setupListeners();
  }

  // ── Attach ────────────────────────────────────────────────────────

  /**
   * Attach the Chrome debugger to a tab.
   *
   * Handles the common "Another debugger is already attached" error
   * gracefully — the tab is marked as attached so subsequent
   * `sendCommand` calls do not keep retrying.
   */
  async attach(tabId: number, protocolVersion = '1.3'): Promise<void> {
    if (this.attachedTabs.has(tabId)) {
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ tabId }, protocolVersion, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      this.attachedTabs.add(tabId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // If another debugger (e.g. DevTools) is already attached we
      // can still send commands through chrome.debugger.sendCommand.
      // Track the tab so we don't try to re-attach endlessly.
      if (message.includes('Another debugger is already attached')) {
        console.warn(
          `[CdpClient] Another debugger already attached to tab ${tabId}; ` +
            'proceeding with caution.',
        );
        this.attachedTabs.add(tabId);
        return;
      }

      throw new Error(`Failed to attach debugger to tab ${tabId}: ${message}`);
    }
  }

  // ── Detach ────────────────────────────────────────────────────────

  /**
   * Detach the debugger from a tab.  Silently succeeds if we were not
   * attached.
   */
  async detach(tabId: number): Promise<void> {
    if (!this.attachedTabs.has(tabId)) {
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.detach({ tabId }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (err) {
      // If the tab was already closed or the debugger was already
      // detached, just swallow the error.
      console.warn(
        `[CdpClient] Error detaching from tab ${tabId}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      this.attachedTabs.delete(tabId);
    }
  }

  // ── Query ─────────────────────────────────────────────────────────

  /** Returns `true` if the debugger is believed to be attached to `tabId`. */
  isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  // ── Send Command ──────────────────────────────────────────────────

  /**
   * Send a CDP command to a tab.  Auto-attaches if not currently
   * attached.
   *
   * If the command fails because the debugger was unexpectedly
   * detached, one automatic re-attach + retry is attempted.
   *
   * @param tabId   Chrome tab ID.
   * @param method  CDP domain method (e.g. `Page.captureScreenshot`).
   * @param params  Optional parameters for the method.
   * @returns       The CDP result object.
   */
  async sendCommand(
    tabId: number,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<any> {
    // Auto-attach if not currently attached.
    if (!this.attachedTabs.has(tabId)) {
      await this.attach(tabId);
    }

    try {
      return await this._rawSendCommand(tabId, method, params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // If the debugger was unexpectedly detached, try to re-attach
      // and send the command one more time.
      if (
        message.includes('Debugger is not attached') ||
        message.includes('No target with given id')
      ) {
        this.attachedTabs.delete(tabId);
        await this.attach(tabId);
        return this._rawSendCommand(tabId, method, params);
      }

      throw new Error(
        `CDP command ${method} failed on tab ${tabId}: ${message}`,
      );
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  /** Detach from every tab we are currently attached to. */
  async detachAll(): Promise<void> {
    const tabIds = Array.from(this.attachedTabs);
    await Promise.allSettled(tabIds.map((id) => this.detach(id)));
  }

  // ── Listeners ─────────────────────────────────────────────────────

  /**
   * Install a `chrome.debugger.onDetach` listener to keep the
   * `attachedTabs` set in sync when the debugger disconnects for
   * reasons outside our control (user closed DevTools, tab crashed,
   * extension reload, etc.).
   */
  setupListeners(): void {
    chrome.debugger.onDetach.addListener(
      (source: chrome.debugger.Debuggee, reason: string) => {
        if (source.tabId != null) {
          const wasTracked = this.attachedTabs.delete(source.tabId);
          if (wasTracked) {
            console.log(
              `[CdpClient] Debugger detached from tab ${source.tabId} ` +
                `(reason: ${reason})`,
            );
          }
        }
      },
    );
  }

  // ── Private helpers ───────────────────────────────────────────────

  /** Low-level wrapper around `chrome.debugger.sendCommand`. */
  private _rawSendCommand(
    tabId: number,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      chrome.debugger.sendCommand(
        { tabId },
        method,
        params ?? {},
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        },
      );
    });
  }
}

/** Shared singleton used by all debugger-based tools. */
export const cdpClient = new CdpClient();
