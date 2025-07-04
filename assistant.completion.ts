import { Completion } from "./types"

export function createAssistantCompletion(completion: any): Completion {
    const content = completion.message.content;
    const jsonString = content.match(/{.*}/s);
    const json = JSON.parse(jsonString);
    return {
        content,
        message: json.message,
        memory: json.memory,
        memoryImportance: json.memoryImportance,
        ignored: json.ignored,
        ignoreReason: json.ignoreReason
    }
}