import { EventEmitter } from "events";

import config from "../config.json";
import secrets from "../secrets.json";

export class DiscordGateway extends EventEmitter {
    webSocket: WebSocket;
    heartbeatInterval: number;
    heartbeatTimeout: NodeJS.Timeout;
    heartbeatAckTimeout: number = 2000;
    ready: any;
    readyTimeout: number = 4000;

    constructor(options = { }) {
        super();

        this.webSocket = new WebSocket(config.discord.gatewayBaseUrl);

        this.webSocket.addEventListener("open", () => {

        });

        this.webSocket.addEventListener("message", msg => {
            let json: GatewayMessage;
            try { json = JSON.parse(msg.data); } catch (err) { return; };
            
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

    close() {
        this.webSocket.close();
        if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    }

    error(msg: string) {
        this.close();
        this.emit("error", msg);
    }

    send(op: number, data: any = null) {
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
                resolve(undefined);
            }
        });
    }

    identify() {
        return new Promise((resolve, reject) => {
            this.send(2, {
                token: secrets.discord.token,
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

export type GatewayMessage = {
    op: number;
    d?: any;
    s?: number;
    t?: string;
};