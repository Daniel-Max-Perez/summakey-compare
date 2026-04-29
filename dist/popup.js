document.addEventListener('DOMContentLoaded', () => {
  const LOG_PREFIX = 'SummaKey Popup';
  console.log(`${LOG_PREFIX}: Initializing...`);

  // --- Privacy Consent Check (App-wide block) ---
  chrome.storage.sync.get(['hasConsented'], (data) => {
    if (!data.hasConsented) {
      console.log(`${LOG_PREFIX}: Consent not found, showing setup screen.`);
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; box-sizing: border-box; text-align: center;">
          <img src="icons/icon48.png" alt="Logo" style="width: 48px; height: 48px; margin-bottom: 20px;">
          <h2 style="font-size: 18px; color: #fff; margin: 0 0 12px 0; font-family: 'Outfit', sans-serif;">Setup Required</h2>
          <p style="color: #A0A0A0; margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; font-family: 'Outfit', sans-serif;">Review our privacy policy to start using SummaKey Compare.</p>
          <button id="force-setup-btn" class="button primary green" style="width: 100%; font-family: 'Outfit', sans-serif;">Complete Setup</button>
        </div>
      `;

      document.getElementById('force-setup-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('get-started.html') });
        window.close();
      });
      return;
    }

    initializeStandardApp();
  });

  function initializeStandardApp() {
    const countEl = document.getElementById('product-count');
    const addBtn = document.getElementById('add-button');
    const presetList = document.getElementById('preset-list');
    const clearLastBtn = document.getElementById('clear-last-button');
    const clearAllBtn = document.getElementById('clear-all-button');
    const optionsLink = document.getElementById('open-options');
    const authBanner = document.getElementById('auth-banner');

    let currentCount = 0;
    let currentLimit = 2;

    function updateCountUI(count, limit) {
      countEl.innerHTML = `${count}<span>/${limit}</span>`;
    }

    // Optimistically load from storage first to avoid showing 0/2 while waiting
    loadFromStorage();

    // Check auth & purchase state from background
    chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
      console.log(`${LOG_PREFIX}: Auth state:`, response);
      if (chrome.runtime.lastError) {
        console.warn(`${LOG_PREFIX}: Message error:`, chrome.runtime.lastError);
        // loadFromStorage(); // already loaded above
        return;
      }

      if (response && response.email) {
        currentLimit = response.isPro ? 10 : 2;
        chrome.storage.sync.set({ pro: response.isPro });
        if (authBanner) authBanner.style.display = 'none';
      } else {
        currentLimit = 2;
        chrome.storage.sync.set({ pro: false });
        if (authBanner) authBanner.style.display = 'block';
      }

      // Load product count
      chrome.storage.local.get(['scrapedProducts'], (data) => {
        currentCount = data.scrapedProducts ? data.scrapedProducts.length : 0;
        updateCountUI(currentCount, currentLimit);
      });
    });

    function loadFromStorage() {
      chrome.storage.sync.get(['pro'], (proData) => {
        chrome.storage.local.get(['scrapedProducts'], (data) => {
          currentCount = data.scrapedProducts ? data.scrapedProducts.length : 0;
          currentLimit = proData.pro ? 10 : 2;
          updateCountUI(currentCount, currentLimit);
        });
      });
    }

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.scrapedProducts) {
        currentCount = changes.scrapedProducts.newValue ? changes.scrapedProducts.newValue.length : 0;
        updateCountUI(currentCount, currentLimit);
      }
    });

    // Add listeners
    addBtn.addEventListener('click', () => {
      if (addBtn.classList.contains('loading')) return;
      
      addBtn.classList.add('loading');
      addBtn.querySelector('.btn-text').textContent = 'Analyzing...';
      addBtn.disabled = true;

      // Add a 10s frontend timeout in case background hangs
      const timeoutId = setTimeout(() => {
        addBtn.classList.remove('loading');
        addBtn.querySelector('.btn-text').textContent = 'Add Current Page';
        addBtn.disabled = false;
        alert('Action timed out. Please refresh the page and try again.');
      }, 25000);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        chrome.runtime.sendMessage({ action: 'scrapeCurrentPage', tab: activeTab }, (response) => {
          clearTimeout(timeoutId);
          addBtn.classList.remove('loading');
          addBtn.querySelector('.btn-text').textContent = 'Add Current Page';
          addBtn.disabled = false;

          if (response && response.status === 'scraped') {
            console.log(`${LOG_PREFIX}: Scrape successful.`);
            setTimeout(() => window.close(), 400);
          } else {
            const errMsg = (response && response.message) || 'Communication error with background script.';
            console.error(`${LOG_PREFIX}: Scrape failed:`, errMsg);
            alert(`Error: ${errMsg}`);
          }
        });
      });
    });

    chrome.storage.sync.get({ presets: [], pro: false }, (data) => {
      if (presetList) {
        let presetsToShow = data.presets;
        
        if (!presetsToShow || presetsToShow.length < 4) {
          presetsToShow = [];
          for (let i = 0; i < 4; i++) {
            presetsToShow.push({
              name: i === 0 ? 'Comparison' : `Preset ${i + 1}`
            });
          }
        }

        presetsToShow.forEach((preset, index) => {
          const li = document.createElement('li');
          li.className = 'preset-item';
          const isLocked = (index > 0 && !data.pro);
          
          li.innerHTML = `
            <div class="preset-number">${index + 1}</div>
            <div class="preset-name">${preset.name || `Preset ${index + 1}`}</div>
            ${isLocked ? '<svg class="lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: auto; opacity: 0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : ''}
          `;

          if (isLocked) {
            li.classList.add('locked');
            li.addEventListener('click', () => {
              chrome.runtime.openOptionsPage();
              window.close();
            });
          } else {
            li.addEventListener('click', (e) => {
              e.preventDefault();
              if (currentCount === 0) {
                alert('Please add at least one page to compare.');
                return;
              }
              li.style.opacity = '0.5'; // Simple visual feedback
              chrome.runtime.sendMessage({
                action: 'compareProducts',
                presetIndex: index
              }, () => {
                setTimeout(() => window.close(), 100);
              });
            });
          }

          presetList.appendChild(li);
        });
      }
    });

    clearLastBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'clearLastProduct' }, () => {
        // storage listener will update UI
      });
    });

    clearAllBtn.addEventListener('click', () => {
      if (confirm('Clear all pages from your comparison list?')) {
        chrome.runtime.sendMessage({ action: 'clearList' }, (response) => {
          if (response && response.status === 'cleared') {
             updateCountUI(0, currentLimit);
          }
        });
      }
    });

    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
      window.close();
    });

    const signInLink = document.getElementById('popup-sign-in-link');
    if (signInLink) {
      signInLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close();
      });
    }
  }
});
