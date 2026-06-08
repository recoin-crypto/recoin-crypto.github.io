// server.js – Gradus Static.JS Server v2.4 (встроенный CORS-прокси)
const GradusServer = {
    // Прокси-URL, который будет использоваться при ошибке CORS.
    // Можно изменить в initSite через GradusServer.setCorsProxy('...')
    _corsProxy: 'https://corsproxy.io/?url=',

    setCorsProxy(url) {
        this._corsProxy = url;
    },

    async get(url) {
        // Пробуем прямой запрос
        try {
            const resp = await fetch(url);
            if (resp.ok) return await resp.text();
            // Если ответ не OK, пробуем через прокси
            if (resp.status === 0 || resp.type === 'opaque') {
                return await this._getViaProxy(url);
            }
            throw new Error('HTTP ' + resp.status);
        } catch (e) {
            // Сетевая ошибка или CORS — используем прокси
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
        try {
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error('Proxy HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] Proxy GET error:', e);
            return '';
        }
    },

    async post(url, body = '') {
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