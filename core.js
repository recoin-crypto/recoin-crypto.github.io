/**
 * Gradus Static.JS — Core
 * Инициализация, регистрация пользовательских функций, запуск рендеринга.
 */
const GradusStatic = {
    _config: { debug: false, dbFile: '/db.json' },
    _handlers: {},

    registerHandler(name, fn) {
        this._handlers[name] = fn;
        if (this._config.debug) console.log('[CORE] Зарегистрирован обработчик:', name);
    },

    async init(userConfig = {}) {
        Object.assign(this._config, userConfig);

        if (window.GradusDB) await GradusDB.init(this._config.dbFile, this._config.debug);

        // Вызываем initSite() пользователя, если определена
        if (typeof window.initSite === 'function') {
            await window.initSite();
        }

        // Управление защитой: отключаем только если debug явно равен true
        const debugEnabled = this._config.debug === true;
        console.log('[CORE] Debug mode:', debugEnabled);

        if (!debugEnabled) {
            if (window.GradusWeb && window.GradusWeb.security) {
                window.GradusWeb.security.enableDevToolsProtection(() => {
                    alert('Обнаружены инструменты разработчика! Данные удалены.');
                    window.GradusWeb.cache.clear();
                    location.reload();
                });
                console.log('[CORE] Защита от DevTools включена.');
            } else {
                console.warn('[CORE] GradusWeb.security не найден. Защита не включена.');
            }
        } else {
            console.log('[CORE] Защита от DevTools отключена (debug: true)');
            // Если нужно явно отключить ранее включённую защиту (например, при перезагрузке страницы с debug:true)
            if (window.GradusWeb && window.GradusWeb.security) {
                window.GradusWeb.security.disableDevToolsProtection();
            }
        }

        // Запускаем рендеринг после загрузки DOM
        const start = async () => {
            if (window.GradusClient) {
                await window.GradusClient.process(this._config, this._handlers);
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            await start();
        }
    }
};

window.GradusStatic = GradusStatic;