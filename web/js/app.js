(function (global) {
  'use strict';

  const F = global.Formatters;
  const Api = global.Api;
  const C = global.Components;

  let lastAutoDate = F.todayISO();
  let lastSyncAt = 0;
  const reqSeq = { monthly: 0, savings: 0, compare: 0 };

  const state = {
    tab: 'dashboard', // 'dashboard' | 'compare' | 'input' | 'history' | 'savings'
    monthly: null,
    savings: null,
    compare: null,
    form: {
      mode: 'expense',
      amount: 0,
      amountExpr: '',
      date: lastAutoDate,
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
    },
    compareUi: {
      monthA: '',
      monthB: '',
      includeSavings: true,
      trendMetric: 'TOTAL',
      sort: 'max'
    }
  };

  // DOM refs
  const mainEl = document.getElementById('mainContent');
  const monthSelectEl = document.getElementById('monthSelect');
  const headerSubtitleEl = document.getElementById('headerSubtitle');
  const demoBannerEl = document.getElementById('demoBanner');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeColorMeta = document.getElementById('themeColorMeta');
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
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isDarkActive(themePref) {
    if (themePref === 'dark') return true;
    if (themePref === 'light') return false;
    return Boolean(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyTheme(themePref) {
    const pref = themePref || Api.getSettings().theme || 'auto';
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const dark = isDarkActive(pref);
    if (themeToggleIcon) {
      themeToggleIcon.textContent = dark ? '☀️' : '🌙';
    }
    if (themeToggleBtn) {
      themeToggleBtn.title = dark ? 'Ganti ke Mode Light' : 'Ganti ke Mode Dark';
    }
    // Patch 4: Sinkronkan warna status bar / Dynamic Island iOS
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', dark ? '#000000' : '#F2F2F7');
    }
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

  function syncCompareDefaults() {
    if (!state.compare || !state.compare.months || !state.compare.months.length) return;
    const ms = state.compare.months;
    if (!ms.includes(state.compareUi.monthB)) {
      state.compareUi.monthB = ms[ms.length - 1];
    }
    if (!ms.includes(state.compareUi.monthA)) {
      state.compareUi.monthA = ms[Math.max(0, ms.length - 2)];
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

    if (state.tab === 'compare') {
      mainEl.innerHTML = C.renderCompare(state.compare, state.compareUi);
      bindCompareEvents();
      return;
    }

    if (!state.monthly) {
      mainEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data Google Sheets...</p></div>';
      return;
    }

    if (state.tab === 'dashboard') {
      mainEl.innerHTML = C.renderDashboard(state.monthly);
      bindDashboardEvents();
    } else if (state.tab === 'input') {
      mainEl.innerHTML = C.renderInputForm(state.monthly, state.form);
      bindInputFormEvents();
    } else if (state.tab === 'history') {
      mainEl.innerHTML = C.renderHistoryAndBills(state.monthly, state.history);
      bindHistoryEvents();
    }
  }

  // ==========================================================================
  // OPTIMISTIC LOCAL STATE UPDATES + TRANSFER PAIR HELPER
  // ==========================================================================

  function findTransferPartner(transactions, tx) {
    if (!tx || tx.type !== 'income' || tx.category !== 'Transfer') return null;
    const candidates = (transactions || []).filter((other) =>
      other.type === 'income' &&
      other.category === 'Transfer' &&
      other.row !== tx.row &&
      !other.pending &&
      other.date === tx.date &&
      Number(other.amount) === -Number(tx.amount)
    );
    if (!candidates.length) return null;
    // Prioritaskan baris yang tepat bersebelahan (row ± 1)
    candidates.sort((a, b) => Math.abs(a.row - tx.row) - Math.abs(b.row - tx.row));
    return candidates[0];
  }

  function recalcMonthlySummary(d) {
    d.summary.sisaUang = d.summary.totalPemasukan - d.summary.totalPengeluaran;
    d.summary.totalSaldoRekening = (d.wallets || []).reduce((s, w) => s + (Number(w.balance) || 0), 0);
    d.summary.selisihRekon = d.summary.totalSaldoRekening - d.summary.sisaUang;
    if (d.categorySummary) {
      d.categorySummary.forEach((c) => {
        c.percent = d.summary.totalPengeluaran > 0 ? c.total / d.summary.totalPengeluaran : 0;
      });
    }
    // Patch 4: Hitung ulang persen Kebutuhan / Keinginan saat optimistic update
    if (d.classificationSummary) {
      d.classificationSummary.forEach((cl) => {
        cl.percent = d.summary.totalPengeluaran > 0 ? cl.total / d.summary.totalPengeluaran : 0;
      });
    }
  }

  function applyOptimisticExpense(payload, tempRow) {
    if (!state.monthly) return;
    const d = state.monthly;
    const amt = Number(payload.amount) || 0;
    d.summary.totalPengeluaran += amt;
    const w = (d.wallets || []).find((x) => x.name === payload.wallet);
    if (w) w.balance -= amt;

    const c = (d.categorySummary || []).find((x) => x.category === payload.category);
    if (c) c.total += amt;
    else d.categorySummary.push({ category: payload.category, total: amt, percent: 0 });

    const o = (d.ownerSummary || []).find((x) => x.name === payload.owner);
    if (o) o.total += amt;

    const cl = (d.classificationSummary || []).find((x) => x.name === payload.classification);
    if (cl) cl.total += amt;

    d.transactions.unshift({
      id: 'out-' + tempRow,
      row: tempRow,
      pending: true,
      type: 'expense',
      date: payload.date,
      amount: amt,
      category: payload.category,
      classification: payload.classification,
      owner: payload.owner,
      wallet: payload.wallet,
      notes: payload.notes
    });
    recalcMonthlySummary(d);
    persistMonthlyCache(d);
  }

  function applyOptimisticIncome(payload, tempRow) {
    if (!state.monthly) return;
    const d = state.monthly;
    const amt = Number(payload.amount) || 0;
    d.summary.totalPemasukan += amt;
    const w = (d.wallets || []).find((x) => x.name === payload.wallet);
    if (w) w.balance += amt;

    d.transactions.unshift({
      id: 'in-' + tempRow,
      row: tempRow,
      pending: true,
      type: 'income',
      date: payload.date,
      amount: amt,
      category: payload.category,
      owner: payload.owner,
      wallet: payload.wallet,
      notes: payload.details || '',
      classification: ''
    });
    recalcMonthlySummary(d);
    persistMonthlyCache(d);
  }

  function applyOptimisticTransfer(payload, tempRow) {
    if (!state.monthly) return;
    const d = state.monthly;
    const amt = Number(payload.amount) || 0;
    const fee = Number(payload.adminFee) || 0;
    const wFrom = (d.wallets || []).find((x) => x.name === payload.fromWallet);
    const wTo = (d.wallets || []).find((x) => x.name === payload.toWallet);
    if (wFrom) wFrom.balance -= amt;
    if (wTo) wTo.balance += amt;

    d.transactions.unshift(
      { id: 'in-' + (tempRow + 1), row: tempRow + 1, pending: true, type: 'income', date: payload.date, amount: amt, category: 'Transfer', owner: '', wallet: payload.toWallet, notes: payload.notes, classification: '' },
      { id: 'in-' + tempRow, row: tempRow, pending: true, type: 'income', date: payload.date, amount: -amt, category: 'Transfer', owner: '', wallet: payload.fromWallet, notes: payload.notes, classification: '' }
    );

    if (fee > 0) {
      d.summary.totalPengeluaran += fee;
      if (wFrom) wFrom.balance -= fee;
      d.transactions.unshift({
        id: 'out-' + (tempRow + 500), row: tempRow + 500, pending: true, type: 'expense',
        date: payload.date, amount: fee, category: 'Lain-lain',
        classification: 'Kebutuhan', owner: payload.owner || 'Bersama',
        wallet: payload.fromWallet, notes: 'admin tf'
      });
    }
    recalcMonthlySummary(d);
    persistMonthlyCache(d);
  }

  function applyOptimisticDelete(scope, type, row) {
    if (scope === 'savings' && state.savings) {
      const s = state.savings;
      const idx = s.transactions.findIndex((t) => t.row === row && t.type === type);
      if (idx >= 0) {
        const tx = s.transactions.splice(idx, 1)[0];
        const w = (s.wallets || []).find((x) => x.name === tx.wallet);
        if (tx.type === 'income') { s.summary.totalPemasukan -= tx.amount; if (w) w.balance -= tx.amount; }
        else { s.summary.totalPengeluaran -= tx.amount; if (w) w.balance += tx.amount; }
        s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
        Api.saveCache('savings', s);
      }
      return;
    }
    if (scope === 'monthly' && state.monthly) {
      const d = state.monthly;
      const idx = d.transactions.findIndex((t) => t.row === row && t.type === type);
      if (idx >= 0) {
        const tx = d.transactions.splice(idx, 1)[0];
        const w = (d.wallets || []).find((x) => x.name === tx.wallet);
        if (tx.type === 'income') {
          d.summary.totalPemasukan -= tx.amount;
          if (w) w.balance -= tx.amount;
        } else {
          d.summary.totalPengeluaran -= tx.amount;
          if (w) w.balance += tx.amount;
          const c = (d.categorySummary || []).find((x) => x.category === tx.category);
          if (c) c.total = Math.max(0, c.total - tx.amount);
          const o = (d.ownerSummary || []).find((x) => x.name === tx.owner);
          if (o) o.total = Math.max(0, o.total - tx.amount);
          const cl = (d.classificationSummary || []).find((x) => x.name === tx.classification);
          if (cl) cl.total = Math.max(0, cl.total - tx.amount);
        }
        recalcMonthlySummary(d);
        persistMonthlyCache(d);
      }
    }
  }

  function applyOptimisticEdit(scope, tx, updated) {
    const newAmt = Number(updated.amount) || 0;
    const oldAmt = Number(tx.amount) || 0;
    if (scope === 'savings' && state.savings) {
      const s = state.savings;
      const oldW = (s.wallets || []).find((x) => x.name === tx.wallet);
      const newW = (s.wallets || []).find((x) => x.name === updated.wallet);
      if (tx.type === 'income') {
        s.summary.totalPemasukan += (newAmt - oldAmt);
        if (oldW) oldW.balance -= oldAmt;
        if (newW) newW.balance += newAmt;
      } else {
        s.summary.totalPengeluaran += (newAmt - oldAmt);
        if (oldW) oldW.balance += oldAmt;
        if (newW) newW.balance -= newAmt;
      }
      Object.assign(tx, updated, { amount: newAmt });
      s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
      Api.saveCache('savings', s);
      return;
    }
    if (scope === 'monthly' && state.monthly) {
      const d = state.monthly;
      const oldW = (d.wallets || []).find((x) => x.name === tx.wallet);
      const newW = (d.wallets || []).find((x) => x.name === updated.wallet);
      if (tx.type === 'income') {
        d.summary.totalPemasukan += (newAmt - oldAmt);
        if (oldW) oldW.balance -= oldAmt;
        if (newW) newW.balance += newAmt;
      } else {
        d.summary.totalPengeluaran += (newAmt - oldAmt);
        if (oldW) oldW.balance += oldAmt;
        if (newW) newW.balance -= newAmt;

        const oldC = (d.categorySummary || []).find((x) => x.category === tx.category);
        if (oldC) oldC.total = Math.max(0, oldC.total - oldAmt);
        const newC = (d.categorySummary || []).find((x) => x.category === updated.category);
        if (newC) newC.total += newAmt;
        else d.categorySummary.push({ category: updated.category, total: newAmt, percent: 0 });

        const oldO = (d.ownerSummary || []).find((x) => x.name === tx.owner);
        if (oldO) oldO.total = Math.max(0, oldO.total - oldAmt);
        const newO = (d.ownerSummary || []).find((x) => x.name === updated.owner);
        if (newO) newO.total += newAmt;

        const oldCl = (d.classificationSummary || []).find((x) => x.name === tx.classification);
        if (oldCl) oldCl.total = Math.max(0, oldCl.total - oldAmt);
        const newCl = (d.classificationSummary || []).find((x) => x.name === updated.classification);
        if (newCl) newCl.total += newAmt;
      }
      Object.assign(tx, updated, { amount: newAmt });
      recalcMonthlySummary(d);
      persistMonthlyCache(d);
    }
  }

  function persistMonthlyCache(d) {
    if (!Api.getSettings().demoMode && d && d.activeMonth) {
      Api.saveCache('bootstrap_' + d.activeMonth, d);
      Api.saveCache('last_bootstrap', d);
    }
  }

  // ==========================================================================
  // DATA LOADERS (INSTANT CACHE + RACE-CONDITION GUARD)
  // ==========================================================================

  async function loadMonthly(sheetName, silent) {
    const mySeq = ++reqSeq.monthly;
    const cfg = Api.getSettings();
    if (!silent) {
      refreshBtn.classList.add('spinning');
      if (!cfg.demoMode) {
        const cached = (sheetName && Api.readCache('bootstrap_' + sheetName))
          || (cfg.activeMonth && Api.readCache('bootstrap_' + cfg.activeMonth))
          || Api.readCache('last_bootstrap');
        if (cached && (!sheetName || cached.activeMonth === sheetName)) {
          state.monthly = cached;
          syncFormDefaults();
          renderHeader();
          renderActiveTab();
        }
      }
    }

    try {
      const data = await Api.getBootstrap(sheetName);
      // Patch 3: Abaikan respons lama jika user sudah berpindah ke bulan lain
      if (mySeq !== reqSeq.monthly) return;
      state.monthly = data;
      lastSyncAt = Date.now();
      Api.saveSettings({ activeMonth: data.activeMonth });
      syncFormDefaults();
      renderHeader();
      if (state.tab !== 'input') {
        renderActiveTab();
      }
    } catch (err) {
      if (mySeq !== reqSeq.monthly) return;
      if (!silent) showToast(err.message || 'Gagal memuat data', 'error');
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
      if (mySeq === reqSeq.monthly) {
        refreshBtn.classList.remove('spinning');
      }
    }
  }

  async function loadSavings(silent) {
    const mySeq = ++reqSeq.savings;
    const cfg = Api.getSettings();
    if (!silent) {
      refreshBtn.classList.add('spinning');
      if (!cfg.demoMode && !state.savings) {
        const cached = Api.readCache('savings');
        if (cached) {
          state.savings = cached;
          if (state.tab === 'savings') renderActiveTab();
        }
      }
    }
    try {
      const data = await Api.getSavings();
      if (mySeq !== reqSeq.savings) return;
      state.savings = data;
      if (state.tab === 'savings') renderActiveTab();
    } catch (err) {
      if (mySeq !== reqSeq.savings) return;
      if (!silent) showToast(err.message || 'Gagal memuat tabungan', 'error');
    } finally {
      if (mySeq === reqSeq.savings) refreshBtn.classList.remove('spinning');
    }
  }

  async function loadCompare(forceRefresh, silent) {
    const mySeq = ++reqSeq.compare;
    const cfg = Api.getSettings();
    if (!silent) {
      refreshBtn.classList.add('spinning');
      if (!cfg.demoMode && !state.compare) {
        const cached = Api.readCache('compare_v2');
        if (cached) {
          state.compare = cached;
          syncCompareDefaults();
          if (state.tab === 'compare') renderActiveTab();
        }
      }
    }
    try {
      const data = await Api.getCompare(forceRefresh);
      if (mySeq !== reqSeq.compare) return;
      state.compare = data;
      syncCompareDefaults();
      if (state.tab === 'compare') renderActiveTab();
    } catch (err) {
      if (mySeq !== reqSeq.compare) return;
      if (!silent) {
        const msg = (err.message || '').includes('tidak dikenal: compare')
          ? 'Update Code.gs v2/v3 di Apps Script dulu untuk mengaktifkan grafik Perbandingan.'
          : (err.message || 'Gagal memuat perbandingan');
        showToast(msg, 'error');
        if (state.tab === 'compare' && !state.compare) {
          mainEl.innerHTML = `<div class="card empty-state"><p style="color:var(--red);font-weight:700;margin-top:0;">Perlu Update Code.gs</p><p style="font-size:13px;">${F.escapeHtml(msg)}</p></div>`;
        }
      }
    } finally {
      if (mySeq === reqSeq.compare) refreshBtn.classList.remove('spinning');
    }
  }

  // ==========================================================================
  // EVENT BINDINGS PER TAB
  // ==========================================================================

  function bindDashboardEvents() {
    const privBtn = document.getElementById('privacyToggleBtn');
    if (privBtn) {
      privBtn.addEventListener('click', () => {
        const next = !F.isPrivacyMode();
        F.setPrivacyMode(next);
        Api.saveSettings({ privacyMode: next });
        renderActiveTab();
        showToast(next ? 'Saldo disamarkan 🙈' : 'Saldo ditampilkan 👁️');
      });
    }

    mainEl.querySelectorAll('[data-rekon-wallet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wName = btn.dataset.rekonWallet;
        const bal = Number(btn.dataset.rekonBal) || 0;
        openRekonWalletModal(wName, bal);
      });
    });
  }

  function bindCompareEvents() {
    const selA = document.getElementById('cmpMonthA');
    const selB = document.getElementById('cmpMonthB');
    const swapBtn = document.getElementById('swapCompareBtn');
    const incSav = document.getElementById('cmpIncludeSavings');
    const trendSel = document.getElementById('cmpTrendMetric');

    if (selA) {
      selA.addEventListener('change', () => {
        state.compareUi.monthA = selA.value;
        renderActiveTab();
      });
    }
    if (selB) {
      selB.addEventListener('change', () => {
        state.compareUi.monthB = selB.value;
        renderActiveTab();
      });
    }
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        const tmp = state.compareUi.monthA;
        state.compareUi.monthA = state.compareUi.monthB;
        state.compareUi.monthB = tmp;
        renderActiveTab();
      });
    }
    if (incSav) {
      incSav.addEventListener('change', () => {
        state.compareUi.includeSavings = incSav.checked;
        renderActiveTab();
      });
    }
    if (trendSel) {
      trendSel.addEventListener('change', () => {
        state.compareUi.trendMetric = trendSel.value;
        renderActiveTab();
      });
    }

    mainEl.querySelectorAll('[data-cmp-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.compareUi.sort = btn.dataset.cmpSort;
        renderActiveTab();
      });
    });

    mainEl.querySelectorAll('[data-pick-month]').forEach((g) => {
      g.addEventListener('click', () => {
        const picked = g.dataset.pickMonth;
        if (picked && picked !== state.compareUi.monthB) {
          state.compareUi.monthB = picked;
          renderActiveTab();
          showToast(`Bulan B diubah ke ${picked}`, 'success');
        }
      });
    });
  }

  function bindInputFormEvents() {
    const form = document.getElementById('txForm');
    if (!form) return;

    const amountInput = document.getElementById('amountInput');
    const calcPreview = document.getElementById('calcPreview');
    const dateInput = document.getElementById('txDate');
    const notesInput = document.getElementById('txNotes');
    const adminFeeInput = document.getElementById('adminFeeInput');
    const stayBtn = document.getElementById('submitStayBtn');

    function syncAmountFromRaw(rawStr) {
      const evaluated = F.evaluateAmountExpr(rawStr);
      state.form.amount = evaluated.value;
      state.form.amountExpr = evaluated.display || '';
      amountInput.value = state.form.amountExpr;
      if (calcPreview) {
        calcPreview.textContent = '= ' + F.formatRupiah(evaluated.value, false, true);
        calcPreview.classList.toggle('hidden', !evaluated.isExpression);
      }
    }

    amountInput.addEventListener('input', () => {
      syncAmountFromRaw(amountInput.value);
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

    // Preset 1-tap ("Sering Dipakai")
    const presets = C.buildExpensePresets(state.monthly);
    form.querySelectorAll('[data-preset-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = presets[parseInt(btn.dataset.presetIdx, 10)];
        if (!p) return;
        const opts = state.monthly.options || {};
        if (p.category && (opts.expenseCategories || []).includes(p.category)) state.form.category = p.category;
        if (p.classification) state.form.classification = p.classification;
        if (p.owner && (opts.owners || []).includes(p.owner)) state.form.owner = p.owner;
        if (p.wallet && (opts.wallets || []).includes(p.wallet)) state.form.wallet = p.wallet;
        state.form.notes = p.label;
        if (!state.form.amount && p.lastAmount) {
          state.form.amount = p.lastAmount;
          state.form.amountExpr = F.formatNumberInput(p.lastAmount);
        }
        renderActiveTab();
        showToast(`Preset "${p.label}" diisi ✓`, 'success');
      });
    });

    form.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.form.mode = btn.dataset.mode;
        renderActiveTab();
      });
    });

    form.querySelectorAll('[data-append-op]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.appendOp;
        const cur = (state.form.amountExpr || '').trim();
        if (!cur) return;
        const nextRaw = cur.replace(/[+\-]\s*$/, '') + op;
        syncAmountFromRaw(nextRaw);
        amountInput.focus();
      });
    });

    form.querySelectorAll('[data-add-amt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.addAmt, 10);
        if (delta === 0) {
          syncAmountFromRaw('');
        } else {
          syncAmountFromRaw(String((state.form.amount || 0) + delta));
        }
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

    async function handleSubmitTx(stayOnInput) {
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

      const mode = state.form.mode;
      const activeMonth = state.monthly.activeMonth;
      const snapshot = clone(state.monthly);
      const tempRow = 900 + Math.floor(Math.random() * 80);

      let payload;
      if (mode === 'expense') {
        payload = {
          sheet: activeMonth,
          date: state.form.date,
          amount: state.form.amount,
          category: state.form.category,
          classification: state.form.classification,
          owner: state.form.owner,
          wallet: state.form.wallet,
          notes: state.form.notes
        };
        applyOptimisticExpense(payload, tempRow);
      } else if (mode === 'income') {
        payload = {
          sheet: activeMonth,
          date: state.form.date,
          amount: state.form.amount,
          category: state.form.incomeCategory,
          owner: state.form.incomeOwner,
          details: state.form.notes,
          wallet: state.form.wallet
        };
        applyOptimisticIncome(payload, tempRow);
      } else {
        payload = {
          sheet: activeMonth,
          date: state.form.date,
          amount: state.form.amount,
          fromWallet: state.form.fromWallet,
          toWallet: state.form.toWallet,
          adminFee: state.form.adminFee,
          owner: state.form.owner,
          notes: state.form.transferNotes || 'distribusi duit'
        };
        applyOptimisticTransfer(payload, tempRow);
      }

      // Reset form nominal & notes
      state.form.amount = 0;
      state.form.amountExpr = '';
      state.form.notes = '';
      state.form.adminFee = 0;
      if (!stayOnInput) {
        state.tab = 'dashboard';
      }
      renderHeader();
      renderActiveTab();
      refreshBtn.classList.add('spinning');
      showToast(stayOnInput ? 'Menyimpan... siap catat berikutnya!' : 'Menyimpan ke Google Sheets...');

      try {
        let res;
        if (mode === 'expense') res = await Api.addExpense(payload);
        else if (mode === 'income') res = await Api.addIncome(payload);
        else res = await Api.addTransfer(payload);

        // Patch 1: Segera ganti tempRow -> row asli dari Google Sheets & buka kunci pending
        if (res && res.bootstrap) {
          state.monthly = res.bootstrap;
          persistMonthlyCache(state.monthly);
          if (state.tab !== 'input') renderActiveTab();
        } else {
          if (state.monthly && state.monthly.transactions) {
            if (mode === 'transfer' && res && Array.isArray(res.rows)) {
              const tOut = state.monthly.transactions.find((t) => t.id === 'in-' + tempRow);
              const tIn = state.monthly.transactions.find((t) => t.id === 'in-' + (tempRow + 1));
              if (tOut) { tOut.row = res.rows[0]; tOut.id = 'in-' + res.rows[0]; tOut.pending = false; }
              if (tIn) { tIn.row = res.rows[1]; tIn.id = 'in-' + res.rows[1]; tIn.pending = false; }
              if (res.feeRow) {
                const tFee = state.monthly.transactions.find((t) => t.id === 'out-' + (tempRow + 500));
                if (tFee) { tFee.row = res.feeRow; tFee.id = 'out-' + res.feeRow; tFee.pending = false; }
              }
            } else if (res && res.row) {
              const prefix = mode === 'expense' ? 'out-' : 'in-';
              const target = state.monthly.transactions.find((t) => t.id === prefix + tempRow);
              if (target) {
                target.row = res.row;
                target.id = prefix + res.row;
                target.pending = false;
              }
            }
            persistMonthlyCache(state.monthly);
            if (state.tab === 'history') renderActiveTab();
          }
          state.compare = null;
          loadMonthly(activeMonth, true);
        }
        showToast('Tersimpan di Google Sheets ✓', 'success');
      } catch (err) {
        state.monthly = snapshot;
        persistMonthlyCache(snapshot);
        renderActiveTab();
        showToast('Gagal simpan: ' + (err.message || 'cek koneksi'), 'error');
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmitTx(false);
    });

    if (stayBtn) {
      stayBtn.addEventListener('click', () => handleSubmitTx(true));
    }
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
        const snapshot = clone(state.monthly);

        const item = (state.monthly.mandatory.items || []).find((x) => x.row === rowNum);
        if (item) {
          item.checked = nextChecked;
          state.monthly.mandatory.remaining = state.monthly.mandatory.items
            .filter((x) => !x.checked)
            .reduce((s, x) => s + x.amount, 0);
          persistMonthlyCache(state.monthly);
          renderActiveTab();
        }

        try {
          await Api.toggleMandatory({
            sheet: state.monthly.activeMonth,
            row: rowNum,
            checked: nextChecked
          });
          showToast(nextChecked ? 'Tagihan ditandai lunas ✓' : 'Centang tagihan dibatalkan', 'success');
        } catch (err) {
          state.monthly = snapshot;
          persistMonthlyCache(snapshot);
          renderActiveTab();
          showToast(err.message || 'Gagal update tagihan', 'error');
        }
      });
    });

    bindEditButtons();
    bindDeleteButtons();
  }

  function bindSavingsEvents() {
    const openBtn = document.getElementById('openSavingsFormBtn');
    if (openBtn) {
      openBtn.addEventListener('click', openSavingsModal);
    }
    bindEditButtons();
    bindDeleteButtons();
  }

  function bindEditButtons() {
    mainEl.querySelectorAll('[data-edit-row]').forEach((el) => {
      el.addEventListener('click', () => {
        const scope = el.dataset.editScope;
        const type = el.dataset.editType;
        const row = parseInt(el.dataset.editRow, 10);
        const source = scope === 'savings' ? state.savings : state.monthly;
        if (!source) return;
        const tx = (source.transactions || []).find((t) => t.row === row && t.type === type);
        if (!tx || tx.pending) return;
        openEditTxModal(tx, scope, source.options || {});
      });
    });
  }

  function bindDeleteButtons() {
    mainEl.querySelectorAll('[data-delete-row]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const scope = btn.dataset.deleteScope;
        const type = btn.dataset.deleteType;
        const row = parseInt(btn.dataset.deleteRow, 10);
        const label = btn.dataset.deleteLabel || 'transaksi ini';

        // Patch 5: Deteksi otomatis pasangan Transfer (2 baris) agar Selisih Rekon tetap 0
        let partner = null;
        if (scope === 'monthly' && state.monthly) {
          const tx = (state.monthly.transactions || []).find((t) => t.row === row && t.type === type);
          if (tx) partner = findTransferPartner(state.monthly.transactions, tx);
        }

        const confirmMsg = partner
          ? `Hapus PASANGAN Transfer "${label}" sekaligus (2 baris: baris ${row} & ${partner.row}, melibatkan ${partner.wallet})?\nIni menjaga agar Selisih Rekon tetap Rp 0.`
          : `Hapus "${label}" dari Google Sheets?\n(Hanya mengosongkan sel data, rumus tetap aman)`;

        if (!global.confirm(confirmMsg)) {
          return;
        }

        const snapshotMonthly = state.monthly ? clone(state.monthly) : null;
        const snapshotSavings = state.savings ? clone(state.savings) : null;

        applyOptimisticDelete(scope, type, row);
        if (partner) applyOptimisticDelete(scope, partner.type, partner.row);
        renderActiveTab();
        refreshBtn.classList.add('spinning');

        try {
          const activeSheet = state.monthly ? state.monthly.activeMonth : '';
          await Api.deleteTransaction({ scope, type, row, sheet: activeSheet });
          if (partner) {
            await Api.deleteTransaction({ scope, type: partner.type, row: partner.row, sheet: activeSheet });
          }
          state.compare = null;
          if (scope === 'savings') loadSavings(true);
          else loadMonthly(activeSheet, true);
          showToast(partner ? 'Pasangan Transfer (2 baris) dihapus ✓' : 'Transaksi berhasil dihapus ✓', 'success');
        } catch (err) {
          if (snapshotMonthly) { state.monthly = snapshotMonthly; persistMonthlyCache(snapshotMonthly); }
          if (snapshotSavings) { state.savings = snapshotSavings; Api.saveCache('savings', snapshotSavings); }
          renderActiveTab();
          showToast(err.message || 'Gagal menghapus transaksi', 'error');
        } finally {
          refreshBtn.classList.remove('spinning');
        }
      });
    });
  }

  // ==========================================================================
  // MODALS (SETTINGS, REKON WALLET, EDIT TX, SAVINGS)
  // ==========================================================================

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalSheet.innerHTML = '';
  }

  function openRekonWalletModal(walletName, bookBalance) {
    modalSheet.innerHTML = C.renderRekonWalletModal(walletName, bookBalance);
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    const inputEl = document.getElementById('rekonActualInput');
    const diffArea = document.getElementById('rekonDiffArea');

    function updateDiff() {
      const raw = inputEl.value.trim();
      if (!raw) {
        diffArea.innerHTML = '';
        return;
      }
      const isNeg = raw.startsWith('-');
      const absNum = F.parseNumberInput(raw);
      inputEl.value = (isNeg ? '-' : '') + (absNum ? F.formatNumberInput(absNum) : '');
      const actual = isNeg ? -absNum : absNum;
      const diff = actual - bookBalance;

      if (diff === 0) {
        diffArea.innerHTML = `
          <div class="rekon-diff-box ok">
            <div style="font-weight:800;font-size:15px;">✓ Saldo Cocok 100%!</div>
            <div style="font-size:12px;margin-top:3px;">Tidak ada selisih pada ${F.escapeHtml(walletName)}.</div>
          </div>
        `;
      } else if (diff < 0) {
        const missing = Math.abs(diff);
        diffArea.innerHTML = `
          <div class="rekon-diff-box minus">
            <div style="font-weight:800;font-size:15px;">Selisih Kurang ${F.formatRupiah(missing, false, true)}</div>
            <div style="font-size:12px;margin-top:3px;">Kemungkinan ada pengeluaran yang belum dicatat.</div>
          </div>
          <button type="button" id="rekonFixBtn" class="primary-btn danger">Catat Pengeluaran Selisih (${F.formatRupiah(missing, false, true)})</button>
        `;
        document.getElementById('rekonFixBtn').addEventListener('click', () => {
          state.form.mode = 'expense';
          state.form.wallet = walletName;
          state.form.amount = missing;
          state.form.amountExpr = F.formatNumberInput(missing);
          state.form.category = 'Lain-lain';
          state.form.notes = 'rekon selisih ' + walletName;
          closeModal();
          state.tab = 'input';
          renderActiveTab();
        });
      } else {
        diffArea.innerHTML = `
          <div class="rekon-diff-box plus">
            <div style="font-weight:800;font-size:15px;">Selisih Lebih +${F.formatRupiah(diff, false, true)}</div>
            <div style="font-size:12px;margin-top:3px;">Ada pemasukan / refund yang belum dicatat.</div>
          </div>
          <button type="button" id="rekonFixBtn" class="primary-btn success">Catat Pemasukan Selisih (${F.formatRupiah(diff, false, true)})</button>
        `;
        document.getElementById('rekonFixBtn').addEventListener('click', () => {
          state.form.mode = 'income';
          state.form.wallet = walletName;
          state.form.amount = diff;
          state.form.amountExpr = F.formatNumberInput(diff);
          state.form.incomeCategory = 'Uang Kaget';
          state.form.notes = 'rekon selisih ' + walletName;
          closeModal();
          state.tab = 'input';
          renderActiveTab();
        });
      }
    }

    inputEl.addEventListener('input', updateDiff);
  }

  function openEditTxModal(tx, scope, opts) {
    modalSheet.innerHTML = C.renderEditTxModal(tx, scope, opts);
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    const amtEl = document.getElementById('editAmount');
    const isNegIncome = tx.type === 'income' && Number(tx.amount) < 0;

    amtEl.addEventListener('input', () => {
      const ev = F.evaluateAmountExpr(amtEl.value);
      amtEl.value = ev.display || '';
    });

    document.getElementById('editTxForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ev = F.evaluateAmountExpr(amtEl.value);
      if (!ev.value || ev.value <= 0) {
        showToast('Nominal harus lebih dari 0.', 'error');
        return;
      }

      const finalAmount = isNegIncome ? -ev.value : ev.value;
      const updated = {
        date: document.getElementById('editDate').value,
        amount: finalAmount,
        category: document.getElementById('editCategory').value,
        wallet: document.getElementById('editWallet').value,
        classification: document.getElementById('editClass') ? document.getElementById('editClass').value : (tx.classification || ''),
        owner: document.getElementById('editOwner') ? document.getElementById('editOwner').value : (tx.owner || ''),
        notes: document.getElementById('editNotes').value.trim()
      };

      const snapshotMonthly = state.monthly ? clone(state.monthly) : null;
      const snapshotSavings = state.savings ? clone(state.savings) : null;

      applyOptimisticEdit(scope, tx, updated);
      closeModal();
      renderActiveTab();
      refreshBtn.classList.add('spinning');
      showToast('Menyimpan perubahan...');

      try {
        const activeSheet = state.monthly ? state.monthly.activeMonth : '';
        await Api.updateTransaction(Object.assign({
          scope,
          type: tx.type,
          row: tx.row,
          sheet: activeSheet
        }, updated));
        state.compare = null;
        if (scope === 'savings') loadSavings(true);
        else loadMonthly(activeSheet, true);
        showToast('Transaksi diperbarui ✓', 'success');
      } catch (err) {
        if (snapshotMonthly) { state.monthly = snapshotMonthly; persistMonthlyCache(snapshotMonthly); }
        if (snapshotSavings) { state.savings = snapshotSavings; Api.saveCache('savings', snapshotSavings); }
        renderActiveTab();
        const msg = (err.message || '').includes('updateTransaction')
          ? 'Update Code.gs v3 di Apps Script dulu untuk mengaktifkan fitur Edit.'
          : (err.message || 'Gagal memperbarui transaksi');
        showToast(msg, 'error');
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    });
  }

  function openSettingsModal() {
    const cfg = Api.getSettings();
    modalSheet.innerHTML = C.renderSettingsModal(cfg);
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    modalSheet.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalSheet.querySelectorAll('[data-theme-choice]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const chosen = btn.dataset.themeChoice;
        document.getElementById('setTheme').value = chosen;
        Api.saveSettings({ theme: chosen });
        applyTheme(chosen);
      });
    });

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
        showToast(`Terhubung (${info.version || 'v1'})! ${info.months.length} bulan ditemukan.`, 'success');
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
      state.compare = null;
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
      state.compare = null;
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
      const mode = modeInput.value;
      const payload = {
        mode,
        date: document.getElementById('savDate').value,
        amount: amt,
        wallet: document.getElementById('savWallet').value,
        category: catSelect.value,
        classification: mode === 'expense' ? document.getElementById('savClass').value : '',
        owner: mode === 'expense' ? document.getElementById('savOwner').value : '',
        notes: document.getElementById('savNotes').value.trim()
      };

      const snapshot = clone(state.savings);
      const s = state.savings;
      const tempRow = 900 + Math.floor(Math.random() * 80);
      const w = (s.wallets || []).find((x) => x.name === payload.wallet);
      if (mode === 'income') {
        s.summary.totalPemasukan += amt;
        if (w) w.balance += amt;
        s.transactions.unshift({ id: 'sav-in-' + tempRow, row: tempRow, pending: true, type: 'income', date: payload.date, amount: amt, category: payload.category, wallet: payload.wallet, notes: payload.notes });
      } else {
        s.summary.totalPengeluaran += amt;
        if (w) w.balance -= amt;
        s.transactions.unshift({ id: 'sav-out-' + tempRow, row: tempRow, pending: true, type: 'expense', date: payload.date, amount: amt, category: payload.category, classification: payload.classification, owner: payload.owner, wallet: payload.wallet, notes: payload.notes });
      }
      s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
      Api.saveCache('savings', s);
      closeModal();
      renderActiveTab();
      refreshBtn.classList.add('spinning');
      showToast('Menyimpan ke NEW TABUNGAN...');

      try {
        const res = await Api.addSavings(payload);
        if (res && res.row && state.savings) {
          const prefix = mode === 'income' ? 'sav-in-' : 'sav-out-';
          const target = state.savings.transactions.find((t) => t.id === prefix + tempRow);
          if (target) { target.row = res.row; target.id = prefix + res.row; target.pending = false; }
          Api.saveCache('savings', state.savings);
          if (state.tab === 'savings') renderActiveTab();
        }
        loadSavings(true);
        showToast('Tabungan tersimpan ✓', 'success');
      } catch (err) {
        state.savings = snapshot;
        Api.saveCache('savings', snapshot);
        renderActiveTab();
        showToast(err.message || 'Gagal menyimpan tabungan', 'error');
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    });
  }

  // ==========================================================================
  // GLOBAL NAVIGATION, VISIBILITY SYNC & INIT
  // ==========================================================================

  document.querySelectorAll('.tab-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderActiveTab();
      if (state.tab === 'savings' && !state.savings) {
        loadSavings();
      } else if (state.tab === 'compare' && !state.compare) {
        loadCompare(false);
      }
    });
  });

  monthSelectEl.addEventListener('change', () => {
    loadMonthly(monthSelectEl.value);
  });

  refreshBtn.addEventListener('click', () => {
    if (state.tab === 'savings') loadSavings(false);
    else if (state.tab === 'compare') loadCompare(true, false);
    else loadMonthly(state.monthly ? state.monthly.activeMonth : '', false);
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentDark = isDarkActive(Api.getSettings().theme || 'auto');
      const next = currentDark ? 'light' : 'dark';
      Api.saveSettings({ theme: next });
      applyTheme(next);
      showToast(next === 'dark' ? 'Mode Dark aktif 🌙' : 'Mode Light aktif ☀️');
    });
  }

  // Patch 2: Auto-update tanggal saat ganti hari & silent refresh saat buka app lagi
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const todayNow = F.todayISO();
    if (todayNow !== lastAutoDate) {
      if (state.form.date === lastAutoDate) {
        state.form.date = todayNow;
      }
      lastAutoDate = todayNow;
      if (state.tab === 'input') renderActiveTab();
    }
    if (state.monthly && state.tab !== 'input' && (Date.now() - lastSyncAt > 60000)) {
      loadMonthly(state.monthly.activeMonth, true);
    }
  });

  settingsBtn.addEventListener('click', openSettingsModal);
  openSetupFromBanner.addEventListener('click', openSettingsModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  if ('serviceWorker' in navigator) {
    let swReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swReloading) {
        swReloading = true;
        global.location.reload();
      }
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update().catch(() => {}); })
      .catch(() => {});
  }

  // Start app
  F.setPrivacyMode(Boolean(Api.getSettings().privacyMode));
  applyTheme();
  renderHeader();
  loadMonthly('');
})(window);
