import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";

export default function StudyBuddyPage() {
  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          🤝
          <span className="ml-2">
            This template showcases a{" "}
            <a href="https://js.langchain.com/" target="_blank">
              LangChain.js
            </a>{" "}
            agent and the Vercel{" "}
            <a href="https://sdk.vercel.ai/docs" target="_blank">
              AI SDK
            </a>{" "}
            in a{" "}
            <a href="https://nextjs.org/" target="_blank">
              Next.js
            </a>{" "}
            project.
          </span>
        </li>
        <li className="text-l">
          👇
          <span className="ml-2">
            Try asking about a topic you want to learn about.
          </span>
        </li>
        <li className="text-l">
          🤓
          <span className="ml-2">
            I will find recent and high quality resources and summarize them.
          </span>
        </li>
        <li className="text-l">
          ❓
          <span className="ml-2">
            Quiz questions will also be generated.
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <ChatWindow
      endpoint="api/chat/study_buddy"
      emptyStateComponent={InfoCard}
      placeholder="I will be your Study Buddy. Ask me anything!"
      emoji="🦜"
      showIntermediateStepsToggle={true}
    />
  );
}
