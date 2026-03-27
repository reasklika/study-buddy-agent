import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { TavilySearch } from "@langchain/tavily";
import { type TextUIPart, type UIMessage, createTextStreamResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { NextResponse } from "next/server";

const SUMMARY_PROMPT = PromptTemplate.fromTemplate(
  "Search results for {topic}: {results}. Summarize each into 3 sentences.",
);

const QUIZ_PROMPT = PromptTemplate.fromTemplate(
  "Based on these summaries: {summaries}, generate",
);
const getMessageText = (message: UIMessage) =>
  message.parts
    .filter((p): p is TextUIPart => p.type === "text")
    .map((p) => p.text)
    .join("");

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") {
    return { content: message.content, role: "user" };
  } else if (message._getType() === "ai") {
    const aiMessage = message as AIMessage;
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      return {
        role: "system",
        content: JSON.stringify({
          action: {
            name: aiMessage.tool_calls[0].name,
            args: aiMessage.tool_calls[0].args,
          },
          // We leave observation empty here; the next 'tool' message will fill it
          observation: "Searching for resources...",
        }),
      };
    }
    return { content: message.content, role: "assistant" };
  } else if (message._getType() === "tool") {
    // This represents the ACTUAL results from Tavily
    return {
      role: "system",
      content: JSON.stringify({
        action: { name: "TavilySearch", args: {} },
        observation: message.content, // The search results
      }),
    };
  } else return { content: message.content, role: message._getType() };
};

const convertVercelMessageToLangChainMessage = (message: UIMessage) => {
  if (message.role === "user") {
    return new HumanMessage(getMessageText(message));
  } else if (message.role === "assistant") {
    return new AIMessage(getMessageText(message));
  } else {
    return new ChatMessage(getMessageText(message), message.role);
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    /**
     * We represent intermediate steps as system messages for display purposes,
     * but don't want them in the chat history.
     */
    const messages = (body.messages ?? [])
      .filter(
        (message: UIMessage) =>
          message.role === "user" || message.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);
    const topic = messages[messages.length - 1].content;

    const chat = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    });

    // Initialize with 3 results
    const tools = [
      new TavilySearch({
        maxResults: 3,
      }),
    ];

    /**
     * Use a prebuilt LangGraph agent.
     */
    const agent = createReactAgent({
      llm: chat,
      tools,
      /**
       * Modify the stock prompt in the prebuilt agent. See docs
       * for how to customize your agent:
       *
       * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
       */
      messageModifier: `You are a professional Study Buddy AI. 
      When a user provides a topic, you MUST:
      1. Use the search tool to find 3 recent, high-quality resources on the topic.
      2. For each resource, provide the Title, the URL, and a concise 2-3 sentence summary.
      3. After the summaries, generate a 'Quiz Time!' section with 5 multiple-choice questions.
      4. Include an 'Answer Key' at the very bottom hidden in a way the user has to scroll or look for it.
      
      Maintain a supportive, educational, and slightly witty tone.`,
    });

    if (!returnIntermediateSteps) {
      /**
       * Stream back all generated tokens and steps from their runs.
       *
       * We do some filtering of the generated events and only stream back
       * the final response as a string.
       *
       * For this specific type of tool calling ReAct agents with OpenAI, we can tell when
       * the agent is ready to stream back final output when it no longer calls
       * a tool and instead streams back content.
       *
       * See: https://langchain-ai.github.io/langgraphjs/how-tos/stream-tokens/
       */
      const eventStream = await agent.streamEvents(
        { messages },
        { version: "v2" },
      );

      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (event === "on_chat_model_stream") {
              // Intermediate chat model generations will contain tool calls and no content
              if (!!data.chunk.content) {
                controller.enqueue(textEncoder.encode(data.chunk.content));
              }
            }
          }
          controller.close();
        },
      });

      return createTextStreamResponse({ textStream: transformStream });
    } else {
      /**
       * We could also pick intermediate steps out from `streamEvents` chunks, but
       * they are generated as JSON objects, so streaming and displaying them with
       * the AI SDK is more complicated.
       */
      const result = await agent.invoke({ messages });

      return NextResponse.json(
        {
          messages: result.messages.map(convertLangChainMessageToVercelMessage),
        },
        { status: 200 },
      );
    }
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.status ?? 500,
    });
  }
}
