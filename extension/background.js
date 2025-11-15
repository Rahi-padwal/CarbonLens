// CarbonLens Background Service Worker (Manifest V3)
// Listens for activity events from content scripts, manages extension
// state, communicates with the popup UI, and forwards activity payloads
// to the CarbonLens backend.

const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:5000';

const STATE = {
  mode: 'awareness',
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  isBackendReachable: true,
  lastHealthCheck: null,
  lastSyncStatus: 'idle', // 'idle' | 'syncing' | 'success' | 'error'
  lastSyncAt: null,
  totalActivitiesTracked: 0,
};

// In-memory dedupe tracking for recent activity to avoid double-counting
let _lastActivityFingerprint = null;
let _lastActivityAt = 0; // timestamp in ms

// Promise used to signal when STATE has been rehydrated from storage.
let _resolveStateReady = null;
const stateReady = new Promise((resolve) => { _resolveStateReady = resolve; });

const API_ENDPOINTS = {
  health: '/api/health',
  activity: '/api/activities/log',
};

const ICONS = {
  awareness: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  silent: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CarbonLens Background] ✅ Extension installed. Initializing state.');
  initializeState();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[CarbonLens Background] ✅ Browser startup detected. Restoring state.');
  initializeState();
});

// Log that the background script has loaded
console.log('[CarbonLens Background] 🚀 Service worker initialized');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  console.log('[CarbonLens Background] Message received:', message.source, message.type);

  // Messages from content scripts (Gmail / Outlook)
  if (message.source === 'carbonlens-content') {
    if (message.type === 'ACTIVITY_DETECTED') {
      console.log('[CarbonLens Background] ✅ Received activity from content script:', {
        platform: message.platform,
        activityType: message.payload?.activityType,
        subject: message.payload?.subject,
        user_email: message.payload?.user_email,
      });
      
      // Keep the message channel open for async response
      handleActivityEvent(message.payload, message.platform, message.mode)
        .then(() => {
          console.log('[CarbonLens Background] ✅ Activity processed successfully');
          try {
            sendResponse({ acknowledged: true });
          } catch (e) {
            console.error('[CarbonLens Background] Error sending response:', e);
          }
        })
        .catch((error) => {
          console.error('[CarbonLens Background] ❌ Activity handling failed:', error);
          try {
            sendResponse({ acknowledged: false, error: error?.message || String(error) });
          } catch (e) {
            console.error('[CarbonLens Background] Error sending error response:', e);
          }
        });
      
      // Return true to indicate we'll send a response asynchronously
      return true;
    }
    return false;
  }

  // Messages from popup interface
  if (message.source === 'carbonlens-popup') {
    handlePopupMessage(message)
      .then((result) => {
        try {
          sendResponse(result);
        } catch (e) {
          console.error('[CarbonLens Background] Error sending popup response:', e);
        }
      })
      .catch((error) => {
        console.error('[CarbonLens] Popup message error:', error);
        try {
          sendResponse({ success: false, error: error?.message, state: getSerializableState() });
        } catch (e) {
          console.error('[CarbonLens Background] Error sending popup error response:', e);
        }
      });
    return true; // Async response
  }

  return false;
});

chrome.action.onClicked.addListener(() => {
  const nextMode = STATE.mode === 'awareness' ? 'silent' : 'awareness';
  setMode(nextMode, { showNotification: true });
});

async function initializeState() {
  chrome.storage.local.get(
    ['mode', 'backendBaseUrl', 'totalActivitiesTracked', 'lastSyncStatus', 'lastSyncAt'],
    async (data) => {
      STATE.mode = data.mode === 'silent' ? 'silent' : 'awareness';
      STATE.backendBaseUrl = sanitizeBaseUrl(data.backendBaseUrl) || DEFAULT_BACKEND_BASE_URL;
      STATE.totalActivitiesTracked = data.totalActivitiesTracked || 0;
      STATE.lastSyncStatus = data.lastSyncStatus || 'idle';
      STATE.lastSyncAt = data.lastSyncAt || null;

      await performHealthCheck();
      updateExtensionIcon();
      broadcastMode();

      // Signal that the background state is now initialized from storage
      try {
        if (typeof _resolveStateReady === 'function') {
          _resolveStateReady();
        }
      } catch (err) {
        console.warn('[CarbonLens Background] Error resolving stateReady:', err);
      }
            // After rehydration, try to process any pending activities queued by content scripts
            try {
              processPendingActivities().catch((e) => console.warn('[CarbonLens Background] processPendingActivities error:', e));
            } catch (e) {
              console.warn('[CarbonLens Background] Failed to start processing pending activities:', e);
            }
    }
  );
}

