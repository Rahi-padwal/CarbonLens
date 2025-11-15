// CarbonLens Content Script
// Responsible for observing Gmail and Outlook web apps and sending
// normalized activity events to the background service worker.

(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    console.warn('[CarbonLens] chrome.runtime is not available. Content script exiting.');
    return;
  }

  const PLATFORM = {
    GMAIL: 'gmail',
    OUTLOOK: 'outlook',
  };

  const ACTIVITY_TYPE = {
    EMAIL: 'email',
  };

  const host = window.location.host;
  let currentPlatform = null;

  console.log('[CarbonLens] Content script loaded on:', host);
  if (host.includes('mail.google.com')) {
    currentPlatform = PLATFORM.GMAIL;
    console.log('[CarbonLens] Detected Gmail platform, initializing observer');
    initGmailObserver();
  } else if (host.includes('outlook.office.com') || host.includes('outlook.live.com')) {
    currentPlatform = PLATFORM.OUTLOOK;
    console.log('[CarbonLens] Detected Outlook platform, initializing observer');
    initOutlookObserver();
  } else {
    console.warn('[CarbonLens] Unsupported host for content script:', host);
    return;
  }

  // default mode and dedupe guard
  let mode = 'awareness';
  let _lastDispatchAt = 0; // simple dedupe guard to avoid double-dispatch on click+keyboard

  // Helpers to parse human-readable sizes like '234 KB' or '1.2 MB' into MB
  function parseSizeToMb(text) {
    if (!text) return 0;
    const m = String(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|B)/i);
    if (!m) return 0;
    const value = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === 'B') return value / (1024 * 1024);
    if (unit === 'KB') return value / 1024;
    return value; // MB
  }

  // Scan a compose root element for attachment size hints and sum them (MB)
  function computeAttachmentTotalMb(composeRoot) {
    try {
      let totalMb = 0;
      if (!composeRoot) return 0;
      const candidates = composeRoot.querySelectorAll('div[aria-label], span, div, li');
      for (const el of candidates) {
        try {
          const txt = (el.getAttribute && el.getAttribute('aria-label')) || el.innerText || el.textContent || '';
          if (!txt) continue;
          if (/\b(KB|MB|B)\b/i.test(txt)) {
            const mb = parseSizeToMb(txt);
            if (mb > 0) totalMb += mb;
          }
        } catch (e) {
          // ignore per-element errors
        }
      }
      return totalMb;
    } catch (e) {
      return 0;
    }
  }

  // Listen for messages from background (mode updates, pings)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== 'carbonlens-background') {
      return; // Ignore unrelated messages
    }

    switch (message.type) {
      case 'PING':
        sendResponse({ source: 'carbonlens-content', type: 'PONG' });
        break;
      case 'UPDATE_MODE':
        mode = message.payload?.mode ?? mode;
        console.debug('[CarbonLens] Mode updated via background:', mode);
        sendResponse({ source: 'carbonlens-content', type: 'MODE_UPDATED', mode });
        break;
      default:
        break;
    }

    return true;
  });

  function dispatchActivity(payload) {
    if (!payload) {
      console.warn('[CarbonLens] dispatchActivity called with empty payload');
      return;
    }

    try {
      console.log('[CarbonLens] Dispatching activity:', {
        type: payload.activityType,
        platform: currentPlatform,
        subject: payload.subject,
        user_email: payload.user_email,
      });

      const message = {
        source: 'carbonlens-content',
        type: 'ACTIVITY_DETECTED',
        platform: currentPlatform,
        mode,
        payload,
      };

      // sendMessage with retry/backoff in case the service worker is inactive
      const maxRetries = 3;
      const retryDelayBase = 300; // ms

      function sendWithRetry(attempt) {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            // Check for runtime errors first
            if (chrome.runtime.lastError) {
              console.error('[CarbonLens] Runtime error sending message (attempt', attempt, '):', chrome.runtime.lastError.message);
              if (attempt < maxRetries) {
                const delay = retryDelayBase * Math.pow(2, attempt - 1);
                console.debug('[CarbonLens] Retrying sendMessage in', delay, 'ms');
                setTimeout(() => sendWithRetry(attempt + 1), delay);
              } else {
                console.error('[CarbonLens] Failed to send activity after', maxRetries, 'attempts; queuing locally');
                try {
                  // Queue the activity in storage so background can pick it up later
                  chrome.storage.local.get({ pendingActivities: [] }, (data) => {
                    const list = data.pendingActivities || [];
                    list.push({ payload, platform: currentPlatform, ts: new Date().toISOString() });
                    chrome.storage.local.set({ pendingActivities: list }, () => {
                      if (chrome.runtime.lastError) {
                        console.error('[CarbonLens] Failed to queue pending activity:', chrome.runtime.lastError.message);
                      } else {
                        console.debug('[CarbonLens] Activity queued locally for later delivery');
                      }
                    });
                  });
                } catch (qerr) {
                  console.error('[CarbonLens] Error queueing activity locally:', qerr);
                }
              }
              return;
            }

            // Check response
            if (response) {
              if (response.acknowledged) {
                console.log('[CarbonLens] ✅ Activity acknowledged by background script');
              } else if (response.error) {
                console.error('[CarbonLens] ❌ Background script error:', response.error);
              } else {
                console.warn('[CarbonLens] Unexpected response format:', response);
              }
            } else {
              console.warn('[CarbonLens] No response from background script (may have disconnected)');
            }
          });
        } catch (err) {
          console.error('[CarbonLens] Exception while sending message (attempt', attempt, '):', err);
          if (attempt < maxRetries) {
            const delay = retryDelayBase * Math.pow(2, attempt - 1);
            setTimeout(() => sendWithRetry(attempt + 1), delay);
          }
        }
      }

      // Start first attempt
      sendWithRetry(1);
    } catch (error) {
      console.error('[CarbonLens] Error in dispatchActivity:', error);
    }
  }

  // Detect keyboard sends (Ctrl/Cmd + Enter) as a fallback when users send via keyboard
  function handleGlobalKeydown(e) {
    try {
      const isSendShortcut = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
      if (!isSendShortcut) return;

      // Simple dedupe: ignore if we dispatched very recently
      const now = Date.now();
      if (now - _lastDispatchAt < 1000) return;

      let composeRoot = null;
      // Try to find focused compose root for Gmail or Outlook
      if (currentPlatform === PLATFORM.GMAIL) {
        composeRoot = document.activeElement?.closest && document.activeElement.closest('div[role="dialog"]');
        // fallback: try to find any open compose dialog
        if (!composeRoot) composeRoot = document.querySelector('div[role="dialog"]');
      } else if (currentPlatform === PLATFORM.OUTLOOK) {
        composeRoot = document.activeElement?.closest && document.activeElement.closest('[role="dialog"], [data-app-section="Mail"]');
        if (!composeRoot) composeRoot = document.querySelector('[role="dialog"], [data-app-section="Mail"]');
      }

      if (!composeRoot) return;

      let activity = null;
      if (currentPlatform === PLATFORM.GMAIL) {
        activity = extractGmailEmailData(composeRoot);
      } else if (currentPlatform === PLATFORM.OUTLOOK) {
        activity = extractOutlookEmailData(composeRoot);
      }

      if (activity && activity.activityType) {
        _lastDispatchAt = now;
        console.debug('[CarbonLens] Detected keyboard send shortcut; dispatching activity');
        dispatchActivity(activity);
      }
    } catch (err) {
      console.error('[CarbonLens] Error in keyboard send handler:', err);
    }
  }

  // Attach global keyboard handler to catch Ctrl/Cmd+Enter sends
  try {
    document.addEventListener('keydown', handleGlobalKeydown, true);
  } catch (e) {
    console.warn('[CarbonLens] Could not attach global keydown listener:', e);
  }

  function initGmailObserver() {
    console.debug('[CarbonLens] Initializing Gmail observer');

    const observedButtons = new WeakSet();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          // Gmail loads compose dialogs lazily; look for send button inside
          // Try multiple selectors for Gmail's send button
          const sendButtonSelectors = [
            'div[role="button"][data-tooltip*="Send"]',
            'div[role="button"][aria-label*="Send"]',
            'div[aria-label="Send"]',
            '[data-tooltip="Send"]',
            '[aria-label="Send ‪(Ctrl+Enter)"]',
            '[aria-label="Send  (Ctrl+Enter)"]',
          ];

          sendButtonSelectors.forEach((selector) => {
            const sendButtons = node.querySelectorAll ? node.querySelectorAll(selector) : [];
            sendButtons.forEach((button) => attachGmailSendListener(button, observedButtons));

            if (node.matches && node.matches(selector)) {
              attachGmailSendListener(node, observedButtons);
            }
          });
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Attach to any existing compose send buttons
    const sendButtonSelectors = [
      'div[role="button"][data-tooltip*="Send"]',
      'div[role="button"][aria-label*="Send"]',
      'div[aria-label="Send"]',
      '[data-tooltip="Send"]',
    ];

    sendButtonSelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((button) => {
          attachGmailSendListener(button, observedButtons);
        });
      } catch (e) {
        console.warn('[CarbonLens] Error querying send buttons with selector:', selector, e);
      }
    });
  }

  function attachGmailSendListener(button, observedSet) {
    if (!button || observedSet.has(button)) {
      return;
    }

    try {
      // Robustly find the compose root for inline or dialog compose UIs
      function findComposeRoot(el) {
        if (!el) return null;
        // Common Gmail compose container
        let root = el.closest('div[role="dialog"]') || el.closest('div[role="region"]') || el.closest('form');
        try {
          if (root && (root.querySelector('input[name="subjectbox"]') || root.querySelector('div[aria-label="Message Body"]') || root.querySelector('textarea[name="to"]'))) {
            return root;
          }
        } catch (e) {
          // ignore
        }

        // Fallback: search for any open compose dialog on the page
        try {
          const candidates = document.querySelectorAll('div[role="dialog"], div[aria-label="New Message"], form');
          for (const c of candidates) {
            if (c.contains(el) || c.querySelector('input[name="subjectbox"], div[aria-label="Message Body"], textarea[name="to"]')) {
              return c;
            }
          }
        } catch (e) {
          // ignore
        }

        // Last resort: return null
        return null;
      }

      const handler = () => {
        try {
          console.log('[CarbonLens] Gmail send button clicked');
          const compose = findComposeRoot(button);
          if (!compose) {
            console.warn('[CarbonLens] Could not find compose dialog');
            return;
          }

          const activity = extractGmailEmailData(compose);
          if (!activity || !activity.activityType) {
            console.warn('[CarbonLens] Failed to extract email data from compose dialog');
            return;
          }

          console.log('[CarbonLens] Extracted email data:', {
            subject: activity.subject,
            recipients: activity.recipients?.length || 0,
            hasEmail: !!activity.user_email,
          });

          dispatchActivity(activity);
        } catch (error) {
          console.error('[CarbonLens] Error in send button handler:', error);
        }
      };

      // Tooltip support: show estimated CO₂ on hover
      let tooltipEl = null;
      function createTooltip() {
        const el = document.createElement('div');
        el.className = 'carbonlens-tooltip';
        el.style.position = 'absolute';
        el.style.zIndex = 2147483647; // top
        el.style.padding = '6px 8px';
        el.style.background = 'rgba(0,0,0,0.85)';
        el.style.color = '#fff';
        el.style.fontSize = '12px';
        el.style.borderRadius = '6px';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
        el.style.pointerEvents = 'none';
        el.style.transition = 'opacity 120ms ease-in-out';
        el.style.opacity = '0';
        document.body.appendChild(el);
        return el;
      }

      function removeTooltip() {
        if (tooltipEl && tooltipEl.parentNode) {
          tooltipEl.parentNode.removeChild(tooltipEl);
        }
        tooltipEl = null;
      }

      function formatEmissionKg(kg) {
        // Prefer grams for readability when under 1 kg
        const grams = kg * 1000;
        if (grams >= 1) {
          // Show with 1 decimal if <10g, otherwise integer grams
          if (grams < 10) return `${grams.toFixed(1)} g CO₂`;
          return `${Math.round(grams)} g CO₂`;
        }
        return `${kg.toFixed(6)} kg CO₂`;
      }

      function parseSizeToMb(text) {
        if (!text) return 0;
        const m = String(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|B)/i);
        if (!m) return 0;
        const value = parseFloat(m[1]);
        const unit = m[2].toUpperCase();
        if (unit === 'B') return value / (1024 * 1024);
        if (unit === 'KB') return value / 1024;
        return value; // MB
      }

      function guessAttachmentTotalMb(composeRoot) {
        try {
          let totalMb = 0;
          // Try to find attachment size labels in the compose root
          // Gmail attach elements often include sizes like "234 KB" or "1.2 MB"
          const candidates = composeRoot.querySelectorAll('div[aria-label], span, div');
          for (const el of candidates) {
            try {
              const txt = el.getAttribute && el.getAttribute('aria-label') || el.innerText || el.textContent || '';
              if (!txt) continue;
              if (/\b(KB|MB|B)\b/i.test(txt)) {
                const mb = parseSizeToMb(txt);
                if (mb > 0) totalMb += mb;
              }
            } catch (e) {
              // ignore
            }
          }
          return totalMb;
        } catch (e) {
          return 0;
        }
      }

      function estimateEmailEmission(composeRoot) {
        try {
          const activity = extractGmailEmailData(composeRoot);
          const recipients = Array.isArray(activity.recipients) ? activity.recipients.length : 1;
          const attachmentCount = activity.attachmentCount || 0;
          // New formula provided by user: CO2 (grams) ≈ C + A × S
          // C = 0.3 g (base), A = 15 g per MB, S = total attachment MB
          const BASE_G = 0.3;
          const PER_MB_G = 15;

          // Try to detect exact attachment sizes from compose if available
          let totalMb = guessAttachmentTotalMb(composeRoot);
          if (totalMb <= 0 && attachmentCount > 0) {
            // fallback: assume 1 MB per attachment
            totalMb = attachmentCount * 1;
          }

          const grams = BASE_G + PER_MB_G * totalMb;
          // Multiply by recipients (each recipient receives a copy)
          const totalGrams = grams * Math.max(recipients, 1);
          const kg = totalGrams / 1000;
          return { kg, grams: totalGrams };
        } catch (e) {
          return null;
        }
      }

      function mouseEnterHandler(e) {
        try {
          const compose = findComposeRoot(button) || button.closest('div[role="dialog"]');
          if (!compose) return;
          const emission = estimateEmailEmission(compose);
          if (!emission) return;
          const text = `${formatEmissionKg(emission.kg)} will be emitted (${Math.round(emission.grams)} g total)`;
          tooltipEl = createTooltip();
          tooltipEl.textContent = text;
          // Position tooltip near the button
          const rect = button.getBoundingClientRect();
          // Give the browser a tick to render tooltip so offsetHeight/offsetWidth are available
          requestAnimationFrame(() => {
            const top = window.scrollY + rect.top - 8 - tooltipEl.offsetHeight;
            const left = window.scrollX + rect.left + rect.width / 2 - (tooltipEl.offsetWidth / 2 || 0);
            tooltipEl.style.left = `${Math.max(8, left)}px`;
            tooltipEl.style.top = `${Math.max(8, top)}px`;
            // Force reflow then show
            void tooltipEl.offsetWidth;
            tooltipEl.style.opacity = '1';
          });
        } catch (err) {
          // ignore
        }
      }

      function mouseMoveHandler(e) {
        if (!tooltipEl) return;
        // Keep tooltip above button, recalc if size changed
        const rect = button.getBoundingClientRect();
        const top = window.scrollY + rect.top - 8 - tooltipEl.offsetHeight;
        const left = window.scrollX + rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
        tooltipEl.style.left = `${Math.max(8, left)}px`;
        tooltipEl.style.top = `${Math.max(8, top)}px`;
      }

      function mouseLeaveHandler(e) {
        if (tooltipEl) {
          tooltipEl.style.opacity = '0';
          setTimeout(removeTooltip, 150);
        }
      }

      button.addEventListener('mouseenter', mouseEnterHandler);
      button.addEventListener('mousemove', mouseMoveHandler);
      button.addEventListener('mouseleave', mouseLeaveHandler);

      button.addEventListener('click', handler, { capture: true, once: false });
      observedSet.add(button);
      console.debug('[CarbonLens] Attached listener + tooltip to Gmail send button');
    } catch (error) {
      console.error('[CarbonLens] Error attaching Gmail send listener:', error);
    }
  }

  function getGmailAccountEmail() {
    try {
      // Method 1: Check account button
      const accountButton = document.querySelector('a[aria-label*="@"]');
      if (accountButton) {
        const ariaLabel = accountButton.getAttribute('aria-label');
        const emailMatch = ariaLabel.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          console.log('[CarbonLens] Found email from account button:', emailMatch[1]);
          return emailMatch[1];
        }
      }
      
      // Method 2: Check profile picture alt text
      const profilePic = document.querySelector('img[alt*="@"]');
      if (profilePic) {
        const alt = profilePic.getAttribute('alt');
        const emailMatch = alt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          console.log('[CarbonLens] Found email from profile pic:', emailMatch[1]);
          return emailMatch[1];
        }
      }
      
      // Method 3: Check page title (often contains email)
      const pageTitle = document.title;
      const titleEmailMatch = pageTitle.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (titleEmailMatch) {
        console.log('[CarbonLens] Found email from page title:', titleEmailMatch[1]);
        return titleEmailMatch[1];
      }
      
      // Method 4: Check URL params
      const urlParams = new URLSearchParams(window.location.search);
      const emailParam = urlParams.get('authuser') || urlParams.get('email');
      if (emailParam && emailParam.includes('@')) {
        console.log('[CarbonLens] Found email from URL params:', emailParam);
        return emailParam;
      }
      
      // Method 5: Try to get from Google account info in page
      const accountInfo = document.querySelector('[data-ogsc]') || document.querySelector('[email]');
      if (accountInfo) {
        const emailAttr = accountInfo.getAttribute('email') || accountInfo.getAttribute('data-email');
        if (emailAttr && emailAttr.includes('@')) {
          console.log('[CarbonLens] Found email from account info:', emailAttr);
          return emailAttr;
        }
      }
      
      console.warn('[CarbonLens] Could not extract Gmail account email - tried all methods');
    } catch (e) {
      console.error('[CarbonLens] Error extracting Gmail email:', e);
    }
    return null;
  }

  function extractGmailEmailData(composeRoot) {
    const toField = composeRoot?.querySelector('textarea[name="to"], div[aria-label="To"]');
    const subjectField = composeRoot?.querySelector('input[name="subjectbox"]');
    const bodyField = composeRoot?.querySelector('div[aria-label="Message Body"]');
    const attachmentsContainer = composeRoot?.querySelector('div[data-tooltip*="Attachment"]');

    const recipients = toField?.innerText || toField?.value || '';
    const subject = subjectField?.value || '';
    const bodyPreview = bodyField?.innerText?.slice(0, 280) || '';
    const attachmentCount = attachmentsContainer ? attachmentsContainer.querySelectorAll('div[role="listitem"]').length : 0;
    const accountEmail = getGmailAccountEmail();

    // Estimate attachment total size (MB) from compose DOM
    const totalMb = computeAttachmentTotalMb(composeRoot) || 0;
    const attachmentBytes = Math.round(totalMb * 1_000_000);

    return {
      activityType: ACTIVITY_TYPE.EMAIL,
      timestamp: new Date().toISOString(),
      provider: PLATFORM.GMAIL,
      subject,
      recipients: normalizeRecipientList(recipients),
      bodyPreview,
      attachmentCount,
      // include both camelCase and snake_case keys to satisfy different backends
      attachmentBytes,
      attachment_bytes: attachmentBytes,
      direction: 'outbound',
      sender: accountEmail,
      user_email: accountEmail,
      metadata: {
        source: 'gmail_web',
        location: window.location.href,
        account_email: accountEmail,
        direction: 'outbound',
      },
    };
  }

  function initOutlookObserver() {
    console.debug('[CarbonLens] Initializing Outlook observer');

    const observedButtons = new WeakSet();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          const sendButtons = node.querySelectorAll('button[aria-label="Send"]');
          sendButtons.forEach((button) => attachOutlookSendListener(button, observedButtons));

          if (node.matches && node.matches('button[aria-label="Send"]')) {
            attachOutlookSendListener(node, observedButtons);
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document
      .querySelectorAll('button[aria-label="Send"]')
      .forEach((button) => attachOutlookSendListener(button, observedButtons));
  }

  function attachOutlookSendListener(button, observedSet) {
    if (!button || observedSet.has(button)) return;

    const handler = () => {
      const compose = button.closest('[role="dialog"], [data-app-section="Mail"]');
      const activity = extractOutlookEmailData(compose);
      dispatchActivity(activity);
    };

    button.addEventListener('click', handler, { capture: true });
    observedSet.add(button);
  }

  function getOutlookAccountEmail() {
    try {
      // Method 1: Check account button
      const accountButton = document.querySelector('button[aria-label*="@"], a[aria-label*="@"]');
      if (accountButton) {
        const ariaLabel = accountButton.getAttribute('aria-label');
        const emailMatch = ariaLabel.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          console.log('[CarbonLens] Found email from account button:', emailMatch[1]);
          return emailMatch[1];
        }
      }
      
      // Method 2: Check user info elements
      const userInfo = document.querySelector('[data-testid*="user"], [id*="user"], [data-automation-id*="user"]');
      if (userInfo) {
        const text = userInfo.innerText || userInfo.textContent || userInfo.getAttribute('title');
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          console.log('[CarbonLens] Found email from user info:', emailMatch[1]);
          return emailMatch[1];
        }
      }
      
      // Method 3: Check page title
      const pageTitle = document.title;
      const titleEmailMatch = pageTitle.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (titleEmailMatch) {
        console.log('[CarbonLens] Found email from page title:', titleEmailMatch[1]);
        return titleEmailMatch[1];
      }
      
      // Method 4: Check URL
      const urlEmailMatch = window.location.href.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (urlEmailMatch) {
        console.log('[CarbonLens] Found email from URL:', urlEmailMatch[1]);
        return urlEmailMatch[1];
      }
      
      console.warn('[CarbonLens] Could not extract Outlook account email - tried all methods');
    } catch (e) {
      console.error('[CarbonLens] Error extracting Outlook email:', e);
    }
    return null;
  }

  function extractOutlookEmailData(composeRoot) {
    const toField = composeRoot?.querySelector('input[aria-label="To"]');
    const subjectField = composeRoot?.querySelector('input[aria-label="Add a subject"]');
    const bodyField = composeRoot?.querySelector('[aria-label="Message body"]');
    const attachmentContainer = composeRoot?.querySelector('[data-app-section="Attachments"]');

    const recipients = toField?.value || '';
    const subject = subjectField?.value || '';
    const bodyPreview = bodyField?.innerText?.slice(0, 280) || '';
    const attachmentCount = attachmentContainer ? attachmentContainer.querySelectorAll('[role="listitem"]').length : 0;
    const accountEmail = getOutlookAccountEmail();

    // Estimate attachment size for Outlook compose
    const totalMb = computeAttachmentTotalMb(composeRoot) || 0;
    const attachmentBytes = Math.round(totalMb * 1_000_000);

    return {
      activityType: ACTIVITY_TYPE.EMAIL,
      timestamp: new Date().toISOString(),
      provider: PLATFORM.OUTLOOK,
      subject,
      recipients: normalizeRecipientList(recipients),
      bodyPreview,
      attachmentCount,
      attachmentBytes,
      attachment_bytes: attachmentBytes,
      direction: 'outbound',
      sender: accountEmail,
      user_email: accountEmail,
      metadata: {
        source: 'outlook_web',
        location: window.location.href,
        account_email: accountEmail,
        direction: 'outbound',
      },
    };
  }

  function normalizeRecipientList(rawValue) {
    if (!rawValue) return [];

    return rawValue
      .split(/[,;\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
})();
