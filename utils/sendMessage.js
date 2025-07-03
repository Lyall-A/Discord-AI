const discordApi = require("./discordApi");

function sendMessage(channelId, message, params = { }) {
    const formData = new FormData();
    formData.set("payload_json", JSON.stringify({
        content: message
    }));

    return discordApi(`/channels/${channelId}/messages`, {
        method: "POST",
        body: formData
    }).then(res => {
        if (res.status !== 200) throw new Error(`Got status code ${res.status}`);
        return res.json;
    });
}

module.exports = sendMessage;