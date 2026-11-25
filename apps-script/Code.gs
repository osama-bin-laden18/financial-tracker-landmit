/**
 * ============================================================================
 * BUDGETING TRACKER (LAND & MIT) — GOOGLE APPS SCRIPT BACKEND API
 * ============================================================================
 * Cara pasang:
 * 1. Buka Google Spreadsheet Anda -> menu Extensions -> Apps Script.
 * 2. Hapus kode bawaan di Code.gs, lalu paste seluruh file ini.
 * 3. Ganti API_TOKEN di bawah ini dengan PIN/kode rahasia pilihan Anda (misal "landmit2026").
 * 4. Klik Deploy -> New deployment -> Type: Web app
 *    - Execute as: Me (akun pemilik spreadsheet)
 *    - Who has access: Anyone
 * 5. Salin Web App URL (akhiran /exec) ke halaman Pengaturan di aplikasi iOS PWA.
 * 6. PENTING: Setelah berhasil, ubah sharing Spreadsheet Anda kembali ke Private/Restricted!
 * ============================================================================
 */

// GANTI token ini dengan kode rahasia milik Anda berdua (wajib sama dengan yang diisi di aplikasi HP)
const CONFIG = {
  API_TOKEN: 'GANTI_DENGAN_TOKEN_RAHASIA_ANDA',
  MONTH_SHEETS_ORDER: [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ],
  SAVINGS_SHEET_NAME: 'NEW TABUNGAN',
  DATA_START_ROW: 18,
  // Batas aman agar selalu masuk dalam jangkauan rumus SUMIFS(H18:H996, ...) di semua sheet
  DATA_MAX_ROW: 990,
  RECENT_LIMIT: 40
};

// ============================================================================
// ENTRY POINTS (GET & POST)
// ============================================================================

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    assertAuthorized_(params.token);

    const action = String(params.action || 'bootstrap').trim();
    let result;

    switch (action) {
      case 'ping':
        result = handlePing_();
        break;
      case 'bootstrap':
        result = handleBootstrap_(params.sheet);
        break;
      case 'savings':
        result = handleGetSavings_();
        break;
      default:
        throw new Error('Action GET tidak dikenal: ' + action);
    }

    return jsonResponse_({ ok: true, data: result });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);
    assertAuthorized_(payload.token || (e && e.parameter && e.parameter.token));

    const action = String(payload.action || '').trim();
    if (!action) {
      throw new Error('Parameter "action" wajib diisi.');
    }

    // Kunci eksekusi tulis agar Olan & Mitry tidak bentrok baris jika input bersamaan
    lock.waitLock(15000);

    let result;
    switch (action) {
      case 'addExpense':
        result = handleAddExpense_(payload);
        break;
      case 'addIncome':
        result = handleAddIncome_(payload);
        break;
      case 'addTransfer':
        result = handleAddTransfer_(payload);
        break;
      case 'toggleMandatory':
        result = handleToggleMandatory_(payload);
        break;
      case 'addSavings':
        result = handleAddSavings_(payload);
        break;
      case 'deleteTransaction':
        result = handleDeleteTransaction_(payload);
        break;
      default:
        throw new Error('Action POST tidak dikenal: ' + action);
    }

    SpreadsheetApp.flush();
    return jsonResponse_({ ok: true, data: result });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

// ============================================================================
// AUTH & RESPONSE HELPERS
// ============================================================================

function getEffectiveToken_() {
  const propToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  return (propToken && propToken.trim()) ? propToken.trim() : CONFIG.API_TOKEN;
}

function assertAuthorized_(token) {
  const expected = getEffectiveToken_();
  if (!expected || expected === 'GANTI_DENGAN_TOKEN_RAHASIA_ANDA') {
    throw new Error('API_TOKEN belum diganti di Code.gs. Buka Extensions -> Apps Script dan ubah CONFIG.API_TOKEN terlebih dahulu.');
  }
  if (!token || String(token).trim() !== expected) {
    throw new Error('Token tidak valid atau belum diisi.');
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// READ HANDLERS
// ============================================================================

function handlePing_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    spreadsheetName: ss.getName(),
    timezone: ss.getSpreadsheetTimeZone(),
    months: getAvailableMonthSheets_(ss),
    hasSavingsSheet: Boolean(ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME)),
    serverTime: new Date().toISOString()
  };
}

