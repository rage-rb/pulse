/**
 * Wire format shared with Pulse::Cable::Channel.
 */

// Server -> client. "update" carries a full page (SPA-style morph); the others are
// targeted operations produced by a component's stream methods.
export type ServerMessage =
  | { action: "update"; html: string; url?: string }
  | { action: "replace"; html: string | Array<string> }
  | { action: "append"; target: string; html: string }
  | { action: "prepend"; target: string; html: string }
  | { action: "remove"; id: string }
  | { action: "navigate"; url: string };

export interface FormSubmitOptions {
  method?: string;
  body?: string;
  contentType?: string;
  query?: string;
  hash?: string;
}

export interface EventData {
  form?: string;
  key?: string;
  payload?: string;
  value?: string | Array<string>;
  checked?: boolean;
}

// Client -> server. "navigate" asks the server to render a page into this connection;
// "event" dispatches a server-side event handler on a specific component.
export type ClientMessage =
  | ({ type: "navigate"; url: string } & FormSubmitOptions)
  | { type: "event"; id: string; event: string; data?: EventData };
