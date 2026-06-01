/**
 * Gradus Web — Утилиты для статических сайтов (JavaScript)
 * Версия 2.3 — максимальная безопасность, скрытая соль, очистка SecretStorage, защита от F12, встроенный AntiCheat с onHack.
 */
(function (window) {
    'use strict';

    // ========== ПРИВАТНЫЕ ПЕРЕМЕННЫЕ ==========
    const _salt = 'GradusSalt2025!X#_v2.3';
    const _prefix = 'gs_sec_v3_';

    const GradusWeb = {
        version: '2.3.0',

        _log(type, msg) {
            const prefix = '[GRADUS-WEB]';
            if (type === 'error') console.error(prefix, msg);
            else if (type === 'warn') console.warn(prefix, msg);
            else console.log(prefix, msg);
        },

        // ========== 1. КЭШ ==========
        cache: {
            set(key, value, ttlSeconds = 3600) {
                try {
                    const item = { value: value, expires: Date.now() + ttlSeconds * 1000 };
                    localStorage.setItem('gradus_cache_' + key, JSON.stringify(item));
                    return true;
                } catch (e) { return false; }
            },
            get(key) {
                try {
                    const raw = localStorage.getItem('gradus_cache_' + key);
                    if (!raw) return null;
                    const item = JSON.parse(raw);
                    if (Date.now() > item.expires) {
                        localStorage.removeItem('gradus_cache_' + key);
                        return null;
                    }
                    return item.value;
                } catch (e) { return null; }
            },
            remove(key) { localStorage.removeItem('gradus_cache_' + key); },
            clear() {
                Object.keys(localStorage)
                    .filter(k => k.startsWith('gradus_cache_'))
                    .forEach(k => localStorage.removeItem(k));
            }
        },

        // ========== 2. КОДИРОВАНИЕ (таблица Gradus) ==========
        _charMap: {
            ' ': '_000', 'а': '_001', 'б': '_002', 'в': '_003', 'г': '_004', 'д': '_005',
            'е': '_006', 'ё': '_007', 'ж': '_008', 'з': '_009', 'и': '_010', 'й': '_011',
            'к': '_012', 'л': '_013', 'м': '_014', 'н': '_015', 'о': '_016', 'п': '_017',
            'р': '_018', 'с': '_019', 'т': '_020', 'у': '_021', 'ф': '_022', 'х': '_023',
            'ц': '_024', 'ч': '_025', 'ш': '_026', 'щ': '_027', 'ъ': '_028', 'ы': '_029',
            'ь': '_030', 'э': '_031', 'ю': '_032', 'я': '_033',
            'А': '_034', 'Б': '_035', 'В': '_036', 'Г': '_037', 'Д': '_038', 'Е': '_039',
            'Ё': '_040', 'Ж': '_041', 'З': '_042', 'И': '_043', 'Й': '_044', 'К': '_045',
            'Л': '_046', 'М': '_047', 'Н': '_048', 'О': '_049', 'П': '_050', 'Р': '_051',
            'С': '_052', 'Т': '_053', 'У': '_054', 'Ф': '_055', 'Х': '_056', 'Ц': '_057',
            'Ч': '_058', 'Ш': '_059', 'Щ': '_060', 'Ъ': '_061', 'Ы': '_062', 'Ь': '_063',
            'Э': '_064', 'Ю': '_065', 'Я': '_066',
            'A': '_067', 'B': '_068', 'C': '_069', 'D': '_070', 'E': '_071', 'F': '_072',
            'G': '_073', 'H': '_074', 'I': '_075', 'J': '_076', 'K': '_077', 'L': '_078',
            'M': '_079', 'N': '_080', 'O': '_081', 'P': '_082', 'Q': '_083', 'R': '_084',
            'S': '_085', 'T': '_086', 'U': '_087', 'V': '_088', 'W': '_089', 'X': '_090',
            'Y': '_091', 'Z': '_092',
            'a': '_093', 'b': '_094', 'c': '_095', 'd': '_096', 'e': '_097', 'f': '_098',
            'g': '_099', 'h': '_100', 'i': '_101', 'j': '_102', 'k': '_103', 'l': '_104',
            'm': '_105', 'n': '_106', 'o': '_107', 'p': '_108', 'q': '_109', 'r': '_110',
            's': '_111', 't': '_112', 'u': '_113', 'v': '_114', 'w': '_115', 'x': '_116',
            'y': '_117', 'z': '_118',
            '0': '_119', '1': '_120', '2': '_121', '3': '_122', '4': '_123',
            '5': '_124', '6': '_125', '7': '_126', '8': '_127', '9': '_128',
            ',': '_129', '.': '_130',
            '~': '_131', '!': '_132', '?': '_133', '=': '_134', '-': '_135',
            '+': '_136', ':': '_137', '%': '_138', '&': '_139', '*': '_140',
            '(': '_141', ')': '_142', '@': '_143', '`': '_144', '$': '_145',
            ';': '_146', '"': '_147', "'": '_148', '{': '_149', '}': '_150',
            '\\': '_151', '\n': '_152', '\r': '_153', '#': '_154', '/': '_155'
        },
        _decodeMap: null,

        _buildDecodeMap() {
            if (this._decodeMap) return;
            this._decodeMap = {};
            for (let char in this._charMap) this._decodeMap[this._charMap[char]] = char;
        },

        encode(text) {
            if (!text && text !== '') return '';
            this._buildDecodeMap();
            let result = '';
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                result += this._charMap.hasOwnProperty(ch) ? this._charMap[ch] : ch;
            }
            return result;
        },

        decode(encoded) {
            if (!encoded && encoded !== '') return '';
            this._buildDecodeMap();
            let result = '', i = 0;
            while (i < encoded.length) {
                if (encoded[i] === '_' && i + 3 < encoded.length) {
                    const code = encoded.substr(i, 4);
                    if (this._decodeMap.hasOwnProperty(code)) {
                        result += this._decodeMap[code];
                        i += 4;
                        continue;
                    }
                }
                result += encoded[i];
                i++;
            }
            return result;
        },

        // ========== 3. CAPTCHA ==========
        captcha: {
            generate() {
                const a = Math.floor(Math.random() * 10) + 1, b = Math.floor(Math.random() * 10) + 1;
                const ops = ['+', '-', '*'], op = ops[Math.floor(Math.random() * ops.length)];
                let answer;
                switch (op) { case '+': answer = a + b; break; case '-': answer = a - b; break; case '*': answer = a * b; break; }
                return { question: `${a} ${op} ${b} = ?`, answer };
            },
            check(generated, userAnswer) { return generated && parseInt(userAnswer) === generated.answer; },
            render(elementId) {
                const el = document.getElementById(elementId);
                if (!el) return null;
                const cap = this.generate();
                el.innerHTML = `<div class="gradus-captcha"><span>${cap.question}</span><input type="text" class="gradus-captcha-input" placeholder="Ответ" /><input type="hidden" class="gradus-captcha-answer" value="${cap.answer}" /></div>`;
                return cap;
            },
            verify(elementId) {
                const el = document.getElementById(elementId);
                if (!el) return false;
                const input = el.querySelector('.gradus-captcha-input'), hidden = el.querySelector('.gradus-captcha-answer');
                return input && hidden && parseInt(input.value) === parseInt(hidden.value);
            }
        },

        // ========== 4. DDoS PROTECTION ==========
        ddos: {
            _store: {},
            isAllowed(id, maxRequests = 5, intervalSeconds = 10) {
                const now = Date.now();
                if (!this._store[id]) { this._store[id] = { count: 1, resetTime: now + intervalSeconds * 1000 }; return true; }
                const record = this._store[id];
                if (now > record.resetTime) { record.count = 1; record.resetTime = now + intervalSeconds * 1000; return true; }
                if (record.count >= maxRequests) return false;
                record.count++;
                return true;
            },
            reset(id) { delete this._store[id]; },
            clear() { this._store = {}; }
        },

        // ========== 5. ГЕНЕРАТОРЫ ==========
        generate: {
            uuid() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            },
            password(length = 12) {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
                const array = new Uint32Array(length);
                if (window.crypto && window.crypto.getRandomValues) crypto.getRandomValues(array);
                else for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 0x100000000);
                let pass = '';
                for (let i = 0; i < length; i++) pass += chars[array[i] % chars.length];
                return pass;
            },
            randomInt(min, max) {
                const range = max - min + 1, array = new Uint32Array(1);
                if (window.crypto && window.crypto.getRandomValues) crypto.getRandomValues(array);
                else array[0] = Math.floor(Math.random() * 0x100000000);
                return min + (array[0] % range);
            }
        },

        // ========== 6. УВЕДОМЛЕНИЯ ==========
        notify: {
            _ensureContainer() {
                if (!document.getElementById('gradus-notify-container')) {
                    const div = document.createElement('div');
                    div.id = 'gradus-notify-container';
                    div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;';
                    document.body.appendChild(div);
                }
                return document.getElementById('gradus-notify-container');
            },
            show(message, type = 'info', duration = 3000) {
                const container = this._ensureContainer();
                const toast = document.createElement('div');
                const colors = { success: '#4caf50', error: '#f44336', info: '#2196f3', warning: '#ff9800' };
                toast.style.cssText = `background-color:${colors[type] || colors.info};color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:Segoe UI,system-ui,sans-serif;font-size:14px;min-width:200px;opacity:0;transition:opacity 0.3s;`;
                toast.textContent = message;
                container.appendChild(toast);
                setTimeout(() => toast.style.opacity = '1', 10);
                setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, duration);
            },
            success(msg, d) { this.show(msg, 'success', d); },
            error(msg, d) { this.show(msg, 'error', d); },
            info(msg, d) { this.show(msg, 'info', d); },
            warning(msg, d) { this.show(msg, 'warning', d); }
        },

        // ========== 7. SECRET STORAGE (AES‑GCM) ==========
        secretStorage: {
            _getFingerprint() {
                const nav = window.navigator, screen = window.screen;
                const str = [nav.userAgent, nav.language, nav.hardwareConcurrency || 0,
                             screen.width, screen.height, screen.colorDepth,
                             new Date().getTimezoneOffset()].join('|');
                let h = 5381;
                for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
                return (h >>> 0).toString(16);
            },

            async _getKey() {
                const fp = this._getFingerprint();
                const enc = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey(
                    'raw',
                    enc.encode(fp),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits', 'deriveKey']
                );
                const saltEnc = enc.encode(_salt);
                return crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: saltEnc,
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
            },

            async _encrypt(plaintext, key) {
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const enc = new TextEncoder();
                const encoded = enc.encode(plaintext);
                const ciphertext = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    encoded
                );
                const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
                combined.set(iv, 0);
                combined.set(new Uint8Array(ciphertext), iv.byteLength);
                return btoa(String.fromCharCode(...combined));
            },

            async _decrypt(cipherB64, key) {
                const combined = new Uint8Array(
                    atob(cipherB64).split('').map(c => c.charCodeAt(0))
                );
                const iv = combined.slice(0, 12);
                const data = combined.slice(12);
                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    data
                );
                return new TextDecoder().decode(decrypted);
            },

            async set(name, value) {
                try {
                    const key = await this._getKey();
                    const encrypted = await this._encrypt(value, key);
                    localStorage.setItem(_prefix + name, encrypted);
                    return true;
                } catch (e) { return false; }
            },

            async get(name) {
                try {
                    const encrypted = localStorage.getItem(_prefix + name);
                    if (!encrypted) return null;
                    const key = await this._getKey();
                    return await this._decrypt(encrypted, key);
                } catch (e) { return null; }
            },

            async remove(name) {
                localStorage.removeItem(_prefix + name);
            },

            async clear() {
                Object.keys(localStorage)
                    .filter(k => k.startsWith(_prefix))
                    .forEach(k => localStorage.removeItem(k));
                return true;
            }
        },

        // ========== 8. УСИЛЕННАЯ ЗАЩИТА ОТ DEVTOOLS ==========
        security: {
            _interval: null,
            _onDetected: null,

            enableDevToolsProtection(onDetectedCallback, options = {}) {
                const { removeScripts = true, skipMobile = true } = options;
                this._onDetected = onDetectedCallback;

                if (skipMobile && /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)) {
                    console.log('[SECURITY] Мобильное устройство, защита отключена');
                    return;
                }

                const trigger = () => {
                    if (this._onDetected) this._onDetected();
                    if (removeScripts) {
                        const scripts = document.querySelectorAll('script');
                        scripts.forEach(s => s.parentNode.removeChild(s));
                        console.clear();
                    }
                };

                const debuggerLoop = () => {
                    const start = performance.now();
                    debugger;
                    if (performance.now() - start > 100) trigger();
                };

                const consoleCheck = () => {
                    const before = Date.now();
                    console.clear();
                    console.log('%c ', 'font-size:0;');
                    if (Date.now() - before > 5) trigger();
                };

                this._interval = setInterval(() => {
                    debuggerLoop();
                    consoleCheck();
                }, 200);

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'F12' ||
                        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
                        (e.ctrlKey && e.key === 'U')) {
                        e.preventDefault();
                    }
                });

                document.addEventListener('contextmenu', e => e.preventDefault());
                if (window.self !== window.top) trigger();
            },

            disableDevToolsProtection() {
                if (this._interval) { clearInterval(this._interval); this._interval = null; }
            },

            sanitizeHTML(str) {
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '/': '&#x2F;' };
                return String(str).replace(/[&<>"'\/]/g, ch => map[ch]);
            },

            sanitizeScript(input) { return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); }
        },

        // ========== 9. ВСТРОЕННЫЙ АНТИЧИТ (с onHack) ==========
        antiCheat: {
            createInstance(onHackCallback = null) {
                return new GradusAntiCheatInstance(onHackCallback);
            }
        },

        init() {
            this._log('info', 'Gradus Web v' + this.version + ' загружен');
        }
    };

    // ========== КЛАСС АНТИЧИТА ==========
    class GradusAntiCheatInstance {
        constructor(onHackCallback = null) {
            console.log("[GRADUS-AC] Анти-чит создан, документация на официальном сайте");
            this.monitoring = false;
            this.variables = {};
            this._onHack = onHackCallback;

            this._randInt = Math.floor(10000 + Math.random() * 90000);
            this._randFloat = Math.round((100000 + Math.random() * 900000)) / 10;
            const words = ["cocoon", "melon", "apple", "orange", "banana", "pineapple", "grape", "juice"];
            this._randStr = words[Math.floor(Math.random() * words.length)];
        }

        onHack(callback) {
            this._onHack = callback;
        }

        _sysInt(name, value) { this.variables[name] = { type: "int", value: value + this._randInt }; }
        _sysStr(name, value) { this.variables[name] = { type: "str", value: value + this._randStr }; }
        _sysBool(name, value) { this.variables[name] = { type: "bool", value: !value }; }
        _sysFloat(name, value) { this.variables[name] = { type: "float", value: value + this._randFloat }; }
        _sysDict(name, value) { this.variables[name] = { type: "dict", value: value }; }
        _sysList(name, value) { this.variables[name] = { type: "list", value: value }; }
        _sysOther(name) {
            console.log(`[GRADUS-AC] Неподдерживаемый тип у "${name}", поддерживаются: int, str, bool, float, dict, list`);
            return false;
        }

        startMonitoring() { this.monitoring = true; console.log("[GRADUS-AC] Античит включён!"); return true; }
        stopMonitoring() { this.monitoring = false; console.log("[GRADUS-AC] Античит выключен!"); return true; }

        addVariable(name = "VARIABLE", value) {
            if (name === "VARIABLE") name = "VARIABLE" + Math.floor(10000 + Math.random() * 90000);
            const t = typeof value;
            if (t === "number") {
                if (Number.isInteger(value)) this._sysInt(name, value);
                else this._sysFloat(name, value);
            } else if (t === "string") {
                this._sysStr(name, value);
            } else if (t === "boolean") {
                this._sysBool(name, value);
            } else if (value instanceof Map || (value && typeof value === "object" && value.constructor === Object)) {
                this._sysDict(name, value);
            } else if (Array.isArray(value)) {
                this._sysList(name, value);
            } else {
                this._sysOther(name);
                throw new Error(`Неподдерживаемый тип переменной '${name}'`);
            }
            return name;
        }

        getVariable(name) {
            const v = this.variables[name];
            if (!v) return null;
            switch (v.type) {
                case "int": return v.value - this._randInt;
                case "str": return v.value.replace(this._randStr, "");
                case "bool": return !v.value;
                case "float": return v.value - this._randFloat;
                case "dict": case "list": return v.value;
                default: return null;
            }
        }

        isHacked(name, value) {
            if (!this.monitoring) return false;
            const stored = this.getVariable(name);
            if (stored === null) {
                if (this._onHack) this._onHack(name, value, 'variable_missing');
                return true;
            }
            if (stored !== value) {
                if (this._onHack) this._onHack(name, value, 'value_mismatch');
                return true;
            }
            return false;
        }
    }

    window.GradusWeb = GradusWeb;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => GradusWeb.init());
    else GradusWeb.init();
})(window);