async function handleActivityEvent(payload, platform, mode) {
  if (!payload) {
    console.warn('[CarbonLens Background] handleActivityEvent called with empty payload');
    return;
  }

  console.log('[CarbonLens Background] Processing activity event:', {
    platform,
    mode,
    activityType: payload.activityType,
    subject: payload.subject,
    user_email: payload.user_email,
  });

  const activityPayload = {
    ...payload,
    platform,
    mode: mode,
    extensionVersion: chrome.runtime.getManifest().version,
  };

  console.log('[CarbonLens Background] Activity payload prepared:', activityPayload);

  // Compute a simple fingerprint to dedupe duplicate dispatches (click + keyboard)
  try {
    const recipientsKey = Array.isArray(activityPayload.recipients)
      ? activityPayload.recipients.join(',')
      : String(activityPayload.recipients || '');
    const fingerprint = `${activityPayload.provider}::${activityPayload.subject || ''}::${activityPayload.sender || ''}::${recipientsKey}`;
    const now = Date.now();
    if (_lastActivityFingerprint && fingerprint === _lastActivityFingerprint && now - _lastActivityAt < 2000) {
      console.debug('[CarbonLens Background] Duplicate activity detected within 2s; ignoring to avoid double-counting', { fingerprint });
      return; // skip duplicate
    }
    _lastActivityFingerprint = fingerprint;
    _lastActivityAt = now;
  } catch (err) {
    console.warn('[CarbonLens Background] Error computing activity fingerprint for dedupe:', err);
  }

  // Increment counter immediately when activity is detected (for session tracking)
  // This ensures the counter reflects all detected emails, not just successfully synced ones
  STATE.totalActivitiesTracked += 1;
  persistState(['totalActivitiesTracked']);
  console.log('[CarbonLens Background] Activity detected. Total tracked this session:', STATE.totalActivitiesTracked);

  // Mark that a sync attempt is starting so UI can show 'Syncing...'
  try {
    STATE.lastSyncStatus = 'syncing';
    STATE.lastSyncAttemptAt = new Date().toISOString();
    persistState(['lastSyncStatus', 'lastSyncAt', 'lastSyncAttemptAt']);
    // Broadcast updated state to any open popups/content so UI updates immediately
    try {
      chrome.runtime.sendMessage({ source: 'carbonlens-background', type: 'STATE_UPDATED', state: getSerializableState() }, () => {});
    } catch (e) {
      console.warn('[CarbonLens Background] Error broadcasting STATE_UPDATED (syncing):', e);
    }
  } catch (err) {
    console.warn('[CarbonLens Background] Failed to mark sync attempt:', err);
  }

  if (STATE.mode === 'awareness') {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'CarbonLens Activity Detected',
        message: `${platform.toUpperCase()} email sent${payload.subject ? `: ${payload.subject}` : ''}`,
      });
    } catch (error) {
      console.warn('[CarbonLens Background] Could not create notification:', error);
    }
  }

  try {
    console.log('[CarbonLens Background] Sending activity to backend:', STATE.backendBaseUrl);
    const responseData = await sendActivityToBackend(activityPayload);
    console.log('[CarbonLens Background] Backend responded successfully:', responseData);
    
    STATE.lastSyncStatus = 'success';
    STATE.lastSyncAt = new Date().toISOString();
    if (responseData?.emissionKg !== undefined) {
      activityPayload.emissionKg = responseData.emissionKg;
    }
    try {
      persistState(['lastSyncStatus', 'lastSyncAt']);
      try {
        chrome.runtime.sendMessage({ source: 'carbonlens-background', type: 'STATE_UPDATED', state: getSerializableState() }, () => {});
      } catch (e) {
        console.warn('[CarbonLens Background] Error broadcasting STATE_UPDATED (success):', e);
      }
    } catch (err) {
      console.warn('[CarbonLens Background] Error persisting success state:', err);
    }
    console.log('[CarbonLens Background] Activity synced successfully to backend');
  } catch (error) {
    console.error('[CarbonLens Background] Error syncing activity to backend:', error);
    STATE.lastSyncStatus = 'error';
    STATE.lastSyncAt = new Date().toISOString();
    try {
      persistState(['lastSyncStatus', 'lastSyncAt']);
      try {
        chrome.runtime.sendMessage({ source: 'carbonlens-background', type: 'STATE_UPDATED', state: getSerializableState() }, () => {});
      } catch (e) {
        console.warn('[CarbonLens Background] Error broadcasting STATE_UPDATED (error):', e);
      }
    } catch (err) {
      console.warn('[CarbonLens Background] Error persisting error state:', err);
    }

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'CarbonLens Sync Error',
        message: 'We could not sync the latest activity with CarbonLens backend.',
      });
    } catch (notifError) {
      console.warn('[CarbonLens Background] Could not create error notification:', notifError);
    }

    // Don't throw error - we've already counted the activity, just log the sync failure
    console.warn('[CarbonLens Background] Activity was counted but backend sync failed');
  }
}

