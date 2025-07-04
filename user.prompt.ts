import { Prompt } from "./types";

export function createUserPrompt(prompt: Prompt): string {
    return `
${JSON.stringify({
    username: prompt.username,
    name: prompt.name,
    nickname: prompt.nickname,
    message: prompt.message
}, null, 4)}
`.trim();
}