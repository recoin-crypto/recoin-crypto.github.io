/**
 * Gradus Static.JS — Core
 * Инициализация, регистрация пользовательских функций, запуск рендеринга.
 */
const GradusStatic = {
    _config: { debug: false, dbFile: '/db.json' },
    _handlers: {},

    // Регистрация кастомного обработчика
    registerHandler(name, fn) {
        this._handlers[name] = fn;
        if (this._config.debug) console.log('[CORE] Зарегистрирован обработчик:', name);
    },

    async init(userConfig = {}) {
        Object.assign(this._config, userConfig);

        // Инициализируем БД
        if (window.GradusDB) await GradusDB.init(this._config.dbFile, this._config.debug);

        // Вызываем initSite() пользователя, если определена
        if (typeof window.initSite === 'function') {
            await window.initSite();
        }

        // Запускаем рендеринг после загрузки DOM
        const start = async () => {
            if (window.GradusClient) {
                await GradusClient.process(this._config, this._handlers);
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