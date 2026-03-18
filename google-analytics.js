/**
 * Google Analytics 4 Measurement Protocol Tracking
 * 
 * Chrome Extension Manifest V3 doesn't allow external gtag.js.
 * This script sends events directly via fetch to the GA4 API.
 */

const GA_MEASUREMENT_ID = 'G-PYPZ2GDE3D';
const GA_API_SECRET = 'F0FFI8wnQHeVCDW57Nn_7g';

// Get or Create a Client ID for the user
async function getOrCreateClientId() {
  const result = await chrome.storage.local.get('clientId');
  let clientId = result.clientId;
  if (!clientId) {
    // Check for legacy ID to migrate
    const legacy = await chrome.storage.local.get('ga_client_id');
    if (legacy.ga_client_id) {
      clientId = legacy.ga_client_id;
    } else {
      clientId = self.crypto.randomUUID ? self.crypto.randomUUID() : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    }
    await chrome.storage.local.set({ clientId });
  }
  return clientId;
}

// Global tracking function (Renamed to logGA4Event and gated for compliance)
async function logGA4Event(name, params = {}) {
  const { allowAnalytics } = await chrome.storage.local.get('allowAnalytics');
  if (allowAnalytics === false) return; // Silent exit if user opted out

  if (GA_MEASUREMENT_ID === 'G-XXXXXXXXXX') {
    console.warn('GA4: Please set a valid GA_MEASUREMENT_ID in google-analytics.js');
    return;
  }
  
  const clientId = await getOrCreateClientId();
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: [{
          name: name,
          params: {
            ...params,
            engagement_time_msec: '100',
            session_id: Date.now().toString(),
          },
        }],
      }),
    });
    
    if (!response.ok) {
      console.error('GA Tracking Error Status:', response.status);
    }
  } catch (err) {
    console.error('GA Tracking Fetch Error:', err);
  }
}

// Listen for messages from other parts of the extension (popup, content scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GA_TRACK_EVENT') {
    logGA4Event(message.name, message.params || {});
  }
});

// Initial tracking for start/install
chrome.runtime.onInstalled.addListener(async (details) => {
  // Set default compliance opt-in on install
  if (details.reason === 'install') {
    await chrome.storage.local.set({ allowAnalytics: true });
    logGA4Event('extension_install');
  } else if (details.reason === 'update') {
    logGA4Event('extension_update', { previous_version: details.previousVersion });
  }
});

