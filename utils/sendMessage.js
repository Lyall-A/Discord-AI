const discordApi = require("./discordApi");

function sendMessage(channelId, content, params = { }) {
    const formData = new FormData();

    const message = { content };
    if (params.reply) {
        message.message_reference = {
            type: 0,
            message_id: params.reply.messageId,
        }
        message.allowed_mentions = {
            replied_user: params.reply.mention ? true : false
        }
    }

    formData.set("payload_json", JSON.stringify(message));

    return discordApi(`/channels/${channelId}/messages`, {
        method: "POST",
        body: formData
    }).then(res => {
        if (res.status !== 200) throw new Error(`Got status code ${res.status}`);
        return res.json;
    });
}

module.exports = sendMessage;