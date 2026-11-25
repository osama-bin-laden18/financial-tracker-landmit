(function (global) {
  'use strict';

  const CATEGORY_ICONS = {
    'Pangan': '🍽️',
    'Bayar Tagihan': '🧾',
    'Bayar Hutang': '💳',
    'BBM': '⛽',
    'Transportasi': '🚗',
    'Nongki': '🧋',
    'Rumah': '🏠',
    'Sandang': '👕',
    'Komunikasi': '📱',
    'Hadiah/Sedekah': '🎁',
    'Hiburan & Rekreasi': '🎬',
    'Kopi': '☕',
    'Grocery': '🛒',
    'Lain-lain': '📦',
    'Tabungan': '🐷',
    'Kesehatan': '💊',
    'Olahraga': '🏋️',
    'Gaji': '💼',
    'Uang jajan': '💵',
    'Saldo sebelum': '🔄',
    'Lembur': '⏰',
    'Uang Kaget': '🎉',
    'Transfer': '🔁',
    'Emas': '🪙',
    'Uang': '💰',
    'Saham': '📈',
    'Darurat': '🚨',
    'Persiapan': '🎯',
    'Pinjam': '🤝',
    'Gadai': '🏦'
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRupiah(num, showSign) {
    const n = Number(num) || 0;
    const abs = Math.abs(Math.round(n));
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (n < 0) return '-Rp ' + formatted;
    if (showSign && n > 0) return '+Rp ' + formatted;
    return 'Rp ' + formatted;
  }

  function formatCompact(num) {
    const n = Number(num) || 0;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + 'Rp ' + (abs / 1e9).toFixed(1).replace('.', ',') + 'M';
    if (abs >= 1e6) return sign + 'Rp ' + (abs / 1e6).toFixed(1).replace('.', ',') + 'jt';
    if (abs >= 1e3) return sign + 'Rp ' + Math.round(abs / 1e3) + 'rb';
    return sign + 'Rp ' + abs;
  }

  function formatNumberInput(val) {
    const digits = String(val || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function parseNumberInput(val) {
    const digits = String(val || '').replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function formatPercent(ratio) {
    const pct = (Number(ratio) || 0) * 100;
    return pct.toFixed(1).replace('.', ',') + '%';
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateID(iso) {
    if (!iso) return 'Tanpa Tanggal';
    const parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const label = `${day} ${months[mIdx] || parts[1]} ${parts[0]}`;
    if (iso === todayISO()) return `Hari Ini • ${label}`;
    return label;
  }

  function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || '💸';
  }

  global.Formatters = {
    escapeHtml,
    formatRupiah,
    formatCompact,
    formatNumberInput,
    parseNumberInput,
    formatPercent,
    todayISO,
    formatDateID,
    getCategoryIcon
  };
})(window);