function handleBootstrap_(requestedSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const months = getAvailableMonthSheets_(ss);
  if (months.length === 0) {
    throw new Error('Tidak ditemukan sheet bulanan (JANUARI - DESEMBER).');
  }

  const activeMonth = resolveMonthSheetName_(months, requestedSheetName);
  const sheet = ss.getSheetByName(activeMonth);
  const tz = ss.getSpreadsheetTimeZone();

  // 1. Ringkasan atas (H8, H10, H12, L6:L14)
  const sisaUang = toNumber_(sheet.getRange('H8').getValue());
  const totalPemasukan = toNumber_(sheet.getRange('H10').getValue());
  const totalPengeluaran = toNumber_(sheet.getRange('H12').getValue());
  const totalSaldoRekening = toNumber_(sheet.getRange('L13').getValue());
  const selisihRekon = toNumber_(sheet.getRange('L14').getValue());
  const bulanLabel = String(sheet.getRange('B10').getDisplayValue() || activeMonth).trim();
  const tahunLabel = String(sheet.getRange('D10').getDisplayValue() || '').trim();

  // 2. Saldo 7 rekening (K6:L12)
  const walletRows = sheet.getRange('K6:L12').getValues();
  const wallets = [];
  for (let i = 0; i < walletRows.length; i++) {
    const name = String(walletRows[i][0] || '').trim();
    if (name) {
      wallets.push({
        name: name,
        balance: toNumber_(walletRows[i][1])
      });
    }
  }

  // 3. Dropdown options dinamis dari sheet
  const incomeCategories = readNonEmptyColumn_(sheet, 'B18:B34');
  const expenseCategories = readNonEmptyColumn_(sheet, 'D18:D34');
  const classifications = readNonEmptyColumn_(sheet, 'B46:B47');
  const owners = readNonEmptyColumn_(sheet, 'D46:D49');
  const walletOptions = readNonEmptyColumn_(sheet, 'W38:W44');

  // 4. Rekap pengeluaran per kategori (W18:Y34)
  const catSummaryRows = sheet.getRange('W18:Y34').getValues();
  const categorySummary = [];
  for (let i = 0; i < catSummaryRows.length; i++) {
    const cat = String(catSummaryRows[i][0] || '').trim();
    if (cat) {
      categorySummary.push({
        category: cat,
        total: toNumber_(catSummaryRows[i][1]),
        percent: toNumber_(catSummaryRows[i][2])
      });
    }
  }

  // 5. Rekap klasifikasi (W52:Y53) & peruntukan (W58:X60)
  const classSummaryRows = sheet.getRange('W52:Y53').getValues();
  const classificationSummary = classSummaryRows
    .filter(r => String(r[0] || '').trim() !== '')
    .map(r => ({
      name: String(r[0]).trim(),
      total: toNumber_(r[1]),
      percent: toNumber_(r[2])
    }));

  const ownerSummaryRows = sheet.getRange('W58:X60').getValues();
  const ownerSummary = ownerSummaryRows
    .filter(r => String(r[0] || '').trim() !== '')
    .map(r => ({
      name: String(r[0]).trim(),
      total: toNumber_(r[1])
    }));

  // 6. Checklist Mandatory (B56:D66)
  const mandatory = readMandatoryBills_(sheet);

  // 7. Riwayat transaksi terakhir (Pemasukan & Pengeluaran)
  const transactions = readMonthlyTransactions_(sheet, tz, CONFIG.RECENT_LIMIT);

  return {
    spreadsheetName: ss.getName(),
    months: months,
    activeMonth: activeMonth,
    monthLabel: bulanLabel,
    yearLabel: tahunLabel,
    summary: {
      sisaUang: sisaUang,
      totalPemasukan: totalPemasukan,
      totalPengeluaran: totalPengeluaran,
      totalSaldoRekening: totalSaldoRekening,
      selisihRekon: selisihRekon
    },
    wallets: wallets,
    options: {
      incomeCategories: incomeCategories,
      expenseCategories: expenseCategories,
      classifications: classifications.length ? classifications : ['Kebutuhan', 'Keinginan'],
      owners: owners.length ? owners : ['Olan', 'Mitry', 'Bersama'],
      wallets: walletOptions.length ? walletOptions : wallets.map(w => w.name)
    },
    categorySummary: categorySummary,
    classificationSummary: classificationSummary,
    ownerSummary: ownerSummary,
    mandatory: mandatory,
    transactions: transactions,
    updatedAt: new Date().toISOString()
  };
}

