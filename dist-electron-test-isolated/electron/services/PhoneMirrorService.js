"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneMirrorService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const qrcode_1 = __importDefault(require("qrcode"));
const url_1 = require("url");
const ws_1 = require("ws");
const SettingsManager_1 = require("./SettingsManager");
const phoneMirrorClient_1 = require("./phoneMirrorClient");
const DEFAULT_PORT = 4123;
const PORT_PROBE_RANGE = 12;
const HISTORY_LIMIT = 40;
const RATE_WINDOW_MS = 60_000;
const RATE_HTTP_LIMIT = 120;
const TOKEN_BYTES = 24;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const STATUS_LISTENERS_KEY = Symbol('phone-mirror-status-listeners');
class PhoneMirrorService {
    static _instance = null;
    server = null;
    wss = null;
    port = 0;
    token = '';
    exposeOnLan = false;
    history = [];
    // Single string instead of token array: O(1) append, O(1) replay (one WS frame).
    livePartial = null;
    rateBuckets = new Map();
    statusListeners = new Set();
    phoneCommandListeners = new Set();
    cachedInfo = null;
    cachedQrUrl = null;
    cachedQrDataUrl = null;
    starting = null;
    // Debounce rapid connect/disconnect status events to avoid redundant QR re-renders.
    statusDebounceTimer = null;
    static getInstance() {
        if (!PhoneMirrorService._instance)
            PhoneMirrorService._instance = new PhoneMirrorService();
        return PhoneMirrorService._instance;
    }
    // ----- public lifecycle -----
    isRunning() {
        return this.server !== null;
    }
    async start(opts) {
        if (this.starting)
            return this.starting;
        if (this.isRunning()) {
            if (typeof opts?.exposeOnLan === 'boolean' && opts.exposeOnLan !== this.exposeOnLan) {
                return this.restart({ exposeOnLan: opts.exposeOnLan, persist: opts.persist });
            }
            return this.snapshot();
        }
        const exposeOnLan = opts?.exposeOnLan ?? !!SettingsManager_1.SettingsManager.getInstance().get('phoneMirrorExposeOnLan');
        this.starting = this._start(exposeOnLan, opts?.persist !== false);
        try {
            return await this.starting;
        }
        finally {
            this.starting = null;
        }
    }
    async stop(opts) {
        if (opts?.persist !== false) {
            SettingsManager_1.SettingsManager.getInstance().set('phoneMirrorEnabled', false);
        }
        await this._teardown();
        this.emitStatus();
    }
    async restart(opts) {
        await this._teardown();
        return this.start({ exposeOnLan: opts.exposeOnLan, persist: opts.persist });
    }
    async setExposeOnLan(value) {
        SettingsManager_1.SettingsManager.getInstance().set('phoneMirrorExposeOnLan', value);
        if (!this.isRunning()) {
            this.exposeOnLan = value;
            return this.snapshot();
        }
        return this.restart({ exposeOnLan: value });
    }
    async rotateToken() {
        this.token = generateToken();
        this.invalidateQrCache();
        this.disconnectAllClients(4401, 'Token rotated');
        const info = await this.snapshot();
        this.emitStatus(info);
        return info;
    }
    async dispose() {
        await this._teardown();
        this.statusListeners.clear();
        this.phoneCommandListeners.clear();
    }
    // ----- public publishing API (called from ipcHandlers) -----
    publishUserMessage(id, content) {
        if (!this.isRunning() || !content?.trim())
            return;
        const msg = {
            id: 'u:' + id,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        };
        this.recordHistory(msg);
        this.broadcast({ type: 'user', id: msg.id, content: msg.content, createdAt: msg.createdAt });
    }
    publishToken(streamId, token) {
        if (!this.isRunning() || !token)
            return;
        if (!this.livePartial || this.livePartial.streamId !== streamId) {
            this.livePartial = { streamId, content: '' };
        }
        this.livePartial.content += token;
        this.broadcast({ type: 'token', streamId, token });
    }
    publishDone(streamId, fullContent) {
        if (!this.isRunning())
            return;
        const createdAt = new Date().toISOString();
        const content = fullContent || (this.livePartial?.streamId === streamId ? this.livePartial.content : '');
        if (content.trim()) {
            const msg = { id: 'a:' + streamId, role: 'assistant', content, createdAt };
            this.recordHistory(msg);
            this.broadcast({ type: 'done', streamId, content, createdAt });
        }
        if (this.livePartial?.streamId === streamId)
            this.livePartial = null;
    }
    publishError(streamId, message) {
        if (!this.isRunning())
            return;
        this.broadcast({ type: 'error', streamId, message: String(message || 'Stream error') });
        if (this.livePartial?.streamId === streamId)
            this.livePartial = null;
    }
    /**
     * Publish a non-streaming assistant response (e.g. from shortcut-triggered actions like
     * Code Hint, What to Answer, Brainstorm, Recap, etc.).  The label is shown in the phone
     * UI as the card's header (e.g. "Code Hint", "What to Answer").
     */
    publishAssistantMessage(id, content, label) {
        if (!this.isRunning() || !content?.trim())
            return;
        const createdAt = new Date().toISOString();
        const msg = {
            id: 'a:' + id,
            role: 'assistant',
            content,
            createdAt,
            label,
        };
        this.recordHistory(msg);
        this.broadcast({ type: 'assistant', id: msg.id, content: msg.content, label, createdAt });
    }
    /**
     * Broadcast a one-shot acknowledgement to all connected phones.
     * Used for stealth operations that succeed silently on the desktop side
     * (e.g. "Screenshot captured — queued for AI") so the phone shows a toast.
     */
    publishAck(action, message) {
        if (!this.isRunning())
            return;
        this.broadcast({ type: 'ack', action, message });
    }
    /** Returns true when at least one phone browser is connected. */
    hasClients() {
        return !!this.wss && this.wss.clients.size > 0;
    }
    /**
     * Subscribe to commands sent from the phone browser.
     * Returns an unsubscribe function.
     */
    onPhoneCommand(listener) {
        this.phoneCommandListeners.add(listener);
        return () => this.phoneCommandListeners.delete(listener);
    }
    // ----- snapshot / status -----
    async snapshot() {
        const enabled = !!SettingsManager_1.SettingsManager.getInstance().get('phoneMirrorEnabled');
        if (!this.isRunning()) {
            const info = {
                running: false,
                enabled,
                exposeOnLan: this.exposeOnLan,
                port: 0,
                loopbackUrl: null,
                primaryUrl: null,
                lanUrls: [],
                token: null,
                qrDataUrl: null,
                clients: 0,
            };
            this.cachedInfo = info;
            return info;
        }
        const loopbackUrl = `http://127.0.0.1:${this.port}/?t=${this.token}`;
        const lanUrls = this.exposeOnLan
            ? getLanIPs().map((ip) => `http://${ip}:${this.port}/?t=${this.token}`)
            : [];
        // If LAN is on, only advertise a real LAN URL — falling back to 127.0.0.1
        // would print a QR code the phone cannot reach (loopback ≠ phone).
        const primaryUrl = this.exposeOnLan ? lanUrls[0] || null : loopbackUrl;
        let qrDataUrl = null;
        if (primaryUrl) {
            if (this.cachedQrUrl === primaryUrl && this.cachedQrDataUrl) {
                qrDataUrl = this.cachedQrDataUrl;
            }
            else {
                qrDataUrl = await safeQr(primaryUrl);
                this.cachedQrUrl = primaryUrl;
                this.cachedQrDataUrl = qrDataUrl;
            }
        }
        else {
            this.cachedQrUrl = null;
            this.cachedQrDataUrl = null;
        }
        const info = {
            running: true,
            enabled,
            exposeOnLan: this.exposeOnLan,
            port: this.port,
            loopbackUrl,
            primaryUrl,
            lanUrls,
            token: this.token,
            qrDataUrl,
            clients: this.wss ? this.wss.clients.size : 0,
        };
        this.cachedInfo = info;
        return info;
    }
    onStatusChange(listener) {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }
    // ----- internals -----
    async _start(exposeOnLan, persistEnabled) {
        this.exposeOnLan = exposeOnLan;
        this.token = generateToken();
        this.invalidateQrCache();
        const host = exposeOnLan ? '0.0.0.0' : '127.0.0.1';
        const basePort = DEFAULT_PORT;
        const server = http_1.default.createServer((req, res) => this.handleHttp(req, res));
        server.on('clientError', (_err, socket) => {
            try {
                socket.destroy();
            }
            catch (_) {
                /* noop */
            }
        });
        const port = await listenWithProbe(server, host, basePort, PORT_PROBE_RANGE);
        this.server = server;
        this.port = port;
        const wss = new ws_1.WebSocketServer({ noServer: true });
        this.wss = wss;
        server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
        wss.on('connection', (ws, req) => this.handleWsConnection(ws, req));
        if (persistEnabled) {
            SettingsManager_1.SettingsManager.getInstance().set('phoneMirrorEnabled', true);
            SettingsManager_1.SettingsManager.getInstance().set('phoneMirrorExposeOnLan', exposeOnLan);
        }
        const info = await this.snapshot();
        this.emitStatus(info);
        console.log(`[PhoneMirror] listening on ${host}:${port} (lan=${exposeOnLan})`);
        return info;
    }
    async _teardown() {
        // Cancel any pending debounced status emit so it doesn't fire after teardown.
        if (this.statusDebounceTimer !== null) {
            clearTimeout(this.statusDebounceTimer);
            this.statusDebounceTimer = null;
        }
        const wss = this.wss;
        const server = this.server;
        this.wss = null;
        this.server = null;
        this.port = 0;
        this.token = '';
        this.livePartial = null;
        this.rateBuckets.clear();
        if (wss) {
            for (const c of wss.clients) {
                try {
                    c.close(1001, 'shutting down');
                }
                catch (_) {
                    /* noop */
                }
            }
            await new Promise((resolve) => wss.close(() => resolve()));
        }
        if (server) {
            await new Promise((resolve) => server.close(() => resolve()));
        }
    }
    handleHttp(req, res) {
        const remote = req.socket.remoteAddress || '0.0.0.0';
        if (!this.rateAllow(remote)) {
            res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '30' });
            res.end('Too many requests');
            return;
        }
        const fullUrl = new url_1.URL(req.url || '/', 'http://localhost');
        const provided = fullUrl.searchParams.get('t');
        // Health endpoint — minimal info, never reveals token or DB paths.
        if (fullUrl.pathname === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ ok: true, clients: this.wss ? this.wss.clients.size : 0 }));
            return;
        }
        if (fullUrl.pathname !== '/' && fullUrl.pathname !== '/index.html') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        if (!provided || !timingSafeEqualStr(provided, this.token)) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Pairing token missing or invalid.');
            return;
        }
        const csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' ws: wss:",
            "frame-ancestors 'none'",
            "base-uri 'none'",
        ].join('; ');
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': csp,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
        });
        res.end(phoneMirrorClient_1.PHONE_MIRROR_HTML);
    }
    handleUpgrade(req, socket, head) {
        const remote = req.socket.remoteAddress || '0.0.0.0';
        if (!this.rateAllow(remote)) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
            socket.destroy();
            return;
        }
        let url;
        try {
            url = new url_1.URL(req.url || '/', 'http://localhost');
        }
        catch {
            socket.destroy();
            return;
        }
        if (url.pathname !== '/ws') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        const provided = url.searchParams.get('t') || '';
        if (!timingSafeEqualStr(provided, this.token)) {
            // Custom 4401 close code signals "auth failed" to the client (won't reconnect).
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        const wss = this.wss;
        if (!wss) {
            socket.destroy();
            return;
        }
        // Drop any client that doesn't complete handshake quickly — avoids slow-loris.
        let upgraded = false;
        const handshakeTimer = setTimeout(() => {
            if (!upgraded)
                socket.destroy();
        }, HANDSHAKE_TIMEOUT_MS);
        wss.handleUpgrade(req, socket, head, (ws) => {
            upgraded = true;
            clearTimeout(handshakeTimer);
            wss.emit('connection', ws, req);
        });
    }
    handleWsConnection(ws, req) {
        // Send recent history immediately so a phone joining mid-session has context.
        try {
            ws.send(JSON.stringify({ type: 'history', messages: this.history.slice(-HISTORY_LIMIT) }));
            // Replay in-flight partial as a SINGLE token frame containing the full
            // accumulated content so far.  Previously this sent one frame per token
            // (up to 500+ frames for a long response) — now it's always 1 frame.
            if (this.livePartial && this.livePartial.content) {
                ws.send(JSON.stringify({
                    type: 'token',
                    streamId: this.livePartial.streamId,
                    token: this.livePartial.content,
                }));
            }
        }
        catch (_) {
            /* client may be gone already */
        }
        // Keepalive heartbeat. Drop dead clients within ~45s.
        let alive = true;
        ws.on('pong', () => {
            alive = true;
        });
        const ping = setInterval(() => {
            if (!alive) {
                try {
                    ws.terminate();
                }
                catch (_) { }
                return;
            }
            alive = false;
            try {
                ws.ping();
            }
            catch (_) { }
        }, 15_000);
        ws.on('close', () => {
            clearInterval(ping);
            this.emitStatusClientCount();
        });
        ws.on('error', () => {
            /* swallow — close fires next */
        });
        // Parse and route commands from the phone browser.
        ws.on('message', (data) => {
            try {
                const raw = typeof data === 'string' ? data : data.toString('utf8');
                if (raw.length > 4096)
                    return; // guard oversized payloads
                const cmd = JSON.parse(raw);
                if (!cmd || typeof cmd !== 'object')
                    return;
                const c = cmd;
                let validated = null;
                if (c.type === 'chat' &&
                    typeof c.message === 'string' &&
                    c.message.trim().length > 0 &&
                    c.message.length <= 2000) {
                    validated = { type: 'chat', message: c.message.trim() };
                }
                else if (c.type === 'action' &&
                    typeof c.action === 'string' &&
                    /^[a-zA-Z:_-]{1,64}$/.test(c.action)) {
                    validated = { type: 'action', action: c.action };
                }
                else if (c.type === 'screenshot') {
                    validated = { type: 'screenshot' };
                }
                if (validated) {
                    console.log(`[PhoneMirror] phone command: ${validated.type}`);
                    this.emitPhoneCommand(validated);
                }
            }
            catch (_) {
                /* malformed JSON — ignore */
            }
        });
        console.log(`[PhoneMirror] phone connected from ${req.socket.remoteAddress}`);
        this.emitStatusClientCount();
    }
    broadcast(event) {
        const wss = this.wss;
        // Skip JSON serialization entirely when no phones are watching — this path
        // is hot (every LLM token goes through it) so the early-exit matters.
        if (!wss || wss.clients.size === 0)
            return;
        const payload = JSON.stringify(event);
        for (const client of wss.clients) {
            if (client.readyState !== ws_1.WebSocket.OPEN)
                continue;
            // Backpressure guard: skip if buffered amount has run away (slow client).
            if (client.bufferedAmount > 1_000_000)
                continue;
            try {
                client.send(payload);
            }
            catch (_) {
                /* noop */
            }
        }
    }
    recordHistory(msg) {
        this.history.push(msg);
        // slice+reassign is O(1) GC pressure vs splice(0,n) which shifts every element.
        if (this.history.length > HISTORY_LIMIT * 2) {
            this.history = this.history.slice(-HISTORY_LIMIT);
        }
    }
    rateAllow(ip) {
        const now = Date.now();
        let bucket = this.rateBuckets.get(ip);
        if (!bucket || bucket.resetAt < now) {
            bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
            this.rateBuckets.set(ip, bucket);
        }
        bucket.count += 1;
        // Cheap LRU pruning so the map can't grow unbounded.
        if (this.rateBuckets.size > 256) {
            for (const [k, v] of this.rateBuckets) {
                if (v.resetAt < now)
                    this.rateBuckets.delete(k);
            }
        }
        return bucket.count <= RATE_HTTP_LIMIT;
    }
    disconnectAllClients(code, reason) {
        if (!this.wss)
            return;
        for (const c of this.wss.clients) {
            try {
                c.close(code, reason);
            }
            catch (_) { }
        }
    }
    invalidateQrCache() {
        this.cachedQrUrl = null;
        this.cachedQrDataUrl = null;
    }
    emitStatusClientCount() {
        if (this.statusListeners.size === 0)
            return;
        const clients = this.wss ? this.wss.clients.size : 0;
        if (this.cachedInfo && clients !== this.cachedInfo.clients) {
            const info = { ...this.cachedInfo, clients };
            this.cachedInfo = info;
            this.emitStatus(info);
            return;
        }
        this.emitStatus();
    }
    emitStatus(prebuilt) {
        if (this.statusListeners.size === 0)
            return;
        // Debounce: rapid connect/disconnect storms (bad network, iOS reconnect loop)
        // used to regenerate the QR code on every event — each safeQr() call costs
        // ~3 ms CPU.  Coalesce into one emission within a 150 ms window.
        if (this.statusDebounceTimer !== null)
            clearTimeout(this.statusDebounceTimer);
        this.statusDebounceTimer = setTimeout(async () => {
            this.statusDebounceTimer = null;
            const info = prebuilt || (await this.snapshot());
            for (const l of this.statusListeners) {
                try {
                    l(info);
                }
                catch (_) {
                    /* noop */
                }
            }
        }, 150);
    }
    emitPhoneCommand(cmd) {
        for (const l of this.phoneCommandListeners) {
            try {
                l(cmd);
            }
            catch (_) {
                /* noop */
            }
        }
    }
}
exports.PhoneMirrorService = PhoneMirrorService;
// ----- helpers -----
function generateToken() {
    return crypto_1.default.randomBytes(TOKEN_BYTES).toString('base64url');
}
function timingSafeEqualStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string')
        return false;
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) {
        // Still compare to keep timing roughly constant.
        const dummy = Buffer.alloc(ab.length || 1);
        crypto_1.default.timingSafeEqual(ab.length ? ab : dummy, ab.length ? dummy : ab);
        return false;
    }
    return crypto_1.default.timingSafeEqual(ab, bb);
}
// Filter out interfaces a phone on the same WiFi will NEVER be able to reach:
// - utun*: VPN tunnels (Tailscale, system VPN, WireGuard) — not on the LAN
// - awdl*, llw*: Apple Wireless Direct Link / low-latency WLAN — peer-to-peer only
// - anpi*, ap*: Apple Network Privacy / hotspot interfaces
// - bridge*: Internet Sharing / Thunderbolt bridge — different subnet
// - vmnet*, vboxnet*, docker*: virtualization-only networks
// - veth*, br-*: Linux container networks
const VIRTUAL_IFACE_RE = /^(utun|awdl|llw|anpi|ap\d|bridge|vmnet|vboxnet|docker|veth|br-|gif|stf|tap)/i;
function isPrivateLanIPv4(ip) {
    // RFC1918 — the only ranges a phone on the same Wi-Fi will share with the desktop.
    if (ip.startsWith('10.'))
        return true;
    if (ip.startsWith('192.168.'))
        return true;
    if (ip.startsWith('172.')) {
        const second = parseInt(ip.split('.')[1] || '0', 10);
        return second >= 16 && second <= 31;
    }
    return false;
}
function rankLanIp(name, ip) {
    // Lower score sorts earlier. We prefer:
    //   1. en0/en1 (Wi-Fi or Ethernet on macOS) over higher en* (often virtual).
    //   2. 192.168.x.x (home routers) over 10.x and 172.16-31.x.
    let score = 100;
    const m = name.match(/^en(\d+)$/i);
    if (m)
        score = parseInt(m[1], 10); // en0 -> 0, en1 -> 1, ...
    else if (/^eth\d+$|^enp/i.test(name))
        score = 2;
    else if (/^wlan\d+|^wlp/i.test(name))
        score = 1;
    if (ip.startsWith('192.168.'))
        score += 0;
    else if (ip.startsWith('10.'))
        score += 10;
    else
        score += 20; // 172.16-31.x
    return score;
}
function getLanIPs() {
    const candidates = [];
    const ifaces = os_1.default.networkInterfaces();
    for (const [name, list] of Object.entries(ifaces)) {
        if (!list)
            continue;
        if (VIRTUAL_IFACE_RE.test(name))
            continue;
        for (const a of list) {
            if (a.family !== 'IPv4' || a.internal)
                continue;
            if (!isPrivateLanIPv4(a.address))
                continue;
            candidates.push({ ip: a.address, name });
        }
    }
    candidates.sort((a, b) => rankLanIp(a.name, a.ip) - rankLanIp(b.name, b.ip));
    // De-dup while preserving order.
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
        if (seen.has(c.ip))
            continue;
        seen.add(c.ip);
        out.push(c.ip);
    }
    return out;
}
async function listenWithProbe(server, host, basePort, range) {
    for (let i = 0; i < range; i++) {
        const port = basePort + i;
        const ok = await tryListen(server, host, port);
        if (ok)
            return port;
    }
    // Final attempt: ephemeral port chosen by OS.
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, () => {
            const addr = server.address();
            if (addr && typeof addr === 'object')
                resolve(addr.port);
            else
                reject(new Error('Failed to bind ephemeral port'));
        });
    });
}
function tryListen(server, host, port) {
    return new Promise((resolve) => {
        const onError = () => {
            server.removeListener('listening', onListening);
            resolve(false);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            resolve(true);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        try {
            server.listen(port, host);
        }
        catch (_) {
            resolve(false);
        }
    });
}
async function safeQr(text) {
    try {
        return await qrcode_1.default.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
    }
    catch (_) {
        return null;
    }
}
// Avoid unused-symbol TS error for STATUS_LISTENERS_KEY; reserved for future external coordination.
void STATUS_LISTENERS_KEY;
// Reference Electron's `app` to keep the import live in case we later need userData paths.
void electron_1.app;
//# sourceMappingURL=PhoneMirrorService.js.map