// Helpers to read/write pendingActivities from storage (used when content queued events)
function getPendingActivities() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ pendingActivities: [] }, (data) => {
        if (chrome.runtime.lastError) {
          console.error('[CarbonLens Background] getPendingActivities failed:', chrome.runtime.lastError.message);
          return resolve([]);
        }
        resolve(Array.isArray(data.pendingActivities) ? data.pendingActivities.slice() : []);
      });
    } catch (err) {
      console.error('[CarbonLens Background] getPendingActivities exception:', err);
      resolve([]);
    }
  });
}

function setPendingActivities(list) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ pendingActivities: Array.isArray(list) ? list : [] }, () => {
        if (chrome.runtime.lastError) {
          console.error('[CarbonLens Background] setPendingActivities failed:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      console.error('[CarbonLens Background] setPendingActivities exception:', err);
      resolve();
    }
  });
}

// Process any activities queued by the content script when it couldn't reach the service worker.
// Processes items sequentially and removes items on successful handling. If a processing error
// occurs, stop further processing to avoid tight retry loops.
async function processPendingActivities() {
  try {
    let list = await getPendingActivities();
    if (!list || !list.length) return;
    console.debug('[CarbonLens Background] Found pendingActivities to process:', list.length);

    while (list.length) {
      const item = list[0];
      try {
        // Each queued item has shape: { payload, platform, ts }
        await handleActivityEvent(item.payload, item.platform, STATE.mode);
        // Remove the processed item
        list.shift();
        await setPendingActivities(list);
        console.debug('[CarbonLens Background] Processed and removed one pending activity; remaining:', list.length);
        // small pause between items to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn('[CarbonLens Background] Error processing pending activity - will retry later:', err);
        break;
      }
    }
  } catch (err) {
    console.error('[CarbonLens Background] processPendingActivities failed:', err);
  }
}

