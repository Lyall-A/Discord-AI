const { fetch } = Bun;
const fs = require("fs");

const secrets = require("./secrets.json");
const config = require("./config.json");

const systemPromptText = fs.readFileSync("system-prompt.txt", "utf-8");
const promptText = fs.readFileSync("prompt.txt", "utf-8");

main();

function main() {
    const discordClient = { };
    const allHistory = [ ];

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

        // check history
        gateway.whileConnected(() => checkHistory(allHistory), config.historyCheck);
    });

    // events (dispatch)
    gateway.on("event", ({ t: event, d: data }) => {
        if (event === "READY") {
            discordClient.user = data.user;
            // discordClient.more shit, FUCK OFF!

            console.log(`Online as ${discordClient.user.username}${discordClient.user.discriminator ? `#${discordClient.user.discriminator}` : ""} (${discordClient.user.id})`);
        } else
        if (event === "MESSAGE_CREATE") {
            const shouldRespond = (data.author.bot && !config.respondToBots) ? false : config.channels?.includes(data.channel_id) || config.servers?.includes(data.guild_id) || config.users?.includes(data.author.id) || false;
            
            const guildId = data.guild_id;
            const channelId = data.channel_id;
            const message = data.content;
            
            if (!shouldRespond || !message) return;

            const promptObject = {
                // stuff to pass to the prompt, like usernames etc
                author: data.author,
                message,
                globalName: data.author.global_name || "",
                nickname: data.member.nick || "",
                member: data.member,
                guildId: guildId,
                channelId: channelId,
                timestamp: data.timestamp,
                prettyTimestamp: new Date(data.timestamp).toLocaleString(),
            };
            
            const historyIndex = allHistory.findIndex(i => i.channelId === channelId);
            const history = historyIndex >= 0 ? allHistory[historyIndex] : allHistory[allHistory.push({
                channelId: channelId,
                systemPrompt: formatString(systemPromptText, promptObject),
                messages: [],
            }) - 1];

            const prompt = formatString(promptText, promptObject);

            // console.log("System prompt:", history.systemPrompt);
            // console.log("Prompt:", prompt);

            generateResponse(prompt, history).then(response => {
                // TODO: send response
                sendMessage(channelId, response.content);
            }).catch(err => {
                // TODO: error handling
            });
        } else {
            // console.log(`Received unhandled event '${event}'`);
        }
    });

    gateway.on("close", () => {
        console.log(`Discord gateway closed, reconnecting in ${config.reconnectTimeout / 1000} second(s)...`);
        setTimeout(main, config.reconnectTimeout);
    });

    function sendPayload(op, data) {
        gateway.sendJson({ op, d: data });
    }

    function sendHeartbeat() {
        sendPayload(1, null); // TODO: implement correctly: https://discord.com/developers/docs/events/gateway#heartbeat-interval
    }

}

function sendMessage(channelId, message) {
    return new Promise((resolve, reject) => {
        fetch(`${config.discord.apiBaseUrl}/v${config.discord.apiVersion}/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `${config.discord.isBot ? "Bot" : "Bearer"} ${secrets.discordToken}`
            },
            body: JSON.stringify({
                content: message
            })
        }).then(i => i.json()).then(response => {
            // TODO: proper checks
            resolve();
        }).catch(err => {
            reject(err);
        });
    });
}

function checkHistory(allHistory) {
    for (let historyIndex = allHistory.length - 1; historyIndex >= 0; historyIndex--) {
        const history = allHistory[historyIndex];
        if (Date.now() - history.lastUpdated >= config.historyDelete) {
            // remove all history if unused for a while
            allHistory.splice(historyIndex, 1);
        } else if (history.messages.length > config.historyLength) {
            // keeps history within length
            history.messages.splice(0, history.messages.length - config.historyLength);
        }
    }
}

function generateResponse(prompt, history) {
    return new Promise((resolve, reject) => {
        history.messages.push({
            role: "user",
            content: prompt
        });

        // console.log([
        //     {
        //         role: "system",
        //         content: history.systemPrompt,
        //     },
        //     ...history.messages
        // ]);

        fetch(`${config.openAi.apiBaseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secrets.openAiApiKey}`
            },
            body: JSON.stringify({
                model: config.openAi.model,
                messages: [
                    {
                        role: "system",
                        content: history.systemPrompt,
                    },
                    ...history.messages
                ],
                temperature: config.openAi.temperature
            })
        }).then(i => i.json()).then(response => {
            // TODO: proper checks
            const message = response.choices[0].message;
            history.messages.push(message);
            resolve(message);
        }).catch(err => {
            reject(err);
        });
    });
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

function formatString(string, object) {
    return string.replace(/%{(.*?)}/g, (match, group) => {
        return group.split(".").reduce((acc, key) => acc && acc[key], object);
    });
}