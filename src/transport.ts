import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";

/**
 * Transport configuration options
 */
export interface TransportOptions {
  /**
   * Port to use for SSE transport (default: 3000)
   */
  port?: number;

  /**
   * Whether to use SSE transport (default: false, uses stdio)
   */
  useSSE?: boolean;

  /**
   * Whether to enable Streamable HTTP transport on /mcp (default: false).
   * Can be enabled together with legacy SSE transport.
   */
  useStreamableHttp?: boolean;

  /**
   * Optional factory function used in OAuth mode.
   * When provided, a new MCP Server is created per SSE connection
   * using the Bearer token extracted from the Authorization header.
   * If absent, the `server` argument is used directly (PAT mode).
   */
  serverFactory?: (token: string) => Server;
}

/**
 * Sets up the appropriate transport for the server based on the options
 *
 * @param server - The MCP server instance (PAT mode). Pass null when using serverFactory.
 * @param options - Transport configuration options
 * @returns A promise that resolves when the transport is set up
 */
export async function setupTransport(
  server: Server | null,
  options: TransportOptions = {}
): Promise<void> {
  const { port = 3000, useSSE = false, useStreamableHttp = false, serverFactory } = options;

  const getSessionServer = (req: IncomingMessage): Server | null => {
    if (!serverFactory) {
      // PAT mode: reuse the single pre-built server.
      return server;
    }

    // OAuth mode: extract Bearer token from Authorization header.
    const authHeader = req.headers["authorization"] || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return null;
    }
    return serverFactory(match[1].trim());
  };

  if (useSSE || useStreamableHttp) {
    // Store active transports by session ID for both legacy SSE and Streamable HTTP.
    const transports: {
      [sessionId: string]: SSEServerTransport | StreamableHTTPServerTransport;
    } = {};

    // Create raw HTTP server
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const { pathname, query } = parse(req.url || '', true);

      try {
        if (req.method === 'GET' && pathname === '/healthz') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        }
        else if (useStreamableHttp && pathname === '/mcp' && (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE')) {
          const sessionIdHeader = req.headers['mcp-session-id'];
          const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

          let transport: StreamableHTTPServerTransport | null = null;
          if (sessionId) {
            const existingTransport = transports[sessionId];
            if (existingTransport instanceof StreamableHTTPServerTransport) {
              transport = existingTransport;
            } else if (existingTransport) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Bad Request: Session exists but uses a different transport protocol'
                },
                id: null
              }));
              return;
            }
          }

          if (!transport && req.method === 'POST') {
            const sessionServer = getSessionServer(req);
            if (!sessionServer) {
              res.writeHead(401, { 'Content-Type': 'text/plain' });
              res.end('Unauthorized: missing or invalid Authorization: Bearer <token> header');
              return;
            }

            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (newSessionId: string) => {
                transports[newSessionId] = transport!;
              }
            });

            transport.onclose = () => {
              const sid = transport!.sessionId;
              if (sid) {
                delete transports[sid];
              }
            };

            await sessionServer.connect(transport);
          }

          if (!transport) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided'
              },
              id: null
            }));
            return;
          }

          await transport.handleRequest(req, res);
        }
        else if (req.method === 'GET' && pathname === '/sse') {
          if (!useSSE) {
            res.writeHead(404);
            res.end();
            return;
          }

          // Determine which server instance to use for this connection
          const sessionServer = getSessionServer(req);
          if (!sessionServer) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized: missing or invalid Authorization: Bearer <token> header');
            return;
          }

          // Create a new SSE transport
          const transport = new SSEServerTransport("/messages", res);
          
          // Store the transport by session ID
          transports[transport.sessionId] = transport;
          
          // Set up cleanup handler
          req.on("close", () => {
            delete transports[transport.sessionId];
          });

          // Connect the server to the transport
          await sessionServer.connect(transport);
        }
        else if (req.method === 'POST' && pathname === '/messages') {
          if (!useSSE) {
            res.writeHead(404);
            res.end();
            return;
          }

          const sessionId = query.sessionId as string;
          const transport = transports[sessionId];

          if (!(transport instanceof SSEServerTransport)) {
            res.writeHead(400);
            res.end('No transport found for sessionId');
            return;
          }

          // Pass the raw Node.js request to the transport
          await transport.handlePostMessage(req, res);
        }
        else {
          res.writeHead(404);
          res.end();
        }
      } catch (error) {
        console.error('Server error:', error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal server error');
        }
      }
    });

    // Start the server
    httpServer.listen(port, () => {
      console.error(`SSE server listening on port ${port}`);
    });
  } else {
    // Set up stdio transport (PAT mode only — server is always provided)
    const transport = new StdioServerTransport();
    await server!.connect(transport);
  }
}