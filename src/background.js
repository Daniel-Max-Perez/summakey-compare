/**
 * SummaKey Compare — Background Service Worker
 */

import {
  getDetailedPageContent,
  showNotification,
  navigateAndInjectPrompt,
} from '@summakey/shared-utils';

const LOG_PREFIX = 'SummaKey Compare';
const NOTIFICATION_ID = 'summakey-compare-notification';

// ─────────────────────────────────────────────────────────────────────────────
// Default Prompt
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPARE_PROMPT_V2 = `You are an expert product analyst and data-driven shopping assistant. Your sole mission is to help me make the best, fastest, and most informed buying decision possible, based only on the raw text data I provide. The raw text for each item is separated by --- NEXT ITEM TO COMPARE ---.



My Priorities (Default):

1.  Value: Best price-to-performance ratio.

2.  Quality: Reliability, durability, and materials mentioned.

3.  Review Sentiment: Look for any user reviews or sentiment (e.g., "love this," "hated it," "disappointed").

4.  Health/Sustainability: Impact on well-being, ingredients, or ethical sourcing.



Your Task & Output Structure:

You must follow this 5-step structure precisely. Do not add any conversational text outside of this structure.



---

## 1. Final Recommendation (Start Here!)

Begin with your final verdict. Analyze the data against my 4 priorities and provide a clear, one-paragraph recommendation for each of these personas:



* Overall Top Choice: The product that provides the **best balance** of all my priorities (Value, Quality, Reviews, and Health).

* Best for the 'Value-Seeker': The clear winner for the best price-to-performance, even if quality is slightly lower.

* Best for the 'Cautious Buyer': The product that wins on **Quality and Positive Reviews**, even if it costs more.



## 2. Comparison Table

Create a comprehensive markdown table comparing all products.

* The first column must be the **Page Name**.

* Subsequent columns must be for **Price** and all other **Key Features** (e.g., Specs, Size, Ingredients).

* **Crucial Row 1:** Include a "Key Differentiator" row that explains the *key scientific or technological difference* (e.g., "Active Ingredient," "Battery Type," "Screen Technology").

* **Crucial Row 2:** Include a "Review Sentiment" row that summarizes any found review sentiment (e.g., "Positive," "Mixed," "Negative," or "Not Found").



## 3. Pros & Cons Analysis

Create a "Pros & Cons" bulleted list for each product. Each point must be concise and directly related to my stated priorities (Value, Quality, Review Sentiment, Health/Sustainability).



## 4. Key Differentiator Explained

Identify the "Key Differentiator" from the table and concisely explain the science, technology, or material difference (e.g., "You asked for health, so here is the difference between Fluoride, which prevents cavities, and Hydroxyapatite, which may remineralize enamel...").



## 5. Data & Review Gaps

Conclude by "attacking" the provided data.

* List all key data points (price, warranty, key specs, ingredient lists) that are **missing** for any product.

* Explicitly state if **no user review sentiment** was found in the text for a product.

* For each missing point, state the risk it introduces (e..g., "Missing review sentiment for Page A means its real-world quality is unknown").

---

Here is the data:

{{content}}`;

