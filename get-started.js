document.addEventListener('DOMContentLoaded', () => {
  // Get all the elements
  const consentCheckbox = document.getElementById('privacy-consent');
  const setupContent = document.getElementById('setup-content');
  const watchButton = document.getElementById('watchVideo');
  const optionsLink = document.getElementById('openOptionsPage');

  // Function to enable the rest of the page
  function enableSetup() {
    setupContent.style.opacity = 1;
    setupContent.style.pointerEvents = 'auto';
    setupContent.style.userSelect = 'auto';
  }

  // Check storage to see if they already consented
  chrome.storage.sync.get('hasConsented', (data) => {
    if (data.hasConsented) {
      enableSetup();
      consentCheckbox.checked = true;
    }
  });

  // Listen for the checkbox to be clicked
  consentCheckbox.addEventListener('change', () => {
    if (consentCheckbox.checked) {
      // Save their consent and enable the UI
      chrome.storage.sync.set({ hasConsented: true }, () => {
        enableSetup();
      });
    } else {
      // (Optional) Re-disable if they uncheck, though not strictly necessary
      chrome.storage.sync.set({ hasConsented: false }, () => {
        setupContent.style.opacity = 0.3;
        setupContent.style.pointerEvents = 'none';
        setupContent.style.userSelect = 'none';
      });
    }
  });

  // --- Other Button Listeners ---
  if (watchButton) {
    watchButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://summakey.com/get-started-shopper' });
    });
  }

  if (optionsLink) {
    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }

});
