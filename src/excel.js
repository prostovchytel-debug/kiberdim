let loading;
export function excel() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = new URL('../vendor/xlsx.full.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.XLSX);
    script.onerror = () => { loading = null; script.remove(); reject(Error('Не вдалося завантажити модуль Excel. Оновіть сторінку та спробуйте ще раз.')); };
    document.head.append(script);
  });
  return loading;
}
export function sheetRows(XLSX, sheet, role) {
  if (!sheet['!ref']) throw Error('Аркуш порожній.');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r > 501 || range.e.c > 30) throw Error('Не більше 500 рядків і 31 колонки. Скористайтеся шаблоном.');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true });
  const header = grid.shift().map(v => String(v).trim().toLowerCase().replace(/[.\s’']/g, ''));
  const aliases = { name: ['піб','пі','прізвищетаімя','прізвищеімяпобатькові','name'], login: ['логін','login'], className: ['клас','classname','class'], subjects: ['предмети','предмет','subjects'] };
  const at = Object.fromEntries(Object.entries(aliases).map(([k, names]) => [k, header.findIndex(h => names.includes(h))]));
  if (at.name < 0 || at[role === 'student' ? 'className' : 'subjects'] < 0) throw Error('Потрібні колонки «ПІБ» і «Клас» для учнів або «ПІБ» і «Предмети» для вчителів.');
  return grid.flatMap((line, i) => {
    if (line.every(v => !String(v).trim())) return [];
    for (let col = 0; col <= range.e.c; col++) if (sheet[XLSX.utils.encode_cell({r:range.s.r+i+1,c:range.s.c+col})]?.f) throw Error(`Рядок ${range.s.r+i+2}: замініть формули звичайними значеннями.`);
    const importKey = crypto.randomUUID();
    return [{ row: range.s.r + i + 2, importKey, role, name: line[at.name], login: at.login >= 0 && String(line[at.login]).trim() ? line[at.login] : `${role}_${importKey.replaceAll('-','').slice(0,16)}`, className: at.className >= 0 ? line[at.className] : '', subjects: at.subjects >= 0 ? line[at.subjects] : '' }];
  });
}
export async function writeExcel(filename, rows, sheetName = 'Користувачі') {
  const X = await excel(), book = X.utils.book_new(), sheet = X.utils.aoa_to_sheet(rows.map(r=>r.map(v=>String(v ?? ''))));
  sheet['!cols'] = rows[0].map((_,i)=>({wch:i===0?40:28}));
  X.utils.book_append_sheet(book, sheet, sheetName); X.writeFile(book, filename);
}
export function temporaryPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2,'0')).join('') + 'aB7!';
}
