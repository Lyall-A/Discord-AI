const discordApi = require("./discordApi");

function getDiscordUser(userId = "@me") {
    return discordApi(`/users/${userId}`).then(res => {
        if (res.status !== 200) throw new Error(`Got status code ${res.status}`);
        return res.json;
    });
}

module.exports = getDiscordUser;