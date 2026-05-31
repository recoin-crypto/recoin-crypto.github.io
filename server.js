/**
 * Gradus Static.JS — Server
 * GET, POST, PUT + Firebase REST с поддержкой генерации ключей (push).
 */
const GradusServer = {
    async get(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] GET error:', e);
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