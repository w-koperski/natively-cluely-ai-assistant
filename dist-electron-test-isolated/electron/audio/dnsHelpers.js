"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipv4OnlyLookup = void 0;
exports.streamingStttWsOptions = streamingStttWsOptions;
const dns_1 = __importDefault(require("dns"));
/**
 * IPv4-only DNS resolver for STT WebSocket connections.
 *
 * Why this exists: on macOS, Node's default `getaddrinfo(AF_UNSPEC)` lookup on
 * dual-stack hosts can return a hard `ENOTFOUND` for IPv4-only CNAME chains
 * (e.g. api.natively.software → *.up.railway.app → 66.33.22.108) when the
 * machine has a link-local IPv6 address (fe80::…) but no real v6 path.
 * curl/libcurl handles this gracefully by falling back to v4; libuv on Darwin
 * sometimes does not. Symptom: `nslookup` and `curl` resolve fine from the
 * same machine, but every `new WebSocket('wss://…')` fires
 * `error: getaddrinfo ENOTFOUND <host>` — never reaching the server, so
 * transcripts never start.
 *
 * Forcing family=4 mirrors curl's effective behavior: skip IPv6 entirely.
 * Streaming STT endpoints (Natively, ElevenLabs, Soniox, OpenAI Realtime) are
 * effectively IPv4-only at the edge today, so we lose nothing by pinning the
 * resolver here. If a vendor later moves to IPv6-only or v6-preferred, swap
 * to family=0 (AF_UNSPEC) with a custom v6→v4 fallback.
 */
const ipv4OnlyLookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    dns_1.default.lookup(hostname, { ...options, family: 4 }, callback);
};
exports.ipv4OnlyLookup = ipv4OnlyLookup;
/**
 * Standard `ws` options for every streaming-STT WebSocket. Adds:
 *   - lookup: ipv4OnlyLookup        (avoids the macOS dual-stack ENOTFOUND)
 *   - family: 4                     (defense-in-depth — `ws` forwards this to
 *                                    https.request → tls.connect)
 *   - handshakeTimeout: 15000       (caps how long we wait for the TLS+upgrade
 *                                    handshake before giving up; without this
 *                                    a stuck handshake hangs on the kernel TCP
 *                                    keepalive timer, which can be minutes)
 */
function streamingStttWsOptions(extra) {
    return {
        lookup: exports.ipv4OnlyLookup,
        family: 4,
        handshakeTimeout: 15_000,
        ...(extra || {}),
    };
}
//# sourceMappingURL=dnsHelpers.js.map