const getDiscordUser = require("./utils/getDiscordUser");
const DiscordGateway = require("./utils/DiscordGateway");
const logger = require("./utils/logger");

const config = require("./config.json");

(async () => {
    // Verify token
    logger.log("Verifying token...");
    let user;
    try {
        user = await getDiscordUser();
    } catch (err) {
        return logger.log("Failed to verify token, is it correct?");
    }
    logger.followUp("Yup!");

    // Connect to gateway
    await connectGateway();

    function connectGateway() {
        return new Promise((resolve, reject) => {
            logger.log("Connecting to gateway...");
            const gateway = new DiscordGateway();
            gateway.on("ready", ready => {
                logger.followUp("Mhm");
                logger.log(`${ready.user.username} is ready, are your doors locked? :3`);
                resolve(ready);
            });
            gateway.on("error", err => {
                if (gateway.ready) {
                    logger.log(`Error on gateway: ${err}`);
                    if (config.gatewayReconnectTimeout) {
                        logger.log(`Reconnecting to gateway in ${Math.floor(config.gatewayReconnectTimeout / 1000)}s...`);
                        setTimeout(connectGateway, config.gatewayReconnectTimeout); // TODO: alternative
                    }
                } else {
                    logger.log(`Error connecting to gateway: ${err}`);
                    reject(err);
                }
            });
        });
    }
})();