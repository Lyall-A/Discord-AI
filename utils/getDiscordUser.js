const discordAPI = require("./discordAPI");

function getDiscordUser(userId = "@me") {
    return discordAPI(`/users/${userId}`).then(res => res.json);
}

module.exports = getDiscordUser;