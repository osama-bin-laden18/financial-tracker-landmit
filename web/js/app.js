(function (global) {
  'use strict';

  const F = global.Formatters;
  const Api = global.Api;
  const C = global.Components;

  const state = {
    tab: 'dashboard', // 'dashboard' | 'input' | 'history' | 'savings'
    monthly: null,
    savings: null,
    loading: false,
    form: {
      mode: 'expense',
      amount: 0,
      date: F.todayISO(),
      category: 'Pangan',
      incomeCategory: 'Gaji',
      classification: 'Kebutuhan',
      owner: 'Olan',
      incomeOwner: '',
      wallet: 'BCA (Olan)',
      fromWallet: 'BRI',
      toWallet: 'BCA (Olan)',
      adminFee: 0,
      notes: '',
      transferNotes: 'distribusi duit',
      submitting: false
    },
    history: {
      subTab: 'tx',
      search: '',
      filter: 'all'
    }
  };

  // DOM refs
  const mainEl = document.getElementById('mainContent');
  const monthSelectEl = document.getElementById('monthSelect');
  const headerSubtitleEl = document.getElementById('headerSubtitle');
  const demoBannerEl = document.getElementById('demoBanner');
  const refreshBtn = document.getElementById('refreshBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const openSetupFromBanner = document.getElementById('openSetupFromBanner');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalSheet = document.getElementById('modalSheet');
  const toastEl = document.getElementById('toast');

  let toastTimer = null;
  function showToast(msg, type) {
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2800);
  }

  function syncFormDefaults() {
    const cfg = Api.getSettings();
    state.form.owner = cfg.defaultOwner || 'Olan';
    if (state.monthly && state.monthly.options) {
      const opts = state.monthly.options;
      if (opts.expenseCategories.length && !opts.expenseCategories.includes(state.form.category)) {
        state.form.category = opts.expenseCategories[0];
      }
      if (opts.incomeCategories.length && !opts.incomeCategories.includes(state.form.incomeCategory)) {
        state.form.incomeCategory = opts.incomeCategories[0];
      }
      if (opts.wallets.length && !opts.wallets.includes(state.form.wallet)) {
        // Pilih wallet sesuai profil default (Olan/Mitry) jika ada
        const preferred = opts.wallets.find((w) => w.toLowerCase().includes((cfg.defaultOwner || '').toLowerCase()));
        state.form.wallet = preferred || opts.wallets[0];
      }
      if (opts.wallets.length >= 2) {
        if (!opts.wallets.includes(state.form.fromWallet)) state.form.fromWallet = opts.wallets[0];
        if (!opts.wallets.includes(state.form.toWallet) || state.form.toWallet === state.form.fromWallet) {
          state.form.toWallet = opts.wallets.find((w) => w !== state.form.fromWallet) || opts.wallets[1];
        }
      }
    }
  }

  function renderHeader() {
    const cfg = Api.getSettings();
    demoBannerEl.classList.toggle('hidden', !cfg.demoMode);

    if (state.monthly) {
      const months = state.monthly.months || [];
      monthSelectEl.innerHTML = months.map((m) =>
        `<option value="${F.escapeHtml(m)}" ${m === state.monthly.activeMonth ? 'selected' : ''}>${F.escapeHtml(m)}</option>`
      ).join('');
      headerSubtitleEl.textContent = (cfg.demoMode ? 'Demo • ' : 'Live Sheets • ') + (cfg.defaultOwner || 'Bersama');
    } else {
      headerSubtitleEl.textContent = cfg.demoMode ? 'Mode Demo' : 'Menghubungkan...';
    }
  }

  function renderActiveTab() {
    document.querySelectorAll('.tab-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });

    if (state.tab === 'savings') {
      mainEl.innerHTML = C.renderSavings(state.savings);
      bindSavingsEvents();
      return;
    }

    if (!state.monthly) {
      mainEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data Google Sheets...</p></div>';
      return;
    }

    if (state.tab === 'dashboard') {
      mainEl.innerHTML = C.renderDashboard(state.monthly);
    } else if (state.tab === 'input') {
      mainEl.innerHTML = C.renderInputForm(state.monthly, state.form);
      bindInputFormEvents();
    } else if (state.tab === 'history') {
      mainEl.innerHTML = C.renderHistoryAndBills(state.monthly, state.history);
      bindHistoryEvents();
    }
  }

  async function loadMonthly(sheetName, silent) {
    const cfg = Api.getSettings();
    if (!silent) {
      refreshBtn.classList.add('spinning');
      // Tampilkan cache cepat saat live agar terasa instan di iPhone
      if (!cfg.demoMode && !state.monthly) {
        const cached = Api.readCache('bootstrap_' + (sheetName || cfg.activeMonth));
        if (cached) {
          state.monthly = cached;
          syncFormDefaults();
          renderHeader();
          renderActiveTab();
        }
      }
    }
    try {
      const data = await Api.getBootstrap(sheetName);
      state.monthly = data;
      Api.saveSettings({ activeMonth: data.activeMonth });
      syncFormDefaults();
      renderHeader();
      renderActiveTab();
    } catch (err) {
      showToast(err.message || 'Gagal memuat data', 'error');
      if (!state.monthly) {
        mainEl.innerHTML = `
          <div class="card empty-state">
            <p style="margin-top:0;color:var(--red);font-weight:700;">Gagal terhubung ke Google Sheets</p>
            <p style="font-size:13px;">${F.escapeHtml(err.message)}</p>
            <button class="primary-btn" id="retrySettingsBtn">Buka Pengaturan</button>
          </div>
        `;
        const b = document.getElementById('retrySettingsBtn');
        if (b) b.addEventListener('click', openSettingsModal);
      }
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  async function loadSavings(silent) {
    if (!silent) refreshBtn.classList.add('spinning');
    try {
      state.savings = await Api.getSavings();
      if (state.tab === 'savings') renderActiveTab();
    } catch (err) {
      showToast(err.message || 'Gagal memuat tabungan', 'error');
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  // ==========================================================================
  // EVENT BINDINGS PER TAB
  // ==========================================================================

  function bindInputFormEvents() {
    const form = document.getElementById('txForm');
    if (!form) return;

    const amountInput = document.getElementById('amountInput');
    const dateInput = document.getElementById('txDate');
    const notesInput = document.getElementById('txNotes');
    const adminFeeInput = document.getElementById('adminFeeInput');

    amountInput.addEventListener('input', () => {
      state.form.amount = F.parseNumberInput(amountInput.value);
      amountInput.value = state.form.amount ? F.formatNumberInput(state.form.amount) : '';
    });

    dateInput.addEventListener('change', () => {
      state.form.date = dateInput.value || F.todayISO();
    });

    if (notesInput) {
      notesInput.addEventListener('input', () => {
        if (state.form.mode === 'transfer') state.form.transferNotes = notesInput.value;
        else state.form.notes = notesInput.value;
      });
    }

    if (adminFeeInput) {
      adminFeeInput.addEventListener('input', () => {
        state.form.adminFee = F.parseNumberInput(adminFeeInput.value);
        adminFeeInput.value = state.form.adminFee ? F.formatNumberInput(state.form.adminFee) : '';
      });
    }

    form.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.form.mode = btn.dataset.mode;
        renderActiveTab();
      });
    });

    form.querySelectorAll('[data-add-amt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.addAmt, 10);
        state.form.amount = delta === 0 ? 0 : (state.form.amount + delta);
        amountInput.value = state.form.amount ? F.formatNumberInput(state.form.amount) : '';
      });
    });

    form.querySelectorAll('[data-set-fee]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.form.adminFee = parseInt(btn.dataset.setFee, 10);
        if (adminFeeInput) adminFeeInput.value = state.form.adminFee ? F.formatNumberInput(state.form.adminFee) : '';
      });
    });

    form.querySelectorAll('[data-field]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.form[btn.dataset.field] = btn.dataset.val;
        renderActiveTab();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.form.submitting) return;
      if (!state.form.amount || state.form.amount <= 0) {
        showToast('Isi nominal terlebih dahulu.', 'error');
        amountInput.focus();
        return;
      }

      if (state.form.mode === 'transfer' && state.form.fromWallet === state.form.toWallet) {
        showToast('Rekening asal & tujuan tidak boleh sama.', 'error');
        return;
      }

      state.form.submitting = true;
      renderActiveTab();

      try {
        let res;
        if (state.form.mode === 'expense') {
          res = await Api.addExpense({
            sheet: state.monthly.activeMonth,
            date: state.form.date,
            amount: state.form.amount,
            category: state.form.category,
            classification: state.form.classification,
            owner: state.form.owner,
            wallet: state.form.wallet,
            notes: state.form.notes
          });
          showToast('Pengeluaran tersimpan ke Google Sheets!', 'success');
        } else if (state.form.mode === 'income') {
          res = await Api.addIncome({
            sheet: state.monthly.activeMonth,
            date: state.form.date,
            amount: state.form.amount,
            category: state.form.incomeCategory,
            owner: state.form.incomeOwner,
            details: state.form.notes,
            wallet: state.form.wallet
          });
          showToast('Pemasukan tersimpan ke Google Sheets!', 'success');
        } else {
          res = await Api.addTransfer({
            sheet: state.monthly.activeMonth,
            date: state.form.date,
            amount: state.form.amount,
            fromWallet: state.form.fromWallet,
            toWallet: state.form.toWallet,
            adminFee: state.form.adminFee,
            owner: state.form.owner,
            notes: state.form.transferNotes || 'distribusi duit'
          });
          showToast('Transfer 2 baris berhasil dicatat!', 'success');
        }

        if (res && res.bootstrap) {
          state.monthly = res.bootstrap;
        }
        // Reset nominal & notes setelah sukses
        state.form.amount = 0;
        state.form.notes = '';
        state.form.adminFee = 0;
        state.form.submitting = false;
        state.tab = 'dashboard';
        renderHeader();
        renderActiveTab();
      } catch (err) {
        state.form.submitting = false;
        showToast(err.message || 'Gagal menyimpan', 'error');
        renderActiveTab();
      }
    });
  }

  function bindHistoryEvents() {
    mainEl.querySelectorAll('[data-history-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.history.subTab = btn.dataset.historyTab;
        renderActiveTab();
      });
    });

    const searchEl = document.getElementById('txSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        state.history.search = searchEl.value;
        renderActiveTab();
        const nextSearch = document.getElementById('txSearch');
        if (nextSearch) {
          nextSearch.focus();
          nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
        }
      });
    }

    mainEl.querySelectorAll('[data-tx-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.history.filter = btn.dataset.txFilter;
        renderActiveTab();
      });
    });

    mainEl.querySelectorAll('[data-toggle-bill]').forEach((rowEl) => {
      rowEl.addEventListener('click', async () => {
        const rowNum = parseInt(rowEl.dataset.toggleBill, 10);
        const nextChecked = rowEl.dataset.checked !== '1';
        try {
          const res = await Api.toggleMandatory({
            sheet: state.monthly.activeMonth,
            row: rowNum,
            checked: nextChecked
          });
          if (res && res.mandatory) {
            state.monthly.mandatory = res.mandatory;
            renderActiveTab();
            showToast(nextChecked ? 'Tagihan ditandai lunas ✓' : 'Centang tagihan dibatalkan', 'success');
          }
        } catch (err) {
          showToast(err.message || 'Gagal update tagihan', 'error');
        }
      });
    });

    bindDeleteButtons();
  }

  function bindSavingsEvents() {
    const openBtn = document.getElementById('openSavingsFormBtn');
    if (openBtn) {
      openBtn.addEventListener('click', openSavingsModal);
    }
    bindDeleteButtons();
  }

  function bindDeleteButtons() {
    mainEl.querySelectorAll('[data-delete-row]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const scope = btn.dataset.deleteScope;
        const type = btn.dataset.deleteType;
        const row = parseInt(btn.dataset.deleteRow, 10);
        const label = btn.dataset.deleteLabel || 'transaksi ini';

        if (!global.confirm(`Hapus "${label}" dari Google Sheets?\n(Hanya mengosongkan sel data, rumus tetap aman)`)) {
          return;
        }
        try {
          const res = await Api.deleteTransaction({
            scope,
            type,
            row,
            sheet: state.monthly ? state.monthly.activeMonth : ''
          });
          if (scope === 'savings' && res.savings) state.savings = res.savings;
          if (scope === 'monthly' && res.bootstrap) state.monthly = res.bootstrap;
          renderActiveTab();
          showToast('Transaksi berhasil dihapus.', 'success');
        } catch (err) {
          showToast(err.message || 'Gagal menghapus transaksi', 'error');
        }
      });
    });
  }

  // ==========================================================================
  // MODALS
  // ==========================================================================

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalSheet.innerHTML = '';
  }

  function openSettingsModal() {
    const cfg = Api.getSettings();
    modalSheet.innerHTML = C.renderSettingsModal(cfg);
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    modalSheet.querySelectorAll('[data-default-owner]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalSheet.querySelectorAll('[data-default-owner]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('setDefaultOwner').value = btn.dataset.defaultOwner;
      });
    });

    document.getElementById('testConnBtn').addEventListener('click', async () => {
      const apiUrl = document.getElementById('setApiUrl').value.trim();
      const token = document.getElementById('setToken').value.trim();
      if (!apiUrl || !token) {
        showToast('Isi Web App URL dan Token dulu.', 'error');
        return;
      }
      try {
        showToast('Mengetes koneksi...');
        const info = await Api.ping(apiUrl, token);
        showToast(`Terhubung! Sheet: ${info.spreadsheetName} (${info.months.length} bulan)`, 'success');
      } catch (err) {
        showToast(err.message || 'Koneksi gagal', 'error');
      }
    });

    document.getElementById('switchDemoBtn').addEventListener('click', () => {
      const defaultOwner = document.getElementById('setDefaultOwner').value;
      Api.saveSettings({ demoMode: true, defaultOwner });
      closeModal();
      state.monthly = null;
      state.savings = null;
      loadMonthly('');
      showToast('Beralih ke Mode Demo.', 'success');
    });

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const apiUrl = document.getElementById('setApiUrl').value.trim();
      const token = document.getElementById('setToken').value.trim();
      const defaultOwner = document.getElementById('setDefaultOwner').value;
      if (!apiUrl || !token) {
        showToast('Web App URL dan Token wajib diisi untuk mode Live.', 'error');
        return;
      }
      Api.saveSettings({ apiUrl, token, defaultOwner, demoMode: false });
      closeModal();
      state.monthly = null;
      state.savings = null;
      loadMonthly('');
      showToast('Pengaturan tersimpan! Menghubungkan ke Google Sheets...', 'success');
    });
  }

  function openSavingsModal() {
    if (!state.savings) return;
    const cfg = Api.getSettings();
    modalSheet.innerHTML = C.renderSavingsModal(state.savings, cfg.defaultOwner);
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    const amountEl = document.getElementById('savAmount');
    const catSelect = document.getElementById('savCategory');
    const extraEl = document.getElementById('savExpenseExtra');
    const modeInput = document.getElementById('savMode');

    amountEl.addEventListener('input', () => {
      const n = F.parseNumberInput(amountEl.value);
      amountEl.value = n ? F.formatNumberInput(n) : '';
    });

    modalSheet.querySelectorAll('[data-sav-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalSheet.querySelectorAll('[data-sav-mode]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.savMode;
        modeInput.value = mode;
        extraEl.classList.toggle('hidden', mode === 'income');
        const cats = mode === 'income'
          ? state.savings.options.incomeCategories
          : state.savings.options.expenseCategories;
        catSelect.innerHTML = cats.map((c) => `<option value="${F.escapeHtml(c)}">${F.escapeHtml(c)}</option>`).join('');
      });
    });

    document.getElementById('savingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amt = F.parseNumberInput(amountEl.value);
      if (!amt) {
        showToast('Nominal tabungan wajib diisi.', 'error');
        return;
      }
      const btn = document.getElementById('submitSavBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        const mode = modeInput.value;
        const res = await Api.addSavings({
          mode,
          date: document.getElementById('savDate').value,
          amount: amt,
          wallet: document.getElementById('savWallet').value,
          category: catSelect.value,
          classification: mode === 'expense' ? document.getElementById('savClass').value : '',
          owner: mode === 'expense' ? document.getElementById('savOwner').value : '',
          notes: document.getElementById('savNotes').value.trim()
        });
        if (res && res.savings) state.savings = res.savings;
        closeModal();
        renderActiveTab();
        showToast('Transaksi tabungan tersimpan!', 'success');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Simpan ke NEW TABUNGAN';
        showToast(err.message || 'Gagal menyimpan tabungan', 'error');
      }
    });
  }

  // ==========================================================================
  // GLOBAL NAVIGATION & INIT
  // ==========================================================================

  document.querySelectorAll('.tab-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderActiveTab();
      if (state.tab === 'savings' && !state.savings) {
        loadSavings();
      }
    });
  });

  monthSelectEl.addEventListener('change', () => {
    loadMonthly(monthSelectEl.value);
  });

  refreshBtn.addEventListener('click', () => {
    if (state.tab === 'savings') loadSavings();
    else loadMonthly(state.monthly ? state.monthly.activeMonth : '');
  });

  settingsBtn.addEventListener('click', openSettingsModal);
  openSetupFromBanner.addEventListener('click', openSettingsModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Start app
  renderHeader();
  loadMonthly('');
})(window);
