document.addEventListener('DOMContentLoaded', () => {
  // --- Global Element Definitions ---
  const openShortcutsButton = document.getElementById('openShortcuts');
  const upgradeCard = document.querySelector('.upgrade-card');
  const upgradeButton = document.getElementById('upgradeButton');
  const restorePurchaseLink = document.getElementById('restorePurchase');

  // --- Prompt Card Elements ---
  const freePromptCard = document.getElementById('free-prompt-card');
  const proPromptCard = document.getElementById('pro-prompt-card');
  const saveButton = document.getElementById('save-prompt');
  const proTextarea = document.getElementById('pro-prompt-textarea');
  const freeTextarea = document.getElementById('free-prompt-textarea');
  const saveStatus = document.getElementById('save-status');

  // --- Dropdown Elements ---
  const llmSelect = document.getElementById('llm-select-main');
  const urlInput = document.getElementById('llmUrl-main');
  const customUrlLabel = document.querySelector('.custom-url-label');

  // --- Dropdown Data ---
  const presetLLMs = [
    { name: "Gemini", url: "https://gemini.google.com/app" },
    { name: "ChatGPT", url: "https://chatgpt.com/" },
    { name: "Claude", url: "https://claude.ai/new" },
    { name: "Grok", url: "https://grok.com/" },
    { name: "Mistral", url: "https://chat.mistral.ai/chat" },
    { name: "DeepSeek", url: "https://chat.deepseek.com/" }
  ];

  // --- Default Prompt ---
  const DEFAULT_SHOPPER_PROMPT = `You are an expert product analyst and data-driven shopping assistant. Your sole mission is to help me make the best, fastest, and most informed buying decision possible, based only on the raw text data I provide.

My Priorities (Default):

1.  Value: What is the best price-to-performance ratio?

2.  Key Features: How do the core specs and features compare?

3.  Quality: Based on reviews or materials mentioned, which seems most reliable?

Your Task & Output Structure:

You must follow this 4-step structure precisely. Do not add any conversational text outside of this structure. The raw text for each product is separated by --- NEXT ITEM TO COMPARE ---.

---

## 1. Top Recommendation

Start here. Based on my default priorities, state your #1 Top Recommendation and provide a 2-sentence justification for why it's the best choice.

## 2. Comparison Table

Create a comprehensive markdown table comparing all products.

* The first column must be the Product Name.

* Subsequent columns must be for Price and all other Key Features (e.g., Specs, Size, etc.).

* Crucial Row: Include a "Key Differentiator" row that explains the single most important difference between the products (e.g., "Screen Technology," "Battery Type," "Warranty").

## 3. Pros & Cons Analysis

Create a "Pros & Cons" bulleted list for each product. Each point must be concise and directly related to my stated priorities (Value, Features, Quality).

## 4. Final Verdict

Conclude with this final analysis:

* Best for Price: State which product is the best choice if only the lowest price matters.

* Best for Quality/Features: State which product is the best choice if only the best features and quality matter, regardless of price.

* Missing Information: Explicitly state any key information (like price, warranty, or a key spec) that was not found in the provided text for any product.

---

{{content}}`;

  // --- Monetization Functions ---
  const getOrCreateUserId = async () => {
    let { userId } = await new Promise(resolve => chrome.storage.sync.get('userId', resolve));
    if (!userId) {
      userId = crypto.randomUUID();
      await new Promise(resolve => chrome.storage.sync.set({ userId }, resolve));
    }
    return userId;
  };

  // --- Reusable Verification Function ---
  async function checkAndActivateLicense(isManualClick = false) {
    const link = restorePurchaseLink;
    if (isManualClick && link) {
      link.textContent = 'Verifying...';
    }

    try {
      const installationId = await getOrCreateUserId();

      const response = await fetch(`https://summakey-backend.vercel.app/api/verify-purchase?installationId=${installationId}`);
      const data = await response.json();

      if (data.isShopper) {
        chrome.storage.sync.set({ pro: true }, () => {
          if (isManualClick) {
            alert("Shopper Premium active! The page will now reload.");
          }
          location.reload();
        });
      } else {
        chrome.storage.sync.set({ pro: false });
        if (isManualClick) {
          alert("No active Shopper subscription found for this installation. Please connect your account or subscribe.");
        }
      }
    } catch (error) {
      console.error("Verification failed:", error);
      if (isManualClick) {
        alert("Could not verify purchase. Please try again later.");
      }
    } finally {
      if (isManualClick && link) {
        link.textContent = 'Restore Your Purchase';
      }
    }
  }

  // --- MAIN APP INITIALIZATION ---
  const initializeApp = () => {
    chrome.storage.sync.get({ pro: false }, (data) => {
      updateUIForProStatus(data.pro);
      setupDestinationDropdown(data.pro);
      setupPromptCards(data.pro);

      if (data.pro) {
        // User is Pro, run Pro logic
        // Already handled by setupPromptCards
      } else {
        // User is Free, run Free logic
        // Already handled by setupPromptCards

        // Automatic Check on Tab Focus
        window.addEventListener('focus', () => {
          console.log("Tab focused, checking for purchase...");
          checkAndActivateLicense(false);
        }, { once: true });
      }
    });
  };

  const updateUIForProStatus = (isPro) => {
    if (isPro) {
      if (upgradeCard) {
        upgradeCard.style.display = 'none';
      }
    } else {
      if (upgradeCard) {
        upgradeCard.style.display = 'flex';
      }
    }
  };

  // --- Dropdown Logic ---
  const saveDestinationUrl = (url) => {
    chrome.storage.sync.set({ destinationUrl: url });
  };

  const setupDestinationDropdown = async (isPro) => {
    let { destinationUrl } = await chrome.storage.sync.get('destinationUrl');
    let isCustom = true;

    presetLLMs.forEach(llm => {
      const option = document.createElement('option');
      option.value = llm.url;
      option.textContent = llm.name;
      if (llm.url === destinationUrl) {
        option.selected = true;
        isCustom = false;
      }
      llmSelect.appendChild(option);
    });

    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom URL (Pro Feature)';
    llmSelect.appendChild(customOption);

    if (!isPro) {
      customOption.disabled = true;
      urlInput.disabled = true;
    } else {
      customOption.textContent = 'Custom URL';
    }

    if (isCustom) {
      if (destinationUrl) {
        llmSelect.value = 'custom';
        urlInput.style.display = 'block';
        customUrlLabel.style.display = 'block';
        urlInput.value = destinationUrl;
        if (!isPro) urlInput.disabled = true;
      } else {
        llmSelect.value = presetLLMs[0].url;
        urlInput.value = presetLLMs[0].url;
        saveDestinationUrl(presetLLMs[0].url);
      }
    } else {
      urlInput.value = destinationUrl;
      urlInput.style.display = 'none';
      customUrlLabel.style.display = 'none';
    }
  };

  // --- Prompt Card Logic ---
  const setupPromptCards = async (isPro) => {
    if (isPro) {
      proPromptCard.style.display = 'block';
      freePromptCard.style.display = 'none';
      loadCustomPrompt();
    } else {
      proPromptCard.style.display = 'none';
      freePromptCard.style.display = 'block';
      freeTextarea.value = DEFAULT_SHOPPER_PROMPT;
    }
  };

  const loadCustomPrompt = async () => {
    const { proPrompt } = await chrome.storage.sync.get('proPrompt');
    if (proPrompt) {
      proTextarea.value = proPrompt;
    } else {
      proTextarea.value = DEFAULT_SHOPPER_PROMPT;
    }
  };

  // --- Event Listeners ---

  // Hotkey Button
  if (openShortcutsButton) {
    openShortcutsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  // --- Dropdown Listeners ---
  if (llmSelect) {
    llmSelect.addEventListener('change', () => {
      if (llmSelect.value === 'custom') {
        urlInput.style.display = 'block';
        customUrlLabel.style.display = 'block';
        urlInput.value = '';
        urlInput.disabled = false;
        urlInput.focus();
      } else {
        urlInput.style.display = 'none';
        customUrlLabel.style.display = 'none';
        urlInput.value = llmSelect.value;
        urlInput.disabled = true;
        saveDestinationUrl(llmSelect.value);
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('change', () => {
      saveDestinationUrl(urlInput.value);
    });
  }

  // --- Pro Prompt Save Button Listener ---
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const newPrompt = proTextarea.value;
      chrome.storage.sync.set({ proPrompt: newPrompt }, () => {
        saveStatus.textContent = 'Prompt Saved!';
        saveStatus.style.opacity = '1';
        setTimeout(() => { saveStatus.style.opacity = '0'; }, 2000);
      });
    });
  }

  if (upgradeButton) {
    upgradeButton.addEventListener('click', async () => {
      upgradeButton.textContent = 'Verifying...';
      upgradeButton.disabled = true;
      try {
        const userId = await getOrCreateUserId();
        const response = await fetch('https://summakey-backend.vercel.app/api/stripe-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId, product: 'shopper' })
        });
        const data = await response.json();
        if (data.url) {
          chrome.tabs.create({ url: data.url });
        } else {
          throw new Error(data.error || 'Failed to get checkout URL');
        }
      } catch (error) {
        console.error('Error starting checkout:', error);
        alert('An error occurred. Please check the console and try again.');
      } finally {
        upgradeButton.textContent = 'Unlock Now';
        upgradeButton.disabled = false;
      }

      // Add focus listener after opening checkout
      window.addEventListener('focus', () => {
        checkAndActivateLicense(false);
      }, { once: true });
    });
  }

  if (restorePurchaseLink) {
    restorePurchaseLink.addEventListener('click', (e) => {
      e.preventDefault();
      checkAndActivateLicense(true);
    });
  }

  // --- Start the app ---
  initializeApp();
});
