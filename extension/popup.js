// CarbonLens Popup Script
// Handles UI interactions, displays real-time extension state, and
// communicates with the background service worker.

const selectors = {
  modePill: '#modePill',
  backendStatus: '#backendStatus',
  lastSyncValue: '#lastSyncValue',
  totalActivities: '#totalActivities',
  lastStatus: '#lastStatus',
  awarenessBtn: '#awarenessBtn',
  silentBtn: '#silentBtn',
  backendInput: '#backendInput',
  saveBackendBtn: '#saveBackendBtn',
  refreshHealthBtn: '#refreshHealthBtn',
  clearStatsBtn: '#clearStatsBtn',
  feedback: '#feedback',
  versionLabel: '#versionLabel',
};

const elements = {};
let latestState = null;

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  setVersionLabel();
  setupRuntimeListener();
  setupStorageListener();
  requestState();
});

function cacheElements() {
  Object.entries(selectors).forEach(([key, selector]) => {
    elements[key] = document.querySelector(selector);
  });
}

function bindEvents() {
  elements.awarenessBtn?.addEventListener('click', () => {
    setMode('awareness');
  });

  elements.silentBtn?.addEventListener('click', () => {
    setMode('silent');
  });

  elements.saveBackendBtn?.addEventListener('click', () => {
    const backendUrl = elements.backendInput?.value?.trim();
    if (!backendUrl) {
      showFeedback('Please enter a backend URL.', 'error');
      return;
    }
    setBackendUrl(backendUrl);
  });

  elements.refreshHealthBtn?.addEventListener('click', () => {
    // Show immediate backend status while we check
    if (elements.backendStatus) {
      elements.backendStatus.textContent = 'Checking...';
      elements.backendStatus.classList.remove('success', 'danger');
      elements.backendStatus.classList.add('warning');
    }
    showFeedback('Checking connection...', '');
    sendMessage({ type: 'REFRESH_HEALTH' }, (response) => {
      // If the background returned an explicit healthCheck result, use it to update UI immediately
      const reachable = response?.healthCheck?.reachable;
      if (typeof reachable === 'boolean') {
        updateBackendStatus(reachable);
        showFeedback(reachable ? 'Backend is online.' : 'Backend is offline.', reachable ? 'success' : 'error');
      } else if (response?.state) {
        // fallback to state returned
        latestState = response.state;
        renderState();
        showFeedback('Connection status updated.', '');
      }
    });
  });

  elements.clearStatsBtn?.addEventListener('click', () => {
    sendMessage({ type: 'CLEAR_STATS' }, () => {
      showFeedback('Stats reset.', 'success');
    });
  });
}

function setVersionLabel() {
  const manifest = chrome.runtime.getManifest();
  if (elements.versionLabel) {
    elements.versionLabel.textContent = `v${manifest.version}`;
  }
}

function requestState() {
  sendMessage({ type: 'GET_STATE' });
}

function setMode(mode) {
  if (!['awareness', 'silent'].includes(mode)) {
    return;
  }
  sendMessage({ type: 'SET_MODE', payload: { mode } });
}

function setBackendUrl(backendBaseUrl) {
  sendMessage({ type: 'SET_BACKEND_URL', payload: { backendBaseUrl } }, (response) => {
    if (response?.success) {
      showFeedback('Backend updated successfully.', 'success');
    } else {
      showFeedback(response?.error || 'Failed to update backend.', 'error');
    }
  });
}

function sendMessage(message, callback) {
  chrome.runtime.sendMessage(
    { source: 'carbonlens-popup', ...message },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[CarbonLens Popup] Message error:', chrome.runtime.lastError);
        showFeedback('Extension is not responding. Try reopening.', 'error');
        return;
      }

      if (response?.state) {
        latestState = response.state;
        renderState();
      }

      if (typeof callback === 'function') {
        callback(response);
      }

      if (response && response.success === false && response.error) {
        showFeedback(response.error, 'error');
      }
    }
  );
}

function renderState() {
  if (!latestState) {
    return;
  }

  updateModeSection(latestState.mode);
  updateBackendStatus(latestState.isBackendReachable);
  updateLastSync(latestState.lastSyncAt, latestState.lastSyncStatus);
  updateStats(latestState.totalActivitiesTracked, latestState.lastSyncStatus);
  updateBackendInput(latestState.backendBaseUrl);
}

