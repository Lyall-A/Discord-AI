let lastLog = "";

function log(msg) {
    process.stdout.write(`${msg}\n`);
    lastLog = msg;
}

function followUp(msg, seperator = " ") {
    process.stdout.moveCursor(lastLog.length, -1)
    log(seperator + msg);
}

module.exports = {
    log,
    followUp
};