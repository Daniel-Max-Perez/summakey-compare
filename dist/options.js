// --- Local Testing Mock for direct file:/// viewing ---
if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = {
    storage: {
      sync: {
        get: (keys, cb) => {
          const res = typeof keys === 'string' ? { [keys]: null } : keys;
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (data, cb) => { if (cb) cb(); return Promise.resolve(); }
      },
      local: {
        get: (keys, cb) => {
          const res = typeof keys === 'string' ? { [keys]: null } : keys;
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (data, cb) => { if (cb) cb(); return Promise.resolve(); },
        remove: (keys, cb) => { if (cb) cb(); return Promise.resolve(); }
      }
    },
    tabs: { create: (obj) => alert('Chrome tabs API mock: opened ' + obj.url) },
    runtime: {
      sendMessage: (msg, cb) => { if (cb) cb({}); },
      openOptionsPage: () => {}
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // --- Global Element Definitions ---
  const openShortcutsButton = document.getElementById('openShortcuts');
  const upgradeCard = document.querySelector('.upgrade-card');
  const upgradeButton = document.getElementById('upgradeToPro');
  const restorePurchaseLink = document.getElementById('restorePurchaseLink');

  // --- Auth Elements ---
  const authSignedOut = document.getElementById('auth-signed-out');
  const authVerifyOtp = document.getElementById('auth-verify-otp');
  const authSignedIn = document.getElementById('auth-signed-in');
  const authEmailInput = document.getElementById('authEmail');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpSendStatus = document.getElementById('otp-send-status');
  const otpEmailDisplay = document.getElementById('otp-email-display');
  const otpCodeInput = document.getElementById('otpCode');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const cancelOtpBtn = document.getElementById('cancelOtpBtn');
  const otpVerifyStatus = document.getElementById('otp-verify-status');
  const signedInEmail = document.getElementById('signed-in-email');
  const purchaseStatusText = document.getElementById('purchase-status-text');
  const signOutBtn = document.getElementById('signOutBtn');
  const accountCard = document.getElementById('account-card');

  // --- Preset Elements ---
  const presetsGrid = document.getElementById('presets-grid');
  const presetTemplate = document.getElementById('preset-template');
  
  let appState = {
    presets: [],
    isPro: false,
    email: null
  };
  const maxPresets = 4;

  // --- Dropdown Data ---
  const presetLLMs = [
    { name: "Gemini", url: "https://gemini.google.com/app" },
    { name: "ChatGPT", url: "https://chatgpt.com/" },
    { name: "Claude", url: "https://claude.ai/new" },
    { name: "Grok", url: "https://grok.com/" },
    { name: "Mistral", url: "https://chat.mistral.ai/chat" },
    { name: "DeepSeek", url: "https://chat.deepseek.com/" }
  ];

  const defaultPrompt = `{{content}}`;
  const defaultPromptPreset1 = `You are an expert product analyst and data-driven shopping assistant. Your sole mission is to help me make the best, fastest, and most informed buying decision possible, based only on the raw text data I provide.

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
* The first column must be the Page Name.
* Subsequent columns must be for Price and all other Key Features (e.g., Specs, Size, etc.).
* Crucial Row: Include a "Key Differentiator" row that explains the single most important difference between the products (e.g., "Screen Technology," "Battery Type," "Warranty").

## 3. Pros & Cons Analysis
Create a "Pros & Cons" bulleted list for each product. Each point must be concise and directly related to my stated priorities (Value, Features, Quality).

## 4. Final Verdict
Conclude with this final analysis:
* Best for Price: State which product is the best choice if only the lowest price matters.
* Best for Quality/Features: State which product is the best choice if only the best features and quality matter, regardless of price.
* Missing Information: Explicitly state any key information (like price, warranty, or a key spec) that was not found in the provided text for any page.

---

{{content}}`;

  const defaultPromptPreset2 = `You are a technical data extractor. Convert the unstructured product text into a strict, comparative feature matrix. Ignore subjective opinions.

## 1. Feature Matrix Table
Create a markdown table.
* First Column: Feature/Spec Category (e.g., Price, Dimensions, Battery Life, Materials).
* Subsequent Columns: Product names.
* Populate cells with exact data points. If missing, state "Not Mentioned."

## 2. Objective Advantages
For each product, list 1-2 objective technical superiorities it holds over the others.

---
{{content}}`;

  const defaultPromptPreset3 = `You are an expert consumer matching assistant. Ignore feature parity and focus entirely on the ideal user profile for each product based on the provided text.

## 1. Persona Mapping
For each product, write a "Buy this if you are..." statement detailing the specific type of person or situation it is best suited for.
Write a corresponding "Do NOT buy this if you..." statement.

## 2. The Deciding Question
Provide one single question the buyer should ask themselves to instantly know which product is right for them.

---
{{content}}`;

  const defaultPromptPreset4 = `You are a critical product investigator. Ignore all positive marketing claims and focus exclusively on downside risk, limitations, and potential buyer's remorse.

## 1. The Biggest Flaw
Identify the single biggest weakness, missing feature, or restrictive policy for each product.

## 2. Compatibility & Hidden Costs
List any proprietary accessories required, recurring subscription costs, or known compatibility issues mentioned in the text.

## 3. The Safer Bet
Based strictly on avoiding negative surprises, state which product is the lower-risk purchase and why.

---
{{content}}`;

  const defaultPresets = [
    { name: 'Comparison', url: 'https://gemini.google.com/app', prompt: defaultPromptPreset1 },
    { name: 'Feature Matrix', url: 'https://gemini.google.com/app', prompt: defaultPromptPreset2 },
    { name: 'Use-Case Matcher', url: 'https://gemini.google.com/app', prompt: defaultPromptPreset3 },
    { name: 'The Red Flag Check', url: 'https://gemini.google.com/app', prompt: defaultPromptPreset4 }
  ];

  // --- Monetization Functions ---
  const getOrCreateInstallationId = async () => {
    let { installationId } = await new Promise(resolve => chrome.storage.local.get('installationId', resolve));
    if (!installationId) {
      let { userId } = await new Promise(resolve => chrome.storage.sync.get('userId', resolve));
      installationId = userId || crypto.randomUUID();
      await new Promise(resolve => chrome.storage.local.set({ installationId }, resolve));
    }
    return installationId;
  };

  // --- Auth State Management ---
  let pendingEmail = '';

  function showAuthState(state) {
    authSignedOut.style.display = state === 'signed-out' ? 'block' : 'none';
    authVerifyOtp.style.display = state === 'verify-otp' ? 'block' : 'none';
    authSignedIn.style.display = state === 'signed-in' ? 'block' : 'none';
  }

  function showStatus(element, message, color) {
    element.textContent = message;
    element.style.color = color || '#fff';
    element.style.opacity = '1';
  }

  function hideStatus(element, delay) {
    setTimeout(() => { element.style.opacity = '0'; }, delay || 3000);
  }

  // --- MAIN APP INITIALIZATION ---
  const initializeApp = async () => {
    const email = await getAuthenticatedEmail();

    if (email) {
      const isSessionValid = await validateSession();
      if (!isSessionValid) {
        console.warn('SummaKey Compare: Session invalid or expired. Logging out.');
        await forceLogout();
        await initializeApp(); 
        return;
      }
    }

    chrome.storage.sync.get({ presets: [], pro: false }, async (data) => {
      let needsUpdate = false;

      if (data.presets.length === 0 || data.presets.length < maxPresets) {
        data.presets = JSON.parse(JSON.stringify(defaultPresets));
        needsUpdate = true;
      } else {
        data.presets.forEach((preset, index) => {
          if (index > 0) {
            if (!preset.prompt || preset.prompt === '{{content}}' || !preset.name || preset.name === 'Pros & Cons' || preset.name === 'Value Analysis' || preset.name.startsWith('Preset ')) {
              preset.name = defaultPresets[index].name;
              preset.prompt = defaultPresets[index].prompt;
              needsUpdate = true;
            }
          }
        });
      }

      while (data.presets.length < maxPresets) {
        data.presets.push({ name: defaultPresets[data.presets.length] ? defaultPresets[data.presets.length].name : `Preset ${data.presets.length + 1}`, url: '', prompt: defaultPresets[data.presets.length] ? defaultPresets[data.presets.length].prompt : defaultPrompt });
        needsUpdate = true;
      }

      if (needsUpdate) {
        await new Promise(resolve => chrome.storage.sync.set({ presets: data.presets }, resolve));
      }

      appState.presets = data.presets;

      if (email) {
        const isPro = await checkPurchaseStatus(email);
        appState.isPro = isPro;
        appState.email = email;
        
        await chrome.storage.sync.set({ pro: isPro });

        showSignedInUI(email, isPro);
        renderUI();

        window.addEventListener('focus', async () => {
          const e = await getAuthenticatedEmail();
          if (e) {
            const pro = await checkPurchaseStatus(e);
            if (pro !== appState.isPro) {
              appState.isPro = pro;
              showSignedInUI(e, pro);
              renderUI();
            }
          }
        }, { once: true });
      } else {
        appState.isPro = false;
        appState.email = null;
        showAuthState('signed-out');
        renderUI();
      }
    });
  };

  function showSignedInUI(email, isPro) {
    showAuthState('signed-in');
    signedInEmail.textContent = email;

    if (isPro) {
      purchaseStatusText.textContent = '🎉 SummaKey Compare Pro is active.';
      purchaseStatusText.style.color = 'var(--brand-accent)';
    } else {
      purchaseStatusText.textContent = 'No active pro subscription found.';
      purchaseStatusText.style.color = '#999';
    }
  }

  const renderUI = () => {
    if (upgradeCard) {
      upgradeCard.style.display = appState.isPro ? 'none' : 'flex';
    }
    if (accountCard) {
      accountCard.style.display = appState.isPro ? 'none' : 'block';
    }

    presetsGrid.innerHTML = '';
    appState.presets.forEach((preset, index) => {
      const cardElement = createPresetCard(preset, index, appState.isPro);
      presetsGrid.appendChild(cardElement);
    });
  };

  const createPresetCard = (preset, index, isPro) => {
    const card = presetTemplate.content.cloneNode(true).firstElementChild;
    card.dataset.index = index;

    card.querySelector('.preset-number').textContent = index + 1;
    const defaultName = defaultPresets[index] ? defaultPresets[index].name : `Preset ${index + 1}`;
    const nameInput = card.querySelector('.preset-name');
    nameInput.value = preset.name || defaultName;
    nameInput.placeholder = defaultName;

    const promptTextarea = card.querySelector('.promptTemplate');
    const defaultPromptForCard = defaultPresets[index] ? defaultPresets[index].prompt : defaultPrompt;
    promptTextarea.value = preset.prompt || defaultPromptForCard;

    const promptWarning = card.querySelector('.prompt-warning');
    const validatePromptContext = () => {
      if (promptTextarea.value.trim() !== '' && !promptTextarea.value.includes('{{content}}')) {
        promptWarning.style.display = 'block';
      } else {
        promptWarning.style.display = 'none';
      }
    };
    promptTextarea.addEventListener('input', validatePromptContext);
    validatePromptContext();

    const llmSelect = card.querySelector('.llm-select');
    const customUrlLabel = card.querySelector('.custom-url-label');
    const urlInput = card.querySelector('.llmUrl');

    let isCustom = true;

    presetLLMs.forEach(llm => {
      const option = document.createElement('option');
      option.value = llm.url;
      option.textContent = llm.name;
      if (llm.url === preset.url) {
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

    const showCustomFields = (show) => {
      customUrlLabel.style.display = show ? 'block' : 'none';
      urlInput.style.display = show ? 'block' : 'none';
    };

    if (isCustom) {
      if (preset.url) {
        llmSelect.value = 'custom';
        showCustomFields(true);
        urlInput.value = preset.url;
        urlInput.disabled = !isPro;
      } else {
        llmSelect.value = presetLLMs[0].url;
        urlInput.value = presetLLMs[0].url;
        urlInput.disabled = true;
        showCustomFields(false);
      }
    } else {
      llmSelect.value = preset.url;
      urlInput.value = preset.url;
      urlInput.disabled = true;
      showCustomFields(false);
    }

    llmSelect.addEventListener('change', () => {
      if (llmSelect.value === 'custom') {
        showCustomFields(true);
        if (isPro) {
          urlInput.disabled = false;
          urlInput.value = '';
          urlInput.focus();
        } else {
          urlInput.disabled = true;
        }
      } else {
        showCustomFields(false);
        urlInput.value = llmSelect.value;
        urlInput.disabled = true;
        savePreset(index);
      }
    });

    urlInput.addEventListener('change', () => savePreset(index));
    card.querySelector('.saveSettings').addEventListener('click', () => savePreset(index));
    card.querySelector('.resetPrompt').addEventListener('click', () => {
      if (confirm(`Are you sure you want to reset this card to its default state?`)) {
        clearPreset(index);
      }
    });
    card.querySelector('.clear-preset').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to clear "${card.querySelector('.preset-name').value}"?`)) {
        clearPreset(index);
      }
    });

    const header = card.querySelector('.card-header');
    header.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button') return;
      card.classList.toggle('expanded');
    });

    nameInput.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.add('expanded');
    });

    if (!isPro) {
      if (index === 0) {
        promptTextarea.disabled = true;
        urlInput.disabled = true;
      } else {
        card.classList.add('locked');
        const controls = card.querySelectorAll('input, textarea, button, select');
        controls.forEach(control => control.disabled = true);
        
        const lockIcon = document.createElement('div');
        lockIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: auto; opacity: 0.8;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        lockIcon.style.display = 'flex';
        lockIcon.style.marginLeft = 'auto';

        const header = card.querySelector('.card-header');
        const dropdownIcon = header.querySelector('.dropdown-icon');
        if (dropdownIcon) {
          dropdownIcon.style.display = 'none';
          header.insertBefore(lockIcon, dropdownIcon);
        }
        
        card.querySelector('.clear-preset').disabled = false;
        card.addEventListener('click', (e) => {
          if (e.target.closest('.clear-preset')) return;
          if (upgradeCard) {
            upgradeCard.scrollIntoView({ behavior: 'smooth' });
            upgradeCard.classList.add('expanded');
          }
        });
      }
    }
    updateCardState(card, nameInput.value, urlInput.value, promptTextarea.value, index, isPro);
    return card;
  };

  const savePreset = (index) => {
    const card = presetsGrid.querySelector(`[data-index="${index}"]`);
    if (!card) return;

    const nameInput = card.querySelector('.preset-name');
    const urlInput = card.querySelector('.llmUrl');
    const promptTextarea = card.querySelector('.promptTemplate');

    const urlValue = urlInput.value.trim();
    const isCustomUrl = urlValue && !presetLLMs.some(llm => llm.url === urlValue);

    const performSave = () => {
      let updatedPresets = [...appState.presets];
      updatedPresets[index] = {
        name: nameInput.value.trim(),
        url: urlValue,
        prompt: promptTextarea.value
      };

      chrome.storage.sync.set({ presets: updatedPresets }, () => {
        appState.presets = updatedPresets;
        const statusDiv = card.querySelector('.status');
        if (statusDiv) {
          statusDiv.textContent = `Preset ${index + 1} Saved!`;
          statusDiv.style.opacity = '1';
          setTimeout(() => { statusDiv.style.opacity = '0'; }, 2000);
        }
        updateCardState(card, updatedPresets[index].name, updatedPresets[index].url, updatedPresets[index].prompt, index, appState.isPro);
      });
    };

    if (isCustomUrl) {
      try {
        const urlObj = new URL(urlValue);
        const origin = urlObj.origin + '/*';
        chrome.permissions.request({ origins: [origin] }, (granted) => {
          if (granted) performSave();
          else alert('Permission denied. The extension needs permission to inject the prompt into this custom URL.');
        });
      } catch (e) {
        alert('Invalid URL format. Please enter a valid URL (e.g., https://example.com).');
      }
    } else {
      performSave();
    }
  };

  const clearPreset = (index) => {
    let updatedPresets = [...appState.presets];
    updatedPresets[index] = { name: '', url: '', prompt: '' };
    chrome.storage.sync.set({ presets: updatedPresets }, () => {
      appState.presets = updatedPresets;
      renderUI();
    });
  };

  const updateCardState = (card, name, url, prompt, index, isPro) => {
    if (isPro) {
      card.classList.remove('empty');
      card.classList.add('filled');
      return;
    }
    const defaultNameForIndex = defaultPresets[index] ? defaultPresets[index].name : `Preset ${index + 1}`;
    const isDefaultName = (name === defaultNameForIndex || name === '');
    const defaultPromptForIndex = defaultPresets[index] ? defaultPresets[index].prompt : defaultPrompt;
    const isConfigured = !isDefaultName || (url && url.trim() !== '') || (prompt && prompt.trim() !== '' && prompt !== defaultPromptForIndex);
    if (isConfigured) {
      card.classList.remove('empty');
      card.classList.add('filled');
    } else {
      card.classList.remove('filled');
      card.classList.add('empty');
    }
  };

  // --- Event Listeners ---

  // Hotkey Button
  if (openShortcutsButton) {
    openShortcutsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  // --- Auth Flow Listeners ---

  // Send OTP
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const email = authEmailInput.value.trim();
      if (!email || !email.includes('@')) {
        showStatus(otpSendStatus, 'Please enter a valid email address.', '#ff4444');
        hideStatus(otpSendStatus);
        return;
      }

      sendOtpBtn.textContent = 'Sending...';
      sendOtpBtn.disabled = true;

      try {
        console.log('SummaKey Compare: Attempting OTP send to:', email);
        const { error } = await supabaseClient.auth.signInWithOtp({ email });

        if (error) {
          console.error('SummaKey Compare: Supabase Auth Error:', error);
          throw error;
        }

        console.log('SummaKey Compare: OTP sent successfully');
        pendingEmail = email;
        otpEmailDisplay.textContent = email;
        showAuthState('verify-otp');
        otpCodeInput.focus();
      } catch (err) {
        console.error('SummaKey Compare: Sign in catch-block error details:', {
          message: err.message,
          stack: err.stack,
          full: err
        });
        
        let errorMsg = err.message || 'Error connecting to account system.';
        if (errorMsg.toLowerCase().includes('failed to fetch')) {
          errorMsg = 'Connection failed. Please check your internet or disable adblockers for this extension.';
        }
        
        showStatus(otpSendStatus, errorMsg, '#ff4444');
        hideStatus(otpSendStatus);
      } finally {
        sendOtpBtn.textContent = 'Send Sign-In Code';
        sendOtpBtn.disabled = false;
      }
    });
  }

  // Verify OTP
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const token = otpCodeInput.value.trim();
      if (!token || token.length < 5) {
        showStatus(otpVerifyStatus, 'Please enter the code from your email.', '#ff4444');
        hideStatus(otpVerifyStatus);
        return;
      }

      verifyOtpBtn.textContent = 'Verifying...';
      verifyOtpBtn.disabled = true;

      try {
        // Try type: 'email' first (standard for OTP codes in recent versions)
        let { data, error } = await supabaseClient.auth.verifyOtp({
          email: pendingEmail,
          token: token,
          type: 'email'
        });

        // If 'email' fails, try 'signup' (common if it's the user's first time)
        if (error) {
          console.warn('SummaKey Compare: verification with type "email" failed, trying "signup"...', error.message);
          const signupResult = await supabaseClient.auth.verifyOtp({
            email: pendingEmail,
            token: token,
            type: 'signup'
          });
          data = signupResult.data;
          error = signupResult.error;
        }

        // If that also fails, try 'magiclink' (some older configs use this)
        if (error) {
          console.warn('SummaKey Compare: verification with type "signup" failed, trying "magiclink"...', error.message);
          const magicResult = await supabaseClient.auth.verifyOtp({
            email: pendingEmail,
            token: token,
            type: 'magiclink'
          });
          data = magicResult.data;
          error = magicResult.error;
        }

        if (error) throw error;

        if (data.user) {
          // Auth successful — generate session token
          await createSessionToken(data.user.id, data.user.email);
          // Store email locally for quick access
          await chrome.storage.local.set({ userEmail: data.user.email });

          // Re-initialize app to refresh all UI states from Supabase
          await initializeApp();

          // Clear OTP input
          otpCodeInput.value = '';
          pendingEmail = '';
        }
      } catch (err) {
        console.error('SummaKey Compare: OTP verify error:', err);
        showStatus(otpVerifyStatus, err.message || 'Invalid code. Please try again.', '#ff4444');
        hideStatus(otpVerifyStatus);
      } finally {
        verifyOtpBtn.textContent = 'Verify Code';
        verifyOtpBtn.disabled = false;
      }
    });
  }

  // Cancel OTP
  if (cancelOtpBtn) {
    cancelOtpBtn.addEventListener('click', () => {
      showAuthState('signed-out');
      otpCodeInput.value = '';
      pendingEmail = '';
    });
  }

  // Sign Out
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.textContent = 'Signing out...';
      signOutBtn.disabled = true;

      try {
        await forceLogout();
        await initializeApp();
      } catch (err) {
        console.error('SummaKey Compare: Sign out error:', err);
      } finally {
        signOutBtn.textContent = 'Sign Out';
        signOutBtn.disabled = false;
      }
    });
  }

  if (upgradeButton) {
    upgradeButton.addEventListener('click', async () => {
      upgradeButton.textContent = 'Verifying...';
      upgradeButton.disabled = true;
      try {
        const installationId = await getOrCreateInstallationId();
        
        // --- ADDED SUPPORT FOR MONTHLY/YEARLY BILLING INTERVAL ---
        const intervalRadios = document.getElementsByName('compareBillingInterval');
        let selectedInterval = 'yearly'; // default
        for (const radio of intervalRadios) {
          if (radio.checked) {
            selectedInterval = radio.value;
            break;
          }
        }

        // Get email from auth state if available
        const email = await getAuthenticatedEmail();

        const response = await fetch('https://summakey-backend.vercel.app/api/stripe-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: installationId, 
            product: 'compare',
            interval: selectedInterval,
            email: await getAuthenticatedEmail() || undefined,
            source: 'extension'
          })
        });
        const data = await response.json();
        if (data.url) {
          chrome.tabs.create({ url: data.url });
        } else {
          throw new Error(data.error || 'Failed to get checkout URL');
        }
      } catch (error) {
        console.error('--- Error specifically in checkout flow ---');
        console.error(error);
        alert(`An error occurred: ${error.message}\n\nPlease check the console and try again.`);
      } finally {
        upgradeButton.textContent = 'Unlock Now';
        upgradeButton.disabled = false;
      }

      // Add focus listener after opening checkout
      window.addEventListener('focus', () => {
        initializeApp();
      }, { once: true });
    });
  }

    if (restorePurchaseLink) {
      restorePurchaseLink.addEventListener('click', async (e) => {
        e.preventDefault();
        restorePurchaseLink.textContent = 'Verifying...';
        
        const email = await getAuthenticatedEmail();
        if (email) {
          await checkPurchaseStatus(email, true);
        }
        await initializeApp();
        
        restorePurchaseLink.textContent = 'Restore Purchase';
        alert("Account status refreshed. If you just purchased, it may take a moment to reflect.");
      });
    }

  // --- Billing toggle styling ---
  const billingOptions = document.querySelectorAll('.billing-option');
  billingOptions.forEach(option => {
    const radio = option.querySelector('input[type="radio"]');
    radio.addEventListener('change', () => {
      billingOptions.forEach(opt => opt.classList.remove('selected'));
      if (radio.checked) {
        option.classList.add('selected');
      }
    });
  });

  // --- Card Expansion Logic ---
  [
    { card: document.querySelector('.hotkey-card'), header: document.querySelector('.hotkey-card h2') },
    { card: document.querySelector('.upgrade-card'), header: document.querySelector('.upgrade-card h2') },
    { card: document.querySelector('.account-card'), header: document.querySelector('.account-card h2') },
    { card: document.querySelector('.compliance-card'), header: document.querySelector('.compliance-card h2') }
  ].forEach(item => {
    if (item.card && item.header) {
      item.header.addEventListener('click', () => {
        item.card.classList.toggle('expanded');
      });
    }
  });

  // --- Compliance ---
  const complianceToggle = document.getElementById('allowAnalytics');
  if (complianceToggle) {
    // Load state
    chrome.storage.local.get({ allowAnalytics: true }, (data) => {
      complianceToggle.checked = data.allowAnalytics;
    });

    // Save state
    complianceToggle.addEventListener('change', () => {
      const isAllowed = complianceToggle.checked;
      chrome.storage.local.set({ allowAnalytics: isAllowed }, () => {
        console.log('SummaKey Compare: allowAnalytics set to:', isAllowed);
      });
    });
  }

  // --- Start the app ---
  initializeApp();
});
