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

  // --- Prompt Card Elements ---
  const freePromptCard = document.getElementById('free-prompt-card');
  const proPromptCard = document.getElementById('pro-prompt-card');
  const saveButton = document.getElementById('save-prompt');
  const proTextarea = document.getElementById('pro-prompt-textarea');
  const freeTextarea = document.getElementById('free-prompt-textarea');
  const saveStatus = document.getElementById('save-status');
  const promptWarning = document.getElementById('prompt-warning');

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
  const DEFAULT_COMPARE_PROMPT = `You are an expert product analyst and data-driven shopping assistant. Your sole mission is to help me make the best, fastest, and most informed buying decision possible, based only on the raw text data I provide.

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
    // 1. Check if user is authenticated via Supabase
    const email = await getAuthenticatedEmail();

    // 2. Validate session if email is present
    if (email) {
      const isSessionValid = await validateSession();
      if (!isSessionValid) {
        console.warn('SummaKey Compare: Session invalid or expired. Logging out.');
        await forceLogout();
        await initializeApp(); // Re-init as signed out
        return;
      }
    }

    if (email) {
      // User is signed in — check purchase status
      const isPro = await checkPurchaseStatus(email);
      showSignedInUI(email, isPro);
      updateUIForProStatus(isPro);
      setupDestinationDropdown(isPro);
      setupPromptCards(isPro);
    } else {
      // Not signed in — show sign-in UI
      showAuthState('signed-out');
      updateUIForProStatus(false);
      setupDestinationDropdown(false);
      setupPromptCards(false);
    }
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

  const updateUIForProStatus = (isPro) => {
    if (isPro) {
      if (upgradeCard) {
        upgradeCard.style.display = 'none';
      }
    } else {
      if (upgradeCard) {
        upgradeCard.style.display = 'block';
      }
      if (accountCard) {
        accountCard.style.display = 'block';
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

    // Clear existing options before adding (prevents duplicates on re-init)
    llmSelect.innerHTML = '';
    
    // Check if the current destinationUrl is one of the presets
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

    if (isCustom && destinationUrl !== undefined) {
      llmSelect.value = 'custom';
      urlInput.style.display = 'block';
      customUrlLabel.style.display = 'block';
      urlInput.value = destinationUrl;
      if (!isPro) urlInput.disabled = true;
    } else if (!isCustom) {
      urlInput.value = destinationUrl || presetLLMs[0].url;
      urlInput.style.display = 'none';
      customUrlLabel.style.display = 'none';
    } else {
      // First time initialization
      llmSelect.value = presetLLMs[0].url;
      urlInput.value = presetLLMs[0].url;
      saveDestinationUrl(presetLLMs[0].url);
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
      freeTextarea.value = DEFAULT_COMPARE_PROMPT;
    }
  };

  const loadCustomPrompt = async () => {
    const { proPrompt } = await chrome.storage.sync.get('proPrompt');
    if (proPrompt) {
      proTextarea.value = proPrompt;
    } else {
      proTextarea.value = DEFAULT_COMPARE_PROMPT;
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
      
      if (!newPrompt.includes('{{content}}')) {
        promptWarning.textContent = 'Warning: You should use {{content}} in your prompt or the AI won\'t receive the page content.';
        promptWarning.style.display = 'block';
        promptWarning.style.opacity = '1';
        return;
      }

      // Hide warning if it was showing
      promptWarning.style.display = 'none';
      promptWarning.style.opacity = '0';

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
