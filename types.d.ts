export type Prompt = {
    memories: Memory[];
    date: string;
    id: string;
    messageId: string;
    channelId: string;
    guildId?: string;
    // channelType: null; // TODO
    // attachments: null; // TODO
    mentionEveryone: boolean;
    tts: boolean;
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

export type GuildMemories = {
    guildId: string;
    restartTimeouts: Function;
    truncateTimeout?: NodeJS.Timeout;
    clearTimeout?: NodeJS.Timeout;
    memories: Memory[];
}

export type Message = {
    role: string;
    content: string;
    prompt: Prompt;
}

export type MessageHistory = {
    channelId: string;
    restartTimeouts: Function;
    truncateTimeout?: NodeJS.Timeout;
    clearTimeout?: NodeJS.Timeout;
    messages: Message[];
}