import discordApi from "./discordApi";

export const typingExpiry: number = 10 * 1000;
export const interval: number = typingExpiry - 1.5 * 1000;

export function startTyping(channelId: string, duration?: number) {
    return new Promise((resolve, reject) => {
        const startDate = Date.now();
        
        (function triggerTypingIndicator() {
            discordApi(`/channels/${channelId}/typing`, {
                method: "POST"
            }).then(res => {
                if (res.status !== 204) return reject();

                const triggerDate = Date.now();
                const typingDuration = triggerDate - startDate;

                if (duration && typingDuration + typingExpiry < duration) {
                    setTimeout(triggerTypingIndicator, interval);
                } else {
                    if (!duration) return resolve(duration);
                    setTimeout(() => resolve(duration), duration - typingDuration);
                }
            });
        })();
    });
}