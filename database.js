// database.js – Gradus Static.JS Database v2.5.1
const GradusDB = (() => {
  const storage = window.localStorage;
  let _data = {};
  let _loaded = false;
  let _config = {};
  let _dbCache = {};

  async function init(config) {
    _config = config || {}; // защита от null/undefined
    _data = {};

    // Если dbFile не указан, null, undefined или пустая строка — работаем без файла
    if (!_config.dbFile || _config.dbFile === '') {
      if (_config.debug) console.warn('[DB] dbFile не указан или пуст, используется пустая БД');
      _loaded = true;
      return;
    }

    try {
      const resp = await fetch(_config.dbFile);
      if (resp.ok) {
        _data = await resp.json();
        if (_config.debug) console.log('[DB] Загружены данные из ' + _config.dbFile);
      } else {
        if (_config.debug) console.warn('[DB] Файл ' + _config.dbFile + ' не найден (HTTP ' + resp.status + '), используется пустая БД');
      }
    } catch (e) {
      if (_config.debug) console.warn('[DB] Ошибка загрузки db.json:', e.message);
    }

    // Применяем изменения из localStorage
    const local = storage.getItem('gw_db');
    if (local) {
      try {
        const localData = JSON.parse(local);
        Object.assign(_data, localData);
      } catch (e) {}
    }
    _dbCache = Object.assign({}, _data);
    _loaded = true;
  }

  async function get(key) {
    if (!_loaded) return null;
    if (_dbCache.hasOwnProperty(key)) return _dbCache[key];
    return _data[key] ?? null;
  }

  async function set(key, value) {
    _data[key] = value;
    _dbCache[key] = value;
    storage.setItem('gw_db', JSON.stringify(_data));
  }

  async function remove(key) {
    delete _data[key];
    delete _dbCache[key];
    storage.setItem('gw_db', JSON.stringify(_data));
  }

  return { init, get, set, remove };
})();