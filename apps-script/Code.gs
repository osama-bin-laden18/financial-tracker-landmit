/**
 * ============================================================================
 * BUDGETING TRACKER (LAND & MIT) — GOOGLE APPS SCRIPT BACKEND API (v2 FAST)
 * ============================================================================
 * Perubahan v2:
 * - Batch Read: 19 panggilan getRange() dipadatkan menjadi 2 panggilan saja (~3-4x lebih cepat)
 * - Fast Write: 1x setValues() tanpa baca ulang seluruh sheet di akhir POST
 * - Endpoint baru GET ?action=compare (lintas semua bulan + CacheService 5 menit)
 *
 * Cara update di Apps Script:
 * 1. Buka Extensions -> Apps Script di Google Spreadsheet Anda.
 * 2. Ganti seluruh isi Code.gs dengan file ini (JANGAN lupa isi kembali API_TOKEN Anda!).
 * 3. Save (Ctrl+S).
 * 4. Klik Deploy -> Manage deployments -> Edit (ikon pensil) -> Version: New version -> Deploy.
 *    (URL /exec tetap sama persis, tidak perlu diubah di HP!)
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
  RECENT_LIMIT: 40,
  COMPARE_CACHE_KEY: 'landmit_compare_v2',
  COMPARE_CACHE_TTL: 300 // 5 menit
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
      case 'compare':
        result = handleCompare_(params.force === '1');
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
      case 'updateTransaction':
        result = handleUpdateTransaction_(payload);
        break;
      default:
        throw new Error('Action POST tidak dikenal: ' + action);
    }

    // Hapus cache perbandingan agar data grafik langsung segar saat dibuka lagi
    invalidateCompareCache_();
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
// AUTH, CACHE & RESPONSE HELPERS
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

function invalidateCompareCache_() {
  try {
    CacheService.getScriptCache().remove(CONFIG.COMPARE_CACHE_KEY);
  } catch (_) {}
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// READ HANDLERS (BATCHED FOR HIGH SPEED)
// ============================================================================

function handlePing_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    version: 'v3-full',
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

  // RPC 1: Baca seluruh blok dashboard, dropdown, rekap, dan mandatory sekaligus (B6:Y70)
  // Row r -> idx (r - 6), Col c (B=2..Y=25) -> idx (c - 2)
  const grid = sheet.getRange('B6:Y70').getValues();
  const at = function (row, col) { return grid[row - 6][col - 2]; };

  const bulanLabel = String(at(10, 2) || activeMonth).trim(); // B10
  const tahunLabel = String(at(10, 4) || '').trim();          // D10
  const sisaUang = toNumber_(at(8, 8));                       // H8
  const totalPemasukan = toNumber_(at(10, 8));                // H10
  const totalPengeluaran = toNumber_(at(12, 8));              // H12

  // Baca tabel saldo rekening secara dinamis (mendukung 7, 8, 9+ rekening)
  // Blok atas: K6:L16 (berhenti sebelum header tabel baris 17)
  // Blok Rekap Kepemilikan: W38:X49 (berhenti sebelum blok Rekap Pengeluaran)
  const topWalletBlock = extractWalletBlockFromGrid_(grid, 6, 2, 6, 16, 11, 12);
  const rekapWalletBlock = extractWalletBlockFromGrid_(grid, 6, 2, 38, 49, 23, 24);

  const primaryWalletBlock = (rekapWalletBlock.wallets.length > topWalletBlock.wallets.length)
    ? rekapWalletBlock
    : topWalletBlock;
  const secondaryWalletBlock = (primaryWalletBlock === rekapWalletBlock)
    ? topWalletBlock
    : rekapWalletBlock;

  const wallets = primaryWalletBlock.wallets.slice();
  const seenWallets = {};
  wallets.forEach(function (w) { seenWallets[w.name] = true; });
  secondaryWalletBlock.wallets.forEach(function (w) {
    if (!seenWallets[w.name]) {
      wallets.push(w);
      seenWallets[w.name] = true;
    }
  });

  const totalSaldoRekening = (primaryWalletBlock.total !== null)
    ? primaryWalletBlock.total
    : wallets.reduce(function (sum, w) { return sum + w.balance; }, 0);
  const selisihRekon = (primaryWalletBlock.selisih !== null)
    ? primaryWalletBlock.selisih
    : (totalSaldoRekening - sisaUang);

  // Dropdown options dinamis dari grid
  const incomeCategories = readUniqueFromGrid_(grid, 6, 2, 18, 34, 2);   // B18:B34
  const expenseCategories = readUniqueFromGrid_(grid, 6, 2, 18, 34, 4);  // D18:D34
  const classifications = readUniqueFromGrid_(grid, 6, 2, 46, 47, 2);    // B46:B47
  const owners = readUniqueFromGrid_(grid, 6, 2, 46, 49, 4);             // D46:D49
  const walletOptions = wallets.map(function (w) { return w.name; });

  // Rekap pengeluaran per kategori (W18:Y34 -> col 23, 24, 25)
  const categorySummary = [];
  for (let r = 18; r <= 34; r++) {
    const cat = String(at(r, 23) || '').trim();
    if (cat) {
      categorySummary.push({
        category: cat,
        total: toNumber_(at(r, 24)),
        percent: toNumber_(at(r, 25))
      });
    }
  }

  // Rekap klasifikasi & peruntukan (dinamis di W47:Y70 agar aman jika tabel Rekap Kepemilikan bertambah baris)
  const classificationSummary = extractClassificationSummaryFromGrid_(grid, 6, 2);
  const ownerSummary = extractOwnerSummaryFromGrid_(grid, 6, 2);

  // Checklist Mandatory (B55:D70 -> col 2, 3, 4)
  const mandatory = extractMandatoryFromGrid_(grid, 6, 2);

  // RPC 2: Baca transaksi Pemasukan (G:L) & Pengeluaran (O:U) dalam 1 panggilan (G18:U{lastRow})
  const transactions = readMonthlyTransactionsFast_(sheet, tz, CONFIG.RECENT_LIMIT);

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

  // RPC 1: Baca seluruh area dashboard & rekap tabungan sekaligus (B8:X61)
  const grid = sheet.getRange('B8:X61').getValues();
  const at = function (row, col) { return grid[row - 8][col - 2]; };

  const summary = {
    sisaUang: toNumber_(at(8, 8)),          // H8
    totalPemasukan: toNumber_(at(10, 8)),   // H10
    totalPengeluaran: toNumber_(at(12, 8))  // H12
  };

  // Rekap jenis aset (V38:X40 -> col 22, 23, 24)
  const assetTypes = [];
  for (let r = 38; r <= 40; r++) {
    const name = String(at(r, 22) || '').trim();
    if (name) {
      assetTypes.push({
        name: name,
        total: toNumber_(at(r, 23)),
        percent: toNumber_(at(r, 24))
      });
    }
  }

  // Saldo rekening tabungan (V57:W61 -> col 22, 23)
  const wallets = [];
  for (let r = 57; r <= 61; r++) {
    const name = String(at(r, 22) || '').trim();
    if (name) {
      wallets.push({ name: name, balance: toNumber_(at(r, 23)) });
    }
  }

  const incomeCategories = readUniqueFromGrid_(grid, 8, 2, 18, 34, 2);   // B18:B34
  const expenseCategories = readUniqueFromGrid_(grid, 8, 2, 18, 33, 4);  // D18:D33
  const owners = readUniqueFromGrid_(grid, 8, 2, 37, 42, 2);             // B37:B42
  const classifications = readUniqueFromGrid_(grid, 8, 2, 44, 49, 2);    // B44:B49

  // RPC 2: Baca transaksi tabungan (G18:T{lastRow}) dalam 1 panggilan
  const transactions = readSavingsTransactionsFast_(sheet, tz, CONFIG.RECENT_LIMIT);

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

function handleCompare_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    try {
      const cached = cache.get(CONFIG.COMPARE_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const months = getAvailableMonthSheets_(ss);
  const categoriesOrder = [];
  const monthlyData = [];

  for (let mIdx = 0; mIdx < months.length; mIdx++) {
    const mName = months[mIdx];
    const sheet = ss.getSheetByName(mName);
    if (!sheet) continue;

    // 1 batch read kecil per bulan: H8:X34 (27 baris x 17 kolom)
    // H=8 (idx 0), W=23 (idx 15), X=24 (idx 16)
    const block = sheet.getRange('H8:X34').getValues();
    const sisaUang = toNumber_(block[0][0]);         // H8
    const totalPemasukan = toNumber_(block[2][0]);   // H10
    const totalPengeluaran = toNumber_(block[4][0]); // H12

    const categories = {};
    for (let r = 18; r <= 34; r++) {
      const rowArr = block[r - 8];
      const cat = String(rowArr[15] || '').trim(); // W
      if (!cat) continue;
      const val = toNumber_(rowArr[16]);           // X
      categories[cat] = val;
      if (categoriesOrder.indexOf(cat) === -1) {
        categoriesOrder.push(cat);
      }
    }

    monthlyData.push({
      month: mName,
      totalPemasukan: totalPemasukan,
      totalPengeluaran: totalPengeluaran,
      sisaUang: sisaUang,
      categories: categories
    });
  }

  const result = {
    months: months,
    categories: categoriesOrder,
    monthly: monthlyData,
    updatedAt: new Date().toISOString()
  };

  try {
    cache.put(CONFIG.COMPARE_CACHE_KEY, JSON.stringify(result), CONFIG.COMPARE_CACHE_TTL);
  } catch (_) {}

  return result;
}

// ============================================================================
// WRITE HANDLERS (FAST 1-RPC WRITES, NO REDUNDANT BOOTSTRAP)
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

  const row = findFirstEmptyRowFast_(sheet, 15, 16, 17); // Col O(15), P(16), Q(17)
  const seqNo = row - CONFIG.DATA_START_ROW + 1;

  // Tulis N:U (8 kolom termasuk No) dalam 1 panggilan setValues saja
  sheet.getRange(row, 14, 1, 8).setValues([[
    seqNo,
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
    serverTime: new Date().toISOString()
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

  const row = findFirstEmptyRowFast_(sheet, 7, 8, 9); // Col G(7), H(8), I(9)
  const seqNo = row - CONFIG.DATA_START_ROW + 1;

  // Tulis F:L (7 kolom termasuk No) dalam 1 panggilan setValues saja
  sheet.getRange(row, 6, 1, 7).setValues([[
    seqNo,
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
    serverTime: new Date().toISOString()
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

  const rowOut = findFirstEmptyRowFast_(sheet, 7, 8, 9);
  if (rowOut + 1 > CONFIG.DATA_MAX_ROW) {
    throw new Error('Baris pemasukan hampir penuh.');
  }

  const seqOut = rowOut - CONFIG.DATA_START_ROW + 1;
  // Tulis 2 baris F:L sekaligus dalam 1 panggilan setValues
  sheet.getRange(rowOut, 6, 2, 7).setValues([
    [seqOut,     dateObj, -amount, 'Transfer', '', notes, fromWallet],
    [seqOut + 1, dateObj,  amount, 'Transfer', '', notes, toWallet]
  ]);

  let feeRow = null;
  if (adminFee > 0) {
    feeRow = findFirstEmptyRowFast_(sheet, 15, 16, 17);
    const feeSeq = feeRow - CONFIG.DATA_START_ROW + 1;
    sheet.getRange(feeRow, 14, 1, 8).setValues([[
      feeSeq,
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
    serverTime: new Date().toISOString()
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
    serverTime: new Date().toISOString()
  };
}

function handleAddSavings_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + CONFIG.SAVINGS_SHEET_NAME + '" tidak ditemukan.');
  }

  const mode = String(payload.mode || 'income').trim();
  const dateObj = parseDateInput_(payload.date);
  const wallet = requireString_(payload.wallet, 'Rekening Tabungan');

  if (mode === 'income') {
    const amount = parseNonZeroAmount_(payload.amount, 'Jumlah pemasukan tabungan');
    const category = String(payload.category || '').trim();
    const notes = String(payload.notes || '').trim();

    const row = findFirstEmptyRowFast_(sheet, 7, 8, 10); // G(7), H(8), J(10)
    const seqNo = row - CONFIG.DATA_START_ROW + 1;
    // F:K (6 kolom termasuk No) dalam 1 panggilan
    sheet.getRange(row, 6, 1, 6).setValues([[
      seqNo,
      dateObj,
      amount,
      category,
      wallet,
      notes
    ]]);

    return { row: row, mode: 'income', serverTime: new Date().toISOString() };
  }

  if (mode === 'expense') {
    const amount = parsePositiveAmount_(payload.amount, 'Jumlah pengeluaran tabungan');
    const category = requireString_(payload.category || 'Darurat', 'Kategori');
    const classification = requireString_(payload.classification || 'Kebutuhan', 'Klasifikasi');
    const owner = requireString_(payload.owner || 'Bersama', 'Peruntukan');
    const notes = String(payload.notes || '').trim();

    const row = findFirstEmptyRowFast_(sheet, 14, 15, 16); // N(14), O(15), P(16)
    const seqNo = row - CONFIG.DATA_START_ROW + 1;
    // M:T (8 kolom termasuk No) dalam 1 panggilan
    sheet.getRange(row, 13, 1, 8).setValues([[
      seqNo,
      dateObj,
      amount,
      category,
      classification,
      wallet,
      owner,
      notes
    ]]);

    return { row: row, mode: 'expense', serverTime: new Date().toISOString() };
  }

  throw new Error('Mode tabungan harus "income" atau "expense".');
}

function handleDeleteTransaction_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scope = String(payload.scope || 'monthly').trim();
  const type = String(payload.type || '').trim();
  const row = parseInt(payload.row, 10);

  if (isNaN(row) || row < CONFIG.DATA_START_ROW || row > CONFIG.DATA_MAX_ROW) {
    throw new Error('Nomor baris tidak valid: ' + payload.row);
  }

  if (scope === 'savings') {
    const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
    if (!sheet) throw new Error('Sheet tabungan tidak ditemukan.');
    if (type === 'income') {
      sheet.getRange(row, 7, 1, 5).clearContent();
    } else if (type === 'expense') {
      sheet.getRange(row, 14, 1, 7).clearContent();
    } else {
      throw new Error('Tipe transaksi tidak valid.');
    }
    return { deletedRow: row, scope: scope, type: type };
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
    sheet: sheet.getName()
  };
}

function handleUpdateTransaction_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scope = String(payload.scope || 'monthly').trim();
  const type = String(payload.type || '').trim();
  const row = parseInt(payload.row, 10);

  if (isNaN(row) || row < CONFIG.DATA_START_ROW || row > CONFIG.DATA_MAX_ROW) {
    throw new Error('Nomor baris tidak valid: ' + payload.row);
  }

  const dateObj = parseDateInput_(payload.date);

  if (scope === 'savings') {
    const sheet = ss.getSheetByName(CONFIG.SAVINGS_SHEET_NAME);
    if (!sheet) throw new Error('Sheet tabungan tidak ditemukan.');
    const wallet = requireString_(payload.wallet, 'Rekening Tabungan');
    if (type === 'income') {
      const amount = parseNonZeroAmount_(payload.amount, 'Jumlah');
      sheet.getRange(row, 7, 1, 5).setValues([[
        dateObj, amount, String(payload.category || '').trim(), wallet, String(payload.notes || '').trim()
      ]]);
    } else if (type === 'expense') {
      const amount = parsePositiveAmount_(payload.amount, 'Jumlah');
      sheet.getRange(row, 14, 1, 7).setValues([[
        dateObj, amount,
        requireString_(payload.category || 'Darurat', 'Kategori'),
        requireString_(payload.classification || 'Kebutuhan', 'Klasifikasi'),
        wallet,
        requireString_(payload.owner || 'Bersama', 'Peruntukan'),
        String(payload.notes || '').trim()
      ]]);
    } else {
      throw new Error('Tipe transaksi tidak valid.');
    }
    return { updatedRow: row, scope: scope, type: type, serverTime: new Date().toISOString() };
  }

  const sheet = getTargetMonthSheet_(ss, payload.sheet);
  if (type === 'expense') {
    const amount = parsePositiveAmount_(payload.amount, 'Jumlah pengeluaran');
    sheet.getRange(row, 15, 1, 7).setValues([[
      dateObj,
      amount,
      requireString_(payload.category, 'Kategori'),
      requireString_(payload.classification || 'Kebutuhan', 'Klasifikasi'),
      requireString_(payload.owner || 'Bersama', 'Peruntukan'),
      requireString_(payload.wallet, 'Rek Debit'),
      String(payload.notes || '').trim()
    ]]);
  } else if (type === 'income') {
    const amount = parseNonZeroAmount_(payload.amount, 'Jumlah pemasukan');
    sheet.getRange(row, 7, 1, 6).setValues([[
      dateObj,
      amount,
      requireString_(payload.category, 'Kategori'),
      String(payload.owner || '').trim(),
      String(payload.notes || payload.details || '').trim(),
      requireString_(payload.wallet, 'Rek Kredit')
    ]]);
  } else {
    throw new Error('Tipe transaksi tidak valid.');
  }

  return {
    updatedRow: row,
    scope: scope,
    type: type,
    sheet: sheet.getName(),
    serverTime: new Date().toISOString()
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
  const currentMonthIdx = new Date().getMonth();
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

function readUniqueFromGrid_(grid, baseRow, baseCol, startRow, endRow, col) {
  const out = [];
  const cIdx = col - baseCol;
  for (let r = startRow; r <= endRow; r++) {
    const v = String(grid[r - baseRow][cIdx] || '').trim();
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

function extractWalletBlockFromGrid_(grid, baseRow, baseCol, startRow, endRow, nameCol, valCol) {
  const wallets = [];
  let total = null;
  let selisih = null;
  let reachedSummary = false;

  for (let r = startRow; r <= endRow; r++) {
    const rowArr = grid[r - baseRow];
    if (!rowArr) break;
    const rawName = String(rowArr[nameCol - baseCol] || '').trim();
    const rawVal = rowArr[valCol - baseCol];
    if (!rawName) continue;

    if (/^total$/i.test(rawName)) {
      total = toNumber_(rawVal);
      reachedSummary = true;
      continue;
    }
    if (/^selisih$/i.test(rawName)) {
      selisih = toNumber_(rawVal);
      reachedSummary = true;
      continue;
    }
    if (/^(kategori|rincian|peruntukan|tanggal)$/i.test(rawName) || /^rekap\b/i.test(rawName)) {
      break;
    }
    if (!reachedSummary) {
      wallets.push({ name: rawName, balance: toNumber_(rawVal) });
    }
  }

  return { wallets: wallets, total: total, selisih: selisih };
}

function extractClassificationSummaryFromGrid_(grid, baseRow, baseCol) {
  const out = [];
  const colW = 23 - baseCol;
  const colX = 24 - baseCol;
  const colY = 25 - baseCol;
  let headerRow = -1;

  for (let r = 47; r <= 68; r++) {
    const rowArr = grid[r - baseRow];
    if (!rowArr) break;
    const wVal = String(rowArr[colW] || '').trim();
    const yVal = String(rowArr[colY] || '').trim();
    if (/^kategori$/i.test(wVal) && yVal === '%') {
      headerRow = r;
      break;
    }
  }

  const startRow = headerRow !== -1 ? headerRow + 1 : 52;
  const endRow = headerRow !== -1 ? Math.min(headerRow + 6, 70) : 53;
  for (let r = startRow; r <= endRow; r++) {
    const rowArr = grid[r - baseRow];
    if (!rowArr) break;
    const name = String(rowArr[colW] || '').trim();
    if (!name || /^total$/i.test(name) || /^rekap\b/i.test(name)) break;
    out.push({
      name: name,
      total: toNumber_(rowArr[colX]),
      percent: toNumber_(rowArr[colY])
    });
  }
  return out;
}

function extractOwnerSummaryFromGrid_(grid, baseRow, baseCol) {
  const out = [];
  const colW = 23 - baseCol;
  const colX = 24 - baseCol;
  let headerRow = -1;

  for (let r = 47; r <= 68; r++) {
    const rowArr = grid[r - baseRow];
    if (!rowArr) break;
    const wVal = String(rowArr[colW] || '').trim();
    if (/^peruntukan$/i.test(wVal)) {
      headerRow = r;
      break;
    }
  }

  const startRow = headerRow !== -1 ? headerRow + 1 : 58;
  const endRow = headerRow !== -1 ? Math.min(headerRow + 6, 70) : 60;
  for (let r = startRow; r <= endRow; r++) {
    const rowArr = grid[r - baseRow];
    if (!rowArr) break;
    const name = String(rowArr[colW] || '').trim();
    if (!name || /^total$/i.test(name) || /^rekap\b/i.test(name)) break;
    out.push({ name: name, total: toNumber_(rowArr[colX]) });
  }
  return out;
}

function extractMandatoryFromGrid_(grid, baseRow, baseCol) {
  const items = [];
  let total = 0;
  let remaining = 0;

  for (let rowNum = 55; rowNum <= 70; rowNum++) {
    const r = grid[rowNum - baseRow];
    const checkedVal = r[2 - baseCol];
    const label = String(r[3 - baseCol] || '').trim();
    const amount = toNumber_(r[4 - baseCol]);

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

  return { items: items, total: total, remaining: remaining };
}

function findFirstEmptyRowFast_(sheet, colA, colB, colC) {
  // Batasi scan hanya sampai batas data aktual (+2 baris) agar tidak baca 973 baris penuh
  const lastSheetRow = Math.min(Math.max(sheet.getLastRow() + 2, CONFIG.DATA_START_ROW + 5), CONFIG.DATA_MAX_ROW);
  const numRows = lastSheetRow - CONFIG.DATA_START_ROW + 1;
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
    if ((a === '' || a === null) && (b === '' || b === null) && (c === '' || c === null)) {
      return CONFIG.DATA_START_ROW + i;
    }
  }

  if (lastSheetRow < CONFIG.DATA_MAX_ROW) {
    return lastSheetRow + 1;
  }
  throw new Error('Tabel sudah penuh mencapai baris ' + CONFIG.DATA_MAX_ROW + '.');
}

function readMonthlyTransactionsFast_(sheet, tz, limit) {
  const lastRow = Math.min(sheet.getLastRow(), CONFIG.DATA_MAX_ROW);
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  const numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  // 1 batch read tunggal G18:U{lastRow} (15 kolom)
  // G..L = idx 0..5, O..U = idx 8..14
  const vals = sheet.getRange(CONFIG.DATA_START_ROW, 7, numRows, 15).getValues();
  const list = [];

  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const rowNum = CONFIG.DATA_START_ROW + i;

    // Income (G:L -> 0..5)
    if (!((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null))) {
      list.push({
        id: 'in-' + rowNum,
        row: rowNum,
        type: 'income',
        date: formatDateValue_(r[0], tz),
        amount: toNumber_(r[1]),
        category: String(r[2] || '').trim(),
        owner: String(r[3] || '').trim(),
        notes: String(r[4] || '').trim(),
        wallet: String(r[5] || '').trim(),
        classification: ''
      });
    }

    // Expense (O:U -> 8..14)
    if (!((r[8] === '' || r[8] === null) && (r[9] === '' || r[9] === null))) {
      list.push({
        id: 'out-' + rowNum,
        row: rowNum,
        type: 'expense',
        date: formatDateValue_(r[8], tz),
        amount: toNumber_(r[9]),
        category: String(r[10] || '').trim(),
        classification: String(r[11] || '').trim(),
        owner: String(r[12] || '').trim(),
        wallet: String(r[13] || '').trim(),
        notes: String(r[14] || '').trim()
      });
    }
  }

  list.sort(function (a, b) {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return b.row - a.row;
  });

  return list.slice(0, limit);
}

function readSavingsTransactionsFast_(sheet, tz, limit) {
  const lastRow = Math.min(sheet.getLastRow(), CONFIG.DATA_MAX_ROW);
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  const numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  // 1 batch read tunggal G18:T{lastRow} (14 kolom)
  // G..K = idx 0..4, N..T = idx 7..13
  const vals = sheet.getRange(CONFIG.DATA_START_ROW, 7, numRows, 14).getValues();
  const list = [];

  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const rowNum = CONFIG.DATA_START_ROW + i;

    if (!((r[0] === '' || r[0] === null) && (r[1] === '' || r[1] === null))) {
      list.push({
        id: 'sav-in-' + rowNum,
        row: rowNum,
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

    if (!((r[7] === '' || r[7] === null) && (r[8] === '' || r[8] === null))) {
      list.push({
        id: 'sav-out-' + rowNum,
        row: rowNum,
        type: 'expense',
        date: formatDateValue_(r[7], tz),
        amount: toNumber_(r[8]),
        category: String(r[9] || '').trim(),
        classification: String(r[10] || '').trim(),
        wallet: String(r[11] || '').trim(),
        owner: String(r[12] || '').trim(),
        notes: String(r[13] || '').trim()
      });
    }
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
