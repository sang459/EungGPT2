import { fetchEventSource } from "@fortaine/fetch-event-source";
import { useState, useMemo } from "react";
import { appConfig } from "../../config.browser";

const API_PATH = "/api/chat";
const RAG_PATH = "/api/rag"; // 쩔수없다. api 하나 파야한다. 즉 edge function을 디자인해야한다.
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A custom hook to handle the chat state and logic
 */
export function useChat() {
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "waiting" | "loading">("idle");
  // idle은 기본값.
  // waiting은 sendMessage가 호출된 경우. 이 상태에서 RAG하면 됨. 새로 state 만들 필요 X.
    // loading은 sendMessage가 호출되었고, 답변을 생성중(streaming)인 경우.

  // Lets us cancel the stream
  const abortController = useMemo(() => new AbortController(), []);

  /**
   * Cancels the current chat and adds the current chat to the history
   */
  function cancel() {
    setState("idle");
    abortController.abort();
    if (currentChat) {
      const newHistory = [
        ...chatHistory,
        { role: "user", content: currentChat } as const,
      ];

      setChatHistory(newHistory);
      setCurrentChat("");
    }
  }

  /**
   * Clears the chat history
   */

  function clear() {
    console.log("clear");
    setChatHistory([]); 
  }

  /**
   * Sends a new message to the AI function and streams the response
   */
  const sendMessage = (message: string, chatHistory: Array<ChatMessage>) => {
    setState("searching");
    let chatContent = "";
    // chatHistory는 비어있음

    // 여기 어딘가에서 retrieve해야함
    // 나는 여기서 retrieval을 할거다.

    // 사용자가 보낸 메시지: message
    // message를 받아서, /api/rag에 보내고 응답 기다리기.

    let doc = "";
    let newHistory=[];

    // src/hooks/use-chat.ts 파일 내부

    // fetch를 사용하여 POST 요청을 보내고 응답을 처리
    fetch(RAG_PATH, {
      method: "POST",
      headers: {
        'Content-Type': 'text/plain',
      },
      body: message,
      signal: abortController.signal
    })
    .then(response => response.text())
    .then(text => {
      // 벡터 서치 결과(doc) 반환됨
      doc = text;
      newHistory = [
        ...chatHistory,
        { role: "user", content: doc+message } as const, // doc + user message
      ];
      setChatHistory(newHistory);
    })
    .catch(error => {
      if (error.name !== 'AbortError') {
        // 오류 처리 로직
        console.error('Fetch error:', error);
      }
    });

    


    const body = JSON.stringify({
      // Only send the most recent messages. This is also
      // done in the serverless function, but we do it here
      // to avoid sending too much data
      messages: newHistory.slice(-appConfig.historyLength),
    });

    // 여기가 /api/chat으로 내부 POST요창 보내는 부분
    // This is like an EventSource, but allows things like
    // POST requests and headers
    fetchEventSource(API_PATH, {
      body,
      method: "POST",
      signal: abortController.signal,
      onclose: () => {
        setState("idle");
      },
      onmessage: (event) => {
        switch (event.event) {
          case "delta": {
            // This is a new word or chunk from the AI
            setState("loading");
            const message = JSON.parse(event.data);
            if (message?.role === "assistant") {
              chatContent = "";
              return;
            }
            if (message.content) {
              chatContent += message.content;
              setCurrentChat(chatContent);
            }
            break;
          }
          case "open": {
            // The stream has opened and we should recieve
            // a delta event soon. This is normally almost instant.
            // 여기서 doc 삭제...? 아닐수도!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // 마지막 요소를 제외한 새로운 배열을 생성
            const newChatHistory = chatHistory.slice(0, -1);

            // 새로운 객체를 마지막 요소로 추가
            newChatHistory.push({ role: "user", content: message });

            // 상태를 업데이트
            setChatHistory(newChatHistory);
            break;
          }
          case "done": {
            // When it's done, we add the message to the history
            // and reset the current chat

            // 여기서 curr의 가장 마지막 message의 context를 삭제하고 curr에 재할당
            setChatHistory((curr) => [
              ...curr, // 현재 채팅 기록을 나타내는 배열(array)
              { role: "assistant", content: chatContent } as const,
            ]);
            setCurrentChat(null);
            setState("idle");
          }
          default:
            break;
        }
      },
    });
  };

  return { sendMessage, currentChat, chatHistory, cancel, clear, state };
}
