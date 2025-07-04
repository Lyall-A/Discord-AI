// Modules
import path from "path";
import fs from "fs";

// Utils
import getUser from "./utils/getUser";
import { DiscordGateway } from "./utils/DiscordGateway";
import createChatCompletion from "./utils/createChatCompletion";
import logger from "./utils/logger";
import isMatch from "./utils/isMatch";
import sendMessage from "./utils/sendMessage";
import { startTyping } from "./utils/startTyping";
import { calculateMessageDelay } from "./utils/calculateMessageDelay";
import { shouldStartConversation } from "./utils/shouldStartConversation";
import { getChannel } from "./utils/getChannel";

// Types
import {
    Prompt,
    Channel
} from "./types";

// Config
import config from "./config.json";

// Prompts and completions
import { createSystemPrompt } from "./system.prompt";
import { createUserPrompt } from "./user.prompt";
import { createAssistantCompletion } from "./assistant.completion";

(async function main() {
    const channels: Channel[] = [ ];

    // Verify token
    logger.log("Verifying token...");
    let user: any;
    try {
        user = await getUser();
    } catch (err) {
        return logger.log("Failed to verify token, is it correct?");
    }
    logger.followUp("Yup!");

    // Interval for clearing inactive channels
    setInterval(() => {
        for (const channel of channels) {
            if (
                !channel.messageHistory.length &&
                !channel.memories.length &&
                !channel.currentlyResponding
            ) {
                logger.log(`Clearing channel "${channel.name || ""}" (${channel.id})`);
                channels.splice(channels.indexOf(channel), 1);
            }
        }
    }, config.channelClearInterval);

    // Interval for starting conversations
    if (config.startConversations && ) setInterval(() => {

    }, config.startConversationInterval);

    // Connect to gateway
    await connectGateway();

    function connectGateway() {
        return new Promise((resolve, reject) => {
            logger.log("Connecting to gateway...");
            const gateway = new DiscordGateway();

            gateway.on("ready", (ready) => {
                // Connected to Gateway
                logger.followUp("Connected! :D");
                logger.log(`${ready.user.username} is ready, lock your doors locked :3`);
                resolve(ready);
            });

            gateway.on("event-MESSAGE_CREATE", async (event) => {
                // TODO: move to function so this can also be used for conversation starter
                // Message received
                const { data: message } = event;
                const {
                    channel_id: channelId,
                    guild_id: guildId,
                    id: messageId,
                    author,
                    mention_everyone: mentionEveryone,
                    tts,
                    content,
                    member,
                    type
                } = message;

                if (
                    author.id === user.id || // Is self
                    !isMatch(message) || // Doesn't match requirements
                    config.ignorePrefix.find(prefix => content.startsWith(prefix))
                ) return; // We don't want to talk here
                
                const date = new Date(); // Current date
                const typeString =
                    type === 0 ? "Server" :
                    type === 1 ? "DM" :
                    type === 3 ? "Group Chat" :
                    undefined; // TODO: more
                
                // Get channel
                const channel = await getChannelInfo();
                const { memories, messageHistory } = channel;
                channel.lastMessage = date.getTime();

                if (channel.currentlyResponding >= config.maxSimultaneousResponses) return;

                channel.currentlyResponding++;
                
                // Reset timeouts for truncation and clearing
                channel.resetTimeouts();

                // Prompt
                const prompt: Prompt = {
                    date: date.toString(),
                    channel,
                    messageId,
                    guildId,
                    mentionEveryone,
                    tts,
                    type,
                    typeString,
                    id: author.id,
                    username: author.username,
                    name: author.global_name,
                    nickname: member.nick,
                    clanTag: author.clan.tag,
                    joinDate: new Date(member.joined_at).toString(),
                    message: content
                };

                // Create prompts and completion
                const systemPrompt = createSystemPrompt(prompt);
                const userPrompt = createUserPrompt(prompt);
                // fs.writeFileSync("./latest.md", systemPrompt);
                const assistantCompletion = await createChatCompletion(systemPrompt, messageHistory, userPrompt);
                const completion = createAssistantCompletion(assistantCompletion);
                
                // Ignored
                if (completion.ignored) {
                    // TODO: handle ignore
                    channel.currentlyResponding--;
                    return console.log("ignored");
                }
                
                // Delays
                const { readDelay, typeDelay } = calculateMessageDelay(prompt, completion, Date.now() - date.getTime()); // Calculate read delay
                if (readDelay) await delay(readDelay);
                if (typeDelay) await startTyping(channelId, typeDelay);
                
                const messageParams = { };
                if (config.replyToUser || (config.replyIfActive && channel.lastMessage !== date.getTime())) {
                    messageParams.reply = {
                        messageId,
                        mention: config.replyMention
                    }
                }

                await sendMessage(message.channel_id, completion.message, messageParams);

                addMessageHistory();
                addMemory();

                channel.currentlyResponding--;
                channel.lastResponse = Date.now();

                async function getChannelInfo() {
                    if (!channels.find(i => i.id === channelId)) {
                        const {
                            name,
                            topic,
                            nsfw,
                            rate_limit_per_user: rateLimit
                        } = await getChannel(channelId).catch(err => {
                            // TODO: log error, continue though
                        });
                        channels.push({
                            id: channelId,
                            name,
                            topic,
                            nsfw,
                            rateLimit,
                            lastResponse: undefined,
                            lastMessage: undefined,
                            currentlyResponding: 0,
                            resetTimeouts: () => {
                                clearTimeout(channel.timeouts.clearMemories);
                                clearTimeout(channel.timeouts.truncateMemories);
                                clearTimeout(channel.timeouts.clearMessageHistory);
                                clearTimeout(channel.timeouts.truncateMessageHistory);

                                channel.timeouts.clearMemories = setTimeout(() => channel.memories = [], config.memoriesClearTimeout);
                                channel.timeouts.truncateMemories = setTimeout(() => memories.splice(memories.length - config.memories), config.memoriesTruncateTimeout);
                                channel.timeouts.clearMessageHistory = setTimeout(() => channel.messageHistory = [], config.messageHistoryClearTimeout);
                                channel.timeouts.truncateMessageHistory = setTimeout(() => messageHistory.splice(messageHistory.length - config.messageHistory), config.messageHistoryTruncateTimeout);
                            },
                            timeouts: {
                                clearMemories: undefined,
                                truncateMemories: undefined,
                                clearMessageHistory: undefined,
                                truncateMessageHistory: undefined
                            },
                            memories: fs.existsSync(path.resolve(config.memoryPath, `${guildId}.json`)) ? JSON.parse(fs.readFileSync(path.resolve(config.memoryPath, `${guildId}.json`), "utf-8")) : [],
                            messageHistory: []
                        });
                    }
                    return channels[channels.findIndex(i => i.id === channelId)];
                }

                function delay(ms: number) {
                    return new Promise((resolve) => setTimeout(resolve, ms));
                }

                function addMessageHistory() {
                    if (config.messageHistory) {
                        // logger.log(`Adding message history: ${message.content}`);
                        messageHistory.push({
                            // User prompt
                            role: "user",
                            content: userPrompt,
                            prompt
                        }, {
                            // Completion
                            role: "assistant",
                            content: completion.content,
                            prompt
                        });
                    }
                }

                function addMemory() {
                    if (config.memories && completion.memory && completion.memoryImportance) {
                        // logger.log(`Adding memory: ${completion.memory} - ${completion.memoryImportance}`);
                        const foundMemory = memories.find(i => i.description === completion.memory)
                        if (foundMemory) {
                            // Memory already exists, this shouldn't really happen but AI's never listen
                            foundMemory.importance = completion.memoryImportance;
                        } else {
                            // Memory does not already exist
                            memories.push({
                                date: date.toString(),
                                channelId,
                                description: completion.memory,
                                importance: completion.memoryImportance
                            });
                        }
                        if (config.storeMemories) fs.writeFileSync(path.resolve(config.memoryPath, `${guildId}.json`), JSON.stringify(memories));
                    }
                }
            });

            gateway.on("error", (err) => {
                // Gateway error, can happen before or after READY event called
                if (gateway.ready) {
                    // After READY
                    logger.log(`Error on gateway: ${err}`);
                    if (config.gatewayReconnectTimeout) {
                        logger.log(`Reconnecting to gateway in ${Math.floor(config.gatewayReconnectTimeout / 1000)}s...`);
                        setTimeout(connectGateway, config.gatewayReconnectTimeout); // TODO: alternative
                    }
                } else {
                    // Before READY
                    logger.log(`Error connecting to gateway: ${err}`);
                    reject(err);
                }
            });
        });
    }
})();