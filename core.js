// core.js – Gradus Static.JS Core v2.4
/**
 * Gradus Static.JS — Core (v2.4)
 * Ожидает загрузку DOM перед инициализацией.
 * Обеспечивает инициализацию БД, пользовательской initSite,
 * защиту от DevTools и запуск клиентского рендеринга.
 */
const GradusStatic = {
    _config: { debug: false, dbFile: '/db.json' },
    _handlers: {},

    /**
     * Регистрирует пользовательский обработчик плейсхолдеров.
     * @param {string} name - имя функции (например, 'custom_hello')
     * @param {Function} fn - асинхронная или синхронная функция-обработчик
     */
    registerHandler(name, fn) {
        // Проверка на переопределение встроенных обработчиков
        const builtInHandlers = [
            'cache_read', 'cache_write', 'cache_delete',
            'db_read', 'db_write', 'db_delete',
            'secret_read', 'secret_write', 'secret_delete',
            'server_get', 'server_post',
            'firebase_get', 'firebase_set',
            'encode', 'decode',
            'random_uuid', 'random_password', 'random_int',
            'date', 'time', 'timestamp',
            'calc', 'upper', 'lower', 'concat', 'substring',
            'notify', 'config', 'get_api_key_preview',
            'base64_encode', 'base64_decode', 'url_encode', 'url_decode',
            'escape_html', 'nl2br', 'random_hex_color', 'clipboard_copy', 'countdown'
        ];
        if (builtInHandlers.includes(name)) {
            console.warn(`[CORE] Попытка переопределить встроенный обработчик "${name}". Используйте префикс "custom_".`);
            return;
        }

        this._handlers[name] = fn;
        if (this._config.debug) console.log('[CORE] Зарегистрирован обработчик:', name);
    },

    /**
     * Главная точка входа. Вызывается из site.js при загрузке страницы.
     * @param {object} userConfig - пользовательская конфигурация (debug, dbFile и т.д.)
     */
    async init(userConfig = {}) {
        // Ждём полной загрузки DOM, если он ещё не готов
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Объединяем пользовательскую конфигурацию с дефолтной
        Object.assign(this._config, userConfig);
        console.log('[CORE] Init вызван. Debug =', this._config.debug);

        // Инициализируем базу данных
        if (window.GradusDB) {
            await GradusDB.init(this._config);  // передаём весь конфиг (dbFile и debug будут внутри)
            if (this._config.debug) console.log('[CORE] База данных инициализирована');
        } else {
            if (this._config.debug) console.warn('[CORE] GradusDB не найден');
        }

        // Вызываем пользовательскую функцию инициализации, если она определена
        if (typeof window.initSite === 'function') {
            if (this._config.debug) console.log('[CORE] Вызов initSite...');
            await window.initSite();
            if (this._config.debug) console.log('[CORE] initSite завершён');
        } else {
            if (this._config.debug) console.log('[CORE] initSite не определена, пропускаем');
        }

        // Защита от DevTools (отключается при debug: true)
        if (!this._config.debug && window.GradusWeb && window.GradusWeb.security) {
            window.GradusWeb.security.enableDevToolsProtection(() => {
                alert('Обнаружены инструменты разработчика! Данные удалены.');
                window.GradusWeb.cache.clear();
                window.GradusWeb.secretStorage.clear();
                location.reload();
            }, { removeScripts: true, skipMobile: true });
            console.log('[CORE] Защита от DevTools включена.');
        } else if (this._config.debug) {
            console.log('[CORE] Защита от DevTools отключена (debug: true)');
        }

        // Запускаем рендеринг страницы: обход DOM и замена плейсхолдеров
        const start = async () => {
            if (window.GradusClient) {
                if (this._config.debug) console.log('[CORE] Запуск рендеринга страницы...');
                await window.GradusClient.process(this._config, this._handlers);
                if (this._config.debug) console.log('[CORE] Рендеринг завершён');
            } else {
                console.warn('[CORE] GradusClient не найден – рендеринг пропущен');
            }
        };
        await start();
    }
};

window.GradusStatic = GradusStatic;