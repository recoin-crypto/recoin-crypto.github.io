/**
 * Gradus Static.JS — Database
 * Локальная база данных с обфускацией + загрузка из статического файла.
 */
const GradusDB = {
    _storageKey: 'gradus_db',
    _data: {},
    _initialized: false,

    async init(fileUrl, debug = false) {
        if (this._initialized) return;
        this._initialized = true;

        if (fileUrl) {
            try {
                const resp = await fetch(fileUrl);
                if (resp.ok) {
                    this._data = await resp.json();
                    if (debug) console.log('[DB] Начальные данные из', fileUrl);
                } else {
                    if (debug) console.warn('[DB] Файл не найден, код', resp.status);
                }
            } catch (e) {
                if (debug) console.warn('[DB] Ошибка загрузки:', e.message);
            }
        }

        const stored = localStorage.getItem(this._storageKey);
        if (stored) {
            try {
                Object.assign(this._data, JSON.parse(stored));
                if (debug) console.log('[DB] Локальные данные применены');
            } catch (e) {}
        }
    },

    async get(key) {
        return this._data[key];
    },

    set(key, value) {
        this._data[key] = value;
        this._save();
    },

    delete(key) {
        delete this._data[key];
        this._save();
    },

    _save() {
        localStorage.setItem(this._storageKey, JSON.stringify(this._data));
    },

    export() {
        return JSON.stringify(this._data, null, 2);
    }
};

window.GradusDB = GradusDB;