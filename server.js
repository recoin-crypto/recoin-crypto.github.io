// server.js – Gradus Static.JS Server v2.5 (исправления багов)
const GradusServer = {
    _corsProxy: 'https://corsproxy.io/?url=',
    _cache: new Map(),          // простой кэш ответов
    _cacheMaxSize: 100,         // максимум записей
    _retryCount: 2,             // количество повторных попыток при сбое прокси

    setCorsProxy(url) {
        if (typeof url === 'string') this._corsProxy = url;
    },

    _isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (e) { return false; }
    },

    async get(url) {
        if (!this._isValidUrl(url)) {
            console.error('[SERVER] Некорректный URL:', url);
            return '';
        }
        // Проверяем кэш
        if (this._cache.has(url)) {
            const cached = this._cache.get(url);
            if (Date.now() < cached.expires) return cached.data;
            this._cache.delete(url);
        }

        // Прямой запрос
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const text = await resp.text();
                this._cache.set(url, { data: text, expires: Date.now() + 60000 }); // TTL 1 мин
                if (this._cache.size > this._cacheMaxSize) {
                    const firstKey = this._cache.keys().next().value;
                    this._cache.delete(firstKey);
                }
                return text;
            }
            if (resp.status === 0 || resp.type === 'opaque') {
                return await this._getViaProxy(url);
            }
            throw new Error('HTTP ' + resp.status);
        } catch (e) {
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                return await this._getViaProxy(url);
            }
            console.error('[SERVER] GET error:', e);
            return '';
        }
    },

    async _getViaProxy(url) {
        if (!this._corsProxy) return '';
        const proxyUrl = this._corsProxy + encodeURIComponent(url);
        for (let attempt = 0; attempt <= this._retryCount; attempt++) {
            try {
                const resp = await fetch(proxyUrl);
                if (!resp.ok) throw new Error('Proxy HTTP ' + resp.status);
                const text = await resp.text();
                this._cache.set(url, { data: text, expires: Date.now() + 60000 });
                return text;
            } catch (e) {
                if (attempt === this._retryCount) {
                    console.error('[SERVER] Proxy GET error after retries:', e);
                    return '';
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return '';
    },

    async post(url, body = '') {
        if (!this._isValidUrl(url)) return '';
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] POST error:', e);
            return '';
        }
    },

    async put(url, body = '') {
        if (!this._isValidUrl(url)) return '';
        try {
            const resp = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] PUT error:', e);
            return '';
        }
    },

    async firebaseGet(path) {
        return await this.get(path);
    },

    async firebaseSet(path, data) {
        const url = path.endsWith('.json') ? path : path + '.json';
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        return await this.put(url, body);
    },

    async firebasePush(path, data) {
        const url = path.endsWith('.json') ? path : path + '.json';
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        return await this.post(url, body);
    }
};

window.GradusServer = GradusServer;