function handleGetSavings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + CONFIG.SAVINGS_SHEET_NAME + '" tidak ditemukan.');
  }
  const tz = ss.getSpreadsheetTimeZone();

  const summary = {
    sisaUang: toNumber_(sheet.getRange('H8').getValue()),
    totalPemasukan: toNumber_(sheet.getRange('H10').getValue()),
    totalPengeluaran: toNumber_(sheet.getRange('H12').getValue())
  };

  // Rekap jenis aset (V38:X40: Emas, Uang, Saham)
  const assetTypeRows = sheet.getRange('V38:X40').getValues();
  const assetTypes = assetTypeRows
    .filter(r => String(r[0] || '').trim() !== '')
    .map(r => ({
      name: String(r[0]).trim(),
      total: toNumber_(r[1]),
      percent: toNumber_(r[2])
    }));

  // Saldo per rekening tabungan (V57:W61)
  const walletRows = sheet.getRange('V57:W61').getValues();
  const wallets = walletRows
    .filter(r => String(r[0] || '').trim() !== '')
    .map(r => ({
      name: String(r[0]).trim(),
      balance: toNumber_(r[1])
    }));

  const incomeCategories = readNonEmptyColumn_(sheet, 'B18:B34');
  const expenseCategories = readNonEmptyColumn_(sheet, 'D18:D33');
  const owners = readNonEmptyColumn_(sheet, 'B37:B42');
  const classifications = readNonEmptyColumn_(sheet, 'B44:B49');

  const transactions = readSavingsTransactions_(sheet, tz, CONFIG.RECENT_LIMIT);

  return {
    sheetName: CONFIG.SAVINGS_SHEET_NAME,
    summary: summary,
    assetTypes: assetTypes,
    wallets: wallets,
    options: {
      incomeCategories: incomeCategories.length ? incomeCategories : ['Emas', 'Uang', 'Saham'],
      expenseCategories: expenseCategories.length ? expenseCategories : ['Pinjam', 'Gadai', 'Darurat', 'Persiapan'],
      owners: owners.length ? owners : ['Olan', 'Mitry', 'Bersama'],
      classifications: classifications.length ? classifications : ['Kebutuhan', 'Keinginan'],
      wallets: wallets.map(w => w.name)
    },
    transactions: transactions,
    updatedAt: new Date().toISOString()
  };
}

// ============================================================================
// WRITE HANDLERS
// ============================================================================

function handleAddExpense_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTargetMonthSheet_(ss, payload.sheet);

  const dateObj = parseDateInput_(payload.date);
  const amount = parsePositiveAmount_(payload.amount, 'Jumlah pengeluaran');
  const category = requireString_(payload.category, 'Kategori');
  const classification = requireString_(payload.classification || 'Kebutuhan', 'Klasifikasi');
  const owner = requireString_(payload.owner || 'Bersama', 'Peruntukan');
  const wallet = requireString_(payload.wallet, 'Rek Debit');
  const notes = String(payload.notes || '').trim();

  const row = findFirstEmptyRow_(sheet, 15, 16, 17); // Col O(15), P(16), Q(17)

  // Pastikan nomor urut di kolom N(14) terisi jika kosong
  const noCell = sheet.getRange(row, 14);
  if (noCell.getValue() === '' || noCell.getValue() === null) {
    noCell.setValue(row - CONFIG.DATA_START_ROW + 1);
  }

  // Tulis O:U (kolom 15..21) tanpa menyentuh kolom rumus W:Y
  sheet.getRange(row, 15, 1, 7).setValues([[
    dateObj,
    amount,
    category,
    classification,
    owner,
    wallet,
    notes
  ]]);

  return {
    row: row,
    sheet: sheet.getName(),
    type: 'expense',
    bootstrap: handleBootstrap_(sheet.getName())
  };
}

