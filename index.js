const { fetch } = Bun;
const fs = require("fs");

const secrets = require("./secrets.json");
const config = require("./config.json");

const systemPromptText = fs.readFileSync(config.systemPromptLocation, "utf-8");
const promptText = fs.readFileSync(config.promptLocation, "utf-8");

const responseParser = require("./responseParser");

main();

function main() {
    const discordClient = { };
    const allHistory = [ ];
    const rateLimits = [];

    const gateway = connectGateway();
    log(`Conecting to Discord gateway at '${gateway.gatewayUrl}'`);

    // hello
    gateway.once("op-10", ({ d: data }) => {
        // heartbeat
        const { heartbeat_interval: heartbeatInterval } = data;
        log(`Setting heartbeat interval to ${heartbeatInterval}`);
        gateway.whileConnected(sendHeartbeat, heartbeatInterval);

        // identify
        sendPayload(2, {
            token: secrets.discordToken,
            intents: config.discord.intents,
            properties: config.discord.properties,
            presence: config.discord.presence
        });

        // check history
        gateway.whileConnected(() => checkHistory(allHistory), config.historyCheck);
    });

    // events (dispatch)
    gateway.on("event", ({ t: event, d: data }) => {
        if (event === "READY") {
            discordClient.user = data.user;
            // discordClient.more shit, FUCK OFF!

            log(`Online as ${discordClient.user.username}${discordClient.user.discriminator ? `#${discordClient.user.discriminator}` : ""} (${discordClient.user.id})`);
        } else
        if (event === "MESSAGE_CREATE") {
            const shouldRespond = (data.author.bot && !config.respondToBots) ? false : config.channels?.includes(data.channel_id) || config.servers?.includes(data.guild_id) || config.users?.includes(data.author.id) || false;
            
            const guildId = data.guild_id;
            const channelId = data.channel_id;
            const message = data.content;
            
            if (!shouldRespond || !message || rateLimits.includes(channelId)) return;

            const promptObject = {
                // stuff to pass to the prompt, like usernames etc
                message,
                author: data.author,
                member: data.member,
                guildId: guildId,
                channelId: channelId,
                timestamp: data.timestamp,
                ...config.promptData
            };
            
            const historyIndex = allHistory.findIndex(i => i.channelId === channelId);
            const history = historyIndex >= 0 ? allHistory[historyIndex] : allHistory[allHistory.push({
                channelId: channelId,
                systemPrompt: formatString(systemPromptText, promptObject),
                messages: [],
                lastUpdated: Date.now()
            }) - 1];

            const prompt = formatString(promptText, promptObject);

            // log("System prompt:", history.systemPrompt);
            // log("Prompt:", prompt);

            // add rate limit
            if (config.rateLimit) {
                rateLimits.push(channelId);
                setTimeout(() => {
                    const index = rateLimits.findIndex(i => i === channelId);
                    if (index >= 0) rateLimits.splice(index, 1);
                }, config.rateLimit);
            }

            generateResponse(prompt, history).then(response => {
                const parsedResponse = responseParser(response.content);
                const responseMessage = parsedResponse.message;

                if (parsedResponse.ignored || !parsedResponse.message) return log(`${message.replace(/\n/g, " ")} > [IGNORED]`);

                // TODO: reply based on config.reply bool
                sendMessage(channelId, responseMessage.length > 2000 ? `${responseMessage.substring(0, 2000 - 3)}...` : responseMessage).then(() => {
                    log(`${message.replace(/\n/g, " ")} > ${responseMessage.replace(/\n/g, " ")}`);
                }).catch(err => {
                    log(`Failed to send generated response to channel '${channelId}':`, err);
                    sendMessage(channelId, "couldnt send response it was probably too long or some shit");
                });
            }).catch(err => {
                log(`Failed to generate response for channel '${channelId}':`, err);
                sendMessage(channelId, `HAD AN ERROR NOOOOOOO\n\`\`\`\n${err}\n\`\`\``);
            });
        } else {
            // log(`Received unhandled event '${event}'`);
        }
    });

    gateway.on("close", () => {
        log(`Discord gateway closed, reconnecting in ${config.reconnectTimeout / 1000} second(s)...`);
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
        // log(history);
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
        history.lastUpdated = Date.now();
        
        // log([
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
            history.lastUpdated = Date.now();
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
        } catch (err ) {};
    });

    webSocket.addEventListener("close", () => {
        for (const interval of intervals) clearInterval(interval);
        gateway.call("close");
    });

    return gateway;
}

function formatString(string, object = { }) {
    // {{}} for objects
    // (()) for eval (scary)
    // TODO: escape/dont format replaced stuff, for example if &{'hello %{word}'} is included, it would fuck up
    return string
        .replace(/\\?{{(.*?)}}/g, (match, group) => match.startsWith("\\") ? match.replace(/^\\/, "") : eval(`${Object.entries(object).map(i => `const ${i[0]} = ${JSON.stringify(i[1])};`).join("\n")}\n${group}`))
        .replace(/\\?\(\((.*?)\)\)/g, (match, group) => match.startsWith("\\") ? match.replace(/^\\/, "") : group.split(".").reduce((acc, key) => acc && acc[key], object));
}

function log(...msgs) {
    const timestamp = new Date().toLocaleString();
    const message = [`[${timestamp}]`, ...msgs];
    console.log(...message);
    if (config.logLocation) fs.appendFileSync(config.logLocation, message.join(" ") + "\n");
}