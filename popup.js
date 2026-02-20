document.addEventListener('DOMContentLoaded', () => {
  const countEl = document.getElementById('product-count');
  const addBtn = document.getElementById('add-button');
  const compareBtn = document.getElementById('compare-button');
  const clearLastBtn = document.getElementById('clear-last-button');
  const clearAllBtn = document.getElementById('clear-all-button');
  const optionsLink = document.getElementById('open-options');

  let currentCount = 0;
  let currentLimit = 2;

  // Update count on load
  chrome.storage.sync.get(['pro'], (proData) => {
    chrome.storage.local.get(['scrapedProducts'], (data) => {
      currentCount = data.scrapedProducts ? data.scrapedProducts.length : 0;
      currentLimit = proData.pro ? 10 : 2;
      countEl.innerHTML = `${currentCount}<span>/${currentLimit}</span>`;
    });
    const connectAccountLink = document.getElementById('connect-account');
    if (connectAccountLink) {
      connectAccountLink.style.display = proData.pro ? 'none' : 'block';
    }
  });

  // Listen for storage changes to update count in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // Listen to both sync (for pro changes) and local (for scrapedProducts changes)
    if (areaName === 'local' && changes.scrapedProducts) {
      chrome.storage.sync.get(['pro'], (data) => {
        currentCount = changes.scrapedProducts.newValue ? changes.scrapedProducts.newValue.length : 0;
        currentLimit = data.pro ? 10 : 2;
        countEl.innerHTML = `${currentCount}<span>/${currentLimit}</span>`;
      });
    } else if (areaName === 'sync' && changes.pro) {
      // Update limit if pro status changes
      chrome.storage.local.get(['scrapedProducts'], (data) => {
        currentCount = data.scrapedProducts ? data.scrapedProducts.length : 0;
        currentLimit = changes.pro.newValue ? 10 : 2;
        countEl.innerHTML = `${currentCount}<span>/${currentLimit}</span>`;
      });
      const connectAccountLink = document.getElementById('connect-account');
      if (connectAccountLink) {
        connectAccountLink.style.display = changes.pro.newValue ? 'none' : 'block';
      }
    }
  });

  // Add listeners
  addBtn.addEventListener('click', () => {
    addBtn.textContent = 'Adding...';
    chrome.runtime.sendMessage({ action: 'scrapeCurrentPage' }, (response) => {
      if (response && response.status === 'scraped') {
        // Success - the count will update via storage listener
        setTimeout(() => window.close(), 500);
      } else {
        // Error or no response
        addBtn.textContent = 'Add Current Page';
        if (response && response.message) {
          alert(`Error: ${response.message}`);
        }
      }
    });
  });

  compareBtn.addEventListener('click', () => {
    compareBtn.textContent = 'Comparing...';
    chrome.runtime.sendMessage({ action: 'compareProducts' }, () => window.close());
  });

  clearLastBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearLastProduct' }, () => {
      // Optimistically update UI
      currentCount = Math.max(0, currentCount - 1);
      countEl.innerHTML = `${currentCount}<span>/${currentLimit}</span>`;
      window.close();
    });
  });

  clearAllBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearList' }, () => {
      countEl.innerHTML = `0<span>/${currentLimit}</span>`; // Optimistically update UI
      window.close();
    });
  });

  const connectAccountLink = document.getElementById('connect-account');

  if (connectAccountLink) {
    connectAccountLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.storage.sync.get('userId', (data) => {
        if (data.userId) {
          chrome.tabs.create({ url: `https://summakey.com/auth?app=shopper&id=${data.userId}` });
          window.close();
        } else {
          // Fallback if userId isn't generated yet
          chrome.runtime.openOptionsPage();
          window.close();
        }
      });
    });
  }

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
