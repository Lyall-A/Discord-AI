# omg virtual human

system prompt is made for [Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2-GGUF](https://huggingface.co/Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2-GGUF), it may need tweaked for different models (gpt is fucking awful for this)

![image](https://github.com/user-attachments/assets/68a92220-32d5-48b2-a88f-a992bd5b5ea6)

![image](https://github.com/user-attachments/assets/be1e4e48-fa39-441a-b437-f4ae3cb046cc)

## info
on message, will add delay to simulate reading the message, to think, and to type in the response
if there is messages being sent at the same time in the channel, it will reply to messages to avoid confusion

## just notes cus ill forget:
with readDelayPerCharacter, will multiply this value by the length of the message received, and will be used as delay
with thinkDelayMin and thinkDelayMax, will generate random num between both values, and will be used as delay
with respondDelayPerCharacter, will multiply this value by the length of the response message, and will be used as delay
with cancelMultipleMessages, will return if bot is already responding to another message
with replyIfMultipleMessages, will reply to message if multiple messages has been sent since request