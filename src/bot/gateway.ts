import { env, sleep } from "../util.ts";

/** Discord gateway opcodes used by a receive-only interaction bot. */
const OP = {
  dispatch: 0,
  heartbeat: 1,
  identify: 2,
  resume: 6,
  reconnect: 7,
  invalidSession: 9,
  hello: 10,
  heartbeatAck: 11,
} as const;

/** Codes that mean the configuration is wrong; reconnecting cannot help. */
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

interface Payload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export interface GatewayOptions {
  /** Gateway intents. Interaction bots need none, so this defaults to 0. */
  intents?: number;
  onDispatch(event: string, data: unknown): void | Promise<void>;
}

/**
 * Minimal Discord gateway client on Node's native WebSocket. It identifies,
 * heartbeats with jitter, resumes when it can, and reconnects with capped
 * exponential backoff. It deliberately requests no intents: slash-command
 * interactions are delivered regardless of intent configuration.
 */
export class Gateway {
  #socket?: WebSocket;
  #heartbeat?: NodeJS.Timeout;
  #sequence: number | null = null;
  #sessionId?: string;
  #resumeUrl?: string;
  #acked = true;
  #attempt = 0;
  #closed = false;

  constructor(private readonly options: GatewayOptions) {}

  async connect(): Promise<void> {
    this.#closed = false;
    while (!this.#closed) {
      const url = this.#resumeUrl ?? "wss://gateway.discord.gg";
      try {
        await this.#session(`${url}/?v=10&encoding=json`);
      } catch (error) {
        if (error instanceof FatalGatewayError) throw error;
        console.error(`[gateway] ${(error as Error).message}`);
      }
      if (this.#closed) break;
      const delay = Math.min(60_000, 1_000 * 2 ** this.#attempt++) * (0.8 + Math.random() * 0.4);
      console.log(`[gateway] reconnecting in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }

  close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
    this.#socket?.close(1000);
  }

  #session(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.#socket = socket;

      socket.addEventListener("message", (event) => {
        let payload: Payload;
        try {
          payload = JSON.parse(String(event.data)) as Payload;
        } catch {
          return;
        }
        if (typeof payload.s === "number") this.#sequence = payload.s;
        void this.#handle(payload, socket);
      });

      socket.addEventListener("close", (event) => {
        this.#stopHeartbeat();
        if (FATAL_CLOSE_CODES.has(event.code)) {
          reject(new FatalGatewayError(event.code, event.reason));
          return;
        }
        // 4007/4009 invalidate the session; anything else may be resumable.
        if (event.code === 4007 || event.code === 4009) {
          this.#sessionId = undefined;
          this.#resumeUrl = undefined;
        }
        resolve();
      });

      socket.addEventListener("error", () => {
        // `close` always follows `error`; resolution happens there.
      });
    });
  }

  async #handle(payload: Payload, socket: WebSocket): Promise<void> {
    switch (payload.op) {
      case OP.hello: {
        const interval = (payload.d as { heartbeat_interval?: number }).heartbeat_interval ?? 41_250;
        this.#startHeartbeat(socket, interval);
        if (this.#sessionId) {
          this.#send(socket, {
            op: OP.resume,
            d: { token: botToken(), session_id: this.#sessionId, seq: this.#sequence },
          });
        } else {
          this.#send(socket, {
            op: OP.identify,
            d: {
              token: botToken(),
              intents: this.options.intents ?? 0,
              properties: { os: process.platform, browser: "model-watcher", device: "model-watcher" },
            },
          });
        }
        return;
      }
      case OP.heartbeat:
        this.#send(socket, { op: OP.heartbeat, d: this.#sequence });
        return;
      case OP.heartbeatAck:
        this.#acked = true;
        return;
      case OP.reconnect:
        socket.close(4000);
        return;
      case OP.invalidSession:
        this.#sessionId = undefined;
        this.#resumeUrl = undefined;
        socket.close(4000);
        return;
      case OP.dispatch: {
        if (payload.t === "READY") {
          const ready = payload.d as { session_id?: string; resume_gateway_url?: string; user?: { username?: string } };
          this.#sessionId = ready.session_id;
          this.#resumeUrl = ready.resume_gateway_url;
          this.#attempt = 0;
          console.log(`[gateway] ready as ${ready.user?.username ?? "bot"}`);
          return;
        }
        if (payload.t === "RESUMED") {
          this.#attempt = 0;
          console.log("[gateway] resumed");
          return;
        }
        if (payload.t) await this.options.onDispatch(payload.t, payload.d);
        return;
      }
      default:
        return;
    }
  }

  #startHeartbeat(socket: WebSocket, interval: number): void {
    this.#stopHeartbeat();
    this.#acked = true;
    const beat = () => {
      if (!this.#acked) {
        // A missed acknowledgement means a zombie connection: force a resume.
        socket.close(4000);
        return;
      }
      this.#acked = false;
      this.#send(socket, { op: OP.heartbeat, d: this.#sequence });
    };
    setTimeout(beat, interval * Math.random());
    this.#heartbeat = setInterval(beat, interval);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = undefined;
  }

  #send(socket: WebSocket, payload: Payload): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }
}

export class FatalGatewayError extends Error {
  constructor(readonly code: number, reason: string) {
    super(`gateway closed with unrecoverable code ${code}${reason ? `: ${reason}` : ""}`);
    this.name = "FatalGatewayError";
  }
}

function botToken(): string {
  const value = env("DISCORD_BOT_TOKEN");
  if (!value) throw new Error("DISCORD_BOT_TOKEN is not set");
  return value;
}
