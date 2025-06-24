const config = require("../config.json");
const secrets = require("../secrets.json");

function discordAPI(path, options = { }) {
    return fetch(`${config.discord.apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
            "Authorization": `${config.selfBot ? "" : "Bot "}${secrets.discordToken}`,
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

module.exports = discordAPI;