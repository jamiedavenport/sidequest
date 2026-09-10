import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Schema } from "effect";
import {
  isWriteTool,
  isToolName,
  toolNames,
  toolInputs,
  ToolResult,
  ToolOutput,
  type ToolName,
  type ToolReply,
} from "~/mcp/schema";

const descriptions: Record<ToolName, string> = {
  list_lanes:
    "List Today, Inbox, and custom lanes in application order. Optional case-insensitive title search.",
  list_tasks:
    "List synchronized tasks, active by default. parentId null selects roots. Today is date-based; UTC is the default timezone. Offline pending edits are not visible.",
  search_tasks:
    "Case-insensitive title search with view, parent, and completion filters. Defaults to active tasks and UTC.",
  get_task: "Get task state, attachment metadata, and ancestors, including completed tasks.",
  create_task:
    "Create a task in Inbox by default. Dates use YYYY-MM-DD. Today assigns today's date; parent placement is inherited. Requires a unique idempotencyKey.",
  update_task:
    "Patch title or date. Omitted values are preserved; null clears date. Changing title refreshes title-derived links and preserves manual attachments. Completed tasks cannot be edited. Requires idempotencyKey.",
  move_task:
    "Move an active task and active descendants. Append to a view or place before, after, or nest under a task. Inbox clears dates; Today assigns today's full date; custom lanes preserve dates. Nesting inherits parent placement. Requires idempotencyKey.",
  complete_task:
    "Complete a task and its current descendants. Repeated completion succeeds without changes. Notes and whiteboards are retained but hidden by normal completed-task views. Requires idempotencyKey. Individual write approval is the MCP client's responsibility.",
};

function jsonSchema(schema: Schema.Constraint): Tool["inputSchema"] {
  const document = Schema.toJsonSchemaDocument(schema);
  return {
    ...document.schema,
    ...(Object.keys(document.definitions).length ? { $defs: document.definitions } : {}),
    type: "object",
  };
}

export function toolDefinitions(canWrite: boolean): Tool[] {
  return toolNames
    .filter((name) => canWrite || !isWriteTool(name))
    .map((name) => ({
      name,
      description: descriptions[name],
      inputSchema: jsonSchema(toolInputs[name]),
      outputSchema: jsonSchema(ToolOutput),
      annotations: {
        readOnlyHint: !isWriteTool(name),
        destructiveHint: isWriteTool(name),
        idempotentHint: true,
        openWorldHint: false,
      },
    }));
}

export async function serveMcp(
  request: Request,
  canWrite: boolean,
  call: (name: ToolName, args: unknown) => Promise<ToolReply>,
): Promise<Response> {
  const server = new Server(
    { name: "sidequest", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: toolDefinitions(canWrite) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (!isToolName(params.name)) {
      return { isError: true, content: [{ type: "text", text: "Unknown tool." }] };
    }
    const name = params.name;
    if (isWriteTool(name) && !canWrite) {
      return {
        isError: true,
        content: [
          { type: "text", text: "insufficient_scope: sidequest:read sidequest:write required" },
        ],
      };
    }
    const reply = await call(name, params.arguments ?? {});
    if (!reply.ok) {
      return {
        isError: true,
        structuredContent: { error: reply.error },
        content: [{ type: "text", text: `${reply.error.code}: ${reply.error.message}` }],
      };
    }
    const structuredContent = Schema.decodeUnknownSync(Schema.JsonObject)(
      JSON.parse(JSON.stringify(Schema.decodeUnknownSync(ToolResult)(reply.result))),
    );
    const count = reply.result.tasks?.length ?? reply.result.lanes?.length;
    const summary = reply.result.operationId
      ? `Operation ${reply.result.operationId}: ${reply.result.affectedTaskIds?.length ?? 0} task(s) affected${reply.replay ? " (replayed)" : ""}.`
      : count !== undefined
        ? `${count} result(s)${reply.result.nextCursor ? "; more available" : ""}.`
        : "Task and ancestor context retrieved.";
    return {
      structuredContent,
      content: [{ type: "text", text: `${summary}\n${JSON.stringify(structuredContent)}` }],
    };
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
