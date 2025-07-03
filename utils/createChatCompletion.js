const openAiApi = require("./openAiApi");

const config = require("../config.json");

function createChatCompletion(systemPrompt, messages, userPrompt) {
    return openAiApi("/chat/completions", {
        method: "POST",
        json: {
            model: config.openAi.model,
            messages: [
                // System prompt
                ...(systemPrompt ? [{
                    role: config.openAi.systemRole || "system", // "developer" is used in later OpenAI models
                    content: systemPrompt
                }] : []),
                // Message history
                ...(messages?.map(({ role, content }) => ({ role, content })) || []),
                // User prompt
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        }
    }).then(res => {
        if (res.status !== 200) throw new Error(`Got status code ${res.status}`);
        return {
            model: res.json.model,
            message: res.json.choices[0].message,
            usage: {
                promptTokens: res.json.usage.prompt_tokens,
                completionTokens: res.json.usage.completion_tokens,
                totalTokens: res.json.usage.total_tokens,
            }
        };
    });
}

module.exports = createChatCompletion;