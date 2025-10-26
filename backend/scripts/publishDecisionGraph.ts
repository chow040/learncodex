import type { Graph } from '@langchain/core/runnables/graph';

import { getDecisionGraph } from '../src/taEngine/langgraph/decisionWorkflow.js';

const GRAPH_NAME = 'trading-agents';

type ExportableGraph = Graph & {
  toJSON?: () => unknown;
  drawMermaid?: (params?: { wrapLabelNWords?: number }) => string;
};

async function main(): Promise<void> {
  const graph = getDecisionGraph() as ExportableGraph;

  let drawable: ExportableGraph | null = null;

  if (typeof (graph as unknown as { getGraphAsync?: () => Promise<Graph> }).getGraphAsync === 'function') {
    drawable = ((await (graph as unknown as { getGraphAsync: () => Promise<Graph> }).getGraphAsync())) as ExportableGraph;
  } else if (typeof (graph as unknown as { getGraph?: () => Graph }).getGraph === 'function') {
    drawable = ((graph as unknown as { getGraph: () => Graph }).getGraph()) as ExportableGraph;
  } else {
    drawable = graph;
  }

  if (typeof graph.drawMermaid === 'function') {
    const mermaid = graph.drawMermaid({ wrapLabelNWords: 6 });
    console.log('Mermaid representation:\n');
    console.log(mermaid);
    console.log('\nUpload this diagram or the JSON payload below into LangGraph Studio.');
  } else if (drawable && typeof drawable.drawMermaid === 'function') {
    const mermaid = drawable.drawMermaid({ wrapLabelNWords: 6 });
    console.log('Mermaid representation:\n');
    console.log(mermaid);
    console.log('\nUpload this diagram or the JSON payload below into LangGraph Studio.');
  }

  const target = drawable ?? graph;

  if (target && typeof target.toJSON === 'function') {
    const serialized = target.toJSON();
    console.log('\nSerialized graph payload:\n');
    console.log(JSON.stringify(serialized, null, 2));
  } else {
    console.warn('The compiled graph does not expose a toJSON() helper; only Mermaid text was emitted.');
  }

  console.log(
    `\nReminder: current @langchain/langgraph-sdk (0.1.x) does not expose a programmatic deploy endpoint.`,
  );
  console.log(
    `Use LangGraph Studio UI or the LangGraph Cloud tooling to create an assistant named "${GRAPH_NAME}" and paste the payload above.`,
  );
}

main().catch((error) => {
  console.error('Unable to export LangGraph workflow snapshot:', error);
  process.exitCode = 1;
});