function handleAddIncome_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTargetMonthSheet_(ss, payload.sheet);

  const dateObj = parseDateInput_(payload.date);
  const amount = parseNonZeroAmount_(payload.amount, 'Jumlah pemasukan');
  const category = requireString_(payload.category, 'Kategori');
  const owner = String(payload.owner || '').trim();
  const details = String(payload.details || payload.notes || '').trim();
  const wallet = requireString_(payload.wallet, 'Rek Kredit');

  const row = findFirstEmptyRow_(sheet, 7, 8, 9); // Col G(7), H(8), I(9)

  const noCell = sheet.getRange(row, 6); // Col F(6)
  if (noCell.getValue() === '' || noCell.getValue() === null) {
    noCell.setValue(row - CONFIG.DATA_START_ROW + 1);
  }

  // Tulis G:L (kolom 7..12)
  sheet.getRange(row, 7, 1, 6).setValues([[
    dateObj,
    amount,
    category,
    owner,
    details,
    wallet
  ]]);

  return {
    row: row,
    sheet: sheet.getName(),
    type: 'income',
    bootstrap: handleBootstrap_(sheet.getName())
  };
}

function handleAddTransfer_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTargetMonthSheet_(ss, payload.sheet);

  const dateObj = parseDateInput_(payload.date);
  const amount = parsePositiveAmount_(payload.amount, 'Nominal transfer');
  const fromWallet = requireString_(payload.fromWallet, 'Rekening asal');
  const toWallet = requireString_(payload.toWallet, 'Rekening tujuan');
  const notes = String(payload.notes || 'distribusi duit').trim();
  const adminFee = toNumber_(payload.adminFee);
  const feeOwner = String(payload.owner || 'Bersama').trim();

  if (fromWallet === toWallet) {
    throw new Error('Rekening asal dan tujuan tidak boleh sama.');
  }

  // Tulis 2 baris di tabel Pemasukan (G:L): -amount dari asal, +amount ke tujuan
  const rowOut = findFirstEmptyRow_(sheet, 7, 8, 9);
  if (rowOut + 1 > CONFIG.DATA_MAX_ROW) {
    throw new Error('Baris pemasukan hampir penuh.');
  }

  const noOutCell = sheet.getRange(rowOut, 6);
  if (noOutCell.getValue() === '' || noOutCell.getValue() === null) {
    noOutCell.setValue(rowOut - CONFIG.DATA_START_ROW + 1);
  }
  const noInCell = sheet.getRange(rowOut + 1, 6);
  if (noInCell.getValue() === '' || noInCell.getValue() === null) {
    noInCell.setValue((rowOut + 1) - CONFIG.DATA_START_ROW + 1);
  }

  sheet.getRange(rowOut, 7, 2, 6).setValues([
    [dateObj, -amount, 'Transfer', '', notes, fromWallet],
    [dateObj,  amount, 'Transfer', '', notes, toWallet]
  ]);

  // Opsional: jika ada biaya admin transfer (misal Rp 2.500), catat otomatis di Pengeluaran
  let feeRow = null;
  if (adminFee > 0) {
    feeRow = findFirstEmptyRow_(sheet, 15, 16, 17);
    const feeNoCell = sheet.getRange(feeRow, 14);
    if (feeNoCell.getValue() === '' || feeNoCell.getValue() === null) {
      feeNoCell.setValue(feeRow - CONFIG.DATA_START_ROW + 1);
    }
    sheet.getRange(feeRow, 15, 1, 7).setValues([[
      dateObj,
      adminFee,
      'Lain-lain',
      'Kebutuhan',
      feeOwner,
      fromWallet,
      'admin tf (' + fromWallet + ' -> ' + toWallet + ')'
    ]]);
  }

  return {
    rows: [rowOut, rowOut + 1],
    feeRow: feeRow,
    sheet: sheet.getName(),
    type: 'transfer',
    bootstrap: handleBootstrap_(sheet.getName())
  };
}

