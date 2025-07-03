const config = require("../config.json");
const secrets = require("../secrets.json");

function openAiApi(path, options = { }) {
    return fetch(`${config.openAi.apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
            "Authorization": secrets.openAi?.apiKey ? `${secrets.openAi.apiKeyType || "Bearer" } ${secrets.openAi.apiKey}` : undefined,
            "Content-Type": (options.json ? "application/json" : options.contentType) ?? undefined
        },
        body: (options.json ? JSON.stringify(options.json) : options.body) ?? undefined
    }).then(async res => {
        const buffer = Buffer.from(await res.arrayBuffer());
        let json;
        try { json = JSON.parse(buffer) } catch (err) { };

        return {
            status: res.status,
            buffer,
            json
        }
    });
}

module.exports = openAiApi;