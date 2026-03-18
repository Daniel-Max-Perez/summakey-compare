// Import Supabase bundle and config for service worker context
importScripts('supabase-bundle.js', 'supabase.js');

// Default prompt for product comparisons (v2)
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

// Create a unique installation ID on first installation and open get-started page
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get('installationId', (localData) => {
      if (!localData.installationId) {
        // Migration: Check if an old sync userId exists
        chrome.storage.sync.get('userId', (syncData) => {
          const newId = syncData.userId || crypto.randomUUID();
          chrome.storage.local.set({ installationId: newId });
        });
      }
    });

    // Open the get-started page on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    // Initialize the empty scraped products list (use local storage for large data)
    chrome.storage.local.set({ scrapedProducts: [] });
  } else if (details.reason === 'update') {
     // Migration for existing users on update
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

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const LOG_ID = Math.random().toString(36).substring(7);
  console.log(`SummaKey Compare [${LOG_ID}]: Received action "${request.action}"`);

  if (request.action === 'scrapeCurrentPage' || request.action === 'scrape') {
    scrapeAndStore(LOG_ID)
      .then((res) => {
        console.log(`SummaKey Compare [${LOG_ID}]: Scrape successful, sending response.`);
        sendResponse(res || { status: 'scraped' });
      })
      .catch((error) => {
        console.error(`SummaKey Compare [${LOG_ID}]: Scrape failed:`, error);
        sendResponse({ status: 'error', message: error.message || 'Unknown error during scraping' });
      });
    return true; // Keep channel open
  } else if (request.action === 'compareProducts') {
    compareProducts().then(() => sendResponse({ status: 'comparing' })).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  } else if (request.action === 'clearList') {
    clearProductList().then(() => sendResponse({ status: 'cleared' })).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  } else if (request.action === 'clearLastProduct') {
    clearLastProduct().then(() => sendResponse({ status: 'cleared_last' })).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  } else if (request.action === 'getAuthState') {
    // Return current auth + purchase state to popup/options
    (async () => {
      try {
        const email = await getAuthenticatedEmail();
        const isPro = email ? await checkPurchaseStatus(email) : false;
        sendResponse({ email, isPro });
      } catch (err) {
        console.error(`SummaKey Compare [${LOG_ID}]: Error in getAuthState:`, err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'validateSession') {
    validateSession().then(isValid => sendResponse({ isValid })).catch(err => sendResponse({ isValid: false, error: err.message }));
    return true;
  } else if (request.action === 'forceLogout') {
    forceLogout().then(() => sendResponse({ status: 'logged_out' })).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  }
  
  // Default fallback if no action matched
  console.warn(`SummaKey Compare [${LOG_ID}]: Unhandled action "${request.action}"`);
  return false; 
});

// Listener for hotkey command
chrome.commands.onCommand.addListener((command) => {
  if (command === "scrape_current_page") {
    scrapeAndStore();
  } else if (command === "compare_products") {
    compareProducts();
  }
});

// Scrape current page and add to list
async function scrapeAndStore(logId = 'direct') {
  console.log(`SummaKey Compare [${logId}]: scrapeAndStore() starting...`);
  
  try {
    // Check for user consent first
    const { hasConsented } = await chrome.storage.sync.get(['hasConsented']);
    if (!hasConsented) {
      console.warn(`SummaKey Compare [${logId}]: Consent not found.`);
      await showNativeNotification("Consent Required", "Please complete the setup and provide consent to use this extension.");
      chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
      return { status: 'error', message: 'Consent required' };
    }

    // --- Session validation & purchase-based gating ---
    console.log(`SummaKey Compare [${logId}]: Validating auth...`);
    
    // Auth block with 8s hard timeout
    const authPromise = (async () => {
      const email = await getAuthenticatedEmail();
      let isPro = false;
      if (email) {
        const sessionValid = await validateSession();
        if (!sessionValid) {
          console.warn(`SummaKey Compare [${logId}]: Session invalid.`);
          await forceLogout();
          await showNativeNotification("Session Expired", "Please sign in again.");
          chrome.runtime.openOptionsPage();
          return { error: 'Session expired' };
        }
        isPro = await checkPurchaseStatus(email);
      }
      return { email, isPro };
    })();

    const authTimeoutPromise = new Promise(r => setTimeout(() => r({ timeout: true }), 8000));
    const authResult = await Promise.race([authPromise, authTimeoutPromise]);

    if (authResult.timeout) {
      console.warn(`SummaKey Compare [${logId}]: Auth check timed out. Proceeding as free user.`);
    }

    if (authResult.error) return { status: 'error', message: authResult.error };

    const email = authResult.email || null;
    const isPro = authResult.isPro || false;

    const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
    const limit = isPro ? 10 : 2;
    const currentList = scrapedProducts || [];

    if (currentList.length >= limit) {
      console.warn(`SummaKey Compare [${logId}]: List full (${currentList.length}/${limit}).`);
      await showNativeNotification("List Full", `Free users can only compare ${limit} pages. Upgrade for 10.`);
      chrome.runtime.openOptionsPage();
      return { status: 'error', message: 'Limit reached' };
    }

    // Get the active tab via lastFocusedWindow
    console.log(`SummaKey Compare [${logId}]: Querying active tab...`);
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (!currentTab || !currentTab.id) {
      console.error(`SummaKey Compare [${logId}]: No active tab found.`);
      await showNativeNotification("Error", "Could not find the current tab.");
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
      console.warn(`SummaKey Compare [${logId}]: Restricted page: ${currentTab.url}`);
      await showNativeNotification("Error", "Cannot scrape this type of page.");
      return { status: 'error', message: 'Restricted page' };
    }

    console.log(`SummaKey Compare [${logId}]: Injecting script into tab ${currentTab.id}...`);
    let pageContent = '';
    
    // Add 15s timeout for script execution (Amazon can be heavy)
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        try {
          const startTime = Date.now();
          const timeout = 5000;
          const ELEMENT_NODE = 1;
          const TEXT_NODE = 3;
          let content = '';
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc && metaDesc.content) content += `[Page Description] ${metaDesc.content}\n\n`;
          if (document.title) content += `[Page Title] ${document.title}\n\n`;
          content += `[Page URL] ${window.location.href}\n\n`;
          const maxTextLength = 40 * 1024;
          const walker = document.createTreeWalker(document.body, 5, {
            acceptNode: (node) => {
              if (Date.now() - startTime > timeout) return 2;
              if (node.nodeType === ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                if (['nav', 'footer', 'script', 'style', 'header', 'aside', 'svg', 'noscript', 'form', 'button'].includes(tag)) return 2;
                if (node.hasAttribute('aria-hidden') && node.getAttribute('aria-hidden') === 'true') return 2;
                if (tag === 'img' && node.alt) return 1;
              } else if (node.nodeType === TEXT_NODE && node.textContent.trim().length > 0) return 1;
              return 3;
            }
          });
          let texts = [];
          let node;
          let nodeCount = 0;
          let currentContentLength = content.length;
          
          while ((node = walker.nextNode()) && (Date.now() - startTime < timeout)) {
            if (nodeCount++ > 5000) break;
            if (currentContentLength >= maxTextLength) break;
            
            if (node.nodeType === TEXT_NODE) {
              const text = node.textContent.trim();
              texts.push(text);
              currentContentLength += text.length + 1; // +1 for the space that join will add
            } else if (node.tagName && node.tagName.toLowerCase() === 'img') {
              const text = `[Image: ${node.alt}]`;
              texts.push(text);
              currentContentLength += text.length + 1;
            }
          }
          content += texts.join(' ');
          return content;
        } catch (e) { return `ERROR: ${e.message}`; }
      }
    });

    const scriptTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Scraping timed out (page too heavy)')), 15000));
    
    try {
      const results = await Promise.race([scriptPromise, scriptTimeout]);
      if (!results || !results[0] || results[0].result === undefined) {
        throw new Error('No content returned from tab');
      }
      pageContent = results[0].result;
    } catch (e) {
      console.error(`SummaKey Compare [${logId}]: Scrape fail:`, e);
      await showNativeNotification("Scrape Failed", e.message);
      return { status: 'error', message: e.message };
    }
    
    if (!pageContent || pageContent.trim().length === 0 || pageContent.startsWith('ERROR:')) {
      const errMsg = pageContent || 'No details detected on this page.';
      return { status: 'error', message: errMsg };
    }

    // --- Storage ---
    console.log(`SummaKey Compare [${logId}]: Saving content...`);
    const maxContentSize = 100 * 1024;
    const trimmedContent = pageContent.length > maxContentSize
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

    await showNativeNotification("Page Added!", `Page ${updatedList.length} added.`);
    logGA4Event('page_scraped', { count: updatedList.length });
    return { status: 'scraped', count: updatedList.length };

  } catch (e) {
    console.error(`SummaKey Compare [${logId}]: Error in scrapeAndStore:`, e);
    await showNativeNotification("Scrape Failed", e.message);
    logGA4Event('scrape_error', { error: e.message });
    return { status: 'error', message: e.message };
  }
}

