import path from "path";
import fs from "fs";

// Utils
import getDiscordUser from "./utils/getDiscordUser";
import DiscordGateway from "./utils/DiscordGateway";
import createChatCompletion from "./utils/createChatCompletion";
import logger from "./utils/logger";
import isMatch from "./utils/isMatch";
import sendMessage from "./utils/sendMessage";

import {
    Prompt,
    GuildMemories,
    MessageHistory
} from "./types";

// Config
import config from "./config.json";

// Prompts and completions
import { createSystemPrompt } from "./messages/system.prompt";
import { createUserPrompt } from "./messages/user.prompt";
import { createAssistantCompletion } from "./messages/assistant.completion";

(async function main() {
    const allGuildMemories: GuildMemories[] = [];
    const allMessageHistory: MessageHistory[] = [];

    // Verify token
    logger.log("Verifying token...");
    let user: any;
    try {
        user = await getDiscordUser();
    } catch (err) {
        return logger.log("Failed to verify token, is it correct?");
    }
    logger.followUp("Yup!");

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
                // Message received
                const { data: message } = event;
                const {
                    channel_id: channelId,
                    guild_id: guildId,
                    id: messageId,
                } = message;

                if (message.author.id === user.id || !isMatch(message)) return; // We don't want to talk here
                
                const date = new Date().toString();
                
                // Get message history
                if (config.messageHistory && !allMessageHistory.find(i => i.channelId === message.channel_id)) {
                    allMessageHistory.push({
                        channelId,
                        restartTimeouts: () => {
                            if (!messageHistory) return;
                            messageHistory.truncateTimeout = setTimeout(() => messageHistory.messages.splice(messageHistory.messages.length - config.messageHistory), config.messageHistoryTruncateTimeout);
                            messageHistory.clearTimeout = setTimeout(() => allMessageHistory.splice(allMessageHistory.indexOf(messageHistory)), config.messageHistoryClearTimeout);
                        },
                        messages: []
                    });
                }
                const messageHistory = allMessageHistory.find(i => i.channelId === channelId);
                const messages = messageHistory?.messages || [];

                // Get memories
                if (config.memories && !allGuildMemories.find(i => i.guildId === guildId)) {
                    allGuildMemories.push({
                        guildId,
                        restartTimeouts: () => {
                            if (!guildMemories) return;
                            guildMemories.truncateTimeout = setTimeout(() => guildMemories.memories.splice(guildMemories.memories.length - config.memories), config.memoriesTruncateTimeout);
                            guildMemories.clearTimeout = setTimeout(() => allGuildMemories.splice(allGuildMemories.indexOf(guildMemories)), config.memoriesClearTimeout);
                        },
                        memories: fs.existsSync(path.resolve(config.memoryPath, `${guildId}.json`)) ?
                            JSON.parse(fs.readFileSync(path.resolve(config.memoryPath, `${guildId}.json`), "utf-8")) :
                            []
                        });
                }
                const guildMemories = allGuildMemories.find(i => i.guildId === guildId);
                const memories = guildMemories?.memories || [];
                
                if (messageHistory) messageHistory.restartTimeouts(); // Restart timeout for message truncation and clearing
                if (guildMemories) guildMemories.restartTimeouts(); // Restart timeout for memories truncation and clearing

                // Prompt
                const prompt: Prompt = {
                    date,
                    memories,
                    messageId: messageId,
                    channelId: channelId,
                    guildId: guildId,
                    mentionEveryone: message.mention_everyone,
                    tts: message.tts,
                    id: message.author.id,
                    username: message.author.username,
                    name: message.author.global_name,
                    nickname: message.member.nick,
                    clanTag: message.author.clan.tag,
                    joinDate: new Date(message.member.joined_at).toUTCString(),
                    message: message.content
                };

                // Create prompts
                const systemPrompt = createSystemPrompt(prompt);
                const userPrompt = createUserPrompt(prompt);

                // Create completion
                const assistantCompletion = await createChatCompletion(systemPrompt, messages, userPrompt);

                // Completion
                const completion = createAssistantCompletion(assistantCompletion);
                
                if (completion.ignored) return console.log(completion.ignoreReason);

                await sendMessage(message.channel_id, completion.message);

                // Add message history
                if (config.messageHistory && messageHistory) {
                    // logger.log(`Adding message history: ${message.content}`);
                    messages.push({
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

                // Add memory
                if (config.memories && guildMemories && completion.memory && completion.memoryImportance) {
                    // logger.log(`Adding memory: ${completion.memory} - ${completion.memoryImportance}`);
                    memories.push({
                        date,
                        channelId,
                        description: completion.memory,
                        importance: completion.memoryImportance
                    });
                    if (config.storeMemories) fs.writeFileSync(path.resolve(config.memoryPath, `${guildId}.json`), JSON.stringify(memories));
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