function updateModeSection(mode) {
  if (!elements.modePill) {
    return;
  }

  const isAwareness = mode !== 'silent';
  elements.modePill.textContent = isAwareness ? 'Awareness Mode' : 'Silent Mode';
  elements.modePill.classList.toggle('silent', !isAwareness);

  elements.awarenessBtn?.classList.toggle('active', isAwareness);
  elements.silentBtn?.classList.toggle('active', !isAwareness);
}

function updateBackendStatus(isReachable) {
  if (!elements.backendStatus) {
    return;
  }

  if (isReachable) {
    elements.backendStatus.textContent = 'Online';
    elements.backendStatus.classList.remove('danger', 'warning');
    elements.backendStatus.classList.add('success');
  } else {
    elements.backendStatus.textContent = 'Offline';
    elements.backendStatus.classList.remove('success', 'warning');
    elements.backendStatus.classList.add('danger');
  }
}

function updateLastSync(lastSyncAt, lastSyncStatus) {
  if (!elements.lastSyncValue) {
    return;
  }

  if (!lastSyncAt) {
    elements.lastSyncValue.textContent = 'No sync yet';
    // Even if there's no timestamp, show the last sync status (success/error/Synced)
    if (elements.lastStatus) {
      const statusText =
        lastSyncStatus === 'success'
          ? 'Synced'
          : lastSyncStatus === 'error'
          ? 'Sync error'
          : lastSyncStatus === 'syncing'
          ? 'Syncing...'
          : 'Synced';
      elements.lastStatus.textContent = statusText;
    }
    return;
  }

  const date = new Date(lastSyncAt);
  const formatted = `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${date.toLocaleDateString()}`;
  elements.lastSyncValue.textContent = formatted;

  if (elements.lastStatus) {
    const statusText =
      lastSyncStatus === 'success'
        ? 'Synced'
        : lastSyncStatus === 'error'
        ? 'Sync error'
        : 'Synced';
    elements.lastStatus.textContent = statusText;
  }
}

function updateStats(totalActivities, lastSyncStatus) {
  if (elements.totalActivities) {
    elements.totalActivities.textContent = totalActivities ?? 0;
  }

  if (elements.lastStatus && !latestState?.lastSyncAt) {
    elements.lastStatus.textContent = 'Synced';
  }

  if (elements.lastStatus && latestState?.lastSyncAt) {
    const statusText =
      lastSyncStatus === 'success'
        ? 'Synced'
        : lastSyncStatus === 'error'
        ? 'Sync error'
        : 'Synced';
    elements.lastStatus.textContent = statusText;
  }
}

function updateBackendInput(backendBaseUrl) {
  if (elements.backendInput && typeof backendBaseUrl === 'string') {
    elements.backendInput.value = backendBaseUrl;
  }
}

function showFeedback(message, variant) {
  if (!elements.feedback) {
    return;
  }

  elements.feedback.textContent = message || '';
  elements.feedback.classList.remove('success', 'error');

  if (variant === 'success') {
    elements.feedback.classList.add('success');
  } else if (variant === 'error') {
    elements.feedback.classList.add('error');
  }
}

function setupStorageListener() {
  // Listen for changes to totalActivitiesTracked in storage
  // This allows the popup to update in real-time when emails are sent
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    // If totalActivitiesTracked changed, update the state
    if (changes.totalActivitiesTracked || changes.lastSyncStatus || changes.lastSyncAt) {
      // Request fresh state from background to get all updated values
      requestState();
    }
  });
}

function setupRuntimeListener() {
  // Listen for background broadcasts (STATE_UPDATED) so popup updates immediately
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.source !== 'carbonlens-background') return;

      if (message.type === 'STATE_UPDATED' && message.state) {
        latestState = message.state;
        renderState();
      }

      // Allow senders to get a response if needed
      if (typeof sendResponse === 'function') {
        try { sendResponse({ success: true }); } catch (e) {}
      }
      return true;
    });
  } catch (err) {
    console.warn('[CarbonLens Popup] Could not attach runtime message listener:', err);
  }
}