// Compare all scraped products
async function compareProducts() {
  // Check for user consent first (Chrome Web Store compliance)
  const { hasConsented } = await chrome.storage.sync.get(['hasConsented']);
  if (!hasConsented) {
    await showNativeNotification("Consent Required", "Please complete the setup and provide consent to use this extension.");
    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    return;
  }

  // --- Session validation & purchase-based gating ---
  const email = await getAuthenticatedEmail();
  let isPro = false;
  if (email) {
    const sessionValid = await validateSession();
    if (!sessionValid) {
      await forceLogout();
      await showNativeNotification("Session Expired", "You've been signed in on another device. Please sign in again.");
      chrome.runtime.openOptionsPage();
      return;
    }
    isPro = await checkPurchaseStatus(email);
  }

  const { proPrompt } = await chrome.storage.sync.get(['proPrompt']);
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);

  const currentList = scrapedProducts || [];

  if (currentList.length === 0) {
    await showNativeNotification("List Empty", "Please scrape some pages first.");
    return;
  }

  let finalPrompt = "";
  // Since we changed to an object-based list, we need to extract the content for joining
  const allContent = currentList.map(p => {
    const titleText = p.title ? `Page: ${p.title}\n` : '';
    const urlText = p.url ? `URL: ${p.url}\n` : '';
    const textContent = typeof p === 'string' ? p : p.content;
    return `${titleText}${urlText}${textContent}`;
  }).join('\n\n--- NEXT ITEM TO COMPARE ---\n\n');

  if (isPro && proPrompt) {
    finalPrompt = proPrompt.replace('{{content}}', allContent);
  } else {
    finalPrompt = DEFAULT_COMPARE_PROMPT_V2.replace('{{content}}', allContent);
  }

  // --- THIS IS THE FIX ---

  // Get the destination URL that the user saved in options
  const { destinationUrl } = await chrome.storage.sync.get('destinationUrl');

  // If it's not set, default to Gemini. Otherwise, use the saved one.
  const destinationURL = destinationUrl || 'https://gemini.google.com/app';

  // --- END OF FIX --- 

  // Show notification first
  await showNativeNotification("Comparing Pages", `Comparing ${currentList.length} pages...`);
  logGA4Event('compare_initiated', { count: currentList.length });

  // Add delay to allow notification to appear before tab switches
  setTimeout(async () => {
    const llmTab = await chrome.tabs.create({ url: destinationURL, active: true });

    // Wait for page to be interactive, not just complete
    let attempts = 0;
    const maxWaitAttempts = 20; // 10 seconds total (20 * 500ms)

    const waitForPage = setInterval(async () => {
      attempts++;
      try {
        const tab = await chrome.tabs.get(llmTab.id);
        if (tab.status === 'complete') {
          clearInterval(waitForPage);

          // Wait additional time for React/SPA to initialize
          setTimeout(async () => {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: llmTab.id },
                func: pasteAndSubmitUrl,
                args: [finalPrompt],
              });
              console.log('SummaKey Compare: Script injected successfully');
            } catch (error) {
              console.error('SummaKey Compare: Error injecting script:', error);
              // Try alternative injection method
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: llmTab.id },
                  func: pasteAndSubmitUrl,
                  args: [finalPrompt],
                });
                console.log('SummaKey Compare: Alternative injection method succeeded');
              } catch (error2) {
                console.error('SummaKey Compare: Alternative injection also failed:', error2);
              }
            }
          }, 2000); // 2 second delay for React apps
        }
      } catch (error) {
        console.error('SummaKey Shopper: Error checking tab status:', error);
      }

      if (attempts >= maxWaitAttempts) {
        clearInterval(waitForPage);
        console.error('SummaKey Shopper: Page did not load in time');
      }
    }, 500); // Check every 500ms

    // Clear the list after comparing
    await clearProductList();
  }, 200); // 200ms delay to allow notification banner to appear
}