async function handlePopupMessage(message) {
  // Ensure background state has been rehydrated from storage before replying
  try {
    await stateReady;
  } catch (err) {
    console.warn('[CarbonLens Background] stateReady await failed:', err);
  }
  // For GET_STATE, ensure content scripts are present in open mail tabs (helps when SPA navigation prevented injection)
  async function ensureContentScripts() {
    try {
      const tabs = await new Promise((resolve) =>
        chrome.tabs.query({ url: ['https://mail.google.com/*', 'https://outlook.office.com/*', 'https://outlook.live.com/*'] }, resolve)
      );

      if (!tabs || !tabs.length) return { injected: 0, responsive: 0 };

      let responsive = 0;
      let injected = 0;

      for (const tab of tabs) {
        try {
          const pingRes = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { source: 'carbonlens-background', type: 'PING' }, (resp) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
              } else {
                resolve({ ok: true, resp });
              }
            });
          });

          if (pingRes.ok) {
            responsive += 1;
            continue;
          }

          // If not responsive, try to inject content script
          try {
            await new Promise((resolve, reject) => {
              chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, (results) => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve(results);
              });
            });
            injected += 1;

            // Try ping again after injection
            const secondPing = await new Promise((resolve) => {
              chrome.tabs.sendMessage(tab.id, { source: 'carbonlens-background', type: 'PING' }, (resp) => {
                if (chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve({ ok: true, resp });
                }
              });
            });

            if (secondPing.ok) responsive += 1;
          } catch (injErr) {
            console.warn('[CarbonLens Background] Failed to inject content script into tab', tab.id, injErr);
          }
        } catch (tabErr) {
          console.warn('[CarbonLens Background] Error pinging tab', tab.id, tabErr);
        }
      }

      console.debug('[CarbonLens Background] ensureContentScripts result:', { injected, responsive });
      return { injected, responsive };
    } catch (err) {
      console.warn('[CarbonLens Background] ensureContentScripts error:', err);
      return { injected: 0, responsive: 0 };
    }
  }
  switch (message.type) {
    case 'GET_STATE':
      // Try to ensure content scripts are loaded in any open mail tabs before returning state
      try {
        await ensureContentScripts();
      } catch (e) {
        console.warn('[CarbonLens Background] ensureContentScripts failed:', e);
      }
      return { success: true, state: getSerializableState() };

    case 'SET_MODE': {
      const requestedMode = message.payload?.mode;
      setMode(requestedMode);
      return { success: true, state: getSerializableState() };
    }

    case 'SET_BACKEND_URL': {
      const backendUrl = message.payload?.backendBaseUrl;
      setBackendBaseUrl(backendUrl);
      await performHealthCheck();
      return { success: true, state: getSerializableState() };
    }

    case 'REFRESH_HEALTH': {
      console.log('[CarbonLens Background] REFRESH_HEALTH requested by popup - performing health check');
      try {
        const reachable = await performHealthCheck(true);
        console.log('[CarbonLens Background] REFRESH_HEALTH result:', reachable);
        return { success: true, state: getSerializableState(), healthCheck: { reachable } };
      } catch (err) {
        console.error('[CarbonLens Background] REFRESH_HEALTH failed:', err);
        return { success: false, error: err?.message || String(err), state: getSerializableState() };
      }
    }

    case 'CLEAR_STATS': {
      clearStats();
      return { success: true, state: getSerializableState() };
    }

    default:
      return { success: false, error: 'Unknown message type', state: getSerializableState() };
  }
}

function setMode(nextMode, options = {}) {
  const validatedMode = nextMode === 'silent' ? 'silent' : 'awareness';
  if (STATE.mode === validatedMode) {
    return;
  }

  STATE.mode = validatedMode;
  persistState(['mode']);
  updateExtensionIcon();
  broadcastMode();

  if (validatedMode === 'awareness' && options.showNotification) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'CarbonLens Awareness Mode',
      message: 'Real-time tips and notifications are active.',
    });
  }

  if (validatedMode === 'silent' && options.showNotification) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'CarbonLens Silent Mode',
      message: 'Tracking continues quietly without pop-up nudges.',
    });
  }
}

function setBackendBaseUrl(rawUrl) {
  const sanitized = sanitizeBaseUrl(rawUrl);
  if (!sanitized) {
    throw new Error('Please provide a valid backend URL (e.g., https://api.yourdomain.com).');
  }

  STATE.backendBaseUrl = sanitized;
  persistState(['backendBaseUrl']);
}

function sanitizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    try {
      const withProtocol = new URL(`https://${trimmed}`);
      withProtocol.hash = '';
      return withProtocol.toString().replace(/\/$/, '');
    } catch (fallbackError) {
      console.warn('[CarbonLens] Invalid backend URL provided:', value, fallbackError);
      return null;
    }
  }
}

async function performHealthCheck(force = false) {
  const now = Date.now();
  if (!force && STATE.lastHealthCheck && now - STATE.lastHealthCheck < 60 * 1000) {
    return STATE.isBackendReachable;
  }

  const url = new URL(API_ENDPOINTS.health, STATE.backendBaseUrl).toString();

  try {
    const response = await fetch(url, { method: 'GET' });
    STATE.isBackendReachable = response.ok;
  } catch (error) {
    STATE.isBackendReachable = false;
  } finally {
    STATE.lastHealthCheck = now;
  }

  return STATE.isBackendReachable;
}

