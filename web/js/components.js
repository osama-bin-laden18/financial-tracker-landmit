(function (global) {
  'use strict';

  const F = global.Formatters;

  // ==========================================================================
  // 1. DASHBOARD & REKON
  // ==========================================================================

  function renderDashboard(data) {
    const s = data.summary;
    const spendRatio = s.totalPemasukan > 0 ? Math.min(100, Math.round((s.totalPengeluaran / s.totalPemasukan) * 100)) : 0;
    const rekonOk = Math.round(s.selisihRekon) === 0;

    const topCats = (data.categorySummary || [])
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);

    return `
      <section class="card hero-card">
        <div class="hero-label">Sisa Uang • ${F.escapeHtml(data.monthLabel)} ${F.escapeHtml(data.yearLabel)}</div>
        <div class="hero-amount">${F.formatRupiah(s.sisaUang)}</div>
        <div class="hero-stats">
          <div class="hero-stat-box">
            <div class="hero-stat-label">Pemasukan</div>
            <div class="hero-stat-value">${F.formatRupiah(s.totalPemasukan)}</div>
          </div>
          <div class="hero-stat-box">
            <div class="hero-stat-label">Pengeluaran (${spendRatio}%)</div>
            <div class="hero-stat-value">${F.formatRupiah(s.totalPengeluaran)}</div>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${spendRatio}%"></div>
        </div>
      </section>

      <section class="rekon-card ${rekonOk ? 'ok' : 'warn'}">
        <div>
          <div class="rekon-title">${rekonOk ? '✓ Rekon Malam Aman' : '⚠️ Perlu Rekon Sebelum Tidur'}</div>
          <div class="rekon-sub">${rekonOk ? 'Total saldo 7 rekening cocok dengan sisa uang.' : 'Selisih antara total rekening & sisa uang.'}</div>
        </div>
        <div class="rekon-val">${F.formatRupiah(s.selisihRekon, true)}</div>
      </section>

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Saldo 7 Rekening</h2>
          <span class="section-sub">Total ${F.formatRupiah(s.totalSaldoRekening)}</span>
        </div>
        <div class="wallet-grid">
          ${(data.wallets || []).map((w) => `
            <div class="wallet-item">
              <div class="wallet-name">${F.escapeHtml(w.name)}</div>
              <div class="wallet-bal ${w.balance < 0 ? 'neg' : 'pos'}">${F.formatRupiah(w.balance)}</div>
            </div>
          `).join('')}
        </div>
      </section>

      ${(data.ownerSummary && data.ownerSummary.length) ? `
      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Pengeluaran per Peruntukan</h2>
        </div>
        <div class="mini-grid">
          ${data.ownerSummary.map((o) => `
            <div class="mini-stat">
              <div class="mini-stat-label">${F.escapeHtml(o.name)}</div>
              <div class="mini-stat-val">${F.formatCompact(o.total)}</div>
            </div>
          `).join('')}
        </div>
        ${(data.classificationSummary && data.classificationSummary.length) ? `
          <div class="mini-grid two-col" style="margin-top:8px;">
            ${data.classificationSummary.map((cl) => `
              <div class="mini-stat">
                <div class="mini-stat-label">${F.escapeHtml(cl.name)} (${F.formatPercent(cl.percent)})</div>
                <div class="mini-stat-val">${F.formatCompact(cl.total)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </section>` : ''}

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Top Kategori Pengeluaran</h2>
          <span class="section-sub">${topCats.length} teratas</span>
        </div>
        ${topCats.length ? topCats.map((c) => `
          <div class="cat-row">
            <div class="cat-row-top">
              <span class="cat-name">${F.getCategoryIcon(c.category)} ${F.escapeHtml(c.category)}</span>
              <span>
                <span class="cat-val">${F.formatRupiah(c.total)}</span>
                <span class="cat-pct">${F.formatPercent(c.percent)}</span>
              </span>
            </div>
            <div class="bar-bg">
              <div class="bar-fg" style="width:${Math.min(100, Math.round((c.percent || 0) * 100))}%"></div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">Belum ada pengeluaran bulan ini.</div>'}
      </section>
    `;
  }

  // ==========================================================================
  // 2. FORM INPUT CEPAT (PENGELUARAN / PEMASUKAN / TRANSFER)
  // ==========================================================================

  function renderInputForm(data, formState) {
    const mode = formState.mode; // 'expense' | 'income' | 'transfer'
    const opts = data.options || {};
    const wallets = data.wallets || [];
    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.name] = w.balance; });

    const renderWalletChips = (fieldName, selectedVal) => `
      <div class="chip-grid">
        ${(opts.wallets || []).map((wName) => `
          <button type="button" class="choice-chip ${selectedVal === wName ? 'selected' : ''}" data-field="${fieldName}" data-val="${F.escapeHtml(wName)}">
            <span>${F.escapeHtml(wName)}</span>
            <span class="chip-sub">${F.formatCompact(walletMap[wName] || 0)}</span>
          </button>
        `).join('')}
      </div>
    `;

    const renderSimpleChips = (fieldName, list, selectedVal, withIcons) => `
      <div class="chip-grid">
        ${(list || []).map((item) => `
          <button type="button" class="choice-chip ${selectedVal === item ? 'selected' : ''}" data-field="${fieldName}" data-val="${F.escapeHtml(item)}">
            <span>${withIcons ? F.getCategoryIcon(item) + ' ' : ''}${F.escapeHtml(item)}</span>
          </button>
        `).join('')}
      </div>
    `;

    let fieldsHtml = '';
    if (mode === 'expense') {
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">Kategori Pengeluaran</label>
          ${renderSimpleChips('category', opts.expenseCategories, formState.category, true)}
        </div>
        <div class="form-group">
          <label class="form-label">Rekening Debit</label>
          ${renderWalletChips('wallet', formState.wallet)}
        </div>
        <div class="form-group">
          <label class="form-label">Peruntukan</label>
          ${renderSimpleChips('owner', opts.owners, formState.owner, false)}
        </div>
        <div class="form-group">
          <label class="form-label">Klasifikasi</label>
          ${renderSimpleChips('classification', opts.classifications, formState.classification, false)}
        </div>
        <div class="form-group">
          <label class="form-label" for="txNotes">Catatan / Notes</label>
          <input id="txNotes" class="ios-input" type="text" placeholder="Contoh: indomaret, bbm agya, kopi fore..." value="${F.escapeHtml(formState.notes)}" />
        </div>
      `;
    } else if (mode === 'income') {
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">Kategori Pemasukan</label>
          ${renderSimpleChips('incomeCategory', opts.incomeCategories, formState.incomeCategory, true)}
        </div>
        <div class="form-group">
          <label class="form-label">Masuk ke Rekening (Rek Kredit)</label>
          ${renderWalletChips('wallet', formState.wallet)}
        </div>
        <div class="form-group">
          <label class="form-label">Keterangan (Opsional)</label>
          ${renderSimpleChips('incomeOwner', [''].concat(opts.owners || []), formState.incomeOwner, false).replace('></span>', '>Tanpa label</span>')}
        </div>
        <div class="form-group">
          <label class="form-label" for="txNotes">Rincian</label>
          <input id="txNotes" class="ios-input" type="text" placeholder="Contoh: gaji BPD, bonus, refund..." value="${F.escapeHtml(formState.notes)}" />
        </div>
      `;
    } else {
      // Transfer 2 baris otomatis
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">Dari Rekening (Sumber)</label>
          ${renderWalletChips('fromWallet', formState.fromWallet)}
        </div>
        <div class="form-group">
          <label class="form-label">Ke Rekening (Tujuan)</label>
          ${renderWalletChips('toWallet', formState.toWallet)}
        </div>
        <div class="form-group">
          <label class="form-label" for="adminFeeInput">Biaya Admin Transfer (Opsional)</label>
          <input id="adminFeeInput" class="ios-input" type="text" inputmode="numeric" placeholder="0" value="${formState.adminFee ? F.formatNumberInput(formState.adminFee) : ''}" />
          <div class="quick-amounts" style="justify-content:flex-start;margin-top:6px;">
            <button type="button" class="quick-chip" data-set-fee="0">Gratis</button>
            <button type="button" class="quick-chip" data-set-fee="2500">Rp 2.500</button>
            <button type="button" class="quick-chip" data-set-fee="5000">Rp 5.000</button>
            <button type="button" class="quick-chip" data-set-fee="6500">Rp 6.500</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="txNotes">Catatan Transfer</label>
          <input id="txNotes" class="ios-input" type="text" placeholder="distribusi duit" value="${F.escapeHtml(formState.transferNotes)}" />
        </div>
      `;
    }

    const submitLabel = mode === 'expense'
      ? 'Simpan Pengeluaran ke Sheet'
      : mode === 'income'
        ? 'Simpan Pemasukan ke Sheet'
        : 'Kirim Transfer (2 Baris Otomatis)';

    return `
      <form id="txForm" class="card" autocomplete="off">
        <div class="segmented" style="margin-bottom:14px;">
          <button type="button" class="seg-btn ${mode === 'expense' ? 'active' : ''}" data-mode="expense">Pengeluaran</button>
          <button type="button" class="seg-btn ${mode === 'income' ? 'active' : ''}" data-mode="income">Pemasukan</button>
          <button type="button" class="seg-btn ${mode === 'transfer' ? 'active' : ''}" data-mode="transfer">Transfer</button>
        </div>

        <div class="amount-box">
          <div class="amount-prefix">NOMINAL (RUPIAH) • SHEET ${F.escapeHtml(data.activeMonth)}</div>
          <input id="amountInput" class="amount-input" type="text" inputmode="numeric" placeholder="0" value="${formState.amount ? F.formatNumberInput(formState.amount) : ''}" />
          <div class="quick-amounts">
            <button type="button" class="quick-chip" data-add-amt="10000">+10rb</button>
            <button type="button" class="quick-chip" data-add-amt="25000">+25rb</button>
            <button type="button" class="quick-chip" data-add-amt="50000">+50rb</button>
            <button type="button" class="quick-chip" data-add-amt="100000">+100rb</button>
            <button type="button" class="quick-chip" data-add-amt="500000">+500rb</button>
            <button type="button" class="quick-chip clear" data-add-amt="0">Clear</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="txDate">Tanggal</label>
          <input id="txDate" class="ios-input" type="date" value="${F.escapeHtml(formState.date)}" />
        </div>

        ${fieldsHtml}

        <button id="submitTxBtn" type="submit" class="primary-btn ${mode === 'income' ? 'success' : ''}" ${formState.submitting ? 'disabled' : ''}>
          ${formState.submitting ? 'Mengirim ke Google Sheets...' : submitLabel}
        </button>
      </form>
    `;
  }

  // ==========================================================================
  // 3. RIWAYAT & TAGIHAN MANDATORY
  // ==========================================================================

  function renderHistoryAndBills(data, historyState) {
    const subTab = historyState.subTab; // 'tx' | 'bills'
    const mandatory = data.mandatory || { items: [], total: 0, remaining: 0 };

    let bodyHtml = '';
    if (subTab === 'bills') {
      const doneCount = mandatory.items.filter((i) => i.checked).length;
      bodyHtml = `
        <section class="card">
          <div class="section-header">
            <h2 class="section-title">Tagihan Mandatory (${doneCount}/${mandatory.items.length})</h2>
            <span class="section-sub">Sisa: ${F.formatRupiah(mandatory.remaining)}</span>
          </div>
          ${mandatory.items.length ? mandatory.items.map((item) => `
            <div class="bill-row ${item.checked ? 'done' : ''}" data-toggle-bill="${item.row}" data-checked="${item.checked ? '1' : '0'}">
              <div class="bill-left">
                <div class="bill-check">${item.checked ? '✓' : ''}</div>
                <div class="bill-name">${F.escapeHtml(item.name)}</div>
              </div>
              <div class="bill-amount">${F.formatRupiah(item.amount)}</div>
            </div>
          `).join('') : '<div class="empty-state">Tidak ada daftar tagihan mandatory di bulan ini.</div>'}
        </section>
      `;
    } else {
      const q = (historyState.search || '').trim().toLowerCase();
      const filter = historyState.filter || 'all';
      const filtered = (data.transactions || []).filter((tx) => {
        if (filter === 'expense' && tx.type !== 'expense') return false;
        if (filter === 'income' && (tx.type !== 'income' || tx.category === 'Transfer')) return false;
        if (filter === 'transfer' && tx.category !== 'Transfer') return false;
        if (q) {
          const hay = `${tx.category} ${tx.notes} ${tx.wallet} ${tx.owner}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      // Kelompokkan per tanggal
      const groups = {};
      filtered.forEach((tx) => {
        const key = tx.date || '';
        if (!groups[key]) groups[key] = [];
        groups[key].push(tx);
      });

      const groupKeys = Object.keys(groups);

      bodyHtml = `
        <section class="card">
          <input id="txSearch" class="ios-input" type="search" placeholder="Cari catatan, kategori, rekening..." value="${F.escapeHtml(historyState.search)}" />
          <div class="chip-grid" style="margin-top:10px;">
            ${[
              ['all', 'Semua'],
              ['expense', 'Pengeluaran'],
              ['income', 'Pemasukan'],
              ['transfer', 'Transfer']
            ].map(([k, lbl]) => `
              <button type="button" class="choice-chip ${filter === k ? 'selected' : ''}" data-tx-filter="${k}">${lbl}</button>
            `).join('')}
          </div>
        </section>

        <section class="card">
          <div class="section-header">
            <h2 class="section-title">Transaksi Terbaru</h2>
            <span class="section-sub">${filtered.length} baris</span>
          </div>
          ${groupKeys.length ? groupKeys.map((dateKey) => `
            <div class="tx-date-header">${F.formatDateID(dateKey)}</div>
            ${groups[dateKey].map((tx) => renderTransactionRow(tx, 'monthly')).join('')}
          `).join('') : '<div class="empty-state">Tidak ada transaksi yang cocok.</div>'}
        </section>
      `;
    }

    return `
      <div class="card" style="padding:10px;">
        <div class="segmented">
          <button type="button" class="seg-btn ${subTab === 'tx' ? 'active' : ''}" data-history-tab="tx">Transaksi</button>
          <button type="button" class="seg-btn ${subTab === 'bills' ? 'active' : ''}" data-history-tab="bills">Tagihan Wajib (${mandatory.items.filter(i => !i.checked).length})</button>
        </div>
      </div>
      ${bodyHtml}
    `;
  }

  function renderTransactionRow(tx, scope) {
    const isTransfer = tx.category === 'Transfer';
    const amtClass = isTransfer ? 'tf' : (tx.type === 'expense' ? 'out' : 'in');
    const displayAmt = tx.type === 'expense'
      ? '-' + F.formatRupiah(tx.amount)
      : F.formatRupiah(tx.amount, true);
    const title = tx.notes || tx.category || '(Tanpa catatan)';
    const metaParts = [tx.category, tx.wallet, tx.owner].filter(Boolean);

    return `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon">${F.getCategoryIcon(tx.category)}</div>
          <div class="tx-meta">
            <div class="tx-title">${F.escapeHtml(title)}</div>
            <div class="tx-sub">${F.escapeHtml(metaParts.join(' • '))}</div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${amtClass}">${displayAmt}</div>
          <button type="button" class="del-btn" title="Hapus baris" data-delete-scope="${scope}" data-delete-type="${tx.type}" data-delete-row="${tx.row}" data-delete-label="${F.escapeHtml(title)}">✕</button>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 4. TABUNGAN (NEW TABUNGAN)
  // ==========================================================================

  function renderSavings(sav) {
    if (!sav) {
      return '<div class="loading-state"><div class="spinner"></div><p>Memuat data tabungan...</p></div>';
    }
    const s = sav.summary;
    return `
      <section class="card hero-card savings-hero">
        <div class="hero-label">Total Aset Tabungan • ${F.escapeHtml(sav.sheetName)}</div>
        <div class="hero-amount">${F.formatRupiah(s.sisaUang)}</div>
        <div class="hero-stats">
          <div class="hero-stat-box">
            <div class="hero-stat-label">Total Masuk</div>
            <div class="hero-stat-value">${F.formatRupiah(s.totalPemasukan)}</div>
          </div>
          <div class="hero-stat-box">
            <div class="hero-stat-label">Total Keluar</div>
            <div class="hero-stat-value">${F.formatRupiah(s.totalPengeluaran)}</div>
          </div>
        </div>
      </section>

      <button id="openSavingsFormBtn" class="primary-btn success" style="margin-top:0;">+ Catat Transaksi Tabungan</button>

      ${(sav.assetTypes && sav.assetTypes.length) ? `
      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Komposisi Aset</h2>
        </div>
        <div class="mini-grid">
          ${sav.assetTypes.map((a) => `
            <div class="mini-stat">
              <div class="mini-stat-label">${F.getCategoryIcon(a.name)} ${F.escapeHtml(a.name)} (${F.formatPercent(a.percent)})</div>
              <div class="mini-stat-val">${F.formatCompact(a.total)}</div>
            </div>
          `).join('')}
        </div>
      </section>` : ''}

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Rekening Tabungan</h2>
        </div>
        <div class="wallet-grid">
          ${(sav.wallets || []).map((w) => `
            <div class="wallet-item">
              <div class="wallet-name">${F.escapeHtml(w.name)}</div>
              <div class="wallet-bal ${w.balance < 0 ? 'neg' : 'pos'}">${F.formatRupiah(w.balance)}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Riwayat Tabungan</h2>
          <span class="section-sub">${(sav.transactions || []).length} terbaru</span>
        </div>
        ${(sav.transactions && sav.transactions.length) ? sav.transactions.map((tx) => renderTransactionRow(tx, 'savings')).join('') : '<div class="empty-state">Belum ada transaksi tabungan.</div>'}
      </section>
    `;
  }

  // ==========================================================================
  // MODALS (SETTINGS & SAVINGS ENTRY)
  // ==========================================================================

  function renderSettingsModal(cfg) {
    return `
      <div class="sheet-handle"></div>
      <div class="section-header">
        <h2 class="section-title" style="font-size:17px;">Pengaturan Koneksi &amp; iOS</h2>
        <button type="button" class="icon-btn" id="closeModalBtn">✕</button>
      </div>

      <form id="settingsForm">
        <div class="form-group">
          <label class="form-label">Profil iPhone Ini (Default Peruntukan)</label>
          <div class="segmented">
            ${['Olan', 'Mitry', 'Bersama'].map((o) => `
              <button type="button" class="seg-btn ${cfg.defaultOwner === o ? 'active' : ''}" data-default-owner="${o}">${o}</button>
            `).join('')}
          </div>
          <input type="hidden" id="setDefaultOwner" value="${F.escapeHtml(cfg.defaultOwner)}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="setApiUrl">Google Apps Script Web App URL</label>
          <input id="setApiUrl" class="ios-input" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${F.escapeHtml(cfg.apiUrl)}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="setToken">Token Rahasia (API_TOKEN)</label>
          <input id="setToken" class="ios-input" type="password" placeholder="Sama dengan CONFIG.API_TOKEN di Code.gs" value="${F.escapeHtml(cfg.token)}" />
        </div>

        <button type="button" id="testConnBtn" class="secondary-btn">Tes Koneksi ke Google Sheets</button>
        <button type="submit" class="primary-btn">Simpan &amp; Hubungkan (Live)</button>
        <button type="button" id="switchDemoBtn" class="secondary-btn">Gunakan Mode Demo</button>
      </form>

      <div class="card" style="margin-top:14px;background:var(--surface-alt);box-shadow:none;">
        <div class="section-title" style="margin-bottom:6px;">📱 Pasang di Home Screen iPhone</div>
        <ol style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.6;">
          <li>Buka halaman ini di <strong>Safari</strong> iPhone.</li>
          <li>Ketuk tombol <strong>Share</strong> (ikon kotak panah atas di bawah).</li>
          <li>Pilih <strong>Add to Home Screen</strong> → ketuk <strong>Add</strong>.</li>
          <li>Buka dari ikon baru di Home Screen untuk mode full-screen!</li>
        </ol>
      </div>
    `;
  }

  function renderSavingsModal(sav, defaultOwner) {
    const opts = sav.options || {};
    return `
      <div class="sheet-handle"></div>
      <div class="section-header">
        <h2 class="section-title" style="font-size:17px;">Catat Tabungan (NEW TABUNGAN)</h2>
        <button type="button" class="icon-btn" id="closeModalBtn">✕</button>
      </div>
      <form id="savingsForm">
        <div class="segmented" style="margin-bottom:12px;">
          <button type="button" class="seg-btn active" data-sav-mode="income">Masuk Tabungan</button>
          <button type="button" class="seg-btn" data-sav-mode="expense">Ambil / Keluar</button>
        </div>
        <input type="hidden" id="savMode" value="income" />

        <div class="form-group">
          <label class="form-label" for="savAmount">Nominal (Rp)</label>
          <input id="savAmount" class="ios-input" type="text" inputmode="numeric" placeholder="500.000" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="savDate">Tanggal</label>
          <input id="savDate" class="ios-input" type="date" value="${F.todayISO()}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="savWallet">Rekening Tabungan</label>
          <select id="savWallet" class="ios-select">
            ${(opts.wallets || []).map((w) => `<option value="${F.escapeHtml(w)}">${F.escapeHtml(w)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="savCategory">Kategori</label>
          <select id="savCategory" class="ios-select">
            ${(opts.incomeCategories || []).map((c) => `<option value="${F.escapeHtml(c)}">${F.escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div id="savExpenseExtra" class="hidden">
          <div class="form-group">
            <label class="form-label" for="savClass">Klasifikasi</label>
            <select id="savClass" class="ios-select">
              ${(opts.classifications || ['Kebutuhan', 'Keinginan']).map((c) => `<option value="${F.escapeHtml(c)}">${F.escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="savOwner">Peruntukan</label>
            <select id="savOwner" class="ios-select">
              ${(opts.owners || ['Olan', 'Mitry', 'Bersama']).map((o) => `<option value="${F.escapeHtml(o)}" ${o === defaultOwner ? 'selected' : ''}>${F.escapeHtml(o)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="savNotes">Catatan</label>
          <input id="savNotes" class="ios-input" type="text" placeholder="Contoh: nabung bulanan, beli emas..." />
        </div>
        <button type="submit" id="submitSavBtn" class="primary-btn success">Simpan ke NEW TABUNGAN</button>
      </form>
    `;
  }

  // ==========================================================================
  // 5. GRAFIK PERBANDINGAN ANTAR BULAN
  // ==========================================================================

  function shortMonthName(m) {
    return String(m || '').slice(0, 3).toUpperCase();
  }

  function sumCategoriesForMonth(monthObj, includeSavings) {
    if (!monthObj) return 0;
    const cats = monthObj.categories || {};
    if (includeSavings) return Number(monthObj.totalPengeluaran) || 0;
    return Object.keys(cats).reduce((sum, k) => {
      if (k.toLowerCase() === 'tabungan') return sum;
      return sum + (Number(cats[k]) || 0);
    }, 0);
  }

  function renderCompare(compareData, cmpState) {
    if (!compareData) {
      return '<div class="loading-state"><div class="spinner"></div><p>Memuat grafik perbandingan antar bulan...</p></div>';
    }
    const monthly = compareData.monthly || [];
    const months = compareData.months || [];
    if (monthly.length === 0) {
      return '<div class="card empty-state">Belum ada data bulanan untuk dibandingkan.</div>';
    }

    const monthAName = months.includes(cmpState.monthA) ? cmpState.monthA : months[Math.max(0, months.length - 2)];
    const monthBName = months.includes(cmpState.monthB) ? cmpState.monthB : months[months.length - 1];
    const objA = monthly.find((m) => m.month === monthAName) || monthly[0];
    const objB = monthly.find((m) => m.month === monthBName) || monthly[monthly.length - 1];

    const includeSav = cmpState.includeSavings !== false; // default true
    const totalA = sumCategoriesForMonth(objA, includeSav);
    const totalB = sumCategoriesForMonth(objB, includeSav);
    const diffExp = totalB - totalA;
    const diffExpPct = totalA > 0 ? (diffExp / totalA) : 0;
    const expPillClass = diffExp > 0 ? 'up' : (diffExp < 0 ? 'down' : 'flat');
    const expArrow = diffExp > 0 ? '▲' : (diffExp < 0 ? '▼' : '•');

    // Data tren multi-bulan (Total Pengeluaran atau 1 Kategori)
    const metric = cmpState.trendMetric || 'TOTAL';
    const trendPoints = monthly.map((m) => {
      let val = 0;
      if (metric === 'TOTAL') {
        val = sumCategoriesForMonth(m, includeSav);
      } else {
        val = Number((m.categories || {})[metric]) || 0;
      }
      return { month: m.month, short: shortMonthName(m.month), val };
    });

    const maxTrend = Math.max(1, ...trendPoints.map((p) => p.val));
    const barGap = 8;
    const barWidth = Math.max(24, Math.floor(320 / Math.max(trendPoints.length, 4)) - barGap);
    const svgWidth = Math.max(320, trendPoints.length * (barWidth + barGap) + 16);
    const chartTop = 24;
    const chartHeight = 132;

    const barsSvg = trendPoints.map((p, idx) => {
      const x = 10 + idx * (barWidth + barGap);
      const h = p.val > 0 ? Math.max(4, Math.round((p.val / maxTrend) * chartHeight)) : 2;
      const y = chartTop + chartHeight - h;
      const isA = p.month === monthAName;
      const isB = p.month === monthBName;
      const fill = isB ? 'var(--primary)' : (isA ? '#8E8E93' : 'rgba(142, 142, 147, 0.35)');
      const labelColor = isB ? 'var(--primary)' : (isA ? 'var(--text)' : 'var(--text-secondary)');
      const showTopVal = isA || isB || p.val === maxTrend;

      return `
        <g class="trend-bar-group" data-pick-month="${F.escapeHtml(p.month)}">
          ${showTopVal && p.val > 0 ? `<text x="${x + barWidth / 2}" y="${Math.max(11, y - 5)}" text-anchor="middle" class="trend-val-label">${F.escapeHtml(F.formatCompact(p.val).replace('Rp ', ''))}</text>` : ''}
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="5" fill="${fill}" />
          <text x="${x + barWidth / 2}" y="${chartTop + chartHeight + 16}" text-anchor="middle" class="trend-label" style="fill:${labelColor}">${F.escapeHtml(p.short)}</text>
        </g>
      `;
    }).join('');

    // Data perbandingan per kategori (Bulan A vs Bulan B)
    const allCats = (compareData.categories || []).filter((c) => includeSav || c.toLowerCase() !== 'tabungan');
    const catPairs = allCats.map((cat) => {
      const a = Number((objA.categories || {})[cat]) || 0;
      const b = Number((objB.categories || {})[cat]) || 0;
      return { cat, a, b, diff: b - a, max: Math.max(a, b) };
    }).filter((item) => item.a > 0 || item.b > 0);

    const sortMode = cmpState.sort || 'max';
    catPairs.sort((x, y) => {
      if (sortMode === 'inc') return y.diff - x.diff;
      if (sortMode === 'dec') return x.diff - y.diff;
      return y.max - x.max;
    });
    const maxCatVal = Math.max(1, ...catPairs.map((c) => c.max));

    return `
      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Pilih 2 Bulan untuk Dibandingkan</h2>
          <span class="section-sub">${months.length} bulan</span>
        </div>
        <div class="compare-picker">
          <div>
            <label class="form-label" for="cmpMonthA">Bulan A (Pembanding)</label>
            <select id="cmpMonthA" class="ios-select" style="margin-top:4px;">
              ${months.map((m) => `<option value="${F.escapeHtml(m)}" ${m === monthAName ? 'selected' : ''}>${F.escapeHtml(m)}</option>`).join('')}
            </select>
          </div>
          <button type="button" id="swapCompareBtn" class="swap-btn" title="Tukar Bulan">⇄</button>
          <div>
            <label class="form-label" for="cmpMonthB">Bulan B (Target)</label>
            <select id="cmpMonthB" class="ios-select" style="margin-top:4px;">
              ${months.map((m) => `<option value="${F.escapeHtml(m)}" ${m === monthBName ? 'selected' : ''}>${F.escapeHtml(m)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="compare-options-row">
          <label class="ios-switch">
            <input type="checkbox" id="cmpIncludeSavings" ${includeSav ? 'checked' : ''} />
            <span>Sertakan kategori Tabungan</span>
          </label>
          <span class="section-sub">${F.escapeHtml(shortMonthName(monthAName))} → ${F.escapeHtml(shortMonthName(monthBName))}</span>
        </div>
      </section>

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Selisih Pengeluaran (${F.escapeHtml(shortMonthName(monthAName))} vs ${F.escapeHtml(shortMonthName(monthBName))})</h2>
        </div>
        <div class="delta-grid">
          <div class="delta-box">
            <div class="delta-label"><span class="legend-dot dot-a"></span>${F.escapeHtml(monthAName)}</div>
            <div class="delta-val">${F.formatRupiah(totalA)}</div>
          </div>
          <div class="delta-box">
            <div class="delta-label"><span class="legend-dot dot-b"></span>${F.escapeHtml(monthBName)}</div>
            <div class="delta-val">${F.formatRupiah(totalB)}</div>
          </div>
          <div class="delta-box full">
            <div>
              <div class="delta-label">Perubahan (${F.escapeHtml(shortMonthName(monthBName))} − ${F.escapeHtml(shortMonthName(monthAName))})</div>
              <div class="delta-val" style="font-size:15px;">${F.formatRupiah(diffExp, true)}</div>
            </div>
            <span class="delta-pill ${expPillClass}">${expArrow} ${F.formatPercent(Math.abs(diffExpPct))}</span>
          </div>
        </div>
        <div class="mini-grid two-col" style="margin-top:10px;">
          <div class="mini-stat">
            <div class="mini-stat-label">Pemasukan ${F.escapeHtml(shortMonthName(monthAName))} → ${F.escapeHtml(shortMonthName(monthBName))}</div>
            <div class="mini-stat-val">${F.formatCompact(objA.totalPemasukan)} → ${F.formatCompact(objB.totalPemasukan)}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">Sisa Uang ${F.escapeHtml(shortMonthName(monthAName))} → ${F.escapeHtml(shortMonthName(monthBName))}</div>
            <div class="mini-stat-val">${F.formatCompact(objA.sisaUang)} → ${F.formatCompact(objB.sisaUang)}</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Grafik Tren Bulanan</h2>
          <span class="section-sub">Tap batang untuk pilih</span>
        </div>
        <div class="form-group" style="margin-top:0;margin-bottom:10px;">
          <select id="cmpTrendMetric" class="ios-select" style="padding:9px 12px;font-size:13px;">
            <option value="TOTAL" ${metric === 'TOTAL' ? 'selected' : ''}>📊 Total Pengeluaran${includeSav ? ' (Semua)' : ' (Tanpa Tabungan)'}</option>
            ${(compareData.categories || []).map((c) => `
              <option value="${F.escapeHtml(c)}" ${metric === c ? 'selected' : ''}>${F.getCategoryIcon(c)} Tren Kategori: ${F.escapeHtml(c)}</option>
            `).join('')}
          </select>
        </div>
        <div class="chart-legend">
          <span><span class="legend-dot dot-a"></span>${F.escapeHtml(monthAName)}</span>
          <span><span class="legend-dot dot-b"></span>${F.escapeHtml(monthBName)}</span>
          <span><span class="legend-dot dot-other"></span>Bulan lain</span>
        </div>
        <div class="svg-chart-scroll">
          <svg class="trend-svg" viewBox="0 0 ${svgWidth} 185" preserveAspectRatio="xMinYMid meet">
            ${barsSvg}
          </svg>
        </div>
      </section>

      <section class="card">
        <div class="section-header">
          <h2 class="section-title">Perbandingan per Kategori</h2>
          <span class="section-sub">${catPairs.length} kategori</span>
        </div>
        <div class="segmented" style="margin-bottom:10px;">
          <button type="button" class="seg-btn ${sortMode === 'max' ? 'active' : ''}" data-cmp-sort="max">Terbesar</button>
          <button type="button" class="seg-btn ${sortMode === 'inc' ? 'active' : ''}" data-cmp-sort="inc">Naik Tertinggi</button>
          <button type="button" class="seg-btn ${sortMode === 'dec' ? 'active' : ''}" data-cmp-sort="dec">Paling Hemat</button>
        </div>
        ${catPairs.length ? catPairs.map((item) => {
          const wA = Math.round((item.a / maxCatVal) * 100);
          const wB = Math.round((item.b / maxCatVal) * 100);
          const pillCls = item.diff > 0 ? 'up' : (item.diff < 0 ? 'down' : 'flat');
          const diffSign = item.diff > 0 ? '+' : '';
          return `
            <div class="cmp-cat-row">
              <div class="cmp-cat-head">
                <span class="cmp-cat-name">${F.getCategoryIcon(item.cat)} ${F.escapeHtml(item.cat)}</span>
                <span class="delta-pill ${pillCls}">${diffSign}${F.formatCompact(item.diff)}</span>
              </div>
              <div class="cmp-bars">
                <div class="cmp-bar-line">
                  <span class="cmp-m-tag">${F.escapeHtml(shortMonthName(monthAName))}</span>
                  <div class="cmp-track"><div class="cmp-fill-a" style="width:${wA}%"></div></div>
                  <span class="cmp-num">${F.formatCompact(item.a)}</span>
                </div>
                <div class="cmp-bar-line">
                  <span class="cmp-m-tag" style="color:var(--primary)">${F.escapeHtml(shortMonthName(monthBName))}</span>
                  <div class="cmp-track"><div class="cmp-fill-b" style="width:${wB}%"></div></div>
                  <span class="cmp-num">${F.formatCompact(item.b)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('') : '<div class="empty-state">Belum ada pengeluaran di 2 bulan ini.</div>'}
      </section>
    `;
  }

  global.Components = {
    renderDashboard,
    renderInputForm,
    renderHistoryAndBills,
    renderSavings,
    renderCompare,
    renderSettingsModal,
    renderSavingsModal
  };
})(window);