function handleToggleMandatory_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTargetMonthSheet_(ss, payload.sheet);

  const row = parseInt(payload.row, 10);
  if (isNaN(row) || row < 55 || row > 70) {
    throw new Error('Baris tagihan mandatory tidak valid: ' + payload.row);
  }

  const label = String(sheet.getRange(row, 3).getDisplayValue() || '').trim();
  if (!label || /^(total|sisa|tagihan)$/i.test(label)) {
    throw new Error('Baris ' + row + ' bukan item tagihan mandatory.');
  }

  const checked = Boolean(payload.checked);
  sheet.getRange(row, 2).setValue(checked);

  return {
    row: row,
    checked: checked,
    mandatory: readMandatoryBills_(sheet)
  };
}

function handleAddSavings_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + CONFIG.SAVINGS_SHEET_NAME + '" tidak ditemukan.');
  }

  const mode = String(payload.mode || 'income').trim(); // 'income' | 'expense'
  const dateObj = parseDateInput_(payload.date);
  const wallet = requireString_(payload.wallet, 'Rekening Tabungan');

  if (mode === 'income') {
    const amount = parseNonZeroAmount_(payload.amount, 'Jumlah pemasukan tabungan');
    const category = String(payload.category || '').trim();
    const notes = String(payload.notes || '').trim();

    const row = findFirstEmptyRow_(sheet, 7, 8, 10); // G(7), H(8), J(10)
    const noCell = sheet.getRange(row, 6);
    if (noCell.getValue() === '' || noCell.getValue() === null) {
      noCell.setValue(row - CONFIG.DATA_START_ROW + 1);
    }
    // NEW TABUNGAN Pemasukan: G=Tanggal, H=Jumlah, I=Kategori, J=Rek Kredit, K=Keterangan
    sheet.getRange(row, 7, 1, 5).setValues([[
      dateObj,
      amount,
      category,
      wallet,
      notes
    ]]);

    return { row: row, mode: 'income', savings: handleGetSavings_() };
  }

  if (mode === 'expense') {
    const amount = parsePositiveAmount_(payload.amount, 'Jumlah pengeluaran tabungan');
    const category = requireString_(payload.category || 'Darurat', 'Kategori');
    const classification = requireString_(payload.classification || 'Kebutuhan', 'Klasifikasi');
    const owner = requireString_(payload.owner || 'Bersama', 'Peruntukan');
    const notes = String(payload.notes || '').trim();

    const row = findFirstEmptyRow_(sheet, 14, 15, 16); // N(14), O(15), P(16)
    const noCell = sheet.getRange(row, 13); // M(13)
    if (noCell.getValue() === '' || noCell.getValue() === null) {
      noCell.setValue(row - CONFIG.DATA_START_ROW + 1);
    }
    // NEW TABUNGAN Pengeluaran: N=Tanggal, O=Jumlah, P=Kategori, Q=Klasifikasi, R=Rek Kredit, S=Keterangan, T=Notes
    sheet.getRange(row, 14, 1, 7).setValues([[
      dateObj,
      amount,
      category,
      classification,
      wallet,
      owner,
      notes
    ]]);

    return { row: row, mode: 'expense', savings: handleGetSavings_() };
  }

  throw new Error('Mode tabungan harus "income" atau "expense".');
}

