// Default prompt for product comparisons (v2)
const DEFAULT_SHOPPER_PROMPT_V2 = `You are an expert product analyst and data-driven shopping assistant. Your sole mission is to help me make the best, fastest, and most informed buying decision possible, based only on the raw text data I provide. The raw text for each item is separated by --- NEXT ITEM TO COMPARE ---.



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

* The first column must be the **Product Name**.

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

* For each missing point, state the risk it introduces (e..g., "Missing review sentiment for Product A means its real-world quality is unknown").

---

Here is the data:

{{content}}`;

// Create a unique user ID on first installation and open get-started page
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.get('userId', (data) => {
      if (!data.userId) {
        chrome.storage.sync.set({ userId: crypto.randomUUID() });
      }
    });
    // Open the get-started page on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    // Initialize the empty scraped products list (use local storage for large data)
    chrome.storage.local.set({ scrapedProducts: [] });
  }
});

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeCurrentPage' || request.action === 'scrape') {
    scrapeAndStore().then(() => sendResponse({ status: 'scraped' })).catch((error) => {
      sendResponse({ status: 'error', message: error.message });
    });
  } else if (request.action === 'compareProducts') {
    compareProducts().then(() => sendResponse({ status: 'comparing' }));
  } else if (request.action === 'clearList') {
    clearProductList().then(() => sendResponse({ status: 'cleared' }));
  } else if (request.action === 'clearLastProduct') {
    clearLastProduct().then(() => sendResponse({ status: 'cleared_last' }));
  }
  return true; // Keep the message channel open for async response
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
async function scrapeAndStore() {
  // Check for user consent first (Chrome Web Store compliance)
  const { hasConsented } = await chrome.storage.sync.get(['hasConsented']);
  if (!hasConsented) {
    await showNativeNotification("Consent Required", "Please complete the setup and provide consent to use this extension.");
    chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
    return;
  }

  // Get pro status from sync, scrapedProducts from local (large data)
  const { pro } = await chrome.storage.sync.get(['pro']);
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
  const limit = pro ? 10 : 2;

  // Initialize if doesn't exist
  const currentList = scrapedProducts || [];

  // Check Pro limits
  if (currentList.length >= limit) {
    await showNativeNotification("List Full", `Free users can only compare ${limit} products. Upgrade for 10.`);
    chrome.runtime.openOptionsPage(); // Open options to upsell
    return;
  }

  // Scrape the page - get the active tab
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!currentTab || !currentTab.id) {
    await showNativeNotification("Error", "Could not find the current tab. Please make sure you have a page open.");
    return;
  }

  // Skip chrome:// and extension pages
  if (currentTab.url && (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://') || currentTab.url.startsWith('edge://'))) {
    await showNativeNotification("Error", "Cannot scrape Chrome internal pages. Please navigate to a regular webpage.");
    return;
  }

  // Check if page is fully loaded
  if (currentTab.status !== 'complete') {
    await showNativeNotification("Page Loading", "Please wait for the page to finish loading, then try again.");
    return;
  }

  let pageContent = "";
  try {
    // Use inline function to extract content
    // Since we already check if page is complete, we can extract directly
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        try {
          let content = '';

          // Add basic metadata first
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) content += `[Page Description] ${metaDesc.content}\n\n`;
          if (document.title) content += `[Page Title] ${document.title}\n\n`;
          content += `[Page URL] ${window.location.href}\n\n`;

          const maxTextLength = 50 * 1024; // 50KB limit per product

          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
              acceptNode: function (node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const tag = node.tagName.toLowerCase();
                  if (['nav', 'footer', 'script', 'style', 'svg', 'noscript', 'header', 'aside'].includes(tag)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  const style = window.getComputedStyle(node);
                  if (style.display === 'none' || style.visibility === 'hidden') {
                    return NodeFilter.FILTER_REJECT;
                  }
                  if (tag === 'img' && node.alt) {
                    return NodeFilter.FILTER_ACCEPT;
                  }
                } else if (node.nodeType === Node.TEXT_NODE) {
                  if (node.textContent.trim().length > 0) {
                    return NodeFilter.FILTER_ACCEPT;
                  }
                }
                return NodeFilter.FILTER_SKIP;
              }
            },
            false
          );

          let texts = [];
          let node;
          let currentLength = content.length;

          while (node = walker.nextNode()) {
            if (currentLength >= maxTextLength) break;

            let text = '';
            if (node.nodeType === Node.TEXT_NODE) {
              text = node.textContent.trim();
            } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'img') {
              text = `[Image description: ${node.alt}]`;
            }

            if (text) {
              texts.push(text);
              currentLength += text.length;
            }
          }

          content += texts.join(' ');

          if (!content || content.trim().length < 50) {
            content = `[Page Content] Unable to extract sufficient text content. URL: ${window.location.href}`;
          }

          return content;
        } catch (error) {
          return `ERROR: Could not retrieve page text: ${error.message}. URL: ${window.location.href}`;
        }
      },
    });

    pageContent = results[0].result;

    // Validate that we got content
    if (!pageContent || pageContent.trim().length === 0) {
      throw new Error("No content extracted from page");
    }
  } catch (e) {
    console.error("Scraping error:", e);
    await showNativeNotification("Scrape Failed", `Could not read this page: ${e.message}`);
    return;
  }

  // Add to list, save, and update badge
  // Limit content size to prevent storage issues (max 100KB per item for safety)
  const maxContentSize = 100 * 1024; // 100 KB
  const trimmedContent = pageContent.length > maxContentSize
    ? pageContent.substring(0, maxContentSize) + '\n\n[Content truncated due to size]'
    : pageContent;

  const updatedList = [...currentList, trimmedContent];
  await chrome.storage.local.set({ scrapedProducts: updatedList });

  // Update badge on all tabs
  await chrome.action.setBadgeText({ text: updatedList.length.toString() });
  await chrome.action.setBadgeBackgroundColor({ color: '#4734ff' });

  await showNativeNotification("Product Added!", `Product ${updatedList.length} added to comparison list.`);
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

  // Get pro and proPrompt from sync, scrapedProducts from local (large data)
  const { pro, proPrompt } = await chrome.storage.sync.get(['pro', 'proPrompt']);
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);

  const currentList = scrapedProducts || [];

  if (currentList.length === 0) {
    await showNativeNotification("List Empty", "Please scrape some products first.");
    return;
  }

  let finalPrompt = "";
  const allContent = currentList.join('\n\n--- NEXT ITEM TO COMPARE ---\n\n');

  if (pro && proPrompt) {
    finalPrompt = proPrompt.replace('{{content}}', allContent);
  } else {
    finalPrompt = DEFAULT_SHOPPER_PROMPT_V2.replace('{{content}}', allContent);
  }

  // --- THIS IS THE FIX ---

  // Get the destination URL that the user saved in options
  const { destinationUrl } = await chrome.storage.sync.get('destinationUrl');

  // If it's not set, default to Gemini. Otherwise, use the saved one.
  const destinationURL = destinationUrl || 'https://gemini.google.com/app';

  // --- END OF FIX --- 

  // Show notification first
  await showNativeNotification("Comparing Products", `Comparing ${currentList.length} products...`);

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
              console.log('SummaKey Shopper: Script injected successfully');
            } catch (error) {
              console.error('SummaKey Shopper: Error injecting script:', error);
              // Try alternative injection method
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: llmTab.id },
                  function: pasteAndSubmitUrl,
                  args: [finalPrompt],
                });
                console.log('SummaKey Shopper: Alternative injection method succeeded');
              } catch (error2) {
                console.error('SummaKey Shopper: Alternative injection also failed:', error2);
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
  await showNativeNotification("List Cleared", "Your product comparison list is now empty.");
}

