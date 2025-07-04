export type Prompt = {
    channel: Channel;
    date: string;
    id: string;
    messageId: string;
    guildId?: string;
    // attachments: null; // TODO
    mentionEveryone: boolean;
    tts: boolean;
    type: number;
    typeString?: string;
    username: string;
    name: string; // Is this optional? unsure
    nickname?: string;
    clanTag?: string;
    joinDate?: string;
    message: string;
}

export type Completion = {
    content: string;
    message?: string;
    memory?: string;
    memoryImportance?: number;
    ignored: boolean;
    ignoreReason?: string;
}

export type Memory = {
    date: string;
    channelId: string;
    description: string;
    importance: number;
}

export type Message = {
    role: string;
    content: string;
    prompt: Prompt;
}

export type Channel = {
    id: number;
    name?: string,
    topic?: string,
    nsfw?: boolean,
    rateLimit?: number,
    lastResponse?: number;
    lastMessage?: number;
    currentlyResponding: number;
    resetTimeouts: Function;
    timeouts: {
        clearMemories?: NodeJS.Timeout;
        truncateMemories?: NodeJS.Timeout;
        clearMessageHistory?: NodeJS.Timeout;
        truncateMessageHistory?: NodeJS.Timeout;
    };
    memories: Memory[];
    messageHistory: Message[];
}