// Clear the product list
async function clearProductList() {
  await chrome.storage.local.set({ scrapedProducts: [] });
  await chrome.action.setBadgeText({ text: '' });
  await showNativeNotification("List Cleared", "Your page comparison list is now empty.");
}

// Clear the last product from the list
async function clearLastProduct() {
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
  if (!scrapedProducts || scrapedProducts.length === 0) {
    await showNativeNotification("List Empty", "There are no pages to remove.");
    return;
  }

  const removedProduct = scrapedProducts.pop(); // Remove the last item
  await chrome.storage.local.set({ scrapedProducts: scrapedProducts });

  // Update badge
  const badgeText = scrapedProducts.length > 0 ? scrapedProducts.length.toString() : '';
  await chrome.action.setBadgeText({ text: badgeText });

  // Try to get a title (won't be perfect, but better than nothing)
  const title = removedProduct.substring(0, 40).split('\n')[0];
  await showNativeNotification("Page Removed", `Removed: "${title}..."`);
}

// Show native notification
async function showNativeNotification(title, message) {
  const notificationId = 'summakey-compare-notification';

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title || 'SummaKey Compare',
      message: message || '',
      priority: 2,
      silent: false
    });

    setTimeout(() => {
      chrome.notifications.clear(notificationId, (wasCleared) => {
        if (chrome.runtime.lastError) {
          console.warn('SummaKey Compare: Error clearing notification:', chrome.runtime.lastError);
        }
      });
    }, 2500);
  } catch (error) {
    console.error('SummaKey Compare: Error creating notification:', error);
  }
}

