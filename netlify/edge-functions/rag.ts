import type { Config, Context } from "https://edge.netlify.com/";
import { getChatStream, sanitizeMessages } from "../../lib/edge/openai.ts";

import { appConfig } from "../../config.edge.ts";

import { Pinecone } from "@pinecone-database/pinecone";
import { VectorDBQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { OpenAI } from "langchain/llms/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";

if (!appConfig.OPENAI_API_KEY || !appConfig.PINECONE_API_KEY || !appConfig.PINECONE_ENVIRONMENT || !appConfig.PINECONE_INDEX) {
  throw new Error(
    "OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_ENVIRONMENT, and PINECONE_INDEX must be set in config.edge.ts"
  );
}
/*
    
*/

// Pincone, vectorstore 세팅
// 여러번 하지 않게 하는 로직 추가해야함
const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(appConfig.PINECONE_INDEX);
const vectorStore = await PineconeStore.fromExistingIndex(
  new OpenAIEmbeddings(),
  { pineconeIndex }
);

export default async function handler(
  request: Request,
  context: Context
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const requestBody = await request.text();

    // 벡터 서치 로직을 여기에 구현합니다.
    // 예를 들어, requestBody를 사용하여 벡터 서치를 수행하고 결과를 얻습니다.
    const searchResult = await performVectorSearch(requestBody);

    // 결과를 JSON 형태로 클라이언트에게 반환합니다.
    return new Response(searchResult, {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(e.message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

export const config: Config = {
  path: "/api/rag",
};

async function performVectorSearch(data: any) {
    const results = await vectorStore.maxMarginalRelevance(data, {
      k: 1,
      fetchK: 10, // Default value for the number of initial documents to fetch for reranking.
      // You can pass a filter as well
      // filter: {},
    });

    if (results && results.length > 0) {
      console.log(results);
      return results[0].page_content; // 이거 맞나...
    } else {
      return "";
    }
  }
