# omg virtual human

system prompt is made for [Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2-GGUF](https://huggingface.co/Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2-GGUF), it may need tweaked for different models

## Features
* literally talks to u (with elevenlabs api)
* can start conversations for u
* wont interrupt ur conversations, hopefully
* simulates how long it takes to read the message, think of a response, and typing out the response
* shows a typing indicator
* can respond to servers, group chats and dms
* everything is configurable
* seperate code into attachments

## TODO's
* show typing indicator if response is being generated for a bit too long (like 4 secs)
* get ai to respond with any important info about whats going on in the conversation then store it in an array so its remembered even after history is truncated
* implement image generation from dalle (probably wont happen tho, im not buying openai credits)
