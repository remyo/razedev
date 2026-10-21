(() => {
  'use strict';
  const assetsUrl = new URL('.', document.currentScript.src);
  const screens = {
    products: {image: 'home.png', title: 'The right price, right there.', text: "Browse by category, search by name, or scan a barcode. Your store's product prices are always close at hand.", alt: 'The Raze Store product catalog, shown with sample products and prices'},
    checkout: {image: 'checkout.png', title: 'A clear total. The right change.', text: 'Adjust quantities, enter the cash received, and keep checkout moving. Complete a sale when everything is ready.', alt: 'Raze Store checkout with sample cart items, total, cash, and change'},
    gcash: {image: 'gcash.png', title: 'GCash records, kept separate.', text: 'Record cash-in and cash-out details and service charges. These are your manual records—not payment verification or a transfer service.', alt: 'Raze Store GCash service history with demonstration transactions'},
    sales: {image: 'sales.png', title: 'Look back without the guesswork.', text: 'Browse completed sales and filter your history by date. Keep the details of the day close at hand.', alt: 'Raze Store sales history showing sample daily sales'},
    receipts: {image: 'receipt.png', title: 'A little proof of the purchase.', text: 'Give your buyer an itemized receipt. Preview it, save a copy, or share it from the app when requested.', alt: 'An itemized Raze Store receipt containing only demonstration purchase data'},
  };
  const tabs = Array.from(document.querySelectorAll('[data-screen]'));
  const screen = document.querySelector('#app-screen');
  const panel = document.querySelector('#screen-panel');
  const zoom = document.querySelector('[data-open-screen]');
  const dialog = document.querySelector('#screen-dialog');
  if (!tabs.length || !screen || !panel || !zoom || !dialog) return;
  let current = 'products';
  function select(key, focus = false) {
    const entry = screens[key];
    if (!entry) return;
    current = key;
    for (const tab of tabs) {
      const selected = tab.dataset.screen === key;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        tab.focus({preventScroll: true});
        tab.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
      }
    }
    screen.src = new URL(`screenshots/${entry.image}`, assetsUrl).href;
    screen.alt = entry.alt;
    document.querySelector('#screen-title').textContent = entry.title;
    document.querySelector('#screen-description').textContent = entry.text;
    panel.setAttribute('aria-labelledby', `tab-${key}`);
    zoom.setAttribute('aria-label', `Enlarge ${tabs.find(tab => tab.dataset.screen === key).textContent.replace(/\d+|↗/g, '').trim().toLowerCase()} screenshot`);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.dataset.screen));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next].dataset.screen, true);
    });
  });
  zoom.addEventListener('click', () => {
    const entry = screens[current];
    const image = document.querySelector('#dialog-image');
    image.src = new URL(`screenshots/${entry.image}`, assetsUrl).href;
    image.alt = entry.alt;
    document.querySelector('#dialog-title').textContent = entry.title;
    if (typeof dialog.showModal !== 'function') {window.location.assign(image.src); return;}
    dialog.showModal();
    document.body.classList.add('dialog-open');
  });
  document.querySelector('[data-close-screen]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});
  dialog.addEventListener('close', () => {document.body.classList.remove('dialog-open'); zoom.focus({preventScroll: true});});
})();
