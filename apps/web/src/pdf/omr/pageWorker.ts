import { answerPageRequest, createPageSession, type PageRequest } from "./pageSession";

const session = createPageSession();

self.addEventListener("message", (event: MessageEvent<PageRequest>) => {
  const { reply, transfer } = answerPageRequest(session, event.data);
  self.postMessage(reply, { transfer });
});
