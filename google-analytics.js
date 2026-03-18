/**
 * Google Analytics 4 Measurement Protocol Tracking
 * 
 * Chrome Extension Manifest V3 doesn't allow external gtag.js.
 * This script sends events directly via fetch to the GA4 API.
 */

const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // REPLACE ME
const GA_API_SECRET = 'YOUR_SECRET';     // REPLACE ME

// Get or Create a Client ID for the user
async function getOrCreateClientId() {
  const result = await chrome.storage.local.get('ga_client_id');
  let clientId = result.ga_client_id;
  if (!clientId) {
    clientId = self.crypto.randomUUID ? self.crypto.randomUUID() : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    await chrome.storage.local.set({ ga_client_id: clientId });
  }
  return clientId;
}

// Global tracking function
async function trackEvent(name, params = {}) {
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
    trackEvent(message.name, message.params || {});
  }
});

// Initial tracking for start/install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    trackEvent('extension_install');
  } else if (details.reason === 'update') {
    trackEvent('extension_update', { previous_version: details.previousVersion });
  }
});
