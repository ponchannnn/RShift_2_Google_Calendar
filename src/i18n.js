document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const message = chrome.i18n.getMessage(elem.getAttribute('data-i18n'));
      if (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA') {
        elem.placeholder = message;
      } else {
        elem.textContent = message;
      }
    });
  });