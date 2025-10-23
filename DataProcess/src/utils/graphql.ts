export type GraphQLRequestOptions = {
  endpoint?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type GraphQLError = {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
};

export type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

/**
 * Perform a GraphQL POST request against the SubQuery GraphQL endpoint.
 * Defaults to local docker "http://localhost:3000" unless SUBQUERY_URL is set.
 */
export async function graphqlRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  options?: GraphQLRequestOptions,
): Promise<T> {
  const g: any = globalThis as any;
  const endpoint =
    options?.endpoint || g?.process?.env?.SUBQUERY_URL || 'http://localhost:3000';

  const controller = g?.AbortController ? new g.AbortController() : undefined;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const timeoutId = g?.setTimeout ? g.setTimeout(() => controller?.abort?.(), timeoutMs) : undefined;

  try {
    if (!g?.fetch) {
      throw new Error('globalThis.fetch not found. Use Node 18+ or provide a fetch polyfill.');
    }

    //console.log(JSON.stringify({ query, variables }, null, 2));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify({ query, variables }),
      ...(controller ? { signal: controller.signal } : {}),
    });


    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GraphQL HTTP ${res.status}: ${text || res.statusText}`);
    }

    const payload = (await res.json()) as GraphQLResponse<T>;
    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors.map((e) => e.message).join('; ');
      throw new Error(`GraphQL error: ${message}`);
    }

    if (payload.data === undefined) {
      throw new Error('GraphQL response has no data');
    }

    //console.log(JSON.stringify(payload.data, null, 2));

    return payload.data;
  } finally {
    if (timeoutId && g?.clearTimeout) g.clearTimeout(timeoutId);
  }
}

/**
 * Convenience function tailored for SubQuery calls.
 */
export async function querySubquery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  opts?: GraphQLRequestOptions,
): Promise<T> {
  return graphqlRequest<T>(query, variables, opts);
}




// {
//   "query": "query  ($block: String!) { swapAquariusEntities(filter: { block: { equalTo: $block } }, first: 5) { nodes { id contract token0 token1 orderToken orderAmount amount0 amount1 reserveBefore0 reserveBefore1 reserveAfter0 reserveAfter1 sender block timestamp } } }",
//     "variables": {
//     "block": "313792"
//   }
// }