// custom function to parse ai responses
// for example, if your system prompt is setup in a way so the ai responds in a certain format, you can parse it here
module.exports = (message) => {
    // console.log(message);
    return {
        ignored: message.match(/^ignored/i),
        ignoredReason: message.match(/^ignored:\s*(.*)/i)?.[1],
        message: message.match(/^me:\s*(.+)/is)?.[1]
        // message: message.match(/^me:\s*(.+)/is)?.[1] || message
    };
}