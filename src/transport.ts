import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
  const { port = 3000, useSSE = false, serverFactory } = options;

  if (useSSE) {
    // Create an object to store active SSE transports by session ID
    const transports: { [sessionId: string]: SSEServerTransport } = {};

    // Create raw HTTP server
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        else if (req.method === 'GET' && pathname === '/sse') {
          // Determine which server instance to use for this connection
          let sessionServer: Server;
          if (serverFactory) {
            // OAuth mode: extract Bearer token from Authorization header
            const authHeader = req.headers['authorization'] || '';
            const match = authHeader.match(/^Bearer\s+(.+)$/i);
            if (!match) {
              res.writeHead(401, { 'Content-Type': 'text/plain' });
              res.end('Unauthorized: missing or invalid Authorization: Bearer <token> header');
              return;
            }
            sessionServer = serverFactory(match[1].trim());
          } else {
            // PAT mode: reuse the single pre-built server
            sessionServer = server!;
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
          const sessionId = query.sessionId as string;
          const transport = transports[sessionId];
          
          if (!transport) {
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