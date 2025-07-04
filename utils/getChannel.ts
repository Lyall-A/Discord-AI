import discordApi from "./discordApi";

export function getChannel(channelId) {
    return discordApi(`/channels/${channelId}`).then(res => {
        if (res.status !== 200) throw new Error(`Got status code ${res.status}`);
        return res.json;
    });
}