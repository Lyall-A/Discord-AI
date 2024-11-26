const { fetch } = Bun;
const fs = require("fs");

const secrets = require("./secrets.json");
const config = require("./config.json");

// prompts
let systemPromptText = fs.readFileSync(config.systemPromptLocation, "utf-8");
let promptText = fs.readFileSync(config.promptLocation, "utf-8");
let conversationPromptText = fs.readFileSync(config.conversationPromptLocation, "utf-8");

// monitor prompts for changes
fs.watchFile(config.systemPromptLocation, () => systemPromptText = fs.readFileSync(config.systemPromptLocation, "utf-8"));
fs.watchFile(config.promptLocation, () => promptText = fs.readFileSync(config.promptLocation, "utf-8"));
fs.watchFile(config.conversationPromptLocation, () => conversationPromptText = fs.readFileSync(config.conversationPromptLocation, "utf-8"));

const responseParser = require("./responseParser");

log(`${config.promptData.name ? `${config.promptData.name} is` : "I'm"} waking up... be scared`);

const cache = {
    channels: [],
};
const allHistory = [];
const rateLimits = [];

setInterval(() => checkHistory(allHistory), config.historyCheck); // update history loop

if (config.cache && config.cacheResetInterval) setInterval(clearCache, config.cacheResetInterval); // cache reset loop

if (config.startConversations) setInterval(startConversations, config.startConversationsInterval); // start conversation loop
// if (config.startConversations) startConversations();

main();