function handleDeleteTransaction_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scope = String(payload.scope || 'monthly').trim(); // 'monthly' | 'savings'
  const type = String(payload.type || '').trim(); // 'income' | 'expense'
  const row = parseInt(payload.row, 10);

  if (isNaN(row) || row < CONFIG.DATA_START_ROW || row > CONFIG.DATA_MAX_ROW) {
    throw new Error('Nomor baris tidak valid: ' + payload.row);
  }

  if (scope === 'savings') {
    const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
    if (!sheet) throw new Error('Sheet tabungan tidak ditemukan.');
    if (type === 'income') {
      // Kosongkan HANYA kolom data G:K (tidak hapus baris agar tidak merusak tabel sebelahnya & rumus!)
      sheet.getRange(row, 7, 1, 5).clearContent();
    } else if (type === 'expense') {
      sheet.getRange(row, 14, 1, 7).clearContent();
    } else {
      throw new Error('Tipe transaksi tidak valid.');
    }
    return { deletedRow: row, scope: scope, type: type, savings: handleGetSavings_() };
  }

  const sheet = getTargetMonthSheet_(ss, payload.sheet);
  if (type === 'income') {
    sheet.getRange(row, 7, 1, 6).clearContent();
  } else if (type === 'expense') {
    sheet.getRange(row, 15, 1, 7).clearContent();
  } else {
    throw new Error('Tipe transaksi tidak valid.');
  }

  return {
    deletedRow: row,
    scope: scope,
    type: type,
    sheet: sheet.getName(),
    bootstrap: handleBootstrap_(sheet.getName())
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getAvailableMonthSheets_(ss) {
  const existing = ss.getSheets().map(s => s.getName());
  const existingMap = {};
  existing.forEach(n => { existingMap[n.toUpperCase()] = n; });

  const ordered = [];
  CONFIG.MONTH_SHEETS_ORDER.forEach(m => {
    if (existingMap[m]) ordered.push(existingMap[m]);
  });
  return ordered;
}

function resolveMonthSheetName_(months, requested) {
  if (requested) {
    const match = months.find(m => m.toUpperCase() === String(requested).trim().toUpperCase());
    if (match) return match;
  }
  // Default: bulan berjalan jika ada, kalau tidak bulan terakhir yang tersedia
  const currentMonthIdx = new Date().getMonth(); // 0..11
  const currentMonthName = CONFIG.MONTH_SHEETS_ORDER[currentMonthIdx];
  const currentMatch = months.find(m => m.toUpperCase() === currentMonthName);
  return currentMatch || months[months.length - 1];
}

function getTargetMonthSheet_(ss, sheetName) {
  const months = getAvailableMonthSheets_(ss);
  const resolved = resolveMonthSheetName_(months, sheetName);
  const sheet = ss.getSheetByName(resolved);
  if (!sheet) {
    throw new Error('Sheet bulan "' + resolved + '" tidak ditemukan.');
  }
  return sheet;
}

function readNonEmptyColumn_(sheet, a1Range) {
  const vals = sheet.getRange(a1Range).getValues();
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const v = String(vals[i][0] || '').trim();
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

function findFirstEmptyRow_(sheet, colA, colB, colC) {
  const numRows = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
  const minCol = Math.min(colA, colB, colC);
  const maxCol = Math.max(colA, colB, colC);
  const vals = sheet.getRange(CONFIG.DATA_START_ROW, minCol, numRows, maxCol - minCol + 1).getValues();

  const offA = colA - minCol;
  const offB = colB - minCol;
  const offC = colC - minCol;

  for (let i = 0; i < vals.length; i++) {
    const a = vals[i][offA];
    const b = vals[i][offB];
    const c = vals[i][offC];
    const isEmpty = (a === '' || a === null) && (b === '' || b === null) && (c === '' || c === null);
    if (isEmpty) {
      return CONFIG.DATA_START_ROW + i;
    }
  }
  throw new Error('Tabel sudah penuh mencapai baris ' + CONFIG.DATA_MAX_ROW + '.');
}

function readMandatoryBills_(sheet) {
  const rangeVals = sheet.getRange('B55:D70').getValues();
  const items = [];
  let total = 0;
  let remaining = 0;

  for (let i = 0; i < rangeVals.length; i++) {
    const rowNum = 55 + i;
    const checkedVal = rangeVals[i][0];
    const label = String(rangeVals[i][1] || '').trim();
    const amount = toNumber_(rangeVals[i][2]);

    if (!label || /^tagihan$/i.test(label)) continue;
    if (/^total$/i.test(label)) {
      total = amount;
      continue;
    }
    if (/^sisa$/i.test(label)) {
      remaining = amount;
      continue;
    }

    const isChecked = checkedVal === true || checkedVal === 1 || String(checkedVal).toUpperCase() === 'TRUE';
    items.push({
      row: rowNum,
      name: label,
      amount: amount,
      checked: isChecked
    });
  }

  if (total === 0 && items.length > 0) {
    total = items.reduce((acc, it) => acc + it.amount, 0);
    remaining = items.filter(it => !it.checked).reduce((acc, it) => acc + it.amount, 0);
  }

  return {
    items: items,
    total: total,
    remaining: remaining
  };
}

function readMonthlyTransactions_(sheet, tz, limit) {
  const numRows = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
  // Baca sekali jalan untuk performa cepat: G:L (income) dan O:U (expense)
  const incomeVals = sheet.getRange(CONFIG.DATA_START_ROW, 7, numRows, 6).getValues();
  const expenseVals = sheet.getRange(CONFIG.DATA_START_ROW, 15, numRows, 7).getValues();

  const list = [];

  for (let i = 0; i < incomeVals.length; i++) {
    const r = incomeVals[i];
    if ((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null)) continue;
    const amount = toNumber_(r[1]);
    list.push({
      id: 'in-' + (CONFIG.DATA_START_ROW + i),
      row: CONFIG.DATA_START_ROW + i,
      type: 'income',
      date: formatDateValue_(r[0], tz),
      amount: amount,
      category: String(r[2] || '').trim(),
      owner: String(r[3] || '').trim(),
      notes: String(r[4] || '').trim(),
      wallet: String(r[5] || '').trim(),
      classification: ''
    });
  }

  for (let i = 0; i < expenseVals.length; i++) {
    const r = expenseVals[i];
    if ((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null)) continue;
    const amount = toNumber_(r[1]);
    list.push({
      id: 'out-' + (CONFIG.DATA_START_ROW + i),
      row: CONFIG.DATA_START_ROW + i,
      type: 'expense',
      date: formatDateValue_(r[0], tz),
      amount: amount,
      category: String(r[2] || '').trim(),
      classification: String(r[3] || '').trim(),
      owner: String(r[4] || '').trim(),
      wallet: String(r[5] || '').trim(),
      notes: String(r[6] || '').trim()
    });
  }

  // Urutkan terbaru dulu (tanggal desc, lalu row desc)
  list.sort(function (a, b) {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return b.row - a.row;
  });

  return list.slice(0, limit);
}

function readSavingsTransactions_(sheet, tz, limit) {
  const numRows = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
  const incomeVals = sheet.getRange(CONFIG.DATA_START_ROW, 7, numRows, 5).getValues();   // G:K
  const expenseVals = sheet.getRange(CONFIG.DATA_START_ROW, 14, numRows, 7).getValues(); // N:T

  const list = [];

  for (let i = 0; i < incomeVals.length; i++) {
    const r = incomeVals[i];
    if ((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null)) continue;
    list.push({
      id: 'sav-in-' + (CONFIG.DATA_START_ROW + i),
      row: CONFIG.DATA_START_ROW + i,
      type: 'income',
      date: formatDateValue_(r[0], tz),
      amount: toNumber_(r[1]),
      category: String(r[2] || '').trim(),
      wallet: String(r[3] || '').trim(),
      notes: String(r[4] || '').trim(),
      owner: '',
      classification: ''
    });
  }

  for (let i = 0; i < expenseVals.length; i++) {
    const r = expenseVals[i];
    if ((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null)) continue;
    list.push({
      id: 'sav-out-' + (CONFIG.DATA_START_ROW + i),
      row: CONFIG.DATA_START_ROW + i,
      type: 'expense',
      date: formatDateValue_(r[0], tz),
      amount: toNumber_(r[1]),
      category: String(r[2] || '').trim(),
      classification: String(r[3] || '').trim(),
      wallet: String(r[4] || '').trim(),
      owner: String(r[5] || '').trim(),
      notes: String(r[6] || '').trim()
    });
  }

  list.sort(function (a, b) {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return b.row - a.row;
  });

  return list.slice(0, limit);
}

function parseDateInput_(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    throw new Error('Format tanggal tidak valid (gunakan YYYY-MM-DD): ' + dateStr);
  }
  return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
}

function formatDateValue_(val, tz) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  }
  if (!val) return '';
  return String(val).trim();
}

function parsePositiveAmount_(val, label) {
  const num = toNumber_(val);
  if (!isFinite(num) || num <= 0) {
    throw new Error(label + ' harus lebih dari 0.');
  }
  return Math.round(num);
}

function parseNonZeroAmount_(val, label) {
  const num = toNumber_(val);
  if (!isFinite(num) || num === 0) {
    throw new Error(label + ' tidak boleh 0.');
  }
  return Math.round(num);
}

function requireString_(val, label) {
  const s = String(val || '').trim();
  if (!s) throw new Error(label + ' wajib diisi.');
  return s;
}

function toNumber_(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