async function sendActivityToBackend(activityPayload) {
  if (!STATE.backendBaseUrl) {
    console.error('[CarbonLens Background] Backend base URL is not configured');
    throw new Error('Backend base URL is not configured.');
  }

  console.log('[CarbonLens Background] Checking backend reachability...');
  // Ensure backend is reachable (retry every 5 minutes)
  if (
    !STATE.isBackendReachable ||
    (STATE.lastHealthCheck && Date.now() - STATE.lastHealthCheck > 5 * 60 * 1000)
  ) {
    console.log('[CarbonLens Background] Performing health check...');
    const reachable = await performHealthCheck(true);
    if (!reachable) {
      console.error('[CarbonLens Background] Backend is not reachable');
      throw new Error('Backend API is not reachable.');
    }
    console.log('[CarbonLens Background] Backend is reachable');
  }

  const url = new URL(API_ENDPOINTS.activity, STATE.backendBaseUrl).toString();
  console.log('[CarbonLens Background] Sending POST request to:', url);
  console.log('[CarbonLens Background] Payload:', activityPayload);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(activityPayload),
  });

  console.log('[CarbonLens Background] Response status:', response.status, response.statusText);

  let data;
  try {
    const responseText = await response.text();
    console.log('[CarbonLens Background] Response body:', responseText);
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error('[CarbonLens Background] Failed to parse response:', parseError);
    throw new Error(`Backend response could not be parsed (${response.status})`);
  }

  if (!response.ok || data?.success === false) {
    const errorMessage = data?.error || response.statusText || 'Unknown error';
    console.error('[CarbonLens Background] Backend returned error:', errorMessage);
    throw new Error(`Backend error (${response.status}): ${errorMessage}`);
  }

  console.log('[CarbonLens Background] Activity successfully sent to backend:', data);
  return data;
}

function updateExtensionIcon() {
  const iconSet = ICONS[STATE.mode] || ICONS.awareness;
  chrome.action.setIcon({ path: iconSet });
}

function broadcastMode() {
  chrome.tabs.query({ url: ['https://mail.google.com/*', 'https://outlook.office.com/*', 'https://outlook.live.com/*'] }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        source: 'carbonlens-background',
        type: 'UPDATE_MODE',
        payload: { mode: STATE.mode },
      }).catch((error) => {
        // Content script may not be ready or tab may not support it
        // This is expected and can be safely ignored
        if (error.message && !error.message.includes('Receiving end does not exist')) {
          console.warn('[CarbonLens] Error broadcasting mode to tab:', tab.id, error);
        }
      });
    });
  });
}

function clearStats() {
  STATE.totalActivitiesTracked = 0;
  STATE.lastSyncStatus = 'synced';
  STATE.lastSyncAt = null;
  persistState(['totalActivitiesTracked', 'lastSyncStatus', 'lastSyncAt']);
}

function persistState(fields = []) {
  if (!fields.length) {
    fields = ['mode', 'backendBaseUrl', 'totalActivitiesTracked', 'lastSyncStatus', 'lastSyncAt'];
  }

  const payload = {};
  fields.forEach((key) => {
    if (STATE[key] !== undefined) {
      payload[key] = STATE[key];
    }
  });

    if (Object.keys(payload).length) {
    try {
      console.debug('[CarbonLens Background] persistState writing to storage:', payload);
      chrome.storage.local.set(payload, () => {
        if (chrome.runtime.lastError) {
          console.error('[CarbonLens Background] persistState failed:', chrome.runtime.lastError.message, payload);
        } else {
          console.debug('[CarbonLens Background] persistState saved:', payload);
          // After storage is confirmed, broadcast the updated state so popups update reliably
          try {
            chrome.runtime.sendMessage({ source: 'carbonlens-background', type: 'STATE_UPDATED', state: getSerializableState() }, () => {});
          } catch (e) {
            console.warn('[CarbonLens Background] Error broadcasting STATE_UPDATED from persistState:', e);
          }
        }
      });
    } catch (err) {
      console.error('[CarbonLens Background] persistState exception:', err, payload);
    }
  }
}

function getSerializableState() {
  return {
    ...STATE,
    version: chrome.runtime.getManifest().version,
  };
}