function main() {
    const discordClient = {
        user: {},
        lastSequenceNumber: null
    };

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
    });

    // events (dispatch)
    gateway.on("event", async ({ s: sequenceNumber, t: event, d: data }) => {
        if (sequenceNumber !== null) discordClient.lastSequenceNumber = sequenceNumber;
        if (event === "READY") {
            discordClient.user = data.user;
            // discordClient.more shit, FUCK OFF!

            log(`Online as ${discordClient.user.global_name ? `${discordClient.user.global_name}, ` : ""}${discordClient.user.username}${parseInt(discordClient.user.discriminator) ? `#${discordClient.user.discriminator}` : ""} (${discordClient.user.id})`);
            log(`${discordClient.user.global_name || discordClient.user.username} is awake, lock your doors`);
        } else
            if (event === "MESSAGE_CREATE") {
                const channelId = data.channel_id;
                const channel = await getChannel(channelId).catch(err => log(`Failed to get channel '${channelId}'`));
                if (!channel) return; // if failed to get channel
                const guildId = data.guild_id;
                const isMentioned = data.mentions?.some(i => i.id === discordClient.user.id);
                const isServer = channel.type === 0;
                const isDm = channel.type === 1;
                const isGroupChat = channel.type === 3;
                const type = isServer ? "Server" : isDm ? "DM" : isGroupChat ? "Group Chat" : null;
                const message = data.content
                    .replace(new RegExp(`<@${discordClient.user.id}>`, "g"), discordClient.user.global_name || discordClient.user.username); // replace mention with username

                if (data.author.id === discordClient.user.id) return; // message from self
                if (data.author.bot && !config.respondToBots) return; // bot
                if (!message) return; // no message (eg. attachment with no message content)
                if (config.ignorePrefix && config.ignorePrefix?.some(i => message.startsWith(i))) return; // message starts with ignore prefix
                if (rateLimits.includes(channelId)) return; // channel is rate limited
                if (config.blacklistedChannels?.includes(channelId)) return; // blacklisted channel
                if (isServer && config.blacklistedServers?.includes(guildId)) return; // blacklisted server
                if (config.respondToAllMentions && !isMentioned) {
                    if (isServer && !config.respondToAllServers && !config.serverChannels.includes(channelId) && !config.servers.includes(guildId)) return; // is server
                    if (isDm && !config.respondToAllDms && !config.dmChannels.includes(channelId)) return; // is dm
                    if (isGroupChat && !config.respondToAllGroupChats && !config.groupChatChannels.includes(channelId)) return; // is gc
                }

                const promptObject = {
                    // stuff to pass to the prompt, like usernames etc
                    message,
                    guildId,
                    referencedMessage: data.referenced_message,
                    me: discordClient,
                    author: data.author,
                    member: data.member,
                    channel,
                    channelId,
                    type,
                    isServer,
                    isDm,
                    isGroupChat,
                    timestamp: new Date().toUTCString(),
                    ...config.promptData
                };

                const historyIndex = allHistory.findIndex(i => i.channelId === channelId);
                const history = historyIndex >= 0 ? allHistory[historyIndex] : allHistory[allHistory.push({
                    channelId,
                    channel,
                    systemPrompt: formatString(systemPromptText, promptObject),
                    messages: [],
                    created: Date.now(),
                    lastUpdated: Date.now(),
                    startedConversation: false,
                    multipleMessages: false,
                    currentlyResponding: false,
                    typing: false
                }) - 1];

                if (history.currentlyResponding && config.cancelMultipleMessages) return history.multipleMessages = true;

                history.startedConversation = false;
                history.currentlyResponding = true;

                const prompt = formatString(promptText, promptObject);

                // console.log("System prompt:", history.systemPrompt);
                // console.log("Prompt:", prompt);
                // console.log("History:", history.messages);

                // add rate limit
                if (config.rateLimit) {
                    rateLimits.push(channelId);
                    setTimeout(() => {
                        const index = rateLimits.findIndex(i => i === channelId);
                        if (index >= 0) rateLimits.splice(index, 1);
                    }, config.rateLimit);
                }

                const beforeResponseDate = Date.now();

                // startTyping(channelId).catch(err => log(`Failed to trigger typing indicator for channel '${channelId}':`, err)); // start typing
                // get generated response
                await generateResponse(prompt, history).then(response => {
                    const parsedResponse = responseParser(response.content);
                    const responseMessage = parsedResponse.message;

                    if (config.ignoreHistory) addHistory(response, history); // add response to history even if it is an ignored response

                    if (parsedResponse.ignored || !parsedResponse.message) {
                        log(`[${channelId}]`, "[Ignored]", `"${message.replace(/\n/g, " ")}"${parsedResponse.ignoredReason ? `. Reason: ${parsedResponse.ignoredReason}` : ""}`);
                        if (config.debug) sendMessage(channelId, `[DEBUG] Ignored${parsedResponse.ignoredReason ? ` for '${parsedResponse.ignoredReason}'` : ""}`).catch(err => { });
                        history.multipleMessages = false;
                        history.currentlyResponding = false;
                        return;
                    }

                    if (!config.ignoreHistory) addHistory(response, history); // add response to history only if it isnt an ignored response

                    // create delay, readDelayPerCharacter will be multiplied by message length, thinkDelayMin and thinkDelayMax is a random delay between and respondDelayPerCharacter will be multiplied by response length
                    const readDelay = (config.readDelayPerCharacter * message.length);
                    const thinkDelay = random(config.thinkDelayMin, config.thinkDelayMax);
                    const respondDelay = (config.respondDelayPerCharacter * responseMessage.length);
                    const delay = readDelay + thinkDelay + respondDelay;

                    const trueDelay = Math.max(Math.min(delay - (Date.now() - beforeResponseDate), config.delayMax), 0);

                    debug(`Delaying response by ${trueDelay}ms (read: ${readDelay}ms, think: ${thinkDelay}ms, respond: ${respondDelay})`);

                    if (trueDelay - respondDelay > 100 && config.typing) setTimeout(() => {
                        startTypingLoop(channelId, history).catch(err => { });
                    }, trueDelay - respondDelay);

                    setTimeout(() => {
                        const messageOptions = {
                            message_reference: (config.reply || (config.replyIfMultipleMessages && history.multipleMessages)) ? { type: 0, message_id: data.id, channel_id: channelId, guild_id: guildId, fail_if_not_exists: false } : undefined,
                            allowed_mentions: { replied_user: config.replyMention }
                        };

                        history.multipleMessages = false;
                        history.currentlyResponding = false;
                        history.typing = false;

                        // send generated response to discord
                        sendMessage(channelId, responseMessage.length > 2000 ? `${responseMessage.substring(0, 2000 - 3)}...` : responseMessage, messageOptions).then(() => {
                            log(`[${channelId}]`, "[Message]", `"${message.replace(/\n/g, " ")}" > "${responseMessage.replace(/\n/g, " ")}"`);
                        }).catch(err => {
                            log(`[${channelId}]`, "[Error]", "Failed to send generated response:", err);
                            sendMessage(channelId, "Couldn't send generated response, but managed to send this?", messageOptions).catch(err => { });
                        });
                    }, trueDelay);
                }).catch(err => {
                    log(`[${channelId}]`, "[Error]", "Failed to generate response", err);
                    sendMessage(channelId, `Failed to generate response\n\`\`\`\n${err}\n\`\`\``);
                });
            } else {
                // log(`Received unhandled event '${event}'`); // doesnt matter
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
        sendPayload(1, discordClient.lastSequenceNumber ?? null);
    }
}

async function startConversations() {
    if (!config.startConversations) return;

    for (const channelId of config.startConversationsChannels) {
        const randomNum = random(1, 100);
        if (randomNum > config.startConversationsChance) {
            debug(`Not starting conversation for channel '${channelId}', ${randomNum} over ${config.startConversationsChance}`);
            continue;
        };
        debug(`Trying to start conversation for channel '${channelId}'`);

        const channel = await getChannel(channelId).catch(err => {
            log(`Failed to get channel '${channelId}' while starting conversation`);
        });
        if (!channel) continue;

        const isServer = channel.type === 0;
        const isDm = channel.type === 1;
        const isGroupChat = channel.type === 3;
        const type = isServer ? "Server" : isDm ? "DM" : isGroupChat ? "Group Chat" : null;

        const promptObject = {
            channel,
            channelId,
            type,
            isServer,
            isDm,
            isGroupChat,
            timestamp: new Date().toUTCString(),
            ...config.promptData
        };

        const historyIndex = allHistory.findIndex(i => i.channelId === channelId);
        const history = historyIndex >= 0 ? allHistory[historyIndex] : allHistory[allHistory.push({
            channelId,
            channel,
            systemPrompt: formatString(systemPromptText, promptObject),
            messages: [],
            created: Date.now(),
            lastUpdated: Date.now(),
            startedConversation: false,
            multipleMessages: false,
            currentlyResponding: false,
            typing: false
        }) - 1];

        if (history.startedConversation) {
            // already started conversation previously
            debug(`Already tried starting conversation in channel '${channelId}' with no response, not trying again`);
            continue;
        };
        if (historyIndex >= 0 && Date.now() - history.lastUpdated < config.startConversationsMinTime) {
            // conversation possibly already going on
            debug(`Conversation possibly already going on in channel '${channelId}', not trying again`);
            continue;
        }

        history.startedConversation = true;
        history.currentlyResponding = true;

        const prompt = formatString(conversationPromptText, promptObject);

        await generateResponse(prompt, history).then(response => {
            const parsedResponse = responseParser(response.content);
            const responseMessage = parsedResponse.message;

            if (parsedResponse.ignored || !parsedResponse.message) return debug("Ignored while trying to start conversation");

            addHistory(response, history);

            const respondDelay = (config.respondDelayPerCharacter * responseMessage.length);

            if (respondDelay > 100 && config.typing) startTypingLoop(channelId, history).catch(err => { });

            setTimeout(() => {
                history.multipleMessages = false;
                history.currentlyResponding = false;
                history.typing = false;

                // send generated response to discord
                sendMessage(channelId, responseMessage.length > 2000 ? `${responseMessage.substring(0, 2000 - 3)}...` : responseMessage).then(() => {
                    log(`[${channelId}]`, "[Starting Conversation]", `"${responseMessage.replace(/\n/g, " ")}"`);
                }).catch(err => {
                    log(`[${channelId}]`, "[Error]", "Failed to send generated response while starting conversation:", err);
                });
            }, respondDelay);
        });
    }
}

function startTypingLoop(channelId, history) {
    return new Promise((resolve, reject) => {
        history.typing = true;
        startTyping(channelId).then(i => {
            setTimeout(() => {
                if (history.typing) return startTypingLoop(channelId, history);
            }, 9 * 1000);
            resolve();
        }).catch(err => reject(err));
    });
}

function startTyping(channelId) {
    return new Promise((resolve, reject) => {
        debug(`Triggering typing indicator in channel '${channelId}'`);
        fetch(`${config.discord.apiBaseUrl}/v${config.discord.apiVersion}/channels/${channelId}/typing`, {
            method: "POST",
            headers: {
                Authorization: `${!config.discord.isUser ? "Bot " : ""}${secrets.discordToken}`
            }
        }).then(async response => {
            const json = await response.json().catch(err => { });
            if (response.status === 204) {
                resolve();
            } else {
                reject(`Got status code ${response.status}, message: ${json?.message}, code: ${json?.code}`);
            }
        }).catch(err => {
            reject(err);
        });
    });
}

function getChannel(channelId) {
    return new Promise((resolve, reject) => {
        const cachedChannel = cache.channels.find(i => i.id === channelId);
        debug(`Getting channel '${channelId}'${cachedChannel ? ` [CACHED]` : ""}`);
        if (cachedChannel) return resolve(cachedChannel);
        fetch(`${config.discord.apiBaseUrl}/v${config.discord.apiVersion}/channels/${channelId}`, {
            method: "GET",
            headers: {
                Authorization: `${!config.discord.isUser ? "Bot " : ""}${secrets.discordToken}`
            }
        }).then(async response => {
            const json = await response.json().catch(err => { });
            if (response.status === 200 && json?.id) {
                cache.channels.push(json);
                resolve(json);
            } else {
                reject(`Got status code ${response.status}, message: ${json?.message}, code: ${json?.code}`);
            }
        }).catch(err => {
            reject(err);
        });
    });
}

function sendMessage(channelId, message, options) {
    return new Promise((resolve, reject) => {
        debug(`Sending message in channel '${channelId}'`);
        fetch(`${config.discord.apiBaseUrl}/v${config.discord.apiVersion}/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `${!config.discord.isUser ? "Bot " : ""}${secrets.discordToken}`
            },
            body: JSON.stringify({
                content: message,
                ...options
            })
        }).then(async response => {
            const json = await response.json().catch(err => { });
            if (response.status === 200 && json?.id) {
                resolve();
            } else {
                reject(`Got status code ${response.status}, message: ${json?.message}, code: ${json?.code}`);
            }
        }).catch(err => {
            reject(err);
        });
    });
}

function generateResponse(prompt, history) {
    return new Promise((resolve, reject) => {
        // debug(`Generating response for '${prompt}'`);
        debug("Generating response");

        if (prompt) addHistory({ role: "user", content: prompt }, history);

        const messages = [
            {
                role: "system",
                content: history.systemPrompt
            },
            ...history.messages
        ];

        fetch(`${config.openAi.apiBaseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secrets.openAiApiKey}`
            },
            body: JSON.stringify({
                model: config.openAi.model,
                messages,
                temperature: config.openAi.temperature
            })
        }).then(async response => {
            const json = await response.json().catch(err => { });
            if (response.status === 200 && json?.id) {
                debug(`Generated response used ${json.usage.prompt_tokens} tokens for prompt and ${json.usage.completion_tokens} tokens for completion (${json.usage.total_tokens} total)`);
                const message = json.choices[0].message;
                history.lastUpdated = Date.now();
                resolve(message);
            } else {
                reject(`Got status code ${response.status}, error: ${json?.error}`);
            }
        }).catch(err => {
            reject(err);
        });
    });
}

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

function addHistory(message, history) {
    history.messages.push(message);
    history.lastUpdated = Date.now();
}

function checkHistory(allHistory) {
    for (let historyIndex = allHistory.length - 1; historyIndex >= 0; historyIndex--) {
        const history = allHistory[historyIndex];
        // log(history);
        const lastUpdated = Date.now() - history.lastUpdated;
        const messagesLength = history.messages.length;
        if (lastUpdated >= config.historyDelete && !history.startedConversation) {
            // remove all history if unused for a while
            log(`[${history.channelId}]`, "[Info]", "Removing history");
            allHistory.splice(historyIndex, 1);
        } else if (messagesLength > config.historyLength) {
            // keeps history within length
            log(`[${history.channelId}]`, "[Info]", `Truncating history (${messagesLength} > ${config.historyLength})`);
            history.messages.splice(0, messagesLength - config.historyLength);
        }
    }
}

function formatString(string, object = {}) {
    // {{}} for objects
    // (()) for eval (scary) (dont use 2 parenthesis or start/end with parenthesis lol)

    return string.replace(/\\?(\(\((.+?)\)\)|{{(.+?)}})/g, (match, fullMatch, evalGroup, objectGroup) => {
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