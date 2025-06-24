const { EventEmitter } = require("events");
const { WebSocket } = require("ws");

const config = require("../config.json");
const secrets = require("../secrets.json");

class DiscordGateway extends EventEmitter {
    constructor(options = { }) {
        super();

        this.webSocket = new WebSocket(config.discord.gatewayBaseUrl);

        this.webSocket.on("open", () => {

        });

        this.webSocket.on("message", msg => {
            let json;
            try { json = JSON.parse(msg); } catch (err) { return; };
            
            const event = {
                name: json.t,
                sequence: json.s,
                op: json.op,
                data: json.d
            };

            // console.log(event);

            if (event.op === 10) {
                // Hello
                
                // Create heartbeat interval
                this.heartbeatInterval = event.data.heartbeat_interval;
                if (Math.floor(Math.random() * (1 + 1))) this.sendHeartbeat().catch(err => { }); // 50% chance of sending heartbeat instantly
                const heartbeatTimeoutCallback = () => {
                    // Send heartbeat after timeout
                    this.sendHeartbeat().then(() => {
                        // Make new timeout
                        this.heartbeatTimeout = setTimeout(heartbeatTimeoutCallback, this.heartbeatInterval);
                    }).catch(err => {
                        // Didn't receive heartbeat ACK
                        this.error(err);
                    });
                }
                this.heartbeatTimeout = setTimeout(heartbeatTimeoutCallback, this.heartbeatInterval);

                // Identify
                this.identify().then(ready => {
                    // Ready!
                    this.ready = ready;
                    this.emit("ready", this.ready);
                }).catch(err => {
                    // Didn't receive READY event
                    this.error(err);
                });
            }

            this.emit(`op-${event.op}`, event);
            if (event.name) this.emit(`event-${event.name}`, event);
        });
    }

    webSocket = null;
    heartbeatInterval = null;
    heartbeatTimeout = null;
    heartbeatAckTimeout = 2000;
    ready = null;
    readyTimeout = 4000;

    close() {
        this.webSocket.close();
        if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    }

    error(msg) {
        this.close();
        this.emit("error", msg);
    }

    send(op, data = null) {
        // console.log(op, data);
        this.webSocket.send(JSON.stringify({
            op,
            d: data
        }));
    }

    sendHeartbeat() {
        return new Promise((resolve, reject) => {
            this.send(1); // Send heartbeat
            this.once("op-11", heartbeatAckListener); // Listen for heartbeat ACK

            const timeout = setTimeout(() => {
                this.removeListener("op-11", heartbeatAckListener);
                reject("Timed out waiting for Heartbeat ACK");
            }, this.heartbeatAckTimeout);

            function heartbeatAckListener() {
                clearTimeout(timeout);
                resolve();
            }
        });
    }

    identify() {
        return new Promise((resolve, reject) => {
            this.send(2, {
                token: secrets.discordToken,
                intents: config.discord.intents,
                properties: config.discord.properties,
                presence: {
                    activities: config.discord.activities,
                    status: config.discord.status
                }
            });
            this.once("event-READY", readyListener);

            const timeout = setTimeout(() => {
                this.removeListener("event-READY", readyListener);
                reject("Timed out waiting for READY event");
            }, this.readyTimeout);

            function readyListener(event) {
                clearTimeout(timeout);
                resolve(event.data);
            }
        });
    }
}

module.exports = DiscordGateway;