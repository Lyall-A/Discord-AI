const fs = require("fs");

const config = require("./config.json");

function connectGateway() {
    const gateway = {};
    const listeners = [];
    const intervals = [];

    gateway.gatewayUrl = `${config.discord.gatewayBaseUrl}/?v=${config.discord.gatewayVersion}&encoding=json`;
    gateway.webSocket = new WebSocket(gateway.gatewayUrl);
    gateway.listeners = listeners;
    gateway.intervals = intervals;
    gateway.call = (event, ...args) => {
        for (let listenerIndex = listeners.length - 1; listenerIndex >= 0; listenerIndex--) {
            const listener = listeners[listenerIndex];
            if (listener.event !== event) continue;
            listener.callback(...args);
            if (listener.once) listeners.splice(listenerIndex, 1);
        }
    }
    gateway.on = (event, callback) => listeners.push({ event, callback, once: false });
    gateway.once = (event, callback) => listeners.push({ event, callback, once: true });
    gateway.sendJson = (json) => gateway.webSocket.send(JSON.stringify(json));
    gateway.sendText = (text) => gateway.webSocket.send(text);
    gateway.close = (code) => gateway.webSocket.close(code);
    gateway.whileConnected = (callback, interval) => intervals.push(setInterval(callback, interval));

    const { webSocket } = gateway;

    webSocket.addEventListener("open", () => {
        gateway.call("open");
    });

    webSocket.addEventListener("message", msg => {
        gateway.call("message", msg);
        try {
            const json = JSON.parse(msg.data);
            gateway.call("json", json);

            gateway.call("op", json);
            gateway.call(`op-${json.op}`, json);
            if (json.op === 0) gateway.call("event", json);
        } catch (err) { };
    });

    webSocket.addEventListener("close", () => {
        for (const interval of intervals) clearInterval(interval);
        gateway.call("close");
    });

    return gateway;
}

function formatString(string, object = {}) {
    // {{}} for objects
    // (()) for eval (scary) (dont use 2 parenthesis or start/end with parenthesis lol)

    return string.replace(/\\?(\(\((.+?)\)\)|{{(.+?)}})/gs, (match, fullMatch, evalGroup, objectGroup) => {
        if (match.startsWith("\\")) return match.slice(1);

        if (evalGroup) {
            return eval(`${Object.entries(object).map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`).join("\n")}\n${evalGroup}`);
        }

        if (objectGroup) {
            return objectGroup.split(".").reduce((acc, key) => acc && acc[key], object) ?? "";
        }

        return match;
    });
}

function clearCache() {
    debug("Clearing cache");
    cache.channels = [];
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(...msgs) {
    const timestamp = new Date().toLocaleString();
    const message = [`[${timestamp}]`, ...msgs];
    console.log(...message);
    if (config.logLocation) fs.appendFileSync(config.logLocation, message.join(" ") + "\n");
}

function debug(...msgs) {
    if (!config.debug) return;
    const message = ["[DEBUG]", ...msgs];
    log(...message);
}

module.exports = {
    connectGateway,
    formatString,
    clearCache,
    random,
    log,
    debug
}