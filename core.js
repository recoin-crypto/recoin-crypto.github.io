/**
 * Gradus Static.JS — Core (v2.3)
 * Ожидает загрузку DOM перед инициализацией.
 */
const GradusStatic = {
    _config: { debug: false, dbFile: '/db.json' },
    _handlers: {},

    registerHandler(name, fn) {
        this._handlers[name] = fn;
        if (this._config.debug) console.log('[CORE] Зарегистрирован обработчик:', name);
    },

    async init(userConfig = {}) {
        // Ждём полной загрузки DOM, если он ещё не готов
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        Object.assign(this._config, userConfig);
        console.log('[CORE] Init вызван. Debug =', this._config.debug);

        if (window.GradusDB) await GradusDB.init(this._config.dbFile, this._config.debug);

        if (typeof window.initSite === 'function') {
            await window.initSite();
        }

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

        const start = async () => {
            if (window.GradusClient) {
                await window.GradusClient.process(this._config, this._handlers);
            }
        };
        // DOM уже готов, можно сразу запускать
        await start();
    }
};

window.GradusStatic = GradusStatic;