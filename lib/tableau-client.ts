/**
 * Tableau REST API Client
 *
 * Implements all Tableau API interactions using direct REST calls (no TSC dependency).
 * Handles auth, pagination, item resolution, and schedule updates.
 */

import { signIn, signOut, type TableauAuthCredentials } from "@/lib/tableau-auth";

interface PaginatedResponse<T> {
  pagination?: {
    pageNumber: string;
    pageSize: string;
    totalAvailable: string;
  };
  [key: string]: T | Record<string, unknown> | undefined;
}

interface TableauConfig {
  serverUrl: string;
  siteName: string;
  tokenName: string;
  tokenSecret: string;
  apiVersion?: string;
}

export class TableauClient {
  private config: TableauConfig;
  private credentials: TableauAuthCredentials | null = null;

  constructor(config: TableauConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion ?? "3.24",
    };
  }

  /**
   * Sign in to Tableau Server and cache credentials.
   */
  async signIn(): Promise<void> {
    this.credentials = await signIn(
      this.config.serverUrl,
      this.config.siteName,
      this.config.tokenName,
      this.config.tokenSecret,
      this.config.apiVersion!,
    );
  }

  /**
   * Sign out from Tableau Server.
   */
  async signOut(): Promise<void> {
    if (!this.credentials) return;
    await signOut(
      this.config.serverUrl,
      this.credentials.authToken,
      this.credentials.apiVersion,
    );
    this.credentials = null;
  }

  /**
   * Make a GET request to the Tableau REST API.
   */
  private async makeRequest<T>(
    endpoint: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    if (!this.credentials) {
      throw new Error("Not authenticated - call signIn() first");
    }

    const url = new URL(
      `${this.config.serverUrl}/api/${this.credentials.apiVersion}/sites/${this.credentials.siteId}/${endpoint}`,
    );

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Tableau-Auth": this.credentials.authToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Tableau API request failed (${response.status}): ${errorText}`,
      );
    }

    return response.json();
  }

  /**
   * Make a write request (PUT/POST/DELETE) to the Tableau REST API.
   */
  private async makeWriteRequest(
    endpoint: string,
    method: "PUT" | "POST" | "DELETE",
    xmlPayload?: string,
  ): Promise<{success: boolean; data?: unknown; error?: string; statusCode?: number}> {
    if (!this.credentials) {
      throw new Error("Not authenticated - call signIn() first");
    }

    const url = `${this.config.serverUrl}/api/${this.credentials.apiVersion}/sites/${this.credentials.siteId}/${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-Tableau-Auth": this.credentials.authToken,
          "Content-Type": "application/xml",
          Accept: "application/json",
        },
        body: xmlPayload,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: errorText,
          statusCode: response.status,
        };
      }

      // 204 No Content or empty body
      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return { success: true };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fetch all extract refresh tasks (paginated).
   */
  async getExtractRefreshTasks(): Promise<unknown[]> {
    const allTasks: unknown[] = [];
    let pageNumber = 1;
    const pageSize = 1000;

    while (true) {
      const response = await this.makeRequest<PaginatedResponse<unknown>>(
        "tasks/extractRefreshes",
        { pageSize, pageNumber },
      );

      let tasks = (response.tasks as Record<string, unknown>)?.task;
      if (!tasks) break;

      // Handle single task (not in array)
      if (!Array.isArray(tasks)) {
        tasks = [tasks];
      }

      allTasks.push(...(tasks as unknown[]));

      // Check pagination
      const pagination = response.pagination;
      if (!pagination) break;

      const total = parseInt(pagination.totalAvailable, 10);
      const fetched = pageNumber * pageSize;
      if (fetched >= total) break;

      pageNumber++;
    }

    return allTasks;
  }

  /**
   * Fetch job history for failed jobs (best-effort failure message resolution).
   */
  async getFailedJobs(days: number = 30): Promise<unknown[]> {
    const allJobs: unknown[] = [];
    let pageNumber = 1;
    const pageSize = 1000;

    // Calculate cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    while (true) {
      const response = await this.makeRequest<PaginatedResponse<unknown>>("jobs", {
        pageSize,
        pageNumber,
        filter: "jobType:eq:RefreshExtract",
      });

      let jobs = (response.jobs as Record<string, unknown>)?.job;
      if (!jobs) break;

      if (!Array.isArray(jobs)) {
        jobs = [jobs];
      }

      // Filter to failed jobs within time range
      const failedJobs = (jobs as Array<Record<string, unknown>>).filter((job) => {
        if (job.finishCode !== 1) return false; // 1 = failed
        const startedAt = job.startedAt || job.createdAt;
        return startedAt && String(startedAt) >= cutoffISO;
      });

      allJobs.push(...failedJobs);

      const pagination = response.pagination;
      if (!pagination) break;

      const total = parseInt(pagination.totalAvailable, 10);
      const fetched = pageNumber * pageSize;
      if (fetched >= total) break;

      pageNumber++;
    }

    return allJobs;
  }

  /**
   * Resolve workbook details by ID.
   */
  async getWorkbookDetails(workbookId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.makeRequest<{workbook: Record<string, unknown>}>(
        `workbooks/${workbookId}`,
      );
      return response.workbook ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve datasource details by ID.
   */
  async getDatasourceDetails(datasourceId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.makeRequest<{datasource: Record<string, unknown>}>(
        `datasources/${datasourceId}`,
      );
      return response.datasource ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve item details (name, URL, project) for all tasks.
   * Returns tasks with `resolved_item` field injected.
   */
  async resolveItemDetails(tasks: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const extractRefresh = task.extractRefresh as Record<string, unknown> | undefined;
        if (!extractRefresh) return task;

        const workbook = extractRefresh.workbook as Record<string, unknown> | undefined;
        const datasource = extractRefresh.datasource as Record<string, unknown> | undefined;

        const itemId = (workbook?.id ?? datasource?.id) as string | undefined;
        const itemType = workbook?.id ? "workbook" : "datasource";

        if (!itemId) return task;

        const details =
          itemType === "workbook"
            ? await this.getWorkbookDetails(itemId)
            : await this.getDatasourceDetails(itemId);

        const resolved = {
          name: details?.name ?? `ID: ${itemId.slice(0, 8)}...`,
          url: (details?.webpageUrl as string) || this.buildItemUrl(itemType, itemId),
          project: (details?.project as Record<string, unknown>)?.name ?? "",
        };

        return { ...task, resolved_item: resolved };
      }),
    );

    return enriched;
  }

  /**
   * Resolve failure messages from job history and attach to tasks.
   * Uses best-effort mapping: task ID if available, otherwise by target item ID.
   */
  async resolveFailureMessages(
    tasks: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const jobs = await this.getFailedJobs(30);

    // Build job map by task ID (authoritative) and target ID (fallback)
    const jobsByTaskId = new Map<string, Record<string, unknown>>();
    const jobsByTargetId = new Map<string, Record<string, unknown>>();

    for (const job of jobs as Array<Record<string, unknown>>) {
      const extractRefresh = job.extractRefresh as Record<string, unknown> | undefined;
      const taskId = extractRefresh?.id as string | undefined;
      const workbookId = (extractRefresh?.workbook as Record<string, unknown>)?.id as string | undefined;
      const datasourceId = (extractRefresh?.datasource as Record<string, unknown>)?.id as string | undefined;
      const targetId = workbookId ?? datasourceId;

      // Map by task ID if available
      if (taskId) {
        jobsByTaskId.set(taskId, job);
      }

      // Map by target ID (latest failed job per target)
      if (targetId) {
        const existing = jobsByTargetId.get(targetId);
        const jobTime = this.getJobTimestamp(job);
        const existingTime = existing ? this.getJobTimestamp(existing) : "";

        if (!existing || jobTime > existingTime) {
          jobsByTargetId.set(targetId, job);
        }
      }
    }

    // Attach failure messages to tasks
    return tasks.map((task) => {
      const extractRefresh = task.extractRefresh as Record<string, unknown> | undefined;
      if (!extractRefresh) return task;

      const taskId = extractRefresh.id as string | undefined;
      const workbookId = (extractRefresh.workbook as Record<string, unknown>)?.id as string | undefined;
      const datasourceId = (extractRefresh.datasource as Record<string, unknown>)?.id as string | undefined;
      const targetId = workbookId ?? datasourceId;

      // Prefer task ID match, fallback to target ID
      const matchedJob = (taskId && jobsByTaskId.get(taskId)) || (targetId && jobsByTargetId.get(targetId));

      const failureMessage = matchedJob
        ? this.extractFailureMessage(matchedJob)
        : null;

      return {
        ...task,
        extractRefresh: {
          ...extractRefresh,
          lastFailureMessage: failureMessage,
        },
      };
    });
  }

  private getJobTimestamp(job: Record<string, unknown>): string {
    return (job.completedAt ?? job.startedAt ?? job.createdAt ?? "") as string;
  }

  private extractFailureMessage(job: Record<string, unknown>): string | null {
    // Tableau job notes/status fields
    return (job.notes ?? job.statusNotes ?? null) as string | null;
  }

  /**
   * Build a URL to view a workbook or datasource in Tableau Cloud.
   */
  private buildItemUrl(type: "workbook" | "datasource", itemId: string): string {
    const sitePath = this.config.siteName ? `/site/${this.config.siteName}` : "";
    if (type === "workbook") {
      return `${this.config.serverUrl}/#${sitePath}/workbooks/${itemId}`;
    }
    return `${this.config.serverUrl}/#${sitePath}/datasources/${itemId}`;
  }

  /**
   * Update a single extract refresh task's schedule.
   */
  async updateExtractRefreshTask(
    taskId: string,
    xmlPayload: string,
  ): Promise<{ success: boolean; message?: string; error?: string; statusCode?: number }> {
    const result = await this.makeWriteRequest(
      `tasks/extractRefreshes/${taskId}`,
      "POST",
      xmlPayload,
    );

    if (result.success) {
      return { success: true, message: `Task ${taskId} updated successfully` };
    }

    return {
      success: false,
      error: result.error,
      statusCode: result.statusCode,
    };
  }

  /**
   * Batch update multiple extract refresh tasks.
   * Retries 429/5xx with backoff (1s, 2s, 4s; max 3 retries).
   * Applies updates sequentially with 150ms pacing to reduce burst throttling.
   */
  async batchUpdateTasks(
    changes: Array<{ taskId: string; xmlPayload: string }>,
  ): Promise<
    Array<{
      taskId: string;
      success: boolean;
      message?: string;
      error?: string;
      statusCode?: number;
    }>
  > {
    const results: Array<{
      taskId: string;
      success: boolean;
      message?: string;
      error?: string;
      statusCode?: number;
    }> = [];

    for (const change of changes) {
      const result = await this.updateWithRetry(change.taskId, change.xmlPayload);
      results.push(result);

      // Pace requests to avoid burst throttling
      if (changes.indexOf(change) < changes.length - 1) {
        await this.sleep(150);
      }
    }

    return results;
  }

  /**
   * Update a task with retry logic for 429/5xx.
   */
  private async updateWithRetry(
    taskId: string,
    xmlPayload: string,
    attempt: number = 1,
  ): Promise<{
    taskId: string;
    success: boolean;
    message?: string;
    error?: string;
    statusCode?: number;
  }> {
    const result = await this.updateExtractRefreshTask(taskId, xmlPayload);

    // Success or non-retryable error
    if (
      result.success ||
      !result.statusCode ||
      (result.statusCode !== 429 && result.statusCode < 500)
    ) {
      return { taskId, ...result };
    }

    // Max retries exceeded
    if (attempt >= 3) {
      return { taskId, ...result };
    }

    // Backoff: 1s, 2s, 4s
    const backoffMs = Math.pow(2, attempt - 1) * 1000;
    await this.sleep(backoffMs);

    return this.updateWithRetry(taskId, xmlPayload, attempt + 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a TableauClient instance from environment variables.
 */
export function createTableauClient(): TableauClient {
  const serverUrl = process.env.TABLEAU_SERVER_URL;
  const siteName = process.env.TABLEAU_SITE_NAME;
  const tokenName = process.env.TABLEAU_TOKEN_NAME;
  const tokenSecret = process.env.TABLEAU_TOKEN_SECRET;
  const apiVersion = process.env.TABLEAU_API_VERSION;

  if (!serverUrl || siteName === undefined || !tokenName || !tokenSecret) {
    throw new Error(
      "Missing required Tableau environment variables (TABLEAU_SERVER_URL, TABLEAU_SITE_NAME, TABLEAU_TOKEN_NAME, TABLEAU_TOKEN_SECRET)",
    );
  }

  return new TableauClient({
    serverUrl,
    siteName,
    tokenName,
    tokenSecret,
    apiVersion,
  });
}
