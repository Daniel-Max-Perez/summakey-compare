importScripts('google-analytics.js', 'supabase-bundle.js', 'supabase.js');

(function() {
  "use strict";
  const pasteAndSubmitToLLM = function(textToPaste, logPrefix = "SummaKey", remoteConfig = null) {
    console.log(`${logPrefix}: Attempting to paste text into chatbox...`);
    console.log(`${logPrefix}: Text length:`, textToPaste.length);
    const SELECTORS = (remoteConfig == null ? void 0 : remoteConfig.chatboxSelectors) || [
      "textarea#prompt-textarea",
      'textarea[id^="prompt-textarea"]',
      'textarea[id*="prompt"]',
      "#prompt-textarea",
      'div[contenteditable="true"][data-placeholder*="Message"]',
      'div[contenteditable="true"][data-placeholder*="message"]',
      'div[contenteditable="true"][placeholder*="Message"]',
      'div[contenteditable="true"][aria-label*="Message"]',
      'div[contenteditable="true"][aria-label*="message"]',
      'div[contenteditable="true"][aria-label*="Write"]',
      'div[contenteditable="true"][aria-label*="Enter"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "#prompt-input",
      "#chat-input",
      "#message-input",
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Ask"]',
      'textarea[aria-label*="Message"]',
      'textarea[aria-label*="message"]',
      'textarea[aria-label*="Ask"]',
      "textarea"
    ];
    function findChatbox() {
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
      return null;
    }
    const SUBMIT_BUTTON_SELECTORS = (remoteConfig == null ? void 0 : remoteConfig.submitSelectors) || [
      'button[data-testid="send-button"]',
      'button[data-testid*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="Submit"]',
      'button[aria-label="Send message"]',
      'button[type="submit"]',
      "button.send-button",
      'button[class*="send"]',
      'button[class*="submit"]'
    ];
    function waitForChatbox(callback) {
      const existingChatbox = findChatbox();
      if (existingChatbox) return callback(existingChatbox);
      let isFound = false;
      const observer = new MutationObserver((mutations, obs) => {
        if (isFound) return;
        const chatbox = findChatbox();
        if (chatbox) {
          isFound = true;
          obs.disconnect();
          callback(chatbox);
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        if (!isFound) {
          isFound = true;
          observer.disconnect();
          console.error(`${logPrefix}: Chatbox not found after 15s`);
        }
      }, 15e3);
    }
    waitForChatbox((chatbox) => {
      console.log(`${logPrefix}: Chatbox ready. Injecting...`);
      chatbox.scrollIntoView({ behavior: "smooth", block: "center" });
      chatbox.focus();
      setTimeout(() => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", textToPaste);
        const pasteEvent = new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true });
        chatbox.dispatchEvent(pasteEvent);
        setTimeout(() => {
          const currentVal = chatbox.tagName.toLowerCase() === "textarea" ? chatbox.value : chatbox.innerText;
          if (!currentVal || currentVal.length < textToPaste.length * 0.1) {
            console.log(`${logPrefix}: Paste failed or blocked, using direct assignment fallback`);
            if (chatbox.tagName.toLowerCase() === "div" && chatbox.contentEditable === "true") {
              chatbox.innerHTML = "";
              const p = document.createElement("p");
              p.textContent = textToPaste;
              chatbox.appendChild(p);
            } else {
              chatbox.value = textToPaste;
            }
            ["input", "change", "beforeinput"].forEach((type) => chatbox.dispatchEvent(new Event(type, { bubbles: true, composed: true })));
          }
          setTimeout(() => {
            const enterOpts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
            chatbox.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
            chatbox.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
            setTimeout(() => {
              let submitBtn = null;
              for (const sel of SUBMIT_BUTTON_SELECTORS) {
                submitBtn = document.querySelector(sel);
                if (submitBtn && !submitBtn.disabled) break;
              }
              if (submitBtn) {
                submitBtn.click();
                console.log(`${logPrefix}: Submit clicked`);
              }
            }, 500);
          }, 600);
        }, 300);
      }, 200);
    });
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
              if (["nav", "footer", "script", "style", "svg", "noscript", "header", "aside", "iframe", "canvas", "form", "button"].includes(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              if (node2.hasAttribute("aria-hidden") && node2.getAttribute("aria-hidden") === "true") {
                return NodeFilter.FILTER_REJECT;
              }
            } else if (node2.nodeType === TEXT_NODE) {
              if (node2.textContent && node2.textContent.trim().length > 0) return NodeFilter.FILTER_ACCEPT;
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
        if (node.nodeType === TEXT_NODE) {
          let text = node.textContent.replace(/\s+/g, " ").trim();
          text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED SSN]");
          text = text.replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED CC]");
          text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED EMAIL]");
          if (text) {
            texts.push(text);
            currentLength += text.length;
          }
        }
      }
      content += texts.join(" ");
      if (!content || content.trim().length < 50) {
        content += (document.body.innerText || "").substring(0, maxTextLength);
      }
      return content;
    } catch (error) {
      return `ERROR: Extraction failed: ${error.message}`;
    }
  }
  async function showNotification({ title, message, notificationId = "summakey-notification", iconPath = "icons/icon128.png" }) {
    try {
      await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL(iconPath),
        title: title || "SummaKey",
        message: message || "",
        priority: 2
      });
      setTimeout(() => chrome.notifications.clear(notificationId), 2500);
    } catch (error) {
      console.error("SummaKey Notification Error:", error);
    }
  }
  function navigateAndInjectPrompt({ destinationUrl, finalPrompt, logPrefix = "SummaKey", notificationDelayMs = 200, spaDelayMs = 2e3, remoteConfig = null }) {
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
                  args: [finalPrompt, logPrefix, remoteConfig]
                });
              } catch (err) {
                console.error("Injection failed:", err);
              }
            }, spaDelayMs);
          }
        } catch (err) {
          clearInterval(waitForPage);
        }
        if (attempts >= maxWaitAttempts) clearInterval(waitForPage);
      }, 500);
    }, notificationDelayMs);
  }
  const LOG_PREFIX = "SummaKey Compare";
  const NOTIFICATION_ID = "summakey-compare-notification";
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
      scrapeAndStore(LOG_ID, request.tab).then((result) => {
        console.log(`${LOG_PREFIX} [${LOG_ID}]: Scrape successful.`);
        sendResponse(result || { status: "scraped" });
      }).catch((error) => {
        console.error(`${LOG_PREFIX} [${LOG_ID}]: Scrape error:`, error);
        sendResponse({ status: "error", message: error.message });
      });
      return true;
    }
    if (request.action === "compareProducts") {
      compareProducts(request.presetIndex).then(() => sendResponse({ status: "comparing" })).catch((error) => {
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
    if (request.action === "injectionFailed") {
      showNotification({
        title: "Injection Failed",
        message: "Could not submit prompt. The AI site may have updated its interface or you hit a limit.",
        notificationId: "injection-failed"
      });
      sendResponse({ status: "notified" });
      return true;
    }
    return false;
  });
  let cachedSelectors = null;
  let lastSelectorFetch = 0;
  async function getRemoteSelectors() {
    const now = Date.now();
    if (cachedSelectors && now - lastSelectorFetch < 12 * 60 * 60 * 1e3) {
      return cachedSelectors;
    }
    try {
      const res = await fetch("https://summakey-backend.vercel.app/api/selectors");
      if (res.ok) {
        cachedSelectors = await res.json();
        lastSelectorFetch = now;
        return cachedSelectors;
      }
    } catch (e) {
      console.warn("Could not fetch remote selectors, using fallbacks");
    }
    return null;
  }
  let lastHotkeyTime = 0;
  chrome.commands.onCommand.addListener((command) => {
    const now = Date.now();
    if (now - lastHotkeyTime < 500) return;
    lastHotkeyTime = now;
    if (command === "scrape_current_page") {
      scrapeAndStore("hotkey");
    } else if (command === "compare_products") {
      compareProducts(0);
    }
  });
  async function scrapeAndStore(logId = "direct", explicitTab = null) {
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
      console.log(`${LOG_PREFIX} [${logId}]: Checking cached auth status...`);
      const { pro } = await chrome.storage.sync.get(["pro"]);
      const isPro = !!pro;
      const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
      const limit = isPro ? 10 : 2;
      const currentList = scrapedProducts || [];
      if (currentList.length >= limit) {
        console.warn(`${LOG_PREFIX} [${logId}]: List full (${currentList.length}/${limit}).`);
        await showNotification({
          title: "List Full",
          message: `Free users can only compare ${limit} pages. Upgrade for 10.`,
          notificationId: NOTIFICATION_ID
        });
        chrome.runtime.openOptionsPage();
        return { status: "error", message: "List full" };
      }
      console.log(`${LOG_PREFIX} [${logId}]: Identifying active tab...`);
      let currentTab = explicitTab;
      if (!currentTab) {
        const tabs = await chrome.tabs.query({ active: true });
        currentTab = tabs.find((t) => !t.url.startsWith("chrome-extension://")) || tabs[0];
      }
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
      const isDuplicate = currentList.some((item) => item.url === currentTab.url);
      if (isDuplicate) {
        console.warn(`${LOG_PREFIX} [${logId}]: Page already scraped: ${currentTab.url}`);
        await showNotification({
          title: "Already Added",
          message: "This page is already in your comparison list.",
          notificationId: NOTIFICATION_ID
        });
        return { status: "error", message: "Page already added" };
      }
      console.log(`${LOG_PREFIX} [${logId}]: Injecting script into tab ${currentTab.id}...`);
      let pageContent = "";
      const scriptPromise = chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: getDetailedPageContent,
        injectImmediately: true
      });
      const scriptTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Page too large or slow to scrape. Try refreshing.")), 15e3));
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
        const errMsg = pageContent || "No details detected on this page.";
        return { status: "error", message: errMsg };
      }
      const maxContentSize = 25 * 1024;
      const trimmedContent = pageContent.length > maxContentSize ? pageContent.substring(0, maxContentSize) + "\n\n[Content truncated]" : pageContent;
      const newProduct = {
        title: currentTab.title || "Untitled Page",
        url: currentTab.url,
        content: trimmedContent,
        timestamp: Date.now()
      };
      const updatedList = [...currentList, newProduct];
      await chrome.storage.local.set({ scrapedProducts: updatedList });
      await chrome.action.setBadgeText({ text: updatedList.length.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: "#4734ff" });
      await showNotification({
        title: "Page Added!",
        message: `Page ${updatedList.length} added.`,
        notificationId: NOTIFICATION_ID
      });
      return { status: "scraped", count: updatedList.length };
    } catch (e) {
      console.error(`${LOG_PREFIX} [${logId}]: Unexpected error:`, e);
      return { status: "error", message: e.message };
    }
  }
  async function compareProducts(presetIndex = 0) {
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
          message: "You've been signed in on another device. Please click the extension icon to sign in.",
          notificationId: NOTIFICATION_ID
        });
        return;
      }
      isPro = await checkPurchaseStatus(email);
    }
    if (presetIndex > 0 && !isPro) {
      await showNotification({
        title: "Pro Required",
        message: "This preset requires SummaKey Compare Pro.",
        notificationId: NOTIFICATION_ID
      });
      chrome.runtime.openOptionsPage();
      return;
    }
    const { presets } = await chrome.storage.sync.get(["presets"]);
    const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
    const currentList = scrapedProducts || [];
    if (currentList.length === 0) {
      await showNotification({
        title: "List Empty",
        message: "Please scrape some pages first.",
        notificationId: NOTIFICATION_ID
      });
      return;
    }
    let finalPrompt = "";
    const allContent = currentList.map((p) => {
      const titleText = p.title ? `Page: ${p.title}
` : "";
      const urlText = p.url ? `URL: ${p.url}
` : "";
      const textContent = typeof p === "string" ? p : p.content || "";
      return `${titleText}${urlText}${textContent}`;
    }).join("\n\n--- NEXT ITEM TO COMPARE ---\n\n");
    let activePreset = null;
    if (presets && presets[presetIndex]) {
      activePreset = presets[presetIndex];
    }
    const secureContent = `
### USER DATA START ###
${allContent}
### USER DATA END ###
`;
    if (activePreset && activePreset.prompt) {
      finalPrompt = activePreset.prompt.replace("{{content}}", secureContent);
    } else {
      finalPrompt = DEFAULT_COMPARE_PROMPT_V2.replace("{{content}}", secureContent);
    }
    const destinationURL = activePreset && activePreset.url ? activePreset.url : "https://gemini.google.com/app";
    await showNotification({
      title: "Comparing Pages",
      message: `Comparing ${currentList.length} pages...`,
      notificationId: NOTIFICATION_ID
    });
    const remoteConfig = await getRemoteSelectors();
    navigateAndInjectPrompt({
      destinationUrl: destinationURL,
      finalPrompt,
      logPrefix: LOG_PREFIX,
      notificationDelayMs: 200,
      remoteConfig
    });
    await clearProductList();
  }
  async function clearProductList() {
    await chrome.storage.local.set({ scrapedProducts: [] });
    await chrome.action.setBadgeText({ text: "" });
    await showNotification({
      title: "List Cleared",
      message: "Your page comparison list is now empty.",
      notificationId: NOTIFICATION_ID
    });
  }
  async function clearLastProduct() {
    const { scrapedProducts } = await chrome.storage.local.get(["scrapedProducts"]);
    if (!scrapedProducts || scrapedProducts.length === 0) {
      await showNotification({
        title: "List Empty",
        message: "There are no pages to remove.",
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
      displayTitle = removedProduct.title || "Untitled Page";
    }
    await showNotification({
      title: "Page Removed",
      message: `Removed: "${displayTitle.substring(0, 30)}..."`,
      notificationId: NOTIFICATION_ID
    });
  }
})();
