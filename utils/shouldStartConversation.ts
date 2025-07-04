export function shouldStartConversation(chance) {
    return Math.floor(Math.random() * (100 + 1)) <= chance;
}