// Clear the last product from the list
async function clearLastProduct() {
  const { scrapedProducts } = await chrome.storage.local.get(['scrapedProducts']);
  if (!scrapedProducts || scrapedProducts.length === 0) {
    await showNativeNotification("List Empty", "There are no products to remove.");
    return;
  }

  const removedProduct = scrapedProducts.pop(); // Remove the last item
  await chrome.storage.local.set({ scrapedProducts: scrapedProducts });

  // Update badge
  const badgeText = scrapedProducts.length > 0 ? scrapedProducts.length.toString() : '';
  await chrome.action.setBadgeText({ text: badgeText });

  // Try to get a title (won't be perfect, but better than nothing)
  const title = removedProduct.substring(0, 40).split('\n')[0];
  await showNativeNotification("Product Removed", `Removed: "${title}..."`);
}

// Show native notification
async function showNativeNotification(title, message) {
  const notificationId = 'summakey-shopper-notification';

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title || 'SummaKey Shopper',
      message: message || '',
      priority: 2,
      silent: false
    });

    setTimeout(() => {
      chrome.notifications.clear(notificationId, (wasCleared) => {
        if (chrome.runtime.lastError) {
          console.warn('SummaKey Shopper: Error clearing notification:', chrome.runtime.lastError);
        }
      });
    }, 2500);
  } catch (error) {
    console.error('SummaKey Shopper: Error creating notification:', error);
  }
}

// This function will be injected into the LLM page
const pasteAndSubmitUrl = function (textToPaste) {
  console.log('SummaKey Shopper: Attempting to paste text into chatbox...');
  console.log('SummaKey Shopper: Text length:', textToPaste.length);

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
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',

    // Textarea fallbacks
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="message"]',
    'textarea[aria-label*="Message"]',
    'textarea[aria-label*="message"]',
    'textarea',

    // Generic fallbacks
    '[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]'
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
          console.log('SummaKey Shopper: Found chatbox with selector:', selector);
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
          console.log('SummaKey Shopper: Found chatbox by proximity to submit button');
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
        console.log('SummaKey Shopper: Found chatbox by size (largest contenteditable)');
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
    'button[aria-label="Send message"]',
    'button[type="submit"]',
    'button.send-button',
    '[data-testid="send-button"]',
    '[role="button"][aria-label*="Send"]'
  ];

  let attemptCount = 0;
  const maxAttempts = 150; // 30 seconds total

  const interval = setInterval(() => {
    attemptCount++;
    const chatbox = findChatbox();

    if (chatbox) {
      clearInterval(interval);
      console.log('SummaKey Shopper: Chatbox found!', {
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
          console.log('SummaKey Shopper: Using contenteditable div approach');

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
          console.log('SummaKey Shopper: Using textarea approach');
          chatbox.value = textToPaste;
          textElement = chatbox;
        } else {
          console.log('SummaKey Shopper: Using fallback approach');
          if ('value' in chatbox) {
            chatbox.value = textToPaste;
          } else {
            chatbox.textContent = textToPaste;
            chatbox.innerText = textToPaste;
          }
        }

        console.log('SummaKey Shopper: Text set, now triggering events...');

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
              console.log('SummaKey Shopper: Clicking submit button', submitButton);
              submitButton.click();
            } else {
              console.log('SummaKey Shopper: Submit button not found or disabled, trying Enter key');
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
      console.error('SummaKey Shopper: Chatbox not found after', maxAttempts * 200, 'ms');
    }
  }, 200);
};
