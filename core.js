// core.js – Gradus Static.JS Core v2.6 (перегрузка, *args, автоинициализация)
const GradusStatic = {
    _config: { debug: false, dbFile: '/db.json' },
    _handlers: {},       // { имя: { fn, hasVarArgs: bool } }
    _initialized: false,

    registerHandler(name, fn) {
        const lowerName = name.toLowerCase();
        const builtInHandlers = [
            'cache_read', 'cache_write', 'cache_delete',
            'db_read', 'db_write', 'db_delete',
            'secret_read', 'secret_write', 'secret_delete',
            'server_get', 'server_post',
            'firebase_get', 'firebase_set',
            'encode', 'decode',
            'random_uuid', 'random_password', 'random_int', 'random_float',
            'date', 'time', 'timestamp', 'datetime',
            'calc', 'upper', 'lower', 'concat', 'substring',
            'notify', 'config', 'get_api_key_preview',
            'base64_encode', 'base64_decode', 'url_encode', 'url_decode',
            'escape_html', 'nl2br', 'random_hex_color', 'clipboard_copy', 'clipboard_read', 'countdown',
            'qr_code', 'spell_check',
            'product_name', 'product_price', 'product_desc', 'cart_count', 'cart_total',
            'preview', 'email_preview', 'read_form'
        ];
        if (builtInHandlers.includes(lowerName)) {
            console.warn(`[CORE] Попытка переопределить встроенный обработчик "${name}".`);
            return;
        }

        // Анализируем строку параметров, чтобы понять, есть ли *
        const fnStr = fn.toString();
        const hasVarArgs = fnStr.includes('*');

        const wrapped = async (...args) => {
            try {
                if (hasVarArgs) {
                    // Передаём все аргументы как есть, последний будет массивом остатка
                    return await fn(...args);
                } else {
                    // Стандартный вызов с точным количеством аргументов
                    return await fn(...args);
                }
            } catch (e) {
                console.error(`[CORE] Ошибка в обработчике "${name}":`, e);
                return 'ERROR';
            }
        };
        this._handlers[lowerName] = { fn: wrapped, hasVarArgs };
        if (this._config.debug) console.log('[CORE] Зарегистрирован обработчик:', name);
    },

    // Внутренний вызов обработчика с подбором по количеству аргументов
    async callHandler(name, args) {
        const handler = this._handlers[name.toLowerCase()];
        if (!handler) return null;
        if (handler.hasVarArgs) {
            return await handler.fn(...args);
        } else {
            // Вызываем с тем количеством аргументов, которое указано в функции
            const expectedArgs = handler.fn.length; // количество параметров (без учёта *)
            const limitedArgs = args.slice(0, expectedArgs);
            return await handler.fn(...limitedArgs);
        }
    },

    async init(userConfig = {}) {
        if (this._initialized) {
            console.warn('[CORE] GradusStatic уже инициализирован');
            return;
        }
        this._initialized = true;
        userConfig = userConfig || {};

        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        Object.assign(this._config, userConfig);
        console.log('[CORE] Init вызван. Debug =', this._config.debug);

        if (window.GradusDB) {
            try {
                await GradusDB.init(this._config);
                if (this._config.debug) console.log('[CORE] База данных инициализирована');
            } catch (e) {
                console.warn('[CORE] Ошибка инициализации БД:', e);
            }
        } else {
            if (this._config.debug) console.warn('[CORE] GradusDB не найден');
        }

        if (typeof window.initSite === 'function') {
            if (this._config.debug) console.log('[CORE] Вызов initSite...');
            try {
                await window.initSite();
            } catch (e) {
                console.error('[CORE] Ошибка в initSite:', e);
            }
            if (this._config.debug) console.log('[CORE] initSite завершён');
        } else {
            if (this._config.debug) console.log('[CORE] initSite не определена, пропускаем');
        }

        if (window.GradusWeb && window.GradusWeb.shop) {
            GradusStatic.shop = window.GradusWeb.shop;
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

        if (window.GradusClient) {
            if (this._config.debug) console.log('[CORE] Запуск рендеринга страницы...');
            // Передаём специальный объект customHandlers, который внутри client.js будет использовать наш callHandler
            const customHandlersProxy = {
                _core: this,
                has: (target, name) => {
                    return this._handlers.hasOwnProperty(name.toLowerCase());
                },
                get: (target, name) => {
                    const handler = this._handlers[name.toLowerCase()];
                    if (handler) {
                        return async (...args) => {
                            return await this.callHandler(name, args);
                        };
                    }
                    return undefined;
                }
            };
            await window.GradusClient.process(this._config, new Proxy({}, customHandlersProxy));
            if (this._config.debug) console.log('[CORE] Рендеринг завершён');
        } else {
            console.warn('[CORE] GradusClient не найден – рендеринг пропущен');
        }

        window.addEventListener('online', () => console.log('[CORE] Соединение восстановлено'));
        window.addEventListener('offline', () => console.warn('[CORE] Отсутствует интернет-соединение'));
    }
};

// Автоинициализация
(function autoInit() {
    function tryAutoInit() {
        if (!window.GradusStatic._initialized) {
            console.log('[CORE] Автоинициализация (site.js пуст или отсутствует)');
            window.GradusStatic.init({});
        }
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(tryAutoInit, 50);
        });
    } else {
        setTimeout(tryAutoInit, 50);
    }
})();

window.GradusStatic = GradusStatic;