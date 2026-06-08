// client.js – Gradus Static.JS Client v2.4 (новые плейсхолдеры, защита от переопределения)
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
            node.textContent = await this._resolveText(node.textContent);
        } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
            for (let attr of node.attributes) {
                const newVal = await this._resolveText(attr.value);
                if (newVal !== attr.value) node.setAttribute(attr.name, newVal);
            }
            for (let child of node.childNodes) await this._walk(child);
        }
    },

    async _resolveText(text) {
        if (typeof text !== 'string') return text;
        const result = [];
        let i = 0;
        while (i < text.length) {
            if (text[i] === '{' && i + 1 < text.length) {
                const placeholder = this._extractPlaceholder(text, i);
                if (placeholder) {
                    const resolved = await this._processPlaceholder(placeholder.inner);
                    result.push(resolved);
                    i += placeholder.length;
                    continue;
                }
            }
            result.push(text[i]); i++;
        }
        return result.join('');
    },

    _extractPlaceholder(text, start) {
        let depth = 1, i = start + 1;
        while (i < text.length && depth > 0) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
        if (depth !== 0) return null;
        return { inner: text.substring(start + 1, i - 1), length: i - start };
    },

    async _processPlaceholder(inner) {
        const colonIdx = inner.indexOf(':');
        let func, rawArgs;
        if (colonIdx !== -1) { func = inner.substring(0, colonIdx).trim(); rawArgs = inner.substring(colonIdx + 1); }
        else { func = inner.trim(); rawArgs = ''; }
        const result = await this._execute(func, rawArgs);
        return GradusWeb.security.sanitizeHTML(String(result));
    },

    async _parseArgs(rawArgs) {
        if (!rawArgs) return [];
        const args = [], depth = 0; let current = '';
        for (let i = 0; i < rawArgs.length; i++) {
            const ch = rawArgs[i];
            if (ch === '{') depth++; else if (ch === '}') depth--;
            if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; }
            else current += ch;
        }
        if (current.trim() !== '') args.push(current.trim());
        const resolved = [];
        for (let arg of args) resolved.push(await this._resolveText(arg));
        return resolved;
    },

    async _execute(func, rawArgs) {
        const args = await this._parseArgs(rawArgs);

        // Сначала проверяем пользовательские обработчики
        if (this._customHandlers[func]) return await this._customHandlers[func](...args);

        // Затем встроенные
        const G = window.GradusWeb;
        switch (func) {
            case 'cache_read':   return G.cache.get(args[0] ?? '') ?? '';
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

            case 'server_get':
                return window.GradusServer ? await GradusServer.get(args[0] ?? '') : '';
            case 'server_post':
                return window.GradusServer ? await GradusServer.post(args[0] ?? '', args[1] ?? '') : '';
            case 'firebase_get':
                return window.GradusServer ? await GradusServer.firebaseGet(args[0] ?? '') : '';
            case 'firebase_set':
                if (window.GradusServer && args.length >= 2) await GradusServer.firebaseSet(args[0], args[1]);
                return '';

            case 'secret_read': return (await G.secretStorage.get(args[0] ?? '')) ?? '';
            case 'secret_write': if (args.length >= 2) await G.secretStorage.set(args[0], args[1]); return '';
            case 'secret_delete': await G.secretStorage.remove(args[0] ?? ''); return '';

            case 'encode': return G.encode(args[0] ?? '');
            case 'decode': return G.decode(args[0] ?? '');

            case 'random_uuid': return G.generate.uuid();
            case 'random_password': return G.generate.password(parseInt(args[0]) || 12);
            case 'random_int': {
                const parts = (args[0] || '1-100').split('-').map(Number);
                return String(G.generate.randomInt(parts[0], parts[1] || 100));
            }

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

            // Новые плейсхолдеры (v2.4)
            case 'base64_encode': return G.toBase64(args[0] || '');
            case 'base64_decode': return G.fromBase64(args[0] || '');
            case 'url_encode': return encodeURIComponent(args[0] || '');
            case 'url_decode': return decodeURIComponent(args[0] || '');
            case 'escape_html': return G.security.sanitizeHTML(args[0] || '');
            case 'nl2br': return (args[0] || '').replace(/\n/g, '<br>');
            case 'random_hex_color': return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
            case 'clipboard_copy':
                if (navigator.clipboard) navigator.clipboard.writeText(args[0] || '');
                return '';
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

            case 'get_api_key_preview':
                const key = await G.secretStorage.get('api_key');
                return key ? key.substr(0, 4) + '...' : 'не найден';

            default:
                console.warn('[CLIENT] Неизвестная функция:', func);
                return '';
        }
    }
};

window.GradusClient = GradusClient;