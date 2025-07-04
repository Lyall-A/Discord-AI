const fs = require("fs");
const path = require("path");

// const match = require("../match.json");
const config = require("../config.json");

const matchPath = path.resolve(config.matchPath);
let match = JSON.parse(fs.readFileSync(matchPath));
fs.watch(matchPath, (event) => {
    if (event === "change") match = JSON.parse(fs.readFileSync(matchPath));
});

function isMatch(message) {
    const channelType =
        message.type === 0 ? "guild" :
        message.type === 1 ? "dm" :
        message.type === 3 ? "group" :
        undefined; // TODO: more

    if (match?.exclude?.guilds?.includes(message.guild_id)) return false; // Guild is excluded
    if (match?.exclude?.channels?.includes(message.channel_id)) return false; // Channel is excluded
    if (match?.exclude?.users?.includes(message.author.id)) return false; // User is excluded
    if (match?.exclude?.channelTypes?.includes(channelType)) return false; // Channel type is excluded

    if (match?.include?.guilds?.length && !match.include.guilds.includes(message.guild_id)) return false; // Guild isn't included
    if (match?.include?.channels?.length && !match.include.channels.includes(message.channel_id)) return false; // Channel isn't included
    if (match?.include?.users?.length && !match.include.users.includes(message.author.id)) return false; // User isn't included
    if (match?.include?.channelTypes?.length && match?.include?.channelTypes.includes(channelType)) return false; // Channel type isn't included

    if (!match?.bots && message.author.bot) return false; // Is bot

    return true;
}

module.exports = isMatch;