// ─────────────────────────────────────────────────────────────────────────────
// Installation
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get('installationId', (localData) => {
      if (!localData.installationId) {
        chrome.storage.sync.get('userId', (syncData) => {
          const newId = syncData.userId || crypto.randomUUID();
          chrome.storage.local.set({ installationId: newId });
        });
      }
    });

    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    chrome.storage.local.set({ scrapedProducts: [] });
  } else if (details.reason === 'update') {
    chrome.storage.local.get('installationId', (localData) => {
      if (!localData.installationId) {
        chrome.storage.sync.get('userId', (syncData) => {
          if (syncData.userId) {
            chrome.storage.local.set({ installationId: syncData.userId });
          }
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Message Listener (from popup)
// ─────────────────────────────────────────────────────────────────────────────

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const LOG_ID = Math.random().toString(36).substring(7);
  console.log(`${LOG_PREFIX} [${LOG_ID}]: Received message:`, request.action);

  if (request.action === 'scrapeCurrentPage' || request.action === 'scrape') {
    scrapeAndStore(LOG_ID, request.tab)
      .then((result) => {
        console.log(`${LOG_PREFIX} [${LOG_ID}]: Scrape successful.`);
        sendResponse(result || { status: 'scraped' });
      })
      .catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Scrape error:`, error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // async
  }

  if (request.action === 'compareProducts') {
    compareProducts(request.presetIndex)
      .then(() => sendResponse({ status: 'comparing' }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Compare error:`, error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // async
  }

  if (request.action === 'clearList') {
    clearProductList()
      .then(() => sendResponse({ status: 'cleared' }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Clear error:`, error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // async
  }

  if (request.action === 'clearLastProduct') {
    clearLastProduct()
      .then(() => sendResponse({ status: 'cleared_last' }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Clear last error:`, error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // async
  }

  if (request.action === 'getAuthState') {
    (async () => {
      try {
        const email = await getAuthenticatedEmail();
        const isPro = email ? await checkPurchaseStatus(email) : false;
        sendResponse({ email, isPro });
      } catch (error) {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Auth state error:`, error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // async
  }

  if (request.action === 'validateSession') {
    validateSession()
      .then((isValid) => sendResponse({ isValid }))
      .catch((error) => sendResponse({ isValid: false, error: error.message }));
    return true; // async
  }

  if (request.action === 'forceLogout') {
    forceLogout()
      .then(() => sendResponse({ status: 'logged_out' }))
      .catch((error) => sendResponse({ status: 'error', message: error.message }));
    return true; // async
  }

  if (request.action === 'injectionFailed') {
    showNotification({
      title: 'Injection Failed',
      message: 'Could not submit prompt. The AI site may have updated its interface or you hit a limit.',
      notificationId: 'injection-failed'
    });
    sendResponse({ status: 'notified' });
    return true;
  }

  // Not handled
  return false;
});

// ─────────────────────────────────────────────────────────────────────────────
// Remote Selectors Configuration
// ─────────────────────────────────────────────────────────────────────────────

let cachedSelectors = null;
let lastSelectorFetch = 0;

async function getRemoteSelectors() {
  const now = Date.now();
  if (cachedSelectors && now - lastSelectorFetch < 12 * 60 * 60 * 1000) {
    return cachedSelectors;
  }
  try {
    // Vercel deployment URL (replace if different)
    const res = await fetch('https://summakey-backend.vercel.app/api/selectors');
    if (res.ok) {
      cachedSelectors = await res.json();
      lastSelectorFetch = now;
      return cachedSelectors;
    }
  } catch (e) {
    console.warn('Could not fetch remote selectors, using fallbacks');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotkey Commands
// ─────────────────────────────────────────────────────────────────────────────

let lastHotkeyTime = 0;

chrome.commands.onCommand.addListener((command) => {
  const now = Date.now();
  if (now - lastHotkeyTime < 500) return; // 500ms debounce
  lastHotkeyTime = now;

  if (command === 'scrape_current_page') {
    scrapeAndStore('hotkey');
  } else if (command === 'compare_products') {
    compareProducts(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scrape & Store
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeAndStore(logId = 'direct', explicitTab = null) {
  console.log(`${LOG_PREFIX} [${logId}]: scrapeAndStore() starting...`);
  
  try {
    // Check for user consent first
    const { hasConsented } = await chrome.storage.sync.get(['hasConsented']);
    if (!hasConsented) {
      console.warn(`${LOG_PREFIX} [${logId}]: Consent not found.`);
      await showNotification({
        title: 'Consent Required',
        message: 'Please complete the setup and provide consent to use this extension.',
        notificationId: NOTIFICATION_ID,
      });
      chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
      return { status: 'error', message: 'Consent required' };
    }

    // --- Session validation & purchase-based gating ---
    console.log(`${LOG_PREFIX} [${logId}]: Checking cached auth status...`);
    
    // We rely on the cached 'pro' status set by the UI or other operations
    // This allows instantaneous scraping without network timeouts
    const { pro } = await chrome.storage.sync.get(['pro']);
    const isPro = !!pro;

    const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
    const limit = isPro ? 10 : 2;
    const currentList = scrapedProducts || [];

    if (currentList.length >= limit) {
      console.warn(`${LOG_PREFIX} [${logId}]: List full (${currentList.length}/${limit}).`);
      await showNotification({
        title: 'List Full',
        message: `Free users can only compare ${limit} pages. Upgrade for 10.`,
        notificationId: NOTIFICATION_ID,
      });
      chrome.runtime.openOptionsPage();
      return { status: 'error', message: 'List full' };
    }

    // Get the active tab via the provided explicitTab, or fallback to querying
    console.log(`${LOG_PREFIX} [${logId}]: Identifying active tab...`);
    let currentTab = explicitTab;
    if (!currentTab) {
      const tabs = await chrome.tabs.query({ active: true });
      currentTab = tabs.find(t => !t.url.startsWith('chrome-extension://')) || tabs[0];
    }

    if (!currentTab || !currentTab.id) {
      console.error(`${LOG_PREFIX} [${logId}]: No active tab found.`);
      await showNotification({
        title: 'Error',
        message: 'Could not find the current tab.',
        notificationId: NOTIFICATION_ID,
      });
      return { status: 'error', message: 'No active tab' };
    }

    // Skip restricted pages
    if (
      currentTab.url &&
      (currentTab.url.startsWith('chrome://') ||
        currentTab.url.startsWith('chrome-extension://') ||
        currentTab.url.startsWith('edge://') ||
        currentTab.url.startsWith('about:'))
    ) {
      console.warn(`${LOG_PREFIX} [${logId}]: Restricted page: ${currentTab.url}`);
      await showNotification({
        title: 'Error',
        message: 'Cannot scrape this type of page.',
        notificationId: NOTIFICATION_ID,
      });
      return { status: 'error', message: 'Restricted page' };
    }

    // Deduplication check (Task 6.B)
    const isDuplicate = currentList.some(item => item.url === currentTab.url);
    if (isDuplicate) {
      console.warn(`${LOG_PREFIX} [${logId}]: Page already scraped: ${currentTab.url}`);
      await showNotification({
        title: 'Already Added',
        message: 'This page is already in your comparison list.',
        notificationId: NOTIFICATION_ID,
      });
      return { status: 'error', message: 'Page already added' };
    }

    console.log(`${LOG_PREFIX} [${logId}]: Injecting script into tab ${currentTab.id}...`);
    let pageContent = '';
    
    // Add 15s timeout for script execution (Amazon can be heavy)
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: getDetailedPageContent,
      injectImmediately: true,
    });

    const scriptTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Page too large or slow to scrape. Try refreshing.')), 15000));
    
    try {
      const results = await Promise.race([scriptPromise, scriptTimeout]);
      if (!results || !results[0] || results[0].result === undefined) {
        throw new Error('No content returned from tab');
      }
      pageContent = results[0].result;
    } catch (e) {
      console.error(`${LOG_PREFIX} [${logId}]: Scrape fail:`, e);
      await showNotification({
        title: 'Scrape Failed',
        message: e.message,
        notificationId: NOTIFICATION_ID,
      });
      return { status: 'error', message: e.message };
    }

    if (!pageContent || pageContent.trim().length === 0 || pageContent.startsWith('ERROR:')) {
      const errMsg = pageContent || 'No details detected on this page.';
      return { status: 'error', message: errMsg };
    }

    // Limit content size (max 25KB per item) (Task 2.A)
    const maxContentSize = 25 * 1024;
    const trimmedContent =
      pageContent.length > maxContentSize
        ? pageContent.substring(0, maxContentSize) + '\n\n[Content truncated]'
        : pageContent;

    const newProduct = {
      title: currentTab.title || 'Untitled Page',
      url: currentTab.url,
      content: trimmedContent,
      timestamp: Date.now()
    };

    const updatedList = [...currentList, newProduct];
    await chrome.storage.local.set({ scrapedProducts: updatedList });

    await chrome.action.setBadgeText({ text: updatedList.length.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#4734ff' });

    await showNotification({
      title: 'Page Added!',
      message: `Page ${updatedList.length} added.`,
      notificationId: NOTIFICATION_ID,
    });

    return { status: 'scraped', count: updatedList.length };
  } catch (e) {
    console.error(`${LOG_PREFIX} [${logId}]: Unexpected error:`, e);
    return { status: 'error', message: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare Products
// ─────────────────────────────────────────────────────────────────────────────

async function compareProducts(presetIndex = 0) {
  const { hasConsented } = await chrome.storage.sync.get(['hasConsented']);
  if (!hasConsented) {
    await showNotification({
      title: 'Consent Required',
      message: 'Please complete the setup and provide consent to use this extension.',
      notificationId: NOTIFICATION_ID,
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    return;
  }

  // Session validation & purchase-based gating
  const email = await getAuthenticatedEmail();
  let isPro = false;
  if (email) {
    const sessionValid = await validateSession();
    if (!sessionValid) {
      await forceLogout();
      await showNotification({
        title: 'Session Expired',
        message: "You've been signed in on another device. Please click the extension icon to sign in.",
        notificationId: NOTIFICATION_ID,
      });
      return;
    }
    isPro = await checkPurchaseStatus(email);
  }

  // Enforce Pro gating on background side
  if (presetIndex > 0 && !isPro) {
    await showNotification({
      title: 'Pro Required',
      message: 'This preset requires SummaKey Compare Pro.',
      notificationId: NOTIFICATION_ID,
    });
    chrome.runtime.openOptionsPage();
    return;
  }

  const { presets } = await chrome.storage.sync.get(['presets']);
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
  const currentList = scrapedProducts || [];

  if (currentList.length === 0) {
    await showNotification({
      title: 'List Empty',
      message: 'Please scrape some pages first.',
      notificationId: NOTIFICATION_ID,
    });
    return;
  }

  let finalPrompt = '';
  // Support both old string format and new object format
  const allContent = currentList
    .map(p => {
      const titleText = p.title ? `Page: ${p.title}\n` : '';
      const urlText = p.url ? `URL: ${p.url}\n` : '';
      const textContent = typeof p === 'string' ? p : (p.content || '');
      return `${titleText}${urlText}${textContent}`;
    })
    .join('\n\n--- NEXT ITEM TO COMPARE ---\n\n');

  let activePreset = null;
  if (presets && presets[presetIndex]) {
    activePreset = presets[presetIndex];
  }

  const secureContent = `\n### USER DATA START ###\n${allContent}\n### USER DATA END ###\n`;

  const { pro: isProUser } = await chrome.storage.sync.get({ pro: false });
  let finalPromptContent = secureContent;
  if (!isProUser) {
    finalPromptContent += '\n\nAlways end your response with this exact text: "This workflow was sped up by Summakey"';
  }

  if (activePreset && activePreset.prompt) {
    finalPrompt = activePreset.prompt.replace('{{content}}', finalPromptContent);
  } else {
    finalPrompt = DEFAULT_COMPARE_PROMPT_V2.replace('{{content}}', finalPromptContent);
  }

  // Get destination URL
  const destinationURL = (activePreset && activePreset.url) ? activePreset.url : 'https://gemini.google.com/app';

  // Show notification
  await showNotification({
    title: 'Comparing Pages',
    message: `Comparing ${currentList.length} pages...`,
    notificationId: NOTIFICATION_ID,
  });

  // Navigate and inject
  const remoteConfig = await getRemoteSelectors();

  navigateAndInjectPrompt({
    destinationUrl: destinationURL,
    finalPrompt,
    logPrefix: LOG_PREFIX,
    notificationDelayMs: 200,
    remoteConfig,
  });

  // Clear the list after comparing
  await clearProductList();
}

// ─────────────────────────────────────────────────────────────────────────────
// List Management
// ─────────────────────────────────────────────────────────────────────────────

async function clearProductList() {
  await chrome.storage.local.set({ scrapedProducts: [] });
  await chrome.action.setBadgeText({ text: '' });
  await showNotification({
    title: 'List Cleared',
    message: 'Your page comparison list is now empty.',
    notificationId: NOTIFICATION_ID,
  });
}

async function clearLastProduct() {
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
  if (!scrapedProducts || scrapedProducts.length === 0) {
    await showNotification({
      title: 'List Empty',
      message: 'There are no pages to remove.',
      notificationId: NOTIFICATION_ID,
    });
    return;
  }

  const removedProduct = scrapedProducts.pop();
  await chrome.storage.local.set({ scrapedProducts: scrapedProducts });

  const badgeText = scrapedProducts.length > 0 ? scrapedProducts.length.toString() : '';
  await chrome.action.setBadgeText({ text: badgeText });

  let displayTitle = '';
  if (typeof removedProduct === 'string') {
    displayTitle = removedProduct.substring(0, 40).split('\n')[0];
  } else {
    displayTitle = removedProduct.title || 'Untitled Page';
  }

  await showNotification({
    title: 'Page Removed',
    message: `Removed: "${displayTitle.substring(0, 30)}..."`,
    notificationId: NOTIFICATION_ID,
  });
}
