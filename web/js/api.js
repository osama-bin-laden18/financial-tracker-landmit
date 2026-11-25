(function (global) {
  'use strict';

  const STORAGE_KEY = 'landmit_budget_settings_v1';
  const CACHE_KEY = 'landmit_budget_cache_v2';

  const DEFAULT_SETTINGS = {
    apiUrl: 'https://script.google.com/macros/s/AKfycbz8coXPrd_eZlnI1mcux8FtTXvOWigrINrBK2kEpl1D4NYIm2xipV2mkLVhIdJ-eU5eQQ/exec',
    token: '',
    defaultOwner: 'Olan',
    demoMode: true,
    activeMonth: '',
    theme: 'auto',
    privacyMode: false
  };

  function getSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const merged = Object.assign({}, DEFAULT_SETTINGS, saved);
      if (saved.apiUrl && saved.token && typeof saved.demoMode === 'undefined') {
        merged.demoMode = false;
      }
      return merged;
    } catch (_) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(partial) {
    const next = Object.assign({}, getSettings(), partial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function saveCache(key, data) {
    try {
      const bag = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      bag[key] = { ts: Date.now(), data };
      localStorage.setItem(CACHE_KEY, JSON.stringify(bag));
    } catch (_) {}
  }

  function readCache(key) {
    try {
      const bag = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return bag[key] ? bag[key].data : null;
    } catch (_) {
      return null;
    }
  }

  // ==========================================================================
  // LIVE GOOGLE APPS SCRIPT CLIENT (CORS-safe untuk Safari iOS & PWA)
  // ==========================================================================

  async function liveGet(action, params) {
    const cfg = getSettings();
    if (!cfg.apiUrl || !cfg.token) {
      throw new Error('Web App URL dan Token belum diisi di Pengaturan.');
    }
    const url = new URL(cfg.apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('token', cfg.token);
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        url.searchParams.set(k, params[k]);
      }
    });

    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow'
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error('Respons Apps Script bukan JSON valid. Pastikan deploy Web App "Who has access: Anyone".');
    }
    if (!json.ok) {
      throw new Error(json.error || 'Terjadi kesalahan pada Apps Script.');
    }
    return json.data;
  }

  async function livePost(action, payload) {
    const cfg = getSettings();
    if (!cfg.apiUrl || !cfg.token) {
      throw new Error('Web App URL dan Token belum diisi di Pengaturan.');
    }
    const body = Object.assign({}, payload, { action, token: cfg.token });
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error('Respons server tidak valid saat menyimpan data.');
    }
    if (!json.ok) {
      throw new Error(json.error || 'Gagal menyimpan ke Google Sheets.');
    }
    return json.data;
  }

  // ==========================================================================
  // INTERACTIVE DEMO ENGINE
  // ==========================================================================

  function createInitialDemoState() {
    const today = global.Formatters.todayISO();
    return {
      monthly: {
        spreadsheetName: 'Budgeting Tracker (Demo)',
        months: ['AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER'],
        activeMonth: 'NOVEMBER',
        monthLabel: 'November',
        yearLabel: '2026',
        summary: {
          sisaUang: 623809,
          totalPemasukan: 22137927,
          totalPengeluaran: 21514118,
          totalSaldoRekening: 755809,
          selisihRekon: 132000
        },
        wallets: [
          { name: 'Cash (Mitry)', balance: 0 },
          { name: 'Cash (Olan)', balance: 15000 },
          { name: 'Ovo (Mitry)', balance: 62792 },
          { name: 'Ovo (Olan)', balance: 15979 },
          { name: 'BRI', balance: 497057 },
          { name: 'BCA (Mitry)', balance: 211079 },
          { name: 'BCA (Olan)', balance: -46098 }
        ],
        options: {
          incomeCategories: ['Gaji', 'Uang jajan', 'Saldo sebelum', 'Lembur', 'Uang Kaget', 'Tabungan', 'Transfer'],
          expenseCategories: [
            'Pangan', 'Bayar Tagihan', 'Bayar Hutang', 'BBM', 'Transportasi', 'Nongki',
            'Rumah', 'Sandang', 'Komunikasi', 'Hadiah/Sedekah', 'Hiburan & Rekreasi',
            'Kopi', 'Grocery', 'Lain-lain', 'Tabungan', 'Kesehatan', 'Olahraga'
          ],
          classifications: ['Kebutuhan', 'Keinginan'],
          owners: ['Olan', 'Mitry', 'Bersama'],
          wallets: ['Cash (Mitry)', 'Cash (Olan)', 'Ovo (Mitry)', 'Ovo (Olan)', 'BRI', 'BCA (Mitry)', 'BCA (Olan)']
        },
        categorySummary: [
          { category: 'Pangan', total: 5020741, percent: 0.233 },
          { category: 'Bayar Tagihan', total: 4149874, percent: 0.193 },
          { category: 'Hadiah/Sedekah', total: 3952000, percent: 0.184 },
          { category: 'Grocery', total: 2205090, percent: 0.102 },
          { category: 'Transportasi', total: 946000, percent: 0.044 },
          { category: 'BBM', total: 871000, percent: 0.040 },
          { category: 'Kopi', total: 784363, percent: 0.036 },
          { category: 'Rumah', total: 703300, percent: 0.033 }
        ],
        classificationSummary: [
          { name: 'Kebutuhan', total: 19946755, percent: 0.927 },
          { name: 'Keinginan', total: 1567363, percent: 0.073 }
        ],
        ownerSummary: [
          { name: 'Olan', total: 3206780 },
          { name: 'Mitry', total: 3821422 },
          { name: 'Bersama', total: 14485916 }
        ],
        mandatory: {
          total: 8400240,
          remaining: 600000,
          items: [
            { row: 56, name: 'Arisan Titin', amount: 350000, checked: true },
            { row: 57, name: 'Arisan Ras', amount: 250000, checked: true },
            { row: 58, name: 'Wifi', amount: 170000, checked: true },
            { row: 59, name: 'Listrik Roland', amount: 99940, checked: true },
            { row: 60, name: 'Jajan Mama Ros', amount: 1000000, checked: true },
            { row: 61, name: 'Tf Mamica', amount: 2350000, checked: true },
            { row: 62, name: 'Kartu Kredit', amount: 620000, checked: true },
            { row: 63, name: 'Wifi Youtube', amount: 160000, checked: true },
            { row: 64, name: 'BRI', amount: 3150300, checked: true },
            { row: 65, name: 'Paket Kuota', amount: 400000, checked: false },
            { row: 66, name: 'Gym', amount: 200000, checked: false }
          ]
        },
        transactions: [
          { id: 'out-261', row: 261, type: 'expense', date: today, amount: 310134, category: 'Bayar Tagihan', classification: 'Kebutuhan', owner: 'Bersama', wallet: 'BRI', notes: 'wifi (contoh patungan)', reimbursable: true, amountFormula: '' },
          { id: 'out-260', row: 260, type: 'expense', date: today, amount: 72000, category: 'Kopi', classification: 'Keinginan', owner: 'Bersama', wallet: 'BRI', notes: 'kopi sore (contoh)', reimbursable: false, amountFormula: '' },
          { id: 'in-79', row: 79, type: 'income', date: today, amount: 150000, category: 'Transfer', owner: '', wallet: 'Ovo (Mitry)', notes: 'distribusi duit' },
          { id: 'in-78', row: 78, type: 'income', date: today, amount: -150000, category: 'Transfer', owner: '', wallet: 'BRI', notes: 'distribusi duit' }
        ]
      },
      savings: {
        sheetName: 'NEW TABUNGAN',
        summary: {
          sisaUang: 17479420,
          totalPemasukan: 41042650,
          totalPengeluaran: 23563230
        },
        assetTypes: [
          { name: 'Emas', total: 14200000, percent: 0.812 },
          { name: 'Uang', total: 3279420, percent: 0.188 },
          { name: 'Saham', total: 0, percent: 0 }
        ],
        wallets: [
          { name: 'Cash (Mandiri)', balance: 2587593 },
          { name: 'Cash (BSI)', balance: 691827 },
          { name: 'Emas (Mitry)', balance: 14200000 },
          { name: 'Emas (Olan)', balance: 0 },
          { name: 'Reksadana', balance: 0 }
        ],
        options: {
          incomeCategories: ['Emas', 'Uang', 'Saham'],
          expenseCategories: ['Pinjam', 'Gadai', 'Darurat', 'Persiapan'],
          owners: ['Olan', 'Mitry', 'Bersama'],
          classifications: ['Kebutuhan', 'Keinginan'],
          wallets: ['Cash (Mandiri)', 'Cash (BSI)', 'Emas (Mitry)', 'Emas (Olan)', 'Reksadana']
        },
        transactions: [
          { id: 'sav-out-50', row: 50, type: 'expense', date: today, amount: 1000000, category: 'Darurat', classification: 'Kebutuhan', owner: 'Bersama', wallet: 'Cash (Mandiri)', notes: 'kehidupan (contoh)' },
          { id: 'sav-in-22', row: 22, type: 'income', date: today, amount: 9700000, category: 'Emas', owner: '', wallet: 'Emas (Mitry)', notes: 'beli emas (contoh)' }
        ]
      },
      compare: {
        months: ['AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER'],
        categories: [
          'Pangan', 'Bayar Tagihan', 'BBM', 'Transportasi', 'Nongki', 'Rumah',
          'Sandang', 'Komunikasi', 'Hadiah/Sedekah', 'Hiburan & Rekreasi',
          'Kopi', 'Grocery', 'Lain-lain', 'Tabungan', 'Kesehatan', 'Olahraga'
        ],
        monthly: [
          {
            month: 'AGUSTUS', totalPemasukan: 24378927, totalPengeluaran: 24378927, sisaUang: 0,
            categories: { 'Pangan': 4564387, 'Bayar Tagihan': 5824501, 'BBM': 453000, 'Transportasi': 435200, 'Nongki': 617710, 'Rumah': 766800, 'Sandang': 1588168, 'Komunikasi': 438500, 'Hadiah/Sedekah': 5251300, 'Hiburan & Rekreasi': 283000, 'Kopi': 255132, 'Grocery': 1869832, 'Lain-lain': 1195500, 'Tabungan': 721897, 'Kesehatan': 0, 'Olahraga': 114000 }
          },
          {
            month: 'SEPTEMBER', totalPemasukan: 42890380, totalPengeluaran: 42890380, sisaUang: 0,
            categories: { 'Pangan': 4148933, 'Bayar Tagihan': 5937676, 'BBM': 691000, 'Transportasi': 157000, 'Nongki': 463920, 'Rumah': 652950, 'Sandang': 130000, 'Komunikasi': 478500, 'Hadiah/Sedekah': 4848392, 'Hiburan & Rekreasi': 133000, 'Kopi': 365900, 'Grocery': 2934053, 'Lain-lain': 499247, 'Tabungan': 20339809, 'Kesehatan': 180000, 'Olahraga': 930000 }
          },
          {
            month: 'OKTOBER', totalPemasukan: 26226476, totalPengeluaran: 26226476, sisaUang: 0,
            categories: { 'Pangan': 3623130, 'Bayar Tagihan': 6129670, 'BBM': 394000, 'Transportasi': 325700, 'Nongki': 614640, 'Rumah': 276300, 'Sandang': 346000, 'Komunikasi': 626500, 'Hadiah/Sedekah': 4364450, 'Hiburan & Rekreasi': 151494, 'Kopi': 717650, 'Grocery': 1524231, 'Lain-lain': 489500, 'Tabungan': 6237985, 'Kesehatan': 380226, 'Olahraga': 25000 }
          },
          {
            month: 'NOVEMBER', totalPemasukan: 22137927, totalPengeluaran: 21514118, sisaUang: 623809,
            categories: { 'Pangan': 5020741, 'Bayar Tagihan': 4149874, 'BBM': 871000, 'Transportasi': 946000, 'Nongki': 403000, 'Rumah': 703300, 'Sandang': 0, 'Komunikasi': 499250, 'Hadiah/Sedekah': 3952000, 'Hiburan & Rekreasi': 0, 'Kopi': 784363, 'Grocery': 2205090, 'Lain-lain': 558500, 'Tabungan': 600000, 'Kesehatan': 601000, 'Olahraga': 220000 }
          }
        ]
      }
    };
  }

  let demoState = null;
  function getDemo() {
    if (!demoState) demoState = createInitialDemoState();
    return demoState;
  }

  function recalcDemoMonthly(d) {
    d.summary.sisaUang = d.summary.totalPemasukan - d.summary.totalPengeluaran;
    d.summary.totalSaldoRekening = d.wallets.reduce((s, w) => s + w.balance, 0);
    d.summary.selisihRekon = d.summary.totalSaldoRekening - d.summary.sisaUang;
  }

  // ==========================================================================
  // UNIFIED PUBLIC API
  // ==========================================================================

  const Api = {
    getSettings,
    saveSettings,
    saveCache,
    readCache,

    async ping(customUrl, customToken) {
      const url = new URL(customUrl);
      url.searchParams.set('action', 'ping');
      url.searchParams.set('token', customToken);
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
      const json = JSON.parse(await res.text());
      if (!json.ok) throw new Error(json.error || 'Koneksi gagal.');
      return json.data;
    },

    async getBootstrap(sheetName) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        if (sheetName) d.activeMonth = sheetName;
        return JSON.parse(JSON.stringify(d));
      }
      const data = await liveGet('bootstrap', { sheet: sheetName || cfg.activeMonth });
      saveCache('bootstrap_' + data.activeMonth, data);
      saveCache('last_bootstrap', data);
      return data;
    },

    async getSavings() {
      const cfg = getSettings();
      if (cfg.demoMode) {
        return JSON.parse(JSON.stringify(getDemo().savings));
      }
      const data = await liveGet('savings', {});
      saveCache('savings', data);
      return data;
    },

    async getCompare(forceRefresh) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        return JSON.parse(JSON.stringify(getDemo().compare));
      }
      const data = await liveGet('compare', forceRefresh ? { force: '1' } : {});
      saveCache('compare_v2', data);
      return data;
    },

    async addExpense(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        const amt = Number(payload.amount);
        const row = 262 + d.transactions.length;
        d.transactions.unshift({
          id: 'out-' + row, row, type: 'expense',
          date: payload.date, amount: amt, category: payload.category,
          classification: payload.classification, owner: payload.owner,
          wallet: payload.wallet, notes: payload.notes,
          reimbursable: Boolean(payload.reimbursable),
          amountFormula: ''
        });
        d.summary.totalPengeluaran += amt;
        const w = d.wallets.find(x => x.name === payload.wallet);
        if (w) w.balance -= amt;
        const c = d.categorySummary.find(x => x.category === payload.category);
        if (c) c.total += amt;
        else d.categorySummary.push({ category: payload.category, total: amt, percent: 0 });
        d.categorySummary.forEach(x => { x.percent = d.summary.totalPengeluaran ? x.total / d.summary.totalPengeluaran : 0; });
        d.categorySummary.sort((a, b) => b.total - a.total);
        recalcDemoMonthly(d);
        return { row, sheet: d.activeMonth, type: 'expense' };
      }
      return livePost('addExpense', payload);
    },

    async addIncome(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        const amt = Number(payload.amount);
        const row = 80 + d.transactions.length;
        d.transactions.unshift({
          id: 'in-' + row, row, type: 'income',
          date: payload.date, amount: amt, category: payload.category,
          owner: payload.owner, wallet: payload.wallet, notes: payload.details
        });
        d.summary.totalPemasukan += amt;
        const w = d.wallets.find(x => x.name === payload.wallet);
        if (w) w.balance += amt;
        recalcDemoMonthly(d);
        return { row, sheet: d.activeMonth, type: 'income' };
      }
      return livePost('addIncome', payload);
    },

    async addTransfer(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        const amt = Number(payload.amount);
        const fee = Number(payload.adminFee) || 0;
        const base = 85 + d.transactions.length;
        d.transactions.unshift(
          { id: 'in-' + (base + 1), row: base + 1, type: 'income', date: payload.date, amount: amt, category: 'Transfer', owner: '', wallet: payload.toWallet, notes: payload.notes },
          { id: 'in-' + base, row: base, type: 'income', date: payload.date, amount: -amt, category: 'Transfer', owner: '', wallet: payload.fromWallet, notes: payload.notes }
        );
        const wFrom = d.wallets.find(x => x.name === payload.fromWallet);
        const wTo = d.wallets.find(x => x.name === payload.toWallet);
        if (wFrom) wFrom.balance -= amt;
        if (wTo) wTo.balance += amt;
        if (fee > 0) {
          d.transactions.unshift({
            id: 'out-' + (base + 200), row: base + 200, type: 'expense',
            date: payload.date, amount: fee, category: 'Lain-lain',
            classification: 'Kebutuhan', owner: payload.owner || 'Bersama',
            wallet: payload.fromWallet, notes: 'admin tf'
          });
          d.summary.totalPengeluaran += fee;
          if (wFrom) wFrom.balance -= fee;
        }
        recalcDemoMonthly(d);
        return { rows: [base, base + 1], sheet: d.activeMonth, type: 'transfer' };
      }
      return livePost('addTransfer', payload);
    },

    async toggleMandatory(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        const item = d.mandatory.items.find(x => x.row === payload.row);
        if (item) item.checked = Boolean(payload.checked);
        d.mandatory.remaining = d.mandatory.items.filter(x => !x.checked).reduce((s, x) => s + x.amount, 0);
        return { row: payload.row, checked: payload.checked };
      }
      return livePost('toggleMandatory', payload);
    },

    async addSavings(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const s = getDemo().savings;
        const amt = Number(payload.amount);
        const row = 60 + s.transactions.length;
        const w = s.wallets.find(x => x.name === payload.wallet);
        if (payload.mode === 'income') {
          s.summary.totalPemasukan += amt;
          if (w) w.balance += amt;
          s.transactions.unshift({ id: 'sav-in-' + row, row, type: 'income', date: payload.date, amount: amt, category: payload.category, wallet: payload.wallet, notes: payload.notes });
        } else {
          s.summary.totalPengeluaran += amt;
          if (w) w.balance -= amt;
          s.transactions.unshift({ id: 'sav-out-' + row, row, type: 'expense', date: payload.date, amount: amt, category: payload.category, classification: payload.classification, owner: payload.owner, wallet: payload.wallet, notes: payload.notes });
        }
        s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
        return { row, mode: payload.mode };
      }
      return livePost('addSavings', payload);
    },

    async deleteTransaction(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        if (payload.scope === 'savings') {
          const s = getDemo().savings;
          const idx = s.transactions.findIndex(t => t.row === payload.row && t.type === payload.type);
          if (idx >= 0) {
            const tx = s.transactions.splice(idx, 1)[0];
            const w = s.wallets.find(x => x.name === tx.wallet);
            if (tx.type === 'income') { s.summary.totalPemasukan -= tx.amount; if (w) w.balance -= tx.amount; }
            else { s.summary.totalPengeluaran -= tx.amount; if (w) w.balance += tx.amount; }
            s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
          }
          return { deletedRow: payload.row };
        }
        const d = getDemo().monthly;
        const idx = d.transactions.findIndex(t => t.row === payload.row && t.type === payload.type);
        if (idx >= 0) {
          const tx = d.transactions.splice(idx, 1)[0];
          const w = d.wallets.find(x => x.name === tx.wallet);
          if (tx.type === 'income') { d.summary.totalPemasukan -= tx.amount; if (w) w.balance -= tx.amount; }
          else { d.summary.totalPengeluaran -= tx.amount; if (w) w.balance += tx.amount; }
          recalcDemoMonthly(d);
        }
        return { deletedRow: payload.row };
      }
      return livePost('deleteTransaction', payload);
    },

    async updateTransaction(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        if (payload.scope === 'savings') {
          const s = getDemo().savings;
          const tx = s.transactions.find(t => t.row === payload.row && t.type === payload.type);
          if (tx) {
            const oldAmt = tx.amount;
            const oldW = s.wallets.find(x => x.name === tx.wallet);
            const newW = s.wallets.find(x => x.name === payload.wallet);
            const newAmt = Number(payload.amount);
            if (tx.type === 'income') {
              s.summary.totalPemasukan += (newAmt - oldAmt);
              if (oldW) oldW.balance -= oldAmt;
              if (newW) newW.balance += newAmt;
            } else {
              s.summary.totalPengeluaran += (newAmt - oldAmt);
              if (oldW) oldW.balance += oldAmt;
              if (newW) newW.balance -= newAmt;
            }
            Object.assign(tx, {
              date: payload.date, amount: newAmt, category: payload.category,
              classification: payload.classification || '', owner: payload.owner || '',
              wallet: payload.wallet, notes: payload.notes || ''
            });
            s.summary.sisaUang = s.summary.totalPemasukan - s.summary.totalPengeluaran;
          }
          return { updatedRow: payload.row };
        }
        const d = getDemo().monthly;
        const tx = d.transactions.find(t => t.row === payload.row && t.type === payload.type);
        if (tx) {
          const oldAmt = tx.amount;
          const oldW = d.wallets.find(x => x.name === tx.wallet);
          const newW = d.wallets.find(x => x.name === payload.wallet);
          const newAmt = Number(payload.amount);
          if (tx.type === 'income') {
            d.summary.totalPemasukan += (newAmt - oldAmt);
            if (oldW) oldW.balance -= oldAmt;
            if (newW) newW.balance += newAmt;
          } else {
            d.summary.totalPengeluaran += (newAmt - oldAmt);
            if (oldW) oldW.balance += oldAmt;
            if (newW) newW.balance -= newAmt;
          }
          Object.assign(tx, {
            date: payload.date, amount: newAmt, category: payload.category,
            classification: payload.classification || '', owner: payload.owner || '',
            wallet: payload.wallet, notes: payload.notes || '',
            reimbursable: typeof payload.reimbursable === 'boolean' ? payload.reimbursable : Boolean(tx.reimbursable)
          });
          recalcDemoMonthly(d);
        }
        return { updatedRow: payload.row };
      }
      return livePost('updateTransaction', payload);
    },

    async deductExpense(payload) {
      const cfg = getSettings();
      if (cfg.demoMode) {
        const d = getDemo().monthly;
        const tx = d.transactions.find(t => t.row === payload.row && t.type === 'expense');
        if (tx) {
          const deduct = Number(payload.deductAmount) || 0;
          const prev = Number(tx.amount) || 0;
          const next = Math.max(0, prev - deduct);
          tx.amountFormula = (tx.amountFormula && tx.amountFormula.startsWith('='))
            ? `${tx.amountFormula}-${deduct}`
            : `=${prev}-${deduct}`;
          tx.amount = next;
          if (payload.clearRed) tx.reimbursable = false;
          d.summary.totalPengeluaran = Math.max(0, d.summary.totalPengeluaran - deduct);
          const w = d.wallets.find(x => x.name === tx.wallet);
          if (w) w.balance += deduct;
          recalcDemoMonthly(d);
          return { row: payload.row, previousAmount: prev, deducted: deduct, newAmount: next, formula: tx.amountFormula, reimbursable: tx.reimbursable };
        }
        return { row: payload.row };
      }
      return livePost('deductExpense', payload);
    }
  };

  global.Api = Api;
})(window);
