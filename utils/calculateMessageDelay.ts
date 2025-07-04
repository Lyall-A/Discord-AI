import { Prompt, Completion } from "../types";

import { readSpeed, typeSpeed } from "../config.json";

export function calculateMessageDelay(prompt: Prompt, completion: Completion, offset: number = 0) {

    const promptMessage = prompt.message.match(/[a-zA-Z0-9]+/g)?.join("") || "";
    const completionMessage = completion.message?.match(/[a-zA-Z0-9]+/g)?.join("") || "";
    
    return {
        readDelay: Math.max(0, (readSpeed ? (promptMessage.length / readSpeed || 0) * 1000 : 0) - offset),
        typeDelay: Math.max(0, (typeSpeed ? (completionMessage.length / typeSpeed) * 1000 : 0) - offset),
    }
}