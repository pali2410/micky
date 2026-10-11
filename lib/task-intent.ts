// Keep task routing driven by the same small, testable command grammar.
export function normalizeRequest(text: string): string {
  const quoted: string[] = [];
  const protectedText = text.replace(/"[^"\n]*"|“[^”\n]*”/g, value => `\uE000${quoted.push(value)-1}\uE001`);
  return protectedText.trim().replace(/\bopne\b/gi, "open").replace(/\b(?:serch|serchn|andserch)\b/gi, "search")
    .replace(/\b(?:exploere|explore)\b/gi, "explorer").replace(/\b(?:totoal|toto|toto\s+al)\b/gi, "total").replace(/\bhow manay\b/gi, "how many").replace(/\bcaht\b/gi, "chat")
    .replace(/\b(?:iages|imahe|imahes)\b/gi, "images").replace(/\bsysytem\b/gi, "system").replace(/\banzle\b/gi, "analyze")
    .replace(/\b(?:wahtapp|whatapp|waht\s+app|what\s+app)\b/gi, "whatsapp")
    .replace(/\bsedn\b/gi, "send").replace(/\b(?:messgae|messsage|messge)\b/gi, "message").replace(/\b(?:delet|delelte)\b/gi, "delete").replace(/\bfomr\b/gi, "from").replace(/\btaht\b/gi, "that").replace(/\b(?:cahht|cahtt)\b/gi, "chat").replace(/\bmy on chat\b/gi, "my own chat")
    .replace(/\b(?:aanzle|ananlse)\b/gi, "analyze").replace(/\bscreen\s*hso?t\b/gi, "screenshot")
    .replace(/^(?:(?:ok|okay|then|and|please|hey micky|micky)[,.]?\s+)+/i, "")
    .replace(/^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need)\s+you\s+to\s+)/i, "")
    .replace(/\uE000(\d+)\uE001/g, (_, index) => quoted[Number(index)]);
}
export function isComputerRequest(text: string): boolean {
  const request = normalizeRequest(text);
  if (/\b(?:how many|count|total)\b/i.test(request) && /\b(?:screenshots?|images?|photos?|files?)\b/i.test(request)) return true;
  if (/\b(?:youtube|whatsapp|chrome|file explorer)\b/i.test(request) && /\b(?:search|play|send|read|reply|open)\b/i.test(request) && !/^(?:what is|how (?:can|do) i)\b/i.test(request)) return true;
  return /^(?:open|launch|run|start|search|look up|click|type|inspect|analyze|analyse|check|scan|find|create|make|write|download|play|send|browse|count|compare|go to|list|save|read|research|extract|delete|remove|recycle)\b/i.test(request)
    && !/^(?:find (?:you|me) (?:here|there)|make (?:me laugh|a joke)|tell|start (?:over|talking))\b/i.test(request);
}

export type WhatsAppCommand = { recipient?: string; text?: string; send: boolean; read: boolean; question?: string };
export function parseWhatsAppCommand(text: string): WhatsAppCommand | undefined {
  const request = normalizeRequest(text);
  if (!/\bwhatsapp\b/i.test(request)) return;
  const sendPart = /\b(send|type|write|reply)\b([\s\S]*)$/i.exec(request);
  const selection = sendPart ? request.slice(0, sendPart.index) : request;
  let recipient: string | undefined;
  if (/\b(?:my own|myself|self|own chat)\b/i.test(request)) recipient = "self";
  else {
    const target = /\bsearch\b\s+([\s\S]+)$/i.exec(selection)?.[1] ?? /\bcontact(?:\s+name)?\s*(?:is\s*)?[=:]\s*([\s\S]+)$/i.exec(selection)?.[1];
    recipient = target?.replace(/^(?:(?:for|from|a|the|person|contact|name|named|these|this|is)\s+|[=:]\s*)+/i, "")
      .replace(/\s+(?:and|then|in there)\b[\s\S]*$/i, "").replace(/^["'“]|["'”][?.!]?$/g, "").trim();
    if (!recipient && sendPart) recipient = /^(?:\s*(?:a|the))?\s*(?:message\s+)?to\s+(.+?)(?=\s+(?:saying|with text|message|that says)\b|$)/i.exec(sendPart[2])?.[1]?.trim();
    if (recipient) recipient = recipient.replace(/\btwo\b$/i, "2");
  }
  const send = !!sendPart && /^(?:send|reply)$/i.test(sendPart[1]) && !/\b(?:do not|don't|without)\s+send\b/i.test(request);
  let body = sendPart?.[2]?.trim().replace(/^(?:(?:a|the|new)\s+)?message\s*/i, "");
  if (body && recipient) {
    if (/^to\s+/i.test(body)) {
      const destination = recipient === "self" ? "(?:my\\s+(?:own\\s+)?chat|myself|me)" : recipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/2$/, "(?:2|two)");
      body = body.replace(new RegExp(`^to\\s+(?:${destination}|that\\s+person)\\s*`, "i"), "");
      if (/^to\s+/i.test(body)) body = undefined;
    }
    body = body?.replace(/^(?:saying|that says|with text)\s+/i, "").replace(/^["“]|["”][.!?]?$/g, "").trim();
  }
  if (!recipient && /\b(?:search|send|type|write|reply|read)\b/i.test(request)) return { send, read: !sendPart, question: "Which WhatsApp contact should I use?" };
  if (recipient && (!recipient.trim() || recipient.length > 100 || /\b(?:phonebook|contacts list|please|send|message|number from|and|testing)\b/i.test(recipient))) return { send, read: !sendPart, question: "What is the contact's exact name or phone number?" };
  if (sendPart && !body) return { recipient, send, read: false, question: "What message should I send?" };
  return { recipient, text: body, send, read: !sendPart };
}
export function clarificationFor(text: string): string | undefined {
  const request = normalizeRequest(text);
  if (/\b(?:difference|compare)\b/i.test(request) && /\b(?:image|picture|photo)\b/i.test(request)
      && !/(?:[A-Z]:\\|https?:\/\/)/i.test(request)) {
    return "Which two images should I compare? Tell me their file names or locations.";
  }
}
export function splitRequests(text: string): string[] {
  const normalized = normalizeRequest(text);
  const parts = normalized.split(/\s+(?:and|then|also)[,.]?\s+(?:in (?:an?|another) tab[, ]+)?(?=(?:open|create|make|search|play|read|research)\b)/i);
  const targets = parts.map(p => /\b(youtube|whatsapp|excel|spreadsheet|file explorer|file manager|calculator)\b/i.exec(p)?.[1]?.toLowerCase());
  if (parts.length < 2 || targets.some(t => !t) || new Set(targets).size !== parts.length) return [text];
  return parts;
}
