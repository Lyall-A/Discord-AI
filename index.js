const { fetch } = Bun;

const secrets = require("./secrets.json");
const config = require("./config.json");

const discordClient = { };

main();

function main() {
    const gateway = connectGateway();
    console.log(`Conecting to Discord gateway at '${gateway.gatewayUrl}'`);

    // hello
    gateway.once("op-10", ({ d: data }) => {
        // heartbeat
        const { heartbeat_interval: heartbeatInterval } = data;
        console.log(`Setting heartbeat interval to ${heartbeatInterval}`);
        gateway.whileConnected(sendHeartbeat, heartbeatInterval);

        // identify
        sendPayload(2, {
            token: secrets.discordToken,
            intents: config.discord.intents,
            properties: config.discord.properties
        });
    });

    gateway.on("event", ({ t: event, d: data }) => {
        if (event === "READY") {
            discordClient.user = data.user;

            console.log(`Online as ${discordClient.user.username}${discordClient.user.discriminator ? `#${discordClient.user.discriminator}` : ""} (${discordClient.user.id})`);
        } else {
            // console.log(`Received unhandled event '${event}'`);
        }
    });

    function sendPayload(op, data) {
        gateway.sendJson({ op, d: data });
    }

    function sendHeartbeat() {
        sendPayload(1, null); // TODO: implement correctly: https://discord.com/developers/docs/events/gateway#heartbeat-interval
    }
}

function connectGateway() {
    const gateway = { };
    const listeners = [];
    const intervals = [];
    
    gateway.gatewayUrl = `${config.discord.gatewayBaseUrl}/?v=${config.discord.gatewayVersion}&encoding=json`;
    gateway.webSocket = new WebSocket(gateway.gatewayUrl);
    gateway.listeners = listeners;
    gateway.intervals = intervals;
    gateway.call = (event, ...args) => {
        for (const listenerIndex in [...listeners]) {
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
        } catch (err ) {};
    });

    webSocket.addEventListener("close", () => {
        for (const interval of intervals) clearInterval(interval);
        gateway.call("close");
    });

    return gateway;
}