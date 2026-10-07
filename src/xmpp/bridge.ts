import { xmppOpen, xmppMessage, xmppClose, xmppStreamOpened, type XmppSocket } from "./server";

const adapters = new Map<string, XmppSocket>();

function takeAdapter(id: string): XmppSocket | undefined {
  return adapters.get(id);
}

export function bridgePeerOpened(id: string, send: (text: string) => void) {
  if (adapters.has(id)) return;
  const out = (obj: unknown) => {
    try { send(JSON.stringify(obj)); } catch {}
  };
  const adapter = {
    send: (text: string) => out({ t: "send", id, text }),
    close: () => {
      out({ t: "close", id });
      adapters.delete(id);
    },
    data: { connectionId: `tcp-${id}` },
    readyState: 1,
  } as unknown as XmppSocket;
  adapters.set(id, adapter);
  xmppOpen(adapter);
}

export function bridgePeerMessage(id: string, kind: string, text: string) {
  const adapter = takeAdapter(id);
  if (!adapter) return;
  if (kind === "stream") xmppStreamOpened(adapter);
  else if (kind === "data") xmppMessage(adapter, text as never);
  else if (kind === "close") {
    try { xmppClose(adapter); } catch {}
    adapters.delete(id);
  }
}

export function bridgePeerGone() {
  for (const [, adapter] of adapters) {
    try { xmppClose(adapter); } catch {}
  }
  adapters.clear();
}
