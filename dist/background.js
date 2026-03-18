(function() {
  "use strict";
  const pasteAndSubmitToLLM = function(textToPaste, logPrefix = "SummaKey") {
    console.log(`${logPrefix}: Attempting to paste text into chatbox...`);
    console.log(`${logPrefix}: Text length:`, textToPaste.length);
    const SELECTORS = [
      // Modern ChatGPT (2024) — textarea with id
      "textarea#prompt-textarea",
      'textarea[id^="prompt-textarea"]',
      'textarea[id*="prompt"]',
      "#prompt-textarea",
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
      "#prompt-textarea",
      "#prompt-input",
      "#chat-input",
      "#message-input",
      // Textarea fallbacks
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Ask"]',
      'textarea[aria-label*="Message"]',
      'textarea[aria-label*="message"]',
      'textarea[aria-label*="Ask"]',
      "textarea",
      // Custom tags or role-based
      "rich-textarea",
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]'
    ];
    function findChatbox() {
      var _a;
      for (const selector of SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);
          if (rect.width > 0 && rect.height > 0 && styles.display !== "none" && styles.visibility !== "hidden" && !element.disabled) {
            console.log(`${logPrefix}: Found chatbox with selector:`, selector);
            return element;
          }
        }
      }
      const submitButtons = document.querySelectorAll(
        'button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]'
      );
      for (const button of submitButtons) {
        const container = button.closest("form") || ((_a = button.parentElement) == null ? void 0 : _a.parentElement);
        if (container) {
          const textarea = container.querySelector("textarea");
          const contenteditable = container.querySelector('div[contenteditable="true"]');
          const candidate = textarea || contenteditable;
          if (candidate) {
            console.log(`${logPrefix}: Found chatbox by proximity to submit button`);
            return candidate;
          }
        }
      }
      const contenteditables = Array.from(
        document.querySelectorAll('div[contenteditable="true"]')
      );
      if (contenteditables.length > 0) {
        const largest = contenteditables.reduce((prev, current) => {
          const prevRect = prev.getBoundingClientRect();
          const currentRect = current.getBoundingClientRect();
          return currentRect.width * currentRect.height > prevRect.width * prevRect.height ? current : prev;
        });
        const rect = largest.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) {
          console.log(`${logPrefix}: Found chatbox by size (largest contenteditable)`);
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
      "button.send-button",
      'button[class*="send"]',
      'button[class*="submit"]',
      '[data-testid="send-button"]',
      '[role="button"][aria-label*="Send"]',
      '[role="button"][class*="send"]'
    ];
    let attemptCount = 0;
    const maxAttempts = 150;
    const interval = setInterval(() => {
      attemptCount++;
      const chatbox = findChatbox();
      if (chatbox) {
        clearInterval(interval);
        console.log(`${logPrefix}: Chatbox found!`, {
          tagName: chatbox.tagName,
          id: chatbox.id,
          className: chatbox.className,
          contentEditable: chatbox.contentEditable,
          type: chatbox.type
        });
        chatbox.scrollIntoView({ behavior: "smooth", block: "center" });
        chatbox.focus();
        setTimeout(() => {
          let textElement = chatbox;
          if (chatbox.tagName.toLowerCase() === "div" && chatbox.contentEditable === "true") {
            console.log(`${logPrefix}: Using contenteditable div approach`);
            chatbox.innerHTML = "";
            const existingP = chatbox.querySelector("p");
            if (existingP) {
              existingP.textContent = textToPaste;
              textElement = existingP;
            } else {
              const p = document.createElement("p");
              p.textContent = textToPaste;
              chatbox.appendChild(p);
              textElement = p;
            }
            chatbox.textContent = textToPaste;
          } else if (chatbox.tagName.toLowerCase() === "textarea") {
            console.log(`${logPrefix}: Using textarea approach`);
            chatbox.value = textToPaste;
            textElement = chatbox;
          } else {
            console.log(`${logPrefix}: Using fallback approach`);
            if ("value" in chatbox) {
              chatbox.value = textToPaste;
            } else {
              chatbox.textContent = textToPaste;
              chatbox.innerText = textToPaste;
            }
          }
          console.log(`${logPrefix}: Text set, now triggering events...`);
          chatbox.classList.remove("ql-blank");
          if (chatbox.parentElement) {
            chatbox.parentElement.classList.remove("empty");
          }
          const inputEvent = new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: textToPaste,
            composed: true
          });
          textElement.dispatchEvent(inputEvent);
          chatbox.dispatchEvent(inputEvent);
          ["beforeinput", "input", "change", "keydown", "keyup", "paste"].forEach(
            (eventType) => {
              const event = new Event(eventType, {
                bubbles: true,
                cancelable: true,
                composed: true
              });
              textElement.dispatchEvent(event);
              chatbox.dispatchEvent(event);
            }
          );
          chatbox.dataset.summakeyContent = "true";
          chatbox.blur();
          setTimeout(() => {
            chatbox.focus();
            setTimeout(() => {
              var _a;
              let submitButton = null;
              for (const selector of SUBMIT_BUTTON_SELECTORS) {
                submitButton = document.querySelector(selector);
                if (submitButton && !submitButton.disabled) break;
              }
              if (!submitButton || submitButton.disabled) {
                const containers = [
                  chatbox.closest("form"),
                  chatbox.closest('[role="form"]'),
                  (_a = chatbox.parentElement) == null ? void 0 : _a.parentElement,
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
              if (submitButton && !submitButton.disabled && !submitButton.hasAttribute("disabled")) {
                console.log(`${logPrefix}: Clicking submit button`, submitButton);
                submitButton.click();
              } else {
                console.log(
                  `${logPrefix}: Submit button not found or disabled, trying Enter key`
                );
                chatbox.focus();
                const enterDown = new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: false,
                  composed: true
                });
                const enterUp = new KeyboardEvent("keyup", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: false,
                  composed: true
                });
                chatbox.dispatchEvent(enterDown);
                setTimeout(() => chatbox.dispatchEvent(enterUp), 10);
              }
            }, 800);
          }, 100);
        }, 100);
      } else if (attemptCount >= maxAttempts) {
        clearInterval(interval);
        console.error(`${logPrefix}: Chatbox not found after`, maxAttempts * 200, "ms");
        console.error("=== DEBUGGING INFO ===");
        console.error("Page URL:", window.location.href);
        console.error("Page title:", document.title);
        const textareas = Array.from(document.querySelectorAll("textarea"));
        console.error(
          `Available textareas (${textareas.length}):`,
          textareas.map((el) => ({
            id: el.id,
            className: el.className,
            placeholder: el.placeholder,
            ariaLabel: el.getAttribute("aria-label"),
            visible: el.offsetWidth > 0 && el.offsetHeight > 0,
            disabled: el.disabled
          }))
        );
        const contenteditableDivs = Array.from(
          document.querySelectorAll('div[contenteditable="true"]')
        );
        console.error(
          `Available contenteditable divs (${contenteditableDivs.length}):`,
          contenteditableDivs.map((el) => ({
            id: el.id,
            className: el.className,
            "data-placeholder": el.dataset.placeholder,
            role: el.role,
            ariaLabel: el.getAttribute("aria-label"),
            visible: el.offsetWidth > 0 && el.offsetHeight > 0,
            innerHTML: el.innerHTML.substring(0, 100)
          }))
        );
        const buttons = Array.from(document.querySelectorAll("button"));
        const sendButtons = buttons.filter(
          (b) => {
            var _a, _b;
            return ((_a = b.getAttribute("data-testid")) == null ? void 0 : _a.includes("send")) || ((_b = b.getAttribute("aria-label")) == null ? void 0 : _b.toLowerCase().includes("send"));
          }
        );
        console.error(
          "Available send buttons:",
          sendButtons.map((el) => ({
            dataTestId: el.getAttribute("data-testid"),
            ariaLabel: el.getAttribute("aria-label"),
            disabled: el.disabled,
            visible: el.offsetWidth > 0 && el.offsetHeight > 0
          }))
        );
        console.error("=== END DEBUGGING INFO ===");
      }
    }, 200);
  };
  function getDetailedPageContent() {
    try {
      let content = "";
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && metaDesc.content) content += `[Page Description] ${metaDesc.content}

`;
      if (document.title) content += `[Page Title] ${document.title}

`;
      content += `[Page URL] ${window.location.href}

`;
      const maxTextLength = 50 * 1024;
      const startTime = Date.now();
      const timeout = 5e3;
      const ELEMENT_NODE = 1;
      const TEXT_NODE = 3;
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node2) {
            if (Date.now() - startTime > timeout) return NodeFilter.FILTER_REJECT;
            if (node2.nodeType === ELEMENT_NODE) {
              const tag = node2.tagName ? node2.tagName.toLowerCase() : "";
              if (["nav", "footer", "script", "style", "svg", "noscript", "header", "aside", "iframe", "canvas", "form", "button"].includes(
                tag
              )) {
                return NodeFilter.FILTER_REJECT;
              }
              if (node2.hasAttribute("aria-hidden") && node2.getAttribute("aria-hidden") === "true") {
                return NodeFilter.FILTER_REJECT;
              }
              if (tag === "img" && node2.alt) {
                return NodeFilter.FILTER_ACCEPT;
              }
            } else if (node2.nodeType === TEXT_NODE) {
              if (node2.textContent && node2.textContent.trim().length > 0) {
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
      let nodeCount = 0;
      const maxNodes = 5e3;
      let currentLength = content.length;
      while ((node = walker.nextNode()) && Date.now() - startTime < timeout) {
        if (currentLength >= maxTextLength || nodeCount++ > maxNodes) break;
        let text = "";
        if (node.nodeType === TEXT_NODE) {
          text = node.textContent.trim();
        } else if (node.nodeType === ELEMENT_NODE && node.tagName && node.tagName.toLowerCase() === "img") {
          text = `[Image: ${node.alt}]`;
        }
        if (text) {
          texts.push(text);
          currentLength += text.length;
        }
      }
      content += texts.join(" ");
      if (!content || content.trim().length < 50) {
        const bodyText = document.body.innerText || "";
        content += bodyText.substring(0, maxTextLength);
      }
      return content;
    } catch (error) {
      return `ERROR: Content extraction failed: ${error.message} at ${window.location.href}`;
    }
  }
  async function showNotification({
    title,
    message,
    notificationId = "summakey-notification",
    iconPath = "icons/icon128.png"
  }) {
    try {
      await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL(iconPath),
        title: title || "SummaKey",
        message: message || "",
        priority: 2,
        silent: false
      });
      setTimeout(() => {
        chrome.notifications.clear(notificationId, (wasCleared) => {
          if (chrome.runtime.lastError) {
            console.warn("SummaKey: Error clearing notification:", chrome.runtime.lastError);
          }
        });
      }, 2500);
    } catch (error) {
      console.error("SummaKey: Error creating notification:", error);
    }
  }
  function navigateAndInjectPrompt({
    destinationUrl,
    finalPrompt,
    logPrefix = "SummaKey",
    notificationDelayMs = 200,
    spaDelayMs = 2e3
  }) {
    setTimeout(async () => {
      const llmTab = await chrome.tabs.create({ url: destinationUrl, active: true });
      let attempts = 0;
      const maxWaitAttempts = 20;
      const waitForPage = setInterval(async () => {
        attempts++;
        try {
          const tab = await chrome.tabs.get(llmTab.id);
          if (tab.status === "complete") {
            clearInterval(waitForPage);
            setTimeout(async () => {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: llmTab.id },
                  func: pasteAndSubmitToLLM,
                  args: [finalPrompt, logPrefix]
                });
                console.log(`${logPrefix}: Script injected successfully`);
              } catch (error) {
                console.error(`${logPrefix}: Error injecting script:`, error);
                try {
                  await chrome.scripting.executeScript({
                    target: { tabId: llmTab.id },
                    func: pasteAndSubmitToLLM,
                    args: [finalPrompt, logPrefix]
                  });
                } catch (error2) {
                  console.error(`${logPrefix}: Alternative injection also failed:`, error2);
                }
              }
            }, spaDelayMs);
          }
        } catch (error) {
          console.error(`${logPrefix}: Error checking tab status:`, error);
        }
        if (attempts >= maxWaitAttempts) {
          clearInterval(waitForPage);
          console.error(`${logPrefix}: Page did not load in time`);
        }
      }, 500);
    }, notificationDelayMs);
  }
  const LOG_PREFIX = "SummaKey Shopper";
  const NOTIFICATION_ID = "summakey-shopper-notification";
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
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      chrome.storage.local.get("installationId", (localData) => {
        if (!localData.installationId) {
          chrome.storage.sync.get("userId", (syncData) => {
            const newId = syncData.userId || crypto.randomUUID();
            chrome.storage.local.set({ installationId: newId });
          });
        }
      });
      chrome.tabs.create({ url: chrome.runtime.getURL("get-started.html") });
      chrome.storage.local.set({ scrapedProducts: [] });
    } else if (details.reason === "update") {
      chrome.storage.local.get("installationId", (localData) => {
        if (!localData.installationId) {
          chrome.storage.sync.get("userId", (syncData) => {
            if (syncData.userId) {
              chrome.storage.local.set({ installationId: syncData.userId });
            }
          });
        }
      });
    }
  });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const LOG_ID = Math.random().toString(36).substring(7);
    console.log(`${LOG_PREFIX} [${LOG_ID}]: Received message:`, request.action);
    if (request.action === "scrapeCurrentPage" || request.action === "scrape") {
      scrapeAndStore(LOG_ID).then((result) => {
        console.log(`${LOG_PREFIX} [${LOG_ID}]: Scrape successful.`);
        sendResponse(result || { status: "scraped" });
      }).catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Scrape error:`, error);
        sendResponse({ status: "error", message: error.message });
      });
      return true;
    }
    if (request.action === "compareProducts") {
      compareProducts().then(() => sendResponse({ status: "comparing" })).catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Compare error:`, error);
        sendResponse({ status: "error", message: error.message });
      });
      return true;
    }
    if (request.action === "clearList") {
      clearProductList().then(() => sendResponse({ status: "cleared" })).catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Clear error:`, error);
        sendResponse({ status: "error", message: error.message });
      });
      return true;
    }
    if (request.action === "clearLastProduct") {
      clearLastProduct().then(() => sendResponse({ status: "cleared_last" })).catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Clear last error:`, error);
        sendResponse({ status: "error", message: error.message });
      });
      return true;
    }
    if (request.action === "getAuthState") {
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
      return true;
    }
    if (request.action === "validateSession") {
      validateSession().then((isValid) => sendResponse({ isValid })).catch((error) => sendResponse({ isValid: false, error: error.message }));
      return true;
    }
    if (request.action === "forceLogout") {
      forceLogout().then(() => sendResponse({ status: "logged_out" })).catch((error) => sendResponse({ status: "error", message: error.message }));
      return true;
    }
    return false;
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === "scrape_current_page") {
      scrapeAndStore("hotkey");
    } else if (command === "compare_products") {
      compareProducts();
    }
  });
  async function scrapeAndStore(logId = "direct") {
    console.log(`${LOG_PREFIX} [${logId}]: scrapeAndStore() starting...`);
    try {
      const { hasConsented } = await chrome.storage.sync.get(["hasConsented"]);
      if (!hasConsented) {
        console.warn(`${LOG_PREFIX} [${logId}]: Consent not found.`);
        await showNotification({
          title: "Consent Required",
          message: "Please complete the setup and provide consent to use this extension.",
          notificationId: NOTIFICATION_ID
        });
        chrome.tabs.create({ url: chrome.runtime.getURL("get-started.html") });
        return { status: "error", message: "Consent required" };
      }
      console.log(`${LOG_PREFIX} [${logId}]: Validating auth...`);
      const authPromise = (async () => {
        const email2 = await getAuthenticatedEmail();
        let isPro2 = false;
        if (email2) {
          const sessionValid = await validateSession();
          if (!sessionValid) {
            console.warn(`${LOG_PREFIX} [${logId}]: Session invalid.`);
            await forceLogout();
            await showNotification({
              title: "Session Expired",
              message: "Please sign in again.",
              notificationId: NOTIFICATION_ID
            });
            chrome.runtime.openOptionsPage();
            return { error: "Session expired" };
          }
          isPro2 = await checkPurchaseStatus(email2);
        }
        return { email: email2, isPro: isPro2 };
      })();
      const authTimeoutPromise = new Promise((r) => setTimeout(() => r({ timeout: true }), 8e3));
      const authResult = await Promise.race([authPromise, authTimeoutPromise]);
      if (authResult.timeout) {
        console.warn(`${LOG_PREFIX} [${logId}]: Auth check timed out. Proceeding as free user.`);
      }
      if (authResult.error) return { status: "error", message: authResult.error };
      const email = authResult.email || null;
      const isPro = authResult.isPro || false;
      const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
      const limit = isPro ? 10 : 2;
      const currentList = scrapedProducts || [];
      if (currentList.length >= limit) {
        console.warn(`${LOG_PREFIX} [${logId}]: List full (${currentList.length}/${limit}).`);
        await showNotification({
          title: "List Full",
          message: `Free users can only compare ${limit} products. Upgrade for 10.`,
          notificationId: NOTIFICATION_ID
        });
        chrome.runtime.openOptionsPage();
        return { status: "error", message: "List full" };
      }
      console.log(`${LOG_PREFIX} [${logId}]: Querying active tab...`);
      const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!currentTab || !currentTab.id) {
        console.error(`${LOG_PREFIX} [${logId}]: No active tab found.`);
        await showNotification({
          title: "Error",
          message: "Could not find the current tab.",
          notificationId: NOTIFICATION_ID
        });
        return { status: "error", message: "No active tab" };
      }
      if (currentTab.url && (currentTab.url.startsWith("chrome://") || currentTab.url.startsWith("chrome-extension://") || currentTab.url.startsWith("edge://") || currentTab.url.startsWith("about:"))) {
        console.warn(`${LOG_PREFIX} [${logId}]: Restricted page: ${currentTab.url}`);
        await showNotification({
          title: "Error",
          message: "Cannot scrape this type of page.",
          notificationId: NOTIFICATION_ID
        });
        return { status: "error", message: "Restricted page" };
      }
      console.log(`${LOG_PREFIX} [${logId}]: Injecting script into tab ${currentTab.id}...`);
      let pageContent = "";
      const scriptPromise = chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: getDetailedPageContent
      });
      const scriptTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Scraping timed out (page too heavy)")), 15e3));
      try {
        const results = await Promise.race([scriptPromise, scriptTimeout]);
        if (!results || !results[0] || results[0].result === void 0) {
          throw new Error("No content returned from tab");
        }
        pageContent = results[0].result;
      } catch (e) {
        console.error(`${LOG_PREFIX} [${logId}]: Scrape fail:`, e);
        await showNotification({
          title: "Scrape Failed",
          message: e.message,
          notificationId: NOTIFICATION_ID
        });
        return { status: "error", message: e.message };
      }
      if (!pageContent || pageContent.trim().length === 0 || pageContent.startsWith("ERROR:")) {
        const errMsg = pageContent || "No products detected on this page.";
        return { status: "error", message: errMsg };
      }
      const maxContentSize = 100 * 1024;
      const trimmedContent = pageContent.length > maxContentSize ? pageContent.substring(0, maxContentSize) + "\n\n[Content truncated]" : pageContent;
      const newProduct = {
        title: currentTab.title || "Untitled Product",
        url: currentTab.url,
        content: trimmedContent,
        timestamp: Date.now()
      };
      const updatedList = [...currentList, newProduct];
      await chrome.storage.local.set({ scrapedProducts: updatedList });
      await chrome.action.setBadgeText({ text: updatedList.length.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: "#4734ff" });
      await showNotification({
        title: "Product Added!",
        message: `Product ${updatedList.length} added.`,
        notificationId: NOTIFICATION_ID
      });
      return { status: "scraped", count: updatedList.length };
    } catch (e) {
      console.error(`${LOG_PREFIX} [${logId}]: Unexpected error:`, e);
      return { status: "error", message: e.message };
    }
  }
  async function compareProducts() {
    const { hasConsented } = await chrome.storage.sync.get(["hasConsented"]);
    if (!hasConsented) {
      await showNotification({
        title: "Consent Required",
        message: "Please complete the setup and provide consent to use this extension.",
        notificationId: NOTIFICATION_ID
      });
      chrome.tabs.create({ url: chrome.runtime.getURL("get-started.html") });
      return;
    }
    const email = await getAuthenticatedEmail();
    let isPro = false;
    if (email) {
      const sessionValid = await validateSession();
      if (!sessionValid) {
        await forceLogout();
        await showNotification({
          title: "Session Expired",
          message: "You've been signed in on another device. Please sign in again.",
          notificationId: NOTIFICATION_ID
        });
        chrome.runtime.openOptionsPage();
        return;
      }
      isPro = await checkPurchaseStatus(email);
    }
    const { proPrompt } = await chrome.storage.sync.get(["proPrompt"]);
    const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
    const currentList = scrapedProducts || [];
    if (currentList.length === 0) {
      await showNotification({
        title: "List Empty",
        message: "Please scrape some products first.",
        notificationId: NOTIFICATION_ID
      });
      return;
    }
    let finalPrompt = "";
    const allContent = currentList.map((p) => typeof p === "string" ? p : p.content || "").join("\n\n--- NEXT ITEM TO COMPARE ---\n\n");
    if (isPro && proPrompt) {
      finalPrompt = proPrompt.replace("{{content}}", allContent);
    } else {
      finalPrompt = DEFAULT_SHOPPER_PROMPT_V2.replace("{{content}}", allContent);
    }
    const { destinationUrl } = await chrome.storage.sync.get("destinationUrl");
    const destinationURL = destinationUrl || "https://gemini.google.com/app";
    await showNotification({
      title: "Comparing Products",
      message: `Comparing ${currentList.length} products...`,
      notificationId: NOTIFICATION_ID
    });
    navigateAndInjectPrompt({
      destinationUrl: destinationURL,
      finalPrompt,
      logPrefix: LOG_PREFIX
    });
    await clearProductList();
  }
  async function clearProductList() {
    await chrome.storage.local.set({ scrapedProducts: [] });
    await chrome.action.setBadgeText({ text: "" });
    await showNotification({
      title: "List Cleared",
      message: "Your product comparison list is now empty.",
      notificationId: NOTIFICATION_ID
    });
  }
  async function clearLastProduct() {
    const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
    if (!scrapedProducts || scrapedProducts.length === 0) {
      await showNotification({
        title: "List Empty",
        message: "There are no products to remove.",
        notificationId: NOTIFICATION_ID
      });
      return;
    }
    const removedProduct = scrapedProducts.pop();
    await chrome.storage.local.set({ scrapedProducts });
    const badgeText = scrapedProducts.length > 0 ? scrapedProducts.length.toString() : "";
    await chrome.action.setBadgeText({ text: badgeText });
    let displayTitle = "";
    if (typeof removedProduct === "string") {
      displayTitle = removedProduct.substring(0, 40).split("\n")[0];
    } else {
      displayTitle = removedProduct.title || "Untitled Product";
    }
    await showNotification({
      title: "Product Removed",
      message: `Removed: "${displayTitle.substring(0, 30)}..."`,
      notificationId: NOTIFICATION_ID
    });
  }
})();
