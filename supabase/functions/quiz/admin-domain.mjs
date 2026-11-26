const clean = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
export const IMPORT_LIMIT = 500;
export function normalizeImport(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_LIMIT) throw Error('Таблиця має містити від 1 до 500 користувачів.');
  return rows.map((r, i) => ({
    row: Number.isInteger(r.row) ? r.row : i + 2,
    importKey: String(r.importKey || ''),
    role: r.role,
    name: clean(r.name), login: clean(r.login).toLowerCase(),
    className: r.role === 'student' ? clean(r.className) : '',
    subjects: r.role === 'teacher' ? [...new Set((Array.isArray(r.subjects) ? r.subjects : String(r.subjects || '').split(/[;,\n]/)).map(clean).filter(Boolean))] : []
  }));
}
export function validateImport(rows, existing = [], catalog = []) {
  const normalized = normalizeImport(rows), logins = new Map(), keys = new Set();
  const additions = new Map();
  const checked = normalized.map(r => {
    const errors = [], warnings = [];
    if (!['student', 'teacher'].includes(r.role)) errors.push('Оберіть роль: учень або вчитель.');
    if (!/^[a-f0-9-]{36}$/.test(r.importKey) || keys.has(r.importKey)) errors.push('Неправильний або повторний ідентифікатор рядка.');
    keys.add(r.importKey);
    if (!/^[a-z0-9_.@-]{3,80}$/.test(r.login)) errors.push('Логін: 3–80 символів латиниці, цифри або _.@-');
    if (logins.has(r.login)) errors.push(`Логін повторено в рядку ${logins.get(r.login)}.`);
    logins.set(r.login, r.row);
    const user = existing.find(u => u.login === r.login || u.import_key === r.importKey);
    if (user && !(user.import_key === r.importKey && user.login === r.login && user.name === r.name && user.role === r.role && user.class_name === r.className && JSON.stringify(user.subjects) === JSON.stringify(r.subjects) && !user.deleted_at)) errors.push(user.deleted_at ? 'Логін належить видаленому акаунту: відновіть його або змініть логін.' : 'Такий логін уже існує.');
    if (r.name.length > 100 || r.name.split(' ').filter(Boolean).length < (r.role === 'teacher' ? 3 : 2)) errors.push(r.role === 'teacher' ? 'Вкажіть прізвище, ім’я та по батькові (до 100 символів).' : 'Вкажіть прізвище та ім’я (до 100 символів).');
    if (r.role === 'student' && (!r.className || r.className.length > 30)) errors.push('Вкажіть клас (до 30 символів).');
    if (r.role === 'teacher' && (!r.subjects.length || r.subjects.length > 40 || r.subjects.some(s => s.length > 100))) errors.push('Вкажіть 1–40 предметів, до 100 символів кожен.');
    const refs = r.role === 'student' ? [['class', r.className]] : r.subjects.map(s => ['subject', s]);
    for (const [kind, name] of refs) if (name) {
      const item = catalog.find(c => c.kind === kind && c.name === name);
      if (item?.deleted_at) errors.push(`«${name}» видалено: спочатку відновіть у довіднику.`);
      else if (!item) additions.set(kind + ':' + name, { kind, name });
    }
    if (existing.some(u => !u.deleted_at && u.name === r.name && u.role === r.role && u.class_name === r.className && u.login !== r.login) || normalized.some(o => o !== r && o.importKey !== r.importKey && o.name === r.name && o.role === r.role && o.className === r.className)) warnings.push('Є користувач із таким самим ім’ям і класом. Перевірте, чи це інша людина.');
    return { ...r, errors, warnings };
  });
  return { rows: checked, additions: [...additions.values()], valid: checked.every(r => !r.errors.length) };
}