// This function will be injected into the LLM page
const pasteAndSubmitUrl = function (textToPaste) {
  console.log('SummaKey Compare: Attempting to paste text into chatbox...');
  console.log('SummaKey Compare: Text length:', textToPaste.length);

  // Comprehensive ChatGPT selectors - try multiple strategies
  const SELECTORS = [
    // Modern ChatGPT (2024) - textarea with id
    'textarea#prompt-textarea',
    'textarea[id^="prompt-textarea"]',
    'textarea[id*="prompt"]',
    '#prompt-textarea',

    // Contenteditable divs (ChatGPT's current approach)
    'div[contenteditable="true"][data-placeholder*="Message"]',
    'div[contenteditable="true"][data-placeholder*="message"]',
    'div[contenteditable="true"][placeholder*="Message"]',
    'div[contenteditable="true"][aria-label*="Message"]',
    'div[contenteditable="true"][aria-label*="message"]',
    'div[contenteditable="true"][aria-label*="Write"]',
    'div[contenteditable="true"][aria-label*="Enter"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',

    // ID-based fallbacks
    '#prompt-textarea',
    '#prompt-input',
    '#chat-input',
    '#message-input',

    // Textarea fallbacks
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="Ask"]',
    'textarea[aria-label*="Message"]',
    'textarea[aria-label*="message"]',
    'textarea[aria-label*="Ask"]',
    'textarea',

    // Custom tags or role-based
    'rich-textarea',
    '[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]',
  ];

  // Function to find chatbox using multiple strategies
  function findChatbox() {
    // Strategy 1: Try each selector individually
    for (const selector of SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        // Verify it's actually visible and interactive
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        if (rect.width > 0 && rect.height > 0 &&
          styles.display !== 'none' &&
          styles.visibility !== 'hidden' &&
          !element.disabled) {
          console.log('SummaKey Compare: Found chatbox with selector:', selector);
          return element;
        }
      }
    }

    // Strategy 2: Find by proximity to submit button
    const submitButtons = document.querySelectorAll('button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]');
    for (const button of submitButtons) {
      const container = button.closest('form') || button.parentElement?.parentElement;
      if (container) {
        const textarea = container.querySelector('textarea');
        const contenteditable = container.querySelector('div[contenteditable="true"]');
        const candidate = textarea || contenteditable;
        if (candidate) {
          console.log('SummaKey Compare: Found chatbox by proximity to submit button');
          return candidate;
        }
      }
    }

    // Strategy 3: Find the largest contenteditable div (likely the main input)
    const contenteditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
    if (contenteditables.length > 0) {
      const largest = contenteditables.reduce((prev, current) => {
        const prevRect = prev.getBoundingClientRect();
        const currentRect = current.getBoundingClientRect();
        return (currentRect.width * currentRect.height) > (prevRect.width * prevRect.height) ? current : prev;
      });
      const rect = largest.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) { // Reasonable size check
        console.log('SummaKey Compare: Found chatbox by size (largest contenteditable)');
        return largest;
      }
    }

    return null;
  }

  const SUBMIT_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[data-testid*="send"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="Submit"]',
    'button[aria-label="Send message"]',
    'button[type="submit"]',
    'button.send-button',
    'button[class*="send"]',
    'button[class*="submit"]',
    '[data-testid="send-button"]',
    '[role="button"][aria-label*="Send"]',
    '[role="button"][class*="send"]',
  ];

  let attemptCount = 0;
  const maxAttempts = 150; // 30 seconds total

  const interval = setInterval(() => {
    attemptCount++;
    const chatbox = findChatbox();

    if (chatbox) {
      clearInterval(interval);
      console.log('SummaKey Compare: Chatbox found!', {
        tagName: chatbox.tagName,
        id: chatbox.id,
        className: chatbox.className,
        contentEditable: chatbox.contentEditable,
        type: chatbox.type
      });

      // Focus and ensure visibility
      chatbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      chatbox.focus();

      // Small delay to ensure focus is set
      setTimeout(() => {
        let textElement = chatbox;

        // Handle different input types
        if (chatbox.tagName.toLowerCase() === 'div' && chatbox.contentEditable === 'true') {
          console.log('SummaKey Compare: Using contenteditable div approach');

          // For contenteditable, we need to be more careful
          // Clear existing content
          chatbox.innerHTML = '';

          // ChatGPT often uses a specific structure with <p> tags
          // Try to find or create the proper structure
          const existingP = chatbox.querySelector('p');
          if (existingP) {
            existingP.textContent = textToPaste;
            textElement = existingP;
          } else {
            // Create paragraph element
            const p = document.createElement('p');
            p.textContent = textToPaste;
            chatbox.appendChild(p);
            textElement = p;
          }

          // Also set on the div itself as backup
          chatbox.textContent = textToPaste;

        } else if (chatbox.tagName.toLowerCase() === 'textarea') {
          console.log('SummaKey Compare: Using textarea approach');
          chatbox.value = textToPaste;
          textElement = chatbox;
        } else {
          console.log('SummaKey Compare: Using fallback approach');
          if ('value' in chatbox) {
            chatbox.value = textToPaste;
          } else {
            chatbox.textContent = textToPaste;
            chatbox.innerText = textToPaste;
          }
        }

        console.log('SummaKey Compare: Text set, now triggering events...');

        // Remove placeholder styling
        chatbox.classList.remove('ql-blank');
        if (chatbox.parentElement) {
          chatbox.parentElement.classList.remove('empty');
        }

        // Trigger comprehensive events for React
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: textToPaste,
          composed: true
        });
        textElement.dispatchEvent(inputEvent);
        chatbox.dispatchEvent(inputEvent);

        // Trigger additional events
        ['beforeinput', 'input', 'change', 'keydown', 'keyup', 'paste'].forEach(eventType => {
          const event = new Event(eventType, { bubbles: true, cancelable: true, composed: true });
          textElement.dispatchEvent(event);
          chatbox.dispatchEvent(event);
        });

        // Set data attribute for React state tracking
        chatbox.dataset.summakeyContent = 'true';

        // Force focus and blur to trigger React state
        chatbox.blur();
        setTimeout(() => {
          chatbox.focus();

          // Wait for React to update, then submit
          setTimeout(() => {
            // Find submit button using multiple strategies
            let submitButton = null;

            // Try each selector
            for (const selector of SUBMIT_BUTTON_SELECTORS) {
              submitButton = document.querySelector(selector);
              if (submitButton && !submitButton.disabled) break;
            }

            // Try finding button in parent containers
            if (!submitButton || submitButton.disabled) {
              const containers = [
                chatbox.closest('form'),
                chatbox.closest('[role="form"]'),
                chatbox.parentElement?.parentElement,
                chatbox.closest('div[class*="composer"]'),
                chatbox.closest('div[class*="input"]'),
                chatbox.closest('div[class*="send"]')
              ];
              for (const container of containers) {
                if (container) {
                  for (const selector of SUBMIT_BUTTON_SELECTORS) {
                    submitButton = container.querySelector(selector);
                    if (submitButton && !submitButton.disabled) break;
                  }
                  if (submitButton && !submitButton.disabled) break;
                }
              }
            }

            if (submitButton && !submitButton.disabled && !submitButton.hasAttribute('disabled')) {
              console.log('SummaKey Compare: Clicking submit button', submitButton);
              submitButton.click();
            } else {
              console.log('SummaKey Compare: Submit button not found or disabled, trying Enter key');
              chatbox.focus();

              // Simulate Enter key press with multiple event types
              const enterDown = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: false,
                composed: true
              });
              const enterUp = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: false,
                composed: true
              });
              chatbox.dispatchEvent(enterDown);
              setTimeout(() => chatbox.dispatchEvent(enterUp), 10);
            }
          }, 800); // Increased delay for React state updates
        }, 100);
      }, 100);
    } else if (attemptCount >= maxAttempts) {
      clearInterval(interval);
      console.error('SummaKey Compare: Chatbox not found after', maxAttempts * 200, 'ms');
      console.error('=== DEBUGGING INFO ===');
      console.error('Page URL:', window.location.href);
      console.error('Page title:', document.title);
      
      const textareas = Array.from(document.querySelectorAll('textarea'));
      console.error('Available textareas (' + textareas.length + '):', textareas.map(el => ({
        id: el.id,
        className: el.className,
        placeholder: el.placeholder,
        ariaLabel: el.getAttribute('aria-label'),
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        disabled: el.disabled
      })));
      
      const contenteditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
      console.error('Available contenteditable divs (' + contenteditables.length + '):', contenteditables.map(el => ({
        id: el.id,
        className: el.className,
        'data-placeholder': el.dataset.placeholder,
        role: el.role,
        ariaLabel: el.getAttribute('aria-label'),
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        innerHTML: el.innerHTML.substring(0, 100)
      })));
      
      const buttons = Array.from(document.querySelectorAll('button'));
      const sendButtons = buttons.filter(b => 
        b.getAttribute('data-testid')?.includes('send') ||
        b.getAttribute('aria-label')?.toLowerCase().includes('send')
      );
      console.error('Available send buttons:', sendButtons.map(el => ({
        dataTestId: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        disabled: el.disabled,
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      })));
      
      console.error('=== END DEBUGGING INFO ===');
    }
  }, 200);
};
