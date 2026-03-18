document.addEventListener('DOMContentLoaded', () => {
  const consentCheckbox = document.getElementById('privacy-consent');
  const setupContent = document.getElementById('setup-content');
  const watchButton = document.getElementById('watchVideo');
  const optionsLink = document.getElementById('openOptionsPage');

  function enableSetup(instant = false) {
    if (instant) {
      setupContent.style.transition = 'none';
    }
    setupContent.classList.remove('disabled-section');
    setupContent.style.opacity = 1;
    setupContent.style.pointerEvents = 'auto';
    setupContent.style.userSelect = 'auto';
    
    if (instant) {
      setTimeout(() => {
        setupContent.style.transition = '';
      }, 50);
    }
  }

  function disableSetup() {
    setupContent.classList.add('disabled-section');
    setupContent.style.opacity = 0.25;
    setupContent.style.pointerEvents = 'none';
    setupContent.style.userSelect = 'none';
  }

  // Check initial state
  chrome.storage.sync.get('hasConsented', (data) => {
    if (data.hasConsented) {
      consentCheckbox.checked = true;
      enableSetup(true);
    }
  });

  consentCheckbox.addEventListener('change', () => {
    const hasConsented = consentCheckbox.checked;
    chrome.storage.sync.set({ hasConsented }, () => {
      if (hasConsented) {
        enableSetup();
      } else {
        disableSetup();
      }
    });
  });

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
