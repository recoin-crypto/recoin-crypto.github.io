// client.js – Gradus Static.JS Client v2.7.1 (логика, строки, json, if, исправления)
const GradusClient = {
    _config: {},
    _customHandlers: {},

    async process(config, customHandlers = {}) {
        this._config = config;
        this._customHandlers = customHandlers;
        await this._walk(document.body);
    },

    async _walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const newText = await this._resolveText(node.textContent, node);
            if (Array.isArray(newText)) {
                const fragment = document.createDocumentFragment();
                newText.forEach(item => {
                    if (typeof item === 'string') {
                        fragment.appendChild(document.createTextNode(item));
                    } else if (item instanceof Node) {
                        fragment.appendChild(item);
                    }
                });
                node.parentNode.replaceChild(fragment, node);
            } else {
                node.textContent = newText;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
            for (let attr of node.attributes) {
                const newVal = await this._resolveText(attr.value, node);
                if (newVal !== attr.value) node.setAttribute(attr.name, newVal);
            }
            for (let child of [...node.childNodes]) await this._walk(child);
        }
    },

    async _resolveText(text, contextNode = null) {
        if (typeof text !== 'string') return text;
        const result = [];
        let i = 0;
        while (i < text.length) {
            if (text[i] === '{' && i + 1 < text.length) {
                const placeholder = this._extractPlaceholder(text, i);
                if (placeholder) {
                    const resolved = await this._processPlaceholder(placeholder.inner, contextNode);
                    result.push(resolved);
                    i += placeholder.length;
                    continue;
                }
            }
            result.push(text[i]); i++;
        }
        // Разворачиваем вложенные массивы на верхний уровень
        const flatResult = result.flat(Infinity);
        if (flatResult.every(item => typeof item === 'string')) {
            return flatResult.join('');
        }
        return flatResult;
    },

    _extractPlaceholder(text, start) {
        let depth = 1, i = start + 1;
        while (i < text.length && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            i++;
        }
        if (depth !== 0) return null;
        return { inner: text.substring(start + 1, i - 1), length: i - start };
    },

    async _processPlaceholder(inner, contextNode = null) {
        const colonIdx = inner.indexOf(':');
        let func, rawArgs;
        if (colonIdx !== -1) {
            func = inner.substring(0, colonIdx).trim();
            rawArgs = inner.substring(colonIdx + 1);
        } else {
            func = inner.trim();
            rawArgs = '';
        }
        const result = await this._execute(func, rawArgs, contextNode);
        return result;
    },

    // Парсер аргументов с поддержкой кавычек и массивов
    async _parseArgs(rawArgs) {
        if (!rawArgs) return [];
        const args = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';
        let depth = 0;
        let quoted = false;   // флаг, что текущий аргумент был в кавычках
        for (let i = 0; i < rawArgs.length; i++) {
            const ch = rawArgs[i];
            if (inQuote) {
                if (ch === quoteChar && rawArgs[i-1] !== '\\') {
                    inQuote = false;
                    quoteChar = '';
                    quoted = true;   // аргумент был в кавычках
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"' || ch === "'") {
                    inQuote = true;
                    quoteChar = ch;
                    // кавычку не добавляем
                } else if (ch === '{') {
                    depth++;
                    current += ch;
                } else if (ch === '}') {
                    depth--;
                    current += ch;
                } else if (ch === ',' && depth === 0) {
                    args.push({ value: current.trim(), quoted });
                    current = '';
                    quoted = false;
                } else {
                    current += ch;
                }
            }
        }
        if (current.trim() !== '') args.push({ value: current.trim(), quoted });

        // Рекурсивно разрешаем аргументы, но для quoted-аргументов этого не делаем
        const resolved = [];
        for (let argObj of args) {
            if (argObj.quoted) {
                resolved.push(argObj.value);
            } else {
                const res = await this._resolveText(argObj.value);
                if (Array.isArray(res)) {
                    resolved.push(...res);
                } else {
                    resolved.push(res);
                }
            }
        }
        return resolved;
    },

    async _execute(func, rawArgs, contextNode = null) {
        const lowerFunc = func.toLowerCase();
        const args = await this._parseArgs(rawArgs);

        // Пользовательские обработчики (регистронезависимость)
        const handlerKey = Object.keys(this._customHandlers).find(k => k.toLowerCase() === lowerFunc);
        if (handlerKey) {
            try {
                return await this._customHandlers[handlerKey](...args);
            } catch (e) {
                console.error('[CLIENT] Ошибка пользовательского обработчика:', func, e);
                return 'ERROR';
            }
        }

        // Динамический live-плейсхолдер
        if (lowerFunc === 'live') {
            if (args.length < 2) return '';
            const interval = parseInt(args[0]) || 1000;
            const liveFuncName = args[1];
            const liveArgs = args.slice(2);

            const span = document.createElement('span');
            span.className = 'gradus-live';

            const updateLive = async () => {
                try {
                    let result;
                    const hKey = Object.keys(this._customHandlers).find(k => k.toLowerCase() === liveFuncName.toLowerCase());
                    if (hKey) {
                        result = await this._customHandlers[hKey](...liveArgs);
                    } else {
                        const raw = liveArgs.join(',');
                        result = await this._execute(liveFuncName, raw, null);
                    }
                    if (result instanceof Node) {
                        span.innerHTML = '';
                        span.appendChild(result);
                    } else {
                        span.textContent = String(result);
                    }
                } catch (e) {
                    span.textContent = 'ERROR';
                }
            };

            updateLive();
            const timer = setInterval(updateLive, interval);
            span._gradusLiveTimer = timer;
            return span;
        }

        const G = window.GradusWeb;
        switch (lowerFunc) {
            case 'cache_read': return G.cache.get(args[0] ?? '') ?? '';
            case 'cache_write':
                if (args.length >= 2) {
                    const ttl = args.length > 2 ? parseInt(args[2]) : 3600;
                    G.cache.set(args[0], args[1], ttl);
                }
                return '';
            case 'cache_delete': G.cache.remove(args[0] ?? ''); return '';

            case 'db_read': return window.GradusDB ? (await GradusDB.get(args[0] ?? '')) ?? '' : '';
            case 'db_write': if (window.GradusDB && args.length >= 2) GradusDB.set(args[0], args[1]); return '';
            case 'db_delete': if (window.GradusDB) GradusDB.delete(args[0] ?? ''); return '';

            case 'server_get': return window.GradusServer ? await GradusServer.get(args[0] ?? '') : '';
            case 'server_post': return window.GradusServer ? await GradusServer.post(args[0] ?? '', args[1] ?? '') : '';
            case 'firebase_get': return window.GradusServer ? await GradusServer.firebaseGet(args[0] ?? '') : '';
            case 'firebase_set': if (window.GradusServer && args.length >= 2) await GradusServer.firebaseSet(args[0], args[1]); return '';

            case 'secret_read': return (await G.secretStorage.get(args[0] ?? '')) ?? '';
            case 'secret_write': if (args.length >= 2) await G.secretStorage.set(args[0], args[1]); return '';
            case 'secret_delete': await G.secretStorage.remove(args[0] ?? ''); return '';

            case 'encode': return G.encode(args[0] ?? '');
            case 'decode': return G.decode(args[0] ?? '');

            case 'random_uuid': return G.generate.uuidv4();
            case 'random_id': return G.generate.uuid();
            case 'random_password': return G.generate.password(parseInt(args[0]) || 12);
            case 'default_password': return G.generate.default_password(parseInt(args[0]) || 12);
            case 'random_int': {
                const parts = (args[0] || '1-100').split('-').map(Number);
                return String(G.generate.randomInt(parts[0], parts[1] || 100));
            }
            case 'random_float': {
                const parts = (args[0] || '0-100').split('-').map(Number);
                return String(G.generate.randomFloat(parts[0] || 0, parts[1] || 100));
            }
            case 'datetime': return G.generate.datetime();

            case 'config': return this._config[args[0]] !== undefined ? String(this._config[args[0]]) : '';
            case 'date': return new Date().toLocaleDateString(args[0] || undefined);
            case 'time': return new Date().toLocaleTimeString(args[0] || undefined);
            case 'timestamp': return String(Date.now());

            case 'calc': {
                try {
                    const sanitized = (args[0] || '').replace(/[^0-9+\-*/().%\s]/g, '');
                    return String(Function('"use strict"; return (' + sanitized + ')')());
                } catch (e) { return 'ERROR'; }
            }

            case 'upper': return (args[0] || '').toUpperCase();
            case 'lower': return (args[0] || '').toLowerCase();
            case 'concat': return args.join('');
            case 'substring': {
                const start = parseInt(args[1]) || 0;
                const end = args.length > 2 ? parseInt(args[2]) : undefined;
                return (args[0] || '').substring(start, end);
            }

            case 'notify':
                if (args.length >= 1) G.notify.show(args[0], args[1] || 'info', parseInt(args[2]) || 3000);
                return '';

            case 'base64_encode': return G.toBase64(args[0] || '');
            case 'base64_decode': return G.fromBase64(args[0] || '');
            case 'url_encode': return encodeURIComponent(args[0] || '');
            case 'url_decode': return decodeURIComponent(args[0] || '');
            case 'escape_html': return G.security.sanitizeHTML(args[0] || '');
            case 'nl2br': return (args[0] || '').replace(/\n/g, '<br>');
            case 'random_hex_color': return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
            case 'clipboard_copy':
                if (navigator.clipboard) {
                    G.clipboard.writeAndTrack(args[0] || '');
                }
                return '';
            case 'clipboard_read': return G.clipboard.readLast();

            case 'countdown': {
                const end = new Date(args[0]).getTime();
                const now = Date.now();
                if (isNaN(end) || end <= now) return '0 дн. 0 ч. 0 мин. 0 сек.';
                let diff = end - now;
                const days = Math.floor(diff / 86400000); diff %= 86400000;
                const hours = Math.floor(diff / 3600000); diff %= 3600000;
                const mins = Math.floor(diff / 60000); diff %= 60000;
                const secs = Math.floor(diff / 1000);
                return `${days} дн. ${hours} ч. ${mins} мин. ${secs} сек.`;
            }

            case 'qr_code': {
                const text = args[0] || '';
                if (text) {
                    const img = document.createElement('img');
                    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
                    img.alt = 'QR-код';
                    img.width = 150;
                    return img;
                }
                return '';
            }

            case 'spell_check': {
                const word = args[0] || '';
                if (word && window.GradusServer) {
                    const resp = await GradusServer.get(`https://api.languagetoolplus.com/v2/check?text=${encodeURIComponent(word)}&language=auto`);
                    try {
                        const data = JSON.parse(resp);
                        if (data.matches && data.matches.length > 0) {
                            return data.matches.map(m => m.message).join('; ');
                        } else return 'Ошибок не найдено';
                    } catch(e) { return 'Ошибка проверки'; }
                }
                return '';
            }

            case 'preview': return G.preview(args[0] || '');
            case 'email_preview': return G.emailPreview(args[0] || '');
            case 'read_form': {
                const selector = args[0] || '';
                if (!selector) return '';
                const el = document.querySelector(`input[name="${selector}"], textarea[name="${selector}"], select[name="${selector}"], #${selector}, .${selector}`);
                return el ? (el.value || el.textContent || '') : '';
            }

            // Shop‑плейсхолдеры
            case 'product_name': {
                if (G.shop && G.shop.catalog) {
                    const product = G.shop.catalog.getById(args[0]);
                    return product ? (product.name || '') : '';
                }
                return '';
            }
            case 'product_price': {
                if (G.shop && G.shop.catalog) {
                    const product = G.shop.catalog.getById(args[0]);
                    return product ? String(product.price || 0) : '';
                }
                return '';
            }
            case 'product_desc': {
                if (G.shop && G.shop.catalog) {
                    const product = G.shop.catalog.getById(args[0]);
                    return product ? (product.description || '') : '';
                }
                return '';
            }
            case 'cart_count': {
                if (G.shop && G.shop.cart) return String(G.shop.cart.count());
                return '0';
            }
            case 'cart_total': {
                if (G.shop && G.shop.cart && G.shop.catalog) {
                    const cartItems = G.shop.cart.get();
                    let total = 0;
                    for (let item of cartItems) {
                        const product = G.shop.catalog.getById(item.id);
                        const price = product ? product.price : item.price || 0;
                        total += price * item.quantity;
                    }
                    return total.toFixed(2);
                }
                return '0.00';
            }

            case 'get_api_key_preview': {
                const key = await G.secretStorage.get('api_key');
                return key ? key.substr(0, 4) + '...' : 'не найден';
            }

            // Новые логические операторы и утилиты
            case 'str':
                return args[0] ?? '';
            case 'json':
                // args[0] уже очищен от внешних кавычек и не содержит вложенных плейсхолдеров
                try {
                    const parsed = JSON.parse(args[0] || '{}');
                    return JSON.stringify(parsed);
                } catch (e) {
                    return 'ERROR: invalid JSON';
                }
            case 'and':
                if (args.length >= 2 && args[0] && args[1]) {
                    return [args[0], args[1]];
                }
                return [];
            case 'or':
                for (let a of args) {
                    if (a) return a;
                }
                return '';
            case 'not':
                return (args[0] ? 'false' : 'true');
            case 'if':
                if (args.length >= 3) {
                    return args[0] ? args[1] : args[2];
                }
                return '';

            default:
                if (rawArgs.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(rawArgs.trim());
                        return JSON.stringify(parsed);
                    } catch (e) {}
                }
                console.warn('[CLIENT] Неизвестная функция:', func);
                return '';
        }
    }
};

window.GradusClient = GradusClient;