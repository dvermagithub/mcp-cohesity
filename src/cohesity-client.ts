/**
 * Cohesity REST API client supporting V1 and V2 endpoints
 * with automatic bearer token authentication and retry on expiry.
 */

export interface CohesityConfig {
  cluster: string;
  username: string;
  password: string;
  domain: string;
  allowSelfSigned: boolean;
}

interface AuthResponse {
  accessToken?: string;
  token?: string;
}

export class CohesityClient {
  private readonly v2Base: string;
  private readonly v1Base: string;
  private readonly cfg: CohesityConfig;
  private bearer: string | null = null;

  constructor(cfg: CohesityConfig) {
    this.cfg = cfg;
    this.v2Base = `https://${cfg.cluster}/v2`;
    this.v1Base = `https://${cfg.cluster}/irisservices/api/v1/public`;
    if (cfg.allowSelfSigned) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  /** Obtain a bearer token from the V2 access-tokens endpoint. */
  async authenticate(): Promise<void> {
    const resp = await fetch(`${this.v2Base}/access-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.cfg.username,
        password: this.cfg.password,
        domain: this.cfg.domain,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Authentication failed (${resp.status}): ${await resp.text()}`);
    }
    const data = (await resp.json()) as AuthResponse;
    const tok = data.accessToken ?? data.token;
    if (!tok) throw new Error("No access token in authentication response");
    this.bearer = tok;
  }

  /** Return current token, authenticating first if needed. */
  private async token(): Promise<string> {
    if (!this.bearer) await this.authenticate();
    return this.bearer!;
  }

  /** Build headers for an authenticated request. */
  private authHeaders(tok: string): Record<string, string> {
    return {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /** Parse a fetch Response into JSON, text, or null (for 204). */
  private async parseResponse(resp: Response): Promise<unknown> {
    if (resp.status === 204) return null;
    const ct = resp.headers.get("content-type") ?? "";
    return ct.includes("application/json") ? resp.json() : resp.text();
  }

  /**
   * Core HTTP method. Builds URL with query params, attaches auth,
   * and retries once on 401 (token expiry).
   */
  private async http(
    method: string,
    url: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<unknown> {
    const target = new URL(url);
    if (params) {
      for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    }

    const buildOpts = (tok: string): RequestInit => {
      const opts: RequestInit = { method, headers: this.authHeaders(tok) };
      if (body && ["POST", "PUT", "PATCH"].includes(method)) {
        opts.body = JSON.stringify(body);
      }
      return opts;
    };

    let tok = await this.token();
    let resp = await fetch(target.toString(), buildOpts(tok));

    // Retry once on 401 — token may have expired
    if (resp.status === 401) {
      this.bearer = null;
      tok = await this.token();
      resp = await fetch(target.toString(), buildOpts(tok));
    }

    if (!resp.ok) {
      throw new Error(`Cohesity API ${method} ${target.pathname} failed (${resp.status}): ${await resp.text()}`);
    }
    return this.parseResponse(resp);
  }

  // ── V2 convenience methods ──────────────────────────────────────────

  getV2(path: string, params?: Record<string, string>) {
    return this.http("GET", `${this.v2Base}/${path}`, undefined, params);
  }

  postV2(path: string, body?: unknown, params?: Record<string, string>) {
    return this.http("POST", `${this.v2Base}/${path}`, body, params);
  }

  putV2(path: string, body?: unknown) {
    return this.http("PUT", `${this.v2Base}/${path}`, body);
  }

  patchV2(path: string, body?: unknown) {
    return this.http("PATCH", `${this.v2Base}/${path}`, body);
  }

  deleteV2(path: string) {
    return this.http("DELETE", `${this.v2Base}/${path}`);
  }

  // ── V1 convenience methods ──────────────────────────────────────────

  getV1(path: string, params?: Record<string, string>) {
    return this.http("GET", `${this.v1Base}/${path}`, undefined, params);
  }

  postV1(path: string, body?: unknown) {
    return this.http("POST", `${this.v1Base}/${path}`, body);
  }

  putV1(path: string, body?: unknown) {
    return this.http("PUT", `${this.v1Base}/${path}`, body);
  }

  // ── Source refresh ──────────────────────────────────────────────────

  /**
   * Refresh every registered protection source in parallel.
   * Called automatically before CRUD operations to ensure current inventory.
   */
  async refreshAllSources(): Promise<{ refreshed: number; sourceIds: number[] }> {
    const data = (await this.getV2("data-protect/sources/registrations")) as {
      registrations?: Array<{ id: number }>;
    };
    const ids = (data.registrations ?? []).map((r) => r.id).filter(Boolean);
    await Promise.allSettled(
      ids.map((id) => this.postV2(`data-protect/sources/${id}/refresh`, {})),
    );
    return { refreshed: ids.length, sourceIds: ids };
  }
}
